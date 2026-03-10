(function () {
  var deps = null;
  var cache = [];
  var page = 1;
  var pageSize = 10;
  var search = "";
  var editingID = 0;
  var classesCache = [];

  function setDeps(opts) {
    deps = opts || {};
  }

  function getCache() {
    return Array.isArray(cache) ? cache : [];
  }

  function getCount() {
    return getCache().length;
  }

  function label(it) {
    if (!it) return "-";
    const id = String((it && it.id) || "").trim();
    const semester = String((it && it.semester) || "").trim();
    const tujuan = String((it && it.tujuan_pembelajaran) || "").trim();
    if (!id && !tujuan) return "-";
    const parts = [];
    if (id) parts.push("TP-" + id);
    if (semester) parts.push("Smt-" + semester);
    if (tujuan) parts.push(tujuan);
    return parts.join(" | ");
  }

  function ensureKelasOption(value) {
    if (!deps || !deps.learningGoalKelasInput) return;
    const val = String(value || "").trim();
    if (!val) return;
    const exists = Array.from(deps.learningGoalKelasInput.options).some(
      function (opt) {
        return opt.value === val;
      },
    );
    if (exists) return;
    const legacy = document.createElement("option");
    legacy.value = val;
    legacy.textContent = val + " (legacy)";
    deps.learningGoalKelasInput.appendChild(legacy);
  }

  function findSubjectByID(subjectID) {
    if (deps && typeof deps.findSubjectByID === "function") {
      return deps.findSubjectByID(subjectID);
    }
    const list =
      deps && typeof deps.getSubjectsCache === "function"
        ? deps.getSubjectsCache()
        : [];
    return list.find(function (it) {
      return Number((it && it.id) || 0) === Number(subjectID || 0);
    });
  }

  function filterBySubject(subjectID) {
    const subject = findSubjectByID(subjectID);
    if (!subject) return [];
    const mapel = String((subject && subject.name) || "")
      .trim()
      .toLowerCase();
    const kelas = String((subject && subject.education_level) || "")
      .trim()
      .toLowerCase();
    const list = getCache();
    const matches = list.filter(function (it) {
      return (
        String((it && it.mata_pelajaran) || "")
          .trim()
          .toLowerCase() === mapel &&
        String((it && it.kelas) || "")
          .trim()
          .toLowerCase() === kelas
      );
    });
    if (matches.length) return matches;
    return list.filter(function (it) {
      return (
        String((it && it.mata_pelajaran) || "")
          .trim()
          .toLowerCase() === mapel
      );
    });
  }

  function resolveDefaultLearningGoalID(subjectID) {
    const goals = filterBySubject(subjectID);
    if (!goals.length) return 0;
    return Number((goals[0] && goals[0].id) || 0);
  }

  function normalizeLearningGoalCode(raw) {
    const val = String(raw || "")
      .trim()
      .toUpperCase();
    if (!val) return 0;
    const m = val.match(/^TP[\s\-_]*([0-9]+)$/);
    if (m && m[1]) return Number(m[1]) || 0;
    if (/^[0-9]+$/.test(val)) return Number(val) || 0;
    return 0;
  }

  function resolveLearningGoalIDByCode(subjectID, codeRaw) {
    const goalID = normalizeLearningGoalCode(codeRaw);
    if (goalID <= 0) return 0;
    const goals = filterBySubject(subjectID);
    const hit = goals.find(function (it) {
      return Number((it && it.id) || 0) === goalID;
    });
    if (!hit) return 0;
    return Number((hit && hit.id) || 0);
  }

  function findByDetails(mapel, kelas, semester, tujuan, materi) {
    const goalMapel = String(mapel || "")
      .trim()
      .toLowerCase();
    const goalKelas = String(kelas || "")
      .trim()
      .toLowerCase();
    const goalSemester = String(semester || "").trim();
    const goalTujuan = String(tujuan || "")
      .trim()
      .toLowerCase();
    const goalMateri = String(materi || "")
      .trim()
      .toLowerCase();
    if (!goalMapel || !goalTujuan || !goalMateri || !goalSemester) return null;
    const rows = getCache();
    return (
      rows.find(function (it) {
        return (
          String((it && it.mata_pelajaran) || "")
            .trim()
            .toLowerCase() === goalMapel &&
          String((it && it.kelas) || "")
            .trim()
            .toLowerCase() === goalKelas &&
          String((it && it.semester) || "") === goalSemester &&
          String((it && it.tujuan_pembelajaran) || "")
            .trim()
            .toLowerCase() === goalTujuan &&
          String((it && it.materi) || "")
            .trim()
            .toLowerCase() === goalMateri
        );
      }) || null
    );
  }
  function fillSelect(selectEl, subjectID) {
    if (!selectEl) return;
    const current = String(selectEl.value || "");
    selectEl.innerHTML = "";
    const firstOpt = document.createElement("option");
    firstOpt.value = "";
    firstOpt.textContent = "Pilih tujuan pembelajaran";
    selectEl.appendChild(firstOpt);
    const goals = filterBySubject(subjectID);
    goals.forEach(function (it) {
      const opt = document.createElement("option");
      opt.value = String((it && it.id) || "");
      opt.textContent =
        "TP-" +
        String((it && it.id) || "") +
        " | Smt-" +
        String((it && it.semester) || "") +
        " | " +
        String((it && it.tujuan_pembelajaran) || "");
      if (current && current === opt.value) opt.selected = true;
      selectEl.appendChild(opt);
    });
    if (!selectEl.value) selectEl.selectedIndex = 0;
  }

  function render(items) {
    if (!deps || !deps.learningGoalBody) return;
    if (!Array.isArray(items) || items.length === 0) {
      deps.learningGoalBody.innerHTML =
        '<tr><td colspan="7" class="muted">Belum ada data tujuan pembelajaran.</td></tr>';
      if (deps.learningGoalPageInfo) {
        deps.learningGoalPageInfo.textContent = "Baris 0 - 0";
      }
      if (deps.learningGoalPrevBtn) deps.learningGoalPrevBtn.disabled = true;
      if (deps.learningGoalNextBtn) deps.learningGoalNextBtn.disabled = true;
      return;
    }
    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
    if (page > totalPages) page = totalPages;
    if (page < 1) page = 1;
    const start = (page - 1) * pageSize;
    const pageItems = items.slice(start, start + pageSize);
    const from = pageItems.length ? start + 1 : 0;
    const to = pageItems.length ? start + pageItems.length : 0;
    if (deps.learningGoalPageInfo) {
      deps.learningGoalPageInfo.textContent =
        "Baris " + String(from) + " - " + String(to) + " dari " + String(total);
    }
    if (deps.learningGoalPrevBtn) deps.learningGoalPrevBtn.disabled = page <= 1;
    if (deps.learningGoalNextBtn)
      deps.learningGoalNextBtn.disabled = page >= totalPages;
    deps.learningGoalBody.innerHTML = "";
    pageItems.forEach(function (it) {
      const tr = document.createElement("tr");
      tr.innerHTML = [
        "<td>" + deps.escapeHtml(String(it.id || "")) + "</td>",
        "<td>" + deps.escapeHtml(String(it.mata_pelajaran || "")) + "</td>",
        "<td>" + deps.escapeHtml(String(it.kelas || "")) + "</td>",
        "<td>" + deps.escapeHtml(String(it.semester || "")) + "</td>",
        "<td>" + deps.escapeHtml(String(it.materi || "")) + "</td>",
        "<td>" +
          deps.escapeHtml(String(it.tujuan_pembelajaran || "")) +
          "</td>",
        '<td><span class="action-icons">' +
          '<button class="icon-only-btn" type="button" data-action="view-learning-goal" data-id="' +
          deps.escapeHtml(String(it.id || "")) +
          '" title="Lihat" aria-label="Lihat">' +
          '<svg viewBox="0 0 24 24" focusable="false"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>' +
          "</button>" +
          '<button class="icon-only-btn" type="button" data-action="edit-learning-goal" data-id="' +
          deps.escapeHtml(String(it.id || "")) +
          '" title="Ubah" aria-label="Ubah">' +
          '<svg viewBox="0 0 24 24" focusable="false"><path d="M3 17.25V21h3.75L17.8 9.95l-3.75-3.75L3 17.25z"/><path d="M14.05 6.2l3.75 3.75"/></svg>' +
          "</button>" +
          '<button class="icon-only-btn danger" type="button" data-action="delete-learning-goal" data-id="' +
          deps.escapeHtml(String(it.id || "")) +
          '" title="Hapus" aria-label="Hapus">' +
          '<svg viewBox="0 0 24 24" focusable="false"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>' +
          "</button>" +
          "</span></td>",
      ].join("");
      deps.learningGoalBody.appendChild(tr);
    });
  }

  function getFiltered() {
    const q = String(search || "")
      .trim()
      .toLowerCase();
    if (!q) return getCache();
    const rows = getCache();
    return rows.filter(function (it) {
      const id = String((it && it.id) || "");
      const mapel = String((it && it.mata_pelajaran) || "");
      const kelas = String((it && it.kelas) || "");
      const semester = String((it && it.semester) || "");
      const materi = String((it && it.materi) || "");
      const tujuan = String((it && it.tujuan_pembelajaran) || "");
      return (
        id.toLowerCase().includes(q) ||
        mapel.toLowerCase().includes(q) ||
        kelas.toLowerCase().includes(q) ||
        semester.toLowerCase().includes(q) ||
        materi.toLowerCase().includes(q) ||
        tujuan.toLowerCase().includes(q)
      );
    });
  }

  function findByID(id) {
    return getCache().find(function (it) {
      return Number((it && it.id) || 0) === Number(id || 0);
    });
  }

  function resetFormMode() {
    editingID = 0;
    if (deps && deps.learningGoalForm) {
      const idField = deps.learningGoalForm.elements.namedItem("id");
      if (idField) idField.value = "";
    }
    if (deps && deps.learningGoalSubmitBtn) {
      deps.learningGoalSubmitBtn.textContent = "Simpan Tujuan Pembelajaran";
    }
    if (deps && deps.learningGoalCancelEditBtn) {
      deps.learningGoalCancelEditBtn.hidden = true;
    }
  }

  function fillViewPopup(item) {
    if (!deps || !deps.learningGoalViewContent) return;
    deps.learningGoalViewContent.innerHTML = [
      "<p><strong>ID:</strong> " +
        deps.escapeHtml(String(item.id || "-")) +
        "</p>",
      "<p><strong>Mapel:</strong> " +
        deps.escapeHtml(String(item.mata_pelajaran || "-")) +
        "</p>",
      "<p><strong>Tingkat/Grade:</strong> " +
        deps.escapeHtml(String(item.kelas || "-")) +
        "</p>",
      "<p><strong>Semester:</strong> " +
        deps.escapeHtml(String(item.semester || "-")) +
        "</p>",
      "<p><strong>Materi:</strong> " +
        deps.escapeHtml(String(item.materi || "-")) +
        "</p>",
      "<p><strong>Tujuan:</strong><br>" +
        deps.escapeHtml(String(item.tujuan_pembelajaran || "-")) +
        "</p>",
    ].join("");
  }

  function startEdit(item) {
    if (!deps || !deps.learningGoalForm || !item) return;
    const idField = deps.learningGoalForm.elements.namedItem("id");
    const mapelField =
      deps.learningGoalForm.elements.namedItem("mata_pelajaran");
    const kelasField = deps.learningGoalForm.elements.namedItem("kelas");
    const semesterField = deps.learningGoalForm.elements.namedItem("semester");
    const materiField = deps.learningGoalForm.elements.namedItem("materi");
    const tujuanField = deps.learningGoalForm.elements.namedItem(
      "tujuan_pembelajaran",
    );

    editingID = Number(item.id || 0);
    if (idField) idField.value = String(item.id || "");
    if (mapelField) mapelField.value = String(item.mata_pelajaran || "");
    if (kelasField) {
      kelasField.value = String(item.kelas || "");
      ensureKelasOption(kelasField.value);
    }
    if (semesterField) semesterField.value = String(item.semester || "");
    if (materiField) materiField.value = String(item.materi || "");
    if (tujuanField) {
      tujuanField.value = String(item.tujuan_pembelajaran || "");
    }
    if (deps.learningGoalSubmitBtn) {
      deps.learningGoalSubmitBtn.textContent = "Simpan Perubahan";
    }
    if (deps.learningGoalCancelEditBtn) {
      deps.learningGoalCancelEditBtn.hidden = false;
    }
  }

  async function loadClasses() {
    try {
      if (!deps || !deps.learningGoalKelasInput) return;
      deps.learningGoalKelasInput.innerHTML =
        '<option value="">Pilih Tingkat/Grade</option>';
      const grades = new Set();
      try {
        const items = await deps.api("/api/v1/admin/classes?all=1", "GET");
        classesCache = Array.isArray(items) ? items : [];
      } catch (_) {
        classesCache = [];
      }
      (Array.isArray(classesCache) ? classesCache : []).forEach(function (it) {
        const value = String((it && it.grade_level) || "").trim();
        if (value) grades.add(value);
      });
      if (grades.size === 0) {
        const subjects =
          deps && typeof deps.getSubjectsCache === "function"
            ? deps.getSubjectsCache()
            : [];
        (Array.isArray(subjects) ? subjects : []).forEach(function (it) {
          const value = String((it && it.education_level) || "").trim();
          if (value) grades.add(value);
        });
      }
      Array.from(grades)
        .sort(function (a, b) {
          return a.localeCompare(b, "id", {
            numeric: true,
            sensitivity: "base",
          });
        })
        .forEach(function (grade) {
          const opt = document.createElement("option");
          opt.value = grade;
          opt.textContent = grade;
          deps.learningGoalKelasInput.appendChild(opt);
        });
    } catch (err) {
      console.error("Gagal memuat data tingkat/grade:", err);
    }
  }

  function fillSubjectSelect() {
    if (!deps || !deps.learningGoalMapelInput) return;
    deps.learningGoalMapelInput.innerHTML =
      '<option value="">Pilih Mata Pelajaran</option>';
    const subjects =
      deps && typeof deps.getSubjectsCache === "function"
        ? deps.getSubjectsCache()
        : [];
    subjects.forEach(function (it) {
      const opt = document.createElement("option");
      const labelText = deps.subjectLabel
        ? deps.subjectLabel(it)
        : String((it && it.name) || "");
      opt.value = String(it.name || "");
      opt.textContent = labelText;
      deps.learningGoalMapelInput.appendChild(opt);
    });
  }

  async function load() {
    const items = await deps.api("/api/v1/learning-goals", "GET");
    cache = Array.isArray(items) ? items : [];
    if (deps && typeof deps.refreshStats === "function") {
      deps.refreshStats();
    }
    if (deps && deps.learningGoalsPanel && !deps.learningGoalsPanel.hidden) {
      if (typeof deps.activateGuruMenu === "function") {
        deps.activateGuruMenu("learning-goals");
      }
    }
    render(getFiltered());
    if (deps && deps.manuscriptLearningGoalSelect) {
      const subjectID =
        typeof deps.getManuscriptTargetSubjectID === "function"
          ? deps.getManuscriptTargetSubjectID()
          : 0;
      fillSelect(deps.manuscriptLearningGoalSelect, subjectID);
    }
    return cache;
  }

  function parseDownloadFilenameLite(disposition, fallback) {
    const src = String(disposition || "");
    const utfMatch = src.match(/filename\*=UTF-8''([^;]+)/i);
    if (utfMatch && utfMatch[1]) {
      try {
        return decodeURIComponent(utfMatch[1]);
      } catch (_) {
        return utfMatch[1];
      }
    }
    const basicMatch = src.match(/filename="?([^";]+)"?/i);
    if (basicMatch && basicMatch[1]) return basicMatch[1];
    return fallback;
  }

  async function downloadTemplateCSV() {
    const res = await fetch("/api/v1/learning-goals/import-template", {
      method: "GET",
      credentials: "include",
    });
    if (!res.ok) {
      const errJSON = await res.json().catch(function () {
        return {};
      });
      const msg = deps.extractAPIError
        ? deps.extractAPIError(errJSON, res.statusText || "Request failed")
        : res.statusText || "Request failed";
      throw new Error(msg);
    }
    const blob = await res.blob();
    const filename = parseDownloadFilenameLite(
      res.headers.get("Content-Disposition"),
      "template_import_learning_goals.csv",
    );
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }

  async function downloadExcel() {
    const res = await fetch("/api/v1/learning-goals/export", {
      method: "GET",
      credentials: "include",
    });
    if (!res.ok) {
      const errJSON = await res.json().catch(function () {
        return {};
      });
      const msg = deps.extractAPIError
        ? deps.extractAPIError(errJSON, res.statusText || "Request failed")
        : res.statusText || "Request failed";
      throw new Error(msg);
    }
    const blob = await res.blob();
    const filename = parseDownloadFilenameLite(
      res.headers.get("Content-Disposition"),
      "tujuan_pembelajaran.xlsx",
    );
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }

  function formatImportErrorsMultiline(errors) {
    const rows = Array.isArray(errors) ? errors : [];
    if (!rows.length) return "Tidak ada detail error.";
    return rows
      .map(function (it) {
        const rowNo = Number(it && it.row) || 0;
        const mapel = String((it && it.mata_pelajaran) || "").trim();
        const kelas = String((it && it.kelas) || "").trim();
        const materi = String((it && it.materi) || "").trim();
        const semester = String((it && it.semester) || "").trim();
        const err = String((it && it.error) || "error tidak diketahui").trim();
        const label = [
          mapel ? "mapel: " + mapel : "",
          kelas ? "tingkat/grade: " + kelas : "",
          materi ? "materi: " + materi : "",
          semester ? "semester: " + semester : "",
        ]
          .filter(Boolean)
          .join(" | ");
        if (label) {
          return "Baris " + String(rowNo) + " | " + label + " | " + err;
        }
        return "Baris " + String(rowNo) + " | " + err;
      })
      .join("\n");
  }

  function bindHandlers() {
    if (!deps) return;

    if (deps.learningGoalForm) {
      deps.learningGoalForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(deps.learningGoalForm);
        const id = Number(fd.get("id") || 0);
        const isEdit = id > 0 || editingID > 0;
        const targetID = id > 0 ? id : editingID;
        const done = deps.beginBusy(
          deps.learningGoalForm,
          deps.msg,
          isEdit
            ? "Menyimpan perubahan tujuan pembelajaran..."
            : "Menyimpan tujuan pembelajaran...",
        );
        try {
          const payload = {
            tujuan_pembelajaran: String(
              fd.get("tujuan_pembelajaran") || "",
            ).trim(),
            materi: String(fd.get("materi") || "").trim(),
            mata_pelajaran: String(fd.get("mata_pelajaran") || "").trim(),
            kelas: String(fd.get("kelas") || "").trim(),
            semester: Number(fd.get("semester") || 0),
          };
          if (isEdit && targetID > 0) {
            await deps.api(
              "/api/v1/learning-goals/" + targetID,
              "PUT",
              payload,
            );
          } else {
            await deps.api("/api/v1/learning-goals", "POST", payload);
          }
          await load();
          deps.learningGoalForm.reset();
          resetFormMode();
          deps.setMsg(
            isEdit
              ? "Learning goal berhasil diperbarui."
              : "Learning goal berhasil disimpan.",
          );
        } catch (err) {
          deps.setMsg(
            (isEdit
              ? "Simpan perubahan tujuan pembelajaran gagal: "
              : "Simpan tujuan pembelajaran gagal: ") + err.message,
          );
        } finally {
          done();
        }
      });
    }

    if (deps.learningGoalCancelEditBtn) {
      deps.learningGoalCancelEditBtn.addEventListener("click", function () {
        if (deps.learningGoalForm) deps.learningGoalForm.reset();
        resetFormMode();
        deps.setMsg("Mode edit tujuan pembelajaran dibatalkan.");
      });
    }

    if (deps.learningGoalRefreshBtn) {
      deps.learningGoalRefreshBtn.addEventListener("click", async function () {
        const done = deps.beginBusy(
          deps.learningGoalRefreshBtn,
          deps.msg,
          "Memuat tujuan pembelajaran...",
        );
        try {
          page = 1;
          await Promise.all([load(), loadClasses(), deps.loadSubjects()]);
          fillSubjectSelect();
          deps.setMsg("Learning goals berhasil dimuat.");
        } catch (err) {
          deps.setMsg("Gagal memuat tujuan pembelajaran: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (deps.learningGoalPageSizeSelect) {
      deps.learningGoalPageSizeSelect.addEventListener("change", function () {
        pageSize = Math.max(
          1,
          Number(deps.learningGoalPageSizeSelect.value) || 10,
        );
        page = 1;
        render(getFiltered());
      });
    }

    if (deps.learningGoalPrevBtn) {
      deps.learningGoalPrevBtn.addEventListener("click", function () {
        page = Math.max(1, page - 1);
        render(getFiltered());
      });
    }

    if (deps.learningGoalNextBtn) {
      deps.learningGoalNextBtn.addEventListener("click", function () {
        page += 1;
        render(getFiltered());
      });
    }

    if (deps.learningGoalSearchInput) {
      deps.learningGoalSearchInput.addEventListener("input", function () {
        search = String(deps.learningGoalSearchInput.value || "").trim();
        page = 1;
        render(getFiltered());
      });
    }

    if (deps.learningGoalTemplateBtn) {
      deps.learningGoalTemplateBtn.addEventListener("click", async function () {
        const done = deps.beginBusy(
          deps.learningGoalTemplateBtn,
          deps.msg,
          "Menyiapkan template tujuan pembelajaran...",
        );
        try {
          await downloadTemplateCSV();
          deps.setMsg("Template import tujuan pembelajaran berhasil diunduh.");
        } catch (err) {
          deps.setMsg(
            "Gagal mengunduh template tujuan pembelajaran: " + err.message,
          );
        } finally {
          done();
        }
      });
    }

    if (deps.learningGoalImportBtn) {
      deps.learningGoalImportBtn.addEventListener("click", function () {
        if (deps.learningGoalImportOutput) {
          deps.learningGoalImportOutput.textContent = "";
        }
        if (
          deps.learningGoalImportDialog &&
          typeof deps.learningGoalImportDialog.showModal === "function"
        ) {
          deps.learningGoalImportDialog.showModal();
        }
      });
    }

    if (deps.learningGoalExportBtn) {
      deps.learningGoalExportBtn.addEventListener("click", async function () {
        const done = deps.beginBusy(
          deps.learningGoalExportBtn,
          deps.msg,
          "Menyiapkan file Excel tujuan pembelajaran...",
        );
        try {
          await downloadExcel();
          deps.setMsg("Excel tujuan pembelajaran berhasil diunduh.");
        } catch (err) {
          deps.setMsg(
            "Gagal mengunduh Excel tujuan pembelajaran: " + err.message,
          );
        } finally {
          done();
        }
      });
    }

    if (deps.learningGoalImportCancelBtn) {
      deps.learningGoalImportCancelBtn.addEventListener("click", function () {
        if (
          deps.learningGoalImportDialog &&
          typeof deps.learningGoalImportDialog.close === "function"
        ) {
          deps.learningGoalImportDialog.close();
        }
      });
    }

    if (deps.learningGoalImportCloseBtn) {
      deps.learningGoalImportCloseBtn.addEventListener("click", function () {
        if (
          deps.learningGoalImportDialog &&
          typeof deps.learningGoalImportDialog.close === "function"
        ) {
          deps.learningGoalImportDialog.close();
        }
      });
    }

    if (deps.learningGoalImportForm) {
      deps.learningGoalImportForm.addEventListener(
        "submit",
        async function (e) {
          e.preventDefault();
          const file =
            deps.learningGoalImportFile &&
            deps.learningGoalImportFile.files &&
            deps.learningGoalImportFile.files[0];
          if (!file) {
            deps.setMsg("Pilih file CSV terlebih dahulu.");
            return;
          }
          const fd = new FormData();
          fd.append("file", file);
          const done = deps.beginBusy(
            deps.learningGoalImportForm,
            deps.msg,
            "Mengimpor tujuan pembelajaran dari CSV...",
          );
          try {
            const out = await deps.apiMultipart(
              "/api/v1/learning-goals/import",
              "POST",
              fd,
            );
            const report = (out && out.report) || {};
            const total = Number(report.total_rows || 0);
            const okRows = Number(report.success_rows || 0);
            const failRows = Number(report.failed_rows || 0);
            const errors = Array.isArray(report.errors) ? report.errors : [];
            if (deps.learningGoalImportOutput) {
              deps.learningGoalImportOutput.textContent =
                failRows > 0
                  ? formatImportErrorsMultiline(errors)
                  : "Import berhasil tanpa error.";
            }
            deps.setMsg(
              "Import tujuan pembelajaran selesai. Total: " +
                String(total) +
                ", berhasil: " +
                String(okRows) +
                ", gagal: " +
                String(failRows),
            );
            deps.learningGoalImportForm.reset();
            await load();
            if (
              deps.learningGoalImportDialog &&
              typeof deps.learningGoalImportDialog.close === "function"
            ) {
              deps.learningGoalImportDialog.close();
            }
          } catch (err) {
            if (deps.learningGoalImportOutput) {
              deps.learningGoalImportOutput.textContent =
                "Import gagal:\n" + String(err.message || "Request failed");
            }
            deps.setMsg("Import tujuan pembelajaran gagal: " + err.message);
          } finally {
            done();
          }
        },
      );
    }

    if (deps.learningGoalBody) {
      deps.learningGoalBody.addEventListener("click", async function (e) {
        const btn =
          e.target && e.target.closest("button[data-action][data-id]");
        if (!btn) return;
        const action = String(btn.getAttribute("data-action") || "");
        const id = Number(btn.getAttribute("data-id") || 0);
        if (id <= 0) return;
        const item = findByID(id);
        if (!item) {
          deps.setMsg("Data tujuan pembelajaran tidak ditemukan.");
          return;
        }

        if (action === "view-learning-goal") {
          if (deps.learningGoalViewTitle) {
            deps.learningGoalViewTitle.textContent =
              "Detail Tujuan Pembelajaran: TP-" + String(id);
          }
          fillViewPopup(item);
          if (
            deps.learningGoalViewDialog &&
            typeof deps.learningGoalViewDialog.showModal === "function"
          ) {
            deps.learningGoalViewDialog.showModal();
          }
          return;
        }

        if (action === "edit-learning-goal") {
          startEdit(item);
          deps.setMsg("Mode edit tujuan pembelajaran aktif.");
          return;
        }

        if (action !== "delete-learning-goal") return;
        const ok = window.confirm("Hapus tujuan pembelajaran ini?");
        if (!ok) return;
        const done = deps.beginBusy(
          btn,
          deps.msg,
          "Menghapus tujuan pembelajaran...",
        );
        try {
          await deps.api("/api/v1/learning-goals/" + id, "DELETE");
          await load();
          if (editingID === id) {
            if (deps.learningGoalForm) deps.learningGoalForm.reset();
            resetFormMode();
          }
          deps.setMsg("Learning goal berhasil dihapus.");
        } catch (err) {
          deps.setMsg("Hapus tujuan pembelajaran gagal: " + err.message);
        } finally {
          done();
        }
      });
    }
  }

  function init(opts) {
    setDeps(opts);
    if (deps && deps.learningGoalPageSizeSelect) {
      pageSize = Math.max(
        1,
        Number(deps.learningGoalPageSizeSelect.value) || 10,
      );
    }
    bindHandlers();
  }

  window.LearningGoals = {
    init: init,
    getCache: getCache,
    getCount: getCount,
    label: label,
    findByID: findByID,
    findByDetails: findByDetails,
    fillSelect: fillSelect,
    resolveDefaultLearningGoalID: resolveDefaultLearningGoalID,
    resolveLearningGoalIDByCode: resolveLearningGoalIDByCode,
    load: load,
    loadClasses: loadClasses,
    fillSubjectSelect: fillSubjectSelect,
  };
})();
