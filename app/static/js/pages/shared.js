// Helpers used by the world and europe pages.
const Pages = {
  card: (id) => document.getElementById(id),

  // Replace a chart with a short message when it cannot be built (API error, missing data).
  fail(cardId, err) {
    console.error(`Chart "${cardId}" failed:`, err);
    const card = Pages.card(cardId);
    const msg = Object.assign(document.createElement("p"), { className: "chart-error", textContent: "This chart could not be loaded. Reload the page or check the server log." });
    card.querySelector(".plot").replaceChildren(msg);
    card.querySelector(".legend").replaceChildren();
    card.querySelector(".table-toggle").disabled = true;
  },

  // Run one chart's setup; a failure only affects that chart's card.
  async guard(cardId, fn) {
    try { await fn(); } catch (err) { Pages.fail(cardId, err); }
  },

  // Chain a real-GDP index from yoy growth rates (percent), base year = 100.
  indexFromGrowth(growth, base = 2019) {
    const years = [...growth.keys()].map(Number).sort((a, b) => a - b);
    const idx = new Map([[base, 100]]);
    for (const y of years.filter((y) => y > base)) idx.set(y, idx.get(y - 1) * (1 + growth.get(String(y)) / 100));
    for (const y of years.filter((y) => y < base).reverse()) idx.set(y, idx.get(y + 1) / (1 + growth.get(String(y + 1)) / 100));
    return [...idx.entries()].sort((a, b) => a[0] - b[0]).map(([y, value]) => ({ x: new Date(y, 0, 1), value }));
  },

  async gdpIndexChart(cardId, codes) {
    const card = Pages.card(cardId);
    const data = Viz.byCountry(await Viz.api(`/api/indicator/gdp_growth?countries=${codes.join(",")}&start=2010`));
    const series = codes.filter((c) => data.has(c)).map((c) => ({
      key: c, label: Viz.name(c), color: Viz.color(c), points: Pages.indexFromGrowth(data.get(c)),
    }));
    const last = (c) => series.find((s) => s.key === c)?.points.at(-1);
    const de = last("DEU");
    if (de) {
      const year = de.x.getFullYear();
      card.querySelector(".chart-note").textContent = `Germany's real GDP in ${year} is ${(de.value - 100).toFixed(1)}% above its 2019 level.`;
    }
    Viz.lineChart(card, { series, yFormat: (v) => v.toFixed(0), ref: 100 });
  },

  // Series from an API response where every country has one line (monthly or annual periods).
  linesFromApi(resp, codes) {
    const data = Viz.byCountry(resp);
    return codes.filter((c) => data.has(c)).map((c) => ({
      key: c, label: Viz.name(c), color: Viz.color(c),
      points: [...data.get(c).entries()].map(([p, value]) => ({ x: Viz.toDate(p), value })),
    }));
  },

  async countryNames() {
    const list = await Viz.api("/api/countries?aggregates=false");
    return new Map(list.map((c) => [c.code, c.name]));
  },
};

// Time-range filter: one row of presets above the charts, scoping every time-series chart on the page.
Pages.initRange = function () {
  const el = document.getElementById("range-filter");
  if (!el) return;
  const buttons = Viz.range.presets.map(([label, year]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", () => Viz.range.set(year));
    el.append(b);
    return [b, year];
  });
  const sync = () => buttons.forEach(([b, year]) => b.setAttribute("aria-pressed", String(year === Viz.range.start)));
  Viz.range.onChange(sync);
  sync();
};
Pages.initRange();
