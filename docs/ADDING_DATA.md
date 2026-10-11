# Adding data

## A new indicator from an existing source
1. Add an entry to the right section of `indicators.yaml` (`world`, `europe`, `sectors`, `germany`): `id`, `name`, `unit`, `source`, `code`,
   plus `params` (and `series_var`/`time_var` for Destatis, `nace_sectors` for Eurostat breakdowns). Optional `range: [lo, hi]` is checked by `etl.quality`.
2. `python -m etl.run <id>` and `python -m etl.quality`.
3. The indicator is now available at `/api/indicator/<id>` and listed on the About page.
4. For a KPI tile add a spec to `app/kpis.py` (`SPECS`); for a chart see [CHARTS.md](CHARTS.md).

Stored ids: a series with a breakdown is saved as `<id>:<series>` (e.g. `gva_volume_index:C`); the API groups these again by country and series.

## A new source
1. Create `etl/<source>.py` with `fetch_series(entry, start_year, end_year)` returning rows
   `{"country", "period", "value"[, "series"]}` - or `(rows, {series: label})` to supply readable names.
   Periods are strings (`2025`, `2026-Q2`, `2026-09`); use ISO-3 country codes where possible.
   A source without a country list adds `country_name` and `is_aggregate` to its rows; otherwise implement `fetch_countries()`.
2. Use `etl.http.get_json` / `post_bytes` for retries and the shared retry notices.
3. Register the module in `SOURCES` in `etl/run.py` and the display name in `SOURCE_NAMES` in `app/kpis.py`.
4. Add a parser test with a small inline sample (see `tests/test_etl_europe.py`) - no network in unit tests.

## Refresh and checks
- `python -m etl.run` replaces each indicator with the latest published revision.
- `python -m etl.quality` reports missing data, no data for Germany, stale series and out-of-range values.
