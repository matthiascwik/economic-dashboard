from datetime import datetime
from zoneinfo import ZoneInfo

from etl import run, schedule, store

BERLIN = ZoneInfo("Europe/Berlin")


def test_next_run_later_today_or_tomorrow():
    assert schedule.next_run(datetime(2026, 10, 10, 3, 0, tzinfo=BERLIN), "04:30") == datetime(2026, 10, 10, 4, 30, tzinfo=BERLIN)
    assert schedule.next_run(datetime(2026, 10, 10, 4, 30, tzinfo=BERLIN), "04:30") == datetime(2026, 10, 11, 4, 30, tzinfo=BERLIN)
    assert schedule.next_run(datetime(2026, 10, 10, 23, 59, tzinfo=BERLIN), "04:30").day == 11


def test_next_run_keeps_wall_clock_time_over_daylight_saving():
    # Clocks go back on 2026-10-25: 04:30 stays 04:30 local time.
    nxt = schedule.next_run(datetime(2026, 10, 24, 5, 0, tzinfo=BERLIN), "04:30")
    assert (nxt.day, nxt.hour, nxt.minute) == (25, 4, 30)


def test_has_data(tmp_path):
    conn = store.connect(tmp_path / "t.db")
    assert not schedule.has_data(conn)
    store.save_observations(conn, "x", "imf", [{"country": "DEU", "period": "2025", "value": 1.0}])
    assert schedule.has_data(conn)


def test_store_uses_wal(tmp_path):
    conn = store.connect(tmp_path / "t.db")
    assert conn.execute("PRAGMA journal_mode").fetchone()[0] == "wal"


def test_refresh_survives_errors(monkeypatch, capsys):
    def boom(*a, **k):
        raise RuntimeError("network down")

    monkeypatch.setattr(schedule.store, "connect", boom)
    schedule.refresh()
    assert "Refresh failed: RuntimeError: network down" in capsys.readouterr().out
    assert run.say  # the scheduler uses the same progress output as etl.run
