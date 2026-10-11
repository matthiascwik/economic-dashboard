(async () => {
  // Non-overlapping top-level industries of the national accounts, in display names.
  const SECTORS = {
    "WZ08-A": "Agriculture, forestry, fishing",
    "WZ08-B-18": "Industry (manufacturing, energy, mining)",
    "WZ08-F": "Construction",
    "WZ08-G-01": "Trade, transport, hospitality",
    "WZ08-J": "Information and communication",
    "WZ08-K": "Finance and insurance",
    "WZ08-L": "Real estate",
    "WZ08-M-02": "Business services",
    "WZ08-O-03": "Public services, education, health",
    "WZ08-R-02": "Other services",
  };
  const BRANCHES = {
    "WZ08-26-01": "Computers, electronics, electrical equipment",
    "WZ08-30-01": "Other transport equipment (aerospace, rail, ships)",
    "WZ08-D": "Energy supply",
    "WZ08-31-02": "Furniture and other manufacturing",
    "WZ08-10-02": "Food and beverages",
    "WZ08-24-01": "Metals and metal products",
    "WZ08-22-01": "Rubber, plastics, minerals",
    "WZ08-29-01": "Transport equipment (vehicles)",
    "WZ08-20-02": "Chemicals and pharmaceuticals",
    "WZ08-16-01": "Wood, paper, printing",
    "WZ08-13-02": "Textiles and leather",
    "WZ08-B": "Mining and quarrying",
  };
  const sectorCodes = Object.keys(SECTORS);

  // indicator -> Map(series code -> Map(period -> value))
  async function load(indicator, codes) {
    const r = await Viz.api(`/api/indicator/${indicator}?series=${codes.join(",")}`);
    return new Map(r.series.map((s) => [s.series, new Map(s.points.map((p) => [p.period, p.value]))]));
  }
  const pct = (v) => `${v.toFixed(1)}%`;
  const latest = (m) => [...m.keys()].sort().at(-1);
  // Same period one year earlier: "2026-Q2" -> "2025-Q2", "2026-08" -> "2025-08".
  const yearBefore = (p) => `${+p.slice(0, 4) - 1}${p.slice(4)}`;
  const yoy = (series, period) => (series.get(period) / series.get(yearBefore(period)) - 1) * 100;

  let annualIdx, annualCur, quarterly, production, orders;
  try {
    [annualIdx, annualCur, quarterly, production, orders] = await Promise.all([
      load("de_gva_annual_index", sectorCodes),
      load("de_gva_annual_current", sectorCodes),
      load("de_gva_quarterly", sectorCodes),
      load("de_production_index", [...Object.keys(BRANCHES), "WZ08-C"]),
      load("de_new_orders", ["WZ08-C"]),
    ]);
  } catch (err) {
    ["bars", "heatmap", "treemap", "connected"].forEach((id) => Pages.fail(id, err));
    return;
  }

  // --- Bars: where is real growth right now? -----------------------------------------------
  Pages.guard("bars", () => {
  const barsCard = Pages.card("bars");
  const bars = Viz.bars(barsCard, { format: pct, valueLabel: "Change on a year earlier" });
  const VIEWS = {
    sectors: () => {
      const q = latest(quarterly.get("WZ08-A"));
      bars.set(sectorCodes.map((c) => ({ key: c, label: SECTORS[c], value: yoy(quarterly.get(c), q) })));
      barsCard.querySelector(".chart-note").textContent = `Real gross value added, ${q} against ${yearBefore(q)} (seasonally adjusted, price-adjusted).`;
    },
    manufacturing: () => {
      const m = latest(production.get("WZ08-C"));
      const total = yoy(production.get("WZ08-C"), m);
      bars.set(Object.keys(BRANCHES).map((c) => ({ key: c, label: BRANCHES[c], value: yoy(production.get(c), m) })));
      barsCard.querySelector(".chart-note").textContent = `Production, ${m} against ${yearBefore(m)} (calendar and seasonally adjusted). Total manufacturing: ${total > 0 ? "+" : "−"}${Math.abs(total).toFixed(1)}%.`;
    },
  };
  Viz.select(barsCard, "View", [{ value: "sectors", label: "Economic sectors (quarterly)" }, { value: "manufacturing", label: "Industry branches (monthly)" }], "sectors", (v) => VIEWS[v]());
  VIEWS.sectors();
  });

  // --- Heatmap: sector x year ----------------------------------------------------------------
  const years = [...annualIdx.get("WZ08-A").keys()].sort();
  const growth = new Map(sectorCodes.map((c) => [c, new Map(years.slice(1).map((y) => [y, (annualIdx.get(c).get(y) / annualIdx.get(c).get(String(+y - 1)) - 1) * 100]))]));
  const since2019 = (c) => annualIdx.get(c).get(years.at(-1)) / annualIdx.get(c).get("2019");
  Pages.guard("heatmap", () => Viz.heatmap(Pages.card("heatmap"), {
    rows: [...sectorCodes].sort((a, b) => since2019(b) - since2019(a)).map((c) => ({ key: c, label: SECTORS[c] })),
    cols: years.slice(1).filter((y) => +y >= 2011), values: growth, domain: 6, format: pct, valueLabel: "Real growth",
  }));
  Pages.card("heatmap").querySelector(".chart-note").textContent = `Annual change in real gross value added; rows ordered by growth since 2019 (${years.at(-1)} is the latest year).`;

  // --- Treemap: size of each sector, coloured by growth ------------------------------------
  const ty = years.at(-1);
  Pages.guard("treemap", () => Viz.treemap(Pages.card("treemap"), {
    items: sectorCodes.map((c) => ({ key: c, label: SECTORS[c], size: annualCur.get(c).get(ty), growth: growth.get(c).get(ty) })),
    sizeFormat: (v) => `€${v.toFixed(0)} bn`, growthFormat: (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`,
    sizeLabel: "Gross value added", growthLabel: "Real growth", domain: 5,
  }));
  Pages.card("treemap").querySelector(".chart-note").textContent = `Tile area: gross value added in ${ty}. Colour: real growth in ${ty}.`;

  // --- Connected scatter: production vs new orders ------------------------------------------
  const prod = production.get("WZ08-C"), ord = orders.get("WZ08-C");
  Pages.guard("connected", () => Viz.connected(Pages.card("connected"), {
    points: [...prod.keys()].filter((p) => ord.has(p)).sort().map((p) => ({ date: Viz.toDate(p), x: prod.get(p), y: ord.get(p) })),
    xLabel: "Production, manufacturing (2021 = 100)", yLabel: "New orders, volume (2021 = 100)", ref: 100,
  }));
})().catch((err) => ["bars", "heatmap", "treemap", "connected"].forEach((id) => Pages.fail(id, err)));
