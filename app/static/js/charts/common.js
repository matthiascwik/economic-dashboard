// Shared helpers for all charts: theme colors, entity colors, API access, tooltip, legend, table view.
const Viz = (() => {
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  // Colour follows the entity, never its rank: a country keeps its colour on every chart.
  const ENTITIES = {
    DEU: ["Germany", "--s1"],
    EUU: ["European Union", "--s2"], EU27_2020: ["European Union", "--s2"],
    EURO: ["Euro area", "--s2"], WEOWORLD: ["World", "--ink-2"], EMU: ["Euro area", "--s2"], EA: ["Euro area", "--s2"], EA21: ["Euro area", "--s2"], EA20: ["Euro area", "--s2"],
    FRA: ["France", "--s3"], ITA: ["Italy", "--s4"], ESP: ["Spain", "--s5"], POL: ["Poland", "--s6"],
    USA: ["United States", "--s7"], CHN: ["China", "--s8"], WLD: ["World", "--ink-2"],
    NLD: ["Netherlands", "--ink-3"], SWE: ["Sweden", "--ink-3"], AUT: ["Austria", "--ink-3"],
    CHE: ["Switzerland", "--ink-3"], GBR: ["United Kingdom", "--ink-3"],
  };
  const color = (code) => css(ENTITIES[code] ? ENTITIES[code][1] : "--ink-3");
  const name = (code, fallback) => (ENTITIES[code] ? ENTITIES[code][0] : fallback || code);

  async function api(path) {
    const r = await fetch(path);
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
    return r.json();
  }

  // API response -> Map(country -> Map(period -> value)) (single-series indicators).
  function byCountry(resp) {
    const out = new Map();
    for (const s of resp.series) out.set(s.country, new Map(s.points.map((p) => [p.period, p.value])));
    return out;
  }

  // Redraw on resize and on theme change.
  const themeCallbacks = [];
  const notifyTheme = () => themeCallbacks.forEach((f) => f());
  new MutationObserver(notifyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", notifyTheme);

  function mount(el, draw) {
    const run = () => { if (el.clientWidth) draw(el.clientWidth); };
    const observer = new ResizeObserver(run);
    observer.observe(el);
    themeCallbacks.push(run);
    run.dispose = () => {
      observer.disconnect();
      const i = themeCallbacks.indexOf(run);
      if (i >= 0) themeCallbacks.splice(i, 1);
    };
    run();
    return run;
  }

  // One tooltip for the whole page. All text goes in via textContent (labels are untrusted data).
  const tipEl = document.createElement("div");
  tipEl.className = "viz-tip";
  tipEl.hidden = true;
  document.body.append(tipEl);
  const tip = {
    show(evt, title, rows) {
      tipEl.replaceChildren();
      const head = document.createElement("div");
      head.className = "viz-tip-title";
      head.textContent = title;
      tipEl.append(head);
      for (const r of rows) {
        const row = document.createElement("div");
        row.className = "viz-tip-row";
        if (r.color) {
          const key = document.createElement("span");
          key.className = "viz-tip-key";
          key.style.background = r.color;
          row.append(key);
        }
        const val = document.createElement("strong");
        val.textContent = r.value;
        const lab = document.createElement("span");
        lab.textContent = r.label;
        row.append(val, lab);
        tipEl.append(row);
      }
      tipEl.hidden = false;
      const pad = 14, w = tipEl.offsetWidth, h = tipEl.offsetHeight;
      let x = evt.clientX + pad, y = evt.clientY + pad;
      if (x + w > window.innerWidth - 8) x = evt.clientX - w - pad;
      if (y + h > window.innerHeight - 8) y = evt.clientY - h - pad;
      tipEl.style.left = `${Math.max(8, x)}px`;
      tipEl.style.top = `${Math.max(8, y)}px`;
    },
    hide() { tipEl.hidden = true; },
    // Elements in the browser's top layer (a modal <dialog>) paint above everything else, so the tooltip must live inside them.
    host(el) { tipEl.hidden = true; (el || document.body).append(tipEl); },
  };

  // Legend of toggle buttons; onChange receives the Set of hidden keys.
  function legend(el, items, onChange) {
    const hidden = new Set();
    el.replaceChildren();
    for (const it of items) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "legend-item";
      b.setAttribute("aria-pressed", "true");
      const key = document.createElement("span");
      key.className = "legend-key";
      key.style.background = it.color;
      const label = document.createElement("span");
      label.textContent = it.label;
      b.append(key, label);
      for (const [ev, v] of [["pointerenter", it.key], ["focus", it.key], ["pointerleave", null], ["blur", null]]) b.addEventListener(ev, () => link.emit("key", v));
      b.addEventListener("click", () => {
        if (hidden.has(it.key)) hidden.delete(it.key); else hidden.add(it.key);
        b.setAttribute("aria-pressed", String(!hidden.has(it.key)));
        onChange(hidden);
      });
      el.append(b);
    }
  }

  // Accessible twin of a chart: a plain table behind a toggle button in the card.
  function tableView(card, getTable) {
    const btn = card.querySelector(".table-toggle");
    const wrap = card.querySelector(".table-wrap");
    const plot = card.querySelector(".plot");
    btn.onclick = () => {
      const show = wrap.hidden;
      if (show) {
        const { columns, rows } = getTable();
        const table = document.createElement("table");
        const thead = table.createTHead().insertRow();
        for (const c of columns) thead.append(Object.assign(document.createElement("th"), { textContent: c }));
        const body = table.createTBody();
        for (const r of rows) {
          const tr = body.insertRow();
          for (const v of r) tr.insertCell().textContent = v ?? "–";
        }
        wrap.replaceChildren(table);
      }
      wrap.hidden = !show;
      plot.hidden = show;
      btn.textContent = show ? "View as chart" : "View as table";
    };
  }

  const fmt = {
    pct: (v, d = 1) => `${v.toFixed(d)}%`,
    num: (v, d = 1) => v.toFixed(d),
    usd: d3.format(".3~s"),
  };

  // Compose the axis chrome shared by all charts: recessive grid, muted tick labels.
  function styleAxis(sel) {
    sel.selectAll(".domain").attr("stroke", css("--axis"));
    sel.selectAll(".tick line").attr("stroke", css("--axis"));
    sel.selectAll("text").attr("fill", css("--ink-3")).attr("font-size", 12);
  }

  // "2025", "2026-09", "2026-Q2" or "2026-09-16" -> Date
  function toDate(period) {
    const [y, m, d] = period.split("-");
    const month = !m ? 0 : m.startsWith("Q") ? (+m.slice(1) - 1) * 3 : +m - 1;
    return new Date(+y, month, d ? +d : 1);
  }

  // Labelled <select> appended to a card's controls row; returns {el, setOptions}.
  function select(card, label, options, value, onChange) {
    const wrap = document.createElement("label");
    wrap.className = "control";
    const span = document.createElement("span");
    span.textContent = label;
    const el = document.createElement("select");
    const fill = (opts, v) => {
      el.replaceChildren(...opts.map((o) => Object.assign(document.createElement("option"), { value: o.value, textContent: o.label })));
      el.value = v;
    };
    fill(options, value);
    el.addEventListener("change", () => onChange(el.value));
    wrap.append(span, el);
    card.querySelector(".controls").append(wrap);
    return { el, setOptions: fill };
  }

  // Diverging scale: red below zero, neutral grey at zero, blue above; saturates at +/-domain.
  function diverging(domain) {
    return d3.scaleLinear().domain([-domain, 0, domain]).range([css("--s8"), css("--div-mid"), css("--s1")])
      .interpolate(d3.interpolateLab).clamp(true);
  }

  // Label colour for text set on a coloured fill: ink or white by the fill's lightness.
  const textOn = (fill) => (d3.lab(fill).l > 62 ? "#0b0b0b" : "#ffffff");

  // Gradient legend for a diverging scale, drawn into `svg` at (x, y).
  function scaleLegend(svg, { x, y, w, scale, domain, format, id }) {
    const grad = svg.append("defs").append("linearGradient").attr("id", id);
    d3.range(-1, 1.01, 0.25).forEach((t, i, a) => grad.append("stop").attr("offset", `${(i / (a.length - 1)) * 100}%`).attr("stop-color", scale(t * domain)));
    svg.append("rect").attr("x", x).attr("y", y).attr("width", w).attr("height", 8).attr("rx", 4).attr("fill", `url(#${id})`);
    [[-domain, "≤"], [0, ""], [domain, "≥"]].forEach(([v, pre], i) => {
      svg.append("text").attr("x", x + (i * w) / 2).attr("y", y + 22).attr("text-anchor", "middle").attr("font-size", 11)
        .attr("fill", css("--ink-3")).text(pre + format(v));
    });
  }

  // Cross-chart events: "key" (entity or sector under the pointer) and "date" (x position on time axes).
  const subscribers = [];
  const link = {
    on(f) {
      subscribers.push(f);
      return () => { const i = subscribers.indexOf(f); if (i >= 0) subscribers.splice(i, 1); };
    },
    emit(topic, value, source) { subscribers.forEach((f) => f(topic, value, source)); },
  };

  // Dim every [data-key] element in this card except the hovered key (works across redraws).
  function linkKeys(card) {
    return link.on((topic, key) => {
      if (topic !== "key") return;
      card.querySelectorAll("[data-key]").forEach((el) => { el.style.opacity = key == null || el.dataset.key === key ? "" : "0.25"; });
    });
  }
  // Emit a key while the pointer (or keyboard focus) is on the selection's elements.
  const hoverKey = (sel, keyOf) => sel
    .on("pointerenter.link", (e, d) => link.emit("key", keyOf(d)))
    .on("pointerleave.link", () => link.emit("key", null));

  // The one global time-range filter: first year shown on time-series charts. Kept in the URL (?from=2019).
  const range = (() => {
    const now = new Date().getFullYear();
    const subs = [];
    const param = +new URLSearchParams(location.search).get("from");
    let start = param >= 2010 && param <= now ? param : 2010;
    return {
      get start() { return start; },
      presets: [["Since 2010", 2010], ["Last 10 years", now - 10], ["Since 2019", 2019], ["Last 5 years", now - 5]],
      set(year) {
        start = year;
        try { const u = new URL(location.href); u.searchParams.set("from", year); history.replaceState(null, "", u); } catch (e) { /* URL state is a convenience */ }
        subs.forEach((f) => f());
      },
      onChange(f) {
        subs.push(f);
        return () => { const i = subs.indexOf(f); if (i >= 0) subs.splice(i, 1); };
      },
    };
  })();

  return { css, color, name, api, byCountry, mount, tip, legend, tableView, fmt, styleAxis, toDate, select, diverging, textOn, scaleLegend, link, linkKeys, hoverKey, range, ENTITIES };
})();
