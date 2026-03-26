(function () {
  var deps = null;
  var STORAGE_KEY = "cbtlms.proktor.activeExamTokens";
  var pruneTimer = null;

  function setDeps(opts) {
    deps = opts || {};
  }

  function setTokenResult(value) {
    if (!deps || !deps.tokenResult) return;
    deps.text(deps.tokenResult, value);
    deps.tokenResult.classList.remove("muted");
  }

  function readStoredTokens() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var items = JSON.parse(raw);
      return Array.isArray(items) ? items : [];
    } catch (_err) {
      return [];
    }
  }

  function saveStoredTokens(items) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items || []));
    } catch (_err) {
      // ignore storage failures
    }
  }

  function removeStoredToken(examID) {
    var items = readStoredTokens().filter(function (current) {
      return Number((current && current.exam_id) || 0) !== Number(examID || 0);
    });
    saveStoredTokens(items);
    return items;
  }

  function examLabelByID(examID) {
    if (!deps || !deps.tokenExamSelect) return String(examID || "-");
    var selected = Array.from(deps.tokenExamSelect.options || []).find(
      function (opt) {
        return Number(opt.value || 0) === Number(examID || 0);
      },
    );
    if (!selected) return "Ujian #" + String(examID || "-");
    return (
      String(selected.textContent || "").trim() ||
      "Ujian #" + String(examID || "-")
    );
  }

  function isTokenExpired(item, nowMs) {
    var expiresAt = new Date(item && item.expires_at).getTime();
    if (!Number.isFinite(expiresAt)) return true;
    return expiresAt <= nowMs;
  }

  function pruneExpiredTokens() {
    var nowMs = Date.now();
    var items = readStoredTokens().filter(function (item) {
      return !isTokenExpired(item, nowMs);
    });
    saveStoredTokens(items);
    return items;
  }

  function upsertStoredToken(item) {
    var items = pruneExpiredTokens().filter(function (current) {
      return (
        Number((current && current.exam_id) || 0) !== Number(item.exam_id || 0)
      );
    });
    items.unshift(item);
    saveStoredTokens(items);
    return items;
  }

  function remainingLabel(expiresAt) {
    var expiresMs = new Date(expiresAt || "").getTime();
    if (!Number.isFinite(expiresMs)) return "-";
    var diffMs = expiresMs - Date.now();
    if (diffMs <= 0) return "Kedaluwarsa";
    var totalMinutes = Math.ceil(diffMs / 60000);
    if (totalMinutes < 60) return totalMinutes + " menit lagi";
    var hours = Math.floor(totalMinutes / 60);
    var minutes = totalMinutes % 60;
    if (minutes === 0) return hours + " jam lagi";
    return hours + " jam " + minutes + " menit lagi";
  }

  function renderTokenTable(items) {
    if (!deps || !deps.tokenListBody) return;
    var activeItems = Array.isArray(items) ? items : pruneExpiredTokens();
    if (!activeItems.length) {
      deps.tokenListBody.innerHTML =
        '<tr><td colspan="6" class="muted">Belum ada token aktif tersimpan di browser ini.</td></tr>';
      return;
    }
    deps.tokenListBody.innerHTML = "";
    activeItems.forEach(function (item) {
      var tr = document.createElement("tr");
      tr.innerHTML = [
        "<td>" + deps.escapeHtml(String(item.exam_label || "-")) + "</td>",
        "<td><strong>" +
          deps.escapeHtml(String(item.token || "-")) +
          "</strong></td>",
        "<td>" +
          deps.escapeHtml(String(deps.fmtDate(item.generated_at) || "-")) +
          "</td>",
        "<td>" +
          deps.escapeHtml(String(deps.fmtDate(item.expires_at) || "-")) +
          "</td>",
        "<td>" + deps.escapeHtml(remainingLabel(item.expires_at)) + "</td>",
        '<td class="actions">' +
          '<button class="btn btn-secondary btn-inline" type="button" data-token-copy="' +
          deps.escapeHtml(String(item.token || "")) +
          '">Salin</button> ' +
          '<button class="btn btn-secondary btn-inline" type="button" data-token-remove="' +
          deps.escapeHtml(String(item.exam_id || 0)) +
          '">Hapus</button>' +
          "</td>",
      ].join("");
      deps.tokenListBody.appendChild(tr);
    });
  }

  function refreshStoredTokens() {
    renderTokenTable(pruneExpiredTokens());
  }

  function startPruneLoop() {
    if (pruneTimer) return;
    pruneTimer = window.setInterval(function () {
      refreshStoredTokens();
    }, 30000);
  }

  async function copyToken(value) {
    var token = String(value || "").trim();
    if (!token) {
      throw new Error("Token kosong.");
    }
    if (
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      await navigator.clipboard.writeText(token);
      return;
    }
    var input = document.createElement("input");
    input.type = "text";
    input.value = token;
    input.setAttribute("readonly", "readonly");
    input.style.position = "absolute";
    input.style.left = "-9999px";
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    document.body.removeChild(input);
  }

  function bindHandlers() {
    if (!deps || !deps.tokenForm) return;
    deps.tokenForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      const examID = Number(
        (deps.tokenExamSelect && deps.tokenExamSelect.value) || 0,
      );
      const ttlMinutes = Number(
        (deps.tokenTTLInput && deps.tokenTTLInput.value) || 120,
      );
      if (examID <= 0) {
        deps.setMsg("Pilih ujian terlebih dahulu.");
        return;
      }
      const done = deps.beginBusy(
        deps.tokenForm,
        deps.msg,
        "Membuat token ujian...",
      );
      try {
        const out = await deps.api(
          "/api/v1/admin/exams/" + examID + "/token",
          "POST",
          { ttl_minutes: ttlMinutes },
        );
        const expiresAt =
          out && out.expires_at ? deps.fmtDate(out.expires_at) : "-";
        var storedItems = upsertStoredToken({
          exam_id: Number((out && out.exam_id) || examID),
          exam_label: examLabelByID(Number((out && out.exam_id) || examID)),
          token: String((out && out.token) || ""),
          generated_at: out && out.generated_at ? out.generated_at : "",
          expires_at: out && out.expires_at ? out.expires_at : "",
        });
        setTokenResult(
          "Token: " +
            String((out && out.token) || "-") +
            " | Berlaku sampai: " +
            expiresAt,
        );
        renderTokenTable(storedItems);
        deps.setMsg("Token ujian berhasil dibuat.");
      } catch (err) {
        deps.setMsg("Gagal membuat token ujian: " + err.message);
      } finally {
        done();
      }
    });
    if (deps.tokenListBody) {
      deps.tokenListBody.addEventListener("click", async function (e) {
        var copyBtn = e.target && e.target.closest("button[data-token-copy]");
        if (copyBtn) {
          try {
            await copyToken(copyBtn.getAttribute("data-token-copy") || "");
            deps.setMsg("Token berhasil disalin.");
          } catch (err) {
            deps.setMsg("Gagal menyalin token: " + err.message);
          }
          return;
        }
        var removeBtn =
          e.target && e.target.closest("button[data-token-remove]");
        if (!removeBtn) return;
        var examID = Number(removeBtn.getAttribute("data-token-remove") || 0);
        renderTokenTable(removeStoredToken(examID));
        deps.setMsg("Token dihapus dari daftar browser ini.");
      });
    }
  }

  function init(opts) {
    setDeps(opts);
    refreshStoredTokens();
    startPruneLoop();
    bindHandlers();
  }

  window.ProktorToken = {
    init: init,
  };
})();
