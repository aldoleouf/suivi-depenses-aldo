const KEY = "suivi-depenses-v1",
  PROFILE_KEY = "suivi-depenses-profile-v1";
const defaults = {
  categories: [
    { id: "c1", name: "Logement", type: "both" },
    { id: "c2", name: "Courses", type: "both" },
    { id: "c3", name: "Transport", type: "both" },
    { id: "c4", name: "Loisirs", type: "both" },
    { id: "c5", name: "Santé", type: "both" },
    { id: "c6", name: "Salaire", type: "both" },
    { id: "c7", name: "Autres revenus", type: "both" },
    { id: "c8", name: "Autre", type: "both" },
  ],
  budgets: [
    { id: "b1", name: "Courses", amount: 0 },
    { id: "b2", name: "Loisirs", amount: 0 },
  ],
  entries: [],
  openings: {},
};
let profile = localStorage.getItem(PROFILE_KEY) || "perso";
const dataKey = () => (profile === "cc" ? KEY + "-cc" : KEY);
const freshData = () => ({
  categories: defaults.categories.map((c) => ({ ...c })),
  budgets: profile === "cc" ? [] : defaults.budgets.map((b) => ({ ...b })),
  entries: [],
  openings: {},
  transfers: {},
});
const loadData = () => {
  let value;
  try {
    value = JSON.parse(localStorage.getItem(dataKey()));
  } catch (e) {}
  db = value && typeof value === "object" ? value : freshData();
  db.categories = db.categories || [];
  if (!db.categories.some((c) => (c.name || "").trim().toLocaleLowerCase("fr") === "autre"))
    db.categories.push({ id: "c8", name: "Autre", type: "both" });
  db.budgets = db.budgets || [];
  db.entries = db.entries || [];
  db.openings = db.openings || {};
  db.transfers = db.transfers || {};
};
let db;
loadData();
// Mois au format AAAA-MM calculé en heure locale (toISOString() passe en UTC et peut décaler d'un mois).
const ymOf = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
const currentYM = () => ymOf(new Date());
const addMonths = (m, n) => ymOf(new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1, 12));
const todayISO = () => {
  const d = new Date();
  return ymOf(d) + "-" + String(d.getDate()).padStart(2, "0");
};
const monthName = (m) =>
  new Date(m + "-02T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
const fmtDate = (iso) =>
  iso ? new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "";
// Même jour dans un autre mois, ramené au dernier jour si besoin (31 → 30, 28…).
const sameDayInMonth = (iso, targetMonth) => {
  const day = Number(String(iso).slice(8, 10)) || 1;
  const lastDay = new Date(Number(targetMonth.slice(0, 4)), Number(targetMonth.slice(5, 7)), 0).getDate();
  return targetMonth + "-" + String(Math.min(day, lastDay)).padStart(2, "0");
};
const sortByName = (list) =>
  [...list].sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));
const normName = (v) =>
  String(v || "")
    .trim()
    .toLocaleLowerCase("fr");
let month = currentYM();
db.budgets.forEach((b) => {
  if (!b.month) b.month = month;
});
const $ = (id) => document.getElementById(id);
const money = (n) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n || 0);
const uid = () => Math.random().toString(36).slice(2, 10);
const save = () => localStorage.setItem(dataKey(), JSON.stringify(db));
const monthEntries = () => db.entries.filter((e) => e.date && e.date.slice(0, 7) === month);
// Rattache un budget au budget du même nom dans un autre mois (les budgets sont définis mois par mois).
const mapBudgetToMonth = (budgetId, targetMonth) => {
  if (!budgetId) return "";
  const source = db.budgets.find((b) => b.id === budgetId);
  if (!source) return "";
  if (source.month === targetMonth) return source.id;
  return (
    db.budgets.find((b) => b.month === targetMonth && normName(b.name) === normName(source.name))?.id || ""
  );
};
// Recopie automatiquement les récurrentes du mois précédent dans le mois courant ou le suivant,
// une seule fois par mois : une opération supprimée ensuite n'est pas recréée.
function ensureRecurringForMonth(target) {
  if (db.autoRecurring === false) return;
  const now = currentYM();
  if (target < now || target > addMonths(now, 1)) return;
  db.recurringAutoDone = db.recurringAutoDone || {};
  if (db.recurringAutoDone[target]) return;
  const prev = addMonths(target, -1);
  const sources = db.entries.filter((e) => e.recurring && e.date && e.date.slice(0, 7) === prev);
  if (!sources.length) return;
  const existing = db.entries.filter((e) => e.date && e.date.slice(0, 7) === target);
  const added = [];
  for (const e of sources) {
    if (existing.some((x) => x.recurring && normName(x.label) === normName(e.label) && x.type === e.type))
      continue;
    const item = {
      ...e,
      id: uid(),
      date: sameDayInMonth(e.date, target),
      budgetId: mapBudgetToMonth(e.budgetId, target),
      done: false,
    };
    db.entries.push(item);
    added.push(item);
  }
  db.recurringAutoDone[target] = true;
  save();
  if (added.length) {
    const ids = new Set(added.map((e) => e.id));
    toast(added.length + " récurrente(s) ajoutée(s) automatiquement pour " + monthName(target) + ".", {
      action: {
        label: "Annuler",
        onClick: () => {
          db.entries = db.entries.filter((e) => !ids.has(e.id));
          save();
          render();
        },
      },
    });
  }
}
function goToMonth(m) {
  month = m;
  ensureRecurringForMonth(month);
  resetForm();
  render();
}
const expenses = (es) => es.filter((e) => e.type === "expense");
const incomes = (es) => es.filter((e) => e.type === "income");
const sum = (es) => es.reduce((s, e) => s + (e.type === "income" ? 1 : -1) * Number(e.amount || 0), 0);
const catName = (id) => db.categories.find((c) => c.id === id)?.name || "Sans catégorie";
const budName = (id) => db.budgets.find((b) => b.id === id)?.name || "Sans budget";
const special = (e) =>
  ["salaire", "participation crédit appart"].includes((e.label || "").trim().toLocaleLowerCase("fr"));
const budgetsForMonth = (m) => db.budgets.filter((b) => b.month === m);
const budgetSpent = (b) =>
  expenses(monthEntries())
    .filter((e) => e.budgetId === b.id)
    .reduce((s, e) => s + Number(e.amount || 0), 0);
const budgetIncome = (b) =>
  incomes(monthEntries())
    .filter((e) => e.budgetId === b.id)
    .reduce((s, e) => s + Number(e.amount || 0), 0);
