import os
from contextlib import closing
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exception_handlers import http_exception_handler
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.exceptions import HTTPException as StarletteHTTPException

from app import kpis
from app.api import _connect, list_indicators
from app.api import router as api_router
from etl.store import DB_PATH

BASE_DIR = Path(__file__).resolve().parent

app = FastAPI(title="Economic Dashboard")
app.include_router(api_router)
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
templates = Jinja2Templates(directory=BASE_DIR / "templates")

SECTIONS = {
    "world": ("World", "Global growth, prices and trade"),
    "europe": ("Europe", "Euro area and European Union"),
    "germany": ("Germany", "Where the German economy stands today"),
}


PROVIDERS = [
    ("World Bank", "https://data.worldbank.org", "Annual indicators for ~200 countries: GDP, inflation, unemployment, trade."),
    ("IMF DataMapper", "https://www.imf.org/external/datamapper", "World Economic Outlook data and forecasts: growth, public debt, current account."),
    ("Eurostat", "https://ec.europa.eu/eurostat", "European inflation (HICP), unemployment, industrial production and value added by sector."),
    ("European Central Bank", "https://data.ecb.europa.eu", "Key interest rates of the euro area."),
    ("Destatis (GENESIS-Online)", "https://www-genesis.destatis.de", "German national accounts, production index and new orders."),
    ("Natural Earth", "https://www.naturalearthdata.com", "Country outlines for the maps (public domain)."),
]


def _updated() -> str:
    path = os.environ.get("DASHBOARD_DB", DB_PATH)
    return datetime.fromtimestamp(os.path.getmtime(path)).strftime("%d %b %Y") if os.path.exists(path) else "never"


@app.exception_handler(StarletteHTTPException)
async def html_errors(request: Request, exc: StarletteHTTPException):
    """Readable error pages for browsers; the JSON API keeps its default error format."""
    if request.url.path.startswith("/api") or exc.status_code not in (404, 503):
        return await http_exception_handler(request, exc)
    message = (
        "The data has not been loaded yet. It is fetched on the first start (a few minutes); reload shortly, or run `python -m etl.run`." if exc.status_code == 503 else "This page does not exist."
    )
    return templates.TemplateResponse(
        request, "error.html",
        {"status": exc.status_code, "message": message, "active": "", "sections_nav": SECTIONS, "updated": _updated()},
        status_code=exc.status_code,
    )


def _page(request: Request, name: str, scopes: list[str], active: str, tiles_per_scope: int | None = None):
    with closing(_connect()) as conn:
        sections = [
            {"scope": s, "title": SECTIONS[s][0], "subtitle": SECTIONS[s][1], "tiles": kpis.compute(conn, s)[:tiles_per_scope]}
            for s in scopes
        ]
    return templates.TemplateResponse(
        request, name, {"sections": sections, "active": active, "sections_nav": SECTIONS, "updated": _updated()}
    )


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/")
def overview(request: Request):
    return _page(request, "overview.html", ["germany", "europe", "world"], "overview", tiles_per_scope=4)


@app.get("/about")
def about(request: Request):
    indicators = list_indicators()
    return templates.TemplateResponse(
        request, "about.html",
        {"providers": PROVIDERS, "indicators": indicators, "active": "about", "sections_nav": SECTIONS, "updated": _updated()},
    )


@app.get("/{scope}")
def scope_page(request: Request, scope: str):
    if scope not in SECTIONS:
        raise HTTPException(404)
    return _page(request, "scope.html", [scope], scope)
