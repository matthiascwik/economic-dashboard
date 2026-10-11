# Charts

Charts are plain D3 (vendored, no build step). Each chart type is one file in `app/static/js/charts/`; `pages/<page>.js` wires them to data.
The card markup (`app/templates/_cards.html`) provides title, controls row, plot, legend, table view and source line.

| Chart | File | Where | Shows |
|---|---|---|---|
| Choropleth map | `choropleth.js` | World, Europe | indicator by country; diverging scale for growth, one-hue for levels |
| Indexed lines | `line.js` | World, Europe | real GDP (2019 = 100), HICP inflation, industrial production |
| Bubble scatter | `scatter.js` | World | growth against inflation, 40 largest economies |
| Slope chart | `slope.js` | Europe | rank of GDP per capita, 2019 against latest |
| Diverging bars | `bars.js` | Germany | real growth by sector (quarterly) or industry branch (monthly) |
| Heatmap | `heatmap.js` | Germany | real growth by sector and year |
| Treemap | `treemap.js` | Germany | sector size (value added) coloured by growth |
| Connected scatter | `connected.js` | Germany | production against new orders over time |

## KPI tile history
Every KPI tile with data opens a dialog (`app/static/js/tiles.js`, markup in `base.html`) with the full series of its indicator as a
line chart: time on the x-axis, values on the y-axis (unit as axis title), tooltip, and a table view. IMF series continue with projections,
drawn dashed from the current year. The ECB rate is drawn as steps because it holds between decisions.
Tiles carry what the dialog needs as `data-*` attributes (set in `app/kpis.py`); the chart is `Viz.lineChart` in standalone mode
(`isolated`, `ignoreRange`, `legend: false`) and is destroyed when the dialog closes.

## Conventions
- **Colour follows the entity** (`Viz.ENTITIES` in `common.js`): Germany is always blue, the EU/euro area orange, and so on. Palette values are CSS variables in `style.css` (`--s1`..`--s8`, light and dark).
- **Diverging** (blue above zero, red below, grey at zero) for growth; **one hue** for levels. Never a rainbow, never two y-axes.
- Every chart has a **table view** (`Viz.tableView`), a **tooltip** (`Viz.tip`, text inserted via `textContent`) and an `aria-label`.
- The global **time range** (`Viz.range`, `?from=2019`) scopes time-series charts: call `Viz.range.onChange(redraw)`.
- **Linked hover:** tag marks with `data-key`, call `Viz.linkKeys(card)` once and `.call(Viz.hoverKey, d => key)` on the hover target.
  Line charts of the same frequency also share a crosshair (`Viz.link`, topic `date`).
- Charts redraw on resize and theme change through `Viz.mount`.
- A failing chart is replaced by a message through `Pages.guard(cardId, fn)`; it never breaks the rest of the page.

## Adding a chart
1. Add `<name>.js` in `charts/` exposing `Viz.<name>(card, options)`, built on `Viz.mount`, `Viz.tableView`, `Viz.tip`.
2. Add the card with `card(...)` in `scope.html` and list the script there.
3. Wire the data in the page script inside `Pages.guard`.
4. `npm run smoke -- http://localhost:8000` must stay green.
