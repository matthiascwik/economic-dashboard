from etl import imf, store, worldbank


def test_worldbank_indicator_skips_nulls(monkeypatch):
    meta = {"pages": 1}
    rows = [
        {"countryiso3code": "DEU", "date": "2020", "value": -3.7},
        {"countryiso3code": "DEU", "date": "2021", "value": None},
        {"countryiso3code": "", "date": "2020", "value": 1.0},
    ]
    monkeypatch.setattr(worldbank, "get_json", lambda *a, **k: [meta, rows])
    assert worldbank.fetch_indicator("X", 2010, 2024) == [
        {"country": "DEU", "period": "2020", "value": -3.7}
    ]


def test_worldbank_pagination(monkeypatch):
    calls = []

    def fake(url, params):
        calls.append(params["page"])
        return [{"pages": 2}, [{"countryiso3code": "DEU", "date": str(2000 + params["page"]), "value": 1}]]

    monkeypatch.setattr(worldbank, "get_json", fake)
    assert len(worldbank.fetch_indicator("X", 2000, 2010)) == 2
    assert calls == [1, 2]


def test_worldbank_countries_flag_aggregates(monkeypatch):
    rows = [
        {"id": "DEU", "name": "Germany", "region": {"id": "ECS"}},
        {"id": "WLD", "name": "World", "region": {"id": "NA"}},
    ]
    monkeypatch.setattr(worldbank, "get_json", lambda *a, **k: [{"pages": 1}, rows])
    assert [c["is_aggregate"] for c in worldbank.fetch_countries()] == [False, True]


def test_imf_filters_years_and_nulls(monkeypatch):
    payload = {"values": {"NGDP_RPCH": {"DEU": {"2009": -5.6, "2010": 4.1, "2011": None, "2030": 0.7}}}}
    monkeypatch.setattr(imf, "get_json", lambda *a, **k: payload)
    assert imf.fetch_indicator("NGDP_RPCH", 2010, 2029) == [
        {"country": "DEU", "period": "2010", "value": 4.1}
    ]


def test_store_replaces_previous_revision(tmp_path):
    conn = store.connect(tmp_path / "t.db")
    store.save_observations(conn, "gdp", "imf", [{"country": "DEU", "period": "2025", "value": 1.0}])
    store.save_observations(conn, "gdp", "imf", [{"country": "DEU", "period": "2025", "value": 0.2}])
    assert conn.execute("SELECT value FROM observations").fetchall() == [(0.2,)]


def test_imf_countries_fall_back_to_code_for_missing_label(monkeypatch):
    payloads = iter([{"countries": {"ATI": {"label": None}}}, {"regions": {"AFQ": {"label": "Africa"}}}])
    monkeypatch.setattr(imf, "get_json", lambda *a, **k: next(payloads))
    assert imf.fetch_countries() == [
        {"code": "ATI", "name": "ATI", "is_aggregate": False},
        {"code": "AFQ", "name": "Africa", "is_aggregate": True},
    ]
