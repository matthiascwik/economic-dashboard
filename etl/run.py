"""Load indicators into the local SQLite store: python -m etl.run [indicator_id ...]

Stored indicator ids: the catalogue id, plus ':<series>' for series with a breakdown (e.g. gva_volume_index:C).
Sources may return (rows, {series: label}) to provide readable names for the breakdown.
"""
import sys
import time
from datetime import date

from etl import catalogue, destatis, ecb, eurostat, http, imf, store, worldbank

SOURCES = {"worldbank": worldbank, "imf": imf, "eurostat": eurostat, "ecb": ecb, "destatis": destatis}


def say(message: str) -> None:
    print(message, flush=True)  # unbuffered, so progress shows up immediately even when piped


def _load_one(conn, e: dict, start: int, end: int) -> int:
    """Fetch and store one catalogue entry; returns the number of observations stored."""
    result = SOURCES[e["source"]].fetch_series(e, start, end)
    rows, labels = result if isinstance(result, tuple) else (result, {})
    if labels:
        store.save_series_labels(conn, e["id"], labels)
    if rows and "country_name" in rows[0]:  # sources without a country list name them inline
        names = {r["country"]: {"code": r["country"], "name": r["country_name"], "is_aggregate": r["is_aggregate"]} for r in rows}
        store.save_countries(conn, e["source"], list(names.values()))
    # Series with a breakdown are stored as separate indicators: '<id>:<series>'.
    by_indicator: dict[str, list[dict]] = {}
    for r in rows:
        by_indicator.setdefault(f"{e['id']}:{r['series']}" if "series" in r else e["id"], []).append(r)
    return sum(store.save_observations(conn, indicator, e["source"], group) for indicator, group in by_indicator.items())


def _reason(exc: Exception) -> str:
    return f"{type(exc).__name__}: {str(exc)[:200]}"


def load(conn, ids: set[str] | None = None, end_year: int | None = None) -> list[str]:
    """Load the catalogue into the store, reporting progress. Returns a list of failure messages."""
    http.notify = lambda message: say(f"           {message}")
    t0 = time.monotonic()
    start = catalogue.load()["start_year"]
    # IMF forecasts run ~5 years ahead; other sources simply have no data past the latest year.
    end = end_year or date.today().year + 6
    entries = [e for e in catalogue.entries() if not ids or e["id"] in ids]
    unknown = (ids or set()) - {e["id"] for e in entries}
    failures = [f"{i}: not in indicators.yaml" for i in sorted(unknown)]
    sources = sorted({e["source"] for e in entries})
    say(f"Loading {len(entries)} indicators from {len(sources)} sources ({start}-{end})")

    for source in (s for s in sources if hasattr(SOURCES[s], "fetch_countries")):
        say(f"Country list: {source} ...")
        try:
            store.save_countries(conn, source, SOURCES[source].fetch_countries())
        except Exception as exc:  # noqa: BLE001 - indicators can still load without a refreshed country list
            failures.append(f"country list {source}: {_reason(exc)}")
            say(f"           FAILED: {_reason(exc)}")

    failed = 0
    width = len(str(len(entries)))
    for n, e in enumerate(entries, 1):
        say(f"[{n:>{width}}/{len(entries)}] {e['id']} ({e['source']}) ...")
        t = time.monotonic()
        try:
            total = _load_one(conn, e, start, end)
            say(f"           done: {total} observations in {time.monotonic() - t:.1f} s")
        except Exception as exc:  # noqa: BLE001 - one failing source must not stop the others
            failed += 1
            failures.append(f"{e['id']}: {_reason(exc)}")
            say(f"           FAILED after {time.monotonic() - t:.1f} s: {_reason(exc)}")

    say(f"\nFinished in {time.monotonic() - t0:.0f} s: {len(entries) - failed}/{len(entries)} indicators loaded, {len(failures)} problem(s)")
    for f in failures:
        say(f"  - {f}")
    return failures


if __name__ == "__main__":
    sys.exit(1 if load(store.connect(), set(sys.argv[1:]) or None) else 0)
