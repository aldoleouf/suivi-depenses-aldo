(() => {
  const KEY = "suivi-depenses-repartition-v1",
    $ = (id) => document.getElementById(id),
    money = (n) =>
      new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(n) || 0),
    num = (id) => Math.max(0, Number($(id).value) || 0),
    uid = () => Math.random().toString(36).slice(2, 10);
  const HISTORY_KEY = KEY + "-history";
  const escHistory = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  function readHistory() {
    try {
      const h = JSON.parse(localStorage.getItem(HISTORY_KEY));
      return Array.isArray(h) ? h : [];
    } catch (e) {
      return [];
    }
  }
  function currentSnapshot() {
    const rate = num("scRate") || 78,
      meGross = num("scMeGross"),
      meNet = num("scMeNet"),
      meTR = num("scMeTR"),
      emmaGross = num("scEmmaGross"),
      emmaNet = num("scEmmaNet"),
      emmaTR = num("scEmmaTR");
    const meBase = meNet + meTR,
      emmaBase = emmaNet + emmaTR,
      base = meBase + emmaBase,
      meRatio = base ? meBase / base : 0.5;
    let total = 0,
      meBefore = 0,
      emmaBefore = 0;
    const expenses = state.expenses.map((e) => ({ ...e }));
    expenses.forEach((e) => {
      const a = Math.max(0, Number(e.amount) || 0);
      total += a;
      meBefore += e.mode === "equal" ? a / 2 : a * meRatio;
      emmaBefore += e.mode === "equal" ? a / 2 : a * (1 - meRatio);
    });
    const meUsed = state.meDeductTR ? Math.min(meBefore, meTR) : 0,
      emmaUsed = state.emmaDeductTR ? Math.min(emmaBefore, emmaTR) : 0;
    return {
      rate,
      meGross,
      meNet,
      meTR,
      emmaGross,
      emmaNet,
      emmaTR,
      meDeductTR: !!state.meDeductTR,
      emmaDeductTR: !!state.emmaDeductTR,
      expenses,
      summary: {
        total,
        meBefore,
        emmaBefore,
        meUsed,
        emmaUsed,
        meTotal: meBefore - meUsed,
        emmaTotal: emmaBefore - emmaUsed,
        meRatio,
        emmaRatio: 1 - meRatio,
      },
    };
  }
  function renderHistory() {
    const root = $("scHistoryList");
    if (!root) return;
    const history = readHistory();
    if (!history.length) {
      root.innerHTML = '<p class="sc-muted">Aucun historique enregistré pour le moment.</p>';
      return;
    }
    const now = currentSnapshot();
    root.innerHTML = history
      .slice()
      .reverse()
      .map((item) => {
        const s = item.snapshot || {},
          a = s.summary || {},
          d = (x, y) => money((Number(x) || 0) - (Number(y) || 0)),
          date = new Date(item.date).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
        return (
          '<article style="border:1px solid #dbe3ef;border-radius:12px;padding:12px;margin-top:10px;background:#f8fafc;color:#172033"><div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><strong>' +
          escHistory(date) +
          '</strong><button class="sc-delete" type="button" data-history-delete="' +
          escHistory(item.id) +
          '" aria-label="Supprimer cet historique">✕</button></div><div class="sc-muted" style="margin:8px 0">Salaires nets — Moi : <b>' +
          money(s.meNet) +
          "</b> · Emma : <b>" +
          money(s.emmaNet) +
          "</b><br>Bruts — Moi : " +
          money(s.meGross) +
          " · Emma : " +
          money(s.emmaGross) +
          "<br>Tickets restaurant — Moi : " +
          money(s.meTR) +
          " · Emma : " +
          money(s.emmaTR) +
          '</div><div class="sc-line"><span>Total des dépenses enregistré</span><b>' +
          money(a.total) +
          '</b></div><div class="sc-line"><span>À payer par moi</span><b>' +
          money(a.meTotal) +
          ' <small style="font-weight:500;color:' +
          (Math.abs((Number(a.meTotal) || 0) - now.summary.meTotal) < 0.005
            ? "#64748b"
            : (Number(a.meTotal) || 0) > now.summary.meTotal
              ? "#b45309"
              : "#0f766e") +
          '">(écart actuel : ' +
          d(now.summary.meTotal, a.meTotal) +
          ')</small></b></div><div class="sc-line"><span>À payer par Emma</span><b>' +
          money(a.emmaTotal) +
          ' <small style="font-weight:500;color:' +
          (Math.abs((Number(a.emmaTotal) || 0) - now.summary.emmaTotal) < 0.005
            ? "#64748b"
            : (Number(a.emmaTotal) || 0) > now.summary.emmaTotal
              ? "#b45309"
              : "#0f766e") +
          '">(écart actuel : ' +
          d(now.summary.emmaTotal, a.emmaTotal) +
          ')</small></b></div><div class="sc-line"><span>Total dépenses vs actuel</span><b>' +
          d(now.summary.total, a.total) +
          '</b></div><details style="margin-top:8px"><summary style="cursor:pointer;font-weight:700">Voir les dépenses enregistrées</summary><div class="sc-muted" style="margin-top:8px">' +
          (Array.isArray(s.expenses) && s.expenses.length
            ? s.expenses
                .map(
                  (e) =>
                    '<div class="sc-line"><span>' +
                    escHistory(e.name || "Dépense sans nom") +
                    " (" +
                    (e.mode === "equal" ? "50/50" : "prorata") +
                    ")</span><b>" +
                    money(e.amount) +
                    "</b></div>",
                )
                .join("")
            : "Aucune dépense enregistrée") +
          "</div></details></article>"
        );
      })
      .join("");
  }
  function exportRepartitionBackup() {
    const backup = {
      app: "suivi-depenses-repartition",
      version: 1,
      exportedAt: new Date().toISOString(),
      current: currentSnapshot(),
      history: readHistory(),
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
      fileName = "sauvegarde-repartition-" + new Date().toISOString().slice(0, 10) + ".json";
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    $("scBackupStatus").textContent = "Export lancé : " + fileName;
  }
  let state = {
    meGross: 0,
    meNet: 0,
    meTR: 0,
    emmaGross: 0,
    emmaNet: 0,
    emmaTR: 0,
    meDeductTR: false,
    emmaDeductTR: false,
    rate: 78,
    expenses: [],
  };
  try {
    const old = JSON.parse(localStorage.getItem(KEY));
    if (old && typeof old === "object")
      state = { ...state, ...old, expenses: Array.isArray(old.expenses) ? old.expenses : [] };
  } catch (e) {}
  function save() {
    localStorage.setItem(KEY, JSON.stringify(state));
  }
  function hydrate() {
    [
      ["scRate", "rate"],
      ["scMeGross", "meGross"],
      ["scMeNet", "meNet"],
      ["scMeTR", "meTR"],
      ["scEmmaGross", "emmaGross"],
      ["scEmmaNet", "emmaNet"],
      ["scEmmaTR", "emmaTR"],
    ].forEach(([id, k]) => {
      $(id).value = state[k] ?? "";
    });
    $("scMeDeductTR").checked = !!state.meDeductTR;
    $("scEmmaDeductTR").checked = !!state.emmaDeductTR;
    renderRows();
    calculate();
  }
  const editingExpenseIds = new Set();
  function renderRows() {
    const root = $("scExpenseRows");
    if (!state.expenses.length) {
      root.innerHTML =
        '<div class="sc-muted" style="padding:18px 0;text-align:center">Aucune dépense à répartir pour le moment.</div>';
      return;
    }
    root.innerHTML = [...state.expenses]
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "fr", { sensitivity: "base" }))
      .map((e) => {
        const editing = editingExpenseIds.has(e.id);
        return (
          '<div class="sc-row sc-expense" data-id="' +
          e.id +
          '">' +
          (editing
            ? '<div class="sc-edit-fields"><div class="sc-field"><label for="scName' +
              e.id +
              '">Dépense / budget</label><input id="scName' +
              e.id +
              '" data-k="name" value="' +
              esc(e.name || "") +
              '" placeholder="Ex. Crédit, courses…"></div><div class="sc-field"><label for="scAmount' +
              e.id +
              '">Montant (€)</label><input id="scAmount' +
              e.id +
              '" data-k="amount" type="number" inputmode="decimal" min="0" step=".01" value="' +
              (Number(e.amount) || "") +
              '" placeholder="0,00"></div><div class="sc-field sc-mode"><label for="scMode' +
              e.id +
              '">Répartition</label><select id="scMode' +
              e.id +
              '" data-k="mode"><option value="ratio" ' +
              (e.mode !== "equal" ? "selected" : "") +
              '>Au prorata</option><option value="equal" ' +
              (e.mode === "equal" ? "selected" : "") +
              ">Égale (50/50)</option></select></div></div>"
            : '<div class="sc-expense-summary"><div class="sc-expense-title">' +
              esc(e.name || "Nouvelle dépense") +
              '</div><div class="sc-expense-meta">' +
              money(e.amount) +
              " · " +
              (e.mode === "equal" ? "50/50" : "Au prorata") +
              '</div><div class="sc-expense-shares">Moi : <b id="scLineMe' +
              e.id +
              '">0,00 €</b><span> · </span>Emma : <b id="scLineEmma' +
              e.id +
              '">0,00 €</b></div></div>') +
          '<div class="sc-controls"><button class="sc-btn sc-edit" type="button" data-edit="' +
          e.id +
          '" aria-label="' +
          (editing ? "Terminer la modification" : "Modifier cette dépense") +
          '">' +
          (editing ? "✓" : "✎") +
          '</button><button class="sc-delete" type="button" data-delete="' +
          e.id +
          '" aria-label="Supprimer cette dépense">✕</button></div>' +
          (editing
            ? '<div class="sc-muted sc-edit-hint">Modifie les champs ci-dessus, puis appuie sur ✓ pour terminer.</div>'
            : "") +
          "</div>"
        );
      })
      .join("");
  }
  function esc(v) {
    return String(v ?? "").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  }
  function calculate() {
    const meBase = num("scMeNet") + num("scMeTR"),
      emmaBase = num("scEmmaNet") + num("scEmmaTR"),
      baseTotal = meBase + emmaBase,
      meRatio = baseTotal ? meBase / baseTotal : 0.5,
      emmaRatio = 1 - meRatio;
    $("scMeBase").textContent = money(meBase);
    $("scEmmaBase").textContent = money(emmaBase);
    $("scMeRatio").textContent = (meRatio * 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " %";
    $("scEmmaRatio").textContent =
      (emmaRatio * 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " %";
    let total = 0,
      meBefore = 0,
      emmaBefore = 0;
    const lineTotals = [];
    state.expenses.forEach((e) => {
      const amount = Math.max(0, Number(e.amount) || 0),
        m = e.mode === "equal" ? amount / 2 : amount * meRatio,
        em = e.mode === "equal" ? amount / 2 : amount * emmaRatio;
      total += amount;
      meBefore += m;
      emmaBefore += em;
      lineTotals.push({ e, m, em });
    });
    let meUsed = state.meDeductTR ? Math.min(meBefore, num("scMeTR")) : 0,
      emmaUsed = state.emmaDeductTR ? Math.min(emmaBefore, num("scEmmaTR")) : 0;
    lineTotals.forEach(({ e, m, em }) => {
      const ml = $("scLineMe" + e.id),
        el = $("scLineEmma" + e.id);
      if (ml) ml.textContent = money(m);
      if (el) el.textContent = money(em);
    });
    const meTotal = meBefore - meUsed,
      emmaTotal = emmaBefore - emmaUsed;
    $("scGrandTotal").textContent = money(total);
    $("scMeBefore").textContent = money(meBefore);
    $("scEmmaBefore").textContent = money(emmaBefore);
    $("scMeUsed").textContent = money(meUsed);
    $("scEmmaUsed").textContent = money(emmaUsed);
    $("scMeTotal").textContent = money(meTotal);
    $("scEmmaTotal").textContent = money(emmaTotal);
    renderHistory();
  }

  function commit() {
    state.rate = num("scRate") || 78;
    state.meGross = num("scMeGross");
    state.meNet = num("scMeNet");
    state.meTR = num("scMeTR");
    state.emmaGross = num("scEmmaGross");
    state.emmaNet = num("scEmmaNet");
    state.emmaTR = num("scEmmaTR");
    save();
    calculate();
  }
  [
    ["scRate", "rate"],
    ["scMeGross", "meGross"],
    ["scMeNet", "meNet"],
    ["scMeTR", "meTR"],
    ["scEmmaGross", "emmaGross"],
    ["scEmmaNet", "emmaNet"],
    ["scEmmaTR", "emmaTR"],
  ].forEach(([id, key]) =>
    $(id).addEventListener("input", () => {
      const rate = num("scRate") / 100 || 0.78;
      if (id.endsWith("Gross")) {
        const netId = id === "scMeGross" ? "scMeNet" : "scEmmaNet";
        $(netId).value = (num(id) * rate).toFixed(2);
      } else if (id.endsWith("Net")) {
        const grossId = id === "scMeNet" ? "scMeGross" : "scEmmaGross";
        $(grossId).value = (num(id) / rate).toFixed(2);
      }
      commit();
    }),
  );
  $("scMeDeductTR").addEventListener("change", (e) => {
    state.meDeductTR = e.target.checked;
    save();
    calculate();
  });
  $("scEmmaDeductTR").addEventListener("change", (e) => {
    state.emmaDeductTR = e.target.checked;
    save();
    calculate();
  });
  $("scAddExpense").addEventListener("click", () => {
    const id = uid();
    state.expenses.push({ id, name: "", amount: 0, mode: "ratio" });
    editingExpenseIds.add(id);
    save();
    renderRows();
    calculate();
    const field = $("scName" + id);
    if (field) field.focus();
  });
  $("scExpenseRows").addEventListener("input", (e) => {
    const row = e.target.closest(".sc-row");
    if (!row) return;
    const item = state.expenses.find((x) => x.id === row.dataset.id);
    if (!item) return;
    const k = e.target.dataset.k;
    if (!k) return;
    item[k] = k === "amount" ? Math.max(0, Number(e.target.value) || 0) : e.target.value;
    save();
    calculate();
  });
  $("scExpenseRows").addEventListener("change", (e) => {
    const row = e.target.closest(".sc-row");
    if (!row) return;
    const item = state.expenses.find((x) => x.id === row.dataset.id);
    if (!item) return;
    const k = e.target.dataset.k;
    if (!k) return;
    item[k] =
      k === "tr"
        ? e.target.checked
        : k === "amount"
          ? Math.max(0, Number(e.target.value) || 0)
          : e.target.value;
    save();
    calculate();
  });
  $("scExpenseRows").addEventListener("click", (e) => {
    const editId = e.target.closest("[data-edit]")?.dataset.edit;
    if (editId) {
      if (editingExpenseIds.has(editId)) editingExpenseIds.delete(editId);
      else editingExpenseIds.add(editId);
      renderRows();
      calculate();
      return;
    }
    const id = e.target.closest("[data-delete]")?.dataset.delete;
    if (!id) return;
    editingExpenseIds.delete(id);
    const previous = state.expenses.slice();
    const removed = previous.find((x) => x.id === id);
    state.expenses = state.expenses.filter((x) => x.id !== id);
    save();
    renderRows();
    calculate();
    toast("« " + (removed?.name || "Dépense") + " » supprimée.", {
      action: {
        label: "Annuler",
        onClick: () => {
          state.expenses = previous;
          save();
          renderRows();
          calculate();
        },
      },
    });
  });
  $("sharedCalcOpen").addEventListener("click", () => {
    $("sharedCalcPage").classList.add("open");
    document.body.style.overflow = "hidden";
    window.setThemeColor?.(window.THEME_COLORS.repartition);
    hydrate();
  });
  function close() {
    $("sharedCalcPage").classList.remove("open");
    document.body.style.overflow = "";
    window.refreshThemeColor?.();
  }
  $("sharedCalcBack").addEventListener("click", close);
  $("scExportBackup").addEventListener("click", exportRepartitionBackup);
  $("scSaveHistory").addEventListener("click", () => {
    commit();
    const history = readHistory(),
      snapshot = currentSnapshot();
    history.push({ id: uid(), date: new Date().toISOString(), snapshot });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    $("scBackupStatus").textContent = "Historique enregistré le " + new Date().toLocaleString("fr-FR") + ".";
    renderHistory();
  });
  $("scHistoryList").addEventListener("click", (e) => {
    const id = e.target.closest("[data-history-delete]")?.dataset.historyDelete;
    if (!id) return;
    const before = readHistory();
    localStorage.setItem(HISTORY_KEY, JSON.stringify(before.filter((x) => x.id !== id)));
    renderHistory();
    toast("Entrée de l’historique supprimée.", {
      action: {
        label: "Annuler",
        onClick: () => {
          localStorage.setItem(HISTORY_KEY, JSON.stringify(before));
          renderHistory();
        },
      },
    });
  });

  const rateInit = num("scRate") || 78;
  hydrate();
})();
