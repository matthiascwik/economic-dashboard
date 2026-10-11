// Loads every page of a running dashboard in jsdom and checks that all charts render.
// Usage: npm run smoke [-- http://localhost:8000]
const { JSDOM, VirtualConsole } = require("jsdom");

const BASE = process.argv[2] || "http://localhost:8000";
const PAGES = ["/", "/world", "/europe", "/germany", "/about"];

async function check(path) {
  const problems = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => problems.push(`script error: ${(e.detail?.message || e.message).split("\n")[0]}`));
  const dom = await JSDOM.fromURL(BASE + path, {
    runScripts: "dangerously", resources: "usable", pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      // jsdom has no layout: give elements a width and stub the browser APIs the charts use.
      Object.defineProperty(w.HTMLElement.prototype, "clientWidth", { get: () => 900 });
      w.ResizeObserver = class { observe() {} disconnect() {} };
      w.matchMedia = () => ({ matches: false, addEventListener() {} });
      w.fetch = (u, o) => fetch(new URL(u, BASE), o);
      // jsdom does not implement modal dialogs.
      w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
      w.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new w.Event("close")); };
    },
  });
  await new Promise((r) => setTimeout(r, 5000));
  const d = dom.window.document;
  const cards = [...d.querySelectorAll(".chart-card:not(#tile-chart)")];
  for (const c of cards) {
    if (c.querySelector(".chart-error")) problems.push(`chart "${c.id}" failed to load`);
    else if (!c.querySelector("svg")) problems.push(`chart "${c.id}" drew nothing`);
  }
  if (path !== "/about" && !d.querySelectorAll(".tile").length) problems.push("no KPI tiles");
  // Every clickable tile must open a history chart with a line and axis values.
  for (const tile of d.querySelectorAll(".tile-clickable")) {
    tile.click();
    await new Promise((r) => setTimeout(r, 600));
    const dialog = d.getElementById("tile-dialog");
    const paths = dialog.querySelectorAll("svg path[data-key]").length;
    const ticks = dialog.querySelectorAll("svg .tick text").length;
    if (!dialog.hasAttribute("open") || !paths || !ticks) problems.push(`tile "${tile.dataset.label}": history chart missing (${paths} lines, ${ticks} tick labels)`);
    dialog.querySelector(".dialog-close").click();
  }
  console.log(`${problems.length ? "FAIL" : "ok  "} ${path}  (${cards.length} charts)`);
  problems.forEach((p) => console.log(`       ${p}`));
  dom.window.close();
  return problems.length;
}

(async () => {
  let failed = 0;
  for (const p of PAGES) failed += await check(p);
  process.exit(failed ? 1 : 0);
})();
