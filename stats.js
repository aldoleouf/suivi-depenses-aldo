// Onglet « Statistiques » : dépenses par catégorie (barres classées) et évolution du solde sur 12 mois.
// Utilise les données et fonctions globales définies dans app.js (db, month, money, catName…),
// appelées uniquement au moment du rendu.

function renderStats() {
  const section = document.getElementById("stats");
  if (!section || section.classList.contains("hidden")) return;
  renderCategoryChart();
  renderBalanceChart();
}

function expensesByCategory(targetMonth) {
  const totals = new Map();
  db.entries
    .filter((e) => e.type === "expense" && e.date && e.date.slice(0, 7) === targetMonth)
    .forEach((e) =>
      totals.set(e.categoryId || "", (totals.get(e.categoryId || "") || 0) + Number(e.amount || 0)),
    );
  return totals;
}

function renderCategoryChart() {
  const root = $("catChart");
  const current = expensesByCategory(month);
  const prevMonth = addMonths(month, -1);
  const previous = expensesByCategory(prevMonth);
  const prevLabel = new Date(prevMonth + "-02T12:00:00").toLocaleDateString("fr-FR", { month: "long" });
  const rows = [...current.entries()]
    .map(([id, amount]) => ({ id, name: catName(id), amount, prev: previous.get(id) || 0 }))
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  $("catChartTitle").textContent = "Dépenses par catégorie — " + monthName(month);
  $("catChartTotal").textContent = total ? "Total : " + money(total) : "";
  root.textContent = "";
  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Aucune dépense ce mois-ci.";
    root.appendChild(empty);
    return;
  }
  const max = rows[0].amount;
  rows.forEach((r) => {
    const row = document.createElement("div");
    row.className = "hbar-row";
    const head = document.createElement("div");
    head.className = "hbar-head";
    const name = document.createElement("span");
    name.className = "hbar-name";
    name.textContent = r.name;
    const value = document.createElement("span");
    value.className = "hbar-value";
    value.textContent = money(r.amount);
    head.append(name, value);
    const track = document.createElement("div");
    track.className = "hbar-track";
    const fill = document.createElement("i");
    fill.style.width = Math.max(1.5, (r.amount / max) * 100) + "%";
    track.appendChild(fill);
    const sub = document.createElement("div");
    sub.className = "hbar-sub";
    const share = Math.round((r.amount / total) * 100);
    const diff = r.amount - r.prev;
    let compare;
    if (!r.prev) compare = "rien en " + prevLabel;
    else if (Math.abs(diff) < 0.005) compare = "identique à " + prevLabel;
    else compare = (diff > 0 ? "▲ +" : "▼ −") + money(Math.abs(diff)) + " par rapport à " + prevLabel;
    sub.textContent = share + " % du total · " + compare;
    row.title = r.name + " : " + money(r.amount) + " (" + share + " %)";
    row.append(head, track, sub);
    root.appendChild(row);
  });
}

function monthlySeries() {
  const months = Array.from({ length: 12 }, (_, i) => addMonths(month, i - 11));
  const cache = {};
  return months.map((m) => {
    const es = db.entries.filter((e) => e.date && e.date.slice(0, 7) === m);
    const spent = es.filter((e) => e.type === "expense").reduce((s, e) => s + Number(e.amount || 0), 0);
    const received = es.filter((e) => e.type === "income").reduce((s, e) => s + Number(e.amount || 0), 0);
    return { month: m, final: calcMonthSummary(m, cache).final, spent, received };
  });
}

function niceTicks(min, max, count = 4) {
  if (min === max) {
    min -= 100;
    max += 100;
  }
  const raw = (max - min) / count;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) || raw;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

const shortMoney = (n) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    notation: Math.abs(n) >= 10000 ? "compact" : "standard",
    maximumFractionDigits: 0,
  }).format(n);

