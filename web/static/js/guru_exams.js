(function () {
  var deps = null;
  var examsCache = [];
  var examFormSubmitting = false;
  var pickQuestionsCache = [];
  var examQuestionsCache = [];

  function setDeps(opts) {
    deps = opts || {};
  }

  function pad2(num) {
    return String(num).padStart(2, "0");
  }

  function localDateTimeToRFC3339(rawValue) {
    const raw = String(rawValue || "").trim();
    if (!raw) return "";
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return "";
    return dt.toISOString();
  }

  function rfc3339ToLocalDateTime(rawValue) {
    const raw = String(rawValue || "").trim();
    if (!raw) return "";
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return "";
    return (
      String(dt.getFullYear()) +
      "-" +
      pad2(dt.getMonth() + 1) +
      "-" +
      pad2(dt.getDate()) +
      "T" +
      pad2(dt.getHours()) +
      ":" +
      pad2(dt.getMinutes())
    );
  }

  function getExamCount() {
    return Array.isArray(examsCache) ? examsCache.length : 0;
  }

  function getResultsCount() {
    if (deps && typeof deps.getResultsCount === "function") {
      return deps.getResultsCount();
    }
    return 0;
  }

  function findExamByID(examID) {
    const id = Number(examID || 0);
    if (id <= 0) return null;
    const list = Array.isArray(examsCache) ? examsCache : [];
    for (let i = 0; i < list.length; i += 1) {
      const it = list[i];
      if (Number((it && it.id) || 0) === id) return it;
    }
    return null;
  }

  function fillExamQuestionCodeSelectByExam(examID) {
    if (
      !deps ||
      typeof deps.fillQuestionCodeSelect !== "function" ||
      !deps.examQuestionCodeSelect
    )
      return;
    const id = Number(examID || 0);
    const exam = findExamByID(id);
    const subjectID = Number((exam && exam.subject_id) || 0);
    deps.fillQuestionCodeSelect(deps.examQuestionCodeSelect, subjectID, false);
    if (
      deps.examQuestionCodeSelect &&
      deps.examQuestionCodeSelect.options.length === 0
    ) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Belum ada kode soal mapel ini";
      deps.examQuestionCodeSelect.appendChild(opt);
    }
  }

  function fillExamIDSelect(el, currentValue) {
    if (!el) return;
    const current = String(currentValue || el.value || "");
    el.innerHTML = '<option value="">Pilih ujian...</option>';
    const list = Array.isArray(examsCache) ? examsCache : [];
    list.forEach(function (it) {
      const o = document.createElement("option");
      o.value = String(it.id || "");
      const chunks = [
        String(it.code || "").trim(),
        String(it.title || "").trim(),
        String(it.subject_name || "").trim(),
      ].filter(Boolean);
      o.textContent = chunks.join(" | ");
      if (current && current === o.value) o.selected = true;
      el.appendChild(o);
    });
  }

  function fillExamIDSelects(currentExamID) {
    if (!deps) return;
    const current = String(currentExamID || "");
    fillExamIDSelect(deps.questionExamIDInput, current);
    fillExamIDSelect(deps.examQuestionCodeRuleExamIDInput, current);
    fillExamIDSelect(deps.questionPickExamIDInput, current);
  }

  function fillExamQuestionPickCodeSelectByExam(examID) {
    if (!deps || typeof deps.fillQuestionCodeSelect !== "function") return;
    const id = Number(examID || 0);
    const exam = findExamByID(id);
    const subjectID = Number((exam && exam.subject_id) || 0);
    deps.fillQuestionCodeSelect(
      deps.examQuestionPickCodeSelect,
      subjectID,
      false,
    );
    if (
      deps.examQuestionPickCodeSelect &&
      deps.examQuestionPickCodeSelect.options.length === 0
    ) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Belum ada kode soal mapel ini";
      deps.examQuestionPickCodeSelect.appendChild(opt);
    }
  }

  function renderPickQuestions(items) {
    if (!deps || !deps.examQuestionPickBody) return;
    var examMap = {};
    if (Array.isArray(examQuestionsCache)) {
      examQuestionsCache.forEach(function (it) {
        const qid = Number((it && it.question_id) || 0);
        if (qid > 0) {
          examMap[qid] = it;
        }
      });
    }
    if (!Array.isArray(items) || items.length === 0) {
      deps.examQuestionPickBody.innerHTML =
        '<tr><td colspan="6" class="muted">Tidak ada soal untuk kode soal ini.</td></tr>';
      return;
    }
    deps.examQuestionPickBody.innerHTML = "";
    items.forEach(function (it) {
      const qid = Number((it && it.id) || 0);
      const examItem = examMap[qid];
      const inExam = !!examItem;
      const weightValue = Number(
        (examItem && examItem.weight) || (it && it.weight) || 1,
      );
      const upsertLabel = inExam ? "Perbarui" : "Tambah";
      const upsertTitle = inExam
        ? "Perbarui bobot soal di ujian"
        : "Tambahkan soal ke ujian";
      const actionButtons = [
        '<button class="btn btn-secondary btn-inline" type="button" data-pick-action="upsert" data-pick-id="' +
          deps.escapeHtml(String(it.id || "")) +
          '" title="' +
          deps.escapeHtml(upsertTitle) +
          '" aria-label="' +
          deps.escapeHtml(upsertLabel) +
          '">' +
          deps.escapeHtml(upsertLabel) +
          "</button>",
      ];
      if (inExam) {
        actionButtons.push(
          '<button class="btn btn-secondary btn-inline" type="button" data-pick-action="remove" data-pick-id="' +
            deps.escapeHtml(String(it.id || "")) +
            '" title="Hapus dari ujian" aria-label="Hapus dari ujian">Hapus</button>',
        );
      }
      const tr = document.createElement("tr");
      tr.innerHTML = [
        "<td>" + deps.escapeHtml(String(it.id || "")) + "</td>",
        "<td>" +
          deps.escapeHtml(deps.shortQuestionType(it.question_type)) +
          "</td>",
        "<td>" + deps.escapeHtml(String(it.title || "")) + "</td>",
        "<td>" + deps.escapeHtml(String(it.question_code || "-")) + "</td>",
        '<td class="cell-weight"><input type="number" min="0.1" step="0.1" value="' +
          deps.escapeHtml(String(weightValue > 0 ? weightValue : 1)) +
          '" class="input-inline" data-pick-weight="' +
          deps.escapeHtml(String(it.id || "")) +
          '"></td>',
        '<td class="cell-actions">' + actionButtons.join(" ") + "</td>",
      ].join("");
      deps.examQuestionPickBody.appendChild(tr);
    });
  }

  function getSelectedValues(selectEl) {
    if (!selectEl) return [];
    return Array.from(selectEl.selectedOptions || [])
      .map(function (opt) {
        return Number(opt.value || 0);
      })
      .filter(function (id) {
        return id > 0;
      });
  }

  async function loadPickQuestions(examID, questionCodeIDs) {
    if (!deps) return [];
    const id = Number(examID || 0);
    const codeIDs = Array.isArray(questionCodeIDs) ? questionCodeIDs : [];
    if (id <= 0 || !codeIDs.length) {
      renderPickQuestions([]);
      return [];
    }
    const exam = findExamByID(id);
    const subjectID = Number((exam && exam.subject_id) || 0);
    if (subjectID <= 0) {
      renderPickQuestions([]);
      return [];
    }
    const rows = await deps.api(
      "/api/v1/questions?subject_id=" + subjectID,
      "GET",
    );
    const items = Array.isArray(rows) ? rows : [];
    pickQuestionsCache = items.filter(function (it) {
      const codeID = Number((it && it.question_code_id) || 0);
      return codeIDs.indexOf(codeID) >= 0;
    });
    renderPickQuestions(pickQuestionsCache);
    return pickQuestionsCache;
  }

  function renderExamQuestionCodeRules(items) {
    if (!deps || !deps.examQuestionCodeRuleBody) return;
    if (!Array.isArray(items) || !items.length) {
      deps.examQuestionCodeRuleBody.innerHTML =
        '<tr><td colspan="5" class="muted">Belum ada rule kode soal untuk ujian ini.</td></tr>';
      return;
    }
    deps.examQuestionCodeRuleBody.innerHTML = "";
    items.forEach(function (it) {
      const tr = document.createElement("tr");
      tr.innerHTML = [
        "<td>" + deps.escapeHtml(deps.questionCodeLabel(it)) + "</td>",
        "<td>" + deps.escapeHtml(String(it.strategy || "")) + "</td>",
        "<td>" + deps.escapeHtml(String(it.pick_count || "-")) + "</td>",
        "<td>" + deps.escapeHtml(String(it.weight || 1)) + "</td>",
        '<td><button class="icon-only-btn danger" type="button" data-exam-code-rule-del="' +
          deps.escapeHtml(String(it.question_code_id || "")) +
          '" title="Hapus rule" aria-label="Hapus rule">' +
          '<svg viewBox="0 0 24 24" focusable="false"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>' +
          "</button></td>",
      ].join("");
      deps.examQuestionCodeRuleBody.appendChild(tr);
    });
  }

  async function loadExamQuestionCodeRules(examID) {
    if (!deps || !deps.examQuestionCodeRuleBody) return [];
    const id = Number(examID || 0);
    if (id <= 0) {
      renderExamQuestionCodeRules([]);
      return [];
    }
    const rows = await deps.api(
      "/api/v1/admin/exams/" + id + "/question-codes",
      "GET",
    );
    const items = Array.isArray(rows) ? rows : [];
    renderExamQuestionCodeRules(items);
    return items;
  }

  async function loadExamSubjectOptions() {
    if (!deps || !deps.examSubjectSelect) return;
    const subjects = await deps.api("/api/v1/subjects", "GET");
    deps.examSubjectSelect.innerHTML =
      '<option value="">Pilih mapel...</option>';
    if (!Array.isArray(subjects)) return;
    subjects.forEach(function (it) {
      const o = document.createElement("option");
      o.value = String(it.id || "");
      o.textContent =
        String(it.education_level || "") +
        " | " +
        String(it.subject_type || "") +
        " | " +
        String(it.name || "");
      deps.examSubjectSelect.appendChild(o);
    });
  }

  function resetRandomizeInputsToExam(examRow) {
    if (!examRow) return;
    if (deps && deps.examRandomizeQuestionsInput) {
      deps.examRandomizeQuestionsInput.checked = !!examRow.randomize_questions;
    }
    if (deps && deps.examRandomizeOptionsInput) {
      deps.examRandomizeOptionsInput.checked = !!examRow.randomize_options;
    }
  }

  async function loadExamManageTable() {
    const exams = await deps.api("/api/v1/admin/exams/manage", "GET");
    examsCache = Array.isArray(exams) ? exams : [];
    fillExamIDSelects();
    if (deps && typeof deps.refreshStats === "function") {
      deps.refreshStats();
    }
    if (deps && typeof deps.onExamsLoaded === "function") {
      deps.onExamsLoaded(examsCache);
    }
    if (!deps || !deps.examsBody) return;
    if (!Array.isArray(exams) || !exams.length) {
      deps.examsBody.innerHTML =
        '<tr><td colspan="8" class="muted">Belum ada data ujian.</td></tr>';
      return;
    }
    deps.examsBody.innerHTML = "";
    exams.forEach(function (it) {
      const tr = document.createElement("tr");
      tr.innerHTML = [
        "<td>" + deps.escapeHtml(String(it.id || "")) + "</td>",
        "<td>" +
          deps.escapeHtml(String(it.code || "")) +
          "<br><small>" +
          deps.escapeHtml(String(it.title || "")) +
          "</small></td>",
        "<td>" + deps.escapeHtml(String(it.subject_name || "-")) + "</td>",
        "<td>" +
          deps.escapeHtml(String(it.duration_minutes || 0)) +
          " menit</td>",
        "<td>" + deps.escapeHtml(String(it.max_attempts || 1)) + "x</td>",
        "<td>" + deps.escapeHtml(String(it.question_count || 0)) + "</td>",
        "<td>" + deps.escapeHtml(String(it.assigned_count || 0)) + "</td>",
        '<td><span class="action-icons">' +
          '<button class="icon-only-btn" type="button" data-exam-action="use" data-id="' +
          deps.escapeHtml(String(it.id || "")) +
          '" title="Pilih Ujian" aria-label="Pilih Ujian">' +
          '<svg viewBox="0 0 24 24" focusable="false"><path d="M5 12h14M13 6l6 6-6 6"/></svg>' +
          "</button>" +
          '<button class="icon-only-btn danger" type="button" data-exam-action="delete" data-id="' +
          deps.escapeHtml(String(it.id || "")) +
          '" title="Nonaktifkan Ujian" aria-label="Nonaktifkan Ujian">' +
          '<svg viewBox="0 0 24 24" focusable="false"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/></svg>' +
          "</button>" +
          "</span></td>",
      ].join("");
      deps.examsBody.appendChild(tr);
    });
  }

  async function loadExamQuestions(examID) {
    if (!deps) return [];
    if (!examID || examID <= 0) {
      examQuestionsCache = [];
      if (deps.examQuestionsBody) {
        deps.examQuestionsBody.innerHTML =
          '<tr><td colspan="5" class="muted">Pilih exam lalu muat soal ujian.</td></tr>';
      }
      return [];
    }
    const items = await deps.api(
      "/api/v1/admin/exams/" + Number(examID) + "/questions",
      "GET",
    );
    examQuestionsCache = Array.isArray(items) ? items : [];
    if (deps.examQuestionsBody) {
      if (!examQuestionsCache.length) {
        deps.examQuestionsBody.innerHTML =
          '<tr><td colspan="5" class="muted">Belum ada soal di ujian ini.</td></tr>';
        return examQuestionsCache;
      }
      deps.examQuestionsBody.innerHTML = "";
      examQuestionsCache.forEach(function (it) {
        const tr = document.createElement("tr");
        tr.innerHTML = [
          "<td>" + deps.escapeHtml(String(it.seq_no || "")) + "</td>",
          "<td>" +
            deps.escapeHtml(deps.shortQuestionType(it.question_type)) +
            "</td>",
          "<td>" +
            deps.escapeHtml(deps.cleanStemPreview(it.stem_preview)) +
            "</td>",
          "<td>" + deps.escapeHtml(String(it.weight || 1)) + "</td>",
          '<td><button class="icon-only-btn danger" type="button" data-exam-question-del="' +
            deps.escapeHtml(String(it.question_id || "")) +
            '" title="Hapus dari ujian" aria-label="Hapus dari ujian">' +
            '<svg viewBox="0 0 24 24" focusable="false"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/></svg>' +
            "</button></td>",
        ].join("");
        deps.examQuestionsBody.appendChild(tr);
      });
    }
    return examQuestionsCache;
  }

  function bindHandlers() {
    if (!deps) return;

    if (deps.examsRefreshBtn) {
      deps.examsRefreshBtn.addEventListener("click", async function () {
        const done = deps.beginBusy(
          deps.examsRefreshBtn,
          deps.msg,
          "Memuat data ujian...",
        );
        try {
          await Promise.all([loadExamManageTable(), loadExamSubjectOptions()]);
          const selectedExamID = Number(
            (deps.questionExamIDInput && deps.questionExamIDInput.value) || 0,
          );
          fillExamQuestionCodeSelectByExam(selectedExamID);
          await loadExamQuestionCodeRules(selectedExamID);
          deps.setMsg("Data ujian berhasil dimuat.");
        } catch (err) {
          deps.setMsg("Gagal memuat data ujian: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (deps.examForm) {
      deps.examForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        if (examFormSubmitting) {
          deps.setMsg("Penyimpanan ujian sedang diproses. Mohon tunggu...");
          return;
        }
        const fd = new FormData(deps.examForm);
        const examID = Number(fd.get("exam_id") || 0);
        const startAtLocal = String(fd.get("start_at_local") || "").trim();
        const endAtLocal = String(fd.get("end_at_local") || "").trim();
        const startAt = localDateTimeToRFC3339(startAtLocal);
        const endAt = localDateTimeToRFC3339(endAtLocal);
        if (startAtLocal && !startAt) {
          deps.setMsg("Format mulai tanggal tidak valid.");
          return;
        }
        if (endAtLocal && !endAt) {
          deps.setMsg("Format selesai tanggal tidak valid.");
          return;
        }
        if (
          startAt &&
          endAt &&
          new Date(endAt).getTime() < new Date(startAt).getTime()
        ) {
          deps.setMsg(
            "Selesai tanggal tidak boleh lebih kecil dari mulai tanggal.",
          );
          return;
        }
        const payload = {
          code: String(fd.get("code") || "").trim(),
          title: String(fd.get("title") || "").trim(),
          subject_id: Number(fd.get("subject_id") || 0),
          duration_minutes: Number(fd.get("duration_minutes") || 90),
          max_attempts: Number(fd.get("max_attempts") || 1),
          start_at: startAt,
          end_at: endAt,
          review_policy: String(fd.get("review_policy") || "after_submit"),
          randomize_questions: fd.get("randomize_questions") !== null,
          randomize_options: fd.get("randomize_options") !== null,
          is_active: true,
        };
        examFormSubmitting = true;
        const done = deps.beginBusy(
          deps.examForm,
          deps.msg,
          "Menyimpan ujian...",
        );
        try {
          const out =
            examID > 0
              ? await deps.api("/api/v1/admin/exams/" + examID, "PUT", payload)
              : await deps.api("/api/v1/admin/exams", "POST", payload);
          const savedID = out && out.id ? String(out.id) : "-";
          deps.setMsg("Ujian berhasil disimpan. ID: " + savedID);
          deps.examForm.reset();
          const examIDInput = deps.examForm.elements.namedItem("exam_id");
          if (examIDInput) examIDInput.value = "";
          await loadExamManageTable();
        } catch (err) {
          deps.setMsg("Gagal menyimpan ujian: " + err.message);
        } finally {
          done();
          window.setTimeout(function () {
            examFormSubmitting = false;
          }, 700);
        }
      });
    }

    if (deps.examsBody) {
      deps.examsBody.addEventListener("click", async function (e) {
        const btn =
          e.target && e.target.closest("button[data-exam-action][data-id]");
        if (!btn) return;
        const examID = Number(btn.getAttribute("data-id") || 0);
        const action = String(btn.getAttribute("data-exam-action") || "");
        if (examID <= 0) return;
        if (action === "use") {
          const examRow = findExamByID(examID);
          if (deps.examForm && examRow) {
            const idField = deps.examForm.elements.namedItem("exam_id");
            const codeField = deps.examForm.elements.namedItem("code");
            const titleField = deps.examForm.elements.namedItem("title");
            const subjectField = deps.examForm.elements.namedItem("subject_id");
            const durationField =
              deps.examForm.elements.namedItem("duration_minutes");
            const maxAttemptField =
              deps.examForm.elements.namedItem("max_attempts");
            const startAtField =
              deps.examForm.elements.namedItem("start_at_local");
            const endAtField = deps.examForm.elements.namedItem("end_at_local");
            const policyField =
              deps.examForm.elements.namedItem("review_policy");
            if (idField) idField.value = String(examID);
            if (codeField) codeField.value = String(examRow.code || "");
            if (titleField) titleField.value = String(examRow.title || "");
            if (subjectField) {
              subjectField.value = String(examRow.subject_id || "");
            }
            if (durationField) {
              durationField.value = String(examRow.duration_minutes || 90);
            }
            if (maxAttemptField) {
              maxAttemptField.value = String(examRow.max_attempts || 1);
            }
            if (startAtField) {
              startAtField.value = rfc3339ToLocalDateTime(examRow.start_at);
            }
            if (endAtField) {
              endAtField.value = rfc3339ToLocalDateTime(examRow.end_at);
            }
            if (policyField) {
              policyField.value = String(
                examRow.review_policy || "after_submit",
              );
            }
            resetRandomizeInputsToExam(examRow);
          }
          if (deps.questionExamIDInput) {
            deps.questionExamIDInput.value = String(examID);
          }
          if (deps.examQuestionCodeRuleExamIDInput) {
            deps.examQuestionCodeRuleExamIDInput.value = String(examID);
          }
          fillExamIDSelects(examID);
          fillExamQuestionCodeSelectByExam(examID);
          fillExamQuestionPickCodeSelectByExam(examID);
          if (typeof deps.onExamSelected === "function") {
            deps.onExamSelected(examID);
          }
          try {
            await Promise.all([
              loadExamQuestions(examID),
              loadExamQuestionCodeRules(examID),
            ]);
            deps.setMsg("Exam ID " + examID + " dipilih.");
          } catch (err) {
            deps.setMsg("Gagal memuat data ujian: " + err.message);
          }
          return;
        }
        if (action === "delete") {
          if (!window.confirm("Nonaktifkan ujian ini?")) return;
          const done = deps.beginBusy(btn, deps.msg, "Menonaktifkan ujian...");
          try {
            await deps.api("/api/v1/admin/exams/" + examID, "DELETE");
            await loadExamManageTable();
            deps.setMsg("Ujian berhasil dinonaktifkan.");
          } catch (err) {
            deps.setMsg("Gagal menonaktifkan ujian: " + err.message);
          } finally {
            done();
          }
        }
      });
    }

    if (deps.examQuestionForm) {
      deps.examQuestionForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(deps.examQuestionForm);
        const examID = Number(fd.get("exam_id") || 0);
        if (examID <= 0) {
          deps.setMsg("Pilih ujian untuk menambah naskah.");
          return;
        }
        const payload = {
          question_id: Number(fd.get("question_id") || 0),
          seq_no: Number(fd.get("seq_no") || 0),
          weight: Number(fd.get("weight") || 1),
        };
        const done = deps.beginBusy(
          deps.examQuestionForm,
          deps.msg,
          "Menyimpan naskah ke ujian...",
        );
        try {
          await deps.api(
            "/api/v1/admin/exams/" + examID + "/questions",
            "POST",
            payload,
          );
          await Promise.all([loadExamQuestions(examID), loadExamManageTable()]);
          deps.setMsg("Naskah berhasil dimasukkan ke ujian.");
        } catch (err) {
          deps.setMsg("Gagal menyimpan naskah ke ujian: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (deps.questionExamIDInput) {
      deps.questionExamIDInput.addEventListener("change", function () {
        const examID = Number(deps.questionExamIDInput.value || 0);
        if (deps.examQuestionCodeRuleExamIDInput) {
          deps.examQuestionCodeRuleExamIDInput.value =
            examID > 0 ? String(examID) : "";
        }
        if (deps.questionPickExamIDInput) {
          deps.questionPickExamIDInput.value = examID > 0 ? String(examID) : "";
        }
        fillExamQuestionCodeSelectByExam(examID);
        fillExamQuestionPickCodeSelectByExam(examID);
        examQuestionsCache = [];
        pickQuestionsCache = [];
        if (deps.examQuestionPickBody) {
          deps.examQuestionPickBody.innerHTML =
            '<tr><td colspan="6" class="muted">Pilih ujian dan kode soal, lalu muat daftar soal. Gunakan kolom Aksi untuk menambah atau menghapus soal dari ujian.</td></tr>';
        }
      });
    }

    if (deps.examQuestionCodeRuleExamIDInput) {
      deps.examQuestionCodeRuleExamIDInput.addEventListener(
        "change",
        async function () {
          const examID = Number(
            deps.examQuestionCodeRuleExamIDInput.value || 0,
          );
          fillExamQuestionCodeSelectByExam(examID);
          fillExamQuestionPickCodeSelectByExam(examID);
          try {
            await loadExamQuestionCodeRules(examID);
          } catch (_) {
            // no-op
          }
        },
      );
    }

    if (deps.questionPickExamIDInput) {
      deps.questionPickExamIDInput.addEventListener("change", function () {
        const examID = Number(deps.questionPickExamIDInput.value || 0);
        if (deps.questionExamIDInput) {
          deps.questionExamIDInput.value = examID > 0 ? String(examID) : "";
        }
        if (deps.examQuestionCodeRuleExamIDInput) {
          deps.examQuestionCodeRuleExamIDInput.value =
            examID > 0 ? String(examID) : "";
        }
        fillExamQuestionCodeSelectByExam(examID);
        fillExamQuestionPickCodeSelectByExam(examID);
        examQuestionsCache = [];
        pickQuestionsCache = [];
        if (deps.examQuestionPickBody) {
          deps.examQuestionPickBody.innerHTML =
            '<tr><td colspan="6" class="muted">Pilih ujian dan kode soal, lalu muat daftar soal. Gunakan kolom Aksi untuk menambah atau menghapus soal dari ujian.</td></tr>';
        }
      });
    }

    if (deps.examQuestionPickLoadBtn) {
      deps.examQuestionPickLoadBtn.addEventListener("click", async function () {
        const examID = Number(
          (deps.questionPickExamIDInput &&
            deps.questionPickExamIDInput.value) ||
            0,
        );
        const codeIDs = getSelectedValues(deps.examQuestionPickCodeSelect);
        if (examID <= 0) {
          deps.setMsg("Pilih ujian untuk memuat soal.");
          return;
        }
        if (!codeIDs.length) {
          deps.setMsg("Pilih minimal satu kode soal untuk memuat daftar soal.");
          return;
        }
        const done = deps.beginBusy(
          deps.examQuestionPickLoadBtn,
          deps.msg,
          "Memuat daftar soal...",
        );
        try {
          await loadExamQuestions(examID);
          await loadPickQuestions(examID, codeIDs);
          deps.setMsg("Daftar soal berhasil dimuat.");
        } catch (err) {
          deps.setMsg("Gagal memuat daftar soal: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (deps.examQuestionPickBody) {
      deps.examQuestionPickBody.addEventListener("click", async function (e) {
        const btn = e.target && e.target.closest("button[data-pick-action]");
        if (!btn) return;
        const examID = Number(
          (deps.questionPickExamIDInput &&
            deps.questionPickExamIDInput.value) ||
            0,
        );
        const questionID = Number(btn.getAttribute("data-pick-id") || 0);
        if (examID <= 0 || questionID <= 0) return;
        const action = String(btn.getAttribute("data-pick-action") || "");
        if (action === "remove") {
          if (!window.confirm("Hapus soal ini dari ujian?")) return;
        }
        const done = deps.beginBusy(
          btn,
          deps.msg,
          action === "remove"
            ? "Menghapus soal dari ujian..."
            : "Menyimpan soal ke ujian...",
        );
        try {
          if (action === "remove") {
            await deps.api(
              "/api/v1/admin/exams/" + examID + "/questions/" + questionID,
              "DELETE",
              {},
            );
            deps.setMsg("Soal berhasil dihapus dari ujian.");
          } else {
            const weightEl = deps.examQuestionPickBody.querySelector(
              'input[data-pick-weight="' + String(questionID) + '"]',
            );
            const weight = Number((weightEl && weightEl.value) || 1);
            await deps.api(
              "/api/v1/admin/exams/" + examID + "/questions",
              "POST",
              {
                question_id: questionID,
                seq_no: 0,
                weight: weight > 0 ? weight : 1,
              },
            );
            deps.setMsg("Soal berhasil disimpan ke ujian.");
          }
          await loadExamQuestions(examID);
          renderPickQuestions(pickQuestionsCache);
          await loadExamManageTable();
        } catch (err) {
          deps.setMsg("Gagal memproses soal: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (deps.examQuestionCodeRuleForm) {
      deps.examQuestionCodeRuleForm.addEventListener(
        "submit",
        async function (e) {
          e.preventDefault();
          const fd = new FormData(deps.examQuestionCodeRuleForm);
          const examID = Number(fd.get("exam_id") || 0);
          if (examID <= 0) {
            deps.setMsg("Pilih ujian untuk menyimpan rule kode soal.");
            return;
          }
          const strategy = String(fd.get("strategy") || "")
            .trim()
            .toLowerCase();
          const pickCountRaw = Number(fd.get("pick_count") || 0);
          const payload = {
            question_code_id: Number(fd.get("question_code_id") || 0),
            strategy: strategy || "all",
            weight: Number(fd.get("weight") || 1),
          };
          if (payload.strategy === "random" && pickCountRaw > 0) {
            payload.pick_count = pickCountRaw;
          }
          const done = deps.beginBusy(
            deps.examQuestionCodeRuleForm,
            deps.msg,
            "Menyimpan rule kode soal...",
          );
          try {
            await deps.api(
              "/api/v1/admin/exams/" + examID + "/question-codes",
              "POST",
              payload,
            );
            await Promise.all([
              loadExamQuestionCodeRules(examID),
              loadExamManageTable(),
            ]);
            deps.setMsg("Rule kode soal berhasil disimpan.");
          } catch (err) {
            deps.setMsg("Gagal menyimpan rule kode soal: " + err.message);
          } finally {
            done();
          }
        },
      );
    }

    if (deps.examQuestionCodeSyncBtn) {
      deps.examQuestionCodeSyncBtn.addEventListener("click", async function () {
        const examID = Number(
          (deps.examQuestionCodeRuleExamIDInput &&
            deps.examQuestionCodeRuleExamIDInput.value) ||
            (deps.questionExamIDInput && deps.questionExamIDInput.value) ||
            0,
        );
        if (examID <= 0) {
          deps.setMsg("Pilih ujian sebelum sinkronisasi dari kode soal.");
          return;
        }
        const done = deps.beginBusy(
          deps.examQuestionCodeSyncBtn,
          deps.msg,
          "Sinkronisasi soal ujian dari kode soal...",
        );
        try {
          const out = await deps.api(
            "/api/v1/admin/exams/" + examID + "/question-codes/sync",
            "POST",
            {},
          );
          await Promise.all([
            loadExamQuestions(examID),
            loadExamQuestionCodeRules(examID),
            loadExamManageTable(),
          ]);
          const count = Number((out && out.total_questions) || 0);
          deps.setMsg(
            "Sinkronisasi soal dari kode berhasil. Total soal ujian: " +
              String(count),
          );
        } catch (err) {
          deps.setMsg("Sinkronisasi soal dari kode gagal: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (deps.examQuestionsLoadBtn) {
      deps.examQuestionsLoadBtn.addEventListener("click", async function () {
        const examID = Number(
          (deps.questionExamIDInput && deps.questionExamIDInput.value) || 0,
        );
        const done = deps.beginBusy(
          deps.examQuestionsLoadBtn,
          deps.msg,
          "Memuat soal ujian...",
        );
        try {
          await loadExamQuestions(examID);
          deps.setMsg("Soal ujian berhasil dimuat.");
        } catch (err) {
          deps.setMsg("Gagal memuat soal ujian: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (deps.examQuestionsBody) {
      deps.examQuestionsBody.addEventListener("click", async function (e) {
        const btn =
          e.target && e.target.closest("button[data-exam-question-del]");
        if (!btn) return;
        const examID = Number(
          (deps.questionExamIDInput && deps.questionExamIDInput.value) || 0,
        );
        const questionID = Number(
          btn.getAttribute("data-exam-question-del") || 0,
        );
        if (examID <= 0 || questionID <= 0) return;
        if (!window.confirm("Hapus soal ini dari ujian?")) return;
        const done = deps.beginBusy(
          btn,
          deps.msg,
          "Menghapus soal dari ujian...",
        );
        try {
          await deps.api(
            "/api/v1/admin/exams/" + examID + "/questions/" + questionID,
            "DELETE",
            {},
          );
          await Promise.all([loadExamQuestions(examID), loadExamManageTable()]);
          deps.setMsg("Soal berhasil dihapus dari ujian.");
        } catch (err) {
          deps.setMsg("Gagal menghapus soal dari ujian: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (deps.examQuestionCodeRuleBody) {
      deps.examQuestionCodeRuleBody.addEventListener(
        "click",
        async function (e) {
          const btn =
            e.target && e.target.closest("button[data-exam-code-rule-del]");
          if (!btn) return;
          const examID = Number(
            (deps.examQuestionCodeRuleExamIDInput &&
              deps.examQuestionCodeRuleExamIDInput.value) ||
              (deps.questionExamIDInput && deps.questionExamIDInput.value) ||
              0,
          );
          const questionCodeID = Number(
            btn.getAttribute("data-exam-code-rule-del") || 0,
          );
          if (examID <= 0 || questionCodeID <= 0) return;
          if (!window.confirm("Hapus rule kode soal ini dari ujian?")) return;
          const done = deps.beginBusy(
            btn,
            deps.msg,
            "Menghapus rule kode soal...",
          );
          try {
            await deps.api(
              "/api/v1/admin/exams/" +
                examID +
                "/question-codes/" +
                questionCodeID,
              "DELETE",
              {},
            );
            await Promise.all([
              loadExamQuestionCodeRules(examID),
              loadExamManageTable(),
            ]);
            deps.setMsg("Rule kode soal berhasil dihapus.");
          } catch (err) {
            deps.setMsg("Gagal menghapus rule kode soal: " + err.message);
          } finally {
            done();
          }
        },
      );
    }
  }

  function init(opts) {
    setDeps(opts);
    bindHandlers();
  }

  window.GuruExams = {
    init: init,
    getExamCount: getExamCount,
    getResultsCount: getResultsCount,
    findExamByID: findExamByID,
    fillExamQuestionCodeSelectByExam: fillExamQuestionCodeSelectByExam,
    loadExamQuestionCodeRules: loadExamQuestionCodeRules,
    loadExamSubjectOptions: loadExamSubjectOptions,
    loadExamManageTable: loadExamManageTable,
    loadExamQuestions: loadExamQuestions,
  };
})();
