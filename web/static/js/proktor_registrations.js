(function () {
  var deps = null;

  function setDeps(opts) {
    deps = opts || {};
  }

  async function loadPendingRegistrations() {
    if (!deps || typeof deps.api !== "function") return [];
    const out = await deps.api(
      "/api/v1/admin/registrations?status=pending&limit=200&offset=0",
      "GET",
    );
    const items = Array.isArray(out.items) ? out.items : [];
    if (deps.statPending) deps.statPending.textContent = String(items.length);
    if (!deps.regBody) return items;
    if (!items.length) {
      deps.regBody.innerHTML =
        '<tr><td colspan="6" class="muted">Tidak ada pendaftaran pending.</td></tr>';
      return items;
    }
    deps.regBody.innerHTML = "";
    items.forEach(function (it) {
      const tr = document.createElement("tr");
      tr.innerHTML = [
        "<td>" + deps.escapeHtml(String(it.id || "")) + "</td>",
        "<td>" + deps.escapeHtml(String(it.full_name || "")) + "</td>",
        "<td>" + deps.escapeHtml(String(it.email || "")) + "</td>",
        "<td>" + deps.escapeHtml(String(it.role_requested || "")) + "</td>",
        "<td>" + deps.escapeHtml(deps.fmtDate(it.created_at)) + "</td>",
        '<td><span class="action-icons">' +
          '<button class="icon-only-btn" type="button" data-action="approve" data-id="' +
          deps.escapeHtml(String(it.id || "")) +
          '" title="Setujui" aria-label="Setujui">' +
          '<svg viewBox="0 0 24 24" focusable="false"><path d="M5 13l4 4L19 7"/></svg>' +
          "</button>" +
          '<button class="icon-only-btn danger" type="button" data-action="reject" data-id="' +
          deps.escapeHtml(String(it.id || "")) +
          '" title="Tolak" aria-label="Tolak">' +
          '<svg viewBox="0 0 24 24" focusable="false"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
          "</button>" +
          "</span></td>",
      ].join("");
      deps.regBody.appendChild(tr);
    });
    return items;
  }

  function bindHandlers() {
    if (!deps) return;

    if (deps.regRefreshBtn) {
      deps.regRefreshBtn.addEventListener("click", async function () {
        const done = deps.beginBusy(
          deps.regRefreshBtn,
          deps.msg,
          "Memuat pendaftaran pending...",
        );
        try {
          await loadPendingRegistrations();
          deps.setMsg("Data pendaftaran pending berhasil dimuat.");
        } catch (err) {
          deps.setMsg("Gagal memuat pendaftaran pending: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (deps.regBody) {
      deps.regBody.addEventListener("click", async function (e) {
        const btn =
          e.target && e.target.closest("button[data-action][data-id]");
        if (!btn) return;
        const action = String(btn.getAttribute("data-action") || "");
        const id = Number(btn.getAttribute("data-id") || 0);
        if (!id) return;

        const done = deps.beginBusy(btn, deps.msg, "Memproses pendaftaran...");
        try {
          if (action === "approve") {
            await deps.api(
              "/api/v1/admin/registrations/" + id + "/approve",
              "POST",
              {},
            );
            deps.setMsg("Pendaftaran berhasil disetujui.");
          } else if (action === "reject") {
            const note = window.prompt("Alasan penolakan (opsional):", "");
            if (note === null) return;
            await deps.api(
              "/api/v1/admin/registrations/" + id + "/reject",
              "POST",
              {
                note: String(note || "").trim(),
              },
            );
            deps.setMsg("Pendaftaran berhasil ditolak.");
          }
          await loadPendingRegistrations();
        } catch (err) {
          deps.setMsg("Gagal memproses pendaftaran: " + err.message);
        } finally {
          done();
        }
      });
    }
  }

  function init(opts) {
    setDeps(opts);
    bindHandlers();
  }

  window.ProktorRegistrations = {
    init: init,
    loadPendingRegistrations: loadPendingRegistrations,
  };
})();