function renderBalanceChart() {
  const root = $("balanceChart");
  const series = monthlySeries();
  renderBalanceTable(series);
  const width = root.clientWidth;
  if (!width) return;
  const height = width < 500 ? 220 : 260;
  const pad = { top: 16, right: 16, bottom: 28, left: width < 500 ? 56 : 68 };
  const values = series.map((p) => p.final);
  const ticks = niceTicks(Math.min(0, ...values), Math.max(0, ...values));
  const yMin = ticks[0],
    yMax = ticks[ticks.length - 1];
  const plotW = width - pad.left - pad.right,
    plotH = height - pad.top - pad.bottom;
  const x = (i) => pad.left + (plotW * i) / (series.length - 1);
  const y = (v) => pad.top + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;
  const ns = "http://www.w3.org/2000/svg";
  const el = (tag, attrs, parent) => {
    const node = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    if (parent) parent.appendChild(node);
    return node;
  };
  root.textContent = "";
  const svg = el("svg", {
    width,
    height,
    viewBox: "0 0 " + width + " " + height,
    role: "img",
    tabindex: "0",
    "aria-label":
      "Solde Final projeté de " +
      monthName(series[0].month) +
      " à " +
      monthName(series[series.length - 1].month) +
      ". Utilise les flèches pour parcourir les mois.",
  });
  root.appendChild(svg);
  ticks.forEach((t) => {
    el(
      "line",
      {
        x1: pad.left,
        x2: width - pad.right,
        y1: y(t),
        y2: y(t),
        class: t === 0 ? "chart-zero" : "chart-grid",
      },
      svg,
    );
    const label = el(
      "text",
      { x: pad.left - 8, y: y(t) + 4, "text-anchor": "end", class: "chart-axis" },
      svg,
    );
    label.textContent = shortMoney(t);
  });
  const every = width < 500 ? 2 : 1;
  series.forEach((p, i) => {
    if ((series.length - 1 - i) % every) return;
    const label = el("text", { x: x(i), y: height - 8, "text-anchor": "middle", class: "chart-axis" }, svg);
    label.textContent = new Date(p.month + "-02T12:00:00").toLocaleDateString("fr-FR", { month: "short" });
  });
  el(
    "path",
    { d: series.map((p, i) => (i ? "L" : "M") + x(i) + " " + y(p.final)).join(" "), class: "chart-line" },
    svg,
  );
  series.forEach((p, i) => {
    el(
      "circle",
      { cx: x(i), cy: y(p.final), r: 4, class: "chart-dot" + (p.final < 0 ? " negative" : "") },
      svg,
    );
  });
  const cross = el(
    "line",
    { y1: pad.top, y2: pad.top + plotH, class: "chart-cross", visibility: "hidden" },
    svg,
  );
  const focusDot = el("circle", { r: 6, class: "chart-focus", visibility: "hidden" }, svg);
  const tip = document.createElement("div");
  tip.className = "chart-tip hidden";
  root.appendChild(tip);
  let active = -1;
  const show = (i) => {
    active = i;
    const p = series[i];
    cross.setAttribute("x1", x(i));
    cross.setAttribute("x2", x(i));
    cross.setAttribute("visibility", "visible");
    focusDot.setAttribute("cx", x(i));
    focusDot.setAttribute("cy", y(p.final));
    focusDot.setAttribute("visibility", "visible");
    tip.textContent = "";
    const value = document.createElement("strong");
    value.textContent = money(p.final);
    const label = document.createElement("span");
    label.textContent = "Final · " + monthName(p.month);
    const detail = document.createElement("span");
    detail.className = "chart-tip-detail";
    detail.textContent = "Dépenses " + money(p.spent) + " · Revenus " + money(p.received);
    tip.append(value, label, detail);
    tip.classList.remove("hidden");
    const tipW = tip.offsetWidth;
    tip.style.left = Math.min(Math.max(0, x(i) - tipW / 2), width - tipW) + "px";
    tip.style.top = Math.max(0, y(p.final) - tip.offsetHeight - 14) + "px";
  };
  const hide = () => {
    active = -1;
    cross.setAttribute("visibility", "hidden");
    focusDot.setAttribute("visibility", "hidden");
    tip.classList.add("hidden");
  };
  const nearest = (clientX) => {
    const rect = svg.getBoundingClientRect();
    const px = clientX - rect.left;
    return Math.max(
      0,
      Math.min(series.length - 1, Math.round(((px - pad.left) / plotW) * (series.length - 1))),
    );
  };
  svg.addEventListener("pointermove", (e) => show(nearest(e.clientX)));
  svg.addEventListener("pointerdown", (e) => show(nearest(e.clientX)));
  svg.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "mouse") hide();
  });
  svg.addEventListener("focus", () => show(series.length - 1));
  svg.addEventListener("blur", hide);
  svg.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const start = active < 0 ? series.length - 1 : active;
      show(Math.max(0, Math.min(series.length - 1, start + (e.key === "ArrowRight" ? 1 : -1))));
    } else if (e.key === "Escape") hide();
  });
}

function renderBalanceTable(series) {
  const table = document.createElement("table");
  table.className = "data-table";
  const head = table.createTHead().insertRow();
  ["Mois", "Dépenses", "Revenus", "Final"].forEach((h) => {
    const th = document.createElement("th");
    th.textContent = h;
    head.appendChild(th);
  });
  const body = table.createTBody();
  series
    .slice()
    .reverse()
    .forEach((p) => {
      const tr = body.insertRow();
      [monthName(p.month), money(p.spent), money(p.received), money(p.final)].forEach((v, i) => {
        const td = tr.insertCell();
        td.textContent = v;
        if (i === 3 && p.final < 0) td.className = "negative";
      });
    });
  const root = $("balanceTable");
  root.textContent = "";
  root.appendChild(table);
}

let statsResizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(statsResizeTimer);
  statsResizeTimer = setTimeout(renderStats, 150);
});
