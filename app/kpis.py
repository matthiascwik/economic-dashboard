"""KPI tiles: latest value, change vs an earlier period, and a short trend per headline indicator."""
import sqlite3
from datetime import date

from etl import catalogue

SOURCE_NAMES = {"worldbank": "World Bank", "imf": "IMF", "eurostat": "Eurostat", "ecb": "ECB", "destatis": "Destatis"}

# fmt: pct = "3.3%", index = "104.7", delta mode: diff (percentage points / index points) or pct (percent change).
# good: which direction is favourable ("up" / "down"), or None when neither is.
# cap: latest period to consider - "this_year" for forecasts, "last_year" for annual actuals.
SPECS: dict[str, list[dict]] = {
    "germany": [
        dict(label="GDP growth, {year} forecast", indicator="gdp_growth_forecast", country="DEU", fmt="pct", cap="this_year", good="up", source="imf"),
        dict(label="Inflation (HICP)", indicator="hicp_inflation", country="DEU", fmt="pct", good="down", source="eurostat"),
        dict(label="Unemployment rate", indicator="unemployment_monthly", country="DEU", fmt="pct", good="down", source="eurostat"),
        dict(label="Industrial production (2021 = 100)", indicator="industrial_production", country="DEU", fmt="index", delta="pct", lag=12, good="up", source="eurostat"),
        dict(label="Government debt, % of GDP", indicator="gov_debt", country="DEU", fmt="pct", cap="last_year", good="down", source="imf"),
        dict(label="Exports, % of GDP", indicator="trade_share", country="DEU", fmt="pct", good=None, source="worldbank"),
    ],
    "europe": [
        dict(label="Euro area GDP growth, {year} forecast", indicator="gdp_growth_forecast", country="EURO", fmt="pct", cap="this_year", good="up", source="imf"),
        dict(label="Euro area inflation (HICP)", indicator="hicp_inflation", country="EA", fmt="pct", good="down", source="eurostat"),
        dict(label="Euro area unemployment rate", indicator="unemployment_monthly", country="EA21", fmt="pct", good="down", source="eurostat"),
        dict(label="Euro area industrial production (2021 = 100)", indicator="industrial_production", country="EA21", fmt="index", delta="pct", lag=12, good="up", source="eurostat"),
        dict(label="ECB main refinancing rate", indicator="ecb_main_rate", country="EA", fmt="pct", good=None, source="ecb"),
        dict(label="Euro area government debt, % of GDP", indicator="gov_debt", country="EURO", fmt="pct", cap="last_year", good="down", source="imf"),
    ],
    "world": [
        dict(label="World GDP growth, {year} forecast", indicator="gdp_growth_forecast", country="WEOWORLD", fmt="pct", cap="this_year", good="up", source="imf"),
        dict(label="World GDP growth", indicator="gdp_growth", country="WLD", fmt="pct", good="up", source="worldbank"),
        dict(label="World inflation (consumer prices)", indicator="inflation", country="WLD", fmt="pct", good="down", source="worldbank"),
        dict(label="World unemployment rate", indicator="unemployment", country="WLD", fmt="pct", good="down", source="worldbank"),
        dict(label="World exports, % of GDP", indicator="trade_share", country="WLD", fmt="pct", good=None, source="worldbank"),
        dict(label="World manufacturing, % of GDP", indicator="manufacturing_share", country="WLD", fmt="pct", good=None, source="worldbank"),
    ],
}

FLAT = 0.05  # |change| below this counts as unchanged


def _fmt_value(v: float, fmt: str) -> str:
    return f"{v:.1f}%" if fmt == "pct" else f"{v:.1f}"


def _delta(spec: dict, values: list[float], periods: list[str]) -> dict | None:
    lag = spec.get("lag", 1)
    if len(values) <= lag:
        return None
    now, before = values[-1], values[-1 - lag]
    mode = spec.get("delta", "diff")
    change = (now / before - 1) * 100 if mode == "pct" and before else now - before
    unit = "%" if mode == "pct" else ("pp" if spec["fmt"] == "pct" else "")
    direction = "flat" if abs(change) < FLAT else ("up" if change > 0 else "down")
    good = spec.get("good")
    tone = "neutral" if direction == "flat" or good is None else ("good" if direction == good else "bad")
    sign = {"up": "+", "down": "−", "flat": ""}[direction]
    text = f"{sign}{abs(change):.1f}{' ' + unit if unit == 'pp' else unit}"
    return {"text": text, "direction": direction, "tone": tone, "since": periods[-1 - lag]}


def compute(conn: sqlite3.Connection, scope: str, today: date | None = None) -> list[dict]:
    year = (today or date.today()).year
    units = {e["id"]: e["unit"] for e in catalogue.entries()}
    tiles = []
    for spec in SPECS[scope]:
        caps = {"this_year": str(year), "last_year": str(year - 1)}
        cap = caps.get(spec.get("cap"), "9999")
        rows = conn.execute(
            "SELECT period, value FROM observations WHERE indicator = ? AND country = ? AND period <= ? ORDER BY period",
            (spec["indicator"], spec["country"], cap),
        ).fetchall()
        tile = {
            "label": spec["label"].format(year=year), "source": SOURCE_NAMES[spec["source"]], "empty": not rows,
            # What the history dialog needs to fetch and draw the full series.
            "indicator": spec["indicator"], "country": spec["country"], "fmt": spec["fmt"], "unit": units[spec["indicator"]],
            "forecast_from": year if spec["source"] == "imf" else None,  # IMF series continue with projections
        }
        if rows:
            periods, values = [r[0] for r in rows], [r[1] for r in rows]
            n = 10 if len(periods[-1]) == 4 else 24  # annual vs monthly/event series
            tile |= {
                "value": _fmt_value(values[-1], spec["fmt"]),
                "period": periods[-1],
                "delta": _delta(spec, values, periods),
                "trend": [{"period": p, "value": v} for p, v in zip(periods[-n:], values[-n:])],
            }
        tiles.append(tile)
    return tiles
