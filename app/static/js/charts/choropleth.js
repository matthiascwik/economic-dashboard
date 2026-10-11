// Choropleth map. Returns {set(cfg)}: cfg = {values: Map(iso3 -> {value, name, period}), kind, domain, format, label}
// kind "diverging": blue (above 0) <-> grey <-> red (below 0); kind "sequential": one-hue blue ramp.
Viz.choropleth = async function (card, { region = "world" }) {
  const plot = card.querySelector(".plot");
  const geo = await (await fetch("/static/data/countries.geojson")).json();
  let cfg = null;

  const isDark = () => document.documentElement.dataset.theme === "dark" ||
    (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);

  function scaleFor({ kind, domain }) {
    if (kind === "diverging") {
      return d3.scaleLinear().domain([-domain, 0, domain])
        .range([Viz.css("--s8"), Viz.css("--div-mid"), Viz.css("--s1")]).interpolate(d3.interpolateLab).clamp(true);
    }
    // Lightest step = lowest value; in dark mode the low end recedes toward the dark surface.
    const range = isDark() ? ["#0d366b", "#86b6ef"] : ["#cde2fb", "#184f95"];
    return d3.scaleLinear().domain([0, domain]).range(range).interpolate(d3.interpolateLab).clamp(true);
  }

  function draw(W) {
    if (!cfg) return;
    const H = region === "europe" ? Math.min(W * 0.85, 640) : W * 0.5;
    const proj = region === "europe" ? d3.geoAzimuthalEqualArea().rotate([-12, -54]) : d3.geoNaturalEarth1();
    const frame = region === "europe"
      ? { type: "MultiPoint", coordinates: [[-11, 35], [34, 35], [34, 71], [-11, 71]] }
      : { type: "Sphere" };
    proj.fitExtent([[4, 4], [W - 4, H - 4]], frame);
    const path = d3.geoPath(proj);
    const color = scaleFor(cfg);

    const svg = d3.select(plot).selectAll("svg").data([0]).join("svg").attr("width", W).attr("height", H);
    svg.selectAll("*").remove();
    svg.attr("role", "img").attr("aria-label", `${cfg.label} by country (use the table view for exact values)`);
    svg.append("defs").append("clipPath").attr("id", `clip-${region}`).append("rect").attr("width", W).attr("height", H);
    const g = svg.append("g").attr("clip-path", `url(#clip-${region})`);

    g.selectAll("path").data(geo.features.filter((f) => f.properties.iso3 !== "ATA")).join("path")
      .attr("d", path)
      .attr("fill", (f) => { const v = cfg.values.get(f.properties.iso3); return v ? color(v.value) : Viz.css("--nodata"); })
      .attr("stroke", Viz.css("--surface")).attr("stroke-width", 0.6)
      .on("pointermove", function (evt, f) {
        const v = cfg.values.get(f.properties.iso3);
        d3.select(this).attr("stroke", Viz.css("--ink")).attr("stroke-width", 1.5).raise();
        Viz.tip.show(evt, f.properties.name, [v
          ? { value: cfg.format(v.value), label: v.period }
          : { value: "No data", label: "" }]);
      })
      .on("pointerleave", function () { d3.select(this).attr("stroke", Viz.css("--surface")).attr("stroke-width", 0.6); Viz.tip.hide(); });

    // Scale legend: gradient bar with the end values labelled.
    const lw = Math.min(220, W - 24), lx = 12, ly = H - 22;
    const grad = svg.append("defs").append("linearGradient").attr("id", `grad-${region}`);
    const stops = cfg.kind === "diverging" ? d3.range(-1, 1.01, 0.25).map((t) => t * cfg.domain) : d3.range(0, 1.01, 0.25).map((t) => t * cfg.domain);
    stops.forEach((v, i) => grad.append("stop").attr("offset", `${(i / (stops.length - 1)) * 100}%`).attr("stop-color", color(v)));
    svg.append("rect").attr("x", lx).attr("y", ly).attr("width", lw).attr("height", 8).attr("rx", 4).attr("fill", `url(#grad-${region})`);
    const ends = cfg.kind === "diverging" ? [stops[0], 0, stops[stops.length - 1]] : [0, cfg.domain];
    const lx2 = d3.scaleLinear().domain([stops[0], stops[stops.length - 1]]).range([lx, lx + lw]);
    svg.selectAll(".lt").data(ends).join("text").attr("x", lx2).attr("y", ly + 22).attr("text-anchor", "middle").attr("font-size", 11)
      .attr("fill", Viz.css("--ink-3")).text((v, i) => (i === ends.length - 1 && cfg.kind !== "diverging" ? "≥" : i === 0 && cfg.kind === "diverging" ? "≤" : i === 2 ? "≥" : "") + cfg.format(v));
  }

  Viz.mount(plot, draw);
  return {
    set(next) { cfg = next; draw(plot.clientWidth); },
    table() {
      const rows = [...cfg.values.entries()].sort((a, b) => b[1].value - a[1].value).map(([, v]) => [v.name, cfg.format(v.value), v.period]);
      return { columns: ["Country", cfg.label, "Period"], rows };
    },
  };
};
