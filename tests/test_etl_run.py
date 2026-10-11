import httpx
import pytest

from etl import http, run, store


@pytest.fixture
def conn(tmp_path):
    return store.connect(tmp_path / "t.db")


class _Source:
    def __init__(self, fail_for=()):
        self.fail_for = fail_for

    def fetch_series(self, entry, start, end):
        if entry["id"] in self.fail_for:
            raise RuntimeError("boom")
        return [{"country": "DEU", "period": "2025", "value": 1.0}]


def test_progress_lines_and_failures_dont_stop_the_run(conn, monkeypatch, capsys):
    monkeypatch.setitem(run.SOURCES, "worldbank", _Source(fail_for={"inflation"}))
    failures = run.load(conn, {"gdp_growth", "inflation", "unemployment"})
    out = capsys.readouterr().out
    assert "[1/3] gdp_growth (worldbank)" in out and "[3/3]" in out
    assert "done: 1 observations" in out and "FAILED" in out
    assert failures == ["inflation: RuntimeError: boom"]
    assert "2/3 indicators loaded, 1 problem(s)" in out
    # the failing indicator did not prevent the others from being stored
    assert conn.execute("SELECT COUNT(DISTINCT indicator) FROM observations").fetchone()[0] == 2


def test_unknown_indicator_is_reported(conn, monkeypatch):
    monkeypatch.setitem(run.SOURCES, "worldbank", _Source())
    assert run.load(conn, {"gdp_growth", "nope"}) == ["nope: not in indicators.yaml"]


def test_retries_are_announced(monkeypatch):
    calls = iter([httpx.ConnectTimeout("slow"), httpx.Response(200, json={"ok": 1}, request=httpx.Request("GET", "https://x.test/a"))])

    class FakeClient:
        def __init__(self, **kw): pass
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def request(self, method, url, **kw):
            r = next(calls)
            if isinstance(r, Exception):
                raise r
            return r

    messages = []
    monkeypatch.setattr(http.httpx, "Client", FakeClient)
    monkeypatch.setattr(http.time, "sleep", lambda s: None)
    monkeypatch.setattr(http, "notify", messages.append)
    assert http.get_json("https://x.test/a") == {"ok": 1}
    assert messages == ["retry 1/3 in 1 s (ConnectTimeout, x.test)"]
