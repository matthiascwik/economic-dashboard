import time

import httpx

RETRIES = 4
TIMEOUT = 60.0

# Called with a short message before each retry; `etl.run` points it at its progress output.
notify = lambda message: None


def _request(method: str, url: str, **kwargs) -> httpx.Response:
    """Send a request with retries and exponential backoff (public APIs are occasionally flaky)."""
    with httpx.Client(timeout=TIMEOUT, follow_redirects=True) as client:
        for attempt in range(RETRIES):
            try:
                r = client.request(method, url, **kwargs)
                r.raise_for_status()
                return r
            except (httpx.TransportError, httpx.HTTPStatusError) as exc:
                if attempt == RETRIES - 1:
                    raise
                wait = 2**attempt
                reason = f"HTTP {exc.response.status_code}" if isinstance(exc, httpx.HTTPStatusError) else type(exc).__name__
                notify(f"retry {attempt + 1}/{RETRIES - 1} in {wait} s ({reason}, {httpx.URL(url).host})")
                time.sleep(wait)


def get_json(url: str, params: dict | None = None):
    return _request("GET", url, params=params).json()


def post_bytes(url: str, data: dict, headers: dict) -> bytes:
    return _request("POST", url, data=data, headers=headers).content
