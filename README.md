# Economic Dashboard

A server-side dashboard of economic data for the **world**, **Europe** and **Germany**, built with FastAPI, Jinja2 and D3.js.
It shows how the economic situation has changed since 2010, where Germany stands today, and in which sectors there is real (price-adjusted) growth.

Data is collected from public statistical APIs, stored in a local SQLite database and served as JSON to the charts.

## Quick start

    python3 -m venv .venv
    .venv/bin/pip install -e '.[dev]'
    cp .env.example .env            # add your Destatis API token (free registration)
    .venv/bin/python -m etl.run     # fetch all data into data/dashboard.db (takes a few minutes)
    .venv/bin/uvicorn app.main:app --reload

Open <http://localhost:8000>. Pages: Overview, World, Europe, Germany, About (sources and indicator catalogue).

## Data

| Command | Purpose |
|---|---|
| `python -m etl.run` | fetch everything in `indicators.yaml`, with progress (`[3/17] name (source)`, timings, retry notices); a failing indicator is reported at the end and does not stop the others; exit code 1 if anything failed |
| `python -m etl.run gdp_growth de_gva_quarterly` | fetch only the named indicators |
| `python -m etl.quality` | check coverage, freshness and value ranges (exit code 1 on problems) |

| Source | Access | Used for |
|---|---|---|
| World Bank Indicators API | none | annual indicators, ~200 countries |
| IMF DataMapper | none | forecasts, public debt, current account |
| Eurostat (JSON-stat) | none | HICP inflation, unemployment, industrial production, value added |
| ECB Data Portal (SDMX) | none | main refinancing rate |
| Destatis GENESIS-Online | token in `.env` (`DESTATIS_TOKEN`) | German national accounts, production, new orders |

Every run replaces the stored series of an indicator with the latest published revision.
To keep data fresh, run `etl.run` on a schedule, e.g. daily with cron:

    0 6 * * *  cd /path/to/economic_dashboard && .venv/bin/python -m etl.run && .venv/bin/python -m etl.quality

## Architecture

    indicators.yaml  ──►  etl/ (one client per source)  ──►  data/dashboard.db (SQLite)
                                                                  │
                                              app/api.py  ◄───────┘  read-only JSON API
                                              app/kpis.py            KPI tiles (server-rendered)
                                              app/templates/         Jinja2 pages
                                              app/static/js/         D3 charts (no build step)

- **`indicators.yaml`** is the catalogue: every series with source, code, unit and parameters. Add an entry there to add data.
- **`etl/`**: `worldbank.py`, `imf.py`, `eurostat.py`, `ecb.py`, `destatis.py` return rows `{country, period, value[, series]}`; `store.py` writes them; `run.py` orchestrates; `quality.py` checks.
  Series with a breakdown (sectors, branches) are stored as `<indicator>:<series>`; readable names go to the `series_labels` table.
- **`app/api.py`**: `GET /api/indicators`, `/api/countries`, `/api/indicator/{id}?countries=&series=&start=&end=`. Interactive docs at `/docs`.
- **`app/static/js/charts/`**: shared helpers (`common.js`: colours, tooltip, legend, table view, linked hover, time range) and one file per chart type (line, choropleth, scatter, slope, bars, heatmap, treemap, connected scatter).
  `pages/` wires the charts of each page. D3 is vendored in `static/vendor/`, the map outlines in `static/data/`; the dashboard works offline once the data is loaded.

Conventions: periods are strings (`2025`, `2026-Q2`, `2026-09`); countries use ISO-3 codes, aggregates keep their source codes (`EUU`, `EA21`, `WLD`); colour follows the entity, not its rank.

## Tests

    .venv/bin/pytest                      # unit and API tests (no network)
    .venv/bin/ruff check .                # lint
    npm install && npm run smoke -- http://localhost:8000   # runs every page's scripts in jsdom against a running server

The smoke test needs the server running with data loaded. It checks that every chart renders; it does not check how the pages look.

## Project layout

    app/        FastAPI app, templates, static files
    etl/        data collection and quality checks
    tests/      pytest tests; tests/smoke/ for the browser smoke test
    data/       SQLite database (not in git)
    indicators.yaml

## Documentation

- [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md): endpoints, codes and quirks of each source
- [docs/ADDING_DATA.md](docs/ADDING_DATA.md): add an indicator or a source
- [docs/DEPLOY.md](docs/DEPLOY.md): run it with Docker (`Dockerfile`, `compose.yaml`, nightly refresh)
- [docs/CHARTS.md](docs/CHARTS.md): chart catalogue, conventions, adding a chart
- [CHANGELOG.md](CHANGELOG.md): versions and known limitations

## Notes

- Sector growth is **real** growth (chain-linked volumes), not nominal.
- Eurostat replaced its HICP dataset in 2026 (ECOICOP 2); the catalogue uses `prc_hicp_minr`.
- The Destatis token is read from the environment or `.env` and never logged. `.env` is git-ignored.
- The repository contains code only, no data. The data comes from public APIs (World Bank, IMF, Eurostat, ECB, Destatis); check each provider's terms of use before redistributing the data or running a public instance.

## License

[MIT](LICENSE)
