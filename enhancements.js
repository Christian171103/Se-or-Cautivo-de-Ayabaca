(function () {
  const root = document.documentElement;
  const fontKey = "cautivo-font-scale";
  const themeKey = "cautivo-theme";
  let scale = Number(localStorage.getItem(fontKey)) || 1;

  function applyScale() {
    scale = Math.max(.9, Math.min(1.35, scale));
    root.style.setProperty("--lyrics-scale", scale);
    localStorage.setItem(fontKey, String(scale));
  }

  function applyTheme(theme) {
    root.dataset.theme = theme;
    localStorage.setItem(themeKey, theme);
    const button = document.querySelector("#modo-lectura");
    if (button) {
      const dark = theme === "dark";
      button.setAttribute("aria-pressed", String(dark));
      button.textContent = dark ? "☀ Modo claro" : "☾ Modo noche";
    }
  }

  document.querySelector("#letra-menos")?.addEventListener("click", () => { scale -= .1; applyScale(); });
  document.querySelector("#letra-mas")?.addEventListener("click", () => { scale += .1; applyScale(); });
  document.querySelector("#modo-lectura")?.addEventListener("click", () => {
    applyTheme(root.dataset.theme === "dark" ? "light" : "dark");
  });

  applyScale();
  applyTheme(localStorage.getItem(themeKey) || "light");

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("service-worker.js").catch(() => {}));
  }
})();
