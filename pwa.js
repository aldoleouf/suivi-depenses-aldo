if ("serviceWorker" in navigator) {
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {}),
  );
}
(() => {
  let deferredPrompt = null;
  const btn = document.getElementById("installApp"),
    help = document.getElementById("installHelp");
  if (!btn || !help) return;
  const standalone = () =>
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  function showHelp(msg) {
    help.hidden = false;
    help.textContent = msg;
  }
  if (standalone()) {
    btn.hidden = true;
    showHelp("Application installée sur cet appareil.");
    return;
  }
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    btn.hidden = false;
    btn.textContent = "＋ Installer l’application";
    help.hidden = true;
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    btn.hidden = true;
    showHelp("Installation terminée. Tu peux retrouver Suivi dépenses sur ton écran d’accueil.");
  });
  btn.addEventListener("click", async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      try {
        await deferredPrompt.userChoice;
      } catch (e) {}
      deferredPrompt = null;
      return;
    }
    showHelp(
      "Pour installer la PWA : ouvre cette adresse dans Google Chrome (pas dans le navigateur intégré d’une autre application), appuie sur ⋮ puis « Installer l’application ». Si ce choix n’apparaît pas, actualise la page et réessaie.",
    );
  });
})();
