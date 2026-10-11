// KPI tiles open a dialog with the full history of their series (x = time, y = value).
(function () {
  const dialog = document.getElementById("tile-dialog");
  if (!dialog) return;
  const card = dialog.querySelector(".chart-card");
  const title = card.querySelector("h2");
  title.id = "tile-dialog-title";
  const note = card.querySelector(".chart-note");
  const plot = card.querySelector(".plot");
  const source = card.querySelector(".chart-foot .muted");
  let chart = null;

  const closeChart = () => { chart?.destroy(); chart = null; };
  dialog.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); }); // click on the backdrop
  dialog.addEventListener("close", () => { closeChart(); Viz.tip.host(document.body); });

  function resetTableView() {
    card.querySelector(".table-wrap").hidden = true;
    plot.hidden = false;
    card.querySelector(".table-toggle").textContent = "View as table";
  }

  async function open(tile) {
    const d = tile.dataset;
    closeChart();
    resetTableView();
    title.textContent = d.label;
    note.textContent = "Loading…";
    source.textContent = `Source: ${d.source}`;
    plot.replaceChildren();
    Viz.tip.host(dialog);
    dialog.showModal();
    try {
      const resp = await Viz.api(`/api/indicator/${d.indicator}?countries=${encodeURIComponent(d.country)}`);
      const points = resp.series[0].points.map((p) => ({ x: Viz.toDate(p.period), value: p.value, period: p.period }));
      const len = points[0].period.length; // 4 = annual, 7 = monthly, 10 = event dates
      const pct = d.fmt === "pct";
      const fmt = (v) => (pct ? `${+v.toFixed(1)}%` : String(+v.toFixed(1)));
      const forecastFrom = d.forecastFrom ? new Date(+d.forecastFrom, 0, 1) : null;
      const hasProjection = forecastFrom && points.some((p) => p.x >= forecastFrom);
      note.textContent = `${points[0].period} to ${points.at(-1).period}` + (hasProjection ? `. Dashed line: IMF projections from ${d.forecastFrom}.` : "");
      chart = Viz.lineChart(card, {
        series: [{ key: d.country, label: d.label, color: Viz.color(d.country), points }],
        yFormat: fmt, yTitle: d.unit, monthly: len === 7, dateFormat: len === 10 ? "%d %b %Y" : null,
        step: d.indicator === "ecb_main_rate", dashFrom: hasProjection ? forecastFrom : null,
        ref: pct && d3.min(points, (p) => p.value) < 0 ? 0 : null,
        isolated: true, ignoreRange: true, legend: false, height: 360,
      });
    } catch (err) {
      console.error("History chart failed:", err);
      note.textContent = "";
      plot.replaceChildren(Object.assign(document.createElement("p"), { className: "chart-error", textContent: "The history could not be loaded." }));
    }
  }

  document.querySelectorAll(".tile-clickable").forEach((tile) => {
    tile.addEventListener("click", () => open(tile));
    tile.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(tile); }
    });
  });
})();
