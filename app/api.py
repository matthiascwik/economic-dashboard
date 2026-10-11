"""Read-only JSON API over the local SQLite store."""
import os
import sqlite3
from collections import defaultdict
from contextlib import closing

from fastapi import APIRouter, HTTPException, Query

from etl import catalogue
from etl.store import DB_PATH

router = APIRouter(prefix="/api")


def _connect() -> sqlite3.Connection:
    path = os.environ.get("DASHBOARD_DB", DB_PATH)
    if not os.path.exists(path):
        raise HTTPException(503, "No data yet - run `python -m etl.run`")
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=5)
    conn.row_factory = sqlite3.Row
    return conn


def _entry(indicator_id: str) -> dict:
    for e in catalogue.entries():
        if e["id"] == indicator_id:
            return e
    raise HTTPException(404, f"Unknown indicator '{indicator_id}'")


def _split(value: str | None) -> list[str]:
    return [v.strip() for v in value.split(",") if v.strip()] if value else []


@router.get("/indicators")
def list_indicators() -> list[dict]:
    """The catalogue with coverage (period range, countries) of what is actually stored."""
    with closing(_connect()) as conn:
        out = []
        for e in catalogue.entries():
            first, last, n_countries = conn.execute(
                "SELECT MIN(period), MAX(period), COUNT(DISTINCT country) FROM observations "
                "WHERE indicator = ? OR indicator LIKE ?", (e["id"], f"{e['id']}:%"),
            ).fetchone()
            series = conn.execute(
                "SELECT series, label FROM series_labels WHERE indicator = ? ORDER BY series", (e["id"],)
            ).fetchall()
            out.append({
                "id": e["id"], "name": e["name"], "unit": e["unit"], "source": e["source"], "scope": e["scope"],
                "first_period": first, "last_period": last, "countries": n_countries,
                "series": [dict(s) for s in series] or ([{"series": s, "label": e.get("nace_labels", {}).get(s, s)} for s in e["nace_sectors"]] if "nace_sectors" in e else []),
            })
        return out


@router.get("/countries")
def list_countries(aggregates: bool | None = None) -> list[dict]:
    """Countries and aggregates (EU, euro area, world, ...) known to the store."""
    with closing(_connect()) as conn:
        rows = conn.execute(
            "SELECT code, MIN(name) AS name, MAX(is_aggregate) AS is_aggregate FROM countries GROUP BY code ORDER BY code"
        ).fetchall()
    return [
        {"code": r["code"], "name": r["name"], "is_aggregate": bool(r["is_aggregate"])}
        for r in rows
        if aggregates is None or bool(r["is_aggregate"]) == aggregates
    ]


@router.get("/indicator/{indicator_id}")
def get_indicator(
    indicator_id: str,
    countries: str | None = Query(None, description="Comma-separated codes, e.g. DEU,FRA,EA20"),
    series: str | None = Query(None, description="Comma-separated sector/branch codes, e.g. C,J"),
    start: str | None = Query(None, description="First period, e.g. 2019 or 2019-Q1"),
    end: str | None = Query(None, description="Last period (inclusive)"),
) -> dict:
    e = _entry(indicator_id)
    wanted_series = _split(series)
    wanted_countries = _split(countries)

    sql = "SELECT indicator, country, period, value FROM observations WHERE (indicator = ? OR indicator LIKE ?)"
    args: list = [indicator_id, f"{indicator_id}:%"]
    if wanted_series:
        sql += f" AND indicator IN ({','.join('?' * len(wanted_series))})"
        args += [f"{indicator_id}:{s}" for s in wanted_series]
    if wanted_countries:
        sql += f" AND country IN ({','.join('?' * len(wanted_countries))})"
        args += wanted_countries
    if start:
        sql += " AND period >= ?"
        args.append(start)
    if end:
        sql += " AND period <= ?"  # '2024' <= '2024-03' is false, so pad year-only bounds
        args.append(end if len(end) > 4 else f"{end}~")
    sql += " ORDER BY indicator, country, period"

    with closing(_connect()) as conn:
        rows = conn.execute(sql, args).fetchall()
        labels = {r["series"]: r["label"] for r in conn.execute(
            "SELECT series, label FROM series_labels WHERE indicator = ?", (indicator_id,))}
    if not rows:
        raise HTTPException(404, "No data for this selection")

    grouped: dict[tuple[str, str | None], list[dict]] = defaultdict(list)
    for r in rows:
        _, _, ser = r["indicator"].partition(":")
        grouped[(r["country"], ser or None)].append({"period": r["period"], "value": r["value"]})
    return {
        "id": e["id"], "name": e["name"], "unit": e["unit"], "source": e["source"],
        "series": [
            {"country": c, "series": s, "label": (labels.get(s) or e.get("nace_labels", {}).get(s)) if s else None, "points": pts}
            for (c, s), pts in grouped.items()
        ],
    }
