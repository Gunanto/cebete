(function () {
  const core = (window.AppCore = window.AppCore || {});

  function text(el, value) {
    if (el) el.textContent = value;
  }

  function html(el, value) {
    if (el) el.innerHTML = value;
  }

  function escapeHtml(input) {
    return String(input || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function beginBusy(container, messageEl, loadingText) {
    if (messageEl && loadingText) text(messageEl, loadingText);
    if (!container) return function () {};

    const controls = [];
    const isForm = !!(container.matches && container.matches("form"));
    if (isForm) {
      // Keep input/select/textarea enabled so FormData values remain readable.
      container.querySelectorAll("button").forEach(function (el) {
        controls.push(el);
      });
    } else {
      if (
        container.matches &&
        container.matches("button, input, select, textarea")
      ) {
        controls.push(container);
      }
      container
        .querySelectorAll("button, input, select, textarea")
        .forEach(function (el) {
          controls.push(el);
        });
    }

    const changed = [];
    controls.forEach(function (el) {
      if (!el.disabled) {
        el.disabled = true;
        changed.push(el);
      }
    });
    if (container.setAttribute) container.setAttribute("aria-busy", "true");

    return function done() {
      changed.forEach(function (el) {
        el.disabled = false;
      });
      if (container.removeAttribute) container.removeAttribute("aria-busy");
    };
  }

  function iconSVGPath(kind) {
    const key = String(kind || "")
      .trim()
      .toLowerCase();
    if (key === "download") {
      return '<path d="M12 4v10" /><path d="M8 10l4 4 4-4" /><path d="M4 18h16" />';
    }
    if (key === "upload") {
      return '<path d="M12 20V10" /><path d="M8 14l4-4 4 4" /><path d="M4 6h16" />';
    }
    if (key === "plus") {
      return '<path d="M12 5v14M5 12h14" />';
    }
    if (key === "left") {
      return '<path d="M15 18l-6-6 6-6" />';
    }
    if (key === "right") {
      return '<path d="M9 18l6-6-6-6" />';
    }
    if (key === "trash") {
      return '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>';
    }
    if (key === "close") {
      return '<path d="M6 6l12 12" /><path d="M18 6l-12 12" />';
    }
    if (key === "check") {
      return '<path d="M20 6L9 17l-5-5" />';
    }
    return '<path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" />';
  }

  function iconKindForButton(el) {
    if (!el) return "";
    const className = String(el.className || "").toLowerCase();
    const txt = String(el.textContent || "")
      .trim()
      .toLowerCase();
    if (!txt) return "";
    if (className.includes("btn-danger") || txt.includes("hapus"))
      return "trash";
    if (
      txt.includes("sebelumnya") ||
      txt.includes("kembali") ||
      txt === "kembali"
    ) {
      return "left";
    }
    if (txt.includes("berikutnya") || txt.includes("lanjut")) return "right";
    if (txt.includes("import") || txt.includes("impor")) return "upload";
    if (
      txt.includes("ekspor") ||
      txt.includes("export") ||
      txt.includes("unduh") ||
      txt.includes("template")
    ) {
      return "download";
    }
    if (
      txt.includes("tambah") ||
      txt.includes("buat") ||
      txt.includes("baru")
    ) {
      return "plus";
    }
    if (
      txt.includes("tutup") ||
      txt.includes("batal") ||
      txt.includes("close")
    ) {
      return "close";
    }
    if (
      txt.includes("simpan") ||
      txt.includes("kirim") ||
      txt.includes("submit")
    ) {
      return "check";
    }
    if (
      txt.includes("muat") ||
      txt.includes("refresh") ||
      txt.includes("cari") ||
      txt.includes("filter")
    ) {
      return "refresh";
    }
    return "";
  }

  function applyAutoIconToButton(el) {
    if (!el || !el.classList) return;
    if (el.classList.contains("icon-only-btn")) return;
    if (el.classList.contains("admin-menu-btn")) return;
    if (el.querySelector(".icon-wrap, .admin-menu-icon, svg")) return;
    if (el.getAttribute("data-auto-iconified") === "1") return;
    const kind = iconKindForButton(el);
    if (!kind) return;
    const iconWrap = document.createElement("span");
    iconWrap.className = "icon-wrap";
    iconWrap.setAttribute("aria-hidden", "true");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("focusable", "false");
    svg.innerHTML = iconSVGPath(kind);
    iconWrap.appendChild(svg);
    el.classList.add("icon-btn");
    el.prepend(iconWrap);
    el.setAttribute("data-auto-iconified", "1");
  }

  function enhanceButtonIcons(root) {
    if (!root || !root.querySelectorAll) return;
    const scan = function (container) {
      if (!container || !container.querySelectorAll) return;
      if (container.matches && container.matches("button.btn, a.btn")) {
        applyAutoIconToButton(container);
      }
      container
        .querySelectorAll("button.btn, a.btn")
        .forEach(applyAutoIconToButton);
    };
    scan(root);
    if (root.getAttribute("data-auto-icon-observer") === "1") return;
    if (typeof MutationObserver !== "function") return;
    const observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        const added = mutation.addedNodes || [];
        for (let i = 0; i < added.length; i += 1) {
          const node = added[i];
          if (!node || node.nodeType !== 1) continue;
          scan(node);
        }
      });
    });
    observer.observe(root, { childList: true, subtree: true });
    root.setAttribute("data-auto-icon-observer", "1");
  }

  core.text = text;
  core.html = html;
  core.escapeHtml = escapeHtml;
  core.beginBusy = beginBusy;
  core.iconSVGPath = iconSVGPath;
  core.iconKindForButton = iconKindForButton;
  core.applyAutoIconToButton = applyAutoIconToButton;
  core.enhanceButtonIcons = enhanceButtonIcons;
})();
