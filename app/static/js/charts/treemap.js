// Treemap: tile area = size, colour = growth (diverging). items: [{key, label, size, growth}].
Viz.treemap = function (card, { items, sizeFormat, growthFormat, sizeLabel, growthLabel, domain, height = 420 }) {
  const plot = card.querySelector(".plot");
  const total = d3.sum(items, (d) => d.size);

  function draw(W) {
    const H = W < 520 ? 360 : height, legendH = 40;
    const scale = Viz.diverging(domain);
    const root = d3.hierarchy({ children: items }).sum((d) => d.size || 0).sort((a, b) => b.value - a.value);
    d3.treemap().size([W, H - legendH]).paddingInner(2).round(true)(root);
    const svg = d3.select(plot).selectAll("svg").data([0]).join("svg").attr("width", W).attr("height", H)
      .attr("role", "img").attr("aria-label", `${sizeLabel} by sector, coloured by ${growthLabel} (use the table view for exact values)`);
    svg.selectAll("*").remove();
    for (const leaf of root.leaves()) {
      const d = leaf.data, w = leaf.x1 - leaf.x0, h = leaf.y1 - leaf.y0, fill = scale(d.growth);
      const g = svg.append("g").attr("data-key", d.key).attr("transform", `translate(${leaf.x0},${leaf.y0})`);
      g.append("rect").attr("width", w).attr("height", h).attr("rx", 3).attr("fill", fill);
      if (w > 90 && h > 44) {
        const chars = Math.floor((w - 12) / 6.6);
        g.append("text").attr("x", 8).attr("y", 20).attr("font-size", 12).attr("font-weight", 600).attr("fill", Viz.textOn(fill))
          .text(d.label.length > chars ? d.label.slice(0, chars - 1) + "…" : d.label);
        g.append("text").attr("x", 8).attr("y", 38).attr("font-size", 12).attr("fill", Viz.textOn(fill)).text(growthFormat(d.growth));
      }
      g.on("pointermove", (evt) => Viz.tip.show(evt, d.label, [
        { value: sizeFormat(d.size), label: `${sizeLabel} (${((d.size / total) * 100).toFixed(0)}% of total)` },
        { value: growthFormat(d.growth), label: growthLabel },
      ])).on("pointerleave", Viz.tip.hide).call(Viz.hoverKey, () => d.key);
    }
    Viz.scaleLegend(svg, { x: 4, y: H - legendH + 10, w: Math.min(220, W - 16), scale, domain, format: growthFormat, id: "tree-grad" });
  }

  Viz.mount(plot, draw);
  Viz.linkKeys(card);
  Viz.tableView(card, () => ({
    columns: ["Sector", sizeLabel, "Share of total", growthLabel],
    rows: [...items].sort((a, b) => b.size - a.size).map((d) => [d.label, sizeFormat(d.size), `${((d.size / total) * 100).toFixed(1)}%`, growthFormat(d.growth)]),
  }));
};
