// Multi-series line chart with a snapping crosshair and one tooltip listing every series.
// series: [{key, label, color, points: [{x: Date, value}]}]; monthly toggles the date format.
// Respects the global time range; crosshairs of charts with the same frequency move together.
// Options for a standalone chart (e.g. the KPI tile dialog): isolated (no cross-chart links), ignoreRange, legend: false,
// dateFormat (d3 time format), step (rates that hold between decisions), dashFrom (Date: dashed line from there on, for
// projections), yTitle (unit label above the axis). Returns {destroy()}.
Viz.lineChart = function (card, {
  series, yFormat, monthly = false, ref = null, height = 340,
  isolated = false, ignoreRange = false, legend = true, dateFormat = null, step = false, dashFrom = null, yTitle = null,
}) {
  if (!series.length) throw new Error("No data for this chart");
  const plot = card.querySelector(".plot");
  const hidden = new Set();
  const dateFmt = d3.timeFormat(dateFormat || (monthly ? "%b %Y" : "%Y"));
  const M = { top: yTitle ? 30 : 12, right: 16, bottom: 28, left: 46 };
  const inRange = (d) => ignoreRange || new Date(d).getFullYear() >= Viz.range.start;
  let cursor = null; // index into the visible dates, for keyboard navigation
  let mark = () => {}; // draws the crosshair at a date (set on each redraw)

  const visible = () => series.filter((s) => !hidden.has(s.key));
  const allDates = [...new Set(series.flatMap((s) => s.points.map((p) => +p.x)))].sort((a, b) => a - b);
  const datesInRange = () => allDates.filter(inRange);

  function draw(W) {
    const vis = visible();
    const dates = datesInRange();
    const x = d3.scaleTime().domain(d3.extent(dates)).range([M.left, W - M.right]);
    const shown = (s) => s.points.filter((p) => inRange(p.x));
    const all = vis.flatMap((s) => shown(s).map((p) => p.value)).concat(ref === null ? [] : [ref]);
    const y = d3.scaleLinear().domain(d3.extent(all)).nice().range([height - M.bottom, M.top]);

    const svg = d3.select(plot).selectAll("svg").data([0]).join("svg")
      .attr("width", W).attr("height", height).attr("tabindex", 0)
      .attr("role", "img").attr("aria-label", card.querySelector("h2").textContent + " (use the table view for exact values)");
    svg.selectAll("*").remove();

    svg.append("g").selectAll("line").data(y.ticks(5)).join("line")
      .attr("x1", M.left).attr("x2", W - M.right).attr("y1", y).attr("y2", y).attr("stroke", Viz.css("--grid"));
    svg.append("g").attr("transform", `translate(0,${height - M.bottom})`).call(d3.axisBottom(x).ticks(W < 520 ? 4 : 8).tickSizeOuter(0)).call(Viz.styleAxis);
    svg.append("g").attr("transform", `translate(${M.left},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(yFormat).tickSize(0)).call((g) => { Viz.styleAxis(g); g.select(".domain").remove(); });
    if (ref !== null) {
      svg.append("line").attr("x1", M.left).attr("x2", W - M.right).attr("y1", y(ref)).attr("y2", y(ref))
        .attr("stroke", Viz.css("--ink-3")).attr("stroke-dasharray", "4 3");
    }

    const line = d3.line().x((p) => x(p.x)).y((p) => y(p.value)).curve(step ? d3.curveStepAfter : d3.curveMonotoneX);
    for (const s of vis) {
      const pts = shown(s);
      // Projections are drawn dashed; the last actual point joins the two parts.
      const cut = dashFrom ? pts.findIndex((p) => p.x >= dashFrom) : -1;
      const parts = cut < 0 ? [[pts, null]] : [[pts.slice(0, cut), null], [pts.slice(Math.max(0, cut - 1)), "5 4"]];
      for (const [part, dash] of parts) {
        if (part.length < 2) continue;
        svg.append("path").attr("d", line(part)).attr("fill", "none").attr("stroke", s.color).attr("data-key", s.key)
          .attr("stroke-width", s.key === "DEU" ? 2.5 : 2).attr("stroke-linejoin", "round").attr("stroke-linecap", "round").attr("stroke-dasharray", dash);
      }
    }
    if (yTitle) svg.append("text").attr("x", M.left).attr("y", 14).attr("font-size", 12).attr("fill", Viz.css("--ink-2")).text(yTitle);

    const cross = svg.append("line").attr("y1", M.top).attr("y2", height - M.bottom).attr("stroke", Viz.css("--ink-3")).attr("stroke-width", 1).style("display", "none");
    const dots = svg.append("g");
    // Crosshair and dots at `date`; returns the tooltip rows for that date.
    mark = (date) => {
      dots.selectAll("*").remove();
      if (date == null) { cross.style("display", "none"); return []; }
      const rows = [];
      for (const s of vis) {
        const p = s.points.find((q) => +q.x === +date);
        if (!p) continue;
        rows.push({ color: s.color, value: yFormat(p.value), label: s.label });
        dots.append("circle").attr("cx", x(p.x)).attr("cy", y(p.value)).attr("r", 4).attr("fill", s.color).attr("stroke", Viz.css("--surface")).attr("stroke-width", 2);
      }
      cross.attr("x1", x(date)).attr("x2", x(date)).style("display", null);
      return rows;
    };
    const show = (evt, date) => {
      Viz.tip.show(evt, dateFmt(date), mark(date));
      if (!isolated) Viz.link.emit("date", { monthly, date: +date }, card);
    };
    const clear = () => { mark(null); Viz.tip.hide(); if (!isolated) Viz.link.emit("date", null, card); };

    const bisect = d3.bisector((d) => d).center;
    svg.append("rect").attr("x", M.left).attr("y", M.top).attr("width", W - M.left - M.right).attr("height", height - M.top - M.bottom)
      .attr("fill", "transparent")
      .on("pointermove", (evt) => { cursor = bisect(dates, x.invert(d3.pointer(evt)[0])); show(evt, new Date(dates[cursor])); })
      .on("pointerleave", clear);
    svg.on("keydown", (evt) => {
      if (evt.key !== "ArrowLeft" && evt.key !== "ArrowRight") return;
      evt.preventDefault();
      cursor = Math.max(0, Math.min(dates.length - 1, (cursor ?? dates.length - 1) + (evt.key === "ArrowRight" ? 1 : -1)));
      const r = svg.node().getBoundingClientRect();
      show({ clientX: r.left + x(dates[cursor]), clientY: r.top + height / 2 }, new Date(dates[cursor]));
    }).on("blur", clear);
  }

  let run = () => {};
  if (legend) Viz.legend(card.querySelector(".legend"), series, (h) => { hidden.clear(); h.forEach((k) => hidden.add(k)); run(); });
  run = Viz.mount(plot, draw);
  const disposers = [run.dispose];
  if (!ignoreRange) disposers.push(Viz.range.onChange(run));
  if (!isolated) {
    disposers.push(Viz.linkKeys(card));
    // Other time-series charts of the same frequency show a crosshair at the same date (no tooltip).
    disposers.push(Viz.link.on((topic, v, source) => {
      if (topic !== "date" || source === card) return;
      mark(v && v.monthly === monthly ? new Date(v.date) : null);
    }));
  }

  Viz.tableView(card, () => ({
    columns: ["Period", ...series.map((s) => s.label)],
    rows: datesInRange().map((d) => [dateFmt(new Date(d)), ...series.map((s) => {
      const p = s.points.find((q) => +q.x === d);
      return p ? yFormat(p.value) : null;
    })]),
  }));
  return { destroy() { disposers.forEach((f) => f()); Viz.tip.hide(); } };
};