const budgetRemainingFor = (b) => Number(b.amount || 0) - budgetSpent(b) + budgetIncome(b);
const budgetRemaining = () =>
  budgetsForMonth(month).reduce((s, b) => s + Math.max(0, budgetRemainingFor(b)), 0);
function calcMonthSummary(targetMonth, cache = {}) {
  if (cache[targetMonth]) return cache[targetMonth];
  const prevMonth = addMonths(targetMonth, -1);
  const hasPriorHistory =
    db.entries.some((e) => e.date && e.date.slice(0, 7) < targetMonth) ||
    Object.keys(db.openings || {}).some((m) => m && m < targetMonth);
  const openingBase = Number(db.openings[targetMonth] || 0);
  const priorFinal = hasPriorHistory ? calcMonthSummary(prevMonth, cache).final : openingBase;
  const es = db.entries.filter((e) => e.date && e.date.slice(0, 7) === targetMonth);
  const done = es.filter((e) => e.done),
    pending = es.filter((e) => !e.done);
  const paidNet = done.reduce((s, e) => s + (e.type === "income" ? 1 : -1) * Number(e.amount || 0), 0);
  const realBase = priorFinal + paidNet;
  const real = realBase;
  const expenses = (arr) => arr.filter((e) => e.type === "expense");
  const incomes = (arr) => arr.filter((e) => e.type === "income");
  const spentForBudget = (b) =>
    expenses(es)
      .filter((e) => e.budgetId === b.id)
      .reduce((s, e) => s + Number(e.amount || 0), 0);
  const budgetRemaining = budgetsForMonth(targetMonth).reduce(
    (s, b) => s + Math.max(0, Number(b.amount || 0) - spentForBudget(b)),
    0,
  );
  const a1 =
    real -
    expenses(pending.filter((e) => e.planned)).reduce((s, e) => s + Number(e.amount || 0), 0) +
    incomes(pending.filter((e) => e.planned)).reduce((s, e) => s + Number(e.amount || 0), 0);
  const a2 =
    a1 -
    expenses(pending.filter((e) => e.recurring && !special(e))).reduce(
      (s, e) => s + Number(e.amount || 0),
      0,
    );
  const a3 = a2 - budgetRemaining;
  const final =
    a3 +
    incomes(pending.filter((e) => (e.label || "").trim().toLocaleLowerCase("fr") === "salaire")).reduce(
      (s, e) => s + Number(e.amount || 0),
      0,
    ) -
    expenses(
      pending.filter((e) => (e.label || "").trim().toLocaleLowerCase("fr") === "participation crédit appart"),
    ).reduce((s, e) => s + Number(e.amount || 0), 0) -
    expenses(pending.filter((e) => e.afterSalary && !special(e))).reduce(
      (s, e) => s + Number(e.amount || 0),
      0,
    ) +
    incomes(pending.filter((e) => e.afterSalary && !special(e))).reduce(
      (s, e) => s + Number(e.amount || 0),
      0,
    );
  const result = { realBase, real, final };
  cache[targetMonth] = result;
  return result;
}
function calcReal(targetMonth) {
  return calcMonthSummary(targetMonth).realBase;
}
const collapsedEntryGroups = new Set();
// Replie / déplie un groupe d'opérations en douceur, sans reconstruire la liste.
function setGroupCollapsed(group, collapsed) {
  const button = group.querySelector("[data-group-title]");
  const body = group.querySelector(".entry-group-body");
  if (collapsed) collapsedEntryGroups.add(button.dataset.groupTitle);
  else collapsedEntryGroups.delete(button.dataset.groupTitle);
  if (group.classList.contains("collapsed") === collapsed) return;
  closeEntryMenus();
  group.classList.add("animating");
  group.classList.toggle("collapsed", collapsed);
  button.setAttribute("aria-expanded", String(!collapsed));
  body.toggleAttribute("inert", collapsed);
  clearTimeout(group._animTimer);
  group._animTimer = setTimeout(() => group.classList.remove("animating"), 360);
}
function updateToggleAllButton() {
  const groups = [...$("entryList").querySelectorAll(".entry-group")];
  const allCollapsed = groups.length > 0 && groups.every((g) => g.classList.contains("collapsed"));
  $("toggleAllEntryGroups").textContent = allCollapsed ? "Tout déployer" : "Tout rétracter";
  return allCollapsed;
}
$("toggleAllEntryGroups").onclick = () => {
  const groups = [...$("entryList").querySelectorAll(".entry-group")];
  const collapse = !groups.every((g) => g.classList.contains("collapsed"));
  groups.forEach((g) => setGroupCollapsed(g, collapse));
  updateToggleAllButton();
};
function render() {
  $("monthLabel").textContent = monthName(month);
  const monthOptions = Array.from({ length: 25 }, (_, i) => addMonths(currentYM(), i - 12));
  if (!monthOptions.includes(month)) monthOptions.push(month);
  monthOptions.sort();
  $("monthSelect").innerHTML = monthOptions
    .map((m) => {
      return (
        '<option value="' + m + '" ' + (m === month ? "selected" : "") + ">" + monthName(m) + "</option>"
      );
    })
    .join("");
  let es = monthEntries(),
    opening = Number(db.openings[month] || 0),
    done = es.filter((e) => e.done),
    pending = es.filter((e) => !e.done),
    real = calcReal(month),
    a1 =
      real -
      expenses(pending.filter((e) => e.planned)).reduce((s, e) => s + Number(e.amount), 0) +
      incomes(pending.filter((e) => e.planned)).reduce((s, e) => s + Number(e.amount), 0),
    a2 =
      a1 -
      expenses(pending.filter((e) => e.recurring && !special(e))).reduce((s, e) => s + Number(e.amount), 0),
    a3 = a2 - budgetRemaining(),
    final =
      a3 +
      incomes(pending.filter((e) => (e.label || "").trim().toLocaleLowerCase("fr") === "salaire")).reduce(
        (s, e) => s + Number(e.amount),
        0,
      ) -
      expenses(
        pending.filter(
          (e) => (e.label || "").trim().toLocaleLowerCase("fr") === "participation crédit appart",
        ),
      ).reduce((s, e) => s + Number(e.amount), 0) -
      expenses(pending.filter((e) => e.afterSalary && !special(e))).reduce(
        (s, e) => s + Number(e.amount),
        0,
      ) +
      incomes(pending.filter((e) => e.afterSalary && !special(e))).reduce((s, e) => s + Number(e.amount), 0),
    end = sum(es) - budgetRemaining();
  const cards = [
    ["Reste fin de mois", end, "Somme des opérations du mois"],
    ["Réel", real, "Final du mois précédent + revenus reçus − dépenses payées"],
    ["Anticipation #1", a1, "Réel − dépenses marquées « Prévu »"],
    [
      "Anticipation #2",
      a2,
      "Ant. #1 − récurrences non effectuées (hors salaire et participation crédit appart)",
    ],
    ["Anticipation #3", a3, "Ant. #2 − budgets restants non utilisés"],
    [
      "Final",
      final,
      "Ant. #3 + salaire à venir (salaire effectué déjà inclus dans le Réel) − participation crédit appart − dépenses après salaire",
    ],
  ];
  $("metrics").innerHTML = cards
    .map(
      (c) =>
        '<button type="button" class="metric" aria-expanded="false"><small>' +
        c[0] +
        '</small><strong class="' +
        (c[1] < 0 ? "negative" : "") +
        '">' +
        money(c[1]) +
        '</strong><span class="metric-detail">' +
        c[2] +
        "</span></button>",
    )
    .join("");
  $("metrics")
    .querySelectorAll(".metric")
    .forEach((card) =>
      card.addEventListener("click", () => {
        const expanded = card.classList.toggle("expanded");
        card.setAttribute("aria-expanded", String(expanded));
      }),
    );
  db.categories.forEach((c) => (c.type = "both"));
  $("category").innerHTML = [...db.categories]
    .sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }))
    .map((c) => '<option value="' + c.id + '">' + esc(c.name) + "</option>")
    .join("");
  $("budget").innerHTML =
    '<option value="">Aucun budget</option>' +
    [...budgetsForMonth(month)]
      .sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }))
      .map((b) => '<option value="' + esc(b.id) + '">' + esc(b.name) + "</option>")
      .join("");
  const categoryFilter = $("categoryFilter"),
    selectedCategory = categoryFilter.value || "all";
  categoryFilter.innerHTML =
    '<option value="all">Toutes les catégories</option>' +
    [...db.categories]
      .sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }))
      .map((c) => '<option value="' + c.id + '">' + esc(c.name) + "</option>")
      .join("");
  categoryFilter.value = [...db.categories].some((c) => c.id === selectedCategory) ? selectedCategory : "all";
  let filter = $("filter").value;
  let sortDirection = $("dateSort").value || "desc";
  updateEntryFilterButton();
  const normalizeSearch = (v) =>
    String(v ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("fr");
  let searchTerms = normalizeSearch($("keywordSearch").value).split(/\s+/).filter(Boolean);
  let filtered = es
    .filter(
      (e) =>
        (filter === "all" ||
          filter === e.type ||
          (filter === "pending" && !e.done) ||
          (filter === "done" && e.done) ||
          (filter === "recurring" && e.recurring)) &&
        (categoryFilter.value === "all" || e.categoryId === categoryFilter.value) &&
        searchTerms.every((term) =>
          normalizeSearch(
            [
              e.label,
              e.notes,
              catName(e.categoryId),
              budName(e.budgetId),
              e.date,
              e.type,
              e.done ? "effectuee" : "a venir",
              e.recurring ? "recurrente" : "",
              e.planned ? "prevu" : "",
              e.afterSalary ? "apres salaire" : "",
            ].join(" "),
          ).includes(term),
        ),
    )
    .sort((a, b) => (sortDirection === "asc" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)));
  const entryCard = (e) => {
    const pills =
      (e.recurring ? '<span class="pill">Récurrente</span>' : "") +
      (e.planned ? '<span class="pill">Prévu</span>' : "") +
      (e.afterSalary ? '<span class="pill">Après salaire</span>' : "");
    const menuItems = [
      ["edit", "Modifier"],
      ["duplicate", "Dupliquer"],
      ["next", "Reporter au mois suivant"],
      ["delete", "Supprimer"],
    ]
      .map(
        ([action, text]) =>
          '<button type="button" role="menuitem" class="item-menu-btn' +
          (action === "delete" ? " danger" : "") +
          '" data-action="' +
          action +
          '">' +
          text +
          "</button>",
      )
      .join("");
    return (
      '<div class="item entry' +
      (e.done ? " is-done" : "") +
      '" data-id="' +
      esc(e.id) +
      '"><label class="item-check" title="' +
      (e.done ? "Effectuée — décocher pour la remettre à venir" : "À venir — cocher quand c’est effectué") +
      '"><input type="checkbox" data-action="toggle"' +
      (e.done ? " checked" : "") +
      ' aria-label="' +
      esc((e.done ? "Effectuée : " : "À venir : ") + e.label) +
      '"></label><div class="itemmain" data-action="edit" role="button" tabindex="0" aria-label="' +
      esc("Modifier " + e.label) +
      '"><div class="itemtop"><b>' +
      esc(e.label) +
      '</b><div class="itemamount"><div class="amount ' +
      (e.type === "income" ? "positive" : "negative") +
      '">' +
      (e.type === "income" ? "+" : "−") +
      money(e.amount) +
      "</div>" +
      (e.budgetId
        ? '<span class="pill" title="Opération associée à un budget" style="font-weight:800">B</span>'
        : "") +
      '</div></div><div class="meta">' +
      fmtDate(e.date) +
      " · " +
      esc(catName(e.categoryId)) +
      (e.budgetId ? " · Budget : " + esc(budName(e.budgetId)) : "") +
      (e.notes ? " · " + esc(e.notes) : "") +
      "</div>" +
      (pills ? '<div class="item-pills">' + pills + "</div>" : "") +
      '</div><div class="item-more"><button type="button" class="btn item-more-btn" data-action="menu" aria-haspopup="menu" aria-expanded="false" aria-label="' +
      esc("Autres actions pour " + e.label) +
      '">⋯</button><div class="item-menu hidden" role="menu">' +
      menuItems +
      "</div></div></div>"
    );
  };
  const groups = [
    { title: "Récurrente à venir", items: filtered.filter((e) => !e.done && e.recurring) },
    { title: "Prévu", items: filtered.filter((e) => !e.done && !e.recurring && e.planned) },
    {
      title: "Après salaire",
      items: filtered.filter((e) => !e.done && !e.recurring && !e.planned && e.afterSalary),
    },
    {
      title: "Autres opérations à venir",
      items: filtered.filter((e) => !e.done && !e.recurring && !e.planned && !e.afterSalary),
    },
    { title: "Effectué", items: filtered.filter((e) => e.done) },
  ];
  const visibleGroups = groups.filter((g) => g.items.length);
  const allCollapsed =
    visibleGroups.length > 0 && visibleGroups.every((g) => collapsedEntryGroups.has(g.title));
  $("toggleAllEntryGroups").textContent = allCollapsed ? "Tout déployer" : "Tout rétracter";
  $("entryList").innerHTML = filtered.length
    ? visibleGroups
        .map((g) => {
          const collapsed = collapsedEntryGroups.has(g.title);
          const styleClass =
            g.title === "Récurrente à venir"
              ? "upcoming-recurring"
              : g.title === "Prévu"
                ? "upcoming-planned"
                : g.title === "Après salaire"
                  ? "upcoming-after-salary"
                  : g.title === "Autres opérations à venir"
                    ? "upcoming-other"
                    : "";
          return (
            '<div class="entry-group ' +
            styleClass +
            (collapsed ? " collapsed" : "") +
            '"><button type="button" class="entry-group-title group-collapse-toggle" data-group-title="' +
            esc(g.title) +
            '" aria-expanded="' +
            !collapsed +
            '" style="width:100%;border:0;text-align:left;cursor:pointer;font:inherit;display:flex;justify-content:space-between;gap:10px;align-items:center"><span><span class="group-chev" aria-hidden="true">›</span> ' +
            esc(g.title) +
            " <span>(" +
            g.items.length +
            ')</span></span><span class="group-total">' +
            money(sum(g.items)) +
            "</span></button>" +
            '<div class="entry-group-body"' +
            (collapsed ? " inert" : "") +
            '><div class="list">' +
            g.items.map(entryCard).join("") +
            "</div></div>" +
            "</div>"
          );
        })
        .join("")
    : '<div class="empty">' +
      (searchTerms.length
        ? "Aucune opération ne correspond à « " + esc($("keywordSearch").value.trim()) + " »."
        : "Aucune opération pour ce mois.") +
      "</div>";
  $("entryList")
    .querySelectorAll("[data-group-title]")
    .forEach((button) =>
      button.addEventListener("click", () => {
        const title = button.dataset.groupTitle;
        setGroupCollapsed(button.closest(".entry-group"), !collapsedEntryGroups.has(title));
        updateToggleAllButton();
      }),
    );
  $("budgetList").innerHTML = (() => {
    const bs = [...budgetsForMonth(month)].sort((a, b) =>
      a.name.localeCompare(b.name, "fr", { sensitivity: "base" }),
    );
    const total = bs.reduce((s, b) => s + Number(b.amount || 0), 0),
      remainingTotal = bs.reduce((s, b) => s + budgetRemainingFor(b), 0);
    const summary =
      '<div class="grid" style="margin:14px 0"><article class="metric"><small>Total des budgets</small><strong>' +
      money(total) +
      '</strong></article><article class="metric"><small>Total restant</small><strong class="' +
      (remainingTotal < 0 ? "negative" : "") +
      '">' +
      money(remainingTotal) +
      "</strong></article></div>";
    return (
      summary +
      (bs
        .map((b) => {
          let spent = budgetSpent(b),
            income = budgetIncome(b),
            netSpent = spent - income,
            remaining = budgetRemainingFor(b),
            pct = Number(b.amount) > 0 ? Math.max(0, (netSpent / Number(b.amount)) * 100) : 0;
          return (
            '<div class="budgetrow ' +
            (remaining < 0 ? "over-budget" : "") +
            '"><div><b>' +
            esc(b.name) +
            '</b><div class="meta">Dépenses : ' +
            money(spent) +
            " · Revenus : " +
            money(income) +
            " · Restant : " +
            money(remaining) +
            '</div><div class="bar"><i style="display:block;height:100%;background:#4265e8;width:' +
            pct +
            '%"></i></div></div><div style="text-align:right"><b>' +
            money(b.amount) +
            '</b><div class="actions"><button class="btn" type="button" data-budget-action="edit" data-id="' +
            esc(b.id) +
            '">Modifier</button><button class="btn danger" type="button" data-budget-action="delete" data-id="' +
            esc(b.id) +
            '">Supprimer</button></div></div></div>'
          );
        })
        .join("") || '<div class="empty">Aucun budget défini.</div>')
    );
  })();
  $("categoryList").innerHTML = sortByName(db.categories)
    .map((c) =>
      c.id === editingCategoryId
        ? '<div class="item category-row editing" data-id="' +
          esc(c.id) +
          '"><input class="category-rename" value="' +
          esc(c.name) +
          '" aria-label="Nouveau nom de la catégorie" /><div class="category-actions"><button class="btn primary" type="button" data-category-action="save">Enregistrer</button><button class="btn" type="button" data-category-action="cancel">Annuler</button></div></div>'
        : '<div class="item category-row" data-id="' +
          esc(c.id) +
          '"><b>' +
          esc(c.name) +
          '</b><div class="category-actions"><button class="btn" type="button" data-category-action="rename">Renommer</button><button class="btn danger" type="button" data-category-action="delete">Supprimer</button></div></div>',
    )
    .join("");
  const renameInput = $("categoryList").querySelector(".category-rename");
  if (renameInput && document.activeElement !== renameInput) {
    renameInput.focus();
    renameInput.select();
  }
  renderStats();
}
let editingCategoryId = null;
function esc(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}
$("entryForm").addEventListener("submit", (e) => {
  e.preventDefault();
  let id = $("editId").value || uid();
  let item = {
    id,
    label: $("label").value.trim(),
    amount: Number($("amount").value),
    type: $("type").value,
    date: $("date").value,
    categoryId: $("category").value,
    budgetId: $("budget").value,
    done: $("done").checked,
    recurring: $("recurring").checked,
    planned: $("planned").checked,
    afterSalary: $("afterSalary").checked,
    notes: $("notes").value.trim(),
  };
  let old = db.entries.find((x) => x.id === id);
  if (old) Object.assign(old, item);
  else db.entries.push(item);
  save();
  resetForm();
  render();
});
function resetForm() {
  $("entryForm").reset();
  $("editId").value = "";
  $("date").value = todayISO();
  const otherCategory = db.categories.find((c) => (c.name || "").trim().toLocaleLowerCase("fr") === "autre");
  if (otherCategory) $("category").value = otherCategory.id;
  $("formTitle").textContent = "Ajouter une opération";
  $("entryModal").classList.add("hidden");
}
function editEntry(id) {
  let e = db.entries.find((x) => x.id === id);
  if (!e) return;
  $("editId").value = e.id;
  ["label", "amount", "type", "date", "category", "budget", "notes"].forEach((k, i) => {
    $(k).value = [e.label, e.amount, e.type, e.date, e.categoryId, e.budgetId || "", e.notes || ""][i];
  });
  ["done", "recurring", "planned", "afterSalary"].forEach((k) => ($(k).checked = !!e[k]));
  $("formTitle").textContent = "Modifier une opération";
  openEntryModal({ focus: false });
}
// Ouvre la fenêtre d'opération ; le curseur va directement dans « Montant » pour une saisie rapide.
function openEntryModal(options = {}) {
  refreshLabelSuggestions();
  $("entryModal").classList.remove("hidden");
  if (options.focus !== false) $("amount").focus();
}
function closeEntryMenus(except) {
  document.querySelectorAll(".item-menu:not(.hidden)").forEach((menu) => {
    if (menu === except) return;
    menu.classList.add("hidden");
    menu.previousElementSibling?.setAttribute("aria-expanded", "false");
  });
}
$("entryList").addEventListener("click", (ev) => {
  const target = ev.target.closest("[data-action]");
  const item = target?.closest(".item.entry");
  if (!target || !item) return;
  const id = item.dataset.id;
  const action = target.dataset.action;
  if (action === "menu") {
    const menu = target.nextElementSibling;
    closeEntryMenus(menu);
    const open = menu.classList.toggle("hidden") === false;
    target.setAttribute("aria-expanded", String(open));
    if (open) menu.querySelector("button")?.focus();
    return;
  }
  closeEntryMenus();
  if (action === "toggle") toggleDone(id);
  else if (action === "edit") editEntry(id);
  else if (action === "duplicate") duplicateEntry(id);
  else if (action === "next") moveEntryNextMonth(id);
  else if (action === "delete") deleteEntry(id);
});
$("entryList").addEventListener("keydown", (ev) => {
  if ((ev.key === "Enter" || ev.key === " ") && ev.target.matches(".itemmain[data-action='edit']")) {
    ev.preventDefault();
    editEntry(ev.target.closest(".item.entry").dataset.id);
  }
});
document.addEventListener("click", (ev) => {
  if (!ev.target.closest(".item-more")) closeEntryMenus();
});
// Suggestions de libellés : reprend catégorie, budget, type (et montant si vide) de la dernière saisie identique.
let lastAppliedLabel = "";
function latestEntriesByLabel() {
  const byLabel = new Map();
  for (const e of db.entries) {
    const key = normName(e.label);
    if (!key) continue;
    const current = byLabel.get(key);
    if (!current || String(e.date) > String(current.date)) byLabel.set(key, e);
  }
  return byLabel;
}
function refreshLabelSuggestions() {
  lastAppliedLabel = "";
  $("labelHint").classList.add("hidden");
  const latest = [...latestEntriesByLabel().values()].sort((a, b) =>
    String(b.date).localeCompare(String(a.date)),
  );
  $("labelSuggestions").innerHTML = latest
    .slice(0, 300)
    .map((e) => '<option value="' + esc(e.label.trim()) + '"></option>')
    .join("");
}
function applyLabelSuggestion() {
  if ($("editId").value) return;
  const key = normName($("label").value);
  if (!key || key === lastAppliedLabel) return;
  const match = latestEntriesByLabel().get(key);
  if (!match) return;
  lastAppliedLabel = key;
  $("type").value = match.type;
  if (db.categories.some((c) => c.id === match.categoryId)) $("category").value = match.categoryId;
  const formMonth = ($("date").value || month + "-01").slice(0, 7);
  $("budget").value = formMonth === month ? mapBudgetToMonth(match.budgetId, month) : "";
  const amountWasEmpty = !$("amount").value;
  if (amountWasEmpty) $("amount").value = match.amount;
  $("labelHint").textContent =
    "Repris de la dernière « " +
    match.label.trim() +
    " » (" +
    fmtDate(match.date) +
    ") : " +
    catName(match.categoryId) +
    (match.budgetId ? ", budget " + budName(match.budgetId) : "") +
    (amountWasEmpty ? ", " + money(match.amount) : "") +
    ".";
  $("labelHint").classList.remove("hidden");
}
$("label").addEventListener("input", applyLabelSuggestion);
$("label").addEventListener("change", applyLabelSuggestion);
function toggleDone(id) {
  const e = db.entries.find((x) => x.id === id);
  if (!e) return;
  if (!e.done) return openDoneDialog(e);
  e.done = false;
  save();
  render();
}
// Cocher une opération : demande la date réelle (aujourd'hui par défaut) et le montant réel.
let doneEntryId = null;
function openDoneDialog(e) {
  doneEntryId = e.id;
  render(); // la case reste décochée tant que ce n'est pas validé
  const today = todayISO();
  $("doneTitle").textContent = e.type === "income" ? "Marquer comme reçue" : "Marquer comme effectuée";
  $("doneLabel").textContent = e.label + " · prévu le " + fmtDate(e.date) + " " + e.date.slice(0, 4);
  $("doneDate").value = today;
  $("doneAmount").value = e.amount;
  const shortcuts = [["Aujourd’hui", today]];
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  shortcuts.push(["Hier", ymOf(yesterday) + "-" + String(yesterday.getDate()).padStart(2, "0")]);
  if (e.date !== today) shortcuts.push(["Date prévue (" + fmtDate(e.date) + ")", e.date]);
  $("doneShortcuts").innerHTML = shortcuts
    .map(
      ([text, iso]) =>
        '<button type="button" class="chip' +
        (iso === today ? " active" : "") +
        '" data-date="' +
        iso +
        '">' +
        esc(text) +
        "</button>",
    )
    .join("");
  $("doneModal").classList.remove("hidden");
  $("doneSubmit").focus();
}
function closeDoneDialog() {
  doneEntryId = null;
  $("doneModal").classList.add("hidden");
}
function syncDoneShortcuts() {
  $("doneShortcuts")
    .querySelectorAll(".chip")
    .forEach((c) => c.classList.toggle("active", c.dataset.date === $("doneDate").value));
}
$("doneShortcuts").addEventListener("click", (ev) => {
  const chip = ev.target.closest("[data-date]");
  if (!chip) return;
  $("doneDate").value = chip.dataset.date;
  syncDoneShortcuts();
});
$("doneDate").addEventListener("input", syncDoneShortcuts);
$("closeDoneModal").onclick = closeDoneDialog;
$("cancelDone").onclick = closeDoneDialog;
$("doneBackdrop").onclick = closeDoneDialog;
$("doneForm").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const e = db.entries.find((x) => x.id === doneEntryId);
  if (!e) return closeDoneDialog();
  const date = $("doneDate").value;
  const amount = Number($("doneAmount").value);
  if (!date || !(amount >= 0)) return;
  const previous = {
    date: e.date,
    amount: e.amount,
    done: e.done,
    planned: e.planned,
    afterSalary: e.afterSalary,
  };
  Object.assign(e, { date, amount, done: true, planned: false, afterSalary: false });
  save();
  closeDoneDialog();
  render();
  const movedMonth = date.slice(0, 7) !== previous.date.slice(0, 7);
  toast(
    "« " +
      e.label +
      " » " +
      (e.type === "income" ? "reçue" : "effectuée") +
      " le " +
      fmtDate(date) +
      (amount !== Number(previous.amount) ? " (" + money(amount) + ")" : "") +
      (movedMonth ? ", déplacée en " + monthName(date.slice(0, 7)) : "") +
      ".",
    {
      action: {
        label: "Annuler",
        onClick: () => {
          Object.assign(e, previous);
          save();
          render();
        },
      },
    },
  );
});
function deleteEntry(id) {
  const index = db.entries.findIndex((x) => x.id === id);
  if (index < 0) return;
  const [removed] = db.entries.splice(index, 1);
  save();
  render();
  toast("« " + removed.label + " » supprimée.", {
    action: {
      label: "Annuler",
      onClick: () => {
        db.entries.splice(Math.min(index, db.entries.length), 0, removed);
        save();
        render();
      },
    },
  });
}
function moveEntryNextMonth(id) {
  const e = db.entries.find((x) => x.id === id);
  if (!e) return;
  const originalDate = new Date(e.date + "T12:00:00");
  const day = originalDate.getDate();
  const target = new Date(originalDate.getFullYear(), originalDate.getMonth() + 1, 1, 12);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0, 12).getDate();
  target.setDate(Math.min(day, lastDay));
  const nextDate =
    target.getFullYear() +
    "-" +
    String(target.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(target.getDate()).padStart(2, "0");
  const previous = { date: e.date, done: e.done };
  e.date = nextDate;
  e.done = false;
  save();
  render();
  toast("« " + e.label + " » reportée au " + fmtDate(nextDate) + " " + nextDate.slice(0, 4) + ".", {
    action: {
      label: "Annuler",
      onClick: () => {
        Object.assign(e, previous);
        save();
        render();
      },
    },
  });
}
function duplicateEntry(id) {
  let e = db.entries.find((x) => x.id === id);
  if (!e) return;
  resetForm();
  $("label").value = e.label;
  $("amount").value = e.amount;
  $("type").value = e.type;
  $("date").value = e.date;
  $("category").value = e.categoryId;
  $("budget").value = e.budgetId || "";
  $("done").checked = false;
  $("recurring").checked = !!e.recurring;
  $("planned").checked = !!e.planned;
  $("afterSalary").checked = !!e.afterSalary;
  $("notes").value = e.notes || "";
  $("editId").value = "";
  $("formTitle").textContent = "Dupliquer une opération";
  openEntryModal();
}
$("cancelEdit").onclick = resetForm;
$("openEntryModal").onclick = () => {
  resetForm();
  openEntryModal();
};
$("copyRecurring").onclick = () => {
  const sources = monthEntries().filter((e) => e.recurring);
  if (!sources.length) {
    toast("Aucune opération récurrente à copier sur ce mois.");
    return;
  }
  const targetMonth = addMonths(month, 1);
  let added = 0;
  for (const e of sources) {
    const date = sameDayInMonth(e.date, targetMonth);
    const budgetId = mapBudgetToMonth(e.budgetId, targetMonth);
    const exists = db.entries.some(
      (x) =>
        x.date === date &&
        x.recurring &&
        x.label === e.label &&
        Number(x.amount) === Number(e.amount) &&
        x.type === e.type &&
        x.categoryId === e.categoryId &&
        (x.budgetId || "") === budgetId,
    );
    if (exists) continue;
    db.entries.push({ ...e, id: uid(), date, budgetId, done: false });
    added++;
  }
  save();
  month = targetMonth;
  resetForm();
  render();
  toast(
    added +
      " opération(s) récurrente(s) copiée(s) en « à venir » pour " +
      monthName(targetMonth) +
      "." +
      (added < sources.length ? " " + (sources.length - added) + " déjà présente(s) ou ignorée(s)." : ""),
  );
};
$("closeEntryModal").onclick = resetForm;
$("modalBackdrop").onclick = resetForm;
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (document.querySelector(".item-menu:not(.hidden)")) return closeEntryMenus();
  if (!$("doneModal").classList.contains("hidden")) return closeDoneDialog();
  resetForm();
});
$("filter").onchange = render;
$("categoryFilter").onchange = render;
$("dateSort").onchange = render;
$("keywordSearch").addEventListener("input", render);
function closeEntryFilters() {
  $("entryFiltersModal").classList.add("hidden");
}
function updateEntryFilterButton() {
  const count =
    Number($("keywordSearch").value.trim() !== "") +
    Number($("filter").value !== "all") +
    Number($("categoryFilter").value !== "all") +
    Number($("dateSort").value !== "desc");
  $("entryFilterCount").textContent = count || "";
  $("entryFilterCount").classList.toggle("hidden", !count);
}
$("openEntryFilters").onclick = () => $("entryFiltersModal").classList.remove("hidden");
$("closeEntryFilters").onclick = closeEntryFilters;
$("entryFiltersBackdrop").onclick = closeEntryFilters;
$("applyEntryFilters").onclick = closeEntryFilters;
$("resetEntryFilters").onclick = () => {
  $("keywordSearch").value = "";
  $("filter").value = "all";
  $("categoryFilter").value = "all";
  $("dateSort").value = "desc";
  render();
};
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeEntryFilters();
});
$("monthSelect").onchange = (e) => goToMonth(e.target.value);
$("prev").onclick = () => shift(-1);
$("next").onclick = () => shift(1);
function shift(n) {
  goToMonth(addMonths(month, n));
}
function resetBudgetForm() {
  $("budgetForm").reset();
  $("editBudgetId").value = "";
  $("budgetSubmit").textContent = "Ajouter / mettre à jour";
  $("cancelBudgetEdit").classList.add("hidden");
}
$("budgetForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("budgetName").value.trim(),
    amount = Number($("budgetAmount").value),
    editId = $("editBudgetId").value;
  const sameName = db.budgets.find((x) => x.month === month && normName(x.name) === normName(name));
  if (editId) {
    const b = db.budgets.find((x) => x.id === editId);
    if (!b) return resetBudgetForm();
    if (sameName && sameName.id !== editId) {
      toast("Un budget « " + sameName.name + " » existe déjà ce mois-ci.", { type: "error" });
      return;
    }
    b.name = name;
    b.amount = amount;
    toast("Budget « " + name + " » mis à jour.");
  } else if (sameName) sameName.amount = amount;
  else db.budgets.push({ id: uid(), name, amount, month });
  save();
  resetBudgetForm();
  render();
});
$("cancelBudgetEdit").onclick = resetBudgetForm;
$("copyBudgetsPrev").onclick = () => {
  let prevMonth = addMonths(month, -1),
    source = budgetsForMonth(prevMonth);
  if (!source.length) {
    toast("Aucun budget défini pour le mois précédent.");
    return;
  }
  source.forEach((src) => {
    let target = db.budgets.find(
      (b) => b.month === month && b.name.toLocaleLowerCase("fr") === src.name.toLocaleLowerCase("fr"),
    );
    if (target) target.amount = src.amount;
    else db.budgets.push({ id: uid(), name: src.name, amount: src.amount, month });
  });
  save();
  render();
  toast(source.length + " budget(s) récupéré(s) de " + monthName(prevMonth) + ".");
};
function editBudget(id) {
  const b = db.budgets.find((x) => x.id === id);
  if (!b) return;
  $("editBudgetId").value = b.id;
  $("budgetName").value = b.name;
  $("budgetAmount").value = b.amount;
  $("budgetSubmit").textContent = "Mettre à jour « " + b.name + " »";
  $("cancelBudgetEdit").classList.remove("hidden");
  $("budgetForm").scrollIntoView({ behavior: "smooth", block: "center" });
  $("budgetName").focus({ preventScroll: true });
}
function deleteBudget(id) {
  const index = db.budgets.findIndex((x) => x.id === id);
  if (index < 0) return;
  const [removed] = db.budgets.splice(index, 1);
  if ($("editBudgetId").value === id) resetBudgetForm();
  save();
  render();
  toast("Budget « " + removed.name + " » supprimé. Les opérations associées sont conservées.", {
    action: {
      label: "Annuler",
      onClick: () => {
        db.budgets.splice(Math.min(index, db.budgets.length), 0, removed);
        save();
        render();
      },
    },
  });
}
$("budgetList").addEventListener("click", (ev) => {
  const btn = ev.target.closest("[data-budget-action]");
  if (!btn) return;
  if (btn.dataset.budgetAction === "edit") editBudget(btn.dataset.id);
  else deleteBudget(btn.dataset.id);
});
$("categoryForm").addEventListener("submit", (e) => {
  e.preventDefault();
  let name = $("categoryName").value.trim();
  if (db.categories.some((c) => normName(c.name) === normName(name))) {
    toast("La catégorie « " + name + " » existe déjà.", { type: "error" });
    return;
  }
  db.categories.push({ id: uid(), name, type: "both" });
  save();
  e.target.reset();
  render();
});
function deleteCategory(id) {
  const index = db.categories.findIndex((x) => x.id === id);
  if (index < 0) return;
  const [removed] = db.categories.splice(index, 1);
  save();
  render();
  toast("Catégorie « " + removed.name + " » supprimée. Les opérations sont conservées.", {
    action: {
      label: "Annuler",
      onClick: () => {
        db.categories.splice(Math.min(index, db.categories.length), 0, removed);
        save();
        render();
      },
    },
  });
}
function saveCategoryRename(row) {
  const c = db.categories.find((x) => x.id === row.dataset.id);
  const name = row.querySelector(".category-rename").value.trim();
  if (!c) return;
  if (!name) {
    toast("Le nom de la catégorie ne peut pas être vide.", { type: "error" });
    return;
  }
  if (db.categories.some((x) => x.id !== c.id && normName(x.name) === normName(name))) {
    toast("La catégorie « " + name + " » existe déjà.", { type: "error" });
    return;
  }
  const oldName = c.name;
  c.name = name;
  editingCategoryId = null;
  save();
  render();
  if (oldName !== name) toast("« " + oldName + " » renommée en « " + name + " ».");
}
$("categoryList").addEventListener("click", (ev) => {
  const btn = ev.target.closest("[data-category-action]");
  if (!btn) return;
  const row = btn.closest(".category-row");
  const action = btn.dataset.categoryAction;
  if (action === "rename") {
    editingCategoryId = row.dataset.id;
    render();
  } else if (action === "cancel") {
    editingCategoryId = null;
    render();
  } else if (action === "save") saveCategoryRename(row);
  else if (action === "delete") deleteCategory(row.dataset.id);
});
$("categoryList").addEventListener("keydown", (ev) => {
  if (!ev.target.matches(".category-rename")) return;
  if (ev.key === "Enter") {
    ev.preventDefault();
    saveCategoryRename(ev.target.closest(".category-row"));
  } else if (ev.key === "Escape") {
    ev.stopPropagation();
    editingCategoryId = null;
    render();
  }
});
document.querySelectorAll("[data-tab]").forEach(
  (b) =>
    (b.onclick = () => {
      document.querySelectorAll("[data-tab]").forEach((x) => x.classList.toggle("active", x === b));
      document
        .querySelectorAll(".tabcontent")
        .forEach((x) => x.classList.toggle("hidden", x.id !== b.dataset.tab));
      if (b.dataset.tab === "stats") renderStats();
    }),
);
$("type").onchange = () => {
  let allowed = [...db.categories].sort((a, b) =>
    a.name.localeCompare(b.name, "fr", { sensitivity: "base" }),
  );
  $("category").innerHTML = allowed
    .map((c) => '<option value="' + c.id + '">' + esc(c.name) + "</option>")
    .join("");
};
$("date").value = todayISO();
function updateProfileToggle() {
  [
    ["perso", $("profilePerso")],
    ["cc", $("profileCC")],
  ].forEach(([p, b]) => {
    b.classList.toggle("active", profile === p);
    b.setAttribute("aria-pressed", String(profile === p));
  });
  document.querySelector(".top").classList.toggle("profile-cc", profile === "cc");
  $("autoRecurring").checked = db.autoRecurring !== false;
  refreshThemeColor();
}
// La barre du navigateur / de l'appli installée suit la couleur du profil.
function refreshThemeColor() {
  if ($("sharedCalcPage").classList.contains("open")) return;
  setThemeColor(THEME_COLORS[profile] || THEME_COLORS.perso);
}
window.refreshThemeColor = refreshThemeColor;
$("autoRecurring").addEventListener("change", (e) => {
  db.autoRecurring = e.target.checked;
  save();
  if (e.target.checked) {
    ensureRecurringForMonth(month);
    render();
  }
  toast(e.target.checked ? "Ajout automatique des récurrentes activé." : "Ajout automatique désactivé.");
});
function switchProfile(next) {
  if (next === profile) return;
  save();
  profile = next;
  localStorage.setItem(PROFILE_KEY, profile);
  loadData();
  editingCategoryId = null;
  resetBudgetForm();
  updateProfileToggle();
  goToMonth(month);
}
$("profilePerso").onclick = () => switchProfile("perso");
$("profileCC").onclick = () => switchProfile("cc");
updateProfileToggle();
goToMonth(month);
// Paramètres : export et import des données locales Perso / CC.
function readProfileForBackup(p) {
  const raw = localStorage.getItem(p === "cc" ? KEY + "-cc" : KEY);
  if (!raw) return freshDataForProfile(p);
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error("Les données du profil " + p.toUpperCase() + " sont illisibles.");
  }
}
function freshDataForProfile(p) {
  return {
    categories: defaults.categories.map((c) => ({ ...c })),
    budgets: p === "cc" ? [] : defaults.budgets.map((b) => ({ ...b })),
    entries: [],
    openings: {},
    transfers: {},
  };
}
async function exportBackup(which) {
  try {
    const profiles = {};
    if (which === "perso" || which === "both") profiles.perso = readProfileForBackup("perso");
    if (which === "cc" || which === "both") profiles.cc = readProfileForBackup("cc");
    const backup = { app: "suivi-depenses", version: 1, exportedAt: new Date().toISOString(), profiles };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const fileName = "suivi-depenses-" + which + "-" + new Date().toISOString().slice(0, 10) + ".json";
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: fileName,
          types: [
            { description: "Sauvegarde Suivi dépenses (JSON)", accept: { "application/json": [".json"] } },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        $("settingsStatus").textContent = "Sauvegarde enregistrée : " + fileName;
        return;
      } catch (err) {
        if (err && err.name === "AbortError") return; /* fallback navigateur */
      }
    }
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    $("settingsStatus").textContent =
      "Export lancé : " +
      fileName +
      ". Le navigateur choisit le dossier de téléchargement, selon ses paramètres.";
  } catch (err) {
    toast("Impossible de créer la sauvegarde : " + err.message, { type: "error" });
  }
}

