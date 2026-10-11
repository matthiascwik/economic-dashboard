// Bubble scatter: x/y values per country, area = size. Germany is highlighted, all others share one muted hue.
// points: [{code, name, x, y, size}]
Viz.scatter = function (card, { xLabel, yLabel, xFormat, yFormat, sizeLabel, sizeFormat, xMax = Infinity, height = 420 }) {
  const plot = card.querySelector(".plot");
  let points = [];
  const M = { top: 16, right: 20, bottom: 46, left: 54 };

  function draw(W) {
    if (!points.length) return;
    // Values beyond xMax are pinned to the right edge (drawn with a dashed outline) so one outlier cannot squash the rest.
    const clipped = (p) => p.x > xMax;
    const px = (p) => Math.min(p.x, xMax);
    const x = d3.scaleLinear().domain(d3.extent(points, px)).nice().range([M.left, W - M.right]);
    const y = d3.scaleLinear().domain(d3.extent(points, (p) => p.y)).nice().range([height - M.bottom, M.top]);
    const r = d3.scaleSqrt().domain([0, d3.max(points, (p) => p.size)]).range([3, W < 520 ? 22 : 34]);

    const svg = d3.select(plot).selectAll("svg").data([0]).join("svg").attr("width", W).attr("height", height)
      .attr("role", "img").attr("aria-label", `${yLabel} against ${xLabel} (use the table view for exact values)`);
    svg.selectAll("*").remove();

    svg.append("g").selectAll("line").data(y.ticks(6)).join("line").attr("x1", M.left).attr("x2", W - M.right)
      .attr("y1", y).attr("y2", y).attr("stroke", Viz.css("--grid"));
    if (y.domain()[0] < 0) svg.append("line").attr("x1", M.left).attr("x2", W - M.right).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", Viz.css("--ink-3")).attr("stroke-dasharray", "4 3");
    svg.append("g").attr("transform", `translate(0,${height - M.bottom})`).call(d3.axisBottom(x).ticks(6).tickFormat(xFormat).tickSizeOuter(0)).call(Viz.styleAxis);
    svg.append("g").attr("transform", `translate(${M.left},0)`).call(d3.axisLeft(y).ticks(6).tickFormat(yFormat).tickSize(0)).call((g) => { Viz.styleAxis(g); g.select(".domain").remove(); });
    svg.append("text").attr("x", (M.left + W - M.right) / 2).attr("y", height - 8).attr("text-anchor", "middle").attr("font-size", 12).attr("fill", Viz.css("--ink-2")).text(xLabel);
    svg.append("text").attr("transform", `translate(14,${(M.top + height - M.bottom) / 2}) rotate(-90)`).attr("text-anchor", "middle").attr("font-size", 12).attr("fill", Viz.css("--ink-2")).text(yLabel);

    // Big bubbles first so small ones stay hoverable; Germany last so it is never covered.
    const sorted = [...points].sort((a, b) => (a.code === "DEU") - (b.code === "DEU") || b.size - a.size);
    const dot = svg.append("g").selectAll("circle").data(sorted).join("circle")
      .attr("cx", (p) => x(px(p))).attr("cy", (p) => y(p.y)).attr("r", (p) => r(p.size))
      .attr("fill", Viz.css("--s1"))
      .attr("fill-opacity", (p) => (p.code === "DEU" ? 1 : 0.22))
      .attr("stroke", (p) => (p.code === "DEU" ? Viz.css("--surface") : Viz.css("--s1"))).attr("stroke-width", (p) => (p.code === "DEU" ? 2 : 1))
      .attr("stroke-dasharray", (p) => (clipped(p) ? "3 2" : null));

    // Direct labels for the largest economies and Germany only.
    const labelled = new Set([...points].sort((a, b) => b.size - a.size).slice(0, 6).map((p) => p.code).concat("DEU"));
    svg.append("g").selectAll("text").data(sorted.filter((p) => labelled.has(p.code))).join("text")
      .attr("x", (p) => x(px(p))).attr("y", (p) => y(p.y) - r(p.size) - 4).attr("text-anchor", "middle").attr("font-size", 11)
      .attr("fill", Viz.css("--ink-2")).text((p) => p.name);

    // Nearest-point hover: the pointer only needs to be closest, not dead-centre.
    const delaunay = d3.Delaunay.from(points, (p) => x(px(p)), (p) => y(p.y));
    svg.append("rect").attr("x", M.left).attr("y", M.top).attr("width", W - M.left - M.right).attr("height", height - M.top - M.bottom).attr("fill", "transparent")
      .on("pointermove", (evt) => {
        const [px, py] = d3.pointer(evt);
        const p = points[delaunay.find(px, py)];
        dot.attr("stroke-width", (q) => (q === p ? 3 : q.code === "DEU" ? 2 : 1)).attr("stroke", (q) => (q === p ? Viz.css("--ink") : q.code === "DEU" ? Viz.css("--surface") : Viz.css("--s1")));
        Viz.tip.show(evt, p.name, [
          { value: yFormat(p.y), label: yLabel }, { value: xFormat(p.x), label: xLabel }, { value: sizeFormat(p.size), label: sizeLabel },
        ]);
      })
      .on("pointerleave", () => { draw(W); Viz.tip.hide(); });
  }

  Viz.mount(plot, draw);
  Viz.tableView(card, () => ({
    columns: ["Country", yLabel, xLabel, sizeLabel],
    rows: [...points].sort((a, b) => b.size - a.size).map((p) => [p.name, yFormat(p.y), xFormat(p.x), sizeFormat(p.size)]),
  }));
  return { set(next) { points = next; draw(plot.clientWidth); } };
};
