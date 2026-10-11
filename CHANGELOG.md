# Changelog

## 0.2.1 - 2026-10-11

- Fix: the maps stayed empty on a Docker host. The packing command in the deployment guide used `tar --exclude=data`, which also dropped `app/static/data/countries.geojson` (the exclude matches at any depth). The command now lists the paths to pack explicitly.
- Deployment guide `docs/DEPLOY.md` is generic (any Docker host); update steps and a check of the geojson URL.
- MIT license added.

## 0.2.0 - 2026-10-10

- Container deployment: `Dockerfile`, `compose.yaml` (web + nightly refresh, resource-limited, low priority), `etl/schedule.py`, deployment guide. Verified on a small x86-64 home server: image build, first refresh of all 20 indicators and the dashboard pages.
- SQLite in WAL mode so the web app can read during a refresh; `DASHBOARD_DB` also controls the ETL's database path.
- KPI tiles open a history chart (full time series with axes, tooltip, table view; dashed projections for IMF series).
- Line chart: standalone mode, step curve, dashed projections, unit title; clean-up of subscriptions on destroy.

**Not yet verified:** behaviour after a reboot of the host.

## 0.1.0 - baseline (2026-10-10)

First complete version.

**Data**
- 20 indicators from the World Bank, IMF, Eurostat, ECB and Destatis (2010 onward), stored in SQLite.
- `python -m etl.run` with progress output, retry notices and a failure summary; `python -m etl.quality` for coverage, freshness and range checks.

**Dashboard**
- Pages: Overview, World, Europe, Germany, About (sources and indicator catalogue).
- KPI tiles with change against the previous period and a trend line.
- 12 charts (map, indexed lines, scatter, slope, bars, heatmap, treemap, connected scatter), a global time-range filter, linked hover, table view for every chart, light and dark theme.
- JSON API: `/api/indicators`, `/api/countries`, `/api/indicator/{id}`.

**Quality**
- 33 Python tests, `ruff` clean, jsdom smoke test of all pages.

**Known limitations**
- No container or scheduled refresh yet (a cron example is in the README).
- Layout was not checked on phones; charts were checked in jsdom and reviewed by the project owner in a desktop browser.
- The providers' terms of use are not summarised; check them before publishing the dashboard.
- Destatis branch names in the Germany page are paraphrased; "Transport equipment (vehicles)" may include more than motor vehicles.
