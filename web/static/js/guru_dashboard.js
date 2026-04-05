(function () {
  var deps = null;
  var isBound = false;
  var activeMenu = "dashboard";

  function setDeps(opts) {
    deps = opts || {};
  }

  function allowedMenuKeys() {
    return [
      "dashboard",
      "reviews",
      "learning-goals",
      "blueprints",
      "manuscripts",
      "exams",
      "enroll",
      "results",
      "score-recap",
      "subjects",
      "guide",
    ];
  }

  function normalizeMenuKey(menu) {
    const key = String(menu || "").trim();
    return allowedMenuKeys().includes(key) ? key : "dashboard";
  }

  function toggleMenuButtons(key) {
    const buttons = Array.from((deps && deps.menuButtons) || []);
    buttons.forEach(function (btn) {
      const active = String(btn.getAttribute("data-guru-menu") || "") === key;
      btn.classList.toggle("active", active);
    });
  }

  function togglePanels(key) {
    if (!deps || !deps.panels) return;
    Object.keys(deps.panels).forEach(function (name) {
      const panel = deps.panels[name];
      if (!panel) return;
      panel.hidden = String(name) !== key;
    });
  }

  function updateHeader(key) {
    if (!deps) return;
    const resolver =
      deps && typeof deps.getMenuInfo === "function" ? deps.getMenuInfo : null;
    const info = resolver ? resolver(key) : null;
    const title = String((info && info.title) || "");
    const desc = String((info && info.desc) || "");
    if (deps.pageTitleEl) deps.pageTitleEl.textContent = title;
    if (deps.pageDescEl) deps.pageDescEl.textContent = desc;
  }

  function activateMenu(menu) {
    const key = normalizeMenuKey(menu);
    activeMenu = key;
    toggleMenuButtons(key);
    togglePanels(key);
    updateHeader(key);
    if (deps && typeof deps.onMenuActivated === "function") {
      deps.onMenuActivated(key);
    }
    return key;
  }

  function bindEvents() {
    if (!deps || isBound) return;
    isBound = true;
    Array.from(deps.menuButtons || []).forEach(function (btn) {
      btn.addEventListener("click", function () {
        activateMenu(btn.getAttribute("data-guru-menu") || "dashboard");
      });
    });
    Array.from(deps.jumpButtons || []).forEach(function (btn) {
      btn.addEventListener("click", function () {
        activateMenu(btn.getAttribute("data-guru-jump") || "dashboard");
      });
    });
  }

  function init(opts) {
    setDeps(opts);
    bindEvents();
  }

  function getActiveMenu() {
    return activeMenu;
  }

  window.GuruDashboard = {
    init: init,
    activateMenu: activateMenu,
    getActiveMenu: getActiveMenu,
  };
})();
