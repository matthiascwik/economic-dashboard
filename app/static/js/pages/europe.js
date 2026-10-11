(() => {
  const names = Pages.countryNames();
  const recent = `${new Date().getFullYear() - 1}-01`; // enough months to find the latest per country

  // --- Map -------------------------------------------------------------------------------
  Pages.guard("map", async () => {
    const METRICS = {
      hicp_inflation: { label: "Inflation (HICP), latest month", kind: "sequential", domain: 8, monthly: true },
      unemployment_monthly: { label: "Unemployment rate, latest month", kind: "sequential", domain: 15, monthly: true },
      gdp_growth: { label: "Real GDP growth", kind: "diverging", domain: 6, monthly: false },
    };
    const mapCard = Pages.card("map");
    const map = await Viz.choropleth(mapCard, { region: "europe" });
    Viz.tableView(mapCard, () => map.table());
    const nameOf = await names;
    const cache = {};
    let metric = "hicp_inflation", year = "2025";
    const yearSel = Viz.select(mapCard, "Year", [], year, (v) => { year = v; showMap(); });
    const yearCtl = yearSel.el.closest(".control");
    Viz.select(mapCard, "Indicator", Object.entries(METRICS).map(([value, m]) => ({ value, label: m.label })), metric, (v) => { metric = v; showMap(); });
    async function showMap() {
      try {
        const m = METRICS[metric];
        cache[metric] ??= Viz.byCountry(await Viz.api(`/api/indicator/${metric}?start=${m.monthly ? recent : 2010}`));
        const data = cache[metric];
        yearCtl.hidden = m.monthly;
        const values = new Map();
        if (m.monthly) {
          for (const [code, series] of data) {
            const last = [...series.keys()].sort().at(-1);
            if (last) values.set(code, { value: series.get(last), name: nameOf.get(code) ?? code, period: last });
          }
        } else {
          const years = [...new Set([...data.values()].flatMap((s) => [...s.keys()]))].sort().reverse();
          if (!years.includes(year)) year = years[0];
          yearSel.setOptions(years.map((y) => ({ value: y, label: y })), year);
          for (const [code, series] of data) if (series.has(year)) values.set(code, { value: series.get(year), name: nameOf.get(code) ?? code, period: year });
        }
        map.set({ ...m, values, format: (v) => Viz.fmt.pct(v) });
        mapCard.querySelector(".chart-note").textContent = m.monthly ? `${m.label}; grey countries have no data.` : `${m.label} by country, ${year}.`;
      } catch (err) { Pages.fail("map", err); }
    }
    await showMap();
  });

  // --- Real GDP index ----------------------------------------------------------------------
  Pages.guard("gdp-index", () => Pages.gdpIndexChart("gdp-index", ["DEU", "EUU", "FRA", "ITA", "ESP", "POL"]));

  // --- Inflation ---------------------------------------------------------------------------
  Pages.guard("hicp", async () => {
    const codes = ["DEU", "EA", "FRA", "ITA", "ESP"];
    Viz.lineChart(Pages.card("hicp"), {
      series: Pages.linesFromApi(await Viz.api(`/api/indicator/hicp_inflation?countries=${codes.join(",")}&start=2010-01`), codes),
      yFormat: (v) => Viz.fmt.pct(v, 0), monthly: true, ref: 0,
    });
  });

  // --- Industrial production ---------------------------------------------------------------
  Pages.guard("industry", async () => {
    const codes = ["DEU", "EA21", "FRA", "ITA", "ESP"];
    Viz.lineChart(Pages.card("industry"), {
      series: Pages.linesFromApi(await Viz.api(`/api/indicator/industrial_production?countries=${codes.join(",")}&start=2010-01`), codes),
      yFormat: (v) => v.toFixed(0), monthly: true, ref: 100,
    });
  });

  // --- Rank of GDP per capita --------------------------------------------------------------
  Pages.guard("rank", async () => {
    const codes = ["DEU", "FRA", "ITA", "ESP", "NLD", "POL", "SWE", "AUT", "CHE", "GBR"];
    const pc = Viz.byCountry(await Viz.api(`/api/indicator/gdp_per_capita_ppp?countries=${codes.join(",")}&start=2019`));
    const last = [...pc.get("DEU").keys()].sort().at(-1);
    Viz.slope(Pages.card("rank"), {
      items: codes.filter((c) => pc.get(c)?.has("2019") && pc.get(c)?.has(last)).map((c) => ({ code: c, name: Viz.name(c), a: pc.get(c).get("2019"), b: pc.get(c).get(last) })),
      labelA: "2019", labelB: last, format: (v) => `$${Math.round(v / 100) / 10}k`, valueLabel: "GDP per capita, PPP",
    });
  });
})();
