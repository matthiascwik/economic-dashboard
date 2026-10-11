import pytest
from fastapi.testclient import TestClient

from app.main import app
from etl import quality, store

client = TestClient(app)


@pytest.fixture
def db(tmp_path, monkeypatch):
    path = tmp_path / "t.db"
    monkeypatch.setenv("DASHBOARD_DB", str(path))
    conn = store.connect(path)
    store.save_countries(conn, "imf", [
        {"code": "DEU", "name": "Germany", "is_aggregate": False},
        {"code": "EU", "name": "European Union", "is_aggregate": True},
    ])
    store.save_observations(conn, "gdp_growth_forecast", "imf", [
        {"country": "DEU", "period": "2023", "value": -0.9},
        {"country": "DEU", "period": "2024", "value": -0.5},
        {"country": "EU", "period": "2024", "value": 1.0},
    ])
    for s, v in (("C", 104.0), ("J", 140.9)):
        store.save_observations(conn, f"gva_volume_index:{s}", "eurostat", [{"country": "DEU", "period": "2024", "value": v}])
    store.save_series_labels(conn, "de_gva_quarterly", {"C": "Industry"})
    return conn


def test_indicator_filters_by_country_and_period(db):
    r = client.get("/api/indicator/gdp_growth_forecast?countries=DEU&start=2024").json()
    assert r["unit"] == "% yoy"
    assert r["series"] == [{"country": "DEU", "series": None, "label": None, "points": [{"period": "2024", "value": -0.5}]}]


def test_year_end_bound_includes_months(db):
    store.save_observations(db, "inflation", "worldbank", [{"country": "DEU", "period": "2024", "value": 2.0}])
    assert client.get("/api/indicator/inflation?end=2024").status_code == 200
    assert client.get("/api/indicator/inflation?end=2023").status_code == 404


def test_sector_series_selection(db):
    r = client.get("/api/indicator/gva_volume_index?series=J").json()
    assert [(s["series"], s["points"][0]["value"]) for s in r["series"]] == [("J", 140.9)]


def test_unknown_indicator_is_404(db):
    assert client.get("/api/indicator/nope").status_code == 404


def test_no_database_is_503(tmp_path, monkeypatch):
    monkeypatch.setenv("DASHBOARD_DB", str(tmp_path / "missing.db"))
    assert client.get("/api/indicators").status_code == 503


def test_countries_aggregate_filter(db):
    assert [c["code"] for c in client.get("/api/countries?aggregates=true").json()] == ["EU"]


def test_indicators_report_coverage(db):
    row = next(i for i in client.get("/api/indicators").json() if i["id"] == "gdp_growth_forecast")
    assert (row["first_period"], row["last_period"], row["countries"]) == ("2023", "2024", 2)


def test_quality_flags_missing_stale_and_out_of_range(db):
    store.save_observations(db, "unemployment", "worldbank", [{"country": "DEU", "period": "2015", "value": 120.0}])
    issues = quality.check(db)
    assert "gdp_growth: no data" in issues
    assert any(i.startswith("unemployment: stale") for i in issues)
    assert any(i.startswith("unemployment: values") for i in issues)
