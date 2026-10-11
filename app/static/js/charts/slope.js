// Slope chart of rank between two periods. items: [{code, name, a, b}] (values at the two periods).
// Rows are ordered by rank (not value) so labels never collide; the value sits in each label.
Viz.slope = function (card, { items, labelA, labelB, format, valueLabel }) {
  const plot = card.querySelector(".plot");
  const rank = (key) => new Map([...items].sort((p, q) => q[key] - p[key]).map((it, i) => [it.code, i]));
  const ra = rank("a"), rb = rank("b");
  const ROW = 30, M = { top: 34, bottom: 10 };

  function draw(W) {
    const H = M.top + items.length * ROW + M.bottom;
    const labelW = W < 520 ? 110 : 150, xa = labelW, xb = W - labelW;
    const y = (i) => M.top + i * ROW + ROW / 2;
    const svg = d3.select(plot).selectAll("svg").data([0]).join("svg").attr("width", W).attr("height", H)
      .attr("role", "img").attr("aria-label", `Rank of ${valueLabel}, ${labelA} against ${labelB} (use the table view for exact values)`);
    svg.selectAll("*").remove();
    for (const [x, t, anchor] of [[xa, labelA, "end"], [xb, labelB, "start"]]) {
      svg.append("text").attr("x", x + (anchor === "end" ? 6 : -6)).attr("y", 16).attr("text-anchor", anchor).attr("font-size", 12).attr("font-weight", 600).attr("fill", Viz.css("--ink-2")).text(t);
    }
    const hl = (it) => it.code === "DEU";
    // Draw Germany last so its line sits on top.
    for (const it of [...items].sort((p, q) => hl(p) - hl(q))) {
      const g = svg.append("g").style("cursor", "default");
      g.append("line").attr("x1", xa + 12).attr("x2", xb - 12).attr("y1", y(ra.get(it.code))).attr("y2", y(rb.get(it.code)))
        .attr("stroke", hl(it) ? Viz.css("--s1") : Viz.css("--ink-3")).attr("stroke-opacity", hl(it) ? 1 : 0.5).attr("stroke-width", hl(it) ? 3 : 1.5).attr("stroke-linecap", "round");
      for (const [x, v, anchor, rk] of [[xa, it.a, "end", ra], [xb, it.b, "start", rb]]) {
        g.append("circle").attr("cx", x + (anchor === "end" ? 12 : -12)).attr("cy", y(rk.get(it.code))).attr("r", 4)
          .attr("fill", hl(it) ? Viz.css("--s1") : Viz.css("--ink-3")).attr("stroke", Viz.css("--surface")).attr("stroke-width", 2);
        g.append("text").attr("x", x + (anchor === "end" ? 0 : 0)).attr("y", y(rk.get(it.code)) + 4).attr("text-anchor", anchor).attr("font-size", 12)
          .attr("font-weight", hl(it) ? 700 : 400).attr("fill", Viz.css("--ink")).text(`${it.name}  ${format(v)}`);
      }
      g.append("rect").attr("x", xa).attr("width", xb - xa).attr("y", Math.min(y(ra.get(it.code)), y(rb.get(it.code))) - 10)
        .attr("height", Math.abs(y(ra.get(it.code)) - y(rb.get(it.code))) + 20).attr("fill", "transparent")
        .on("pointermove", (evt) => Viz.tip.show(evt, it.name, [
          { value: `#${ra.get(it.code) + 1} → #${rb.get(it.code) + 1}`, label: "rank" },
          { value: format(it.a), label: labelA }, { value: format(it.b), label: labelB },
        ])).on("pointerleave", Viz.tip.hide);
    }
  }
  Viz.mount(plot, draw);
  Viz.tableView(card, () => ({
    columns: ["Country", `${labelA} (${valueLabel})`, `${labelB} (${valueLabel})`, `Rank ${labelA}`, `Rank ${labelB}`],
    rows: [...items].sort((p, q) => rb.get(p.code) - rb.get(q.code)).map((it) => [it.name, format(it.a), format(it.b), ra.get(it.code) + 1, rb.get(it.code) + 1]),
  }));
};
