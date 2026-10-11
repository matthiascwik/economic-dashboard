"""Destatis GENESIS-Online REST API 2020 (free account; API token in DESTATIS_TOKEN).

Tables are downloaded as flat CSV (zipped). A catalogue entry names the table and fixes all
dimensions except the time and series dimensions via `params` ({variable_code: attribute_code}).
"""
import csv
import io
import os
import zipfile
from datetime import date
from pathlib import Path

from etl.http import post_bytes

BASE = "https://genesis.destatis.de/genesisWS/rest/2020"
SOURCE = "destatis"
ENV_FILE = Path(__file__).resolve().parent.parent / ".env"
MISSING = {"", "-", ".", "...", "x", "/"}  # Destatis markers for "no value"


def _token() -> str:
    if token := os.environ.get("DESTATIS_TOKEN"):
        return token
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            key, _, value = line.partition("=")
            if key.strip() == "DESTATIS_TOKEN" and value.strip():
                return value.strip()
    raise RuntimeError("DESTATIS_TOKEN is not set (environment or .env)")


def _period(year: str, var: str, attr: str) -> str:
    """'2026' + MONAT/MONAT07 -> '2026-07'; '2026' + QUARTG/QUART2 -> '2026-Q2'. No time variable: annual."""
    if var == "MONAT":
        return f"{year}-{attr[-2:]}"
    if var.startswith("QUART"):
        return f"{year}-Q{attr[-1]}"
    return year


def parse_flat_csv(text: str, filters: dict, series_var: str, time_var: str | None) -> tuple[list[dict], dict]:
    """Rows for the given filters plus {series code: label}. Empty series code means the total."""
    rows, labels = [], {}
    for rec in csv.DictReader(io.StringIO(text), delimiter=";"):
        vars_ = {}
        for n in range(1, 10):
            if f"{n}_variable_code" not in rec:
                break
            vars_[rec[f"{n}_variable_code"]] = (rec[f"{n}_variable_attribute_code"], rec[f"{n}_variable_attribute_label"])
        if any(vars_.get(var, ("",))[0] != attr for var, attr in filters.items()):
            continue
        if rec["value"] in MISSING:
            continue
        series, label = vars_[series_var]
        series = series or "TOTAL"
        labels[series] = label
        rows.append({
            "country": "DEU",
            "period": _period(rec["time"], time_var, vars_[time_var][0]) if time_var else rec["time"],
            "value": float(rec["value"].replace(",", ".")),
            "series": series,
        })
    return rows, labels


CHUNK_YEARS = 5  # larger requests are rejected as "too big for dialogue-processing"


def _download(code: str, first: int, last: int, token: str) -> str:
    body = post_bytes(
        f"{BASE}/data/tablefile",
        {"name": code, "area": "all", "format": "ffcsv", "startyear": str(first), "endyear": str(last), "language": "en"},
        {"username": token, "password": ""},
    )
    if not zipfile.is_zipfile(io.BytesIO(body)):  # errors come back as JSON with HTTP 200
        raise RuntimeError(f"Destatis {code} {first}-{last}: {body[:300].decode('utf-8', 'replace')}")
    with zipfile.ZipFile(io.BytesIO(body)) as z:
        return z.read(z.namelist()[0]).decode("utf-8-sig")


def fetch_series(entry: dict, start_year: int, end_year: int) -> tuple[list[dict], dict]:
    token = _token()
    end_year = min(end_year, date.today().year)
    rows, labels = [], {}
    for first in range(start_year, end_year + 1, CHUNK_YEARS):
        text = _download(entry["code"], first, min(first + CHUNK_YEARS - 1, end_year), token)
        chunk, chunk_labels = parse_flat_csv(text, entry["params"], entry["series_var"], entry.get("time_var"))
        rows += chunk
        labels |= chunk_labels
    return rows, labels
