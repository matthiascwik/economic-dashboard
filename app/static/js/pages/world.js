(() => {
  const names = Pages.countryNames();

  // --- Map -------------------------------------------------------------------------------
  Pages.guard("map", async () => {
    const METRICS = {
      gdp_growth: { label: "Real GDP growth", kind: "diverging", domain: 8, format: (v) => Viz.fmt.pct(v) },
      inflation: { label: "Inflation (consumer prices)", kind: "sequential", domain: 15, format: (v) => Viz.fmt.pct(v) },
      unemployment: { label: "Unemployment rate", kind: "sequential", domain: 20, format: (v) => Viz.fmt.pct(v) },
    };
    const mapCard = Pages.card("map");
    const map = await Viz.choropleth(mapCard, { region: "world" });
    Viz.tableView(mapCard, () => map.table());
    const nameOf = await names;
    const cache = {};
    let metric = "gdp_growth", year = "2025";
    const yearSel = Viz.select(mapCard, "Year", [], year, (v) => { year = v; showMap(); });
    Viz.select(mapCard, "Indicator", Object.entries(METRICS).map(([value, m]) => ({ value, label: m.label })), metric, (v) => { metric = v; showMap(); });
    async function showMap() {
      try {
        cache[metric] ??= Viz.byCountry(await Viz.api(`/api/indicator/${metric}?start=2010`));
        const data = cache[metric];
        const years = [...new Set([...data.values()].flatMap((m) => [...m.keys()]))].sort().reverse();
        if (!years.includes(year)) year = years[0];
        yearSel.setOptions(years.map((y) => ({ value: y, label: y })), year);
        const values = new Map();
        for (const [code, series] of data) if (series.has(year)) values.set(code, { value: series.get(year), name: nameOf.get(code) ?? code, period: year });
        map.set({ ...METRICS[metric], values });
        mapCard.querySelector(".chart-note").textContent = `${METRICS[metric].label} by country, ${year}.`;
      } catch (err) { Pages.fail("map", err); }
    }
    await showMap();
  });

  // --- Real GDP index ----------------------------------------------------------------------
  Pages.guard("gdp-index", () => Pages.gdpIndexChart("gdp-index", ["DEU", "EUU", "USA", "CHN", "WLD"]));

  // --- Growth vs inflation -----------------------------------------------------------------
  Pages.guard("scatter", async () => {
    const nameOf = await names;
    const scCard = Pages.card("scatter");
    const scatter = Viz.scatter(scCard, {
      xLabel: "Inflation", yLabel: "Real GDP growth", xFormat: (v) => Viz.fmt.pct(v, 0), yFormat: (v) => Viz.fmt.pct(v),
      sizeLabel: "GDP (US$)", sizeFormat: (v) => `$${Viz.fmt.usd(v)}`, xMax: 12,
    });
    const [growth, infl, gdp] = (await Promise.all(["gdp_growth", "inflation", "gdp_usd"].map((i) => Viz.api(`/api/indicator/${i}?start=2015`)))).map(Viz.byCountry);
    const scYears = [...new Set([...gdp.values()].flatMap((m) => [...m.keys()]))].sort().reverse();
    let scYear = scYears[0];
    function showScatter() {
      const pts = [];
      for (const code of nameOf.keys()) {
        const g = growth.get(code)?.get(scYear), i = infl.get(code)?.get(scYear), s = gdp.get(code)?.get(scYear);
        if (g != null && i != null && s != null) pts.push({ code, name: nameOf.get(code), x: i, y: g, size: s });
      }
      scatter.set(pts.sort((a, b) => b.size - a.size).slice(0, 40));
      scCard.querySelector(".chart-note").textContent = `The 40 largest economies in ${scYear}; bubble area shows GDP. Inflation above 12% is drawn at the right edge (dashed outline).`;
    }
    Viz.select(scCard, "Year", scYears.map((y) => ({ value: y, label: y })), scYear, (v) => { scYear = v; showScatter(); });
    showScatter();
  });
})();
