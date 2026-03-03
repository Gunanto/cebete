(function () {
  var deps = null;
  var examsCache = [];
  var examFormSubmitting = false;

  function setDeps(opts) {
    deps = opts || {};
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
    if (!deps || typeof deps.fillQuestionCodeSelect !== "function") return;
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
    if (deps && typeof deps.refreshStats === "function") {
      deps.refreshStats();
    }
    if (deps && typeof deps.onExamsLoaded === "function") {
      deps.onExamsLoaded(examsCache);
    }
    if (deps && deps.examsPanel && !deps.examsPanel.hidden) {
      if (typeof deps.activateGuruMenu === "function") {
        deps.activateGuruMenu("exams");
      }
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
    if (!deps || !deps.examQuestionsBody) return;
    if (!examID || examID <= 0) {
      deps.examQuestionsBody.innerHTML =
        '<tr><td colspan="5" class="muted">Pilih exam lalu muat soal ujian.</td></tr>';
      return;
    }
    const items = await deps.api(
      "/api/v1/admin/exams/" + Number(examID) + "/questions",
      "GET",
    );
    if (!Array.isArray(items) || !items.length) {
      deps.examQuestionsBody.innerHTML =
        '<tr><td colspan="5" class="muted">Belum ada soal di ujian ini.</td></tr>';
      return;
    }
    deps.examQuestionsBody.innerHTML = "";
    items.forEach(function (it) {
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
        const payload = {
          code: String(fd.get("code") || "").trim(),
          title: String(fd.get("title") || "").trim(),
          subject_id: Number(fd.get("subject_id") || 0),
          duration_minutes: Number(fd.get("duration_minutes") || 90),
          max_attempts: Number(fd.get("max_attempts") || 1),
          review_policy: String(fd.get("review_policy") || "score_only"),
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
            if (policyField) {
              policyField.value = String(examRow.review_policy || "score_only");
            }
            resetRandomizeInputsToExam(examRow);
          }
          if (deps.questionExamIDInput) {
            deps.questionExamIDInput.value = String(examID);
          }
          if (deps.examQuestionCodeRuleExamIDInput) {
            deps.examQuestionCodeRuleExamIDInput.value = String(examID);
          }
          fillExamQuestionCodeSelectByExam(examID);
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
          deps.setMsg("Isi Exam ID untuk menambah naskah.");
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
        fillExamQuestionCodeSelectByExam(examID);
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
          try {
            await loadExamQuestionCodeRules(examID);
          } catch (_) {
            // no-op
          }
        },
      );
    }

    if (deps.examQuestionCodeRuleForm) {
      deps.examQuestionCodeRuleForm.addEventListener(
        "submit",
        async function (e) {
          e.preventDefault();
          const fd = new FormData(deps.examQuestionCodeRuleForm);
          const examID = Number(fd.get("exam_id") || 0);
          if (examID <= 0) {
            deps.setMsg("Isi Exam ID untuk menyimpan rule kode soal.");
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
          deps.setMsg("Pilih Exam ID sebelum sinkronisasi dari kode soal.");
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
