// Horizontal diverging bars, sorted by value. Blue = growth, red = contraction; value at the bar tip.
// Returns {set(items, note)} with items [{key, label, value}].
Viz.bars = function (card, { format, valueLabel }) {
  const plot = card.querySelector(".plot");
  let items = [];
  const ROW = 30, BAR = 14;

  // Bar from x0 to x1 with the data end (x1) rounded and the baseline end square.
  const barPath = (x0, x1, y, h) => {
    const r = Math.min(4, Math.abs(x1 - x0) / 2), s = Math.sign(x1 - x0) || 1;
    return `M${x0},${y} H${x1 - s * r} Q${x1},${y} ${x1},${y + r} V${y + h - r} Q${x1},${y + h} ${x1 - s * r},${y + h} H${x0} Z`;
  };

  function draw(W) {
    if (!items.length) return;
    const left = W < 520 ? 140 : 250, pad = 48, right = 56, top = 6;
    const H = top + items.length * ROW + 26;
    const max = Math.max(...items.map((d) => Math.abs(d.value)));
    const x = d3.scaleLinear().domain([Math.min(0, d3.min(items, (d) => d.value)), Math.max(0, d3.max(items, (d) => d.value))]).nice().range([left + pad, W - right]);
    const svg = d3.select(plot).selectAll("svg").data([0]).join("svg").attr("width", W).attr("height", H)
      .attr("role", "img").attr("aria-label", `${valueLabel} by sector (use the table view for exact values)`);
    svg.selectAll("*").remove();
    const chars = Math.floor(left / 6.4);
    const cut = (t) => (t.length > chars ? t.slice(0, chars - 1) + "…" : t);

    svg.append("g").attr("transform", `translate(0,${top + items.length * ROW})`).call(d3.axisBottom(x).ticks(5).tickFormat((v) => `${v}%`).tickSize(-items.length * ROW)).call((g) => {
      Viz.styleAxis(g); g.select(".domain").remove(); g.selectAll(".tick line").attr("stroke", Viz.css("--grid"));
    });
    items.forEach((d, i) => {
      const y = top + i * ROW + (ROW - BAR) / 2;
      const g = svg.append("g");
      g.append("path").attr("data-key", d.key).attr("d", barPath(x(0), x(d.value), y, BAR)).attr("fill", d.value >= 0 ? Viz.css("--s1") : Viz.css("--s8"));
      g.append("text").attr("x", left - 6).attr("y", y + BAR / 2 + 4).attr("text-anchor", "end").attr("font-size", 12)
        .attr("font-weight", d.highlight ? 700 : 400).attr("fill", Viz.css("--ink")).text(cut(d.label));
      g.append("text").attr("x", x(d.value) + (d.value >= 0 ? 6 : -6)).attr("y", y + BAR / 2 + 4).attr("text-anchor", d.value >= 0 ? "start" : "end")
        .attr("font-size", 12).attr("font-weight", 600).attr("fill", Viz.css("--ink")).text((d.value > 0 ? "+" : d.value < 0 ? "−" : "") + format(Math.abs(d.value)));
      g.append("rect").attr("x", 0).attr("width", W).attr("y", top + i * ROW).attr("height", ROW).attr("fill", "transparent")
        .on("pointermove", (evt) => Viz.tip.show(evt, d.label, [{ value: (d.value > 0 ? "+" : d.value < 0 ? "−" : "") + format(Math.abs(d.value)), label: valueLabel }]))
        .on("pointerleave", Viz.tip.hide).call(Viz.hoverKey, () => d.key);
    });
    svg.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", top).attr("y2", top + items.length * ROW).attr("stroke", Viz.css("--ink-3"));
  }

  Viz.mount(plot, draw);
  Viz.linkKeys(card);
  Viz.tableView(card, () => ({ columns: ["Sector", valueLabel], rows: items.map((d) => [d.label, `${d.value > 0 ? "+" : ""}${d.value.toFixed(1)}%`]) }));
  return { set(next) { items = [...next].sort((a, b) => b.value - a.value); draw(plot.clientWidth); } };
};
