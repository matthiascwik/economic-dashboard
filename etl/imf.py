"""IMF DataMapper API (no key; WEO data incl. forecasts). https://www.imf.org/external/datamapper/api/v1"""
from etl.http import get_json

BASE = "https://www.imf.org/external/datamapper/api/v1"
SOURCE = "imf"


def fetch_countries() -> list[dict]:
    countries = get_json(f"{BASE}/countries")["countries"]
    regions = get_json(f"{BASE}/regions")["regions"]
    return [{"code": k, "name": v["label"] or k, "is_aggregate": False} for k, v in countries.items()] + [
        {"code": k, "name": v["label"] or k, "is_aggregate": True} for k, v in regions.items()
    ]


def fetch_indicator(code: str, start_year: int, end_year: int) -> list[dict]:
    values = get_json(f"{BASE}/{code}")["values"].get(code, {})
    return [
        {"country": country, "period": year, "value": value}
        for country, series in values.items()
        for year, value in series.items()
        if value is not None and start_year <= int(year) <= end_year
    ]


def fetch_series(entry: dict, start_year: int, end_year: int) -> list[dict]:
    return fetch_indicator(entry["code"], start_year, end_year)
