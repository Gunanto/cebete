(function () {
  var deps = null;

  function setDeps(opts) {
    deps = opts || {};
  }

  function safeText(value) {
    return String(value || "").trim();
  }

  function summarizePayload(action, payload) {
    if (!payload || typeof payload !== "object") return "-";
    if (action === "exam_regrade") {
      const examID = safeText(payload.exam_id);
      const regraded = Number(payload.regraded_attempts || 0);
      const skipped = Number(payload.skipped_in_progress || 0);
      return (
        "Exam " +
        (examID || "-") +
        " | ulang " +
        regraded +
        " | lewat " +
        skipped
      );
    }
    if (action === "question_answer_key_update") {
      const qid = safeText(payload.question_id);
      const ver = safeText(payload.version_no);
      return "Soal " + (qid || "-") + " v" + (ver || "-");
    }
    try {
      const raw = JSON.stringify(payload);
      if (raw.length > 160) return raw.slice(0, 157) + "...";
      return raw;
    } catch (_) {
      return "-";
    }
  }

  function renderRows(rows) {
    if (!deps || !deps.auditBody) return;
    const items = Array.isArray(rows) ? rows : [];
    if (!items.length) {
      deps.auditBody.innerHTML =
        '<tr><td colspan="5" class="muted">Belum ada data audit.</td></tr>';
      return;
    }
    deps.auditBody.innerHTML = "";
    items.forEach(function (it) {
      const tr = document.createElement("tr");
      const userLabel = [];
      if (it && it.user_name) userLabel.push(String(it.user_name));
      if (it && it.user_id) userLabel.push("#" + String(it.user_id));
      if (it && it.user_role) userLabel.push(String(it.user_role));
      const userText = userLabel.length ? userLabel.join(" ") : "-";
      const entityType = safeText(it && it.entity_type);
      const entityID = safeText(it && it.entity_id);
      const entityText = [entityType, entityID]
        .filter(Boolean)
        .join(" ");
      const payload = it && it.payload ? it.payload : {};
      tr.innerHTML = [
        "<td>" + deps.escapeHtml(deps.fmtDate(it.created_at)) + "</td>",
        "<td>" + deps.escapeHtml(userText) + "</td>",
        "<td>" + deps.escapeHtml(String(it.action || "-")) + "</td>",
        "<td>" + deps.escapeHtml(entityText || "-") + "</td>",
        "<td>" +
          deps.escapeHtml(summarizePayload(String(it.action || ""), payload)) +
          "</td>",
      ].join("");
      deps.auditBody.appendChild(tr);
    });
  }

  function buildQuery() {
    if (!deps) return "";
    var params = new URLSearchParams();
    var action = safeText(deps.auditAction && deps.auditAction.value);
    var entityType = safeText(deps.auditEntityType && deps.auditEntityType.value);
    var entityID = safeText(deps.auditEntityID && deps.auditEntityID.value);
    var userID = safeText(deps.auditUserID && deps.auditUserID.value);
    var limit = safeText(deps.auditLimit && deps.auditLimit.value);
    if (action) params.set("action", action);
    if (entityType) params.set("entity_type", entityType);
    if (entityID) params.set("entity_id", entityID);
    if (userID) params.set("user_id", userID);
    if (limit) params.set("limit", limit);
    var qs = params.toString();
    return qs ? "?" + qs : "";
  }

  async function loadAuditLogs() {
    if (!deps || typeof deps.api !== "function") return;
    const done = deps.beginBusy(
      deps.auditPanel || deps.auditForm,
      deps.msg,
      "Memuat audit log...",
    );
    try {
      const rows = await deps.api(
        "/api/v1/admin/audit-logs" + buildQuery(),
        "GET",
      );
      renderRows(rows);
      deps.setMsg("Audit log berhasil dimuat.");
    } catch (err) {
      renderRows([]);
      deps.setMsg("Gagal memuat audit log: " + err.message);
    } finally {
      done();
    }
  }

  function bindHandlers() {
    if (!deps) return;
    if (deps.auditRefreshBtn) {
      deps.auditRefreshBtn.addEventListener("click", function () {
        loadAuditLogs();
      });
    }
    if (deps.auditForm) {
      deps.auditForm.addEventListener("submit", function (e) {
        e.preventDefault();
        loadAuditLogs();
      });
    }
  }

  function init(opts) {
    setDeps(opts);
    bindHandlers();
  }

  window.ProktorAudit = {
    init: init,
    loadAuditLogs: loadAuditLogs,
  };
})();
