// Draws a sparkline into every .spark element: muted line, accent dot on the latest point.
function drawSparklines() {
  const H = 36, PAD = 4;
  document.querySelectorAll(".spark").forEach((el) => {
    const points = JSON.parse(el.dataset.points);
    const W = el.clientWidth;
    if (points.length < 2 || !W) return;
    const x = d3.scalePoint().domain(points.map((p) => p.period)).range([PAD, W - PAD]);
    const y = d3.scaleLinear().domain(d3.extent(points, (p) => p.value)).nice(2).range([H - PAD, PAD]);
    const svg = d3.select(el).selectAll("svg").data([0]).join("svg").attr("width", W).attr("height", H).attr("aria-hidden", "true");
    svg.selectAll("*").remove();
    svg.append("path").attr("class", "spark-line")
      .attr("d", d3.line().x((p) => x(p.period)).y((p) => y(p.value)).curve(d3.curveMonotoneX)(points));
    const last = points[points.length - 1];
    svg.append("circle").attr("class", "spark-dot").attr("r", 3.5).attr("cx", x(last.period)).attr("cy", y(last.value));
  });
}
drawSparklines();
new ResizeObserver(drawSparklines).observe(document.body);
