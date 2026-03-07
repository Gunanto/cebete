(function () {
  var deps = null;
  var examsCache = [];
  var schoolsCache = [];
  var classesCache = [];

  function setDeps(opts) {
    deps = opts || {};
  }

  function fillAssignExamOptions(exams) {
    if (!deps || !deps.assignExamIDInput) return;
    const rows = Array.isArray(exams) ? exams : [];
    const current = String(deps.assignExamIDInput.value || "");
    deps.assignExamIDInput.innerHTML =
      '<option value="">Pilih ujian...</option>';
    rows.forEach(function (it) {
      const o = document.createElement("option");
      o.value = String((it && it.id) || "");
      const chunks = [
        String((it && it.code) || "").trim(),
        String((it && it.title) || "").trim(),
        String((it && it.subject_name) || "").trim(),
      ].filter(Boolean);
      o.textContent = chunks.join(" | ");
      if (current && current === o.value) o.selected = true;
      deps.assignExamIDInput.appendChild(o);
    });
  }

  function schoolLabel(it) {
    const name = String((it && it.name) || "").trim();
    const code = String((it && it.code) || "").trim();
    if (!name) return "-";
    return code ? name + " (" + code + ")" : name;
  }

  function fillSchoolOptions(rows) {
    if (!deps || !deps.assignSchoolSelect) return;
    const current = String(deps.assignSchoolSelect.value || "");
    deps.assignSchoolSelect.innerHTML =
      '<option value="">Pilih sekolah...</option>';
    (Array.isArray(rows) ? rows : []).forEach(function (it) {
      const id = Number((it && it.id) || 0);
      if (id <= 0) return;
      const o = document.createElement("option");
      o.value = String(id);
      o.textContent = schoolLabel(it);
      if (current && current === o.value) o.selected = true;
      deps.assignSchoolSelect.appendChild(o);
    });
  }

  function classLabel(it) {
    const grade = String((it && it.grade_level) || "").trim();
    const name = String((it && it.name) || "").trim();
    if (!grade && !name) return "-";
    if (!grade) return name;
    if (!name) return grade;
    return grade + " - " + name;
  }

  function fillClassOptionsBySchool(schoolID) {
    if (!deps || !deps.assignClassSelect) return;
    const id = Number(schoolID || 0);
    const current = String(deps.assignClassSelect.value || "");
    deps.assignClassSelect.innerHTML =
      '<option value="">Pilih kelas...</option>';
    (Array.isArray(classesCache) ? classesCache : []).forEach(function (it) {
      const classID = Number((it && it.id) || 0);
      const itemSchoolID = Number((it && it.school_id) || 0);
      if (classID <= 0) return;
      if (id > 0 && itemSchoolID !== id) return;
      const o = document.createElement("option");
      o.value = String(classID);
      o.textContent = classLabel(it);
      if (current && current === o.value) o.selected = true;
      deps.assignClassSelect.appendChild(o);
    });
  }

  function renderExamAssignments(rows, replace) {
    if (!deps || !deps.examAssignmentsBody) return;
    const items = Array.isArray(rows) ? rows : [];
    if (!items.length) {
      if (replace) {
        deps.examAssignmentsBody.innerHTML =
          '<tr><td colspan="8" class="muted">Belum ada peserta terdaftar.</td></tr>';
      }
      return;
    }
    if (replace) deps.examAssignmentsBody.innerHTML = "";
    items.forEach(function (it) {
      const userID = String((it && it.user_id) || "");
      if (!userID) return;
      const existing = deps.examAssignmentsBody.querySelector(
        'tr[data-user-id="' + CSS.escape(userID) + '"]',
      );
      const tr = existing || document.createElement("tr");
      tr.setAttribute("data-user-id", userID);
      tr.innerHTML = [
        "<td>" + deps.escapeHtml(String(it.user_id || "")) + "</td>",
        "<td>" + deps.escapeHtml(String(it.full_name || "-")) + "</td>",
        "<td>" + deps.escapeHtml(String(it.username || "-")) + "</td>",
        "<td>" + deps.escapeHtml(String(it.role || "-")) + "</td>",
        "<td>" +
          deps.escapeHtml(
            String(it.class_name || it.class_label || it.class_id || "-"),
          ) +
          "</td>",
        "<td>" + deps.escapeHtml(String(it.status || "-")) + "</td>",
        "<td>" + deps.escapeHtml(deps.fmtDate(it.assigned_at)) + "</td>",
        '<td><button class="icon-only-btn danger" type="button" data-exam-assignment-del="' +
          deps.escapeHtml(String(it.user_id || "")) +
          '" title="Keluarkan peserta" aria-label="Keluarkan peserta">' +
          '<svg viewBox="0 0 24 24" focusable="false"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/></svg>' +
          "</button></td>",
      ].join("");
      if (!existing) deps.examAssignmentsBody.appendChild(tr);
    });
  }

  async function loadExamManageTable() {
    if (!deps || typeof deps.api !== "function") return [];
    const exams = await deps.api("/api/v1/admin/exams/manage", "GET");
    examsCache = Array.isArray(exams) ? exams : [];
    fillAssignExamOptions(examsCache);
    return examsCache;
  }

  async function loadSchoolsAndClasses() {
    if (!deps || typeof deps.api !== "function") return;
    const rows = await Promise.all([
      deps.api("/api/v1/admin/schools", "GET"),
      deps.api("/api/v1/admin/classes", "GET"),
    ]);
    schoolsCache = Array.isArray(rows[0]) ? rows[0] : [];
    classesCache = Array.isArray(rows[1]) ? rows[1] : [];
    fillSchoolOptions(schoolsCache);
    fillClassOptionsBySchool(
      (deps.assignSchoolSelect && deps.assignSchoolSelect.value) || "",
    );
  }

  async function loadExamAssignments(examID) {
    const id = Number(examID || 0);
    if (!deps || !deps.examAssignmentsBody || id <= 0) {
      if (deps && deps.examAssignmentsBody) {
        deps.examAssignmentsBody.innerHTML =
          '<tr><td colspan="8" class="muted">Pilih ujian lalu muat peserta ujian.</td></tr>';
      }
      return [];
    }
    const rows = await deps.api("/api/v1/admin/exams/" + id + "/assignments", "GET");
    renderExamAssignments(rows, true);
    return Array.isArray(rows) ? rows : [];
  }

  function bindHandlers() {
    if (!deps) return;

    if (deps.assignSchoolSelect) {
      deps.assignSchoolSelect.addEventListener("change", function () {
        fillClassOptionsBySchool(deps.assignSchoolSelect.value);
      });
    }

    if (deps.refreshBtn) {
      deps.refreshBtn.addEventListener("click", async function () {
        const done = deps.beginBusy(deps.refreshBtn, deps.msg, "Memuat data enroll...");
        try {
          await Promise.all([loadExamManageTable(), loadSchoolsAndClasses()]);
          deps.setMsg("Data enroll berhasil dimuat.");
        } catch (err) {
          deps.setMsg("Gagal memuat data enroll: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (deps.examAssignForm) {
      deps.examAssignForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const examID = Number((deps.assignExamIDInput && deps.assignExamIDInput.value) || 0);
        if (examID <= 0) {
          deps.setMsg("Pilih ujian untuk enroll peserta.");
          return;
        }
        const schoolID = Number((deps.assignSchoolSelect && deps.assignSchoolSelect.value) || 0);
        const classID = Number((deps.assignClassSelect && deps.assignClassSelect.value) || 0);
        if (schoolID <= 0 || classID <= 0) {
          deps.setMsg("Pilih sekolah dan kelas untuk enroll peserta.");
          return;
        }
        const done = deps.beginBusy(deps.examAssignForm, deps.msg, "Menyimpan enroll peserta...");
        try {
          const items = await deps.api(
            "/api/v1/admin/exams/" + examID + "/assignments/by-class/append",
            "POST",
            { school_id: schoolID, class_id: classID },
          );
          renderExamAssignments(items, false);
          deps.setMsg("Enroll peserta berhasil disimpan.");
          await loadExamManageTable();
        } catch (err) {
          deps.setMsg("Gagal menyimpan enroll peserta: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (deps.examAssignmentsLoadBtn) {
      deps.examAssignmentsLoadBtn.addEventListener("click", async function () {
        const examID = Number((deps.assignExamIDInput && deps.assignExamIDInput.value) || 0);
        const done = deps.beginBusy(deps.examAssignmentsLoadBtn, deps.msg, "Memuat peserta ujian...");
        try {
          await loadExamAssignments(examID);
          deps.setMsg("Peserta ujian berhasil dimuat.");
        } catch (err) {
          deps.setMsg("Gagal memuat peserta ujian: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (deps.examAssignmentsBody) {
      deps.examAssignmentsBody.addEventListener("click", async function (e) {
        const btn = e.target && e.target.closest("button[data-exam-assignment-del]");
        if (!btn) return;
        const examID = Number((deps.assignExamIDInput && deps.assignExamIDInput.value) || 0);
        const userID = Number(btn.getAttribute("data-exam-assignment-del") || 0);
        if (examID <= 0 || userID <= 0) return;
        if (!window.confirm("Keluarkan peserta ini dari ujian?")) return;
        const done = deps.beginBusy(btn, deps.msg, "Mengeluarkan peserta...");
        try {
          await deps.api(
            "/api/v1/admin/exams/" + examID + "/assignments/" + userID,
            "DELETE",
            {},
          );
          const row = btn.closest("tr[data-user-id]") || btn.closest("tr");
          if (row && row.parentNode) row.parentNode.removeChild(row);
          deps.setMsg("Peserta berhasil dikeluarkan.");
        } catch (err) {
          deps.setMsg("Gagal mengeluarkan peserta: " + err.message);
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

  window.GuruEnroll = {
    init: init,
    loadExamManageTable: loadExamManageTable,
    loadSchoolsAndClasses: loadSchoolsAndClasses,
    loadExamAssignments: loadExamAssignments,
  };
})();
