# Data sources

All sources are public and free. Only Destatis needs a (free) token. Every client lives in `etl/<source>.py` and exposes
`fetch_series(entry, start_year, end_year)`; the catalogue entries are in `indicators.yaml`.

## World Bank Indicators API (v2) - `etl/worldbank.py`
- `https://api.worldbank.org/v2/country/all/indicator/{code}?format=json&per_page=20000&date=2010:2032`; response is `[meta, rows]`.
- Country list: `/v2/country`; entries with region id `NA` are aggregates (World, Euro area, income groups).
- Annual data only; the latest year is usually the previous calendar year.
- The API is sometimes slow or times out; `etl/http.py` retries with backoff.

## IMF DataMapper (WEO) - `etl/imf.py`
- `https://www.imf.org/external/datamapper/api/v1/{indicator}` returns every country; `/countries` and `/regions` list names.
- Includes **forecasts** up to ~2031, so KPI tiles cap the period (`cap: this_year` / `last_year` in `app/kpis.py`).
- Aggregates used: `EURO` (euro area), `WEOWORLD` (world).
- Two country codes (`ATI`, `ATL`) come without a label; the code is used as the name.

## Eurostat - `etl/eurostat.py`
- `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/{dataset}?format=JSON&sinceTimePeriod=...` (JSON-stat 2.0).
- Country codes are mapped to ISO-3 (`DE` -> `DEU`, `EL` -> `GRC`, `UK` -> `GBR`); EU/euro-area aggregates keep their codes
  (`EU27_2020`, `EA`, `EA20`, `EA21`) and are flagged as aggregates.
- **HICP:** in 2026 Eurostat moved to ECOICOP version 2. `prc_hicp_manr` ends in 2025-12; the catalogue uses
  `prc_hicp_minr` with `coicop18: TOTAL`, `unit: RCH_A`.
- Sector value added: `nama_10_a10`, chain-linked volumes (`CLV_I15`), NACE sectors from the catalogue (`nace_sectors`, labels in `nace_labels`).
  `B-E` (industry) contains `C` (manufacturing) - do not add them up.
- Only dimensions other than `geo`, `time` (and the sector) must be fixed through `params`; a cube with other multi-valued dimensions is rejected by the parser.

## ECB Data Portal - `etl/ecb.py`
- `https://data-api.ecb.europa.eu/service/data/{flow}/{key}?format=jsondata&startPeriod=...` (SDMX-JSON).
- The main refinancing rate (`FM/B.U2.EUR.4F.KR.MRR_FR.LEV`) is event based: one observation per rate decision, period = date (`2026-09-16`).

## Destatis GENESIS-Online - `etl/destatis.py`
- Base URL `https://genesis.destatis.de/genesisWS/rest/2020` (the `www-genesis` host redirects with 307).
- **Every method is a POST** with form-encoded parameters. Authentication: headers `username: <token>`, `password:` (empty).
  The token is read from `DESTATIS_TOKEN` (environment or `.env`).
- `data/tablefile` with `format=ffcsv` returns a ZIP with one flat CSV (`;`-separated).
- Errors arrive as JSON with HTTP 200 (e.g. code 98 "table too big for dialogue-processing"); the client detects non-ZIP replies and raises.
  Large tables are therefore requested in 5-year blocks (`startyear`/`endyear`).
- Missing values are `-`, `.`, `...`, `x` or empty; they are skipped.
- A catalogue entry fixes all dimensions except time and series through `params: {variable_code: attribute_code}`, plus `series_var` and `time_var`
  (`MONAT`, `QUARTG`, or none for annual tables).

| Table | Content | Used for |
|---|---|---|
| 81000-0014 | gross value added by industry, quarterly | `de_gva_quarterly` (chain index, seasonally adjusted) |
| 81000-0013 | gross value added by industry, annual | `de_gva_annual_index`, `de_gva_annual_current` |
| 42153-0001 | production index, manufacturing branches | `de_production_index` |
| 42151-0004 | new orders, volume index | `de_new_orders` |

National-accounts industries overlap (`WZ08-B-18` "Industry except construction" contains manufacturing). The Germany page uses the ten
non-overlapping top-level industries listed in `app/static/js/pages/germany.js`.

## Natural Earth (map outlines) - `app/static/data/countries.geojson`
- 110 m admin-0 countries, public domain, reduced to `iso3` and `name`. The field `ISO_A3_EH` is used (plain `ISO_A3` is `-99` for France and Norway); Kosovo is mapped to `XKX`.