$("clearMonthEntries").onclick = () => {
  const monthItems = db.entries.filter((e) => String(e.date || "").slice(0, 7) === month);
  if (!monthItems.length) {
    toast("Aucune opération à effacer pour " + monthName(month) + ".");
    return;
  }
  const label = new Date(month + "-02T12:00:00").toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });
  const profileLabel = profile === "cc" ? "CC" : "Perso";
  if (
    !confirm(
      "ATTENTION — Effacer les " +
        monthItems.length +
        " opération(s) de " +
        label +
        " dans le profil " +
        profileLabel +
        " ?\n\nSeules les opérations datées de ce mois seront supprimées. Les opérations des autres mois, catégories, budgets, soldes et transferts seront conservés. Cette action est irréversible sans sauvegarde.",
    )
  )
    return;
  const ids = new Set(monthItems.map((e) => e.id));
  const before = db.entries.slice();
  db.entries = db.entries.filter((e) => !ids.has(e.id));
  save();
  render();
  toast(monthItems.length + " opération(s) supprimée(s) pour " + label + " (" + profileLabel + ").", {
    duration: 10000,
    action: {
      label: "Annuler",
      onClick: () => {
        db.entries = before;
        save();
        render();
      },
    },
  });
};
$("exportPerso").onclick = () => exportBackup("perso");
$("exportCC").onclick = () => exportBackup("cc");
$("exportBoth").onclick = () => exportBackup("both");
$("chooseImport").onclick = () => {
  $("importFile").value = "";
  $("importFile").click();
};
$("importFile").addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    const backup = JSON.parse(await file.text());
    if (
      !backup ||
      backup.app !== "suivi-depenses" ||
      backup.version !== 1 ||
      !backup.profiles ||
      typeof backup.profiles !== "object"
    )
      throw new Error("Ce fichier ne semble pas être une sauvegarde Suivi dépenses valide.");
    const included = Object.keys(backup.profiles).filter((p) => p === "perso" || p === "cc");
    if (!included.length) throw new Error("Aucun profil Perso ou CC trouvé dans ce fichier.");
    for (const p of included) {
      const d = backup.profiles[p];
      if (
        !d ||
        !Array.isArray(d.entries) ||
        !Array.isArray(d.categories) ||
        !Array.isArray(d.budgets) ||
        typeof d.openings !== "object"
      )
        throw new Error("Les données du profil " + p.toUpperCase() + " sont incomplètes ou invalides.");
    }
    const names = included.map((p) => (p === "perso" ? "Perso" : "CC")).join(" et ");
    if (
      !confirm(
        "Importer " +
          names +
          " depuis « " +
          file.name +
          " » ? Les données actuelles de " +
          names +
          " seront remplacées. Cette action ne peut pas être annulée sans sauvegarde.",
      )
    )
      return;
    for (const p of included)
      localStorage.setItem(p === "cc" ? KEY + "-cc" : KEY, JSON.stringify(backup.profiles[p]));
    if (included.includes(profile)) {
      loadData();
      updateProfileToggle();
      goToMonth(month);
    }
    $("settingsStatus").textContent = "Import terminé pour : " + names + ".";
    toast("Import terminé pour : " + names + ".");
  } catch (err) {
    toast("Import impossible : " + err.message, { type: "error", duration: 8000 });
  } finally {
    e.target.value = "";
  }
});
