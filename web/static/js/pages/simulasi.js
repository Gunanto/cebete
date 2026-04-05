(function () {
  const core = window.AppCore || {};
  const api = core.api;
  const meOrNull = core.meOrNull;
  const text = core.text;
  const escapeHtml = core.escapeHtml;
  const beginBusy = core.beginBusy;

  async function initSimulasiPage() {
    const form = document.getElementById("simulasi-form");
    if (!form) return;
    const legacyFlow = document.getElementById("simulasi-legacy-flow");

    const user = await meOrNull();
    if (!user) {
      window.location.href = "/login";
      return;
    }

    const msg = document.getElementById("simulasi-message");
    const levelSelect = document.getElementById("level-select");
    const typeSelect = document.getElementById("type-select");
    const subjectSelect = document.getElementById("subject-select");
    const examSelect = document.getElementById("exam-select");
    const selfEnrollPanel = document.getElementById("self-enroll-panel");
    const selfEnrollBody = document.getElementById("self-enroll-body");
    const examTokenDialog = document.getElementById("exam-token-dialog");
    const examTokenDialogForm = document.getElementById(
      "exam-token-dialog-form",
    );
    const examTokenDialogHelp = document.getElementById(
      "exam-token-dialog-help",
    );
    const examTokenDialogInput = document.getElementById(
      "exam-token-dialog-input",
    );
    const examTokenDialogCancelBtn = document.getElementById(
      "exam-token-dialog-cancel-btn",
    );
    const studentProfileDialog = document.getElementById(
      "student-profile-dialog",
    );
    const studentProfileDialogForm = document.getElementById(
      "student-profile-dialog-form",
    );
    const studentProfileWrongBtn = document.getElementById(
      "student-profile-wrong-btn",
    );
    const profileParticipantNo = document.getElementById(
      "profile-participant-no",
    );
    const profileFullName = document.getElementById("profile-full-name");
    const profileClassName = document.getElementById("profile-class-name");
    const profileNISN = document.getElementById("profile-nisn");
    const profileSchoolName = document.getElementById("profile-school-name");
    const profileSchoolCode = document.getElementById("profile-school-code");
    const examReadyDialog = document.getElementById("exam-ready-dialog");
    const examReadyDialogForm = document.getElementById(
      "exam-ready-dialog-form",
    );
    const examReadyDialogHelp = document.getElementById(
      "exam-ready-dialog-help",
    );
    const examReadyDialogCancelBtn = document.getElementById(
      "exam-ready-dialog-cancel-btn",
    );
    const examReadyCode = document.getElementById("exam-ready-code");
    const examReadyTitle = document.getElementById("exam-ready-title");
    const examReadySubject = document.getElementById("exam-ready-subject");
    const examReadyDuration = document.getElementById("exam-ready-duration");
    const examReadyStart = document.getElementById("exam-ready-start");
    const examReadyEnd = document.getElementById("exam-ready-end");
    const examReadyAttempt = document.getElementById("exam-ready-attempt");
    const examReadyTokenExpiry = document.getElementById(
      "exam-ready-token-expiry",
    );
    const examInstructionDialog = document.getElementById(
      "exam-instruction-dialog",
    );
    const examInstructionDialogForm = document.getElementById(
      "exam-instruction-dialog-form",
    );
    const examInstructionDialogHelp = document.getElementById(
      "exam-instruction-dialog-help",
    );
    const examInstructionDialogCancelBtn = document.getElementById(
      "exam-instruction-dialog-cancel-btn",
    );
    const examInstructionConfirm = document.getElementById(
      "exam-instruction-confirm",
    );
    const startBtn = document.getElementById("start-btn");
    let pendingStartExamID = 0;
    let pendingStartToken = "";
    let pendingPreviewData = null;
    const userRole = String((user && user.role) || "")
      .trim()
      .toLowerCase();
    const isStudentRole = userRole === "siswa";
    const isNonRegular = !!(user && user.is_non_regular);
    const tokenDialogHelpDefault = String(
      (examTokenDialogHelp && examTokenDialogHelp.textContent) ||
        "Token wajib diisi. Mintakan token ujian ke proktor.",
    ).trim();
    const examReadyHelpDefault = String(
      (examReadyDialogHelp && examReadyDialogHelp.textContent) ||
        "Pastikan informasi ujian sudah benar sebelum memulai.",
    ).trim();
    const examInstructionHelpDefault = String(
      (examInstructionDialogHelp && examInstructionDialogHelp.textContent) ||
        "Baca petunjuk berikut sebelum memulai ujian.",
    ).trim();
    let subjects = [];
    if (selfEnrollPanel) {
      selfEnrollPanel.hidden = !isNonRegular;
    }
    const initDone = beginBusy(form, msg, "Memuat daftar mapel...");
    try {
      subjects = await api("/api/v1/subjects", "GET");
    } catch (err) {
      text(msg, "Gagal memuat mapel: " + err.message);
      initDone();
      return;
    }
    initDone();
    const levels = [
      ...new Set(
        subjects.map(function (s) {
          return s.education_level;
        }),
      ),
    ];

    levels.forEach(function (lvl) {
      const o = document.createElement("option");
      o.value = lvl;
      o.textContent = lvl;
      levelSelect.appendChild(o);
    });

    function fmtShortDate(raw) {
      if (!raw) return "-";
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return "-";
      return d.toLocaleString("id-ID");
    }

    async function loadPublishedExams() {
      if (!selfEnrollBody) return [];
      const list = await api("/api/v1/exams/published", "GET");
      const items = Array.isArray(list) ? list : [];
      if (!items.length) {
        selfEnrollBody.innerHTML =
          '<tr><td colspan="5" class="muted">Belum ada ujian aktif yang bisa diikuti.</td></tr>';
        return items;
      }
      selfEnrollBody.innerHTML = "";
      items.forEach(function (it) {
        const tr = document.createElement("tr");
        tr.innerHTML = [
          "<td>" + escapeHtml(String(it.code || "-")) + "</td>",
          "<td>" + escapeHtml(String(it.title || "-")) + "</td>",
          "<td>" + escapeHtml(String(it.subject_name || "-")) + "</td>",
          "<td>" + escapeHtml(fmtShortDate(it.end_at)) + "</td>",
          '<td><button class="btn btn-secondary btn-inline" type="button" data-self-enroll="' +
            escapeHtml(String(it.id || 0)) +
            '">Pilih Ujian</button></td>',
        ].join("");
        selfEnrollBody.appendChild(tr);
      });
      return items;
    }

    function resetSelect(sel, placeholder) {
      sel.innerHTML = "";
      const o = document.createElement("option");
      o.value = "";
      o.textContent = placeholder;
      sel.appendChild(o);
      sel.disabled = true;
    }

    levelSelect.addEventListener("change", function () {
      resetSelect(typeSelect, "Pilih jenis...");
      resetSelect(subjectSelect, "Pilih mapel...");
      resetSelect(examSelect, "Pilih exam...");
      startBtn.disabled = true;

      const level = levelSelect.value;
      if (!level) return;

      const types = [
        ...new Set(
          subjects
            .filter(function (s) {
              return s.education_level === level;
            })
            .map(function (s) {
              return s.subject_type;
            }),
        ),
      ];

      typeSelect.disabled = false;
      types.forEach(function (t) {
        const o = document.createElement("option");
        o.value = t;
        o.textContent = t;
        typeSelect.appendChild(o);
      });
    });

    typeSelect.addEventListener("change", function () {
      resetSelect(subjectSelect, "Pilih mapel...");
      resetSelect(examSelect, "Pilih exam...");
      startBtn.disabled = true;

      const level = levelSelect.value;
      const type = typeSelect.value;
      if (!level || !type) return;

      subjectSelect.disabled = false;
      subjects
        .filter(function (s) {
          return s.education_level === level && s.subject_type === type;
        })
        .forEach(function (s) {
          const o = document.createElement("option");
          o.value = String(s.id);
          o.textContent = s.name;
          subjectSelect.appendChild(o);
        });
    });

    subjectSelect.addEventListener("change", async function () {
      resetSelect(examSelect, "Pilih exam...");
      startBtn.disabled = true;

      const subjectID = subjectSelect.value;
      if (!subjectID) return;

      const done = beginBusy(examSelect, msg, "Memuat daftar exam...");
      try {
        const exams = await api(
          "/api/v1/exams?subject_id=" + encodeURIComponent(subjectID),
          "GET",
        );
        examSelect.disabled = false;
        exams.forEach(function (x) {
          const examID = Number((x && x.id) || 0);
          const o = document.createElement("option");
          o.value = String(examID);
          o.textContent = String(x.code || "") + " - " + String(x.title || "");
          examSelect.appendChild(o);
        });
      } catch (err) {
        text(msg, "Gagal load exam: " + err.message);
      } finally {
        done();
      }
    });

    examSelect.addEventListener("change", function () {
      startBtn.disabled = !examSelect.value;
    });

    if (selfEnrollBody) {
      selfEnrollBody.addEventListener("click", async function (e) {
        const btn = e.target && e.target.closest("button[data-self-enroll]");
        if (!btn) return;
        const examID = Number(btn.getAttribute("data-self-enroll") || 0);
        if (!examID) return;
        const done = beginBusy(btn, msg, "Menyiapkan ujian...");
        try {
          await api("/api/v1/exams/" + examID + "/self-enroll", "POST", {});
          pendingStartExamID = examID;
          pendingStartToken = "";
          pendingPreviewData = null;
          text(msg, "Ujian dipilih. Masukkan token untuk melanjutkan.");
          await loadPublishedExams();
          if (examTokenDialogInput) {
            examTokenDialogInput.value = "";
          }
          if (examTokenDialogHelp) {
            examTokenDialogHelp.textContent = tokenDialogHelpDefault;
          }
          if (
            examTokenDialog &&
            typeof examTokenDialog.showModal === "function"
          ) {
            examTokenDialog.showModal();
            return;
          }
          text(msg, "Dialog token tidak tersedia. Hubungi proktor.");
        } catch (err) {
          text(msg, "Gagal menyiapkan ujian: " + err.message);
        } finally {
          done();
        }
      });
    }

    async function startAttemptByExamID(examID, token, busyTarget) {
      const done = beginBusy(busyTarget || form, msg, "Menyiapkan attempt...");
      try {
        const payload = { exam_id: Number(examID || 0) };
        const examToken = String(token || "").trim();
        payload.exam_token = examToken;
        if (user.role === "admin" || user.role === "proktor") {
          payload.student_id = user.id;
        }
        const out = await api("/api/v1/attempts/start", "POST", payload);
        window.location.href = "/ujian/" + out.id;
        return out;
      } catch (err) {
        text(msg, "Gagal start attempt: " + err.message);
        throw err;
      } finally {
        done();
      }
    }

    async function loadStudentProfile() {
      return api("/api/v1/auth/me/student-profile", "GET");
    }

    function setProfileCell(el, value) {
      if (!el) return;
      const raw = String(value || "").trim();
      el.textContent = raw || "-";
    }

    function formatDateTimeID(value) {
      if (!value) return "-";
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return String(value);
      return d.toLocaleString("id-ID");
    }

    function resolveExamFlowErrorMessage(err, genericMessage) {
      const raw = String((err && err.message) || "").trim();
      const normalized = raw.toLowerCase();
      if (!raw || normalized === "internal error") {
        return genericMessage;
      }
      if (
        normalized.includes("token") ||
        normalized.includes("unauthorized") ||
        normalized.includes("forbidden") ||
        normalized.includes("invalid")
      ) {
        return "Token ujian salah atau tidak berlaku.";
      }
      return raw;
    }

    async function previewExamByToken(token, examID) {
      const cleanToken = String(token || "").trim();
      if (!cleanToken) {
        throw new Error("Token ujian wajib diisi.");
      }
      const payload = {
        exam_token: cleanToken,
      };
      const selectedExamID = Number(examID || 0);
      if (selectedExamID > 0) {
        payload.exam_id = selectedExamID;
      }
      return api("/api/v1/attempts/token/preview", "POST", payload);
    }

    async function showStudentProfileStep() {
      try {
        const profile = await loadStudentProfile();
        setProfileCell(profileParticipantNo, profile.participant_no);
        setProfileCell(profileFullName, profile.full_name);
        setProfileCell(profileClassName, profile.class_name);
        setProfileCell(profileNISN, profile.nisn);
        setProfileCell(profileSchoolName, profile.school_name);
        setProfileCell(profileSchoolCode, profile.school_code);
      } catch (err) {
        text(msg, "Gagal memuat data peserta: " + err.message);
        return false;
      }
      if (
        studentProfileDialog &&
        typeof studentProfileDialog.showModal === "function"
      ) {
        studentProfileDialog.showModal();
        return true;
      }
      text(
        msg,
        "Dialog konfirmasi data tidak tersedia. Hubungi proktor untuk bantuan.",
      );
      return false;
    }

    function renderExamReadyDialog(preview) {
      const exam = preview || {};
      text(examReadyCode, String(exam.exam_code || "-"));
      text(examReadyTitle, String(exam.exam_title || "-"));
      text(examReadySubject, String(exam.subject_name || "-"));
      text(
        examReadyDuration,
        String(Number(exam.duration_minutes || 0)) + " menit",
      );
      text(examReadyStart, formatDateTimeID(exam.start_at));
      text(examReadyEnd, formatDateTimeID(exam.end_at));
      text(
        examReadyAttempt,
        String(Number(exam.attempts_used || 0)) +
          " / " +
          String(Number(exam.max_attempts || 0)) +
          " (sisa " +
          String(Number(exam.attempts_remaining || 0)) +
          ")",
      );
      text(examReadyTokenExpiry, formatDateTimeID(exam.token_expires_at));
    }

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      const examID = Number(examSelect.value || 0);
      if (!examID) return;
      pendingStartExamID = examID;
      pendingStartToken = "";
      pendingPreviewData = null;

      if (!isStudentRole) {
        if (examTokenDialogInput) examTokenDialogInput.value = "";
        if (
          examTokenDialog &&
          typeof examTokenDialog.showModal === "function"
        ) {
          if (examTokenDialogHelp) {
            examTokenDialogHelp.textContent = tokenDialogHelpDefault;
          }
          examTokenDialog.showModal();
          return;
        }
        text(msg, "Dialog token tidak tersedia. Hubungi proktor.");
        return;
      }
      await showStudentProfileStep();
    });

    if (examTokenDialogCancelBtn) {
      examTokenDialogCancelBtn.addEventListener("click", function () {
        if (isStudentRole && !isNonRegular) {
          window.location.href = "/peserta";
          return;
        }
        pendingStartExamID = 0;
        pendingStartToken = "";
        pendingPreviewData = null;
        if (examTokenDialogInput) {
          examTokenDialogInput.value = "";
        }
        if (examTokenDialogHelp) {
          examTokenDialogHelp.textContent = tokenDialogHelpDefault;
        }
        if (examTokenDialog && typeof examTokenDialog.close === "function") {
          examTokenDialog.close();
        }
        if (isNonRegular) {
          text(msg, "Kembali ke daftar ujian aktif.");
          return;
        }
        window.location.href = "/peserta";
      });
    }

    if (studentProfileWrongBtn) {
      studentProfileWrongBtn.addEventListener("click", function () {
        pendingStartExamID = 0;
        if (
          studentProfileDialog &&
          typeof studentProfileDialog.close === "function"
        ) {
          studentProfileDialog.close();
        }
        text(msg, "Data tidak sesuai. Hubungi proktor sebelum lanjut ujian.");
      });
    }

    if (studentProfileDialogForm) {
      studentProfileDialogForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        if (
          studentProfileDialog &&
          typeof studentProfileDialog.close === "function"
        ) {
          studentProfileDialog.close();
        }
        if (!pendingPreviewData || !pendingStartToken) {
          text(
            msg,
            "Token ujian belum valid. Silakan isi token terlebih dulu.",
          );
          if (examTokenDialogInput) examTokenDialogInput.value = "";
          if (
            examTokenDialog &&
            typeof examTokenDialog.showModal === "function"
          ) {
            if (examTokenDialogHelp) {
              examTokenDialogHelp.textContent = tokenDialogHelpDefault;
            }
            examTokenDialog.showModal();
            return;
          }
          text(msg, "Dialog token tidak tersedia. Hubungi proktor.");
          return;
        }
        renderExamReadyDialog(pendingPreviewData);
        if (examReadyDialogHelp) {
          examReadyDialogHelp.textContent = examReadyHelpDefault;
        }
        if (
          examReadyDialog &&
          typeof examReadyDialog.showModal === "function"
        ) {
          examReadyDialog.showModal();
          return;
        }
      });
    }

    if (examTokenDialogForm) {
      examTokenDialogForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const selectedExamID = Number(pendingStartExamID || 0);
        if (!isStudentRole && selectedExamID <= 0) return;
        const token = String(
          (examTokenDialogInput && examTokenDialogInput.value) || "",
        ).trim();
        if (!token) {
          text(msg, "Token ujian wajib diisi.");
          if (examTokenDialogHelp) {
            examTokenDialogHelp.textContent = "Token ujian wajib diisi.";
          }
          return;
        }
        if (examTokenDialogHelp) {
          examTokenDialogHelp.textContent = tokenDialogHelpDefault;
        }
        try {
          const preview = await previewExamByToken(token, selectedExamID);
          const previewExamID = Number((preview && preview.exam_id) || 0);
          if (previewExamID <= 0) {
            throw new Error("Informasi ujian tidak valid.");
          }
          if (selectedExamID > 0 && previewExamID !== selectedExamID) {
            throw new Error(
              "Token tidak sesuai dengan ujian yang dipilih. Silakan pilih ujian yang benar.",
            );
          }
          pendingStartExamID = previewExamID;
          pendingStartToken = token;
          pendingPreviewData = preview;
          if (examTokenDialog && typeof examTokenDialog.close === "function") {
            examTokenDialog.close();
          }
          if (isStudentRole) {
            await showStudentProfileStep();
            return;
          }
          renderExamReadyDialog(preview);
          if (examReadyDialogHelp) {
            examReadyDialogHelp.textContent = examReadyHelpDefault;
          }
          if (
            examReadyDialog &&
            typeof examReadyDialog.showModal === "function"
          ) {
            examReadyDialog.showModal();
          }
        } catch (err) {
          const warnText = resolveExamFlowErrorMessage(
            err,
            "Gagal memverifikasi token ujian. Coba lagi.",
          );
          if (examTokenDialogHelp) {
            examTokenDialogHelp.textContent = warnText;
          }
          window.alert(warnText);
          if (examTokenDialogInput) {
            examTokenDialogInput.focus();
            examTokenDialogInput.select();
          }
        }
      });
    }

    if (examReadyDialogCancelBtn) {
      examReadyDialogCancelBtn.addEventListener("click", function () {
        pendingStartToken = "";
        pendingPreviewData = null;
        if (examReadyDialogHelp) {
          examReadyDialogHelp.textContent = examReadyHelpDefault;
        }
        if (examReadyDialog && typeof examReadyDialog.close === "function") {
          examReadyDialog.close();
        }
      });
    }

    if (examReadyDialogForm) {
      examReadyDialogForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        if (examReadyDialog && typeof examReadyDialog.close === "function") {
          examReadyDialog.close();
        }
        if (examInstructionConfirm) {
          examInstructionConfirm.checked = false;
        }
        if (examInstructionDialogHelp) {
          examInstructionDialogHelp.textContent = examInstructionHelpDefault;
        }
        if (
          examInstructionDialog &&
          typeof examInstructionDialog.showModal === "function"
        ) {
          examInstructionDialog.showModal();
          return;
        }
        text(msg, "Dialog petunjuk tidak tersedia. Hubungi proktor.");
      });
    }

    if (examInstructionDialogCancelBtn) {
      examInstructionDialogCancelBtn.addEventListener("click", function () {
        if (
          examInstructionDialog &&
          typeof examInstructionDialog.close === "function"
        ) {
          examInstructionDialog.close();
        }
        if (examReadyDialogHelp) {
          examReadyDialogHelp.textContent = examReadyHelpDefault;
        }
        if (
          examReadyDialog &&
          typeof examReadyDialog.showModal === "function"
        ) {
          examReadyDialog.showModal();
        }
      });
    }

    if (examInstructionDialogForm) {
      examInstructionDialogForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const examID = Number(
          (pendingPreviewData && pendingPreviewData.exam_id) ||
            pendingStartExamID ||
            0,
        );
        const token = String(pendingStartToken || "").trim();
        if (examID <= 0 || !token) {
          text(msg, "Sesi ujian tidak valid. Silakan ulangi dari awal.");
          return;
        }
        if (!examInstructionConfirm || !examInstructionConfirm.checked) {
          if (examInstructionDialogHelp) {
            examInstructionDialogHelp.textContent =
              "Centang persetujuan terlebih dulu sebelum mulai ujian.";
          }
          return;
        }
        if (examInstructionDialogHelp) {
          examInstructionDialogHelp.textContent = examInstructionHelpDefault;
        }
        try {
          await startAttemptByExamID(examID, token, examInstructionDialogForm);
        } catch (err) {
          const warn = resolveExamFlowErrorMessage(
            err,
            "Gagal memulai ujian. Coba lagi.",
          );
          if (examInstructionDialogHelp) {
            examInstructionDialogHelp.textContent = warn;
          }
          window.alert(warn);
        }
      });
    }

    if (isStudentRole) {
      if (legacyFlow) legacyFlow.hidden = true;
      if (isNonRegular) {
        const done = beginBusy(form, msg, "Memuat daftar ujian aktif...");
        try {
          await loadPublishedExams();
          text(
            msg,
            "Pilih salah satu ujian aktif terlebih dulu. Token baru diminta setelah ujian dipilih.",
          );
        } catch (err) {
          text(msg, "Gagal memuat daftar ujian aktif: " + err.message);
        } finally {
          done();
        }
        return;
      }
      if (examTokenDialogInput) examTokenDialogInput.value = "";
      if (examTokenDialogHelp) {
        examTokenDialogHelp.textContent = tokenDialogHelpDefault;
      }
      text(msg, "Masukkan token ujian untuk melanjutkan.");
      if (examTokenDialog && typeof examTokenDialog.showModal === "function") {
        examTokenDialog.showModal();
      }
    }
  }

  window.AppPages = window.AppPages || {};
  window.AppPages.initSimulasiPage = initSimulasiPage;
})();
