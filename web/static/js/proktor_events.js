(function () {
  var deps = null;

  function setDeps(opts) {
    deps = opts || {};
  }

  function bindHandlers() {
    if (!deps || !deps.eventsForm) return;
    deps.eventsForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      const fd = new FormData(deps.eventsForm);
      const attemptID = Number(fd.get("attempt_id") || 0);
      const limit = Number(fd.get("limit") || 100);
      if (attemptID <= 0) {
        deps.setMsg("Attempt ID tidak valid.");
        return;
      }
      const done = deps.beginBusy(
        deps.eventsForm,
        deps.msg,
        "Memuat event ujian...",
      );
      try {
        const items = await deps.api(
          "/api/v1/attempts/" +
            attemptID +
            "/events?limit=" +
            encodeURIComponent(String(limit)),
          "GET",
        );
        if (!deps.eventsBody) return;
        if (!Array.isArray(items) || !items.length) {
          deps.eventsBody.innerHTML =
            '<tr><td colspan="4" class="muted">Tidak ada event untuk attempt ini.</td></tr>';
          deps.setMsg("Data event kosong.");
          return;
        }
        deps.eventsBody.innerHTML = "";
        items.forEach(function (it) {
          const tr = document.createElement("tr");
          tr.innerHTML = [
            "<td>" + deps.escapeHtml(deps.fmtDate(it.server_ts)) + "</td>",
            "<td>" + deps.escapeHtml(String(it.event_type || "")) + "</td>",
            "<td>" + deps.escapeHtml(String(it.actor_user_id || "-")) + "</td>",
            "<td><code>" +
              deps.escapeHtml(String(it.payload || "{}")) +
              "</code></td>",
          ].join("");
          deps.eventsBody.appendChild(tr);
        });
        deps.setMsg("Event ujian berhasil dimuat.");
      } catch (err) {
        if (deps.eventsBody) {
          deps.eventsBody.innerHTML =
            '<tr><td colspan="4" class="muted">Gagal memuat event.</td></tr>';
        }
        deps.setMsg("Gagal memuat event: " + err.message);
      } finally {
        done();
      }
    });
  }

  function init(opts) {
    setDeps(opts);
    bindHandlers();
  }

  window.ProktorEvents = {
    init: init,
  };
})();
