from datetime import date

import pytest
from fastapi.testclient import TestClient

from app import kpis
from app.main import app
from etl import store

client = TestClient(app)


@pytest.fixture
def db(tmp_path, monkeypatch):
    path = tmp_path / "t.db"
    monkeypatch.setenv("DASHBOARD_DB", str(path))
    conn = store.connect(path)
    store.save_observations(conn, "hicp_inflation", "eurostat", [
        {"country": "DEU", "period": "2026-08", "value": 2.9},
        {"country": "DEU", "period": "2026-09", "value": 3.3},
    ])
    store.save_observations(conn, "industrial_production", "eurostat", [
        {"country": "DEU", "period": f"2025-{m:02d}", "value": 100.0} for m in range(1, 13)
    ] + [{"country": "DEU", "period": "2026-01", "value": 95.0}])
    return conn


def _tile(conn, label_start):
    return next(t for t in kpis.compute(conn, "germany", date(2026, 10, 10)) if t["label"].startswith(label_start))


def test_rising_inflation_is_bad(db):
    t = _tile(db, "Inflation")
    assert t["value"] == "3.3%"
    assert t["delta"] == {"text": "+0.4 pp", "direction": "up", "tone": "bad", "since": "2026-08"}


def test_percent_change_over_twelve_months(db):
    t = _tile(db, "Industrial production")
    assert t["delta"]["text"] == "−5.0%" and t["delta"]["since"] == "2025-01"
    assert t["delta"]["tone"] == "bad"


def test_missing_data_gives_empty_tile(db):
    assert _tile(db, "Unemployment")["empty"]


def test_forecast_label_uses_current_year(db):
    assert _tile(db, "GDP growth")["label"] == "GDP growth, 2026 forecast"


def test_pages_render(db):
    for path in ("/", "/germany", "/europe", "/world"):
        r = client.get(path)
        assert r.status_code == 200
        assert "Economic Dashboard" in r.text
    assert "3.3%" in client.get("/germany").text
    assert client.get("/nowhere").status_code == 404


def test_chart_pages_load_their_scripts(db):
    assert "js/pages/world.js" in client.get("/world").text
    assert "js/pages/europe.js" in client.get("/europe").text
    assert "js/pages/germany.js" in client.get("/germany").text
    assert "js/pages/europe.js" not in client.get("/germany").text


def test_about_lists_sources_and_catalogue(db):
    r = client.get("/about")
    assert r.status_code == 200
    assert "World Bank" in r.text and "Real GDP growth" in r.text


def test_missing_database_shows_readable_error(tmp_path, monkeypatch):
    monkeypatch.setenv("DASHBOARD_DB", str(tmp_path / "missing.db"))
    r = client.get("/germany")
    assert r.status_code == 503 and "etl.run" in r.text
    assert client.get("/api/indicators").json() == {"detail": "No data yet - run `python -m etl.run`"}


def test_unknown_page_shows_html_404(db):
    r = client.get("/nowhere")
    assert r.status_code == 404 and "does not exist" in r.text
    assert client.get("/api/indicator/nope").json()["detail"].startswith("Unknown")


def test_tiles_carry_what_the_history_dialog_needs(db):
    tile = _tile(db, "Inflation")
    assert (tile["indicator"], tile["country"], tile["fmt"], tile["unit"]) == ("hicp_inflation", "DEU", "pct", "% yoy")
    assert tile["forecast_from"] is None
    assert _tile(db, "GDP growth")["forecast_from"] == 2026  # IMF series continue with projections
    html = client.get("/germany").text
    assert 'data-indicator="hicp_inflation"' in html and 'id="tile-dialog"' in html
