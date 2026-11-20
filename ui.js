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

  /**
   * Petite pluie de confettis (canvas, sans bibliothèque).
   * origin : { x, y } en pixels écran d'où partent les confettis (centre de l'écran par défaut).
   * Ne fait rien si l'appareil demande de réduire les animations.
   */
  function confetti(origin) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = document.createElement("canvas");
    canvas.className = "confetti-canvas";
    canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth,
      h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    const ox = origin?.x ?? w / 2,
      oy = origin?.y ?? h / 2;
    const colors = ["#4f46e5", "#f59e0b", "#10b981", "#ec4899", "#06b6d4", "#facc15", "#8b5cf6"];
    const pieces = Array.from({ length: 140 }, () => {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
      const speed = 7 + Math.random() * 9;
      return {
        x: ox,
        y: oy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        size: 5 + Math.random() * 6,
        color: colors[(Math.random() * colors.length) | 0],
        rot: Math.random() * Math.PI,
        vrot: (Math.random() - 0.5) * 0.35,
        tilt: Math.random() * Math.PI,
        vtilt: 0.08 + Math.random() * 0.12,
        round: Math.random() < 0.25,
      };
    });
    const start = performance.now();
    const duration = 2600;
    function frame(now) {
      const t = now - start;
      ctx.clearRect(0, 0, w, h);
      const fade = t > duration - 600 ? Math.max(0, (duration - t) / 600) : 1;
      for (const p of pieces) {
        p.vx *= 0.985;
        p.vy = p.vy * 0.985 + 0.32;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vrot;
        p.tilt += p.vtilt;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.round) {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2.4, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.scale(1, Math.cos(p.tilt));
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        }
        ctx.restore();
      }
      if (t < duration) requestAnimationFrame(frame);
      else canvas.remove();
    }
    requestAnimationFrame(frame);
  }

  window.confetti = confetti;
  window.toast = toast;
  window.setThemeColor = setThemeColor;
  window.THEME_COLORS = { perso: "#312e81", cc: "#881337", repartition: "#115e59" };
})();
