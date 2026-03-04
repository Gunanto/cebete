(function () {
  var deps = null;
  var examsCache = [];
  var examFormSubmitting = false;
  var latestResultData = null;

  function setDeps(opts) {
    deps = opts || {};
  }

  function setExamManageCache(rows) {
    examsCache = Array.isArray(rows) ? rows : [];
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

  function setResultsSummary(value) {
    if (!deps || !deps.resultsSummary) return;
    deps.text(deps.resultsSummary, value);
    deps.resultsSummary.classList.remove("muted");
  }

  function setResultsExtra(value) {
    if (!deps || !deps.resultsExtra) return;
    deps.text(deps.resultsExtra, value);
    deps.resultsExtra.classList.remove("muted");
  }

  async function examHasInProgressAttempt(examID) {
    const id = Number(examID || 0);
    if (id <= 0) return false;
    const rows = await deps.api(
      "/api/v1/admin/exams/" + id + "/assignments",
      "GET",
    );
    if (!Array.isArray(rows)) return false;
    return rows.some(function (it) {
      return (
        String((it && it.latest_attempt_status) || "")
          .trim()
          .toLowerCase() === "in_progress"
      );
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

  async function preventRandomizeChangeIfExamRunning(nextQ, nextO) {
    const examID = Number(
      (deps.examForm &&
        deps.examForm.elements &&
        deps.examForm.elements.namedItem("exam_id") &&
        deps.examForm.elements.namedItem("exam_id").value) ||
        0,
    );
    if (examID <= 0) return false;
    const examRow = findExamByID(examID);
    if (!examRow) return false;
    const changed =
      !!nextQ !== !!examRow.randomize_questions ||
      !!nextO !== !!examRow.randomize_options;
    if (!changed) return false;
    const running = await examHasInProgressAttempt(examID);
    if (!running) return false;
    resetRandomizeInputsToExam(examRow);
    window.alert("Jangan acak saat ini ujian sedang berlangsung");
    deps.setMsg(
      "Perubahan acak diblokir: ada peserta yang sedang mengerjakan.",
    );
    return true;
  }

  async function loadExamSubjectOptions() {
    if (!deps || typeof deps.api !== "function" || !deps.examSubjectSelect)
      return;
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

  async function loadExamManageTable() {
    if (!deps || typeof deps.api !== "function") return;
    const exams = await deps.api("/api/v1/admin/exams/manage", "GET");
    setExamManageCache(exams);
    fillAssignExamOptions(exams);
    if (deps.examsPanel && !deps.examsPanel.hidden) {
      deps.activateMenu("exams");
    }
    if (!deps.examsBody) return;
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

  function fillAssignExamOptions(exams) {
    if (!deps || !deps.assignExamIDInput) return;
    const items = Array.isArray(exams) ? exams : [];
    if (
      items.length === 0 &&
      deps.assignExamIDInput.options &&
      deps.assignExamIDInput.options.length > 1
    ) {
      return;
    }
    const current = String(deps.assignExamIDInput.value || "");
    deps.assignExamIDInput.innerHTML =
      '<option value="">Pilih ujian...</option>';
    items.forEach(function (it) {
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

  async function loadExamQuestions(examID) {
    if (!deps || !deps.examQuestionsBody) return;
    if (!examID || examID <= 0) {
      deps.examQuestionsBody.innerHTML =
        '<tr><td colspan="6" class="muted">Pilih exam lalu muat soal ujian.</td></tr>';
      return;
    }
    const items = await deps.api(
      "/api/v1/admin/exams/" + Number(examID) + "/questions",
      "GET",
    );
    if (!Array.isArray(items) || !items.length) {
      deps.examQuestionsBody.innerHTML =
        '<tr><td colspan="6" class="muted">Belum ada soal di ujian ini.</td></tr>';
      return;
    }
    deps.examQuestionsBody.innerHTML = "";
    items.forEach(function (it) {
      const tr = document.createElement("tr");
      tr.innerHTML = [
        "<td>" + deps.escapeHtml(String(it.seq_no || "")) + "</td>",
        "<td>" + deps.escapeHtml(String(it.question_id || "")) + "</td>",
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

  async function loadExamAssignments(examID) {
    if (!deps || !deps.examAssignmentsBody) return;
    const id = Number(examID || 0);
    if (id <= 0) {
      deps.examAssignmentsBody.innerHTML =
        '<tr><td colspan="8" class="muted">Pilih ujian lalu muat peserta ujian.</td></tr>';
      return;
    }
    const rows = await deps.api(
      "/api/v1/admin/exams/" + id + "/assignments",
      "GET",
    );
    renderExamAssignments(rows, true);
  }

  function renderExamAssignments(rows, replace) {
    if (!deps || !deps.examAssignmentsBody) return;
    const items = Array.isArray(rows) ? rows : [];
    if (!items.length) {
      if (replace) {
        deps.examAssignmentsBody.innerHTML =
          '<tr><td colspan="7" class="muted">Belum ada peserta terdaftar.</td></tr>';
      }
      return;
    }
    if (replace) deps.examAssignmentsBody.innerHTML = "";
    items.forEach(function (it) {
      const userID = String(it.user_id || "");
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

  function summarizeAttemptResult(mode) {
    const data = latestResultData;
    const summary = data && data.summary ? data.summary : {};
    const items = Array.isArray(data && data.items) ? data.items : [];
    if (!data) {
      setResultsExtra("Muat nilai (Attempt ID) terlebih dahulu.");
      return;
    }
    const total = items.length;
    const correct = items.filter(function (it) {
      return !!it.is_correct;
    }).length;
    const wrong = items.filter(function (it) {
      return it.is_correct === false;
    }).length;
    const unanswered = items.filter(function (it) {
      return String(it.reason || "") === "unanswered";
    }).length;
    const score = Number(summary.score || 0);
    if (mode === "report") {
      setResultsExtra(
        "Laporan: exam #" +
          String(summary.exam_id || "-") +
          ", attempt #" +
          String(summary.id || "-") +
          ", skor " +
          String(score) +
          ", benar " +
          String(correct) +
          ", salah " +
          String(wrong) +
          ", kosong " +
          String(unanswered) +
          ".",
      );
      return;
    }
    if (mode === "stats") {
      const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
      setResultsExtra(
        "Statistik: total soal " +
          String(total) +
          ", akurasi " +
          String(pct) +
          "%, benar " +
          String(correct) +
          ", salah " +
          String(wrong) +
          ", kosong " +
          String(unanswered) +
          ".",
      );
      return;
    }
    const bar = total > 0 ? Math.round((correct / total) * 20) : 0;
    setResultsExtra(
      "Grafik (teks): [" +
        "#".repeat(Math.max(0, bar)) +
        "-".repeat(Math.max(0, 20 - bar)) +
        "] " +
        String(correct) +
        "/" +
        String(total) +
        " benar.",
    );
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
          await Promise.all([
            loadExamManageTable(),
            deps.loadTokenExamOptions(),
          ]);
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
        const nextRandomizeQuestions = fd.get("randomize_questions") !== null;
        const nextRandomizeOptions = fd.get("randomize_options") !== null;
        try {
          const blocked = await preventRandomizeChangeIfExamRunning(
            nextRandomizeQuestions,
            nextRandomizeOptions,
          );
          if (blocked) return;
        } catch (err) {
          deps.setMsg(
            "Gagal memvalidasi status ujian berjalan: " + err.message,
          );
          return;
        }
        const payload = {
          code: String(fd.get("code") || "").trim(),
          title: String(fd.get("title") || "").trim(),
          subject_id: Number(fd.get("subject_id") || 0),
          duration_minutes: Number(fd.get("duration_minutes") || 90),
          max_attempts: Number(fd.get("max_attempts") || 1),
          review_policy: String(fd.get("review_policy") || "after_submit"),
          randomize_questions: nextRandomizeQuestions,
          randomize_options: nextRandomizeOptions,
          is_active: true,
        };
        examFormSubmitting = true;
        const done = deps.beginBusy(
          deps.examForm,
          deps.msg,
          "Menyimpan ujian...",
        );
        let saved = null;
        try {
          if (examID > 0) {
            saved = await deps.api(
              "/api/v1/admin/exams/" + examID,
              "PUT",
              payload,
            );
          } else {
            saved = await deps.api("/api/v1/admin/exams", "POST", payload);
          }

          const savedID = saved && saved.id ? String(saved.id) : "-";
          const savedCode = saved && saved.code ? String(saved.code) : "-";
          deps.setMsg(
            "Ujian berhasil disimpan. ID: " + savedID + " | Kode: " + savedCode,
          );

          deps.examForm.reset();
          const examIDInput = deps.examForm.elements.namedItem("exam_id");
          if (examIDInput) examIDInput.value = "";
          try {
            await Promise.all([
              loadExamManageTable(),
              deps.loadTokenExamOptions(),
            ]);
          } catch (refreshErr) {
            deps.setMsg(
              "Ujian sudah tersimpan, tetapi gagal memuat ulang tabel: " +
                refreshErr.message,
            );
          }
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

    if (deps.examRandomizeQuestionsInput) {
      deps.examRandomizeQuestionsInput.addEventListener(
        "change",
        async function () {
          const nextQ = !!deps.examRandomizeQuestionsInput.checked;
          const nextO = !!(
            deps.examRandomizeOptionsInput &&
            deps.examRandomizeOptionsInput.checked
          );
          try {
            await preventRandomizeChangeIfExamRunning(nextQ, nextO);
          } catch (err) {
            deps.setMsg(
              "Gagal memvalidasi status ujian berjalan: " + err.message,
            );
          }
        },
      );
    }

    if (deps.examRandomizeOptionsInput) {
      deps.examRandomizeOptionsInput.addEventListener(
        "change",
        async function () {
          const nextQ = !!(
            deps.examRandomizeQuestionsInput &&
            deps.examRandomizeQuestionsInput.checked
          );
          const nextO = !!deps.examRandomizeOptionsInput.checked;
          try {
            await preventRandomizeChangeIfExamRunning(nextQ, nextO);
          } catch (err) {
            deps.setMsg(
              "Gagal memvalidasi status ujian berjalan: " + err.message,
            );
          }
        },
      );
    }

    if (deps.examsBody) {
      deps.examsBody.addEventListener("click", async function (e) {
        const useBtn =
          e.target && e.target.closest("button[data-exam-action][data-id]");
        if (!useBtn) return;
        const examID = Number(useBtn.getAttribute("data-id") || 0);
        const action = String(useBtn.getAttribute("data-exam-action") || "");
        if (examID <= 0) return;
        if (action === "use") {
          if (deps.assignExamIDInput)
            deps.assignExamIDInput.value = String(examID);
          if (deps.questionExamIDInput) {
            deps.questionExamIDInput.value = String(examID);
          }
          try {
            await Promise.all([
              loadExamQuestions(examID),
              loadExamAssignments(examID),
            ]);
            deps.setMsg("Ujian dipilih. Data peserta ujian berhasil dimuat.");
          } catch (err) {
            deps.setMsg("Gagal memuat data ujian: " + err.message);
          }
          return;
        }
        if (action === "delete") {
          if (!window.confirm("Nonaktifkan ujian ini?")) return;
          const done = deps.beginBusy(
            useBtn,
            deps.msg,
            "Menonaktifkan ujian...",
          );
          try {
            await deps.api("/api/v1/admin/exams/" + examID, "DELETE");
            await Promise.all([
              loadExamManageTable(),
              deps.loadTokenExamOptions(),
            ]);
            deps.setMsg("Ujian berhasil dinonaktifkan.");
          } catch (err) {
            deps.setMsg("Gagal menonaktifkan ujian: " + err.message);
          } finally {
            done();
          }
        }
      });
    }

    if (deps.examAssignForm) {
      deps.examAssignForm.setAttribute("data-proktor-bound", "1");
      deps.examAssignForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const examID = Number(
          (deps.assignExamIDInput && deps.assignExamIDInput.value) || 0,
        );
        if (examID <= 0) {
          deps.setMsg("Pilih ujian untuk enroll peserta.");
          return;
        }
        const schoolID = Number(
          (deps.assignSchoolSelect && deps.assignSchoolSelect.value) || 0,
        );
        const classID = Number(
          (deps.assignClassSelect && deps.assignClassSelect.value) || 0,
        );
        if (schoolID <= 0 || classID <= 0) {
          deps.setMsg("Pilih sekolah dan kelas untuk enroll peserta.");
          return;
        }
        const done = deps.beginBusy(
          deps.examAssignForm,
          deps.msg,
          "Menyimpan enroll peserta...",
        );
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
      deps.examAssignmentsLoadBtn.setAttribute("data-proktor-bound", "1");
      deps.examAssignmentsLoadBtn.addEventListener("click", async function () {
        const examID = Number(
          (deps.assignExamIDInput && deps.assignExamIDInput.value) || 0,
        );
        const done = deps.beginBusy(
          deps.examAssignmentsLoadBtn,
          deps.msg,
          "Memuat peserta ujian...",
        );
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
        const btn =
          e.target && e.target.closest("button[data-exam-assignment-del]");
        if (!btn) return;
        const examID = Number(
          (deps.assignExamIDInput && deps.assignExamIDInput.value) || 0,
        );
        const userID = Number(
          btn.getAttribute("data-exam-assignment-del") || 0,
        );
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

    if (deps.assignSchoolSelect) {
      deps.assignSchoolSelect.addEventListener("change", function () {
        deps.fillAssignClassSelectBySchool(deps.assignSchoolSelect.value);
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

    if (deps.resultsRefreshBtn) {
      deps.resultsRefreshBtn.addEventListener("click", async function () {
        const done = deps.beginBusy(
          deps.resultsRefreshBtn,
          deps.msg,
          "Memuat daftar ujian...",
        );
        try {
          await loadExamManageTable();
          deps.setMsg("Daftar ujian berhasil dimuat.");
        } catch (err) {
          deps.setMsg("Gagal memuat daftar ujian: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (deps.resultsAttemptForm) {
      deps.resultsAttemptForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(deps.resultsAttemptForm);
        const attemptID = Number(fd.get("attempt_id") || 0);
        if (attemptID <= 0) {
          deps.setMsg("Attempt ID tidak valid.");
          return;
        }
        const done = deps.beginBusy(
          deps.resultsAttemptForm,
          deps.msg,
          "Memuat nilai attempt...",
        );
        try {
          const out = await deps.api(
            "/api/v1/attempts/" + attemptID + "/result",
            "GET",
          );
          latestResultData = out || null;
          const summary = (out && out.summary) || {};
          const itemCount = Array.isArray(out && out.items)
            ? out.items.length
            : 0;
          setResultsSummary(
            "Exam #" +
              String(summary.exam_id || "-") +
              " | Attempt #" +
              String(summary.id || "-") +
              " | Skor: " +
              String(summary.score || 0) +
              " | Benar: " +
              String(summary.total_correct || 0) +
              " | Salah: " +
              String(summary.total_wrong || 0) +
              " | Kosong: " +
              String(summary.total_unanswered || 0) +
              " | Item: " +
              String(itemCount),
          );
          setResultsExtra("Nilai dimuat. Pilih Muat Laporan/Statistik/Grafik.");
          deps.setMsg("Nilai attempt berhasil dimuat.");
        } catch (err) {
          deps.setMsg("Gagal memuat nilai: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (deps.resultsResetAttemptForm) {
      deps.resultsResetAttemptForm.addEventListener(
        "submit",
        async function (e) {
          e.preventDefault();
          const fd = new FormData(deps.resultsResetAttemptForm);
          const examID = Number(fd.get("exam_id") || 0);
          const studentID = Number(fd.get("student_id") || 0);
          if (examID <= 0 || studentID <= 0) {
            deps.setMsg("Exam ID dan Student ID wajib valid.");
            return;
          }
          const ok = window.confirm(
            "Reset attempt terbaru untuk peserta ini pada ujian terpilih?",
          );
          if (!ok) return;
          const done = deps.beginBusy(
            deps.resultsResetAttemptForm,
            deps.msg,
            "Mereset attempt peserta...",
          );
          try {
            const out = await deps.api(
              "/api/v1/admin/exams/" + examID + "/attempts/reset",
              "POST",
              { student_id: studentID },
            );
            deps.setMsg(
              "Reset attempt berhasil. Attempt ID: " +
                String((out && out.attempt_id) || "-"),
            );
            latestResultData = null;
            setResultsSummary("Belum ada data nilai.");
            setResultsExtra(
              "Muat ulang nilai jika peserta sudah memulai attempt baru.",
            );
          } catch (err) {
            deps.setMsg("Reset attempt gagal: " + err.message);
          } finally {
            done();
          }
        },
      );
    }

    if (deps.resultsReportBtn) {
      deps.resultsReportBtn.addEventListener("click", function () {
        summarizeAttemptResult("report");
      });
    }
    if (deps.resultsStatsBtn) {
      deps.resultsStatsBtn.addEventListener("click", function () {
        summarizeAttemptResult("stats");
      });
    }
    if (deps.resultsChartBtn) {
      deps.resultsChartBtn.addEventListener("click", function () {
        summarizeAttemptResult("chart");
      });
    }
  }

  function init(opts) {
    setDeps(opts);
    bindHandlers();
  }

  window.ProktorExams = {
    init: init,
    loadExamManageTable: loadExamManageTable,
    loadExamSubjectOptions: loadExamSubjectOptions,
    loadExamQuestions: loadExamQuestions,
    loadExamAssignments: loadExamAssignments,
    preventRandomizeChangeIfExamRunning: preventRandomizeChangeIfExamRunning,
  };
})();
