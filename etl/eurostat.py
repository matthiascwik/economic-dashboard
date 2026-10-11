"""Eurostat dissemination API, JSON-stat 2.0 (no key).

Country codes are mapped to ISO-3 (matching the World Bank/IMF data); EU/euro-area
aggregates keep their Eurostat codes (EU27_2020, EA20, ...) and are flagged as aggregates.
"""
from math import prod

from etl.http import get_json

BASE = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data"
SOURCE = "eurostat"

ISO2_TO_ISO3 = {
    "AL": "ALB", "AT": "AUT", "BA": "BIH", "BE": "BEL", "BG": "BGR", "CH": "CHE", "CY": "CYP",
    "CZ": "CZE", "DE": "DEU", "DK": "DNK", "EE": "EST", "EL": "GRC", "ES": "ESP", "FI": "FIN",
    "FR": "FRA", "HR": "HRV", "HU": "HUN", "IE": "IRL", "IS": "ISL", "IT": "ITA", "LI": "LIE",
    "LT": "LTU", "LU": "LUX", "LV": "LVA", "ME": "MNE", "MK": "MKD", "MT": "MLT", "NL": "NLD",
    "NO": "NOR", "PL": "POL", "PT": "PRT", "RO": "ROU", "RS": "SRB", "SE": "SWE", "SI": "SVN",
    "SK": "SVK", "TR": "TUR", "UK": "GBR", "XK": "XKX", "US": "USA", "JP": "JPN", "MD": "MDA", "UA": "UKR",
}


def parse_jsonstat(data: dict, series_dim: str | None = None) -> list[dict]:
    """Flatten a JSON-stat cube to rows. Every dimension other than geo/time must have a
    single value, except `series_dim` (e.g. the NACE sector), which is kept as `series`."""
    ids, sizes = data["id"], data["size"]
    dims = data["dimension"]
    # Category codes per dimension, ordered by their position in the cube.
    codes = {d: sorted(dims[d]["category"]["index"], key=dims[d]["category"]["index"].get) for d in ids}
    strides = [prod(sizes[i + 1 :]) for i in range(len(ids))]
    rows = []
    for flat, value in data["value"].items():
        if value is None:
            continue
        flat = int(flat)
        at = {d: codes[d][(flat // strides[i]) % sizes[i]] for i, d in enumerate(ids)}
        geo = at["geo"]
        is_agg = geo not in ISO2_TO_ISO3
        row = {
            "country": ISO2_TO_ISO3.get(geo, geo),
            "country_name": dims["geo"]["category"]["label"][geo],
            "is_aggregate": is_agg,
            "period": at["time"],
            "value": value,
        }
        if series_dim:
            row["series"] = at[series_dim]
        rows.append(row)
    return rows


def fetch_series(entry: dict, start_year: int, end_year: int) -> list[dict]:
    params = {**entry.get("params", {}), "format": "JSON", "lang": "EN", "sinceTimePeriod": str(start_year)}
    sectors = entry.get("nace_sectors")
    if sectors:
        params["nace_r2"] = sectors  # repeated query parameter
    data = get_json(f"{BASE}/{entry['code']}", params)
    rows = parse_jsonstat(data, "nace_r2" if sectors else None)
    return [r for r in rows if int(r["period"][:4]) <= end_year]
