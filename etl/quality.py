"""Data quality checks on the local store: python -m etl.quality (exit code 1 if any issue)."""
import sys
from datetime import date

from etl import catalogue, store

# Maximum age of the latest period, in years, per period format.
MAX_AGE_YEARS = {"annual": 2, "quarterly": 1, "monthly": 1, "daily": 2}


def _kind(period: str) -> str:
    if "-Q" in period:
        return "quarterly"
    return {4: "annual", 7: "monthly", 10: "daily"}.get(len(period), "annual")


def check(conn, today: date | None = None) -> list[str]:
    today = today or date.today()
    issues = []
    for e in catalogue.entries():
        ids = [f"{e['id']}", f"{e['id']}:%"]
        rows = conn.execute(
            "SELECT COUNT(*), MAX(period), MIN(value), MAX(value) FROM observations "
            "WHERE indicator = ? OR indicator LIKE ?", ids,
        ).fetchone()
        count, latest, lo, hi = rows
        if not count:
            issues.append(f"{e['id']}: no data")
            continue
        # Coverage of Germany (the ECB rate is euro-area only).
        if e["source"] != "ecb" and not conn.execute(
            "SELECT 1 FROM observations WHERE (indicator = ? OR indicator LIKE ?) AND country = 'DEU' LIMIT 1", ids
        ).fetchone():
            issues.append(f"{e['id']}: no data for Germany")
        age = today.year - int(latest[:4])
        if age > MAX_AGE_YEARS[_kind(latest)]:
            issues.append(f"{e['id']}: stale, latest period {latest}")
        if "range" in e and (lo < e["range"][0] or hi > e["range"][1]):
            issues.append(f"{e['id']}: values {lo:.1f}..{hi:.1f} outside range {e['range']}")
    return issues


if __name__ == "__main__":
    problems = check(store.connect())
    print("\n".join(problems) or "all checks passed")
    sys.exit(1 if problems else 0)
