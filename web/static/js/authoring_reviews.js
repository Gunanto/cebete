(function () {
  var deps = null;

  function setDeps(opts) {
    deps = opts || {};
  }

  function formatLocalDate(ts) {
    if (!ts) return "-";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return String(ts);
    return d.toLocaleString("id-ID");
  }

  function renderReviewTasks(items) {
    if (!deps || !deps.reviewTaskList) return;
    if (!Array.isArray(items) || items.length === 0) {
      deps.reviewTaskList.innerHTML =
        '<p class="muted">Belum ada review task untuk filter ini.</p>';
      return;
    }

    const blocks = items.map(function (it) {
      const note = it.note ? deps.escapeHtml(String(it.note)) : "-";
      const examID =
        it.exam_id === null || typeof it.exam_id === "undefined"
          ? "-"
          : deps.escapeHtml(String(it.exam_id));
      return [
        '<article class="review-item">',
        "<div><strong>Task #" +
          deps.escapeHtml(String(it.id)) +
          "</strong> | status: <strong>" +
          deps.escapeHtml(String(it.status || "")) +
          "</strong></div>",
        "<div>QID: " +
          deps.escapeHtml(String(it.question_id || "")) +
          " | QVID: " +
          deps.escapeHtml(String(it.question_version_id || "")) +
          " | reviewer: " +
          deps.escapeHtml(String(it.reviewer_id || "")) +
          " | exam: " +
          examID +
          "</div>",
        "<div>Assigned: " +
          deps.escapeHtml(formatLocalDate(it.assigned_at)) +
          " | Reviewed: " +
          deps.escapeHtml(formatLocalDate(it.reviewed_at)) +
          "</div>",
        "<div>Note: " + note + "</div>",
        "</article>",
      ].join("");
    });
    deps.reviewTaskList.innerHTML =
      '<div class="review-list">' + blocks.join("") + "</div>";
  }

  function bindHandlers() {
    if (!deps) return;

    if (deps.reviewCreateForm) {
      deps.reviewCreateForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(deps.reviewCreateForm);
        const done = deps.beginBusy(
          deps.reviewCreateForm,
          deps.message,
          "Membuat review task...",
        );
        try {
          const payload = {
            question_version_id: Number(fd.get("question_version_id") || 0),
            reviewer_id: Number(fd.get("reviewer_id") || 0),
            note: String(fd.get("note") || "").trim(),
          };
          const examRaw = String(fd.get("exam_id") || "").trim();
          if (examRaw !== "") payload.exam_id = Number(examRaw);

          const out = await deps.api("/api/v1/reviews/tasks", "POST", payload);
          if (typeof deps.pretty === "function") deps.pretty(deps.reviewOut, out);
          deps.setMsg("Review task berhasil dibuat.");
        } catch (err) {
          deps.setMsg("Gagal buat review task: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (deps.reviewListForm) {
      deps.reviewListForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(deps.reviewListForm);
        const done = deps.beginBusy(
          deps.reviewListForm,
          deps.message,
          "Memuat daftar review task...",
        );
        try {
          const params = new URLSearchParams();
          const status = String(fd.get("status") || "").trim();
          const reviewerID = String(fd.get("reviewer_id") || "").trim();
          if (status) params.set("status", status);
          if (reviewerID) params.set("reviewer_id", reviewerID);
          const qs = params.toString() ? "?" + params.toString() : "";

          const out = await deps.api("/api/v1/reviews/tasks" + qs, "GET");
          renderReviewTasks(out);
          if (typeof deps.pretty === "function") deps.pretty(deps.reviewOut, out);
          deps.setMsg("Review task berhasil dimuat.");
        } catch (err) {
          deps.setMsg("Gagal muat review task: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (deps.decisionStatus && deps.decisionNoteInput) {
      const syncDecisionRule = function () {
        const mustFill = deps.decisionStatus.value === "perlu_revisi";
        deps.decisionNoteInput.required = mustFill;
      };
      syncDecisionRule();
      deps.decisionStatus.addEventListener("change", syncDecisionRule);
    }

    if (deps.decisionForm) {
      deps.decisionForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(deps.decisionForm);
        const done = deps.beginBusy(
          deps.decisionForm,
          deps.message,
          "Menyimpan keputusan review...",
        );
        try {
          const taskID = Number(fd.get("task_id") || 0);
          const status = String(fd.get("status") || "").trim();
          const note = String(fd.get("note") || "").trim();
          if (status === "perlu_revisi" && !note) {
            deps.setMsg("Alasan wajib diisi jika status perlu_revisi.");
            return;
          }

          const out = await deps.api(
            "/api/v1/reviews/tasks/" + taskID + "/decision",
            "POST",
            { status: status, note: note },
          );
          if (typeof deps.pretty === "function") deps.pretty(deps.reviewOut, out);
          deps.setMsg("Keputusan review berhasil disimpan.");
        } catch (err) {
          deps.setMsg("Gagal simpan keputusan review: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (deps.reviewHistoryForm) {
      deps.reviewHistoryForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(deps.reviewHistoryForm);
        const done = deps.beginBusy(
          deps.reviewHistoryForm,
          deps.message,
          "Memuat riwayat review soal...",
        );
        try {
          const questionID = Number(fd.get("question_id") || 0);
          const out = await deps.api(
            "/api/v1/questions/" + questionID + "/reviews",
            "GET",
          );
          if (typeof deps.pretty === "function") deps.pretty(deps.reviewOut, out);
          deps.setMsg("Riwayat review soal berhasil dimuat.");
        } catch (err) {
          deps.setMsg("Gagal muat riwayat review soal: " + err.message);
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

  window.AuthoringReviews = {
    init: init,
  };
})();
