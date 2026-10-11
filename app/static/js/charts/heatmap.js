// Heatmap: rows (sectors) x columns (years), diverging colour on the value.
// values: Map(rowKey -> Map(col -> number)).
Viz.heatmap = function (card, { rows, cols: allCols, values, domain, format, valueLabel }) {
  const plot = card.querySelector(".plot");
  const ROW = 32, top = 24;
  const colsInRange = () => allCols.filter((c) => +c >= Viz.range.start);

  function draw(W) {
    const cols = colsInRange();
    const left = W < 520 ? 120 : 250;
    const cw = (W - left - 8) / cols.length, H = top + rows.length * ROW + 44;
    const scale = Viz.diverging(domain);
    const svg = d3.select(plot).selectAll("svg").data([0]).join("svg").attr("width", W).attr("height", H)
      .attr("role", "img").attr("aria-label", `${valueLabel} by sector and year (use the table view for exact values)`);
    svg.selectAll("*").remove();
    const chars = Math.floor(left / 6.4);
    cols.forEach((c, j) => {
      if (cw < 30 && j % 2) return;
      svg.append("text").attr("x", left + j * cw + cw / 2).attr("y", 14).attr("text-anchor", "middle").attr("font-size", 11).attr("fill", Viz.css("--ink-3")).text(cw < 30 ? c.slice(2) : c);
    });
    rows.forEach((r, i) => {
      svg.append("text").attr("x", left - 8).attr("y", top + i * ROW + ROW / 2 + 4).attr("text-anchor", "end").attr("font-size", 12).attr("fill", Viz.css("--ink"))
        .text(r.label.length > chars ? r.label.slice(0, chars - 1) + "…" : r.label);
      cols.forEach((c, j) => {
        const v = values.get(r.key)?.get(c);
        const fill = v == null ? Viz.css("--nodata") : scale(v);
        const g = svg.append("g").attr("data-key", r.key);
        g.append("rect").attr("x", left + j * cw).attr("y", top + i * ROW).attr("width", cw).attr("height", ROW)
          .attr("fill", fill).attr("stroke", Viz.css("--surface")).attr("stroke-width", 2);
        if (v != null && cw >= 34) {
          g.append("text").attr("x", left + j * cw + cw / 2).attr("y", top + i * ROW + ROW / 2 + 4).attr("text-anchor", "middle").attr("font-size", 11)
            .attr("fill", Viz.textOn(fill)).text(v.toFixed(1));
        }
        g.on("pointermove", (evt) => Viz.tip.show(evt, `${r.label}, ${c}`, [{ value: v == null ? "n/a" : (v > 0 ? "+" : "") + format(v), label: valueLabel }]))
          .on("pointerleave", Viz.tip.hide).call(Viz.hoverKey, () => r.key);
      });
    });
    Viz.scaleLegend(svg, { x: left, y: top + rows.length * ROW + 10, w: Math.min(220, W - left - 16), scale, domain, format, id: "heat-grad" });
  }

  Viz.mount(plot, draw);
  Viz.range.onChange(() => draw(plot.clientWidth));
  Viz.linkKeys(card);
  Viz.tableView(card, () => ({
    columns: ["Sector", ...colsInRange()],
    rows: rows.map((r) => [r.label, ...colsInRange().map((c) => { const v = values.get(r.key)?.get(c); return v == null ? null : v.toFixed(1); })]),
  }));
};
