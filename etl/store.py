import os
import sqlite3
from pathlib import Path

# DASHBOARD_DB overrides the location (used in the container, where the data lives on a volume).
DB_PATH = Path(os.environ.get("DASHBOARD_DB") or Path(__file__).resolve().parent.parent / "data" / "dashboard.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS countries (
    code TEXT NOT NULL,
    source TEXT NOT NULL,
    name TEXT NOT NULL,
    is_aggregate INTEGER NOT NULL,
    PRIMARY KEY (code, source)
);
CREATE TABLE IF NOT EXISTS observations (
    indicator TEXT NOT NULL,
    country TEXT NOT NULL,
    period TEXT NOT NULL,
    value REAL NOT NULL,
    source TEXT NOT NULL,
    PRIMARY KEY (indicator, country, period, source)
);
CREATE TABLE IF NOT EXISTS series_labels (
    indicator TEXT NOT NULL,
    series TEXT NOT NULL,
    label TEXT NOT NULL,
    PRIMARY KEY (indicator, series)
);
"""


def connect(path: Path | str = DB_PATH) -> sqlite3.Connection:
    conn = sqlite3.connect(path, timeout=30)
    # WAL lets the web app keep reading while a refresh writes (the database must be on a local disk, not SMB/NFS).
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript(SCHEMA)
    return conn


def save_countries(conn, source: str, rows: list[dict]) -> None:
    conn.executemany(
        "INSERT OR REPLACE INTO countries VALUES (?, ?, ?, ?)",
        [(r["code"], source, r["name"], int(r["is_aggregate"])) for r in rows],
    )
    conn.commit()


def save_observations(conn, indicator: str, source: str, rows: list[dict]) -> int:
    """Replace all stored observations of one indicator/source with `rows` (latest revision wins)."""
    conn.execute("DELETE FROM observations WHERE indicator = ? AND source = ?", (indicator, source))
    conn.executemany(
        "INSERT OR REPLACE INTO observations VALUES (?, ?, ?, ?, ?)",
        [(indicator, r["country"], r["period"], r["value"], source) for r in rows],
    )
    conn.commit()
    return len(rows)


def save_series_labels(conn, indicator: str, labels: dict[str, str]) -> None:
    conn.executemany(
        "INSERT OR REPLACE INTO series_labels VALUES (?, ?, ?)",
        [(indicator, series, label) for series, label in labels.items()],
    )
    conn.commit()
