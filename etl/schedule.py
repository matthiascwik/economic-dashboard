"""Container entry point for the data refresh: python -m etl.schedule

Fetches all data right away when the store is empty, then refreshes every day at ETL_RUN_AT
(HH:MM, default 04:30) in the time zone TZ (default Europe/Berlin).
"""
import os
import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from etl import quality, run, store


def next_run(now: datetime, at: str) -> datetime:
    """The next occurrence of HH:MM strictly after `now` (same time zone)."""
    hour, minute = (int(part) for part in at.split(":"))
    candidate = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    return candidate if candidate > now else candidate + timedelta(days=1)


def has_data(conn) -> bool:
    return conn.execute("SELECT EXISTS (SELECT 1 FROM observations)").fetchone()[0] == 1


def refresh() -> None:
    """One full refresh; never raises, so the scheduler keeps running after a bad night."""
    try:
        conn = store.connect()
        try:
            run.load(conn)
            issues = quality.check(conn)
        finally:
            conn.close()
        run.say("Quality check: " + ("; ".join(issues) if issues else "all checks passed"))
    except Exception as exc:  # noqa: BLE001 - see docstring
        run.say(f"Refresh failed: {type(exc).__name__}: {str(exc)[:200]}")


def main() -> None:
    tz = ZoneInfo(os.environ.get("TZ", "Europe/Berlin"))
    at = os.environ.get("ETL_RUN_AT", "04:30")
    next_run(datetime.now(tz), at)  # fail fast on a malformed time
    conn = store.connect()
    first = not has_data(conn)
    conn.close()
    if first:
        run.say("No data yet - running the first refresh now")
        refresh()
    while True:
        target = next_run(datetime.now(tz), at)
        run.say(f"Next refresh: {target:%Y-%m-%d %H:%M %Z}")
        time.sleep(max(1.0, (target - datetime.now(tz)).total_seconds()))
        refresh()


if __name__ == "__main__":
    main()
