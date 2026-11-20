// Utilitaires d'interface partagés : notifications (toasts) et couleur de la barre du navigateur.
(() => {
  let region;
  function ensureRegion() {
    if (region) return region;
    region = document.createElement("div");
    region.className = "toast-region";
    region.setAttribute("role", "status");
    region.setAttribute("aria-live", "polite");
    document.body.appendChild(region);
    return region;
  }

  /**
   * Affiche un message discret en bas de l'écran.
   * options.action : { label, onClick } pour proposer un bouton (ex. « Annuler »).
   * options.type : "error" pour un message d'erreur.
   * options.duration : durée d'affichage en ms.
   */
  function toast(message, options = {}) {
    const root = ensureRegion();
    const el = document.createElement("div");
    el.className = "toast" + (options.type === "error" ? " toast-error" : "");
    const text = document.createElement("span");
    text.textContent = message;
    el.appendChild(text);
    let timer;
    const close = () => {
      clearTimeout(timer);
      el.classList.add("toast-leave");
      setTimeout(() => el.remove(), 200);
    };
    if (options.action) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "toast-action";
      btn.textContent = options.action.label;
      btn.addEventListener("click", () => {
        close();
        options.action.onClick();
      });
      el.appendChild(btn);
    }
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "toast-close";
    dismiss.setAttribute("aria-label", "Fermer le message");
    dismiss.textContent = "✕";
    dismiss.addEventListener("click", close);
    el.appendChild(dismiss);
    root.appendChild(el);
    while (root.children.length > 3) root.firstElementChild.remove();
    timer = setTimeout(close, options.duration || (options.action ? 7000 : 3500));
    return close;
  }

  function setThemeColor(color) {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = color;
  }

  // Bloque le défilement de la page tant qu'une fenêtre (.modal) est ouverte.
  const modals = [...document.querySelectorAll(".modal")];
  const syncModalLock = () =>
    document.documentElement.classList.toggle(
      "modal-open",
      modals.some((m) => !m.classList.contains("hidden")),
    );
  const modalObserver = new MutationObserver(syncModalLock);
  modals.forEach((m) => modalObserver.observe(m, { attributes: true, attributeFilter: ["class"] }));
  syncModalLock();

  window.toast = toast;
  window.setThemeColor = setThemeColor;
  window.THEME_COLORS = { perso: "#312e81", cc: "#881337", repartition: "#115e59" };
})();
