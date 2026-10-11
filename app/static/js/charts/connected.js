// Connected scatter: one point per month, joined in time order. points: [{date: Date, x, y}].
Viz.connected = function (card, { points: allPoints, xLabel, yLabel, ref = null, height = 400 }) {
  const plot = card.querySelector(".plot");
  const M = { top: 16, right: 24, bottom: 46, left: 54 };
  const monthFmt = d3.timeFormat("%b %Y");

  const inRange = () => allPoints.filter((p) => p.date.getFullYear() >= Viz.range.start);

  function draw(W) {
    const points = inRange();
    if (points.length < 2) return;
    const ext = (key) => d3.extent(points.map((p) => p[key]).concat(ref === null ? [] : [ref]));
    const x = d3.scaleLinear().domain(ext("x")).nice().range([M.left, W - M.right]);
    const y = d3.scaleLinear().domain(ext("y")).nice().range([height - M.bottom, M.top]);
    const svg = d3.select(plot).selectAll("svg").data([0]).join("svg").attr("width", W).attr("height", height)
      .attr("role", "img").attr("aria-label", `${yLabel} against ${xLabel} over time (use the table view for exact values)`);
    svg.selectAll("*").remove();

    svg.append("g").selectAll("line").data(y.ticks(6)).join("line").attr("x1", M.left).attr("x2", W - M.right).attr("y1", y).attr("y2", y).attr("stroke", Viz.css("--grid"));
    svg.append("g").attr("transform", `translate(0,${height - M.bottom})`).call(d3.axisBottom(x).ticks(6).tickSizeOuter(0)).call(Viz.styleAxis);
    svg.append("g").attr("transform", `translate(${M.left},0)`).call(d3.axisLeft(y).ticks(6).tickSize(0)).call((g) => { Viz.styleAxis(g); g.select(".domain").remove(); });
    if (ref !== null) {
      svg.append("line").attr("x1", x(ref)).attr("x2", x(ref)).attr("y1", M.top).attr("y2", height - M.bottom).attr("stroke", Viz.css("--ink-3")).attr("stroke-dasharray", "4 3");
      svg.append("line").attr("x1", M.left).attr("x2", W - M.right).attr("y1", y(ref)).attr("y2", y(ref)).attr("stroke", Viz.css("--ink-3")).attr("stroke-dasharray", "4 3");
    }
    svg.append("text").attr("x", (M.left + W - M.right) / 2).attr("y", height - 8).attr("text-anchor", "middle").attr("font-size", 12).attr("fill", Viz.css("--ink-2")).text(xLabel);
    svg.append("text").attr("transform", `translate(14,${(M.top + height - M.bottom) / 2}) rotate(-90)`).attr("text-anchor", "middle").attr("font-size", 12).attr("fill", Viz.css("--ink-2")).text(yLabel);

    svg.append("path").attr("d", d3.line().x((p) => x(p.x)).y((p) => y(p.y)).curve(d3.curveCatmullRom.alpha(0.5))(points))
      .attr("fill", "none").attr("stroke", Viz.css("--s1")).attr("stroke-opacity", 0.55).attr("stroke-width", 1.75).attr("stroke-linejoin", "round");
    const dots = svg.append("g").selectAll("circle").data(points).join("circle").attr("cx", (p) => x(p.x)).attr("cy", (p) => y(p.y)).attr("r", 2.5).attr("fill", Viz.css("--s1"));
    // Year markers at each January, plus the latest month.
    const marks = points.filter((p, i) => p.date.getMonth() === 0 || i === points.length - 1);
    svg.append("g").selectAll("text").data(marks).join("text").attr("x", (p) => x(p.x) + 6).attr("y", (p) => y(p.y) - 6).attr("font-size", 11)
      .attr("fill", Viz.css("--ink-2")).text((p) => (p === points[points.length - 1] ? monthFmt(p.date) : p.date.getFullYear()));
    const last = points[points.length - 1];
    svg.append("circle").attr("cx", x(last.x)).attr("cy", y(last.y)).attr("r", 5.5).attr("fill", Viz.css("--s1")).attr("stroke", Viz.css("--surface")).attr("stroke-width", 2);

    const delaunay = d3.Delaunay.from(points, (p) => x(p.x), (p) => y(p.y));
    svg.append("rect").attr("x", M.left).attr("y", M.top).attr("width", W - M.left - M.right).attr("height", height - M.top - M.bottom).attr("fill", "transparent")
      .on("pointermove", (evt) => {
        const [px, py] = d3.pointer(evt);
        const p = points[delaunay.find(px, py)];
        dots.attr("r", (q) => (q === p ? 5 : 2.5));
        Viz.tip.show(evt, monthFmt(p.date), [{ value: p.y.toFixed(1), label: yLabel }, { value: p.x.toFixed(1), label: xLabel }]);
      })
      .on("pointerleave", () => { dots.attr("r", 2.5); Viz.tip.hide(); });
  }

  Viz.mount(plot, draw);
  Viz.range.onChange(() => draw(plot.clientWidth));
  Viz.tableView(card, () => ({
    columns: ["Month", xLabel, yLabel],
    rows: [...inRange()].reverse().map((p) => [monthFmt(p.date), p.x.toFixed(1), p.y.toFixed(1)]),
  }));
};
