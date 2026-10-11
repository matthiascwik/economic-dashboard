"""ECB Data Portal, SDMX-JSON (no key). Entry code is '<flow>/<series key>'."""
from etl.http import get_json

BASE = "https://data-api.ecb.europa.eu/service/data"
SOURCE = "ecb"


def parse_sdmx(data: dict, country: str = "EA") -> list[dict]:
    periods = [v["id"] for v in data["structure"]["dimensions"]["observation"][0]["values"]]
    rows = []
    for series in data["dataSets"][0]["series"].values():
        for idx, obs in series["observations"].items():
            if obs[0] is not None:
                rows.append({"country": country, "period": periods[int(idx)], "value": obs[0]})
    return rows


def fetch_series(entry: dict, start_year: int, end_year: int) -> list[dict]:
    data = get_json(f"{BASE}/{entry['code']}", {"format": "jsondata", "startPeriod": str(start_year)})
    return [r for r in parse_sdmx(data) if int(r["period"][:4]) <= end_year]
