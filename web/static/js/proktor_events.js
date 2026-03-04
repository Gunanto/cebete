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
      const scope = String(fd.get("scope") || "user");
      const attemptID = Number(fd.get("attempt_id") || 0);
      const examID = Number(fd.get("exam_id") || 0);
      const classID = Number(fd.get("class_id") || 0);
      const limit = Number(fd.get("limit") || 100);
      let url = "";
      if (scope === "exam") {
        if (examID <= 0) {
          deps.setMsg("Pilih ujian terlebih dahulu.");
          return;
        }
        url =
          "/api/v1/exams/" +
          examID +
          "/events?limit=" +
          encodeURIComponent(String(limit));
      } else if (scope === "class") {
        if (examID <= 0 || classID <= 0) {
          deps.setMsg("Pilih ujian dan kelas terlebih dahulu.");
          return;
        }
        url =
          "/api/v1/exams/" +
          examID +
          "/classes/" +
          classID +
          "/events?limit=" +
          encodeURIComponent(String(limit));
      } else {
        if (attemptID <= 0) {
          deps.setMsg("Attempt peserta tidak valid.");
          return;
        }
        url =
          "/api/v1/attempts/" +
          attemptID +
          "/events?limit=" +
          encodeURIComponent(String(limit));
      }
      const done = deps.beginBusy(
        deps.eventsForm,
        deps.msg,
        "Memuat event ujian...",
      );
      try {
        const items = await deps.api(url, "GET");
        if (!deps.eventsBody) return;
        if (!Array.isArray(items) || !items.length) {
          deps.eventsBody.innerHTML =
            '<tr><td colspan="5" class="muted">Tidak ada event ditemukan.</td></tr>';
          deps.setMsg("Data event kosong.");
          return;
        }
        deps.eventsBody.innerHTML = "";
        items.forEach(function (it) {
          const tr = document.createElement("tr");
          var payloadText = "";
          if (it.payload && typeof it.payload === "object") {
            try {
              payloadText = JSON.stringify(it.payload);
            } catch (err) {
              payloadText = String(it.payload);
            }
          } else {
            payloadText = String(it.payload || "{}");
          }
          tr.innerHTML = [
            "<td>" + deps.escapeHtml(String(it.attempt_id || "-")) + "</td>",
            "<td>" + deps.escapeHtml(deps.fmtDate(it.server_ts)) + "</td>",
            "<td>" + deps.escapeHtml(String(it.event_type || "")) + "</td>",
            "<td>" + deps.escapeHtml(String(it.actor_user_id || "-")) + "</td>",
            "<td><code>" + deps.escapeHtml(payloadText) + "</code></td>",
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
