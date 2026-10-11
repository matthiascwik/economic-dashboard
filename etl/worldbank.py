"""World Bank Indicators API v2 (no key). https://api.worldbank.org/v2"""
from etl.http import get_json

BASE = "https://api.worldbank.org/v2"
SOURCE = "worldbank"


def _pages(url: str, params: dict) -> list[dict]:
    """Collect rows over all pages; the API returns [meta, rows] (rows is null when empty)."""
    rows, page = [], 1
    while True:
        meta, data = get_json(url, {**params, "format": "json", "per_page": 20000, "page": page})
        rows += data or []
        if page >= int(meta["pages"]):
            return rows
        page += 1


def fetch_countries() -> list[dict]:
    rows = _pages(f"{BASE}/country", {})
    # Aggregates (World, Euro area, income groups, ...) carry region id "NA".
    return [
        {"code": r["id"], "name": r["name"], "is_aggregate": r["region"]["id"] == "NA"}
        for r in rows
    ]


def fetch_indicator(code: str, start_year: int, end_year: int) -> list[dict]:
    rows = _pages(f"{BASE}/country/all/indicator/{code}", {"date": f"{start_year}:{end_year}"})
    return [
        {"country": r["countryiso3code"], "period": r["date"], "value": r["value"]}
        for r in rows
        if r["value"] is not None and r["countryiso3code"]
    ]


def fetch_series(entry: dict, start_year: int, end_year: int) -> list[dict]:
    return fetch_indicator(entry["code"], start_year, end_year)
