(function () {
  function cookieValue(name) {
    const match = document.cookie.match(
      new RegExp("(?:^|; )" + name + "=([^;]*)"),
    );
    return match ? decodeURIComponent(match[1]) : "";
  }

  function csrfHeaders(method) {
    const headers = { "Content-Type": "application/json" };
    const m = String(method || "GET").toUpperCase();
    if (m === "POST" || m === "PUT" || m === "PATCH" || m === "DELETE") {
      const csrf = cookieValue("cbtlms_csrf");
      if (csrf) headers["X-CSRF-Token"] = csrf;
    }
    return headers;
  }

  function extractAPIError(json, statusText) {
    if (!json || typeof json !== "object") {
      return statusText || "Request failed";
    }
    if (typeof json.error === "string" && json.error.trim()) {
      return json.error.trim();
    }
    if (
      json.error &&
      typeof json.error === "object" &&
      typeof json.error.message === "string" &&
      json.error.message.trim()
    ) {
      return json.error.message.trim();
    }
    if (typeof json.message === "string" && json.message.trim()) {
      return json.message.trim();
    }
    return statusText || "Request failed";
  }

  async function api(path, method, body) {
    const res = await fetch(path, {
      method,
      credentials: "include",
      headers: csrfHeaders(method),
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(function () {
      return {};
    });
    if (!res.ok || !json.ok) {
      const msg = extractAPIError(json, res.statusText || "Request failed");
      throw new Error(msg);
    }
    return json.data;
  }

  async function apiMultipart(path, method, formData) {
    const m = String(method || "POST").toUpperCase();
    const headers = {};
    if (m === "POST" || m === "PUT" || m === "PATCH" || m === "DELETE") {
      const csrf = cookieValue("cbtlms_csrf");
      if (csrf) headers["X-CSRF-Token"] = csrf;
    }
    const res = await fetch(path, {
      method: m,
      credentials: "include",
      headers: headers,
      body: formData,
    });
    const json = await res.json().catch(function () {
      return {};
    });
    if (!res.ok || !json.ok) {
      const msg = extractAPIError(json, res.statusText || "Request failed");
      throw new Error(msg);
    }
    return json.data;
  }

  async function meOrNull() {
    try {
      return await api("/api/v1/auth/me", "GET");
    } catch (_) {
      return null;
    }
  }

  function text(el, value) {
    if (el) el.textContent = value;
  }

  function html(el, value) {
    if (el) el.innerHTML = value;
  }

  function escapeHtml(input) {
    return String(input || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function parseJSONLoose(raw, fallback) {
    if (raw === null || typeof raw === "undefined") return fallback;
    if (typeof raw === "object") return raw;
    if (typeof raw === "string") {
      const s = raw.trim();
      if (!s) return fallback;
      try {
        return JSON.parse(s);
      } catch (_) {
        return fallback;
      }
    }
    return fallback;
  }

  const LOGIN_EXAM_TOKEN_STORAGE_KEY = "cbtlms_login_exam_token";

  function shortQuestionTypeLabel(qType) {
    const v = String(qType || "")
      .toLowerCase()
      .trim();
    if (v === "pg_tunggal") return "MC";
    if (v === "multi_jawaban") return "MR";
    if (v === "benar_salah_pernyataan") return "TF";
    return "-";
  }

  function normalizeCredential(input) {
    return String(input || "")
      .normalize("NFKC")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/\u00A0/g, " ")
      .trim();
  }

  function beginBusy(container, messageEl, loadingText) {
    if (messageEl && loadingText) text(messageEl, loadingText);
    if (!container) return function () {};

    const controls = [];
    const isForm = !!(container.matches && container.matches("form"));
    if (isForm) {
      // Keep input/select/textarea enabled so FormData values remain readable.
      container.querySelectorAll("button").forEach(function (el) {
        controls.push(el);
      });
    } else {
      if (
        container.matches &&
        container.matches("button, input, select, textarea")
      ) {
        controls.push(container);
      }
      container
        .querySelectorAll("button, input, select, textarea")
        .forEach(function (el) {
          controls.push(el);
        });
    }

    const changed = [];
    controls.forEach(function (el) {
      if (!el.disabled) {
        el.disabled = true;
        changed.push(el);
      }
    });
    if (container.setAttribute) container.setAttribute("aria-busy", "true");

    return function done() {
      changed.forEach(function (el) {
        el.disabled = false;
      });
      if (container.removeAttribute) container.removeAttribute("aria-busy");
    };
  }

  async function initTopbarAuth() {
    const userLabel = document.getElementById("nav-user");
    const logoutBtn = document.getElementById("nav-logout");
    if (!userLabel || !logoutBtn) return;

    const user = await meOrNull();
    if (!user) {
      text(userLabel, "");
      logoutBtn.hidden = true;
      return;
    }

    const label =
      (user.full_name || user.username || "User") +
      " (" +
      String(user.role || "user") +
      ")";
    text(userLabel, label);
    logoutBtn.hidden = false;

    logoutBtn.addEventListener("click", async function () {
      const done = beginBusy(logoutBtn, null, "");
      try {
        await api("/api/v1/auth/logout", "POST");
      } catch (_) {
        // Ignore API error and still force local redirect.
      } finally {
        done();
      }
      window.location.href = "/login";
    });
  }

  async function initLoginPage() {
    const form = document.getElementById("login-form");
    if (!form) return;
    const msg = document.getElementById("login-message");
    const passwordInput = document.getElementById("login-password");
    const togglePasswordBtn = document.getElementById("toggle-login-password");
    const loginExamTokenInput = document.getElementById("login-exam-token");

    if (passwordInput && togglePasswordBtn) {
      togglePasswordBtn.addEventListener("click", function () {
        const show = passwordInput.type === "password";
        passwordInput.type = show ? "text" : "password";
        togglePasswordBtn.setAttribute("aria-pressed", show ? "true" : "false");
        togglePasswordBtn.setAttribute(
          "aria-label",
          show ? "Sembunyikan password" : "Tampilkan password",
        );
        togglePasswordBtn.textContent = show ? "Sembunyikan" : "Lihat";
      });
    }

    function homeByRole(userLike) {
      const role = String((userLike && userLike.role) || "")
        .trim()
        .toLowerCase();
      if (role === "admin") return "/admin";
      if (role === "proktor") return "/proktor";
      if (role === "guru") return "/guru";
      return "/ujian";
    }

    const user = await meOrNull();
    if (user) {
      window.location.href = homeByRole(user);
      return;
    }

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      const done = beginBusy(form, msg, "Memproses login...");
      const fd = new FormData(form);
      try {
        const identifier = normalizeCredential(fd.get("identifier"));
        const password = normalizeCredential(fd.get("password"));
        const examToken = String(fd.get("exam_token") || "").trim();
        await api("/api/v1/auth/login-password", "POST", {
          identifier: identifier,
          password: password,
        });
        const me = await meOrNull();
        const role = String((me && me.role) || "")
          .trim()
          .toLowerCase();
        if (role === "siswa" && !examToken) {
          try {
            await api("/api/v1/auth/logout", "POST");
          } catch (_) {
            // no-op
          }
          text(msg, "Token ujian wajib diisi untuk login siswa.");
          if (loginExamTokenInput) loginExamTokenInput.focus();
          return;
        }
        if (role === "siswa") {
          try {
            await api("/api/v1/attempts/token/preview", "POST", {
              exam_token: examToken,
            });
          } catch (err) {
            try {
              await api("/api/v1/auth/logout", "POST");
            } catch (_) {
              // no-op
            }
            text(msg, "Login gagal: token ujian salah atau tidak berlaku.");
            if (loginExamTokenInput) {
              loginExamTokenInput.focus();
              loginExamTokenInput.select();
            }
            return;
          }
        }
        try {
          if (role === "siswa") {
            window.sessionStorage.setItem(
              LOGIN_EXAM_TOKEN_STORAGE_KEY,
              examToken,
            );
          } else {
            window.sessionStorage.removeItem(LOGIN_EXAM_TOKEN_STORAGE_KEY);
          }
        } catch (_) {
          // Ignore if storage is unavailable.
        }
        window.location.href = homeByRole(me);
      } catch (err) {
        text(msg, "Login gagal: " + err.message);
      } finally {
        done();
      }
    });
  }

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
    const startBtn = document.getElementById("start-btn");
    let pendingStartExamID = 0;
    let pendingStartToken = "";
    let pendingPreviewData = null;
    const userRole = String((user && user.role) || "")
      .trim()
      .toLowerCase();
    const isStudentRole = userRole === "siswa";
    const tokenDialogHelpDefault = String(
      (examTokenDialogHelp && examTokenDialogHelp.textContent) ||
        "Token wajib diisi. Mintakan token ujian ke proktor.",
    ).trim();
    const examReadyHelpDefault = String(
      (examReadyDialogHelp && examReadyDialogHelp.textContent) ||
        "Pastikan informasi ujian sudah benar sebelum memulai.",
    ).trim();
    let loginExamToken = "";
    try {
      loginExamToken = String(
        window.sessionStorage.getItem(LOGIN_EXAM_TOKEN_STORAGE_KEY) || "",
      ).trim();
    } catch (_) {
      loginExamToken = "";
    }

    let subjects = [];
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

    async function previewExamByToken(token) {
      const cleanToken = String(token || "").trim();
      if (!cleanToken) {
        throw new Error("Token ujian wajib diisi.");
      }
      return api("/api/v1/attempts/token/preview", "POST", {
        exam_token: cleanToken,
      });
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
        pendingStartExamID = 0;
        if (examTokenDialogHelp) {
          examTokenDialogHelp.textContent = tokenDialogHelpDefault;
        }
        if (examTokenDialog && typeof examTokenDialog.close === "function") {
          examTokenDialog.close();
        }
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
        const stagedToken = String(loginExamToken || "").trim();
        if (stagedToken) {
          const done = beginBusy(
            studentProfileDialogForm,
            msg,
            "Memvalidasi token ujian...",
          );
          try {
            const preview = await previewExamByToken(stagedToken);
            pendingStartExamID = Number((preview && preview.exam_id) || 0);
            pendingStartToken = stagedToken;
            pendingPreviewData = preview;
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
            return;
          } catch (err) {
            text(msg, "Token ujian salah/tidak valid: " + err.message);
            window.alert("Token ujian salah atau tidak valid.");
            return;
          } finally {
            done();
          }
        }
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
      });
    }

    if (examTokenDialogForm) {
      examTokenDialogForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const selectedExamID = Number(pendingStartExamID || 0);
        if (selectedExamID <= 0) return;
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
          const preview = await previewExamByToken(token);
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
          renderExamReadyDialog(preview);
          if (examReadyDialogHelp) {
            examReadyDialogHelp.textContent = examReadyHelpDefault;
          }
          if (examTokenDialog && typeof examTokenDialog.close === "function") {
            examTokenDialog.close();
          }
          if (
            examReadyDialog &&
            typeof examReadyDialog.showModal === "function"
          ) {
            examReadyDialog.showModal();
          }
        } catch (err) {
          const errMsg = String((err && err.message) || "").toLowerCase();
          const tokenInvalid =
            errMsg.includes("token") ||
            errMsg.includes("unauthorized") ||
            errMsg.includes("forbidden") ||
            errMsg.includes("invalid");
          const warnText = tokenInvalid
            ? "Token ujian salah atau tidak berlaku."
            : "Gagal memverifikasi token ujian. Coba lagi.";
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
        if (examReadyDialogHelp) {
          examReadyDialogHelp.textContent = examReadyHelpDefault;
        }
        try {
          await startAttemptByExamID(examID, token, examReadyDialogForm);
          try {
            window.sessionStorage.removeItem(LOGIN_EXAM_TOKEN_STORAGE_KEY);
          } catch (_) {
            // Ignore if storage is unavailable.
          }
        } catch (err) {
          const errMsg = String((err && err.message) || "").toLowerCase();
          const warn = errMsg.includes("token")
            ? "Token ujian salah atau tidak berlaku."
            : "Gagal memulai ujian: " + err.message;
          if (examReadyDialogHelp) {
            examReadyDialogHelp.textContent = warn;
          }
          window.alert(warn);
        }
      });
    }

    if (isStudentRole && loginExamToken) {
      if (legacyFlow) legacyFlow.hidden = true;
      const done = beginBusy(form, msg, "Memvalidasi token dari login...");
      try {
        const preview = await previewExamByToken(loginExamToken);
        pendingStartExamID = Number((preview && preview.exam_id) || 0);
        pendingStartToken = loginExamToken;
        pendingPreviewData = preview;
        text(
          msg,
          "Token valid. Lanjutkan konfirmasi data peserta untuk memulai ujian.",
        );
        await showStudentProfileStep();
      } catch (err) {
        text(msg, "Token dari login tidak valid: " + err.message);
        window.alert("Token dari login tidak valid. Silakan login ulang.");
        try {
          await api("/api/v1/auth/logout", "POST");
        } catch (_) {
          // no-op
        }
        window.location.href = "/login";
      } finally {
        done();
      }
    }
  }

  function readSelectedFromPayload(payload) {
    if (!payload || typeof payload !== "object") return [];
    const v = payload.selected;
    if (typeof v === "string") return v ? [v] : [];
    if (Array.isArray(v))
      return v.filter(function (x) {
        return typeof x === "string" && x.trim() !== "";
      });
    return [];
  }

  async function initAttemptPage() {
    const root = document.getElementById("attempt-root");
    if (!root) return;

    const user = await meOrNull();
    if (!user) {
      window.location.href = "/login";
      return;
    }

    const attemptID = Number(root.getAttribute("data-attempt-id") || 0);
    let currentNo = 1;
    let totalQuestions = 1;
    let currentQuestion = null;
    let remainInterval = null;
    let attemptEditable = true;

    const remainingLabel = document.getElementById("remaining-label");
    const message = document.getElementById("attempt-message");
    const attemptPageTitle = document.getElementById("attempt-page-title");
    const questionTitle = document.getElementById("question-title");
    const stimulusBox = document.getElementById("stimulus-box");
    const stemBox = document.getElementById("stem-box");
    const optionsBox = document.getElementById("options-box");
    const doubtCheckbox = document.getElementById("doubt-checkbox");
    const prevBtn = document.getElementById("prev-btn");
    const nextBtn = document.getElementById("next-btn");
    const submitBtn = document.getElementById("submit-btn");
    const actionsBar = document.querySelector(".actions");
    const infoSoalBtn = document.getElementById("info-soal-btn");
    const infoSoalDialog = document.getElementById("info-soal-dialog");
    const infoSoalContent = document.getElementById("info-soal-content");
    const infoSoalCloseBtn = document.getElementById("info-soal-close-btn");
    const attemptFinishDialog = document.getElementById(
      "attempt-finish-dialog",
    );
    const attemptFinishContent = document.getElementById(
      "attempt-finish-content",
    );
    const attemptFinishCloseBtn = document.getElementById(
      "attempt-finish-close-btn",
    );
    const attemptFinishResultBtn = document.getElementById(
      "attempt-finish-result-btn",
    );
    const daftarSoalBtn = document.getElementById("daftar-soal-btn");
    const daftarSoalPanel = document.getElementById("daftar-soal-panel");
    const daftarSoalBody = document.getElementById("daftar-soal-body");
    const fontSmallBtn = document.getElementById("font-small-btn");
    const fontMediumBtn = document.getElementById("font-medium-btn");
    const fontLargeBtn = document.getElementById("font-large-btn");
    const eventMessage = document.getElementById("attempt-event-message");
    const questionState = {};
    let eventMessageTimer = null;
    const eventLastAt = {};
    const eventMinIntervalMs = {
      tab_blur: 5000,
      reconnect: 5000,
      fullscreen_exit: 5000,
      rapid_refresh: 15000,
    };
    const pendingEvents = [];
    let flushingEvents = false;
    const fontStorageKey = "cbtlms_attempt_font_size";
    let attemptMathReady = false;

    function formatRemain(secs) {
      const s = Math.max(0, Number(secs || 0));
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const ss = s % 60;
      return (
        String(h).padStart(2, "0") +
        ":" +
        String(m).padStart(2, "0") +
        ":" +
        String(ss).padStart(2, "0")
      );
    }

    function applyFontSize(size) {
      const allowed = ["small", "medium", "large"];
      const value = allowed.includes(String(size || ""))
        ? String(size)
        : "medium";
      root.setAttribute("data-font-size", value);
      if (fontSmallBtn) {
        const active = value === "small";
        fontSmallBtn.classList.toggle("active", active);
        fontSmallBtn.setAttribute("aria-pressed", active ? "true" : "false");
      }
      if (fontMediumBtn) {
        const active = value === "medium";
        fontMediumBtn.classList.toggle("active", active);
        fontMediumBtn.setAttribute("aria-pressed", active ? "true" : "false");
      }
      if (fontLargeBtn) {
        const active = value === "large";
        fontLargeBtn.classList.toggle("active", active);
        fontLargeBtn.setAttribute("aria-pressed", active ? "true" : "false");
      }
      try {
        window.localStorage.setItem(fontStorageKey, value);
      } catch (_) {
        // Ignore if storage is unavailable.
      }
    }

    function loadSavedFontSize() {
      try {
        const saved = window.localStorage.getItem(fontStorageKey);
        if (saved) return saved;
      } catch (_) {
        // Ignore if storage is unavailable.
      }
      return "medium";
    }

    function isAnsweredPayload(qType, payload, questionLike) {
      if (qType === "benar_salah_pernyataan") {
        const statements = readTFStatements(questionLike);
        if (!Array.isArray(statements) || statements.length === 0) return false;
        const expected = new Set(
          statements.map(function (s, idx) {
            return String((s && s.id) || "S" + (idx + 1));
          }),
        );
        if (expected.size === 0) return false;
        const answers = Array.isArray(payload && payload.answers)
          ? payload.answers
          : [];
        const answered = new Set();
        answers.forEach(function (a) {
          if (!a || typeof a !== "object") return;
          const id = String(a.id || "").trim();
          if (!id || !expected.has(id)) return;
          if (typeof a.value !== "boolean") return;
          answered.add(id);
        });
        return answered.size === expected.size;
      }
      if (qType === "pg_tunggal") {
        return (
          typeof payload.selected === "string" && payload.selected.trim() !== ""
        );
      }
      if (qType === "multi_jawaban") {
        return Array.isArray(payload.selected) && payload.selected.length > 0;
      }
      return false;
    }

    function isAnswered(questionLike) {
      if (!questionLike) return false;
      const qType = String(questionLike.question_type || "").toLowerCase();
      const payload = parseJSONLoose(questionLike.answer_payload, {});
      return isAnsweredPayload(qType, payload, questionLike);
    }

    function questionTypeLabel(qType) {
      const v = String(qType || "").toLowerCase();
      if (v === "pg_tunggal") return "Pilihan Ganda Tunggal";
      if (v === "multi_jawaban") return "Pilihan Ganda Multi Jawaban";
      if (v === "benar_salah_pernyataan") return "Benar/Salah Pernyataan";
      return v || "-";
    }

    function ensureQuestionList() {
      if (!daftarSoalBody) return;
      if (daftarSoalBody.childElementCount === totalQuestions) return;
      daftarSoalBody.innerHTML = "";
      for (let i = 1; i <= totalQuestions; i += 1) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "qno-btn";
        btn.setAttribute("data-qno", String(i));
        btn.textContent = String(i);
        daftarSoalBody.appendChild(btn);
      }
    }

    function renderQuestionListState() {
      if (!daftarSoalBody) return;
      daftarSoalBody.querySelectorAll(".qno-btn").forEach(function (btn) {
        const no = Number(btn.getAttribute("data-qno") || 0);
        const state = questionState[no] || {};
        btn.classList.toggle("current", no === currentNo);
        btn.classList.toggle("answered", !!state.answered);
        btn.classList.toggle("doubt", !!state.doubt);
      });
    }

    function closeQuestionList() {
      if (!daftarSoalPanel || !daftarSoalBtn) return;
      daftarSoalPanel.hidden = true;
      daftarSoalBtn.setAttribute("aria-expanded", "false");
    }

    function openQuestionList() {
      if (!daftarSoalPanel || !daftarSoalBtn) return;
      ensureQuestionList();
      renderQuestionListState();
      daftarSoalPanel.hidden = false;
      daftarSoalBtn.setAttribute("aria-expanded", "true");
    }

    async function loadSummary() {
      const sum = await api("/api/v1/attempts/" + attemptID, "GET");
      const examTitle = String(sum.title || "").trim();
      if (attemptPageTitle) {
        attemptPageTitle.textContent = examTitle
          ? "Ujian " + examTitle
          : "Ujian #" + String(attemptID);
      }
      totalQuestions = Number(sum.total_questions || 1);
      attemptEditable = String(sum.status || "") === "in_progress";
      ensureQuestionList();
      let remain = Number(sum.remaining_secs || 0);
      text(remainingLabel, formatRemain(remain));
      if (remainInterval) clearInterval(remainInterval);
      remainInterval = setInterval(function () {
        remain = Math.max(0, remain - 1);
        text(remainingLabel, formatRemain(remain));
      }, 1000);
      return sum;
    }

    function normalizeAttemptStemHTML(stemHTML) {
      let stem = String(stemHTML || "");
      stem = stem.replace(/^\s*<p>\s*draft naskah soal:\s*/i, "<p>");
      stem = stem.replace(/^\s*draft naskah soal:\s*/i, "");
      return stem;
    }

    function applyAttemptReadonlyState(summaryStatus) {
      attemptEditable = false;
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      submitBtn.disabled = true;
      submitBtn.hidden = true;
      doubtCheckbox.disabled = true;
      optionsBox
        .querySelectorAll("input, button, select, textarea")
        .forEach(function (el) {
          el.disabled = true;
        });
      html(
        message,
        "Attempt sudah " +
          escapeHtml(String(summaryStatus || "final")) +
          ' dan tidak bisa diedit. Buka <a href="/hasil/' +
          encodeURIComponent(String(attemptID)) +
          '">halaman hasil</a>.',
      );
    }

    async function closeExamAndLogout() {
      try {
        await api("/api/v1/auth/logout", "POST");
      } catch (_) {
        // Ignore API error and still redirect to login.
      }
      window.location.href = "/login";
    }

    function showAttemptFinishDialog() {
      const msgText =
        'Ujian telah selesai, silakan mengakhiri dengan klik "Tutup" atau "Lihat Hasil Ujian".';
      if (attemptFinishContent) {
        attemptFinishContent.textContent = msgText;
      }
      if (
        attemptFinishDialog &&
        typeof attemptFinishDialog.showModal === "function"
      ) {
        attemptFinishDialog.showModal();
        return;
      }
      window.alert(msgText);
    }

    function syncSubmitVisibility() {
      if (!attemptEditable) {
        submitBtn.hidden = true;
        if (actionsBar) actionsBar.classList.remove("with-submit");
        return;
      }
      const isLast = currentNo === totalQuestions;
      submitBtn.hidden = !isLast;
      if (actionsBar) actionsBar.classList.toggle("with-submit", isLast);
    }

    async function collectUnansweredQuestionNumbers() {
      const unanswered = [];
      const unknown = [];
      for (let no = 1; no <= totalQuestions; no += 1) {
        const state = questionState[no];
        if (state && state.answered === true) continue;
        if (state && state.answered === false) {
          unanswered.push(no);
          continue;
        }
        unknown.push(no);
      }

      if (!unknown.length) return unanswered;

      await Promise.all(
        unknown.map(async function (no) {
          const q = await api(
            "/api/v1/attempts/" + attemptID + "/questions/" + no,
            "GET",
          );
          const answered = isAnswered(q);
          questionState[no] = {
            answered: answered,
            doubt: !!(q && q.is_doubt),
          };
          if (!answered) unanswered.push(no);
        }),
      );

      unanswered.sort(function (a, b) {
        return a - b;
      });
      return unanswered;
    }

    function notifyEvent(msg) {
      text(eventMessage, msg);
      if (eventMessageTimer) {
        clearTimeout(eventMessageTimer);
      }
      eventMessageTimer = setTimeout(function () {
        text(eventMessage, "");
      }, 2500);
    }

    function canSendEvent(eventType) {
      const now = Date.now();
      const minInterval = eventMinIntervalMs[eventType] || 5000;
      const last = eventLastAt[eventType] || 0;
      if (now - last < minInterval) {
        return false;
      }
      eventLastAt[eventType] = now;
      return true;
    }

    async function flushAttemptEvents() {
      if (flushingEvents) return;
      flushingEvents = true;
      try {
        while (pendingEvents.length > 0) {
          const item = pendingEvents[0];
          await api("/api/v1/attempts/" + attemptID + "/events", "POST", item);
          pendingEvents.shift();
        }
      } catch (_) {
        // Non-blocking: anti-cheat logging should never break exam flow.
      } finally {
        flushingEvents = false;
      }
    }

    function queueAttemptEvent(eventType, payload, userNotice) {
      if (!canSendEvent(eventType)) return;
      pendingEvents.push({
        event_type: eventType,
        payload: payload || {},
        client_ts: new Date().toISOString(),
      });
      if (userNotice) notifyEvent(userNotice);
      flushAttemptEvents();
    }

    function renderOptions(q) {
      const payload = parseJSONLoose(q.answer_payload, {});

      const selected = new Set(readSelectedFromPayload(payload));
      const qType = String(q.question_type || "").toLowerCase();

      if (qType === "benar_salah_pernyataan") {
        const statements = readTFStatements(q);
        if (!statements.length) {
          html(optionsBox, '<p class="muted">Pernyataan tidak tersedia.</p>');
          return;
        }

        const existing = {};
        if (Array.isArray(payload.answers)) {
          payload.answers.forEach(function (a) {
            if (a && typeof a.id === "string" && typeof a.value === "boolean") {
              existing[a.id] = a.value;
            }
          });
        }

        const rows = statements.map(function (s, idx) {
          const id = String((s && s.id) || "S" + (idx + 1));
          const label =
            (s && (s.text || s.statement || s.label || s.statement_html)) || id;
          const yesChecked = existing[id] === true ? "checked" : "";
          const noChecked = existing[id] === false ? "checked" : "";
          return (
            "<tr>" +
            '<td class="bs-statement">' +
            escapeHtml(String(label)) +
            "</td>" +
            '<td class="bs-choice">' +
            '<input type="radio" name="bs_' +
            escapeHtml(id) +
            '" value="true" ' +
            yesChecked +
            ">" +
            "</td>" +
            '<td class="bs-choice">' +
            '<input type="radio" name="bs_' +
            escapeHtml(id) +
            '" value="false" ' +
            noChecked +
            ">" +
            "</td>" +
            "</tr>"
          );
        });
        html(
          optionsBox,
          '<table class="bs-table"><thead><tr><th>Pernyataan</th><th>Benar</th><th>Salah</th></tr></thead><tbody>' +
            rows.join("") +
            "</tbody></table>",
        );
        return;
      }

      const multiple = qType === "multi_jawaban";
      const inputType = multiple ? "checkbox" : "radio";
      const rows = (q.options || []).map(function (opt) {
        const checked = selected.has(opt.option_key) ? "checked" : "";
        return [
          '<label class="option-row">',
          '<input type="' +
            inputType +
            '" name="option" value="' +
            escapeHtml(opt.option_key) +
            '" ' +
            checked +
            ">",
          "<div>" + opt.option_html + "</div>",
          "</label>",
        ].join("");
      });
      html(optionsBox, rows.join(""));
    }

    function readTFStatements(q) {
      const key = parseJSONLoose(q && q.answer_key, {});
      if (Array.isArray(key.statements) && key.statements.length) {
        return key.statements;
      }
      const options = Array.isArray(q && q.options) ? q.options : [];
      return options.map(function (opt, idx) {
        return {
          id: String((opt && opt.option_key) || "S" + (idx + 1)),
          statement_html: String((opt && opt.option_html) || ""),
        };
      });
    }

    function renderMathInContainer(el) {
      if (!attemptMathReady || !el || !window.katex) return;
      const formulaNodes = el.querySelectorAll(".ql-formula");
      formulaNodes.forEach(function (node) {
        const latex = String(node.getAttribute("data-value") || "").trim();
        if (!latex) return;
        try {
          window.katex.render(latex, node, {
            throwOnError: false,
            displayMode: false,
          });
        } catch (_) {
          // Keep original content if formula fails to render.
        }
      });
    }

    function renderLatexDelimiters(el) {
      if (!el || !window.renderMathInElement) return;
      try {
        window.renderMathInElement(el, {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "\\[", right: "\\]", display: true },
            { left: "\\(", right: "\\)", display: false },
            { left: "$", right: "$", display: false },
          ],
          throwOnError: false,
        });
      } catch (_) {
        // Ignore auto-render errors to keep content visible.
      }
    }

    function containerHasMathML(el) {
      if (!el) return false;
      return el.querySelector("math") !== null;
    }

    function containerHasLatexDelimiters(el) {
      if (!el) return false;
      const text = String(el.textContent || "");
      return (
        text.indexOf("$$") !== -1 ||
        text.indexOf("\\(") !== -1 ||
        text.indexOf("\\)") !== -1 ||
        text.indexOf("\\[") !== -1 ||
        text.indexOf("\\]") !== -1 ||
        text.indexOf("$") !== -1
      );
    }

    async function ensureAttemptMathJaxReady() {
      if (window.MathJax && window.MathJax.typesetPromise) return true;
      const existing = document.getElementById("mathjax-js");
      if (existing) {
        await new Promise(function (resolve, reject) {
          if (window.MathJax && window.MathJax.typesetPromise) {
            resolve();
            return;
          }
          existing.addEventListener("load", resolve, { once: true });
          existing.addEventListener(
            "error",
            function () {
              reject(new Error("Gagal memuat MathJax"));
            },
            { once: true },
          );
        });
        return !!(window.MathJax && window.MathJax.typesetPromise);
      }
      window.MathJax = window.MathJax || {
        tex: {
          inlineMath: [
            ["$", "$"],
            ["\\(", "\\)"],
          ],
        },
        options: { renderActions: { addMenu: [] } },
      };
      await new Promise(function (resolve, reject) {
        const script = document.createElement("script");
        script.id = "mathjax-js";
        script.src =
          "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js";
        script.async = true;
        script.onload = resolve;
        script.onerror = function () {
          reject(new Error("Gagal memuat MathJax"));
        };
        document.head.appendChild(script);
      });
      return !!(window.MathJax && window.MathJax.typesetPromise);
    }

    async function renderAttemptMath() {
      renderMathInContainer(stemBox);
      renderMathInContainer(stimulusBox);
      renderMathInContainer(optionsBox);
      renderLatexDelimiters(stemBox);
      renderLatexDelimiters(stimulusBox);
      renderLatexDelimiters(optionsBox);
      const hasMathML =
        containerHasMathML(stemBox) ||
        containerHasMathML(stimulusBox) ||
        containerHasMathML(optionsBox);
      const hasLatexDelimiters =
        containerHasLatexDelimiters(stemBox) ||
        containerHasLatexDelimiters(stimulusBox) ||
        containerHasLatexDelimiters(optionsBox);
      if (hasMathML || (!window.katex && hasLatexDelimiters)) {
        try {
          const ready = await ensureAttemptMathJaxReady();
          if (ready && window.MathJax && window.MathJax.typesetPromise) {
            await window.MathJax.typesetPromise([
              stemBox,
              stimulusBox,
              optionsBox,
            ]);
          }
        } catch (_) {
          // Keep original MathML if MathJax fails to load.
        }
      }
    }

    async function ensureAttemptKatexReady() {
      if (!document.getElementById("katex-css")) {
        const css = document.createElement("link");
        css.id = "katex-css";
        css.rel = "stylesheet";
        css.href =
          "https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/katex.min.css";
        document.head.appendChild(css);
      }
      if (window.katex) return true;
      const existing = document.getElementById("katex-js");
      if (existing) {
        await new Promise(function (resolve, reject) {
          if (window.katex) {
            resolve();
            return;
          }
          existing.addEventListener("load", resolve, { once: true });
          existing.addEventListener(
            "error",
            function () {
              reject(new Error("Gagal memuat KaTeX"));
            },
            { once: true },
          );
        });
        return !!window.katex;
      }
      await new Promise(function (resolve, reject) {
        const script = document.createElement("script");
        script.id = "katex-js";
        script.src =
          "https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/katex.min.js";
        script.async = true;
        script.onload = resolve;
        script.onerror = function () {
          reject(new Error("Gagal memuat KaTeX"));
        };
        document.head.appendChild(script);
      });
      if (!document.getElementById("katex-auto-render-js")) {
        try {
          await new Promise(function (resolve, reject) {
            const script = document.createElement("script");
            script.id = "katex-auto-render-js";
            script.src =
              "https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/contrib/auto-render.min.js";
            script.async = true;
            script.onload = resolve;
            script.onerror = function () {
              reject(new Error("Gagal memuat KaTeX auto-render"));
            };
            document.head.appendChild(script);
          });
        } catch (_) {
          // Auto-render is optional; KaTeX formula rendering can still work.
        }
      }
      return !!window.katex;
    }

    function collectPayload(q) {
      const qType = String(q.question_type || "").toLowerCase();
      if (qType === "benar_salah_pernyataan") {
        const statements = readTFStatements(q);
        const answers = [];

        statements.forEach(function (s, idx) {
          const id = String((s && s.id) || "S" + (idx + 1));
          const selected = document.querySelector(
            'input[name="bs_' + CSS.escape(id) + '"]:checked',
          );
          if (
            selected &&
            (selected.value === "true" || selected.value === "false")
          ) {
            answers.push({ id: id, value: selected.value === "true" });
          }
        });
        return { answers: answers };
      }

      const selectedNodes = optionsBox.querySelectorAll(
        'input[name="option"]:checked',
      );
      const selected = Array.from(selectedNodes)
        .map(function (n) {
          return String(n.value || "").trim();
        })
        .filter(Boolean);
      if (qType === "pg_tunggal") {
        return { selected: selected[0] || "" };
      }
      return { selected: selected };
    }

    async function saveCurrent() {
      if (!attemptEditable) return;
      if (!currentQuestion) return;
      const payload = collectPayload(currentQuestion);
      await api(
        "/api/v1/attempts/" +
          attemptID +
          "/answers/" +
          currentQuestion.question_id,
        "PUT",
        {
          answer_payload: payload,
          is_doubt: !!doubtCheckbox.checked,
        },
      );
      questionState[currentNo] = {
        answered: isAnsweredPayload(
          String(currentQuestion.question_type || "").toLowerCase(),
          payload,
          currentQuestion,
        ),
        doubt: !!doubtCheckbox.checked,
      };
      renderQuestionListState();
    }

    async function loadQuestion(no) {
      const q = await api(
        "/api/v1/attempts/" + attemptID + "/questions/" + no,
        "GET",
      );
      currentQuestion = q;
      currentNo = no;
      questionState[no] = {
        answered: isAnswered(q),
        doubt: !!q.is_doubt,
      };
      syncSubmitVisibility();
      renderQuestionListState();
      text(questionTitle, "Soal nomor " + no + " dari " + totalQuestions);
      html(
        stemBox,
        normalizeAttemptStemHTML(q.stem_html) ||
          '<p class="muted">Soal tidak tersedia.</p>',
      );
      html(
        stimulusBox,
        q.stimulus_html || '<p class="muted">Tidak ada stimulus.</p>',
      );
      doubtCheckbox.checked = !!q.is_doubt;
      renderOptions(q);
      renderAttemptMath();
      if (!attemptEditable) {
        applyAttemptReadonlyState("final");
        return;
      }
      text(message, "");
    }

    if (infoSoalBtn) {
      infoSoalBtn.addEventListener("click", function () {
        const qState = questionState[currentNo] || {};
        const currentType = questionTypeLabel(
          currentQuestion && currentQuestion.question_type,
        );
        const remainText = String(
          (remainingLabel && remainingLabel.textContent) || "-",
        ).trim();
        const infoHTML = [
          '<div class="attempt-info-grid">',
          '<article class="attempt-info-item">' +
            '<div class="attempt-info-k">Posisi Soal</div>' +
            '<div class="attempt-info-v">' +
            escapeHtml(String(currentNo)) +
            " / " +
            escapeHtml(String(totalQuestions)) +
            "</div>" +
            "</article>",
          '<article class="attempt-info-item">' +
            '<div class="attempt-info-k">Tipe Soal</div>' +
            '<div class="attempt-info-v">' +
            escapeHtml(currentType) +
            "</div>" +
            "</article>",
          '<article class="attempt-info-item">' +
            '<div class="attempt-info-k">Status Jawaban</div>' +
            '<div class="attempt-info-v">' +
            (qState.answered ? "Sudah terjawab" : "Belum terjawab") +
            "</div>" +
            "</article>",
          '<article class="attempt-info-item">' +
            '<div class="attempt-info-k">Status Ragu-ragu</div>' +
            '<div class="attempt-info-v">' +
            (qState.doubt ? "Ya" : "Tidak") +
            "</div>" +
            "</article>",
          '<article class="attempt-info-item">' +
            '<div class="attempt-info-k">Sisa Waktu</div>' +
            '<div class="attempt-info-v">' +
            escapeHtml(remainText) +
            "</div>" +
            "</article>",
          "</div>",
          '<div class="attempt-info-note"><strong>Panduan:</strong> klik <em>Daftar Soal</em> untuk lompat nomor, jawaban tersimpan otomatis.</div>',
        ].join("");
        if (infoSoalContent) {
          html(infoSoalContent, infoHTML);
        }
        if (infoSoalDialog && typeof infoSoalDialog.showModal === "function") {
          infoSoalDialog.showModal();
          return;
        }
        text(
          message,
          "Soal saat ini " +
            currentNo +
            "/" +
            totalQuestions +
            ". Tipe: " +
            currentType +
            ".",
        );
      });
    }

    if (infoSoalCloseBtn) {
      infoSoalCloseBtn.addEventListener("click", function () {
        if (infoSoalDialog && typeof infoSoalDialog.close === "function") {
          infoSoalDialog.close();
        }
      });
    }

    if (daftarSoalBtn) {
      daftarSoalBtn.addEventListener("click", function () {
        if (daftarSoalPanel && daftarSoalPanel.hidden) {
          openQuestionList();
          return;
        }
        closeQuestionList();
      });
    }

    if (daftarSoalBody) {
      daftarSoalBody.addEventListener("click", async function (e) {
        const btn = e.target.closest(".qno-btn");
        if (!btn) return;
        const targetNo = Number(btn.getAttribute("data-qno") || 0);
        if (!targetNo || targetNo === currentNo) return;
        const done = beginBusy(
          btn,
          message,
          "Memuat soal nomor " + targetNo + "...",
        );
        try {
          if (attemptEditable) {
            await saveCurrent();
          }
          await loadQuestion(targetNo);
        } catch (err) {
          if (String(err.message || "").includes("attempt is not editable")) {
            applyAttemptReadonlyState("submitted");
            return;
          }
          text(message, "Gagal pindah soal: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (fontSmallBtn) {
      fontSmallBtn.addEventListener("click", function () {
        applyFontSize("small");
      });
    }
    if (fontMediumBtn) {
      fontMediumBtn.addEventListener("click", function () {
        applyFontSize("medium");
      });
    }
    if (fontLargeBtn) {
      fontLargeBtn.addEventListener("click", function () {
        applyFontSize("large");
      });
    }

    document
      .getElementById("prev-btn")
      .addEventListener("click", async function () {
        if (!attemptEditable) return;
        if (currentNo <= 1) return;
        const done = beginBusy(this, message, "Memuat soal sebelumnya...");
        try {
          await saveCurrent();
          await loadQuestion(currentNo - 1);
        } catch (err) {
          if (String(err.message || "").includes("attempt is not editable")) {
            applyAttemptReadonlyState("submitted");
            return;
          }
          text(message, "Gagal pindah soal: " + err.message);
        } finally {
          done();
        }
      });

    document
      .getElementById("next-btn")
      .addEventListener("click", async function () {
        if (!attemptEditable) return;
        if (currentNo >= totalQuestions) return;
        const done = beginBusy(this, message, "Memuat soal berikutnya...");
        try {
          await saveCurrent();
          await loadQuestion(currentNo + 1);
        } catch (err) {
          if (String(err.message || "").includes("attempt is not editable")) {
            applyAttemptReadonlyState("submitted");
            return;
          }
          text(message, "Gagal pindah soal: " + err.message);
        } finally {
          done();
        }
      });

    document
      .getElementById("submit-btn")
      .addEventListener("click", async function () {
        if (!attemptEditable) return;
        const done = beginBusy(this, message, "Memproses submit final...");
        try {
          await saveCurrent();
          const unansweredNumbers = await collectUnansweredQuestionNumbers();
          renderQuestionListState();
          if (unansweredNumbers.length > 0) {
            window.alert(
              "Anda belum mengerjakan soal nomor: " +
                unansweredNumbers.join(", "),
            );
            text(
              message,
              "Submit dibatalkan. Lengkapi jawaban pada nomor yang belum dikerjakan.",
            );
            return;
          }
          if (!window.confirm("Yakin submit final?")) return;
          await api("/api/v1/attempts/" + attemptID + "/submit", "POST");
          attemptEditable = false;
          prevBtn.disabled = true;
          nextBtn.disabled = true;
          submitBtn.disabled = true;
          submitBtn.hidden = true;
          doubtCheckbox.disabled = true;
          optionsBox
            .querySelectorAll("input, button, select, textarea")
            .forEach(function (el) {
              el.disabled = true;
            });
          text(message, "Ujian telah disubmit.");
          showAttemptFinishDialog();
        } catch (err) {
          if (String(err.message || "").includes("attempt is not editable")) {
            applyAttemptReadonlyState("submitted");
            return;
          }
          text(message, "Gagal submit: " + err.message);
        } finally {
          done();
        }
      });

    if (attemptFinishResultBtn) {
      attemptFinishResultBtn.addEventListener("click", function () {
        window.location.href = "/hasil/" + attemptID;
      });
    }

    if (attemptFinishCloseBtn) {
      attemptFinishCloseBtn.addEventListener("click", async function () {
        await closeExamAndLogout();
      });
    }

    optionsBox.addEventListener("change", async function () {
      if (!attemptEditable) return;
      text(message, "Menyimpan jawaban...");
      try {
        await saveCurrent();
        text(message, "Tersimpan otomatis.");
      } catch (err) {
        if (String(err.message || "").includes("attempt is not editable")) {
          applyAttemptReadonlyState("submitted");
          return;
        }
        text(message, "Autosave gagal: " + err.message);
      }
    });

    doubtCheckbox.addEventListener("change", async function () {
      if (!attemptEditable) return;
      text(message, "Menyimpan status ragu-ragu...");
      try {
        await saveCurrent();
        text(message, "Status ragu-ragu tersimpan.");
      } catch (err) {
        if (String(err.message || "").includes("attempt is not editable")) {
          applyAttemptReadonlyState("submitted");
          return;
        }
        text(message, "Simpan ragu-ragu gagal: " + err.message);
      }
    });

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") {
        queueAttemptEvent(
          "tab_blur",
          {
            reason: "visibility_hidden",
            visibility_state: document.visibilityState,
          },
          "Aktivitas tab keluar terdeteksi.",
        );
        return;
      }
      queueAttemptEvent("reconnect", {
        reason: "visibility_visible",
        visibility_state: document.visibilityState,
      });
    });

    window.addEventListener("blur", function () {
      queueAttemptEvent(
        "tab_blur",
        {
          reason: "window_blur",
          visibility_state: document.visibilityState,
        },
        "Perpindahan fokus terdeteksi.",
      );
    });

    window.addEventListener("focus", function () {
      queueAttemptEvent("reconnect", {
        reason: "window_focus",
        visibility_state: document.visibilityState,
      });
    });

    window.addEventListener("offline", function () {
      notifyEvent("Koneksi terputus, sistem akan sinkron saat tersambung.");
    });

    window.addEventListener("online", function () {
      queueAttemptEvent(
        "reconnect",
        {
          reason: "online",
          visibility_state: document.visibilityState,
        },
        "Koneksi kembali normal.",
      );
    });

    document.addEventListener("fullscreenchange", function () {
      if (document.fullscreenElement) return;
      queueAttemptEvent(
        "fullscreen_exit",
        {
          reason: "fullscreen_exit",
          visibility_state: document.visibilityState,
        },
        "Keluar dari mode fullscreen terdeteksi.",
      );
    });

    try {
      try {
        attemptMathReady = await ensureAttemptKatexReady();
      } catch (_) {
        attemptMathReady = false;
      }
      applyFontSize(loadSavedFontSize());
      text(message, "Memuat attempt...");
      const summary = await loadSummary();
      syncSubmitVisibility();
      await loadQuestion(1);
      if (!attemptEditable) {
        applyAttemptReadonlyState(summary.status);
      }
    } catch (err) {
      text(message, "Gagal memuat attempt: " + err.message);
    }
  }

  async function initResultPage() {
    const root = document.getElementById("result-root");
    if (!root) return;

    const user = await meOrNull();
    if (!user) {
      window.location.href = "/login";
      return;
    }

    const attemptID = Number(root.getAttribute("data-attempt-id") || 0);
    const resultPageTitle = document.getElementById("result-page-title");
    const summaryBox = document.getElementById("result-summary");
    const tbody = document.querySelector("#result-table tbody");

    try {
      const out = await api("/api/v1/attempts/" + attemptID + "/result", "GET");
      const s = out.summary;
      const scoreValue = Number((s && s.score) || 0);
      const scoreLabel = Number.isFinite(scoreValue)
        ? scoreValue.toLocaleString("id-ID", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
        : String((s && s.score) || 0);
      const examTitle = String((s && s.title) || "").trim();
      if (resultPageTitle) {
        resultPageTitle.textContent = examTitle
          ? "Hasil " + examTitle
          : "Hasil #" + String(attemptID);
      }
      html(
        summaryBox,
        "<strong>Status:</strong> " +
          escapeHtml(s.status) +
          " | <strong>Skor:</strong> " +
          escapeHtml(String(scoreLabel)) +
          " | <strong>Benar:</strong> " +
          escapeHtml(String(s.total_correct)) +
          " | <strong>Salah:</strong> " +
          escapeHtml(String(s.total_wrong)) +
          " | <strong>Kosong:</strong> " +
          escapeHtml(String(s.total_unanswered)),
      );

      tbody.innerHTML = "";
      if (out.score_only) {
        html(
          summaryBox,
          "<strong>Nilai Akhir:</strong> Nilai Anda adalah " +
            escapeHtml(String(scoreLabel)) +
            ".",
        );
        const tr = document.createElement("tr");
        tr.innerHTML =
          '<td colspan="7" class="muted">Detail jawaban tidak ditampilkan untuk ujian ini.</td>';
        tbody.appendChild(tr);
        return;
      }
      out.items.forEach(function (it, idx) {
        const tr = document.createElement("tr");
        const breakdown =
          Array.isArray(it.breakdown) && it.breakdown.length
            ? "<br><small>" +
              it.breakdown
                .map(function (b) {
                  return escapeHtml(b.id + ":" + (b.correct ? "ok" : "x"));
                })
                .join(", ") +
              "</small>"
            : "";
        tr.innerHTML = [
          "<td>" + (idx + 1) + "</td>",
          "<td>" + escapeHtml(String(it.question_id)) + "</td>",
          "<td>" +
            escapeHtml(shortQuestionTypeLabel(it.question_type)) +
            "</td>",
          "<td>" + escapeHtml((it.selected || []).join(", ")) + "</td>",
          "<td>" + escapeHtml((it.correct || []).join(", ")) + "</td>",
          "<td>" + escapeHtml(it.reason || "") + breakdown + "</td>",
          "<td>" + escapeHtml(String(it.earned_score || 0)) + "</td>",
        ].join("");
        tbody.appendChild(tr);
      });
    } catch (err) {
      text(summaryBox, "Gagal memuat hasil: " + err.message);
    }
  }

  function initHomePage() {
    const root = document.querySelector('[data-page="home_content"]');
    if (!root) return;

    const modal = document.getElementById("home-ai-modal");
    const openBtn = document.getElementById("home-ai-open");
    const fabBtn = document.getElementById("home-ai-fab");
    const closeBtn = document.getElementById("home-ai-close");
    const sendBtn = document.getElementById("home-ai-send");
    const input = document.getElementById("home-ai-input");
    const messages = document.getElementById("home-ai-messages");
    let lastTrigger = null;

    if (!modal || !sendBtn || !input || !messages) return;

    function setOpen(open) {
      if (!open) {
        const active = document.activeElement;
        if (
          active &&
          modal.contains(active) &&
          typeof active.blur === "function"
        ) {
          active.blur();
        }
      }
      modal.classList.toggle("is-open", open);
      modal.setAttribute("aria-hidden", open ? "false" : "true");
      if (open) {
        input.focus();
      } else if (lastTrigger && typeof lastTrigger.focus === "function") {
        lastTrigger.focus();
      }
      if (openBtn)
        openBtn.setAttribute("aria-expanded", open ? "true" : "false");
    }

    function appendMessage(textValue, user) {
      const item = document.createElement("div");
      item.className =
        "home-ai-msg " + (user ? "home-ai-msg-user" : "home-ai-msg-bot");
      item.textContent = textValue;
      messages.appendChild(item);
      messages.scrollTop = messages.scrollHeight;
    }

    async function send() {
      const q = String(input.value || "").trim();
      if (!q) return;
      appendMessage(q, true);
      input.value = "";
      sendBtn.disabled = true;
      appendMessage("Sedang memproses...", false);
      const loadingEl = messages.lastElementChild;
      try {
        const res = await fetch("/api/v1/assistant", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q }),
        });
        const json = await res.json().catch(function () {
          return {};
        });
        if (loadingEl && loadingEl.parentNode)
          loadingEl.parentNode.removeChild(loadingEl);
        if (!res.ok || !json.ok || !json.data || !json.data.reply) {
          throw new Error(
            extractAPIError(json, res.statusText || "Request failed"),
          );
        }
        appendMessage(String(json.data.reply), false);
      } catch (err) {
        if (loadingEl && loadingEl.parentNode)
          loadingEl.parentNode.removeChild(loadingEl);
        appendMessage(
          "Asisten sedang tidak tersedia. Coba beberapa saat lagi.",
          false,
        );
      } finally {
        sendBtn.disabled = false;
      }
    }

    if (openBtn) {
      openBtn.addEventListener("click", function () {
        lastTrigger = openBtn;
        setOpen(!modal.classList.contains("is-open"));
      });
    }
    if (fabBtn) {
      fabBtn.addEventListener("click", function () {
        lastTrigger = fabBtn;
        setOpen(!modal.classList.contains("is-open"));
      });
    }
    if (closeBtn) {
      closeBtn.addEventListener("click", function () {
        setOpen(false);
      });
    }
    sendBtn.addEventListener("click", send);
    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        send();
      }
    });
  }

  async function initAdminPage() {
    const root = document.querySelector('[data-page="admin_content"]');
    if (!root) return;

    const user = await meOrNull();
    if (!user) {
      window.location.href = "/login";
      return;
    }
    if (!["admin", "proktor"].includes(String(user.role || ""))) {
      alert("Halaman admin hanya untuk admin/proktor");
      window.location.href = "/";
      return;
    }

    const message = document.getElementById("admin-message");
    const regSummary = document.getElementById("admin-registration-summary");
    const regBody = document.getElementById("admin-registration-body");
    const regOut = document.getElementById("admin-registration-output");
    const masterOut = document.getElementById("admin-master-output");
    const prevPageBtn = document.getElementById("admin-prev-page-btn");
    const nextPageBtn = document.getElementById("admin-next-page-btn");
    const pageInfo = document.getElementById("admin-page-info");
    const regFilterForm = document.getElementById(
      "admin-registration-filter-form",
    );
    const statAdmin = document.getElementById("admin-stat-admin");
    const statProktor = document.getElementById("admin-stat-proktor");
    const statGuru = document.getElementById("admin-stat-guru");
    const statSiswa = document.getElementById("admin-stat-siswa");
    const statSekolah = document.getElementById("admin-stat-sekolah");
    const exportUsersBtn = document.getElementById("admin-user-export-btn");
    const importUsersBtn = document.getElementById("admin-user-import-btn");
    const addUserBtn = document.getElementById("admin-user-add-btn");
    const userDetailDialog = document.getElementById(
      "admin-user-detail-dialog",
    );
    const userDetailOut = document.getElementById("admin-user-detail-output");
    const userCreateDialog = document.getElementById(
      "admin-user-create-dialog",
    );
    const userCreateForm = document.getElementById("admin-user-create-form");
    const userCreateCancelBtn = document.getElementById(
      "admin-user-create-cancel-btn",
    );
    const userUpdateDialog = document.getElementById(
      "admin-user-update-dialog",
    );
    const userUpdateForm = document.getElementById("admin-user-update-form");
    const userUpdateCancelBtn = document.getElementById(
      "admin-user-update-cancel-btn",
    );
    const userDeleteDialog = document.getElementById(
      "admin-user-delete-dialog",
    );
    const userDeleteForm = document.getElementById("admin-user-delete-form");
    const userDeleteLabel = document.getElementById("admin-user-delete-label");
    const userDeleteCancelBtn = document.getElementById(
      "admin-user-delete-cancel-btn",
    );
    const userImportDialog = document.getElementById(
      "admin-user-import-dialog",
    );
    const userImportForm = document.getElementById("admin-user-import-form");
    const userImportOut = document.getElementById("admin-user-import-output");
    const userImportTemplateBtn = document.getElementById(
      "admin-user-import-template-btn",
    );
    const userImportCancelBtn = document.getElementById(
      "admin-user-import-cancel-btn",
    );
    const userImportErrorDialog = document.getElementById(
      "admin-user-import-error-dialog",
    );
    const userImportErrorOut = document.getElementById(
      "admin-user-import-error-output",
    );
    const userImportErrorCloseBtn = document.getElementById(
      "admin-user-import-error-close-btn",
    );
    const masterMessage = document.getElementById("admin-master-message");
    const masterRefreshBtn = document.getElementById(
      "admin-master-refresh-btn",
    );
    const levelAddBtn = document.getElementById("admin-level-add-btn");
    const schoolAddBtn = document.getElementById("admin-school-add-btn");
    const classAddBtn = document.getElementById("admin-class-add-btn");
    const levelTableBody = document.getElementById("admin-level-table-body");
    const schoolTableBody = document.getElementById("admin-school-table-body");
    const classTableBody = document.getElementById("admin-class-table-body");
    const levelDialog = document.getElementById("admin-level-dialog");
    const levelDialogForm = document.getElementById("admin-level-dialog-form");
    const levelDialogTitle = document.getElementById(
      "admin-level-dialog-title",
    );
    const levelDialogCancelBtn = document.getElementById(
      "admin-level-dialog-cancel-btn",
    );
    const schoolDialog = document.getElementById("admin-school-dialog");
    const schoolDialogForm = document.getElementById(
      "admin-school-dialog-form",
    );
    const schoolDialogTitle = document.getElementById(
      "admin-school-dialog-title",
    );
    const schoolDialogCancelBtn = document.getElementById(
      "admin-school-dialog-cancel-btn",
    );
    const classDialog = document.getElementById("admin-class-dialog");
    const classDialogForm = document.getElementById("admin-class-dialog-form");
    const classDialogTitle = document.getElementById(
      "admin-class-dialog-title",
    );
    const classDialogCancelBtn = document.getElementById(
      "admin-class-dialog-cancel-btn",
    );
    const masterDeleteDialog = document.getElementById(
      "admin-master-delete-dialog",
    );
    const masterDeleteForm = document.getElementById(
      "admin-master-delete-form",
    );
    const masterDeleteLabel = document.getElementById(
      "admin-master-delete-label",
    );
    const masterDeleteCancelBtn = document.getElementById(
      "admin-master-delete-cancel-btn",
    );
    const menuButtons = root.querySelectorAll("[data-admin-menu]");
    const adminPageTitle = document.getElementById("admin-page-title");
    const adminPageDesc = document.getElementById("admin-page-desc");
    const dashboardPanel = document.getElementById("admin-dashboard-panel");
    const usersPanel = document.getElementById("admin-users-panel");
    const masterPanel = document.getElementById("admin-master-panel");
    let currentRole = "";
    let currentQuery = "";
    let currentLimit = 50;
    let currentOffset = 0;
    let lastLoadedCount = 0;
    const usersByID = {};
    let schoolsCache = [];
    const classCacheBySchool = {};
    const masterSummaryState = {
      levelsByID: {},
      schoolsByID: {},
      classesByID: {},
    };
    let filterDebounceTimer = null;

    function setMsg(msg) {
      text(message, msg);
    }

    function pretty(el, data) {
      if (el) el.textContent = JSON.stringify(data, null, 2);
    }

    function fmtDate(raw) {
      if (!raw) return "-";
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return String(raw);
      return d.toLocaleString("id-ID");
    }

    function isAdmin() {
      return String(user.role || "") === "admin";
    }

    function toNullableNumber(input) {
      const n = Number(input || 0);
      if (!Number.isFinite(n) || n <= 0) return null;
      return n;
    }

    function isStudentRole(role) {
      return (
        String(role || "")
          .trim()
          .toLowerCase() === "siswa"
      );
    }

    function schoolLabel(it) {
      const name = String((it && it.name) || "").trim();
      const code = String((it && it.code) || "").trim();
      if (!name) return "-";
      return code ? name + " (" + code + ")" : name;
    }

    function classLabel(it) {
      const name = String((it && it.name) || "").trim();
      const grade = String((it && it.grade_level) || "").trim();
      if (!name) return "-";
      return grade ? grade + " - " + name : name;
    }

    function resetClassSelect(selectEl, placeholder) {
      if (!selectEl) return;
      selectEl.innerHTML = "";
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = placeholder || "Pilih Sekolah Dulu";
      selectEl.appendChild(opt);
      selectEl.disabled = true;
    }

    function fillSchoolSelect(selectEl, selectedID) {
      if (!selectEl) return;
      const selected = Number(selectedID || 0);
      selectEl.innerHTML = "";
      const emptyOpt = document.createElement("option");
      emptyOpt.value = "";
      emptyOpt.textContent = "Tanpa Sekolah";
      selectEl.appendChild(emptyOpt);
      schoolsCache.forEach(function (it) {
        const opt = document.createElement("option");
        opt.value = String(it.id);
        opt.textContent = schoolLabel(it);
        if (selected > 0 && Number(it.id) === selected) opt.selected = true;
        selectEl.appendChild(opt);
      });
    }

    function fillSchoolSelectRequired(selectEl, selectedID) {
      if (!selectEl) return;
      const selected = Number(selectedID || 0);
      selectEl.innerHTML = "";
      const emptyOpt = document.createElement("option");
      emptyOpt.value = "";
      emptyOpt.textContent = "Pilih Sekolah";
      selectEl.appendChild(emptyOpt);
      schoolsCache.forEach(function (it) {
        const opt = document.createElement("option");
        opt.value = String(it.id);
        opt.textContent = schoolLabel(it);
        if (selected > 0 && Number(it.id) === selected) opt.selected = true;
        selectEl.appendChild(opt);
      });
    }

    function schoolCodeByID(schoolID) {
      const sid = Number(schoolID || 0);
      if (sid <= 0) return "";
      const found = schoolsCache.find(function (it) {
        return Number((it && it.id) || 0) === sid;
      });
      if (!found) return "";
      return String((found && found.code) || "").trim();
    }

    function syncSchoolCodeDisplay(formEl) {
      if (!formEl || !formEl.elements) return;
      const schoolEl = formEl.elements.namedItem("school_id");
      const codeEl = formEl.elements.namedItem("school_code_display");
      if (!schoolEl || !codeEl) return;
      codeEl.value = schoolCodeByID(schoolEl.value);
    }

    function fillClassSelect(selectEl, classes, selectedID) {
      if (!selectEl) return;
      const selected = Number(selectedID || 0);
      selectEl.innerHTML = "";
      const emptyOpt = document.createElement("option");
      emptyOpt.value = "";
      emptyOpt.textContent = "Tanpa Kelas";
      selectEl.appendChild(emptyOpt);
      (classes || []).forEach(function (it) {
        const opt = document.createElement("option");
        opt.value = String(it.id);
        opt.textContent = classLabel(it);
        if (selected > 0 && Number(it.id) === selected) opt.selected = true;
        selectEl.appendChild(opt);
      });
      selectEl.disabled = false;
    }

    function applyUserFormRoleRequirements(formEl) {
      if (!formEl) return;
      const roleEl = formEl.elements.namedItem("role");
      const schoolEl = formEl.elements.namedItem("school_id");
      const classEl = formEl.elements.namedItem("class_id");
      const participantNoEl = formEl.elements.namedItem("participant_no");
      const nisnEl = formEl.elements.namedItem("nisn");
      if (!roleEl || !schoolEl || !classEl) return;

      const mustHaveClass = isStudentRole(roleEl.value);
      schoolEl.required = mustHaveClass;
      classEl.required = mustHaveClass;
      if (participantNoEl) participantNoEl.required = mustHaveClass;
      if (nisnEl) nisnEl.required = mustHaveClass;

      const schoolLabel = schoolEl.closest("label");
      const classLabel = classEl.closest("label");
      const participantNoLabel = participantNoEl
        ? participantNoEl.closest("label")
        : null;
      const nisnLabel = nisnEl ? nisnEl.closest("label") : null;
      const schoolCodeEl = formEl.elements.namedItem("school_code_display");
      const schoolCodeLabel = schoolCodeEl
        ? schoolCodeEl.closest("label")
        : null;
      if (schoolLabel) {
        schoolLabel.dataset.requiredRole = mustHaveClass ? "siswa" : "";
      }
      if (classLabel) {
        classLabel.dataset.requiredRole = mustHaveClass ? "siswa" : "";
      }
      if (participantNoLabel) {
        participantNoLabel.dataset.requiredRole = mustHaveClass ? "siswa" : "";
      }
      if (nisnLabel) {
        nisnLabel.dataset.requiredRole = mustHaveClass ? "siswa" : "";
      }
      if (schoolCodeLabel) {
        schoolCodeLabel.dataset.requiredRole = mustHaveClass ? "siswa" : "";
      }
    }

    function pickFirstClassIfAny(selectEl) {
      if (!selectEl || selectEl.disabled) return;
      if (selectEl.value) return;
      const firstClassOption = Array.from(selectEl.options || []).find(
        function (opt) {
          return String(opt.value || "").trim() !== "";
        },
      );
      if (firstClassOption) {
        selectEl.value = String(firstClassOption.value);
      }
    }

    async function loadSchoolsForUserForms() {
      const out = await api("/api/v1/admin/schools?all=1", "GET");
      schoolsCache = Array.isArray(out) ? out : [];
    }

    async function loadClassesBySchool(schoolID) {
      const sid = Number(schoolID || 0);
      if (sid <= 0) return [];
      if (Array.isArray(classCacheBySchool[String(sid)])) {
        return classCacheBySchool[String(sid)];
      }
      const out = await api(
        "/api/v1/admin/classes?all=1&school_id=" +
          encodeURIComponent(String(sid)),
        "GET",
      );
      const items = Array.isArray(out) ? out : [];
      classCacheBySchool[String(sid)] = items;
      return items;
    }

    function parseDownloadFilename(disposition, fallback) {
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

    async function exportUsersExcelFile() {
      const params = new URLSearchParams();
      if (currentRole) params.set("role", currentRole);
      if (currentQuery) params.set("q", currentQuery);
      const qs = params.toString() ? "?" + params.toString() : "";
      const res = await fetch("/api/v1/admin/users/export" + qs, {
        method: "GET",
        credentials: "include",
      });
      if (!res.ok) {
        const errJSON = await res.json().catch(function () {
          return {};
        });
        const msg = extractAPIError(
          errJSON,
          res.statusText || "Request failed",
        );
        throw new Error(msg);
      }

      const blob = await res.blob();
      const filename = parseDownloadFilename(
        res.headers.get("Content-Disposition"),
        "daftar_pengguna.xlsx",
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

    async function downloadImportTemplateExcel() {
      const res = await fetch("/api/v1/admin/users/import-template", {
        method: "GET",
        credentials: "include",
      });
      if (!res.ok) {
        const errJSON = await res.json().catch(function () {
          return {};
        });
        const msg = extractAPIError(
          errJSON,
          res.statusText || "Request failed",
        );
        throw new Error(msg);
      }
      const blob = await res.blob();
      const filename = parseDownloadFilename(
        res.headers.get("Content-Disposition"),
        "template_import_pengguna.xlsx",
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

    function activateMenu(target) {
      if (dashboardPanel) dashboardPanel.hidden = target !== "dashboard";
      if (usersPanel) usersPanel.hidden = target !== "users";
      if (masterPanel) masterPanel.hidden = target !== "master";
      menuButtons.forEach(function (btn) {
        const isActive = btn.getAttribute("data-admin-menu") === target;
        btn.classList.toggle("active", isActive);
      });
      const adminTitles = {
        dashboard: {
          title: "Dasbor Admin",
          desc: "Ringkasan sistem dan akses cepat ke data utama.",
        },
        master: {
          title: "Data Master",
          desc: "Kelola jenjang, sekolah, kelas, dan master akademik.",
        },
        users: {
          title: "Daftar Pengguna",
          desc: "Kelola akun admin, proktor, guru, dan siswa.",
        },
      };
      const info = adminTitles[target] || adminTitles.dashboard;
      if (adminPageTitle) adminPageTitle.textContent = info.title;
      if (adminPageDesc) adminPageDesc.textContent = info.desc;
    }

    async function loadEducationLevels(showAll) {
      const qs = showAll ? "?all=1" : "";
      const out = await api("/api/v1/levels" + qs, "GET");
      return Array.isArray(out) ? out : [];
    }

    function renderMasterSummaryTable(levels, schools, classes) {
      const canEditMaster = isAdmin();
      const levelItems = Array.isArray(levels) ? levels : [];
      const schoolItems = Array.isArray(schools) ? schools : [];
      const classItems = Array.isArray(classes) ? classes : [];
      masterSummaryState.levelsByID = {};
      masterSummaryState.schoolsByID = {};
      masterSummaryState.classesByID = {};
      levelItems.forEach(function (it) {
        masterSummaryState.levelsByID[String(it.id || "")] = it;
      });
      schoolItems.forEach(function (it) {
        masterSummaryState.schoolsByID[String(it.id || "")] = it;
      });
      classItems.forEach(function (it) {
        masterSummaryState.classesByID[String(it.id || "")] = it;
      });
      if (levelTableBody) {
        if (!levelItems.length) {
          levelTableBody.innerHTML =
            '<tr><td colspan="4" class="muted">Belum ada data jenjang.</td></tr>';
        } else {
          levelTableBody.innerHTML = "";
          levelItems.forEach(function (it) {
            const tr = document.createElement("tr");
            tr.innerHTML = [
              "<td>" + escapeHtml(String(it.id || "")) + "</td>",
              "<td>" + escapeHtml(String(it.name || "")) + "</td>",
              "<td>" + (it.is_active ? "aktif" : "nonaktif") + "</td>",
              "<td>" +
                (canEditMaster
                  ? '<span class="action-icons">' +
                    '<button class="icon-only-btn" type="button" data-master-entity="level" data-master-action="edit" data-id="' +
                    escapeHtml(String(it.id || "")) +
                    '" title="Ubah jenjang" aria-label="Ubah jenjang"><svg viewBox="0 0 24 24" focusable="false"><path d="M4 20h4l10-10-4-4L4 16v4z"/><path d="M12 6l4 4"/></svg></button>' +
                    '<button class="icon-only-btn danger" type="button" data-master-entity="level" data-master-action="delete" data-id="' +
                    escapeHtml(String(it.id || "")) +
                    '" title="Hapus jenjang" aria-label="Hapus jenjang"><svg viewBox="0 0 24 24" focusable="false"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg></button>' +
                    "</span>"
                  : "-") +
                "</td>",
            ].join("");
            levelTableBody.appendChild(tr);
          });
        }
      }
      if (schoolTableBody) {
        if (!schoolItems.length) {
          schoolTableBody.innerHTML =
            '<tr><td colspan="5" class="muted">Belum ada data sekolah.</td></tr>';
        } else {
          schoolTableBody.innerHTML = "";
          schoolItems.forEach(function (it) {
            const tr = document.createElement("tr");
            tr.innerHTML = [
              "<td>" + escapeHtml(String(it.id || "")) + "</td>",
              "<td>" + escapeHtml(String(it.name || "")) + "</td>",
              "<td>" + escapeHtml(String(it.code || "-")) + "</td>",
              "<td>" + escapeHtml(String(it.address || "-")) + "</td>",
              "<td>" +
                (canEditMaster
                  ? '<span class="action-icons">' +
                    '<button class="icon-only-btn" type="button" data-master-entity="school" data-master-action="edit" data-id="' +
                    escapeHtml(String(it.id || "")) +
                    '" title="Ubah sekolah" aria-label="Ubah sekolah"><svg viewBox="0 0 24 24" focusable="false"><path d="M4 20h4l10-10-4-4L4 16v4z"/><path d="M12 6l4 4"/></svg></button>' +
                    '<button class="icon-only-btn danger" type="button" data-master-entity="school" data-master-action="delete" data-id="' +
                    escapeHtml(String(it.id || "")) +
                    '" title="Hapus sekolah" aria-label="Hapus sekolah"><svg viewBox="0 0 24 24" focusable="false"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg></button>' +
                    "</span>"
                  : "-") +
                "</td>",
            ].join("");
            schoolTableBody.appendChild(tr);
          });
        }
      }
      if (classTableBody) {
        if (!classItems.length) {
          classTableBody.innerHTML =
            '<tr><td colspan="5" class="muted">Belum ada data kelas.</td></tr>';
        } else {
          classTableBody.innerHTML = "";
          classItems.forEach(function (it) {
            const school =
              masterSummaryState.schoolsByID[String(it.school_id)] || {};
            const tr = document.createElement("tr");
            tr.innerHTML = [
              "<td>" + escapeHtml(String(it.id || "")) + "</td>",
              "<td>" + escapeHtml(schoolLabel(school)) + "</td>",
              "<td>" + escapeHtml(String(it.grade_level || "")) + "</td>",
              "<td>" + escapeHtml(String(it.name || "")) + "</td>",
              "<td>" +
                (canEditMaster
                  ? '<span class="action-icons">' +
                    '<button class="icon-only-btn" type="button" data-master-entity="class" data-master-action="edit" data-id="' +
                    escapeHtml(String(it.id || "")) +
                    '" title="Ubah kelas" aria-label="Ubah kelas"><svg viewBox="0 0 24 24" focusable="false"><path d="M4 20h4l10-10-4-4L4 16v4z"/><path d="M12 6l4 4"/></svg></button>' +
                    '<button class="icon-only-btn danger" type="button" data-master-entity="class" data-master-action="delete" data-id="' +
                    escapeHtml(String(it.id || "")) +
                    '" title="Hapus kelas" aria-label="Hapus kelas"><svg viewBox="0 0 24 24" focusable="false"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg></button>' +
                    "</span>"
                  : "-") +
                "</td>",
            ].join("");
            classTableBody.appendChild(tr);
          });
        }
      }
    }

    async function loadMasterSummaryTable() {
      const levelsPromise = loadEducationLevels(isAdmin());
      const schoolsPromise = api("/api/v1/admin/schools?all=1", "GET");
      const classesPromise = api("/api/v1/admin/classes?all=1", "GET");
      const all = await Promise.all([
        levelsPromise,
        schoolsPromise,
        classesPromise,
      ]);
      const levels = Array.isArray(all[0]) ? all[0] : [];
      const schools = Array.isArray(all[1]) ? all[1] : [];
      const classes = Array.isArray(all[2]) ? all[2] : [];
      renderMasterSummaryTable(levels, schools, classes);
      return { levels: levels, schools: schools, classes: classes };
    }

    async function loadUsers() {
      const params = new URLSearchParams();
      params.set("limit", String(currentLimit));
      params.set("offset", String(currentOffset));
      if (currentRole) params.set("role", currentRole);
      if (currentQuery) params.set("q", currentQuery);
      const out = await api("/api/v1/admin/users?" + params.toString(), "GET");
      pretty(regOut, out);
      const items = Array.isArray(out.items) ? out.items : [];
      lastLoadedCount = items.length;
      text(
        regSummary,
        "Peran: " +
          (out.role || "semua") +
          " | Pencarian: " +
          (out.q || "-") +
          " | Data dimuat: " +
          String(items.length),
      );
      if (pageInfo) {
        const start = items.length ? currentOffset + 1 : currentOffset;
        const end = currentOffset + items.length;
        text(pageInfo, "Baris " + String(start) + " - " + String(end));
      }
      if (prevPageBtn) prevPageBtn.disabled = currentOffset <= 0;
      if (nextPageBtn) nextPageBtn.disabled = items.length < currentLimit;
      if (!regBody) return;
      if (!items.length) {
        regBody.innerHTML =
          '<tr><td colspan="10" class="muted">Tidak ada data pengguna.</td></tr>';
        return;
      }
      regBody.innerHTML = "";
      Object.keys(usersByID).forEach(function (k) {
        delete usersByID[k];
      });
      items.forEach(function (it) {
        usersByID[String(it.id || "")] = it;
        const tr = document.createElement("tr");
        const activeLabel = it.is_active ? "ya" : "tidak";
        const detailBtn =
          '<button class="icon-only-btn" type="button" data-action="detail" data-id="' +
          escapeHtml(String(it.id || "")) +
          '" title="Lihat detil" aria-label="Lihat detil">' +
          '<svg viewBox="0 0 24 24" focusable="false"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.5"/></svg></button>';
        const editBtn =
          '<button class="icon-only-btn" type="button" data-action="edit" data-id="' +
          escapeHtml(String(it.id || "")) +
          '" title="Ubah pengguna" aria-label="Ubah pengguna">' +
          '<svg viewBox="0 0 24 24" focusable="false"><path d="M4 20h4l10-10-4-4L4 16v4z"/><path d="M12 6l4 4"/></svg></button>';
        const disableBtn =
          '<button class="icon-only-btn danger" type="button" data-action="deactivate" data-id="' +
          escapeHtml(String(it.id || "")) +
          '" title="Hapus pengguna" aria-label="Hapus pengguna">' +
          '<svg viewBox="0 0 24 24" focusable="false"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg></button>';
        const actionIcons = isAdmin()
          ? '<span class="action-icons">' +
            detailBtn +
            editBtn +
            disableBtn +
            "</span>"
          : '<span class="action-icons">' + detailBtn + "</span>";
        tr.innerHTML = [
          "<td>" + escapeHtml(String(it.id || "")) + "</td>",
          "<td>" + escapeHtml(it.username || "") + "</td>",
          "<td>" + escapeHtml(it.full_name || "") + "</td>",
          "<td>" + escapeHtml(it.role || "") + "</td>",
          "<td>" + escapeHtml(it.school_name || "-") + "</td>",
          "<td>" + escapeHtml(it.email || "") + "</td>",
          "<td>" + escapeHtml(it.account_status || "") + "</td>",
          "<td>" + escapeHtml(activeLabel) + "</td>",
          "<td>" + escapeHtml(fmtDate(it.created_at)) + "</td>",
          "<td>" + actionIcons + "</td>",
        ].join("");
        regBody.appendChild(tr);
      });
    }

    async function loadDashboardStats() {
      const out = await api("/api/v1/admin/dashboard/stats", "GET");
      if (statAdmin) statAdmin.textContent = String(out.admin_count || 0);
      if (statProktor) statProktor.textContent = String(out.proktor_count || 0);
      if (statGuru) statGuru.textContent = String(out.guru_count || 0);
      if (statSiswa) statSiswa.textContent = String(out.siswa_count || 0);
      if (statSekolah) statSekolah.textContent = String(out.school_count || 0);
    }

    if (regFilterForm) {
      const triggerFilterSubmit = function () {
        if (typeof regFilterForm.requestSubmit === "function") {
          regFilterForm.requestSubmit();
          return;
        }
        regFilterForm.dispatchEvent(
          new Event("submit", { cancelable: true, bubbles: true }),
        );
      };

      regFilterForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(regFilterForm);
        currentRole = String(fd.get("role") || "").trim();
        currentQuery = String(fd.get("q") || "").trim();
        currentLimit = Number(fd.get("limit") || 50);
        currentOffset = 0;
        const done = beginBusy(
          regFilterForm,
          message,
          "Memuat daftar pengguna...",
        );
        try {
          await loadUsers();
          setMsg("Daftar pengguna berhasil dimuat.");
        } catch (err) {
          setMsg("Gagal memuat pengguna: " + err.message);
        } finally {
          done();
        }
      });

      const roleInput = regFilterForm.elements.namedItem("role");
      if (roleInput) {
        roleInput.addEventListener("change", function () {
          currentOffset = 0;
          triggerFilterSubmit();
        });
      }

      const qInput = regFilterForm.elements.namedItem("q");
      if (qInput) {
        qInput.addEventListener("input", function () {
          if (filterDebounceTimer) window.clearTimeout(filterDebounceTimer);
          filterDebounceTimer = window.setTimeout(function () {
            currentOffset = 0;
            triggerFilterSubmit();
          }, 350);
        });
      }
    }

    menuButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        const target = btn.getAttribute("data-admin-menu") || "dashboard";
        activateMenu(target);
      });
    });
    root.querySelectorAll("[data-admin-jump]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const target = btn.getAttribute("data-admin-jump") || "dashboard";
        activateMenu(target);
      });
    });

    if (prevPageBtn) {
      prevPageBtn.addEventListener("click", async function () {
        if (currentOffset <= 0) return;
        currentOffset = Math.max(0, currentOffset - currentLimit);
        const done = beginBusy(
          prevPageBtn,
          message,
          "Memuat halaman sebelumnya...",
        );
        try {
          await loadUsers();
          setMsg("Halaman sebelumnya dimuat.");
        } catch (err) {
          setMsg("Gagal pindah halaman: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (nextPageBtn) {
      nextPageBtn.addEventListener("click", async function () {
        if (lastLoadedCount < currentLimit) return;
        currentOffset += currentLimit;
        const done = beginBusy(
          nextPageBtn,
          message,
          "Memuat halaman berikutnya...",
        );
        try {
          await loadUsers();
          setMsg("Halaman berikutnya dimuat.");
        } catch (err) {
          currentOffset = Math.max(0, currentOffset - currentLimit);
          setMsg("Gagal pindah halaman: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (addUserBtn) {
      addUserBtn.hidden = !isAdmin();
      addUserBtn.addEventListener("click", function () {
        if (!isAdmin()) return;
        if (userCreateForm) {
          userCreateForm.reset();
          applyUserFormRoleRequirements(userCreateForm);
          fillSchoolSelect(userCreateForm.elements.namedItem("school_id"));
          syncSchoolCodeDisplay(userCreateForm);
          resetClassSelect(
            userCreateForm.elements.namedItem("class_id"),
            "Pilih Sekolah Dulu",
          );
        }
        if (
          userCreateDialog &&
          typeof userCreateDialog.showModal === "function"
        ) {
          userCreateDialog.showModal();
        }
      });
    }
    if (levelAddBtn) levelAddBtn.hidden = !isAdmin();
    if (schoolAddBtn) schoolAddBtn.hidden = !isAdmin();
    if (classAddBtn) classAddBtn.hidden = !isAdmin();

    if (exportUsersBtn) {
      exportUsersBtn.hidden = !isAdmin();
      exportUsersBtn.addEventListener("click", async function () {
        if (!isAdmin()) return;
        const done = beginBusy(
          exportUsersBtn,
          message,
          "Menyiapkan file Excel pengguna...",
        );
        try {
          await exportUsersExcelFile();
          setMsg("Ekspor pengguna selesai.");
        } catch (err) {
          setMsg("Gagal ekspor pengguna: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (importUsersBtn) {
      importUsersBtn.hidden = !isAdmin();
      importUsersBtn.addEventListener("click", function () {
        if (!isAdmin()) return;
        if (userImportForm) userImportForm.reset();
        if (userImportOut) userImportOut.textContent = "";
        if (
          userImportDialog &&
          typeof userImportDialog.showModal === "function"
        ) {
          userImportDialog.showModal();
        }
      });
    }

    if (userImportTemplateBtn) {
      userImportTemplateBtn.hidden = !isAdmin();
      userImportTemplateBtn.addEventListener("click", async function () {
        if (!isAdmin()) return;
        const done = beginBusy(
          userImportTemplateBtn,
          message,
          "Menyiapkan template import pengguna...",
        );
        try {
          await downloadImportTemplateExcel();
          setMsg("Template import berhasil diunduh.");
        } catch (err) {
          setMsg("Gagal mengunduh template import: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (userImportCancelBtn) {
      userImportCancelBtn.addEventListener("click", function () {
        if (userImportDialog && typeof userImportDialog.close === "function") {
          userImportDialog.close();
        }
      });
    }

    if (userImportErrorCloseBtn) {
      userImportErrorCloseBtn.addEventListener("click", function () {
        if (
          userImportErrorDialog &&
          typeof userImportErrorDialog.close === "function"
        ) {
          userImportErrorDialog.close();
        }
      });
    }

    if (userCreateCancelBtn) {
      userCreateCancelBtn.addEventListener("click", function () {
        if (userCreateDialog && typeof userCreateDialog.close === "function") {
          userCreateDialog.close();
        }
      });
    }

    if (userUpdateCancelBtn) {
      userUpdateCancelBtn.addEventListener("click", function () {
        if (userUpdateDialog && typeof userUpdateDialog.close === "function") {
          userUpdateDialog.close();
        }
      });
    }

    if (userDeleteCancelBtn) {
      userDeleteCancelBtn.addEventListener("click", function () {
        if (userDeleteDialog && typeof userDeleteDialog.close === "function") {
          userDeleteDialog.close();
        }
      });
    }

    if (regBody) {
      regBody.addEventListener("click", function (e) {
        const btn =
          e.target && e.target.closest("button[data-action][data-id]");
        if (!btn) return;
        const action = String(btn.getAttribute("data-action") || "");
        const id = String(btn.getAttribute("data-id") || "");
        const userItem = usersByID[id];
        if (!userItem) return;

        if (action === "detail") {
          if (userDetailOut)
            userDetailOut.textContent = JSON.stringify(userItem, null, 2);
          if (
            userDetailDialog &&
            typeof userDetailDialog.showModal === "function"
          ) {
            userDetailDialog.showModal();
          }
          return;
        }

        if (!isAdmin()) return;

        if (action === "edit") {
          if (userUpdateForm) {
            userUpdateForm.elements.namedItem("id").value = String(
              userItem.id || "",
            );
            userUpdateForm.elements.namedItem("full_name").value = String(
              userItem.full_name || "",
            );
            userUpdateForm.elements.namedItem("email").value = String(
              userItem.email || "",
            );
            userUpdateForm.elements.namedItem("participant_no").value = String(
              userItem.participant_no || "",
            );
            userUpdateForm.elements.namedItem("nisn").value = String(
              userItem.nisn || "",
            );
            userUpdateForm.elements.namedItem("role").value = String(
              userItem.role || "siswa",
            );
            applyUserFormRoleRequirements(userUpdateForm);
            userUpdateForm.elements.namedItem("password").value = "";
            fillSchoolSelect(
              userUpdateForm.elements.namedItem("school_id"),
              userItem.school_id,
            );
            syncSchoolCodeDisplay(userUpdateForm);
            const schoolID = Number(userItem.school_id || 0);
            const classID = Number(userItem.class_id || 0);
            const classSelect = userUpdateForm.elements.namedItem("class_id");
            if (schoolID > 0) {
              loadClassesBySchool(schoolID)
                .then(function (classes) {
                  fillClassSelect(classSelect, classes, classID);
                })
                .catch(function () {
                  resetClassSelect(classSelect, "Gagal memuat kelas");
                });
            } else {
              resetClassSelect(classSelect, "Pilih Sekolah Dulu");
            }
          }
          if (
            userUpdateDialog &&
            typeof userUpdateDialog.showModal === "function"
          ) {
            userUpdateDialog.showModal();
          }
          return;
        }

        if (action === "deactivate") {
          if (userDeleteForm)
            userDeleteForm.elements.namedItem("id").value = String(
              userItem.id || "",
            );
          if (userDeleteLabel) {
            userDeleteLabel.textContent =
              "Yakin hapus pengguna " +
              String(userItem.full_name || userItem.username || "") +
              " (ID " +
              String(userItem.id || "") +
              ")?";
          }
          if (
            userDeleteDialog &&
            typeof userDeleteDialog.showModal === "function"
          ) {
            userDeleteDialog.showModal();
          }
        }
      });
    }

    if (isAdmin() && userCreateForm) {
      const createSchoolSelect = userCreateForm.elements.namedItem("school_id");
      const createClassSelect = userCreateForm.elements.namedItem("class_id");
      const createRoleSelect = userCreateForm.elements.namedItem("role");
      if (createRoleSelect) {
        createRoleSelect.addEventListener("change", function () {
          applyUserFormRoleRequirements(userCreateForm);
        });
      }
      if (createSchoolSelect && createClassSelect) {
        createSchoolSelect.addEventListener("change", function () {
          syncSchoolCodeDisplay(userCreateForm);
          const sid = Number(createSchoolSelect.value || 0);
          if (sid <= 0) {
            resetClassSelect(createClassSelect, "Pilih Sekolah Dulu");
            return;
          }
          loadClassesBySchool(sid)
            .then(function (classes) {
              fillClassSelect(createClassSelect, classes);
              pickFirstClassIfAny(createClassSelect);
            })
            .catch(function () {
              resetClassSelect(createClassSelect, "Gagal memuat kelas");
            });
        });
      }

      userCreateForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(userCreateForm);
        const done = beginBusy(
          userCreateForm,
          message,
          "Menyimpan pengguna...",
        );
        try {
          const schoolID = toNullableNumber(fd.get("school_id"));
          const classID = toNullableNumber(fd.get("class_id"));
          const role = String(fd.get("role") || "")
            .trim()
            .toLowerCase();
          const participantNo = String(fd.get("participant_no") || "").trim();
          const nisn = String(fd.get("nisn") || "").trim();
          const schoolCode = schoolCodeByID(schoolID);
          if (isStudentRole(role) && (schoolID === null || classID === null)) {
            setMsg("Untuk role siswa, sekolah dan kelas wajib dipilih.");
            return;
          }
          if (isStudentRole(role) && (!participantNo || !nisn)) {
            setMsg("Untuk role siswa, nomor peserta dan NISN wajib diisi.");
            return;
          }
          if (isStudentRole(role) && !schoolCode) {
            setMsg(
              "NPSN sekolah belum terisi. Lengkapi NPSN di menu Data Master > Sekolah.",
            );
            return;
          }
          if (schoolID !== null && classID === null) {
            setMsg("Jika memilih sekolah, kelas wajib dipilih.");
            return;
          }
          const out = await api("/api/v1/admin/users", "POST", {
            username: String(fd.get("username") || "").trim(),
            full_name: String(fd.get("full_name") || "").trim(),
            email: String(fd.get("email") || "").trim(),
            role: String(fd.get("role") || "").trim(),
            password: String(fd.get("password") || ""),
            participant_no: participantNo,
            nisn: nisn,
            school_id: schoolID,
            class_id: classID,
          });
          pretty(regOut, out);
          setMsg("Pengguna berhasil dibuat.");
          userCreateForm.reset();
          if (
            userCreateDialog &&
            typeof userCreateDialog.close === "function"
          ) {
            userCreateDialog.close();
          }
          await loadUsers();
          await loadDashboardStats();
        } catch (err) {
          setMsg("Gagal membuat pengguna: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (isAdmin() && userUpdateForm) {
      const updateSchoolSelect = userUpdateForm.elements.namedItem("school_id");
      const updateClassSelect = userUpdateForm.elements.namedItem("class_id");
      const updateRoleSelect = userUpdateForm.elements.namedItem("role");
      if (updateRoleSelect) {
        updateRoleSelect.addEventListener("change", function () {
          applyUserFormRoleRequirements(userUpdateForm);
        });
      }
      if (updateSchoolSelect && updateClassSelect) {
        updateSchoolSelect.addEventListener("change", function () {
          syncSchoolCodeDisplay(userUpdateForm);
          const sid = Number(updateSchoolSelect.value || 0);
          if (sid <= 0) {
            resetClassSelect(updateClassSelect, "Pilih Sekolah Dulu");
            return;
          }
          loadClassesBySchool(sid)
            .then(function (classes) {
              fillClassSelect(updateClassSelect, classes);
              pickFirstClassIfAny(updateClassSelect);
            })
            .catch(function () {
              resetClassSelect(updateClassSelect, "Gagal memuat kelas");
            });
        });
      }

      userUpdateForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(userUpdateForm);
        const id = Number(fd.get("id") || 0);
        const done = beginBusy(
          userUpdateForm,
          message,
          "Memperbarui pengguna...",
        );
        try {
          const schoolID = toNullableNumber(fd.get("school_id"));
          const classID = toNullableNumber(fd.get("class_id"));
          const role = String(fd.get("role") || "")
            .trim()
            .toLowerCase();
          const participantNo = String(fd.get("participant_no") || "").trim();
          const nisn = String(fd.get("nisn") || "").trim();
          const schoolCode = schoolCodeByID(schoolID);
          if (isStudentRole(role) && (schoolID === null || classID === null)) {
            setMsg("Untuk role siswa, sekolah dan kelas wajib dipilih.");
            return;
          }
          if (isStudentRole(role) && (!participantNo || !nisn)) {
            setMsg("Untuk role siswa, nomor peserta dan NISN wajib diisi.");
            return;
          }
          if (isStudentRole(role) && !schoolCode) {
            setMsg(
              "NPSN sekolah belum terisi. Lengkapi NPSN di menu Data Master > Sekolah.",
            );
            return;
          }
          if (schoolID !== null && classID === null) {
            setMsg("Jika memilih sekolah, kelas wajib dipilih.");
            return;
          }
          const out = await api("/api/v1/admin/users/" + id, "PUT", {
            full_name: String(fd.get("full_name") || "").trim(),
            email: String(fd.get("email") || "").trim(),
            role: String(fd.get("role") || "").trim(),
            password: String(fd.get("password") || ""),
            participant_no: participantNo,
            nisn: nisn,
            school_id: schoolID === null ? 0 : schoolID,
            class_id: classID === null ? 0 : classID,
          });
          pretty(regOut, out);
          setMsg("Pengguna berhasil diperbarui.");
          if (
            userUpdateDialog &&
            typeof userUpdateDialog.close === "function"
          ) {
            userUpdateDialog.close();
          }
          await loadUsers();
          await loadDashboardStats();
        } catch (err) {
          setMsg("Gagal memperbarui pengguna: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (isAdmin() && userDeleteForm) {
      userDeleteForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(userDeleteForm);
        const id = Number(fd.get("id") || 0);
        const done = beginBusy(
          userDeleteForm,
          message,
          "Menghapus pengguna...",
        );
        try {
          const out = await api("/api/v1/admin/users/" + id, "DELETE", {});
          pretty(regOut, out);
          setMsg("Pengguna berhasil dihapus.");
          userDeleteForm.reset();
          if (
            userDeleteDialog &&
            typeof userDeleteDialog.close === "function"
          ) {
            userDeleteDialog.close();
          }
          await loadUsers();
          await loadDashboardStats();
        } catch (err) {
          setMsg("Gagal menghapus pengguna: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (isAdmin() && userImportForm) {
      userImportForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(userImportForm);
        const file = fd.get("file");
        if (!file || !file.name) {
          setMsg("File Excel wajib dipilih.");
          return;
        }
        const done = beginBusy(
          userImportForm,
          message,
          "Mengimpor data pengguna dari Excel...",
        );
        try {
          const out = await apiMultipart(
            "/api/v1/admin/users/import",
            "POST",
            fd,
          );
          pretty(userImportOut, out);
          pretty(regOut, out);
          const report =
            out && out.report && typeof out.report === "object"
              ? out.report
              : {};
          const failed = Number(report.failed_rows || 0);
          const errors = Array.isArray(report.errors) ? report.errors : [];

          if (failed > 0) {
            const details = errors.length
              ? errors
                  .map(function (it) {
                    const row = Number(it.row || 0);
                    const userLabel = String(it.username || "").trim();
                    const errMsg = String(it.error || "error tidak diketahui");
                    if (userLabel) {
                      return (
                        "Baris " +
                        String(row) +
                        " | username: " +
                        userLabel +
                        " | " +
                        errMsg
                      );
                    }
                    return "Baris " + String(row) + " | " + errMsg;
                  })
                  .join("\n")
              : "Ada baris gagal, tetapi detail tidak tersedia.";
            if (userImportErrorOut) userImportErrorOut.textContent = details;
            if (
              userImportErrorDialog &&
              typeof userImportErrorDialog.showModal === "function"
            ) {
              userImportErrorDialog.showModal();
            }
          } else {
            userImportForm.reset();
            if (
              userImportDialog &&
              typeof userImportDialog.close === "function"
            ) {
              userImportDialog.close();
            }
          }

          setMsg(
            "Impor selesai. Berhasil: " +
              String(report.success_rows || 0) +
              ", gagal: " +
              String(report.failed_rows || 0) +
              ".",
          );
          await loadUsers();
          await loadDashboardStats();
        } catch (err) {
          if (userImportErrorOut) {
            userImportErrorOut.textContent =
              "Impor gagal:\n" + String(err.message || "Request failed");
          }
          if (
            userImportErrorDialog &&
            typeof userImportErrorDialog.showModal === "function"
          ) {
            userImportErrorDialog.showModal();
          }
          setMsg("Gagal impor pengguna: " + err.message);
        } finally {
          done();
        }
      });
    }

    const importForm = document.getElementById("admin-import-form");
    if (importForm) {
      importForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(importForm);
        const file = fd.get("file");
        if (!file || !file.name) {
          setMsg("File CSV wajib dipilih.");
          return;
        }
        const done = beginBusy(
          importForm,
          message,
          "Mengimpor data siswa CSV...",
        );
        try {
          const out = await apiMultipart(
            "/api/v1/admin/imports/students",
            "POST",
            fd,
          );
          pretty(masterOut, out);
          setMsg("Impor CSV selesai.");
          importForm.reset();
        } catch (err) {
          setMsg("Gagal impor CSV: " + err.message);
        } finally {
          done();
        }
      });
    }

    function setMasterMsg(msg) {
      if (masterMessage) masterMessage.textContent = msg;
      else setMsg(msg);
    }

    function openLevelDialog(editItem) {
      if (!levelDialogForm || !levelDialog) return;
      levelDialogForm.reset();
      levelDialogForm.elements.namedItem("id").value = editItem
        ? String(editItem.id || "")
        : "";
      levelDialogForm.elements.namedItem("name").value = editItem
        ? String(editItem.name || "")
        : "";
      if (levelDialogTitle) {
        levelDialogTitle.textContent = editItem
          ? "Ubah Jenjang"
          : "Tambah Jenjang";
      }
      if (typeof levelDialog.showModal === "function") levelDialog.showModal();
    }

    function openSchoolDialog(editItem) {
      if (!schoolDialogForm || !schoolDialog) return;
      schoolDialogForm.reset();
      schoolDialogForm.elements.namedItem("id").value = editItem
        ? String(editItem.id || "")
        : "";
      schoolDialogForm.elements.namedItem("name").value = editItem
        ? String(editItem.name || "")
        : "";
      schoolDialogForm.elements.namedItem("code").value = editItem
        ? String(editItem.code || "")
        : "";
      schoolDialogForm.elements.namedItem("address").value = editItem
        ? String(editItem.address || "")
        : "";
      if (schoolDialogTitle) {
        schoolDialogTitle.textContent = editItem
          ? "Ubah Sekolah"
          : "Tambah Sekolah";
      }
      if (typeof schoolDialog.showModal === "function")
        schoolDialog.showModal();
    }

    function openClassDialog(editItem) {
      if (!classDialogForm || !classDialog) return;
      classDialogForm.reset();
      const schoolSelect = classDialogForm.elements.namedItem("school_id");
      fillSchoolSelectRequired(schoolSelect, editItem ? editItem.school_id : 0);
      classDialogForm.elements.namedItem("id").value = editItem
        ? String(editItem.id || "")
        : "";
      classDialogForm.elements.namedItem("grade_level").value = editItem
        ? String(editItem.grade_level || "")
        : "";
      classDialogForm.elements.namedItem("name").value = editItem
        ? String(editItem.name || "")
        : "";
      if (classDialogTitle) {
        classDialogTitle.textContent = editItem ? "Ubah Kelas" : "Tambah Kelas";
      }
      if (typeof classDialog.showModal === "function") classDialog.showModal();
    }

    function openDeleteDialog(entity, id, label) {
      if (!masterDeleteForm || !masterDeleteDialog) return;
      masterDeleteForm.reset();
      masterDeleteForm.elements.namedItem("entity").value = entity;
      masterDeleteForm.elements.namedItem("id").value = String(id);
      if (masterDeleteLabel) masterDeleteLabel.textContent = label;
      if (typeof masterDeleteDialog.showModal === "function")
        masterDeleteDialog.showModal();
    }

    if (levelAddBtn && isAdmin()) {
      levelAddBtn.addEventListener("click", function () {
        openLevelDialog(null);
      });
    }
    if (schoolAddBtn && isAdmin()) {
      schoolAddBtn.addEventListener("click", function () {
        openSchoolDialog(null);
      });
    }
    if (classAddBtn && isAdmin()) {
      classAddBtn.addEventListener("click", function () {
        openClassDialog(null);
      });
    }

    if (levelDialogCancelBtn) {
      levelDialogCancelBtn.addEventListener("click", function () {
        if (levelDialog && typeof levelDialog.close === "function") {
          levelDialog.close();
        }
      });
    }
    if (schoolDialogCancelBtn) {
      schoolDialogCancelBtn.addEventListener("click", function () {
        if (schoolDialog && typeof schoolDialog.close === "function") {
          schoolDialog.close();
        }
      });
    }
    if (classDialogCancelBtn) {
      classDialogCancelBtn.addEventListener("click", function () {
        if (classDialog && typeof classDialog.close === "function") {
          classDialog.close();
        }
      });
    }
    if (masterDeleteCancelBtn) {
      masterDeleteCancelBtn.addEventListener("click", function () {
        if (
          masterDeleteDialog &&
          typeof masterDeleteDialog.close === "function"
        ) {
          masterDeleteDialog.close();
        }
      });
    }

    if (masterRefreshBtn) {
      masterRefreshBtn.addEventListener("click", async function () {
        const done = beginBusy(
          masterRefreshBtn,
          message,
          "Memuat ulang data master...",
        );
        try {
          await loadMasterSummaryTable();
          setMasterMsg("Data master berhasil dimuat.");
        } catch (err) {
          setMasterMsg("Gagal memuat data master: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (levelTableBody) {
      levelTableBody.addEventListener("click", function (e) {
        const btn =
          e.target &&
          e.target.closest(
            "button[data-master-entity][data-master-action][data-id]",
          );
        if (!btn || !isAdmin()) return;
        const id = Number(btn.getAttribute("data-id") || 0);
        const action = String(btn.getAttribute("data-master-action") || "");
        const item = masterSummaryState.levelsByID[String(id)];
        if (!id || !item) return;
        if (action === "edit") {
          openLevelDialog(item);
        } else if (action === "delete") {
          openDeleteDialog(
            "level",
            id,
            "Hapus jenjang " + String(item.name || "") + "?",
          );
        }
      });
    }

    if (schoolTableBody) {
      schoolTableBody.addEventListener("click", function (e) {
        const btn =
          e.target &&
          e.target.closest(
            "button[data-master-entity][data-master-action][data-id]",
          );
        if (!btn || !isAdmin()) return;
        const id = Number(btn.getAttribute("data-id") || 0);
        const action = String(btn.getAttribute("data-master-action") || "");
        const item = masterSummaryState.schoolsByID[String(id)];
        if (!id || !item) return;
        if (action === "edit") {
          openSchoolDialog(item);
        } else if (action === "delete") {
          openDeleteDialog(
            "school",
            id,
            "Hapus sekolah " + String(item.name || "") + "?",
          );
        }
      });
    }

    if (classTableBody) {
      classTableBody.addEventListener("click", function (e) {
        const btn =
          e.target &&
          e.target.closest(
            "button[data-master-entity][data-master-action][data-id]",
          );
        if (!btn || !isAdmin()) return;
        const id = Number(btn.getAttribute("data-id") || 0);
        const action = String(btn.getAttribute("data-master-action") || "");
        const item = masterSummaryState.classesByID[String(id)];
        if (!id || !item) return;
        if (action === "edit") {
          openClassDialog(item);
        } else if (action === "delete") {
          openDeleteDialog(
            "class",
            id,
            "Hapus kelas " + String(item.name || "") + "?",
          );
        }
      });
    }

    if (isAdmin() && levelDialogForm) {
      levelDialogForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(levelDialogForm);
        const id = Number(fd.get("id") || 0);
        const name = String(fd.get("name") || "").trim();
        const done = beginBusy(
          levelDialogForm,
          message,
          "Menyimpan jenjang...",
        );
        try {
          if (id > 0) {
            await api("/api/v1/admin/levels/" + id, "PUT", { name: name });
            setMasterMsg("Jenjang berhasil diperbarui.");
          } else {
            await api("/api/v1/admin/levels", "POST", { name: name });
            setMasterMsg("Jenjang berhasil ditambahkan.");
          }
          if (levelDialog && typeof levelDialog.close === "function") {
            levelDialog.close();
          }
          await loadMasterSummaryTable();
        } catch (err) {
          setMasterMsg("Simpan jenjang gagal: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (isAdmin() && schoolDialogForm) {
      schoolDialogForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(schoolDialogForm);
        const id = Number(fd.get("id") || 0);
        const payload = {
          name: String(fd.get("name") || "").trim(),
          code: String(fd.get("code") || "").trim(),
          address: String(fd.get("address") || "").trim(),
        };
        const done = beginBusy(
          schoolDialogForm,
          message,
          "Menyimpan sekolah...",
        );
        try {
          if (id > 0) {
            await api("/api/v1/admin/schools/" + id, "PUT", payload);
            setMasterMsg("Sekolah berhasil diperbarui.");
          } else {
            await api("/api/v1/admin/schools", "POST", payload);
            setMasterMsg("Sekolah berhasil ditambahkan.");
          }
          if (schoolDialog && typeof schoolDialog.close === "function") {
            schoolDialog.close();
          }
          await loadMasterSummaryTable();
          await loadDashboardStats();
          await loadSchoolsForUserForms();
        } catch (err) {
          setMasterMsg("Simpan sekolah gagal: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (isAdmin() && classDialogForm) {
      classDialogForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(classDialogForm);
        const id = Number(fd.get("id") || 0);
        const payload = {
          school_id: Number(fd.get("school_id") || 0),
          grade_level: String(fd.get("grade_level") || "").trim(),
          name: String(fd.get("name") || "").trim(),
        };
        const done = beginBusy(classDialogForm, message, "Menyimpan kelas...");
        try {
          if (id > 0) {
            await api("/api/v1/admin/classes/" + id, "PUT", payload);
            setMasterMsg("Kelas berhasil diperbarui.");
          } else {
            await api("/api/v1/admin/classes", "POST", payload);
            setMasterMsg("Kelas berhasil ditambahkan.");
          }
          if (classDialog && typeof classDialog.close === "function") {
            classDialog.close();
          }
          await loadMasterSummaryTable();
        } catch (err) {
          setMasterMsg("Simpan kelas gagal: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (isAdmin() && masterDeleteForm) {
      masterDeleteForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(masterDeleteForm);
        const entity = String(fd.get("entity") || "");
        const id = Number(fd.get("id") || 0);
        if (!entity || !id) return;
        const done = beginBusy(masterDeleteForm, message, "Menghapus data...");
        try {
          if (entity === "level") {
            await api("/api/v1/admin/levels/" + id, "DELETE", {});
            setMasterMsg("Jenjang berhasil dihapus.");
          } else if (entity === "school") {
            await api("/api/v1/admin/schools/" + id, "DELETE", {});
            setMasterMsg("Sekolah berhasil dihapus.");
          } else if (entity === "class") {
            await api("/api/v1/admin/classes/" + id, "DELETE", {});
            setMasterMsg("Kelas berhasil dihapus.");
          }
          if (
            masterDeleteDialog &&
            typeof masterDeleteDialog.close === "function"
          ) {
            masterDeleteDialog.close();
          }
          await loadMasterSummaryTable();
          await loadDashboardStats();
          await loadSchoolsForUserForms();
          await loadUsers();
        } catch (err) {
          setMasterMsg("Hapus data gagal: " + err.message);
        } finally {
          done();
        }
      });
    }

    try {
      if (regFilterForm) {
        const fd = new FormData(regFilterForm);
        currentRole = String(fd.get("role") || "").trim();
        currentQuery = String(fd.get("q") || "").trim();
        currentLimit = Number(fd.get("limit") || 50);
      }
      await loadSchoolsForUserForms();
      if (userCreateForm) {
        applyUserFormRoleRequirements(userCreateForm);
        fillSchoolSelect(userCreateForm.elements.namedItem("school_id"));
        resetClassSelect(
          userCreateForm.elements.namedItem("class_id"),
          "Pilih Sekolah Dulu",
        );
      }
      if (userUpdateForm) {
        applyUserFormRoleRequirements(userUpdateForm);
        fillSchoolSelect(userUpdateForm.elements.namedItem("school_id"));
        resetClassSelect(
          userUpdateForm.elements.namedItem("class_id"),
          "Pilih Sekolah Dulu",
        );
      }
      await loadUsers();
      await loadDashboardStats();
      await loadMasterSummaryTable();
      activateMenu("dashboard");
      setMsg("Dashboard admin siap.");
    } catch (err) {
      setMsg("Gagal memuat data awal admin: " + err.message);
    }
  }

  async function initProktorPage() {
    const root = document.querySelector('[data-page="proktor_content"]');
    if (!root) return;

    const user = await meOrNull();
    if (!user) {
      window.location.href = "/login";
      return;
    }
    if (!["admin", "proktor"].includes(String(user.role || ""))) {
      alert("Halaman proktor hanya untuk admin/proktor");
      window.location.href = "/";
      return;
    }

    const msg = document.getElementById("proktor-message");
    const statPending = document.getElementById("proktor-stat-pending");
    const statUsers = document.getElementById("proktor-stat-users");
    const statSchools = document.getElementById("proktor-stat-schools");
    const regRefreshBtn = document.getElementById(
      "proktor-registrations-refresh-btn",
    );
    const regBody = document.getElementById("proktor-registrations-body");
    const eventsForm = document.getElementById("proktor-events-form");
    const eventsBody = document.getElementById("proktor-events-body");
    const tokenPanel = document.getElementById("proktor-token-panel");
    const tokenForm = document.getElementById("proktor-token-form");
    const tokenExamSelect = document.getElementById("proktor-token-exam");
    const tokenTTLInput = document.getElementById("proktor-token-ttl");
    const tokenResult = document.getElementById("proktor-token-result");
    const examsPanel = document.getElementById("proktor-exams-panel");
    const examsRefreshBtn = document.getElementById(
      "proktor-exams-refresh-btn",
    );
    const examForm = document.getElementById("proktor-exam-form");
    const examSubjectSelect = document.getElementById("proktor-exam-subject");
    const examsBody = document.getElementById("proktor-exams-body");
    const examAssignForm = document.getElementById("proktor-exam-assign-form");
    const assignExamIDInput = document.getElementById("proktor-assign-exam-id");
    const assignSchoolSelect = document.getElementById("proktor-assign-school");
    const assignClassSelect = document.getElementById("proktor-assign-class");
    const examAssignmentsLoadBtn = document.getElementById(
      "proktor-exam-assignments-load-btn",
    );
    const examAssignmentsBody = document.getElementById(
      "proktor-exam-assignments-body",
    );
    const examQuestionForm = document.getElementById(
      "proktor-exam-question-form",
    );
    const questionExamIDInput = document.getElementById(
      "proktor-question-exam-id",
    );
    const examQuestionsLoadBtn = document.getElementById(
      "proktor-exam-questions-load-btn",
    );
    const examQuestionsBody = document.getElementById(
      "proktor-exam-questions-body",
    );
    const masterRefreshBtn = document.getElementById(
      "proktor-master-refresh-btn",
    );
    const levelsBody = document.getElementById("proktor-levels-body");
    const schoolsBody = document.getElementById("proktor-schools-body");
    const classesBody = document.getElementById("proktor-classes-body");
    const placementForm = document.getElementById("proktor-placement-form");
    const placementUserSelect = document.getElementById(
      "proktor-placement-user",
    );
    const placementSchoolSelect = document.getElementById(
      "proktor-placement-school",
    );
    const placementClassSelect = document.getElementById(
      "proktor-placement-class",
    );
    const registrationsPanel = document.getElementById(
      "proktor-registrations-panel",
    );
    const dashboardPanel = document.getElementById("proktor-dashboard-panel");
    const eventsPanel = document.getElementById("proktor-events-panel");
    const resultsPanel = document.getElementById("proktor-results-panel");
    const resultsRefreshBtn = document.getElementById(
      "proktor-results-refresh-btn",
    );
    const resultsAttemptForm = document.getElementById(
      "proktor-results-attempt-form",
    );
    const resultsResetAttemptForm = document.getElementById(
      "proktor-results-reset-attempt-form",
    );
    const resultsSummary = document.getElementById("proktor-results-summary");
    const resultsExtra = document.getElementById("proktor-results-extra");
    const resultsReportBtn = document.getElementById(
      "proktor-results-report-btn",
    );
    const resultsStatsBtn = document.getElementById(
      "proktor-results-stats-btn",
    );
    const resultsChartBtn = document.getElementById(
      "proktor-results-chart-btn",
    );
    const masterPanel = document.getElementById("proktor-master-panel");
    const quickPanel = document.getElementById("proktor-quick-panel");
    const menuButtons = root.querySelectorAll("[data-proktor-menu]");
    const proktorPageTitle = document.getElementById("proktor-page-title");
    const proktorPageDesc = document.getElementById("proktor-page-desc");
    let examFormSubmitting = false;
    let latestResultData = null;
    let placementUsers = [];
    let placementSchools = [];
    let placementClasses = [];

    const setMsg = function (value) {
      text(msg, value);
    };
    const localSchoolLabel = function (it) {
      const name = String((it && it.name) || "").trim();
      const code = String((it && it.code) || "").trim();
      if (!name) return "-";
      return code ? name + " (" + code + ")" : name;
    };
    const fmtDate = function (raw) {
      if (!raw) return "-";
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return String(raw);
      return d.toLocaleString("id-ID");
    };

    const setTokenResult = function (value) {
      text(tokenResult, value);
      if (tokenResult) tokenResult.classList.remove("muted");
    };
    const setResultsSummary = function (value) {
      text(resultsSummary, value);
      if (resultsSummary) resultsSummary.classList.remove("muted");
    };
    const setResultsExtra = function (value) {
      text(resultsExtra, value);
      if (resultsExtra) resultsExtra.classList.remove("muted");
    };
    const setGuruResultsExtraHTML = function (value) {
      if (!resultsExtra) return;
      resultsExtra.innerHTML = String(value || "");
      resultsExtra.classList.remove("muted");
    };

    function buildGuruResultsScoreChartHTML(rows, totalQuestions) {
      const list = (Array.isArray(rows) ? rows : [])
        .slice()
        .sort(function (a, b) {
          return (
            Number((a && a.skor_total) || 0) - Number((b && b.skor_total) || 0)
          );
        });
      if (!list.length) {
        return '<span class="muted">Belum ada data grafik.</span>';
      }
      const labels = list.map(function (r) {
        return (
          String((r && r.full_name) || "-") +
          " (" +
          String((r && r.attempt_ke) || 0) +
          ")"
        );
      });
      const nilaiList = list.map(function (r) {
        const score = Number((r && r.skor_total) || 0);
        if (totalQuestions <= 0) return 0;
        return (score / totalQuestions) * 100;
      });
      const maxScore = 100;
      const ticks = 5;
      const chartWidth = Math.max(560, labels.length * 66);
      const chartHeight = 340;
      const margin = { left: 54, right: 18, top: 16, bottom: 116 };
      const innerW = chartWidth - margin.left - margin.right;
      const innerH = chartHeight - margin.top - margin.bottom;
      const barW = Math.max(
        12,
        Math.floor(innerW / Math.max(1, labels.length * 1.7)),
      );
      const step = innerW / Math.max(1, labels.length);
      const elements = [];

      for (let i = 0; i <= ticks; i += 1) {
        const yVal = (maxScore / ticks) * i;
        const y = margin.top + innerH - (yVal / maxScore) * innerH;
        elements.push(
          '<line x1="' +
            margin.left +
            '" y1="' +
            y.toFixed(2) +
            '" x2="' +
            (margin.left + innerW) +
            '" y2="' +
            y.toFixed(2) +
            '" stroke="#d7dfec" stroke-width="1" />',
        );
        elements.push(
          '<text x="' +
            (margin.left - 8) +
            '" y="' +
            (y + 4).toFixed(2) +
            '" text-anchor="end" font-size="11" fill="#4b5d78">' +
            escapeHtml(String(Math.round(yVal * 100) / 100)) +
            "</text>",
        );
      }

      labels.forEach(function (label, i) {
        const score = scores[i];
        const xCenter = margin.left + step * i + step / 2;
        const barH = (score / maxScore) * innerH;
        const yTop = margin.top + innerH - barH;
        const x = xCenter - barW / 2;
        elements.push(
          '<rect x="' +
            x.toFixed(2) +
            '" y="' +
            yTop.toFixed(2) +
            '" width="' +
            barW +
            '" height="' +
            Math.max(0, barH).toFixed(2) +
            '" fill="#2f64dc" rx="4" ry="4"></rect>',
        );
        elements.push(
          '<text x="' +
            xCenter.toFixed(2) +
            '" y="' +
            (yTop - 6).toFixed(2) +
            '" text-anchor="middle" font-size="11" fill="#1f3559">' +
            escapeHtml(String(score)) +
            "</text>",
        );
        elements.push(
          '<text x="' +
            xCenter.toFixed(2) +
            '" y="' +
            (margin.top + innerH + 12).toFixed(2) +
            '" text-anchor="end" transform="rotate(-40 ' +
            xCenter.toFixed(2) +
            " " +
            (margin.top + innerH + 12).toFixed(2) +
            ')" font-size="11" fill="#324862">' +
            escapeHtml(label) +
            "</text>",
        );
      });

      return [
        '<div class="guru-results-chart-wrap">',
        '<svg viewBox="0 0 ' +
          chartWidth +
          " " +
          chartHeight +
          '" class="guru-results-chart-svg" role="img" aria-label="Grafik skor peserta">',
        '<line x1="' +
          margin.left +
          '" y1="' +
          (margin.top + innerH) +
          '" x2="' +
          (margin.left + innerW) +
          '" y2="' +
          (margin.top + innerH) +
          '" stroke="#778ba8" stroke-width="1.5" />',
        '<line x1="' +
          margin.left +
          '" y1="' +
          margin.top +
          '" x2="' +
          margin.left +
          '" y2="' +
          (margin.top + innerH) +
          '" stroke="#778ba8" stroke-width="1.5" />',
        elements.join(""),
        '<text x="' +
          (margin.left + innerW / 2).toFixed(2) +
          '" y="' +
          (chartHeight - 10) +
          '" text-anchor="middle" font-size="12" fill="#223b63">Sumbu X: Nama Peserta</text>',
        '<text x="14" y="' +
          (margin.top + innerH / 2).toFixed(2) +
          '" text-anchor="middle" transform="rotate(-90 14 ' +
          (margin.top + innerH / 2).toFixed(2) +
          ')" font-size="12" fill="#223b63">Sumbu Y: Skor</text>',
        "</svg>",
        "</div>",
      ].join("");
    }
    const setResultsExtraHTML = function (value) {
      if (!resultsExtra) return;
      resultsExtra.innerHTML = String(value || "");
      resultsExtra.classList.remove("muted");
    };

    function buildResultsScoreChartHTML(rows, totalQuestions) {
      const list = (Array.isArray(rows) ? rows : [])
        .slice()
        .sort(function (a, b) {
          return (
            Number((a && a.skor_total) || 0) - Number((b && b.skor_total) || 0)
          );
        });
      if (!list.length) {
        return '<span class="muted">Belum ada data grafik.</span>';
      }
      const labels = list.map(function (r) {
        return (
          String((r && r.full_name) || "-") +
          " (" +
          String((r && r.attempt_ke) || 0) +
          ")"
        );
      });
      const nilaiList = list.map(function (r) {
        const score = Number((r && r.skor_total) || 0);
        if (totalQuestions <= 0) return 0;
        return (score / totalQuestions) * 100;
      });
      const maxScore = 100;
      const ticks = 5;
      const chartWidth = Math.max(560, labels.length * 66);
      const chartHeight = 340;
      const margin = { left: 54, right: 18, top: 16, bottom: 116 };
      const innerW = chartWidth - margin.left - margin.right;
      const innerH = chartHeight - margin.top - margin.bottom;
      const barW = Math.max(
        12,
        Math.floor(innerW / Math.max(1, labels.length * 1.7)),
      );
      const step = innerW / Math.max(1, labels.length);
      const elements = [];

      for (let i = 0; i <= ticks; i += 1) {
        const yVal = (maxScore / ticks) * i;
        const y = margin.top + innerH - (yVal / maxScore) * innerH;
        elements.push(
          '<line x1="' +
            margin.left +
            '" y1="' +
            y.toFixed(2) +
            '" x2="' +
            (margin.left + innerW) +
            '" y2="' +
            y.toFixed(2) +
            '" stroke="#d7dfec" stroke-width="1" />',
        );
        elements.push(
          '<text x="' +
            (margin.left - 8) +
            '" y="' +
            (y + 4).toFixed(2) +
            '" text-anchor="end" font-size="11" fill="#4b5d78">' +
            escapeHtml(String(Math.round(yVal * 100) / 100)) +
            "</text>",
        );
      }

      labels.forEach(function (label, i) {
        const score = scores[i];
        const xCenter = margin.left + step * i + step / 2;
        const barH = (score / maxScore) * innerH;
        const yTop = margin.top + innerH - barH;
        const x = xCenter - barW / 2;
        elements.push(
          '<rect x="' +
            x.toFixed(2) +
            '" y="' +
            yTop.toFixed(2) +
            '" width="' +
            barW +
            '" height="' +
            Math.max(0, barH).toFixed(2) +
            '" fill="#2f64dc" rx="4" ry="4"></rect>',
        );
        elements.push(
          '<text x="' +
            xCenter.toFixed(2) +
            '" y="' +
            (yTop - 6).toFixed(2) +
            '" text-anchor="middle" font-size="11" fill="#1f3559">' +
            escapeHtml(String(score)) +
            "</text>",
        );
        elements.push(
          '<text x="' +
            xCenter.toFixed(2) +
            '" y="' +
            (margin.top + innerH + 12).toFixed(2) +
            '" text-anchor="end" transform="rotate(-40 ' +
            xCenter.toFixed(2) +
            " " +
            (margin.top + innerH + 12).toFixed(2) +
            ')" font-size="11" fill="#324862">' +
            escapeHtml(label) +
            "</text>",
        );
      });

      return [
        '<div class="guru-results-chart-wrap">',
        '<svg viewBox="0 0 ' +
          chartWidth +
          " " +
          chartHeight +
          '" class="guru-results-chart-svg" role="img" aria-label="Grafik skor peserta">',
        '<line x1="' +
          margin.left +
          '" y1="' +
          (margin.top + innerH) +
          '" x2="' +
          (margin.left + innerW) +
          '" y2="' +
          (margin.top + innerH) +
          '" stroke="#778ba8" stroke-width="1.5" />',
        '<line x1="' +
          margin.left +
          '" y1="' +
          margin.top +
          '" x2="' +
          margin.left +
          '" y2="' +
          (margin.top + innerH) +
          '" stroke="#778ba8" stroke-width="1.5" />',
        elements.join(""),
        '<text x="' +
          (margin.left + innerW / 2).toFixed(2) +
          '" y="' +
          (chartHeight - 10) +
          '" text-anchor="middle" font-size="12" fill="#223b63">Sumbu X: Nama Peserta</text>',
        '<text x="14" y="' +
          (margin.top + innerH / 2).toFixed(2) +
          '" text-anchor="middle" transform="rotate(-90 14 ' +
          (margin.top + innerH / 2).toFixed(2) +
          ')" font-size="12" fill="#223b63">Sumbu Y: Skor</text>',
        "</svg>",
        "</div>",
      ].join("");
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
    function resetAssignClassSelect(placeholder) {
      if (!assignClassSelect) return;
      const textValue = String(placeholder || "Pilih kelas...");
      assignClassSelect.innerHTML =
        '<option value="">' + escapeHtml(textValue) + "</option>";
      assignClassSelect.disabled = true;
    }

    function fillAssignSchoolSelect(selectedSchoolID) {
      if (!assignSchoolSelect) return;
      assignSchoolSelect.innerHTML =
        '<option value="">Pilih sekolah...</option>';
      placementSchools.forEach(function (it) {
        const o = document.createElement("option");
        const id = Number(it.id || 0);
        o.value = String(id);
        o.textContent = String(it.name || "-");
        if (selectedSchoolID > 0 && id === selectedSchoolID) o.selected = true;
        assignSchoolSelect.appendChild(o);
      });
    }

    function fillAssignClassSelectBySchool(schoolID) {
      if (!assignClassSelect) return;
      const sid = Number(schoolID || 0);
      assignClassSelect.innerHTML = '<option value="">Pilih kelas...</option>';
      const items = placementClasses.filter(function (it) {
        return Number(it.school_id || 0) === sid;
      });
      if (!items.length) {
        resetAssignClassSelect("Tidak ada kelas di sekolah ini");
        return;
      }
      assignClassSelect.disabled = false;
      items.forEach(function (it) {
        const o = document.createElement("option");
        o.value = String(it.id || "");
        o.textContent =
          String(it.grade_level || "") + " | " + String(it.name || "-");
        assignClassSelect.appendChild(o);
      });
    }

    function resetPlacementClassSelect(placeholder) {
      if (!placementClassSelect) return;
      const textValue = String(placeholder || "Pilih kelas...");
      placementClassSelect.innerHTML =
        '<option value="">' + escapeHtml(textValue) + "</option>";
      placementClassSelect.disabled = true;
    }

    function fillPlacementSchoolSelect(selectedSchoolID) {
      if (!placementSchoolSelect) return;
      placementSchoolSelect.innerHTML =
        '<option value="">Pilih sekolah...</option>';
      placementSchools.forEach(function (it) {
        const o = document.createElement("option");
        const id = Number(it.id || 0);
        o.value = String(id);
        o.textContent = String(it.name || "-");
        if (selectedSchoolID > 0 && id === selectedSchoolID) o.selected = true;
        placementSchoolSelect.appendChild(o);
      });
    }

    function fillPlacementClassSelectBySchool(schoolID, selectedClassID) {
      if (!placementClassSelect) return;
      const sid = Number(schoolID || 0);
      placementClassSelect.innerHTML =
        '<option value="">Pilih kelas...</option>';
      const items = placementClasses.filter(function (it) {
        return Number(it.school_id || 0) === sid;
      });
      if (!items.length) {
        resetPlacementClassSelect("Tidak ada kelas di sekolah ini");
        return;
      }
      placementClassSelect.disabled = false;
      items.forEach(function (it) {
        const o = document.createElement("option");
        const classID = Number(it.id || 0);
        o.value = String(classID);
        o.textContent =
          String(it.grade_level || "") + " | " + String(it.name || "-");
        if (
          Number(selectedClassID || 0) > 0 &&
          classID === Number(selectedClassID || 0)
        ) {
          o.selected = true;
        }
        placementClassSelect.appendChild(o);
      });
    }

    async function loadPlacementOptions() {
      const [guru, siswa, schools, classes] = await Promise.all([
        api("/api/v1/admin/users?role=guru&limit=200&offset=0", "GET"),
        api("/api/v1/admin/users?role=siswa&limit=500&offset=0", "GET"),
        api("/api/v1/admin/schools?all=1", "GET"),
        api("/api/v1/admin/classes?all=1", "GET"),
      ]);
      placementUsers = []
        .concat(Array.isArray(guru.items) ? guru.items : [])
        .concat(Array.isArray(siswa.items) ? siswa.items : []);
      placementSchools = Array.isArray(schools) ? schools : [];
      placementClasses = Array.isArray(classes) ? classes : [];

      if (placementUserSelect) {
        placementUserSelect.innerHTML =
          '<option value="">Pilih pengguna...</option>';
        placementUsers.forEach(function (it) {
          const o = document.createElement("option");
          const id = Number(it.id || 0);
          const schoolID = Number(it.school_id || 0);
          const classID = Number(it.class_id || 0);
          o.value = String(id);
          o.setAttribute(
            "data-school-id",
            schoolID > 0 ? String(schoolID) : "",
          );
          o.setAttribute("data-class-id", classID > 0 ? String(classID) : "");
          o.textContent =
            String(it.full_name || it.username || "User") +
            " (" +
            String(it.role || "-") +
            ")" +
            (it.class_name ? " | " + String(it.class_name) : "");
          placementUserSelect.appendChild(o);
        });
      }
      fillPlacementSchoolSelect(0);
      resetPlacementClassSelect("Pilih sekolah dulu");
      fillAssignSchoolSelect(0);
      resetAssignClassSelect("Pilih sekolah dulu");
    }

    function activateProktorMenu(menu) {
      const allowed = [
        "dashboard",
        "registrations",
        "events",
        "token",
        "exams",
        "results",
        "master",
        "quick",
      ];
      const key = allowed.includes(menu) ? menu : "dashboard";
      menuButtons.forEach(function (btn) {
        const active = btn.getAttribute("data-proktor-menu") === key;
        btn.classList.toggle("active", active);
      });
      if (dashboardPanel) dashboardPanel.hidden = key !== "dashboard";
      if (registrationsPanel)
        registrationsPanel.hidden = key !== "registrations";
      if (eventsPanel) eventsPanel.hidden = key !== "events";
      if (tokenPanel) tokenPanel.hidden = key !== "token";
      if (examsPanel) examsPanel.hidden = key !== "exams";
      if (resultsPanel) resultsPanel.hidden = key !== "results";
      if (masterPanel) masterPanel.hidden = key !== "master";
      if (quickPanel) quickPanel.hidden = key !== "quick";
      const proktorTitles = {
        dashboard: {
          title: "Dashboard Proktor",
          desc: "Ringkasan operasional proktor untuk monitoring ujian.",
        },
        registrations: {
          title: "Verifikasi Pendaftaran",
          desc: "Tinjau dan verifikasi pendaftaran peserta.",
        },
        events: {
          title: "Monitoring Event",
          desc: "Pantau sesi ujian dan aktivitas peserta.",
        },
        token: {
          title: "Token Ujian",
          desc: "Buat dan kelola token ujian.",
        },
        exams: {
          title: "Kelola Ujian",
          desc: "Atur jadwal, mapel, dan konfigurasi ujian.",
        },
        results: {
          title: "Hasil Ujian",
          desc: "Lihat rekap dan detail hasil peserta.",
        },
        master: {
          title: "Data Master",
          desc: "Kelola jenjang, sekolah, dan kelas.",
        },
        quick: {
          title: "Aksi Cepat",
          desc: "Jalankan tindakan administrasi cepat.",
        },
      };
      const info = proktorTitles[key] || proktorTitles.dashboard;
      if (proktorPageTitle) proktorPageTitle.textContent = info.title;
      if (proktorPageDesc) proktorPageDesc.textContent = info.desc;
    }

    async function loadTokenExamOptions() {
      if (!tokenExamSelect) return;
      const exams = await api("/api/v1/admin/exams", "GET");
      tokenExamSelect.innerHTML = '<option value="">Pilih ujian...</option>';
      if (!Array.isArray(exams) || !exams.length) return;
      exams.forEach(function (it) {
        const o = document.createElement("option");
        o.value = String(it.id || "");
        const chunks = [
          String(it.code || "").trim(),
          String(it.title || "").trim(),
          String(it.subject_name || "").trim(),
        ].filter(Boolean);
        o.textContent = chunks.join(" | ");
        tokenExamSelect.appendChild(o);
      });
    }

    async function loadExamSubjectOptions() {
      if (!examSubjectSelect) return;
      const subjects = await api("/api/v1/subjects", "GET");
      examSubjectSelect.innerHTML = '<option value="">Pilih mapel...</option>';
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
        examSubjectSelect.appendChild(o);
      });
    }

    async function loadExamManageTable() {
      const exams = await api("/api/v1/admin/exams/manage", "GET");
      if (!examsBody) return;
      if (!Array.isArray(exams) || !exams.length) {
        examsBody.innerHTML =
          '<tr><td colspan="8" class="muted">Belum ada data ujian.</td></tr>';
        return;
      }
      examsBody.innerHTML = "";
      exams.forEach(function (it) {
        const tr = document.createElement("tr");
        tr.innerHTML = [
          "<td>" + escapeHtml(String(it.id || "")) + "</td>",
          "<td>" +
            escapeHtml(String(it.code || "")) +
            "<br><small>" +
            escapeHtml(String(it.title || "")) +
            "</small></td>",
          "<td>" + escapeHtml(String(it.subject_name || "-")) + "</td>",
          "<td>" + escapeHtml(String(it.duration_minutes || 0)) + " menit</td>",
          "<td>" + escapeHtml(String(it.max_attempts || 1)) + "x</td>",
          "<td>" + escapeHtml(String(it.question_count || 0)) + "</td>",
          "<td>" + escapeHtml(String(it.assigned_count || 0)) + "</td>",
          '<td><span class="action-icons">' +
            '<button class="icon-only-btn" type="button" data-exam-action="use" data-id="' +
            escapeHtml(String(it.id || "")) +
            '" title="Pilih Ujian" aria-label="Pilih Ujian">' +
            '<svg viewBox="0 0 24 24" focusable="false"><path d="M5 12h14M13 6l6 6-6 6"/></svg>' +
            "</button>" +
            '<button class="icon-only-btn danger" type="button" data-exam-action="delete" data-id="' +
            escapeHtml(String(it.id || "")) +
            '" title="Nonaktifkan Ujian" aria-label="Nonaktifkan Ujian">' +
            '<svg viewBox="0 0 24 24" focusable="false"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>' +
            "</button>" +
            "</span></td>",
        ].join("");
        examsBody.appendChild(tr);
      });
    }

    async function loadExamQuestions(examID) {
      if (!examQuestionsBody) return;
      if (!examID || examID <= 0) {
        examQuestionsBody.innerHTML =
          '<tr><td colspan="6" class="muted">Pilih exam lalu muat soal ujian.</td></tr>';
        return;
      }
      const items = await api(
        "/api/v1/admin/exams/" + Number(examID) + "/questions",
        "GET",
      );
      if (!Array.isArray(items) || !items.length) {
        examQuestionsBody.innerHTML =
          '<tr><td colspan="6" class="muted">Belum ada soal di ujian ini.</td></tr>';
        return;
      }
      examQuestionsBody.innerHTML = "";
      items.forEach(function (it) {
        const tr = document.createElement("tr");
        tr.innerHTML = [
          "<td>" + escapeHtml(String(it.seq_no || "")) + "</td>",
          "<td>" + escapeHtml(String(it.question_id || "")) + "</td>",
          "<td>" + escapeHtml(shortQuestionType(it.question_type)) + "</td>",
          "<td>" + escapeHtml(cleanStemPreview(it.stem_preview)) + "</td>",
          "<td>" + escapeHtml(String(it.weight || 1)) + "</td>",
          '<td><button class="icon-only-btn danger" type="button" data-exam-question-del="' +
            escapeHtml(String(it.question_id || "")) +
            '" title="Hapus dari ujian" aria-label="Hapus dari ujian">' +
            '<svg viewBox="0 0 24 24" focusable="false"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>' +
            "</button></td>",
        ].join("");
        examQuestionsBody.appendChild(tr);
      });
    }

    async function loadExamAssignments(examID) {
      if (!examAssignmentsBody) return;
      if (!examID || examID <= 0) {
        examAssignmentsBody.innerHTML =
          '<tr><td colspan="6" class="muted">Isi Exam ID lalu muat peserta ujian.</td></tr>';
        return;
      }
      const items = await api(
        "/api/v1/admin/exams/" + Number(examID) + "/assignments",
        "GET",
      );
      if (!Array.isArray(items) || !items.length) {
        examAssignmentsBody.innerHTML =
          '<tr><td colspan="6" class="muted">Belum ada peserta terdaftar.</td></tr>';
        return;
      }
      examAssignmentsBody.innerHTML = "";
      items.forEach(function (it) {
        const tr = document.createElement("tr");
        tr.innerHTML = [
          "<td>" + escapeHtml(String(it.user_id || "")) + "</td>",
          "<td>" + escapeHtml(String(it.full_name || "-")) + "</td>",
          "<td>" + escapeHtml(String(it.username || "-")) + "</td>",
          "<td>" + escapeHtml(String(it.role || "-")) + "</td>",
          "<td>" + escapeHtml(String(it.status || "-")) + "</td>",
          "<td>" + escapeHtml(fmtDate(it.assigned_at)) + "</td>",
        ].join("");
        examAssignmentsBody.appendChild(tr);
      });
    }

    async function loadPendingRegistrations() {
      const out = await api(
        "/api/v1/admin/registrations?status=pending&limit=200&offset=0",
        "GET",
      );
      const items = Array.isArray(out.items) ? out.items : [];
      if (statPending) statPending.textContent = String(items.length);
      if (!regBody) return items;
      if (!items.length) {
        regBody.innerHTML =
          '<tr><td colspan="6" class="muted">Tidak ada pendaftaran pending.</td></tr>';
        return items;
      }
      regBody.innerHTML = "";
      items.forEach(function (it) {
        const tr = document.createElement("tr");
        tr.innerHTML = [
          "<td>" + escapeHtml(String(it.id || "")) + "</td>",
          "<td>" + escapeHtml(String(it.full_name || "")) + "</td>",
          "<td>" + escapeHtml(String(it.email || "")) + "</td>",
          "<td>" + escapeHtml(String(it.role_requested || "")) + "</td>",
          "<td>" + escapeHtml(fmtDate(it.created_at)) + "</td>",
          '<td><span class="action-icons">' +
            '<button class="icon-only-btn" type="button" data-action="approve" data-id="' +
            escapeHtml(String(it.id || "")) +
            '" title="Setujui" aria-label="Setujui">' +
            '<svg viewBox="0 0 24 24" focusable="false"><path d="M5 13l4 4L19 7"/></svg>' +
            "</button>" +
            '<button class="icon-only-btn danger" type="button" data-action="reject" data-id="' +
            escapeHtml(String(it.id || "")) +
            '" title="Tolak" aria-label="Tolak">' +
            '<svg viewBox="0 0 24 24" focusable="false"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
            "</button>" +
            "</span></td>",
        ].join("");
        regBody.appendChild(tr);
      });
      return items;
    }

    async function loadProktorStatsAndPending() {
      const [stats] = await Promise.all([
        api("/api/v1/admin/dashboard/stats", "GET"),
        loadPendingRegistrations(),
      ]);
      const totalUsers =
        Number(stats.admin_count || 0) +
        Number(stats.proktor_count || 0) +
        Number(stats.guru_count || 0) +
        Number(stats.siswa_count || 0);
      if (statUsers) statUsers.textContent = String(totalUsers);
      if (statSchools)
        statSchools.textContent = String(stats.school_count || 0);
    }

    async function loadMasterReadonly() {
      const [levels, schools, classes] = await Promise.all([
        api("/api/v1/levels?all=1", "GET"),
        api("/api/v1/admin/schools?all=1", "GET"),
        api("/api/v1/admin/classes?all=1", "GET"),
      ]);
      const levelItems = Array.isArray(levels) ? levels : [];
      const schoolItems = Array.isArray(schools) ? schools : [];
      const classItems = Array.isArray(classes) ? classes : [];
      const schoolByID = {};
      schoolItems.forEach(function (it) {
        schoolByID[String(it.id || "")] = it;
      });

      if (levelsBody) {
        if (!levelItems.length) {
          levelsBody.innerHTML =
            '<tr><td colspan="3" class="muted">Tidak ada data jenjang.</td></tr>';
        } else {
          levelsBody.innerHTML = "";
          levelItems.forEach(function (it) {
            const tr = document.createElement("tr");
            tr.innerHTML = [
              "<td>" + escapeHtml(String(it.id || "")) + "</td>",
              "<td>" + escapeHtml(String(it.name || "")) + "</td>",
              "<td>" + (it.is_active ? "aktif" : "nonaktif") + "</td>",
            ].join("");
            levelsBody.appendChild(tr);
          });
        }
      }

      if (schoolsBody) {
        if (!schoolItems.length) {
          schoolsBody.innerHTML =
            '<tr><td colspan="4" class="muted">Tidak ada data sekolah.</td></tr>';
        } else {
          schoolsBody.innerHTML = "";
          schoolItems.forEach(function (it) {
            const tr = document.createElement("tr");
            tr.innerHTML = [
              "<td>" + escapeHtml(String(it.id || "")) + "</td>",
              "<td>" + escapeHtml(String(it.name || "")) + "</td>",
              "<td>" + escapeHtml(String(it.code || "-")) + "</td>",
              "<td>" + escapeHtml(String(it.address || "-")) + "</td>",
            ].join("");
            schoolsBody.appendChild(tr);
          });
        }
      }

      if (classesBody) {
        if (!classItems.length) {
          classesBody.innerHTML =
            '<tr><td colspan="4" class="muted">Tidak ada data kelas.</td></tr>';
        } else {
          classesBody.innerHTML = "";
          classItems.forEach(function (it) {
            const school = schoolByID[String(it.school_id || "")] || {};
            const schoolText = localSchoolLabel(school);
            const tr = document.createElement("tr");
            tr.innerHTML = [
              "<td>" + escapeHtml(String(it.id || "")) + "</td>",
              "<td>" + escapeHtml(String(schoolText || "-")) + "</td>",
              "<td>" + escapeHtml(String(it.grade_level || "")) + "</td>",
              "<td>" + escapeHtml(String(it.name || "")) + "</td>",
            ].join("");
            classesBody.appendChild(tr);
          });
        }
      }
    }

    try {
      if (String((user && user.role) || "") === "proktor") {
        if (examQuestionForm) examQuestionForm.hidden = true;
        if (examQuestionsLoadBtn) examQuestionsLoadBtn.hidden = true;
      }
      await loadProktorStatsAndPending();
      await loadMasterReadonly();
      await loadPlacementOptions();
      await loadTokenExamOptions();
      await loadExamSubjectOptions();
      await loadExamManageTable();
      const firstMenu =
        (menuButtons &&
          menuButtons.length > 0 &&
          menuButtons[0].getAttribute("data-proktor-menu")) ||
        "dashboard";
      activateProktorMenu(firstMenu);
      setMsg("Dashboard proktor siap.");
    } catch (err) {
      setMsg("Gagal memuat dashboard proktor: " + err.message);
    }

    menuButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        activateProktorMenu(btn.getAttribute("data-proktor-menu") || "");
      });
    });
    root.querySelectorAll("[data-proktor-jump]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        activateProktorMenu(
          btn.getAttribute("data-proktor-jump") || "dashboard",
        );
      });
    });

    if (regRefreshBtn) {
      regRefreshBtn.addEventListener("click", async function () {
        const done = beginBusy(
          regRefreshBtn,
          msg,
          "Memuat pendaftaran pending...",
        );
        try {
          await loadPendingRegistrations();
          setMsg("Data pendaftaran pending berhasil dimuat.");
        } catch (err) {
          setMsg("Gagal memuat pendaftaran pending: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (regBody) {
      regBody.addEventListener("click", async function (e) {
        const btn =
          e.target && e.target.closest("button[data-action][data-id]");
        if (!btn) return;
        const action = String(btn.getAttribute("data-action") || "");
        const id = Number(btn.getAttribute("data-id") || 0);
        if (!id) return;

        const done = beginBusy(btn, msg, "Memproses pendaftaran...");
        try {
          if (action === "approve") {
            await api(
              "/api/v1/admin/registrations/" + id + "/approve",
              "POST",
              {},
            );
            setMsg("Pendaftaran berhasil disetujui.");
          } else if (action === "reject") {
            const note = window.prompt("Alasan penolakan (opsional):", "");
            if (note === null) return;
            await api("/api/v1/admin/registrations/" + id + "/reject", "POST", {
              note: String(note || "").trim(),
            });
            setMsg("Pendaftaran berhasil ditolak.");
          }
          await loadPendingRegistrations();
        } catch (err) {
          setMsg("Gagal memproses pendaftaran: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (eventsForm) {
      eventsForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(eventsForm);
        const attemptID = Number(fd.get("attempt_id") || 0);
        const limit = Number(fd.get("limit") || 100);
        if (attemptID <= 0) {
          setMsg("Attempt ID tidak valid.");
          return;
        }
        const done = beginBusy(eventsForm, msg, "Memuat event ujian...");
        try {
          const items = await api(
            "/api/v1/attempts/" +
              attemptID +
              "/events?limit=" +
              encodeURIComponent(String(limit)),
            "GET",
          );
          if (!eventsBody) return;
          if (!Array.isArray(items) || !items.length) {
            eventsBody.innerHTML =
              '<tr><td colspan="4" class="muted">Tidak ada event untuk attempt ini.</td></tr>';
            setMsg("Data event kosong.");
            return;
          }
          eventsBody.innerHTML = "";
          items.forEach(function (it) {
            const tr = document.createElement("tr");
            tr.innerHTML = [
              "<td>" + escapeHtml(fmtDate(it.server_ts)) + "</td>",
              "<td>" + escapeHtml(String(it.event_type || "")) + "</td>",
              "<td>" + escapeHtml(String(it.actor_user_id || "-")) + "</td>",
              "<td><code>" +
                escapeHtml(String(it.payload || "{}")) +
                "</code></td>",
            ].join("");
            eventsBody.appendChild(tr);
          });
          setMsg("Event ujian berhasil dimuat.");
        } catch (err) {
          if (eventsBody) {
            eventsBody.innerHTML =
              '<tr><td colspan="4" class="muted">Gagal memuat event.</td></tr>';
          }
          setMsg("Gagal memuat event: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (tokenForm) {
      tokenForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const examID = Number((tokenExamSelect && tokenExamSelect.value) || 0);
        const ttlMinutes = Number(
          (tokenTTLInput && tokenTTLInput.value) || 120,
        );
        if (examID <= 0) {
          setMsg("Pilih ujian terlebih dahulu.");
          return;
        }
        const done = beginBusy(tokenForm, msg, "Membuat token ujian...");
        try {
          const out = await api(
            "/api/v1/admin/exams/" + examID + "/token",
            "POST",
            { ttl_minutes: ttlMinutes },
          );
          const expiresAt =
            out && out.expires_at ? fmtDate(out.expires_at) : "-";
          setTokenResult(
            "Token: " +
              String((out && out.token) || "-") +
              " | Berlaku sampai: " +
              expiresAt,
          );
          setMsg("Token ujian berhasil dibuat.");
        } catch (err) {
          setMsg("Gagal membuat token ujian: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (examsRefreshBtn) {
      examsRefreshBtn.addEventListener("click", async function () {
        const done = beginBusy(examsRefreshBtn, msg, "Memuat data ujian...");
        try {
          await Promise.all([loadExamManageTable(), loadTokenExamOptions()]);
          setMsg("Data ujian berhasil dimuat.");
        } catch (err) {
          setMsg("Gagal memuat data ujian: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (examForm) {
      examForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        if (examFormSubmitting) {
          setMsg("Penyimpanan ujian sedang diproses. Mohon tunggu...");
          return;
        }
        const fd = new FormData(examForm);
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
          setMsg("Gagal memvalidasi status ujian berjalan: " + err.message);
          return;
        }
        const payload = {
          code: String(fd.get("code") || "").trim(),
          title: String(fd.get("title") || "").trim(),
          subject_id: Number(fd.get("subject_id") || 0),
          duration_minutes: Number(fd.get("duration_minutes") || 90),
          max_attempts: Number(fd.get("max_attempts") || 1),
          review_policy: String(fd.get("review_policy") || "score_only"),
          randomize_questions: nextRandomizeQuestions,
          randomize_options: nextRandomizeOptions,
          is_active: true,
        };
        examFormSubmitting = true;
        const done = beginBusy(examForm, msg, "Menyimpan ujian...");
        let saved = null;
        try {
          if (examID > 0) {
            saved = await api("/api/v1/admin/exams/" + examID, "PUT", payload);
          } else {
            saved = await api("/api/v1/admin/exams", "POST", payload);
          }

          const savedID = saved && saved.id ? String(saved.id) : "-";
          const savedCode = saved && saved.code ? String(saved.code) : "-";
          setMsg(
            "Ujian berhasil disimpan. ID: " + savedID + " | Kode: " + savedCode,
          );

          examForm.reset();
          const examIDInput = examForm.elements.namedItem("exam_id");
          if (examIDInput) examIDInput.value = "";
          try {
            await Promise.all([loadExamManageTable(), loadTokenExamOptions()]);
          } catch (refreshErr) {
            setMsg(
              "Ujian sudah tersimpan, tetapi gagal memuat ulang tabel: " +
                refreshErr.message,
            );
          }
        } catch (err) {
          setMsg("Gagal menyimpan ujian: " + err.message);
        } finally {
          done();
          window.setTimeout(function () {
            examFormSubmitting = false;
          }, 700);
        }
      });
    }

    if (examRandomizeQuestionsInput) {
      examRandomizeQuestionsInput.addEventListener("change", async function () {
        const nextQ = !!examRandomizeQuestionsInput.checked;
        const nextO = !!(
          examRandomizeOptionsInput && examRandomizeOptionsInput.checked
        );
        try {
          await preventRandomizeChangeIfExamRunning(nextQ, nextO);
        } catch (err) {
          setMsg("Gagal memvalidasi status ujian berjalan: " + err.message);
        }
      });
    }

    if (examRandomizeOptionsInput) {
      examRandomizeOptionsInput.addEventListener("change", async function () {
        const nextQ = !!(
          examRandomizeQuestionsInput && examRandomizeQuestionsInput.checked
        );
        const nextO = !!examRandomizeOptionsInput.checked;
        try {
          await preventRandomizeChangeIfExamRunning(nextQ, nextO);
        } catch (err) {
          setMsg("Gagal memvalidasi status ujian berjalan: " + err.message);
        }
      });
    }

    if (examsBody) {
      examsBody.addEventListener("click", async function (e) {
        const useBtn =
          e.target && e.target.closest("button[data-exam-action][data-id]");
        if (!useBtn) return;
        const examID = Number(useBtn.getAttribute("data-id") || 0);
        const action = String(useBtn.getAttribute("data-exam-action") || "");
        if (examID <= 0) return;
        if (action === "use") {
          if (assignExamIDInput) assignExamIDInput.value = String(examID);
          if (questionExamIDInput) questionExamIDInput.value = String(examID);
          try {
            await Promise.all([
              loadExamQuestions(examID),
              loadExamAssignments(examID),
            ]);
            setMsg("Exam ID " + examID + " dipilih untuk enroll dan naskah.");
          } catch (err) {
            setMsg("Gagal memuat data ujian: " + err.message);
          }
          return;
        }
        if (action === "delete") {
          if (!window.confirm("Nonaktifkan ujian ini?")) return;
          const done = beginBusy(useBtn, msg, "Menonaktifkan ujian...");
          try {
            await api("/api/v1/admin/exams/" + examID, "DELETE");
            await Promise.all([loadExamManageTable(), loadTokenExamOptions()]);
            setMsg("Ujian berhasil dinonaktifkan.");
          } catch (err) {
            setMsg("Gagal menonaktifkan ujian: " + err.message);
          } finally {
            done();
          }
        }
      });
    }

    if (examAssignForm) {
      examAssignForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const examID = Number(
          (assignExamIDInput && assignExamIDInput.value) || 0,
        );
        if (examID <= 0) {
          setMsg("Isi Exam ID untuk enroll peserta.");
          return;
        }
        const schoolID = Number(
          (assignSchoolSelect && assignSchoolSelect.value) || 0,
        );
        const classID = Number(
          (assignClassSelect && assignClassSelect.value) || 0,
        );
        if (schoolID <= 0 || classID <= 0) {
          setMsg("Pilih sekolah dan kelas untuk enroll peserta.");
          return;
        }
        const done = beginBusy(
          examAssignForm,
          msg,
          "Menyimpan enroll peserta...",
        );
        try {
          const items = await api(
            "/api/v1/admin/exams/" + examID + "/assignments/by-class",
            "PUT",
            { school_id: schoolID, class_id: classID },
          );
          setMsg(
            "Enroll peserta berhasil disimpan. Total peserta aktif: " +
              String((Array.isArray(items) && items.length) || 0),
          );
          await Promise.all([
            loadExamManageTable(),
            loadExamAssignments(examID),
          ]);
        } catch (err) {
          setMsg("Gagal menyimpan enroll peserta: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (examAssignmentsLoadBtn) {
      examAssignmentsLoadBtn.addEventListener("click", async function () {
        const examID = Number(
          (assignExamIDInput && assignExamIDInput.value) || 0,
        );
        const done = beginBusy(
          examAssignmentsLoadBtn,
          msg,
          "Memuat peserta ujian...",
        );
        try {
          await loadExamAssignments(examID);
          setMsg("Peserta ujian berhasil dimuat.");
        } catch (err) {
          setMsg("Gagal memuat peserta ujian: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (assignSchoolSelect) {
      assignSchoolSelect.addEventListener("change", function () {
        fillAssignClassSelectBySchool(assignSchoolSelect.value);
      });
    }

    if (examQuestionForm) {
      examQuestionForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(examQuestionForm);
        const examID = Number(fd.get("exam_id") || 0);
        if (examID <= 0) {
          setMsg("Isi Exam ID untuk menambah naskah.");
          return;
        }
        const payload = {
          question_id: Number(fd.get("question_id") || 0),
          seq_no: Number(fd.get("seq_no") || 0),
          weight: Number(fd.get("weight") || 1),
        };
        const done = beginBusy(
          examQuestionForm,
          msg,
          "Menyimpan naskah ke ujian...",
        );
        try {
          await api(
            "/api/v1/admin/exams/" + examID + "/questions",
            "POST",
            payload,
          );
          await Promise.all([loadExamQuestions(examID), loadExamManageTable()]);
          setMsg("Naskah berhasil dimasukkan ke ujian.");
        } catch (err) {
          setMsg("Gagal menyimpan naskah ke ujian: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (examQuestionsLoadBtn) {
      examQuestionsLoadBtn.addEventListener("click", async function () {
        const examID = Number(
          (questionExamIDInput && questionExamIDInput.value) || 0,
        );
        const done = beginBusy(
          examQuestionsLoadBtn,
          msg,
          "Memuat soal ujian...",
        );
        try {
          await loadExamQuestions(examID);
          setMsg("Soal ujian berhasil dimuat.");
        } catch (err) {
          setMsg("Gagal memuat soal ujian: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (examQuestionsBody) {
      examQuestionsBody.addEventListener("click", async function (e) {
        const btn =
          e.target && e.target.closest("button[data-exam-question-del]");
        if (!btn) return;
        const examID = Number(
          (questionExamIDInput && questionExamIDInput.value) || 0,
        );
        const questionID = Number(
          btn.getAttribute("data-exam-question-del") || 0,
        );
        if (examID <= 0 || questionID <= 0) return;
        if (!window.confirm("Hapus soal ini dari ujian?")) return;
        const done = beginBusy(btn, msg, "Menghapus soal dari ujian...");
        try {
          await api(
            "/api/v1/admin/exams/" + examID + "/questions/" + questionID,
            "DELETE",
            {},
          );
          await Promise.all([loadExamQuestions(examID), loadExamManageTable()]);
          setMsg("Soal berhasil dihapus dari ujian.");
        } catch (err) {
          setMsg("Gagal menghapus soal dari ujian: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (masterRefreshBtn) {
      masterRefreshBtn.addEventListener("click", async function () {
        const done = beginBusy(
          masterRefreshBtn,
          msg,
          "Memuat data master proktor...",
        );
        try {
          await loadMasterReadonly();
          await loadPlacementOptions();
          setMsg("Data master proktor berhasil dimuat.");
        } catch (err) {
          setMsg("Gagal memuat data master proktor: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (placementSchoolSelect) {
      placementSchoolSelect.addEventListener("change", function () {
        fillPlacementClassSelectBySchool(placementSchoolSelect.value, 0);
      });
    }

    if (placementUserSelect) {
      placementUserSelect.addEventListener("change", function () {
        const opt =
          placementUserSelect.options[placementUserSelect.selectedIndex] ||
          null;
        const schoolID = Number(
          (opt && opt.getAttribute("data-school-id")) || 0,
        );
        const classID = Number((opt && opt.getAttribute("data-class-id")) || 0);
        if (schoolID > 0) {
          fillPlacementSchoolSelect(schoolID);
          fillPlacementClassSelectBySchool(schoolID, classID);
          return;
        }
        fillPlacementSchoolSelect(0);
        resetPlacementClassSelect("Pilih sekolah dulu");
      });
    }

    if (placementForm) {
      placementForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const userID = Number(
          (placementUserSelect && placementUserSelect.value) || 0,
        );
        const schoolID = Number(
          (placementSchoolSelect && placementSchoolSelect.value) || 0,
        );
        const classID = Number(
          (placementClassSelect && placementClassSelect.value) || 0,
        );
        if (userID <= 0 || schoolID <= 0 || classID <= 0) {
          setMsg("Pilih pengguna, sekolah, dan kelas terlebih dahulu.");
          return;
        }
        const done = beginBusy(
          placementForm,
          msg,
          "Menyimpan penempatan kelas...",
        );
        try {
          const out = await api(
            "/api/v1/admin/users/" + userID + "/class-placement",
            "PUT",
            { school_id: schoolID, class_id: classID },
          );
          const userLabel = String(
            (out && out.full_name) || (out && out.username) || userID,
          );
          const classLabel = String((out && out.class_name) || classID);
          setMsg(
            "Penempatan berhasil: " + userLabel + " -> " + classLabel + ".",
          );
          await loadPlacementOptions();
        } catch (err) {
          setMsg("Gagal menyimpan penempatan kelas: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (resultsRefreshBtn) {
      resultsRefreshBtn.addEventListener("click", async function () {
        const done = beginBusy(
          resultsRefreshBtn,
          msg,
          "Memuat daftar ujian...",
        );
        try {
          await loadExamManageTable();
          setMsg("Daftar ujian berhasil dimuat.");
        } catch (err) {
          setMsg("Gagal memuat daftar ujian: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (resultsAttemptForm) {
      resultsAttemptForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(resultsAttemptForm);
        const attemptID = Number(fd.get("attempt_id") || 0);
        if (attemptID <= 0) {
          setMsg("Attempt ID tidak valid.");
          return;
        }
        const done = beginBusy(
          resultsAttemptForm,
          msg,
          "Memuat nilai attempt...",
        );
        try {
          const out = await api(
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
          setMsg("Nilai attempt berhasil dimuat.");
        } catch (err) {
          setMsg("Gagal memuat nilai: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (resultsResetAttemptForm) {
      resultsResetAttemptForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(resultsResetAttemptForm);
        const examID = Number(fd.get("exam_id") || 0);
        const studentID = Number(fd.get("student_id") || 0);
        if (examID <= 0 || studentID <= 0) {
          setMsg("Exam ID dan Student ID wajib valid.");
          return;
        }
        const ok = window.confirm(
          "Reset attempt terbaru untuk peserta ini pada ujian terpilih?",
        );
        if (!ok) return;
        const done = beginBusy(
          resultsResetAttemptForm,
          msg,
          "Mereset attempt peserta...",
        );
        try {
          const out = await api(
            "/api/v1/admin/exams/" + examID + "/attempts/reset",
            "POST",
            { student_id: studentID },
          );
          setMsg(
            "Reset attempt berhasil. Attempt ID: " +
              String((out && out.attempt_id) || "-"),
          );
          latestResultData = null;
          setResultsSummary("Belum ada data nilai.");
          setResultsExtra(
            "Muat ulang nilai jika peserta sudah memulai attempt baru.",
          );
        } catch (err) {
          setMsg("Reset attempt gagal: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (resultsReportBtn) {
      resultsReportBtn.addEventListener("click", function () {
        summarizeAttemptResult("report");
      });
    }
    if (resultsStatsBtn) {
      resultsStatsBtn.addEventListener("click", function () {
        summarizeAttemptResult("stats");
      });
    }
    if (resultsChartBtn) {
      resultsChartBtn.addEventListener("click", function () {
        summarizeAttemptResult("chart");
      });
    }
  }

  async function initGuruPage() {
    const root = document.querySelector('[data-page="guru_content"]');
    if (!root) return;

    const user = await meOrNull();
    if (!user) {
      window.location.href = "/login";
      return;
    }
    if (!["admin", "guru"].includes(String(user.role || ""))) {
      alert("Halaman guru hanya untuk admin/guru");
      window.location.href = "/";
      return;
    }
    const canManageSubjects = String(user.role || "") === "guru";

    const msg = document.getElementById("guru-message");
    const statSubjects = document.getElementById("guru-stat-subjects");
    const statLevels = document.getElementById("guru-stat-levels");
    const subjectRefreshBtn = document.getElementById(
      "guru-subjects-refresh-btn",
    );
    const subjectAddBtn = document.getElementById("guru-subjects-add-btn");
    const subjectsBody = document.getElementById("guru-subjects-body");
    const subjectDialog = document.getElementById("guru-subject-dialog");
    const subjectDialogForm = document.getElementById("guru-subject-form");
    const subjectLevelSelect = document.getElementById(
      "guru-subject-education-level",
    );
    const subjectDialogTitle = document.getElementById(
      "guru-subject-dialog-title",
    );
    const subjectCancelBtn = document.getElementById("guru-subject-cancel-btn");
    const subjectDeleteDialog = document.getElementById(
      "guru-subject-delete-dialog",
    );
    const subjectDeleteForm = document.getElementById(
      "guru-subject-delete-form",
    );
    const subjectDeleteLabel = document.getElementById(
      "guru-subject-delete-label",
    );
    const subjectDeleteCancelBtn = document.getElementById(
      "guru-subject-delete-cancel-btn",
    );
    const dashboardPanel = document.getElementById("guru-dashboard-panel");
    const reviewsPanel = document.getElementById("guru-reviews-panel");
    const learningGoalsPanel = document.getElementById(
      "guru-learning-goals-panel",
    );
    const blueprintsPanel = document.getElementById("guru-blueprints-panel");
    const manuscriptsPanel = document.getElementById("guru-manuscripts-panel");
    const subjectsPanel = document.getElementById("guru-subjects-panel");
    const examsPanel = document.getElementById("guru-exams-panel");
    const resultsPanel = document.getElementById("guru-results-panel");
    const menuButtons = root.querySelectorAll("[data-guru-menu]");
    const guruPageTitle = document.getElementById("guru-page-title");
    const guruPageDesc = document.getElementById("guru-page-desc");

    const blueprintForm = document.getElementById("guru-blueprint-form");
    const blueprintRefreshBtn = document.getElementById(
      "guru-blueprint-refresh-btn",
    );
    const blueprintFilterForm = document.getElementById(
      "guru-blueprint-filter-form",
    );
    const blueprintBody = document.getElementById("guru-blueprint-body");
    const blueprintSubjectSelect = document.getElementById(
      "guru-blueprint-subject-select",
    );
    const blueprintFilterSubject = document.getElementById(
      "guru-blueprint-filter-subject",
    );
    const learningGoalForm = document.getElementById("guru-learning-goal-form");
    const learningGoalRefreshBtn = document.getElementById(
      "guru-learning-goals-refresh-btn",
    );
    const learningGoalSearchInput = document.getElementById(
      "guru-learning-goals-search",
    );
    const learningGoalPageSizeSelect = document.getElementById(
      "guru-learning-goals-page-size",
    );
    const learningGoalPrevBtn = document.getElementById(
      "guru-learning-goals-prev-btn",
    );
    const learningGoalNextBtn = document.getElementById(
      "guru-learning-goals-next-btn",
    );
    const learningGoalPageInfo = document.getElementById(
      "guru-learning-goals-page-info",
    );
    const learningGoalTemplateBtn = document.getElementById(
      "guru-learning-goals-template-btn",
    );
    const learningGoalImportBtn = document.getElementById(
      "guru-learning-goals-import-btn",
    );
    const learningGoalImportDialog = document.getElementById(
      "guru-learning-goals-import-dialog",
    );
    const learningGoalImportForm = document.getElementById(
      "guru-learning-goals-import-form",
    );
    const learningGoalImportFile = document.getElementById(
      "guru-learning-goals-import-file",
    );
    const learningGoalImportOutput = document.getElementById(
      "guru-learning-goals-import-output",
    );
    const learningGoalImportCloseBtn = document.getElementById(
      "guru-learning-goals-import-close-btn",
    );
    const learningGoalImportCancelBtn = document.getElementById(
      "guru-learning-goals-import-cancel-btn",
    );
    const learningGoalBody = document.getElementById("guru-learning-goal-body");
    const learningGoalMapelInput = document.getElementById(
      "guru-learning-goal-mapel",
    );
    const learningGoalKelasInput = document.getElementById(
      "guru-learning-goal-kelas",
    );
    const learningGoalSubmitBtn = document.getElementById(
      "guru-learning-goal-submit-btn",
    );
    const learningGoalCancelEditBtn = document.getElementById(
      "guru-learning-goal-cancel-edit-btn",
    );
    const learningGoalViewDialog = document.getElementById(
      "guru-learning-goal-view-dialog",
    );
    const learningGoalViewTitle = document.getElementById(
      "guru-learning-goal-view-title",
    );
    const learningGoalViewContent = document.getElementById(
      "guru-learning-goal-view-content",
    );

    const manuscriptForm = document.getElementById("guru-manuscript-form");
    const manuscriptImportBtn = document.getElementById(
      "guru-manuscript-import-btn",
    );
    const questionOwnerScopeSelect = document.getElementById(
      "guru-question-owner-scope",
    );
    const manuscriptImportDialog = document.getElementById(
      "guru-manuscript-import-dialog",
    );
    const manuscriptImportForm = document.getElementById(
      "guru-manuscript-import-form",
    );
    const manuscriptImportSubjectSelect = document.getElementById(
      "guru-manuscript-import-subject-select",
    );
    const manuscriptImportFileInput = document.getElementById(
      "guru-manuscript-import-file",
    );
    const manuscriptImportOutput = document.getElementById(
      "guru-manuscript-import-output",
    );
    const manuscriptImportCancelBtn = document.getElementById(
      "guru-manuscript-import-cancel-btn",
    );
    const manuscriptRefreshBtn = document.getElementById(
      "guru-manuscript-refresh-btn",
    );
    const manuscriptBody = document.getElementById("guru-manuscript-body");
    const manuscriptSelectAll = document.getElementById(
      "guru-manuscript-select-all",
    );
    const manuscriptBulkDeleteBtn = document.getElementById(
      "guru-manuscript-bulk-delete-btn",
    );
    const manuscriptDeleteAllBtn = document.getElementById(
      "guru-manuscript-delete-all-btn",
    );
    const manuscriptPageSizeSelect = document.getElementById(
      "guru-manuscript-page-size",
    );
    const manuscriptPrevBtn = document.getElementById(
      "guru-manuscript-prev-btn",
    );
    const manuscriptNextBtn = document.getElementById(
      "guru-manuscript-next-btn",
    );
    const manuscriptPageInfo = document.getElementById(
      "guru-manuscript-page-info",
    );
    const manuscriptMessage = document.getElementById(
      "guru-manuscript-message",
    );
    const manuscriptQuestionSelect = document.getElementById(
      "guru-manuscript-question-select",
    );
    const manuscriptQuestionCodeSelect = document.getElementById(
      "guru-manuscript-question-code-select",
    );
    const manuscriptSubjectSelect = document.getElementById(
      "guru-manuscript-subject-select",
    );
    const manuscriptLearningGoalSelect = document.getElementById(
      "guru-manuscript-learning-goal-select",
    );
    const manuscriptQuestionTypeUI = document.getElementById(
      "guru-manuscript-question-type-ui",
    );
    const manuscriptStimulusEditor = document.getElementById(
      "guru-manuscript-stimulus-editor",
    );
    const manuscriptStemEditor = document.getElementById(
      "guru-manuscript-stem-editor",
    );
    const manuscriptStimulusHTMLInput = document.getElementById(
      "guru-manuscript-stimulus-html",
    );
    const manuscriptStemHTMLInput = document.getElementById(
      "guru-manuscript-stem-html",
    );
    const manuscriptExplanationEditor = document.getElementById(
      "guru-manuscript-explanation-editor",
    );
    const manuscriptExplanationHTMLInput = document.getElementById(
      "guru-manuscript-explanation-html",
    );
    const manuscriptHintEditor = document.getElementById(
      "guru-manuscript-hint-editor",
    );
    const manuscriptHintHTMLInput = document.getElementById(
      "guru-manuscript-hint-html",
    );
    const manuscriptOptionsPanel = document.getElementById(
      "guru-manuscript-options-panel",
    );
    const manuscriptOptionsWrap = document.getElementById(
      "guru-manuscript-options",
    );
    const manuscriptAddOptionBtn = document.getElementById(
      "guru-manuscript-add-option-btn",
    );
    const manuscriptKeyMC = document.getElementById("guru-manuscript-key-mc");
    const manuscriptKeyMR = document.getElementById("guru-manuscript-key-mr");
    const manuscriptKeyMCOptions = document.getElementById(
      "guru-manuscript-key-mc-options",
    );
    const manuscriptKeyMROptions = document.getElementById(
      "guru-manuscript-key-mr-options",
    );
    const manuscriptKeyTF = document.getElementById("guru-manuscript-key-tf");
    const manuscriptStatementsWrap = document.getElementById(
      "guru-manuscript-statements",
    );
    const manuscriptAddStatementBtn = document.getElementById(
      "guru-manuscript-add-statement-btn",
    );
    const manuscriptAnswerKeyRaw = document.getElementById(
      "guru-manuscript-answer-key-raw",
    );
    const manuscriptEditingVersionNoInput = document.getElementById(
      "guru-manuscript-editing-version-no",
    );
    const manuscriptSubmitBtn = document.getElementById(
      "guru-manuscript-submit-btn",
    );
    const manuscriptCancelEditBtn = document.getElementById(
      "guru-manuscript-cancel-edit-btn",
    );
    const manuscriptPreviewDialog = document.getElementById(
      "guru-manuscript-preview-dialog",
    );
    const manuscriptPreviewTitle = document.getElementById(
      "guru-manuscript-preview-title",
    );
    const manuscriptPreviewContent = document.getElementById(
      "guru-manuscript-preview-content",
    );
    const questionCodeForm = document.getElementById("guru-question-code-form");
    const questionCodeRefreshBtn = document.getElementById(
      "guru-question-code-refresh-btn",
    );
    const questionCodeCancelBtn = document.getElementById(
      "guru-question-code-cancel-btn",
    );
    const questionCodeBody = document.getElementById("guru-question-code-body");
    const questionCodeSubjectSelect = document.getElementById(
      "guru-question-code-subject-select",
    );
    const examsRefreshBtn = document.getElementById("guru-exams-refresh-btn");
    const examForm = document.getElementById("guru-exam-form");
    const examRandomizeQuestionsInput =
      examForm && examForm.elements
        ? examForm.elements.namedItem("randomize_questions")
        : null;
    const examRandomizeOptionsInput =
      examForm && examForm.elements
        ? examForm.elements.namedItem("randomize_options")
        : null;
    const examSubjectSelect = document.getElementById("guru-exam-subject");
    const examsBody = document.getElementById("guru-exams-body");
    const examQuestionForm = document.getElementById("guru-exam-question-form");
    const questionExamIDInput = document.getElementById(
      "guru-question-exam-id",
    );
    const examQuestionsLoadBtn = document.getElementById(
      "guru-exam-questions-load-btn",
    );
    const examQuestionsBody = document.getElementById(
      "guru-exam-questions-body",
    );
    const examQuestionCodeRuleForm = document.getElementById(
      "guru-exam-question-code-rule-form",
    );
    const examQuestionCodeRuleExamIDInput = document.getElementById(
      "guru-question-code-rule-exam-id",
    );
    const examQuestionCodeSelect = document.getElementById(
      "guru-exam-question-code-select",
    );
    const examQuestionCodeRuleBody = document.getElementById(
      "guru-exam-question-code-rule-body",
    );
    const examQuestionCodeSyncBtn = document.getElementById(
      "guru-exam-question-code-sync-btn",
    );
    const resultsRefreshBtn = document.getElementById(
      "guru-results-refresh-btn",
    );
    const resultsAssignmentForm = document.getElementById(
      "guru-results-assignment-form",
    );
    const resultsExamSelect = document.getElementById(
      "guru-results-exam-select",
    );
    const resultsAssignmentBody = document.getElementById(
      "guru-results-assignment-body",
    );
    const resultsMatrixHead = document.getElementById(
      "guru-results-matrix-head",
    );
    const resultsSummary = document.getElementById("guru-results-summary");
    const resultsExtra = document.getElementById("guru-results-extra");
    const resultsReportBtn = document.getElementById("guru-results-report-btn");
    const resultsStatsBtn = document.getElementById("guru-results-stats-btn");
    const resultsChartBtn = document.getElementById("guru-results-chart-btn");
    const resultsExportBtn = document.getElementById("guru-results-export-btn");

    let subjectsCache = [];
    let learningGoalsCache = [];
    let blueprintsCache = [];
    let examsManageCache = [];
    let questionCodesCache = [];
    const tabQuillByWrap = new WeakMap();
    let manuscriptStimulusQuill = null;
    let manuscriptStemQuill = null;
    let manuscriptExplanationQuill = null;
    let manuscriptHintQuill = null;
    const manuscriptOptionQuillByRow = new WeakMap();
    let currentManuscriptQuestionType = "";
    let manuscriptVersionsCache = [];
    let manuscriptAllItems = [];
    let manuscriptPage = 1;
    let manuscriptPageSize = 15;
    let manuscriptEditingQuestionID = 0;
    let educationLevelsCache = [];
    let examFormSubmitting = false;
    let latestResultData = null;
    let latestResultsMatrix = null;
    let learningGoalEditingID = 0;
    let learningGoalPage = 1;
    let learningGoalPageSize = 10;
    let learningGoalSearch = "";
    let questionCodeEditingID = 0;
    let resultsAssignmentsCount = 0;

    const setMsg = function (value) {
      text(msg, value);
    };
    const setManuscriptMsg = function (value) {
      const message = String(value || "");
      if (manuscriptMessage) text(manuscriptMessage, message);
      setMsg(message);
    };
    const setResultsSummary = function (value) {
      text(resultsSummary, value);
      if (resultsSummary) resultsSummary.classList.remove("muted");
    };
    const setResultsExtra = function (value) {
      text(resultsExtra, value);
      if (resultsExtra) resultsExtra.classList.remove("muted");
    };
    const setResultsExtraHTML = function (value) {
      if (!resultsExtra) return;
      resultsExtra.innerHTML = String(value || "");
      resultsExtra.classList.remove("muted");
    };

    function buildResultsScoreChartHTML(rows, totalQuestions) {
      const list = (Array.isArray(rows) ? rows : [])
        .slice()
        .sort(function (a, b) {
          return (
            Number((a && a.skor_total) || 0) - Number((b && b.skor_total) || 0)
          );
        });
      if (!list.length) {
        return '<span class="muted">Belum ada data grafik.</span>';
      }
      const labels = list.map(function (r) {
        return (
          String((r && r.full_name) || "-") +
          " (" +
          String((r && r.attempt_ke) || 0) +
          ")"
        );
      });
      const nilaiList = list.map(function (r) {
        const score = Number((r && r.skor_total) || 0);
        if (totalQuestions <= 0) return 0;
        return (score / totalQuestions) * 100;
      });
      const maxScore = 100;
      const ticks = 5;
      const chartWidth = Math.max(560, labels.length * 66);
      const chartHeight = 340;
      const margin = { left: 54, right: 18, top: 16, bottom: 116 };
      const innerW = chartWidth - margin.left - margin.right;
      const innerH = chartHeight - margin.top - margin.bottom;
      const barW = Math.max(
        12,
        Math.floor(innerW / Math.max(1, labels.length * 1.7)),
      );
      const step = innerW / Math.max(1, labels.length);
      const elements = [];

      for (let i = 0; i <= ticks; i += 1) {
        const yVal = (maxScore / ticks) * i;
        const y = margin.top + innerH - (yVal / maxScore) * innerH;
        elements.push(
          '<line x1="' +
            margin.left +
            '" y1="' +
            y.toFixed(2) +
            '" x2="' +
            (margin.left + innerW) +
            '" y2="' +
            y.toFixed(2) +
            '" stroke="#d8e0ef" stroke-width="1" />',
        );
        elements.push(
          '<text x="' +
            (margin.left - 8) +
            '" y="' +
            (y + 4).toFixed(2) +
            '" text-anchor="end" font-size="11" fill="#6f7f99">' +
            Math.round(yVal) +
            "</text>",
        );
      }

      labels.forEach(function (label, idx) {
        const nilai = Number(nilaiList[idx] || 0);
        const barH = (nilai / maxScore) * innerH;
        const x = margin.left + step * idx + (step - barW) / 2;
        const y = margin.top + innerH - barH;
        elements.push(
          '<rect x="' +
            x.toFixed(2) +
            '" y="' +
            y.toFixed(2) +
            '" width="' +
            barW +
            '" height="' +
            Math.max(1, barH).toFixed(2) +
            '" rx="4" ry="4" fill="#3f53db"></rect>',
        );
        elements.push(
          '<text x="' +
            (x + barW / 2).toFixed(2) +
            '" y="' +
            (y - 6).toFixed(2) +
            '" text-anchor="middle" font-size="11" fill="#1e2d4a">' +
            String(nilai.toFixed(2)) +
            "</text>",
        );
        elements.push(
          '<text x="' +
            (x + barW / 2).toFixed(2) +
            '" y="' +
            (margin.top + innerH + 14).toFixed(2) +
            '" text-anchor="end" transform="rotate(-35 ' +
            (x + barW / 2).toFixed(2) +
            " " +
            (margin.top + innerH + 14).toFixed(2) +
            ')" font-size="11" fill="#4a5f83">' +
            escapeHtml(label) +
            "</text>",
        );
      });

      return [
        '<div class="guru-results-chart-wrap">',
        '<svg viewBox="0 0 ' +
          chartWidth +
          " " +
          chartHeight +
          '" class="guru-results-chart-svg" role="img" aria-label="Grafik nilai peserta">',
        '<line x1="' +
          margin.left +
          '" y1="' +
          (margin.top + innerH) +
          '" x2="' +
          (margin.left + innerW) +
          '" y2="' +
          (margin.top + innerH) +
          '" stroke="#778ba8" stroke-width="1.5" />',
        '<line x1="' +
          margin.left +
          '" y1="' +
          margin.top +
          '" x2="' +
          margin.left +
          '" y2="' +
          (margin.top + innerH) +
          '" stroke="#778ba8" stroke-width="1.5" />',
        elements.join(""),
        '<text x="' +
          (margin.left + innerW / 2).toFixed(2) +
          '" y="' +
          (chartHeight - 10) +
          '" text-anchor="middle" font-size="12" fill="#223b63">Sumbu X: Nama Peserta</text>',
        '<text x="14" y="' +
          (margin.top + innerH / 2).toFixed(2) +
          '" text-anchor="middle" transform="rotate(-90 14 ' +
          (margin.top + innerH / 2).toFixed(2) +
          ')" font-size="12" fill="#223b63">Sumbu Y: Nilai</text>',
        "</svg>",
        "</div>",
      ].join("");
    }

    function summarizeAttemptResult(mode) {
      const data = latestResultsMatrix;
      const rows = Array.isArray(data && data.rows) ? data.rows : [];
      const totalQuestions = Array.isArray(data && data.question_nos)
        ? data.question_nos.length
        : 0;
      if (!data || !rows.length) {
        setResultsExtra("Muat hasil ujian peserta terlebih dahulu.");
        return;
      }
      const totalAttempts = rows.length;
      const totalScore = rows.reduce(function (acc, it) {
        return acc + Number((it && it.skor_total) || 0);
      }, 0);
      const avgScore =
        totalAttempts > 0 ? (totalScore / totalAttempts).toFixed(2) : "0.00";
      if (mode === "report") {
        setResultsExtra(
          "Laporan: exam #" +
            String((data && data.exam_id) || "-") +
            ", peserta/attempt " +
            String(totalAttempts) +
            ", jumlah soal " +
            String(totalQuestions) +
            ", rerata skor " +
            String(avgScore) +
            ".",
        );
        return;
      }
      if (mode === "stats") {
        let maxScore = 0;
        let minScore = 0;
        if (rows.length > 0) {
          maxScore = Number(rows[0].skor_total || 0);
          minScore = Number(rows[0].skor_total || 0);
          rows.forEach(function (r) {
            const s = Number((r && r.skor_total) || 0);
            maxScore = Math.max(maxScore, s);
            minScore = Math.min(minScore, s);
          });
        }
        setResultsExtra(
          "Statistik: total attempt " +
            String(totalAttempts) +
            ", rerata skor " +
            String(avgScore) +
            ", skor tertinggi " +
            String(maxScore) +
            ", skor terendah " +
            String(minScore) +
            ".",
        );
        return;
      }
      setResultsExtraHTML(buildResultsScoreChartHTML(rows, totalQuestions));
    }

    function renderResultsChart() {
      const data = latestResultsMatrix;
      const rows = Array.isArray(data && data.rows) ? data.rows : [];
      const totalQuestions = Array.isArray(data && data.question_nos)
        ? data.question_nos.length
        : 0;
      if (!rows.length) {
        setResultsExtra("Muat hasil ujian peserta terlebih dahulu.");
        setMsg("Grafik belum bisa ditampilkan: data hasil ujian belum dimuat.");
        return;
      }
      setResultsExtraHTML(buildResultsScoreChartHTML(rows, totalQuestions));
      setMsg("Grafik skor peserta berhasil ditampilkan.");
    }

    function isOwnerOnlyQuestionsEnabled() {
      const scope = String(
        (questionOwnerScopeSelect && questionOwnerScopeSelect.value) || "",
      )
        .trim()
        .toLowerCase();
      return scope === "mine";
    }

    async function loadEducationLevelsForGuruSubjectForm() {
      try {
        const out = await api("/api/v1/levels", "GET");
        educationLevelsCache = Array.isArray(out) ? out : [];
      } catch (_) {
        educationLevelsCache = [];
      }
    }

    function fillSubjectEducationLevelSelect(selectedValue) {
      if (!subjectLevelSelect) return;
      const selected = String(selectedValue || "").trim();
      subjectLevelSelect.innerHTML = '<option value="">Pilih Jenjang</option>';
      educationLevelsCache.forEach(function (it) {
        const name = String((it && it.name) || "").trim();
        if (!name) return;
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        if (selected && selected === name) opt.selected = true;
        subjectLevelSelect.appendChild(opt);
      });
      if (
        selected &&
        !Array.from(subjectLevelSelect.options).some(function (o) {
          return o.value === selected;
        })
      ) {
        const legacy = document.createElement("option");
        legacy.value = selected;
        legacy.textContent = selected + " (legacy)";
        legacy.selected = true;
        subjectLevelSelect.appendChild(legacy);
      }
    }

    const fmtDate = function (raw) {
      if (!raw) return "-";
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return String(raw);
      return d.toLocaleString("id-ID");
    };

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

    async function downloadLearningGoalsTemplateCSV() {
      const res = await fetch("/api/v1/learning-goals/import-template", {
        method: "GET",
        credentials: "include",
      });
      if (!res.ok) {
        const errJSON = await res.json().catch(function () {
          return {};
        });
        const msg = extractAPIError(
          errJSON,
          res.statusText || "Request failed",
        );
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

    function formatLearningGoalImportErrorsMultiline(errors) {
      const rows = Array.isArray(errors) ? errors : [];
      if (!rows.length) return "Tidak ada detail error.";
      return rows
        .map(function (it) {
          const rowNo = Number(it && it.row) || 0;
          const mapel = String((it && it.mata_pelajaran) || "").trim();
          const kelas = String((it && it.kelas) || "").trim();
          const materi = String((it && it.materi) || "").trim();
          const semester = String((it && it.semester) || "").trim();
          const err = String(
            (it && it.error) || "error tidak diketahui",
          ).trim();
          const label = [
            mapel ? "mapel: " + mapel : "",
            kelas ? "kelas: " + kelas : "",
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

    function csvEscape(value) {
      const s = String(value == null ? "" : value);
      if (!/[",\n]/.test(s)) return s;
      return '"' + s.replaceAll('"', '""') + '"';
    }

    function decodeImportWordCSVLine(rawLine) {
      const line = String(rawLine == null ? "" : rawLine).trim();
      if (!line) return "";
      if (line.startsWith('"') && line.endsWith('"') && line.length >= 2) {
        return line.slice(1, -1).replaceAll('""', '"').trim();
      }
      return line.trim();
    }

    function normalizeImportHeaderKey(raw) {
      return String(raw || "")
        .replace(/^\uFEFF/, "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");
    }

    function parseSimpleCSV(rawText) {
      const text = String(rawText || "");
      const rows = [];
      let row = [];
      let field = "";
      let inQuotes = false;
      for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];
        const next = i + 1 < text.length ? text[i + 1] : "";
        if (ch === '"') {
          if (inQuotes && next === '"') {
            field += '"';
            i += 1;
            continue;
          }
          inQuotes = !inQuotes;
          continue;
        }
        if (!inQuotes && ch === ",") {
          row.push(field);
          field = "";
          continue;
        }
        if (!inQuotes && (ch === "\n" || ch === "\r")) {
          if (ch === "\r" && next === "\n") i += 1;
          row.push(field);
          const allEmpty = row.every(function (v) {
            return !String(v || "").trim();
          });
          if (!allEmpty) rows.push(row);
          row = [];
          field = "";
          continue;
        }
        field += ch;
      }
      row.push(field);
      const allEmpty = row.every(function (v) {
        return !String(v || "").trim();
      });
      if (!allEmpty) rows.push(row);
      return rows;
    }

    function parseImportTabularRows(rawText) {
      const rows = parseSimpleCSV(rawText);
      if (!rows.length) return [];
      const header = (rows[0] || []).map(normalizeImportHeaderKey);
      const col = {};
      header.forEach(function (h, idx) {
        if (!h || col[h] != null) return;
        col[h] = idx;
      });
      const findIdx = function (keys) {
        for (let i = 0; i < keys.length; i += 1) {
          const key = normalizeImportHeaderKey(keys[i]);
          if (col[key] != null) return col[key];
        }
        return -1;
      };
      const idxMapel = findIdx(["mapel", "matapelajaran", "subject"]);
      const idxKode = findIdx(["kodesoal", "kode"]);
      const idxNamaKode = findIdx(["namakode", "namakodesoal", "nama"]);
      const idxStimulus = findIdx(["stimulus", "s"]);
      const idxSoal = findIdx(["soal", "q", "question"]);
      const idxOpsi = findIdx(["opsi", "pilihan", "options"]);
      const idxKunci = findIdx(["kuncijawaban", "kunci", "answerkey"]);
      const idxPenjelasan = findIdx(["penjelasan", "explanation", "e"]);
      const idxType = findIdx(["type", "tipe", "questiontype"]);
      if (idxSoal < 0 || idxKunci < 0) {
        return [];
      }
      const out = [];
      for (let r = 1; r < rows.length; r += 1) {
        const row = rows[r] || [];
        const get = function (idx) {
          if (idx < 0) return "";
          return String(row[idx] == null ? "" : row[idx]).trim();
        };
        const record = {
          mapel: get(idxMapel),
          kode_soal: get(idxKode),
          nama_kode: get(idxNamaKode),
          stimulus: get(idxStimulus),
          soal: get(idxSoal),
          opsi: get(idxOpsi),
          kunci: get(idxKunci),
          penjelasan: get(idxPenjelasan),
          type: get(idxType),
        };
        const hasData = Object.values(record).some(function (v) {
          return String(v || "").trim() !== "";
        });
        if (!hasData) continue;
        out.push(record);
      }
      return out;
    }

    function parseImportWordBlocks(rawText) {
      const lines = String(rawText || "")
        .split(/\r?\n/)
        .map(function (line) {
          return decodeImportWordCSVLine(line);
        });
      const blocks = [];
      const globalMeta = [];
      let current = [];
      let hasType = false;
      lines.forEach(function (line, idx) {
        const clean = String(line || "").trim();
        if (!clean) return;
        if (idx === 0 && clean.toLowerCase() === "content") return;
        if (/^type\s*:/i.test(clean)) {
          if (hasType && current.length) {
            blocks.push(current);
          }
          current = [clean];
          hasType = true;
          return;
        }
        if (hasType) {
          current.push(clean);
        } else {
          globalMeta.push(clean);
        }
      });
      if (current.length) blocks.push(current);
      if (!globalMeta.length) return blocks;
      return blocks.map(function (block) {
        return globalMeta.concat(block);
      });
    }

    function parseImportContent(rawText) {
      const tabularRows = parseImportTabularRows(rawText);
      if (tabularRows.length) {
        return { mode: "tabular", items: tabularRows };
      }
      return { mode: "block", items: parseImportWordBlocks(rawText) };
    }

    function mapImportQuestionType(rawType) {
      const t = String(rawType || "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "_");
      if (t === "MC") return "pg_tunggal";
      if (t === "MR") return "multi_jawaban";
      if (t === "TF") return "benar_salah_pernyataan";
      if (t === "PG_TUNGGAL") return "pg_tunggal";
      if (t === "MULTI_JAWABAN") return "multi_jawaban";
      if (t === "BENAR_SALAH_PERNYATAAN") return "benar_salah_pernyataan";
      return "";
    }

    function splitImportValues(raw) {
      const text = String(raw || "").trim();
      if (!text) return [];
      const base = text.includes("|")
        ? text.split("|")
        : text.includes(";")
          ? text.split(";")
          : text.split(/\r?\n/);
      return base
        .map(function (v) {
          return String(v || "").trim();
        })
        .filter(Boolean);
    }

    function inferImportQuestionType(item) {
      const typed = mapImportQuestionType(item && item.type_raw);
      if (typed) return typed;
      const keys = String((item && item.key_raw) || "")
        .split(",")
        .map(function (v) {
          return String(v || "")
            .trim()
            .toUpperCase();
        })
        .filter(Boolean);
      if (
        keys.length > 1 &&
        keys.every(function (v) {
          return v === "T" || v === "F";
        })
      ) {
        return "benar_salah_pernyataan";
      }
      if (keys.length > 1) return "multi_jawaban";
      return "pg_tunggal";
    }

    function buildExplanationHTML(rawExplanation) {
      const text = String(rawExplanation || "").trim();
      if (!text) return "";
      const safe = escapeHtml(text).replace(/\r?\n/g, "<br>");
      return "<p>" + safe + "</p>";
    }

    function parseImportQuestionFromParts(item, blockNo) {
      item.question_type = inferImportQuestionType(item);
      if (!item.question_type) {
        throw new Error("Blok " + String(blockNo) + ": TYPE harus MC/MR/TF.");
      }
      if (!item.question) {
        throw new Error("Blok " + String(blockNo) + ": soal wajib diisi.");
      }
      if (!item.key_raw) {
        throw new Error(
          "Blok " + String(blockNo) + ": kunci jawaban wajib diisi.",
        );
      }

      let answerKey = {};
      let optionsPayload = [];
      if (item.question_type === "pg_tunggal") {
        optionsPayload = item.options
          .map(function (it) {
            return {
              option_key: String((it && it.option_key) || "")
                .trim()
                .toUpperCase(),
              option_html: String((it && it.option_html) || "").trim(),
            };
          })
          .filter(function (it) {
            return it.option_key && it.option_html;
          });
        if (optionsPayload.length < 2) {
          throw new Error(
            "Blok " + String(blockNo) + ": soal MC minimal 2 opsi.",
          );
        }
        const correct = String(item.key_raw || "")
          .split(",")[0]
          .trim()
          .toUpperCase();
        if (!correct) {
          throw new Error(
            "Blok " + String(blockNo) + ": kunci MC tidak valid.",
          );
        }
        answerKey = { correct: correct };
      } else if (item.question_type === "multi_jawaban") {
        optionsPayload = item.options
          .map(function (it) {
            return {
              option_key: String((it && it.option_key) || "")
                .trim()
                .toUpperCase(),
              option_html: String((it && it.option_html) || "").trim(),
            };
          })
          .filter(function (it) {
            return it.option_key && it.option_html;
          });
        if (optionsPayload.length < 2) {
          throw new Error(
            "Blok " + String(blockNo) + ": soal MR minimal 2 opsi.",
          );
        }
        const keys = String(item.key_raw || "")
          .split(",")
          .map(function (v) {
            return String(v || "")
              .trim()
              .toUpperCase();
          })
          .filter(Boolean);
        if (!keys.length) {
          throw new Error(
            "Blok " + String(blockNo) + ": kunci MR tidak valid.",
          );
        }
        answerKey = { correct: keys, mode: "exact" };
      } else {
        const statements = item.statements
          .map(function (it) {
            return {
              id: String((it && it.id) || "")
                .trim()
                .toUpperCase(),
              statement: String((it && it.statement) || "").trim(),
            };
          })
          .filter(function (it) {
            return it.id && it.statement;
          });
        if (!statements.length) {
          throw new Error(
            "Blok " + String(blockNo) + ": soal TF butuh P1/P2/P3...",
          );
        }
        const keys = String(item.key_raw || "")
          .split(",")
          .map(function (v) {
            return String(v || "")
              .trim()
              .toUpperCase();
          })
          .filter(Boolean);
        if (keys.length !== statements.length) {
          throw new Error(
            "Blok " +
              String(blockNo) +
              ": jumlah Kunci TF harus sama dengan jumlah pernyataan.",
          );
        }
        answerKey = {
          statements: statements.map(function (st, idx) {
            const flag = keys[idx];
            if (flag !== "T" && flag !== "F") {
              throw new Error(
                "Blok " +
                  String(blockNo) +
                  ": nilai Kunci TF harus T/F (contoh: T, F, T).",
              );
            }
            return {
              id: st.id,
              statement: st.statement,
              correct: flag === "T",
            };
          }),
        };
      }

      const safeQuestion = escapeHtml(item.question || "");
      const stemHTML = "<p>" + safeQuestion + "</p>";
      const title = String(item.question || "").slice(0, 180);
      return {
        question_type: item.question_type,
        title: title || "Import Soal",
        indicator: "Import Soal CSV Word",
        material: item.stimulus || "Import Soal",
        objective: "Import otomatis dari CSV Word",
        cognitive_level: "C2",
        stimulus_text: String(item.stimulus || "").trim(),
        stem_html: stemHTML,
        explanation_html: buildExplanationHTML(item.explanation || ""),
        answer_key: answerKey,
        options: optionsPayload,
        mapel: String(item.mapel || "").trim(),
        question_code_code: String(item.question_code_code || "").trim(),
        question_code_name: String(item.question_code_name || "").trim(),
      };
    }

    function normalizeTextKey(raw) {
      return String(raw || "")
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&#39;/gi, "'")
        .replace(/&quot;/gi, '"')
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
    }

    function parseImportQuestionBlock(lines, blockNo) {
      const item = {
        type_raw: "",
        mapel: "",
        question_code_code: "",
        question_code_name: "",
        explanation: "",
        question_type: "",
        stimulus: "",
        question: "",
        options: [],
        statements: [],
        key_raw: "",
      };
      let lastField = "";
      let lastOptionIdx = -1;
      let lastStatementIdx = -1;
      const appendContinuation = function (rawLine) {
        const extra = String(rawLine || "").trim();
        if (!extra) return;
        if (lastField === "stimulus") {
          item.stimulus = (item.stimulus ? item.stimulus + "\n" : "") + extra;
          return;
        }
        if (lastField === "question") {
          item.question = (item.question ? item.question + "\n" : "") + extra;
          return;
        }
        if (lastField === "explanation") {
          item.explanation =
            (item.explanation ? item.explanation + "\n" : "") + extra;
          return;
        }
        if (lastField === "option" && lastOptionIdx >= 0) {
          const opt = item.options[lastOptionIdx];
          if (opt) {
            opt.option_html =
              (opt.option_html ? opt.option_html + "\n" : "") + extra;
          }
          return;
        }
        if (lastField === "statement" && lastStatementIdx >= 0) {
          const st = item.statements[lastStatementIdx];
          if (st) {
            st.statement = (st.statement ? st.statement + "\n" : "") + extra;
          }
          return;
        }
        if (lastField === "kunci") {
          lastField = "explanation";
          item.explanation =
            (item.explanation ? item.explanation + "\n" : "") + extra;
        }
      };
      (Array.isArray(lines) ? lines : []).forEach(function (line) {
        const raw = String(line || "");
        const idx = raw.indexOf(":");
        if (idx < 0) {
          appendContinuation(raw);
          return;
        }
        const rawKey = raw.slice(0, idx).trim();
        const val = raw.slice(idx + 1).trim();
        if (!rawKey) return;
        const keyCompact = rawKey.replace(/[\s_]+/g, "").toUpperCase();
        const keyUpper = rawKey.trim().toUpperCase();
        if (keyCompact === "TYPE") {
          item.type_raw = val;
          lastField = "type";
          return;
        }
        if (keyCompact === "MAPEL" || keyCompact === "MATAPELAJARAN") {
          item.mapel = val;
          lastField = "mapel";
          return;
        }
        if (keyCompact === "KODESOAL" || keyCompact === "KODE") {
          item.question_code_code = val;
          lastField = "kode";
          return;
        }
        if (keyCompact === "NAMAKODE" || keyCompact === "NAMAKODESOAL") {
          item.question_code_name = val;
          lastField = "nama";
          return;
        }
        if (
          keyCompact === "PENJELASAN" ||
          keyCompact === "EXPLANATION" ||
          keyCompact === "E"
        ) {
          item.explanation = val;
          lastField = "explanation";
          return;
        }
        if (keyCompact === "S" || keyCompact === "STIMULUS") {
          item.stimulus = val;
          lastField = "stimulus";
          return;
        }
        if (keyCompact === "Q" || keyCompact === "SOAL") {
          item.question = val;
          lastField = "question";
          return;
        }
        if (keyCompact === "KUNCI" || keyCompact === "KUNCIJAWABAN") {
          item.key_raw = val;
          lastField = "kunci";
          return;
        }
        if (/^[A-Z]$/.test(keyUpper)) {
          item.options.push({ option_key: keyUpper, option_html: val });
          lastField = "option";
          lastOptionIdx = item.options.length - 1;
          return;
        }
        if (/^P[0-9]+$/.test(keyUpper)) {
          item.statements.push({ id: keyUpper, statement: val });
          lastField = "statement";
          lastStatementIdx = item.statements.length - 1;
          return;
        }
        appendContinuation(raw);
      });
      return parseImportQuestionFromParts(item, blockNo);
    }

    function parseImportQuestionRow(record, blockNo) {
      const item = {
        type_raw: String((record && record.type) || "").trim(),
        mapel: String((record && record.mapel) || "").trim(),
        question_code_code: String((record && record.kode_soal) || "").trim(),
        question_code_name: String((record && record.nama_kode) || "").trim(),
        explanation: String((record && record.penjelasan) || "").trim(),
        stimulus: String((record && record.stimulus) || "").trim(),
        question: String((record && record.soal) || "").trim(),
        key_raw: String((record && record.kunci) || "").trim(),
        options: [],
        statements: [],
      };
      const parts = splitImportValues(String((record && record.opsi) || ""));
      const keyTokens = String(item.key_raw || "")
        .split(",")
        .map(function (v) {
          return String(v || "")
            .trim()
            .toUpperCase();
        })
        .filter(Boolean);
      const inferredType =
        mapImportQuestionType(item.type_raw) || inferImportQuestionType(item);
      if (inferredType === "benar_salah_pernyataan") {
        item.statements = parts
          .map(function (line, idx) {
            const cleaned = String(line || "").trim();
            if (!cleaned) return null;
            const withId = cleaned.match(/^P?([0-9]+)[\.\):\-\s]+(.+)$/i);
            const statement = withId ? String(withId[2] || "").trim() : cleaned;
            const id = "P" + String(idx + 1);
            if (!statement) return null;
            return { id: id, statement: statement };
          })
          .filter(Boolean);
      } else {
        item.options = parts
          .map(function (line, idx) {
            const cleaned = String(line || "").trim();
            if (!cleaned) return null;
            const m = cleaned.match(/^([A-Z])[\.\):\-\s]+(.+)$/i);
            const optionKey = (
              m && m[1] ? m[1] : String.fromCharCode(65 + idx)
            ).toUpperCase();
            const optionText = m && m[2] ? String(m[2] || "").trim() : cleaned;
            if (!optionText) return null;
            return { option_key: optionKey, option_html: optionText };
          })
          .filter(Boolean);
      }
      if (!item.key_raw && keyTokens.length) {
        item.key_raw = keyTokens.join(",");
      }
      return parseImportQuestionFromParts(item, blockNo);
    }

    function normalizeImportMapelValue(raw) {
      return String(raw || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
    }

    function resolveImportSubjectID(mapelFromFile, fallbackSubjectID, blockNo) {
      const fallbackID = Number(fallbackSubjectID || 0);
      const mapel = normalizeImportMapelValue(mapelFromFile);
      if (!mapel) {
        if (fallbackID > 0) return fallbackID;
        throw new Error(
          "Blok " +
            String(blockNo) +
            ": Mapel wajib ada di file per soal jika tidak memilih Mapel default.",
        );
      }
      const rows = Array.isArray(subjectsCache) ? subjectsCache : [];
      const exactByName = rows.filter(function (it) {
        return (
          normalizeImportMapelValue(String((it && it.name) || "")) === mapel
        );
      });
      let matches = exactByName;
      if (!matches.length) {
        const exactByLabel = rows.filter(function (it) {
          return normalizeImportMapelValue(subjectLabel(it)) === mapel;
        });
        matches = exactByLabel;
      }
      if (!matches.length && mapel.indexOf("|") >= 0) {
        const parts = mapel
          .split("|")
          .map(function (v) {
            return normalizeImportMapelValue(v);
          })
          .filter(Boolean);
        const last = parts.length ? parts[parts.length - 1] : "";
        if (last) {
          matches = rows.filter(function (it) {
            return (
              normalizeImportMapelValue(String((it && it.name) || "")) === last
            );
          });
        }
      }
      if (!matches.length) {
        throw new Error(
          "Blok " +
            String(blockNo) +
            ': Mapel "' +
            String(mapelFromFile || "") +
            '" tidak ditemukan.',
        );
      }
      if (matches.length > 1) {
        const picked = matches.find(function (it) {
          return Number((it && it.id) || 0) === fallbackID;
        });
        if (picked) return Number((picked && picked.id) || 0);
        throw new Error(
          "Blok " +
            String(blockNo) +
            ': Mapel "' +
            String(mapelFromFile || "") +
            '" ambigu. Gunakan format "Jenjang | Tipe | Nama" atau pilih Mapel default.',
        );
      }
      return Number((matches[0] && matches[0].id) || 0);
    }

    async function ensureQuestionCodeForImport(subjectID, codeRaw, nameRaw) {
      const code = String(codeRaw || "").trim();
      const name = String(nameRaw || "").trim();
      if (!code && !name) return null;
      if (!code) {
        throw new Error("Kode Soal wajib diisi jika Nama Kode tersedia.");
      }
      const codeNorm = code.toLowerCase();
      const existing = (
        Array.isArray(questionCodesCache) ? questionCodesCache : []
      ).find(function (it) {
        return (
          Number((it && it.subject_id) || 0) === Number(subjectID || 0) &&
          String((it && it.code) || "")
            .trim()
            .toLowerCase() === codeNorm
        );
      });
      if (existing && Number((existing && existing.id) || 0) > 0) {
        return Number(existing.id || 0);
      }
      const created = await api("/api/v1/question-codes", "POST", {
        subject_id: Number(subjectID || 0),
        code: code,
        name: name || code,
      });
      const id = Number((created && created.id) || 0);
      if (id > 0) {
        questionCodesCache.push(created);
      }
      return id > 0 ? id : null;
    }

    async function loadScriptOnce(id, src) {
      const exists = document.getElementById(id);
      if (exists) return;
      await new Promise(function (resolve, reject) {
        const s = document.createElement("script");
        s.id = id;
        s.src = src;
        s.async = true;
        s.onload = resolve;
        s.onerror = function () {
          reject(new Error("Gagal memuat script: " + src));
        };
        document.head.appendChild(s);
      });
    }

    function loadStyleOnce(id, href) {
      if (document.getElementById(id)) return;
      const l = document.createElement("link");
      l.id = id;
      l.rel = "stylesheet";
      l.href = href;
      document.head.appendChild(l);
    }

    async function ensureKatexReady() {
      loadStyleOnce(
        "katex-css",
        "https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/katex.min.css",
      );
      if (window.katex) return;
      await loadScriptOnce(
        "katex-js",
        "https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/katex.min.js",
      );
    }

    async function ensureQuillReady() {
      loadStyleOnce(
        "quill-snow-css",
        "https://cdn.jsdelivr.net/npm/quill@1.3.7/dist/quill.snow.css",
      );
      await ensureKatexReady();
      if (!window.Quill) {
        await loadScriptOnce(
          "quill-js",
          "https://cdn.jsdelivr.net/npm/quill@1.3.7/dist/quill.min.js",
        );
      }
      if (!window.__cbtQuillImageResizeRegistered) {
        try {
          await loadScriptOnce(
            "quill-image-resize-js",
            "https://cdn.jsdelivr.net/npm/quill-image-resize-module@3.0.0/image-resize.min.js",
          );
          const alreadyRegistered =
            window.Quill &&
            window.Quill.imports &&
            window.Quill.imports["modules/imageResize"];
          if (alreadyRegistered) {
            window.__cbtQuillImageResizeRegistered = true;
          } else if (window.Quill && window.ImageResize) {
            window.Quill.register("modules/imageResize", window.ImageResize);
            window.__cbtQuillImageResizeRegistered = true;
          }
        } catch (_) {
          window.__cbtQuillImageResizeRegistered = false;
        }
      }
    }

    function createQuillEditor(hostEl, placeholder, options) {
      if (!hostEl || !window.Quill) return null;
      const originalConsoleLog = console.log;
      const filteredConsoleLog = function () {
        if (
          arguments.length > 0 &&
          String(arguments[0] || "") === "this.options.modules"
        ) {
          return;
        }
        return originalConsoleLog.apply(console, arguments);
      };
      let quill = null;
      try {
        if (typeof originalConsoleLog === "function") {
          console.log = filteredConsoleLog;
        }
        quill = new window.Quill(hostEl, {
          theme: "snow",
          placeholder: placeholder || "",
          modules: {
            toolbar: {
              container: [
                [{ header: [false, 2, 3] }],
                ["bold", "italic", "underline"],
                [{ script: "sub" }, { script: "super" }],
                [{ align: [] }],
                [{ list: "ordered" }, { list: "bullet" }],
                ["link", "image", "formula"],
                ["clean"],
              ],
              handlers: {
                image: function () {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = "image/*";
                  input.onchange = function () {
                    const file = input.files && input.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = function () {
                      const base64 = String(reader.result || "");
                      if (!base64) return;
                      const range = this.quill.getSelection(true);
                      const index = range
                        ? range.index
                        : this.quill.getLength();
                      this.quill.insertEmbed(index, "image", base64, "user");
                      this.quill.setSelection(index + 1, 0, "silent");
                    }.bind(this);
                    reader.readAsDataURL(file);
                  }.bind(this);
                  input.click();
                },
              },
            },
            imageResize: {
              modules: ["Resize", "DisplaySize", "Toolbar"],
            },
          },
        });
      } finally {
        if (typeof originalConsoleLog === "function") {
          console.log = originalConsoleLog;
        }
      }
      const fontSize = String(
        (options && options.defaultFontSize) || "",
      ).trim();
      if (fontSize && quill.root && quill.root.style) {
        quill.root.style.fontSize = fontSize;
      }
      return quill;
    }

    function getQuillHTML(quill) {
      if (!quill || !quill.root) return "";
      return String(quill.root.innerHTML || "").trim();
    }

    function syncManuscriptHiddenInputs() {
      if (manuscriptStimulusHTMLInput) {
        manuscriptStimulusHTMLInput.value = getQuillHTML(
          manuscriptStimulusQuill,
        );
      }
      if (manuscriptStemHTMLInput) {
        manuscriptStemHTMLInput.value = getQuillHTML(manuscriptStemQuill);
      }
      if (manuscriptExplanationHTMLInput) {
        manuscriptExplanationHTMLInput.value = getQuillHTML(
          manuscriptExplanationQuill,
        );
      }
      if (manuscriptHintHTMLInput) {
        manuscriptHintHTMLInput.value = getQuillHTML(manuscriptHintQuill);
      }
    }

    function resetManuscriptEditors() {
      if (manuscriptStimulusQuill) manuscriptStimulusQuill.setContents([]);
      if (manuscriptStemQuill) manuscriptStemQuill.setContents([]);
      if (manuscriptExplanationQuill)
        manuscriptExplanationQuill.setContents([]);
      if (manuscriptHintQuill) manuscriptHintQuill.setContents([]);
      syncManuscriptHiddenInputs();
    }

    function createManuscriptOptionRow(data, idx) {
      const key =
        String((data && data.option_key) || "").trim() ||
        String.fromCharCode(65 + idx);
      const htmlValue = String((data && data.option_html) || "").trim();
      return (
        '<div class="panel mt" data-option-row="1">' +
        '<label>Kode Opsi<input type="text" data-option-key value="' +
        escapeHtml(key) +
        '" placeholder="A" maxlength="10" /></label>' +
        '<label class="mt">Konten Opsi</label>' +
        '<div class="quill-editor-shell mt"><div class="manuscript-option-editor"></div></div>' +
        '<input type="hidden" data-option-html value="' +
        escapeHtml(htmlValue) +
        '" />' +
        '<button type="button" class="btn btn-secondary btn-inline mt" data-option-remove="1">Hapus Opsi</button>' +
        "</div>"
      );
    }

    function bindManuscriptOptionEditor(row) {
      if (!row || manuscriptOptionQuillByRow.has(row) || !window.Quill) return;
      const host = row.querySelector(".manuscript-option-editor");
      const hidden = row.querySelector("[data-option-html]");
      if (!host || !hidden) return;
      const initialHTML = String(hidden.value || "").trim();
      const quill = createQuillEditor(host, "Isi opsi jawaban...", {
        defaultFontSize: "12pt",
      });
      if (!quill) return;
      if (initialHTML) {
        quill.clipboard.dangerouslyPasteHTML(initialHTML);
      }
      hidden.value = getQuillHTML(quill);
      quill.on("text-change", function () {
        hidden.value = getQuillHTML(quill);
        syncManuscriptAnswerKeyPreview();
      });
      manuscriptOptionQuillByRow.set(row, quill);
    }

    function bindManuscriptOptionEditors() {
      if (!manuscriptOptionsWrap) return;
      manuscriptOptionsWrap
        .querySelectorAll("[data-option-row]")
        .forEach(function (row) {
          bindManuscriptOptionEditor(row);
        });
    }

    function ensureManuscriptOptionRows() {
      if (!manuscriptOptionsWrap) return;
      if (!manuscriptOptionsWrap.querySelector("[data-option-row]")) {
        manuscriptOptionsWrap.innerHTML =
          createManuscriptOptionRow({ option_key: "A", option_html: "" }, 0) +
          createManuscriptOptionRow({ option_key: "B", option_html: "" }, 1);
      }
      bindManuscriptOptionEditors();
    }

    function collectManuscriptOptions() {
      const rows = Array.from(
        (manuscriptOptionsWrap &&
          manuscriptOptionsWrap.querySelectorAll("[data-option-row]")) ||
          [],
      );
      return rows.map(function (row) {
        const keyInput = row.querySelector("[data-option-key]");
        const htmlInput = row.querySelector("[data-option-html]");
        return {
          option_key: String((keyInput && keyInput.value) || "").trim(),
          option_html: String((htmlInput && htmlInput.value) || "").trim(),
        };
      });
    }

    function validateManuscriptOptions(options) {
      const list = Array.isArray(options) ? options : [];
      const isChoiceType =
        currentManuscriptQuestionType === "pg_tunggal" ||
        currentManuscriptQuestionType === "multi_jawaban";
      if (!isChoiceType) return [];
      if (list.length < 2) {
        throw new Error("Minimal 2 opsi jawaban untuk MC/MR.");
      }
      const seen = {};
      list.forEach(function (it, idx) {
        const key = String((it && it.option_key) || "")
          .trim()
          .toUpperCase();
        const body = String((it && it.option_html) || "").trim();
        if (!key)
          throw new Error(
            "Kode opsi baris " + String(idx + 1) + " wajib diisi.",
          );
        if (seen[key]) throw new Error("Kode opsi duplikat: " + key);
        if (!body) throw new Error("Konten opsi " + key + " wajib diisi.");
        seen[key] = true;
      });
      return list.map(function (it) {
        return {
          option_key: String(it.option_key || "")
            .trim()
            .toUpperCase(),
          option_html: String(it.option_html || "").trim(),
        };
      });
    }

    function renderManuscriptKeyChoices() {
      if (!manuscriptKeyMCOptions || !manuscriptKeyMROptions) return;
      const options = collectManuscriptOptions();
      const mcChecked = document.querySelector(
        'input[name="manuscript_mc_key"]:checked',
      );
      const mrChecked = Array.from(
        document.querySelectorAll('input[name="manuscript_mr_key"]:checked'),
      ).map(function (el) {
        return String(el.value || "")
          .trim()
          .toUpperCase();
      });
      const mcKey = String((mcChecked && mcChecked.value) || "")
        .trim()
        .toUpperCase();
      manuscriptKeyMCOptions.innerHTML = "";
      manuscriptKeyMROptions.innerHTML = "";
      options.forEach(function (it, idx) {
        const key = String((it && it.option_key) || "")
          .trim()
          .toUpperCase();
        const label = key || "Opsi " + String(idx + 1);
        const mcRow = document.createElement("label");
        mcRow.className = "option-row";
        mcRow.innerHTML =
          '<input type="radio" name="manuscript_mc_key" value="' +
          escapeHtml(key) +
          '" ' +
          ((mcKey ? mcKey === key : idx === 0) ? "checked" : "") +
          ">" +
          "<div>" +
          escapeHtml(label) +
          "</div>";
        manuscriptKeyMCOptions.appendChild(mcRow);

        const mrRow = document.createElement("label");
        mrRow.className = "option-row";
        mrRow.innerHTML =
          '<input type="checkbox" name="manuscript_mr_key" value="' +
          escapeHtml(key) +
          '" ' +
          (mrChecked.includes(key) ? "checked" : "") +
          ">" +
          "<div>" +
          escapeHtml(label) +
          "</div>";
        manuscriptKeyMROptions.appendChild(mrRow);
      });
    }

    function createTFStatementRow(data, idx) {
      const id = String((data && data.id) || "S" + String(idx + 1)).trim();
      const statement = String((data && data.statement) || "").trim();
      const correct = !!(data && data.correct);
      return (
        '<div class="panel mt" data-statement-row="1">' +
        '<label>ID Pernyataan<input type="text" data-statement-id value="' +
        escapeHtml(id) +
        '" placeholder="S1" /></label>' +
        '<label class="mt">Teks Pernyataan<input type="text" data-statement-text value="' +
        escapeHtml(statement) +
        '" placeholder="Teks pernyataan" /></label>' +
        '<label class="mt">Nilai Benar/Salah<select data-statement-correct><option value="true"' +
        (correct ? " selected" : "") +
        '>Benar</option><option value="false"' +
        (!correct ? " selected" : "") +
        ">Salah</option></select></label>" +
        '<button type="button" class="btn btn-secondary btn-inline mt" data-statement-remove="1">Hapus</button>' +
        "</div>"
      );
    }

    function ensureTFStatementRows() {
      if (!manuscriptStatementsWrap) return;
      if (!manuscriptStatementsWrap.querySelector("[data-statement-row]")) {
        manuscriptStatementsWrap.innerHTML = createTFStatementRow(
          { id: "S1", statement: "", correct: true },
          0,
        );
      }
    }

    function getCurrentManuscriptQuestionType() {
      const questionID = Number(
        (manuscriptQuestionSelect && manuscriptQuestionSelect.value) || 0,
      );
      const item = blueprintsCache.find(function (it) {
        return Number(it.id) === questionID;
      });
      return String((item && item.question_type) || "")
        .trim()
        .toLowerCase();
    }

    function findQuestionByID(questionID) {
      return blueprintsCache.find(function (it) {
        return Number((it && it.id) || 0) === Number(questionID || 0);
      });
    }

    function syncManuscriptSubjectState() {
      if (!manuscriptSubjectSelect) return;
      const selectedQuestionID = Number(
        (manuscriptQuestionSelect && manuscriptQuestionSelect.value) || 0,
      );
      const selectedQuestion = findQuestionByID(selectedQuestionID);
      const questionSubjectID = Number(
        (selectedQuestion && selectedQuestion.subject_id) || 0,
      );
      if (questionSubjectID > 0) {
        manuscriptSubjectSelect.value = String(questionSubjectID);
        manuscriptSubjectSelect.disabled = true;
        fillLearningGoalSelect(manuscriptLearningGoalSelect, questionSubjectID);
        const selectedQuestionGoalID = Number(
          (selectedQuestion && selectedQuestion.learning_goal_id) || 0,
        );
        if (selectedQuestionGoalID > 0 && manuscriptLearningGoalSelect) {
          manuscriptLearningGoalSelect.value = String(selectedQuestionGoalID);
          manuscriptLearningGoalSelect.disabled = true;
        }
        fillQuestionCodeSelect(
          manuscriptQuestionCodeSelect,
          questionSubjectID,
          true,
        );
        if (manuscriptQuestionCodeSelect) {
          manuscriptQuestionCodeSelect.value = String(
            Number(
              (selectedQuestion && selectedQuestion.question_code_id) || 0,
            ) || "",
          );
          manuscriptQuestionCodeSelect.disabled = false;
        }
        return;
      }
      manuscriptSubjectSelect.disabled = false;
      fillLearningGoalSelect(
        manuscriptLearningGoalSelect,
        Number((manuscriptSubjectSelect && manuscriptSubjectSelect.value) || 0),
      );
      if (manuscriptLearningGoalSelect) {
        manuscriptLearningGoalSelect.disabled = false;
      }
      fillQuestionCodeSelect(
        manuscriptQuestionCodeSelect,
        Number((manuscriptSubjectSelect && manuscriptSubjectSelect.value) || 0),
        true,
      );
      if (manuscriptQuestionCodeSelect) {
        manuscriptQuestionCodeSelect.disabled = false;
      }
    }

    function getManuscriptTargetSubjectID() {
      const selectedQuestionID = Number(
        (manuscriptQuestionSelect && manuscriptQuestionSelect.value) || 0,
      );
      const selectedQuestion = findQuestionByID(selectedQuestionID);
      const questionSubjectID = Number(
        (selectedQuestion && selectedQuestion.subject_id) || 0,
      );
      if (questionSubjectID > 0) return questionSubjectID;
      return Number(
        (manuscriptSubjectSelect && manuscriptSubjectSelect.value) || 0,
      );
    }

    function getManuscriptTargetLearningGoalID() {
      const selectedQuestionID = Number(
        (manuscriptQuestionSelect && manuscriptQuestionSelect.value) || 0,
      );
      const selectedQuestion = findQuestionByID(selectedQuestionID);
      const questionGoalID = Number(
        (selectedQuestion && selectedQuestion.learning_goal_id) || 0,
      );
      if (questionGoalID > 0) return questionGoalID;
      return Number(
        (manuscriptLearningGoalSelect && manuscriptLearningGoalSelect.value) ||
          0,
      );
    }

    function collectManuscriptAnswerKey() {
      const qType = String(currentManuscriptQuestionType || "").toLowerCase();
      if (qType === "pg_tunggal") {
        renderManuscriptKeyChoices();
        const checked = document.querySelector(
          'input[name="manuscript_mc_key"]:checked',
        );
        const correct = String((checked && checked.value) || "").trim();
        if (!correct) throw new Error("Kunci MC wajib dipilih.");
        return { correct: correct };
      }
      if (qType === "multi_jawaban") {
        renderManuscriptKeyChoices();
        const keys = Array.from(
          document.querySelectorAll('input[name="manuscript_mr_key"]:checked'),
        )
          .map(function (el) {
            return String(el.value || "").trim();
          })
          .filter(Boolean);
        if (!keys.length) throw new Error("Kunci MR minimal 1 opsi.");
        return { correct: keys, mode: "exact" };
      }
      if (qType === "benar_salah_pernyataan") {
        const rows = Array.from(
          (manuscriptStatementsWrap &&
            manuscriptStatementsWrap.querySelectorAll(
              "[data-statement-row]",
            )) ||
            [],
        );
        if (!rows.length) {
          throw new Error("Tambahkan minimal 1 pernyataan TF.");
        }
        const seen = {};
        const statements = rows.map(function (row, idx) {
          const idInput = row.querySelector("[data-statement-id]");
          const textInput = row.querySelector("[data-statement-text]");
          const correctSelect = row.querySelector("[data-statement-correct]");
          const id = String((idInput && idInput.value) || "").trim();
          const statement = String((textInput && textInput.value) || "").trim();
          const correct = String(
            (correctSelect && correctSelect.value) || "true",
          );
          if (!id) {
            throw new Error(
              "ID pernyataan TF baris " + String(idx + 1) + " wajib diisi.",
            );
          }
          if (seen[id]) {
            throw new Error("ID pernyataan TF duplikat: " + id);
          }
          seen[id] = true;
          return {
            id: id,
            statement: statement,
            correct: correct === "true",
          };
        });
        return { statements: statements };
      }
      throw new Error("Tipe soal belum valid.");
    }

    function syncManuscriptAnswerKeyPreview() {
      if (!manuscriptAnswerKeyRaw) return;
      try {
        const key = collectManuscriptAnswerKey();
        manuscriptAnswerKeyRaw.value = JSON.stringify(key, null, 2);
      } catch (_) {
        manuscriptAnswerKeyRaw.value = "{}";
      }
    }

    function applyManuscriptTypeUI(fromBlueprint) {
      const blueprintType = getCurrentManuscriptQuestionType();
      let selectedType = String(
        (manuscriptQuestionTypeUI && manuscriptQuestionTypeUI.value) || "",
      )
        .trim()
        .toLowerCase();
      if (fromBlueprint || !selectedType) {
        selectedType = blueprintType;
        if (manuscriptQuestionTypeUI) {
          manuscriptQuestionTypeUI.value = selectedType || "";
        }
      }
      currentManuscriptQuestionType = selectedType || blueprintType;
      if (manuscriptOptionsPanel) {
        manuscriptOptionsPanel.hidden = ![
          "pg_tunggal",
          "multi_jawaban",
        ].includes(currentManuscriptQuestionType);
      }
      if (manuscriptKeyMC) {
        manuscriptKeyMC.hidden = currentManuscriptQuestionType !== "pg_tunggal";
      }
      if (manuscriptKeyMR) {
        manuscriptKeyMR.hidden =
          currentManuscriptQuestionType !== "multi_jawaban";
      }
      if (manuscriptKeyTF) {
        manuscriptKeyTF.hidden =
          currentManuscriptQuestionType !== "benar_salah_pernyataan";
      }
      if (currentManuscriptQuestionType === "benar_salah_pernyataan") {
        ensureTFStatementRows();
      } else {
        ensureManuscriptOptionRows();
        renderManuscriptKeyChoices();
      }
      syncManuscriptAnswerKeyPreview();
    }

    function setManuscriptEditMode(questionID, versionNo) {
      manuscriptEditingQuestionID = Number(questionID || 0);
      if (manuscriptEditingVersionNoInput) {
        manuscriptEditingVersionNoInput.value = String(versionNo || "");
      }
      if (manuscriptSubmitBtn) {
        manuscriptSubmitBtn.textContent =
          "Simpan Perubahan (v" + String(versionNo || "") + ")";
      }
      if (manuscriptCancelEditBtn) {
        manuscriptCancelEditBtn.hidden = false;
      }
    }

    function clearManuscriptEditMode() {
      manuscriptEditingQuestionID = 0;
      if (manuscriptEditingVersionNoInput)
        manuscriptEditingVersionNoInput.value = "";
      if (manuscriptSubmitBtn)
        manuscriptSubmitBtn.textContent = "Simpan Naskah";
      if (manuscriptCancelEditBtn) manuscriptCancelEditBtn.hidden = true;
    }

    function setQuillHTMLValue(quill, htmlValue) {
      if (!quill) return;
      quill.setContents([]);
      const value = String(htmlValue || "").trim();
      if (value) quill.clipboard.dangerouslyPasteHTML(value);
    }

    function parseAnswerKeyObject(raw) {
      if (!raw) return {};
      if (typeof raw === "object") return raw;
      try {
        return JSON.parse(String(raw || "{}"));
      } catch (_) {
        return {};
      }
    }

    function cleanStemPreview(raw) {
      const text = String(raw || "").trim();
      if (!text) return "";
      const plain = toPlainText(text);
      if (!plain) return "";
      return plain.replace(/^draft naskah soal:\s*/i, "").trim();
    }

    function toPlainText(html) {
      const raw = String(html || "").trim();
      if (!raw) return "";
      const container = document.createElement("div");
      container.innerHTML = raw;
      return String(container.textContent || "")
        .replace(/\s+/g, " ")
        .trim();
    }

    function previewText(html, maxLen) {
      const text = toPlainText(html);
      if (!text) return "-";
      const limit = Math.max(20, Number(maxLen) || 80);
      if (text.length <= limit) return text;
      return text.slice(0, limit - 1).trim() + "…";
    }

    function shortQuestionType(rawType) {
      const t = String(rawType || "")
        .trim()
        .toLowerCase();
      if (t === "pg_tunggal") return "MC";
      if (t === "multi_jawaban") return "MR";
      if (t === "benar_salah_pernyataan") return "TF";
      return t ? t.toUpperCase() : "-";
    }

    function resolveManuscriptQuestionType(item) {
      if (!item) return "";
      if (item.question_type) return String(item.question_type || "");
      const qid = Number(item.question_id || 0);
      if (qid > 0 && Array.isArray(blueprintsCache)) {
        const found = blueprintsCache.find(function (q) {
          return Number((q && q.id) || 0) === qid;
        });
        if (found && found.question_type) return String(found.question_type);
      }
      return "";
    }

    function resolveManuscriptQuestionCode(item) {
      if (!item) return "";
      const qid = Number(item.question_id || 0);
      if (qid > 0 && Array.isArray(blueprintsCache)) {
        const found = blueprintsCache.find(function (q) {
          return Number((q && q.id) || 0) === qid;
        });
        if (found) return questionCodeLabel(found);
      }
      return "";
    }

    function resolveManuscriptLearningGoal(item) {
      if (!item) return "";
      const qid = Number(item.question_id || 0);
      if (qid > 0 && Array.isArray(blueprintsCache)) {
        const found = blueprintsCache.find(function (q) {
          return Number((q && q.id) || 0) === qid;
        });
        if (found && found.learning_goal_id) {
          const goal = findLearningGoalByID(found.learning_goal_id);
          if (goal) return learningGoalLabel(goal);
        }
      }
      return "";
    }

    function learningGoalLabel(it) {
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

    function renderManuscriptOptionsFromData(options) {
      if (!manuscriptOptionsWrap) return;
      const list = Array.isArray(options) ? options : [];
      if (!list.length) {
        ensureManuscriptOptionRows();
        return;
      }
      manuscriptOptionsWrap.innerHTML = list
        .map(function (it, idx) {
          return createManuscriptOptionRow(it || {}, idx);
        })
        .join("");
      bindManuscriptOptionEditors();
    }

    function renderTFStatementsFromData(statements) {
      if (!manuscriptStatementsWrap) return;
      const list = Array.isArray(statements) ? statements : [];
      if (!list.length) {
        ensureTFStatementRows();
        return;
      }
      manuscriptStatementsWrap.innerHTML = list
        .map(function (it, idx) {
          return createTFStatementRow(it || {}, idx);
        })
        .join("");
    }

    function applyAnswerKeyToManuscriptUI(answerKeyObj) {
      const qType = String(currentManuscriptQuestionType || "").toLowerCase();
      const key =
        answerKeyObj && typeof answerKeyObj === "object" ? answerKeyObj : {};
      if (qType === "pg_tunggal") {
        renderManuscriptKeyChoices();
        const correct = String(key.correct || "")
          .trim()
          .toUpperCase();
        const target = manuscriptKeyMCOptions
          ? manuscriptKeyMCOptions.querySelector(
              'input[name="manuscript_mc_key"][value="' + correct + '"]',
            )
          : null;
        if (target) target.checked = true;
      } else if (qType === "multi_jawaban") {
        renderManuscriptKeyChoices();
        const correctKeys = Array.isArray(key.correct)
          ? key.correct
              .map(function (it) {
                return String(it || "")
                  .trim()
                  .toUpperCase();
              })
              .filter(Boolean)
          : [];
        if (manuscriptKeyMROptions) {
          manuscriptKeyMROptions
            .querySelectorAll('input[name="manuscript_mr_key"]')
            .forEach(function (el) {
              el.checked = correctKeys.includes(
                String(el.value || "")
                  .trim()
                  .toUpperCase(),
              );
            });
        }
      } else if (qType === "benar_salah_pernyataan") {
        renderTFStatementsFromData(
          Array.isArray(key.statements) ? key.statements : [],
        );
      }
      syncManuscriptAnswerKeyPreview();
    }

    async function beginManuscriptEdit(item) {
      if (!item || !manuscriptForm) return;
      const questionID = Number(item.question_id || 0);
      const versionNo = Number(item.version_no || 0);
      if (questionID <= 0 || versionNo <= 0) return;

      if (manuscriptQuestionSelect) {
        manuscriptQuestionSelect.value = String(questionID);
      }
      syncManuscriptSubjectState();
      applyManuscriptTypeUI(true);
      setQuillHTMLValue(manuscriptStimulusQuill, item.stimulus_html);
      setQuillHTMLValue(manuscriptStemQuill, item.stem_html);
      setQuillHTMLValue(manuscriptExplanationQuill, item.explanation_html);
      setQuillHTMLValue(manuscriptHintQuill, item.hint_html);
      syncManuscriptHiddenInputs();

      const keyObj = parseAnswerKeyObject(item.answer_key);
      if (currentManuscriptQuestionType === "benar_salah_pernyataan") {
        renderTFStatementsFromData(keyObj.statements);
      } else {
        renderManuscriptOptionsFromData(item.options);
      }
      applyManuscriptTypeUI(false);
      applyAnswerKeyToManuscriptUI(keyObj);

      setManuscriptEditMode(questionID, versionNo);
      manuscriptForm.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    async function previewManuscriptVersion(item) {
      if (!item || !manuscriptPreviewContent) return;
      const keyObj = parseAnswerKeyObject(item.answer_key);
      const safeJSON = escapeHtml(JSON.stringify(keyObj, null, 2));
      const stem = String(item.stem_html || "").trim();
      const explanation = String(item.explanation_html || "").trim();
      const hint = String(item.hint_html || "").trim();
      const options = Array.isArray(item.options) ? item.options : [];
      const stimulusHTML = String(item.stimulus_html || "").trim()
        ? String(item.stimulus_html || "").trim()
        : '<div class="muted">(tanpa stimulus)</div>';
      const optionsHTML = options.length
        ? options
            .map(function (it) {
              return (
                '<div class="mt"><strong>' +
                escapeHtml(String((it && it.option_key) || "")) +
                "</strong><div>" +
                String((it && it.option_html) || "") +
                "</div></div>"
              );
            })
            .join("")
        : '<div class="muted">Tidak ada opsi tersimpan.</div>';
      if (manuscriptPreviewTitle) {
        text(
          manuscriptPreviewTitle,
          "Detail Naskah Q" +
            String(item.question_id || "-") +
            " v" +
            String(item.version_no || "-"),
        );
      }
      manuscriptPreviewContent.innerHTML = [
        '<div class="mt preview-grid">' +
          '<div class="preview-col">' +
          '<div><strong>Stimulus:</strong><div class="box mt">' +
          stimulusHTML +
          "</div></div>" +
          '<div class="mt"><strong>Stem:</strong><div class="box mt">' +
          (stem || '<span class="muted">(kosong)</span>') +
          "</div></div>" +
          "</div>" +
          '<div class="preview-col">' +
          '<div><strong>Opsi:</strong><div class="box mt">' +
          optionsHTML +
          "</div></div>" +
          '<div class="mt"><strong>Answer Key:</strong><pre class="code-box">' +
          safeJSON +
          "</pre></div>" +
          "</div>" +
          "</div>",
        '<div class="mt"><strong>Penjelasan:</strong><div class="box mt">' +
          (explanation || '<span class="muted">(kosong)</span>') +
          "</div></div>",
        '<div class="mt"><strong>Hint:</strong><div class="box mt">' +
          (hint || '<span class="muted">(kosong)</span>') +
          "</div></div>",
      ].join("");
      if (
        manuscriptPreviewDialog &&
        typeof manuscriptPreviewDialog.showModal === "function"
      ) {
        manuscriptPreviewDialog.showModal();
      }
    }

    function isBlankHTML(value) {
      const raw = String(value || "").trim();
      if (!raw) return true;
      const plain = raw
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
      return !plain;
    }

    function activateGuruMenu(menu) {
      const allowed = [
        "dashboard",
        "reviews",
        "learning-goals",
        "blueprints",
        "manuscripts",
        "exams",
        "results",
        "subjects",
      ];
      const key = allowed.includes(menu) ? menu : "dashboard";
      const buildCountDesc = function (base, noun, total) {
        if (total <= 0) return base + " Anda belum membuat " + noun + ".";
        return (
          base + " Saat ini ada " + String(total) + " " + String(noun) + "."
        );
      };
      const buildSubjectsDesc = function () {
        const total = Number(
          Array.isArray(subjectsCache) ? subjectsCache.length : 0,
        );
        return buildCountDesc(
          "Kelola daftar mapel yang tersedia.",
          "mapel",
          total,
        );
      };
      const buildLearningGoalsDesc = function () {
        const total = Number(
          Array.isArray(learningGoalsCache) ? learningGoalsCache.length : 0,
        );
        return buildCountDesc(
          "Kelola tujuan pembelajaran per mapel dan jenjang.",
          "tujuan pembelajaran",
          total,
        );
      };
      const buildManuscriptsDesc = function () {
        const total = Number(
          Array.isArray(manuscriptAllItems) ? manuscriptAllItems.length : 0,
        );
        if (total <= 0) {
          return "Kelola naskah soal berbasis blueprint. Belum ada versi naskah.";
        }
        return (
          "Kelola naskah soal berbasis blueprint. Saat ini ada " +
          String(total) +
          " versi naskah."
        );
      };
      const buildExamsDesc = function () {
        const total = Number(
          Array.isArray(examsManageCache) ? examsManageCache.length : 0,
        );
        return buildCountDesc(
          "Kelola paket ujian dan jadwal pelaksanaan.",
          "ujian",
          total,
        );
      };
      const buildResultsDesc = function () {
        const total = Number(resultsAssignmentsCount || 0);
        if (total <= 0) {
          return "Lihat hasil dan performa peserta. Belum ada peserta ujian yang dimuat.";
        }
        return (
          "Lihat hasil dan performa peserta. Saat ini ada " +
          String(total) +
          " peserta terdaftar pada ujian terpilih."
        );
      };
      menuButtons.forEach(function (btn) {
        const active = btn.getAttribute("data-guru-menu") === key;
        btn.classList.toggle("active", active);
      });
      if (dashboardPanel) dashboardPanel.hidden = key !== "dashboard";
      if (reviewsPanel) reviewsPanel.hidden = key !== "reviews";
      if (learningGoalsPanel)
        learningGoalsPanel.hidden = key !== "learning-goals";
      if (blueprintsPanel) blueprintsPanel.hidden = key !== "blueprints";
      if (manuscriptsPanel) manuscriptsPanel.hidden = key !== "manuscripts";
      if (examsPanel) examsPanel.hidden = key !== "exams";
      if (resultsPanel) resultsPanel.hidden = key !== "results";
      if (subjectsPanel) subjectsPanel.hidden = key !== "subjects";
      const guruTitles = {
        dashboard: {
          title: "Dashboard Guru",
          desc: "Ringkasan workflow penyusunan naskah soal dan ujian.",
        },
        reviews: {
          title: "Review Soal",
          desc: "Tinjau dan validasi soal yang perlu review.",
        },
        "learning-goals": {
          title: "Tujuan Pembelajaran",
          desc: buildLearningGoalsDesc(),
        },
        blueprints: {
          title: "Blueprint",
          desc: "Susun blueprint sebagai kerangka penyusunan soal.",
        },
        manuscripts: {
          title: "Naskah Soal",
          desc: buildManuscriptsDesc(),
        },
        exams: {
          title: "Pengelolaan Pelaksanaan Ujian",
          desc: buildExamsDesc(),
        },
        results: {
          title: "Hasil Ujian",
          desc: buildResultsDesc(),
        },
        subjects: {
          title: "Mata Pelajaran",
          desc: buildSubjectsDesc(),
        },
      };
      const info = guruTitles[key] || guruTitles.dashboard;
      if (guruPageTitle) guruPageTitle.textContent = info.title;
      if (guruPageDesc) guruPageDesc.textContent = info.desc;
    }

    function subjectLabel(it) {
      const level = String((it && it.education_level) || "").trim();
      const stype = String((it && it.subject_type) || "").trim();
      const name = String((it && it.name) || "").trim();
      return [level, stype, name].filter(Boolean).join(" | ");
    }

    function fillSubjectSelect(selectEl, withAllOption) {
      if (!selectEl) return;
      const current = String(selectEl.value || "");
      selectEl.innerHTML = "";
      if (withAllOption) {
        const allOpt = document.createElement("option");
        allOpt.value = "";
        allOpt.textContent = "Semua Mapel";
        selectEl.appendChild(allOpt);
      }
      subjectsCache.forEach(function (it) {
        const opt = document.createElement("option");
        opt.value = String(it.id || "");
        opt.textContent = subjectLabel(it);
        if (current && current === String(it.id || "")) opt.selected = true;
        selectEl.appendChild(opt);
      });
      if (!selectEl.value && selectEl.options.length > 0) {
        selectEl.selectedIndex = 0;
      }
    }

    function findSubjectByID(subjectID) {
      return subjectsCache.find(function (it) {
        return Number((it && it.id) || 0) === Number(subjectID || 0);
      });
    }

    function filterLearningGoalsBySubject(subjectID) {
      const subject = findSubjectByID(subjectID);
      if (!subject) return [];
      const mapel = String((subject && subject.name) || "")
        .trim()
        .toLowerCase();
      const kelas = String((subject && subject.education_level) || "")
        .trim()
        .toLowerCase();
      const matches = (
        Array.isArray(learningGoalsCache) ? learningGoalsCache : []
      ).filter(function (it) {
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
      // Fallback: if kelas doesn't match (e.g., kelas is class name), show by mapel only.
      return (
        Array.isArray(learningGoalsCache) ? learningGoalsCache : []
      ).filter(function (it) {
        return (
          String((it && it.mata_pelajaran) || "")
            .trim()
            .toLowerCase() === mapel
        );
      });
    }

    function resolveDefaultLearningGoalID(subjectID) {
      const goals = filterLearningGoalsBySubject(subjectID);
      if (!goals.length) return 0;
      return Number((goals[0] && goals[0].id) || 0);
    }

    function fillLearningGoalSelect(selectEl, subjectID) {
      if (!selectEl) return;
      const current = String(selectEl.value || "");
      selectEl.innerHTML = "";
      const firstOpt = document.createElement("option");
      firstOpt.value = "";
      firstOpt.textContent = "Pilih tujuan pembelajaran";
      selectEl.appendChild(firstOpt);
      const goals = filterLearningGoalsBySubject(subjectID);
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

    function renderLearningGoals(items) {
      if (!learningGoalBody) return;
      if (!Array.isArray(items) || items.length === 0) {
        learningGoalBody.innerHTML =
          '<tr><td colspan="7" class="muted">Belum ada data tujuan pembelajaran.</td></tr>';
        if (learningGoalPageInfo)
          learningGoalPageInfo.textContent = "Baris 0 - 0";
        if (learningGoalPrevBtn) learningGoalPrevBtn.disabled = true;
        if (learningGoalNextBtn) learningGoalNextBtn.disabled = true;
        return;
      }
      const total = items.length;
      const totalPages = Math.max(
        1,
        Math.ceil(total / Math.max(1, learningGoalPageSize)),
      );
      if (learningGoalPage > totalPages) learningGoalPage = totalPages;
      if (learningGoalPage < 1) learningGoalPage = 1;
      const start = (learningGoalPage - 1) * learningGoalPageSize;
      const pageItems = items.slice(start, start + learningGoalPageSize);
      const from = pageItems.length ? start + 1 : 0;
      const to = pageItems.length ? start + pageItems.length : 0;
      if (learningGoalPageInfo) {
        learningGoalPageInfo.textContent =
          "Baris " +
          String(from) +
          " - " +
          String(to) +
          " dari " +
          String(total);
      }
      if (learningGoalPrevBtn)
        learningGoalPrevBtn.disabled = learningGoalPage <= 1;
      if (learningGoalNextBtn)
        learningGoalNextBtn.disabled = learningGoalPage >= totalPages;
      learningGoalBody.innerHTML = "";
      pageItems.forEach(function (it) {
        const tr = document.createElement("tr");
        tr.innerHTML = [
          "<td>" + escapeHtml(String(it.id || "")) + "</td>",
          "<td>" + escapeHtml(String(it.mata_pelajaran || "")) + "</td>",
          "<td>" + escapeHtml(String(it.kelas || "")) + "</td>",
          "<td>" + escapeHtml(String(it.semester || "")) + "</td>",
          "<td>" + escapeHtml(String(it.materi || "")) + "</td>",
          "<td>" + escapeHtml(String(it.tujuan_pembelajaran || "")) + "</td>",
          '<td><span class="action-icons">' +
            '<button class="icon-only-btn" type="button" data-action="view-learning-goal" data-id="' +
            escapeHtml(String(it.id || "")) +
            '" title="Lihat" aria-label="Lihat">' +
            '<svg viewBox="0 0 24 24" focusable="false"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>' +
            "</button>" +
            '<button class="icon-only-btn" type="button" data-action="edit-learning-goal" data-id="' +
            escapeHtml(String(it.id || "")) +
            '" title="Ubah" aria-label="Ubah">' +
            '<svg viewBox="0 0 24 24" focusable="false"><path d="M3 17.25V21h3.75L17.8 9.95l-3.75-3.75L3 17.25z"/><path d="M14.05 6.2l3.75 3.75"/></svg>' +
            "</button>" +
            '<button class="icon-only-btn danger" type="button" data-action="delete-learning-goal" data-id="' +
            escapeHtml(String(it.id || "")) +
            '" title="Hapus" aria-label="Hapus">' +
            '<svg viewBox="0 0 24 24" focusable="false"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>' +
            "</button>" +
            "</span></td>",
        ].join("");
        learningGoalBody.appendChild(tr);
      });
    }

    function getFilteredLearningGoals() {
      const q = String(learningGoalSearch || "")
        .trim()
        .toLowerCase();
      if (!q)
        return Array.isArray(learningGoalsCache) ? learningGoalsCache : [];
      const rows = Array.isArray(learningGoalsCache) ? learningGoalsCache : [];
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

    function findLearningGoalByID(id) {
      return (Array.isArray(learningGoalsCache) ? learningGoalsCache : []).find(
        function (it) {
          return Number((it && it.id) || 0) === Number(id || 0);
        },
      );
    }

    function resetLearningGoalFormMode() {
      learningGoalEditingID = 0;
      if (learningGoalForm) {
        const idField = learningGoalForm.elements.namedItem("id");
        if (idField) idField.value = "";
      }
      if (learningGoalSubmitBtn) {
        text(learningGoalSubmitBtn, "Simpan Tujuan Pembelajaran");
      }
      if (learningGoalCancelEditBtn) {
        learningGoalCancelEditBtn.hidden = true;
      }
    }

    function fillLearningGoalViewPopup(item) {
      if (!learningGoalViewContent) return;
      learningGoalViewContent.innerHTML = [
        "<p><strong>ID:</strong> " +
          escapeHtml(String(item.id || "-")) +
          "</p>",
        "<p><strong>Mapel:</strong> " +
          escapeHtml(String(item.mata_pelajaran || "-")) +
          "</p>",
        "<p><strong>Kelas:</strong> " +
          escapeHtml(String(item.kelas || "-")) +
          "</p>",
        "<p><strong>Semester:</strong> " +
          escapeHtml(String(item.semester || "-")) +
          "</p>",
        "<p><strong>Materi:</strong> " +
          escapeHtml(String(item.materi || "-")) +
          "</p>",
        "<p><strong>Tujuan:</strong><br>" +
          escapeHtml(String(item.tujuan_pembelajaran || "-")) +
          "</p>",
      ].join("");
    }

    function startLearningGoalEdit(item) {
      if (!learningGoalForm || !item) return;
      const idField = learningGoalForm.elements.namedItem("id");
      const mapelField = learningGoalForm.elements.namedItem("mata_pelajaran");
      const kelasField = learningGoalForm.elements.namedItem("kelas");
      const semesterField = learningGoalForm.elements.namedItem("semester");
      const materiField = learningGoalForm.elements.namedItem("materi");
      const tujuanField = learningGoalForm.elements.namedItem(
        "tujuan_pembelajaran",
      );

      learningGoalEditingID = Number(item.id || 0);
      if (idField) idField.value = String(item.id || "");
      if (mapelField) mapelField.value = String(item.mata_pelajaran || "");
      if (kelasField) kelasField.value = String(item.kelas || "");
      if (semesterField) semesterField.value = String(item.semester || "");
      if (materiField) materiField.value = String(item.materi || "");
      if (tujuanField) {
        tujuanField.value = String(item.tujuan_pembelajaran || "");
      }
      if (learningGoalSubmitBtn) {
        text(learningGoalSubmitBtn, "Simpan Perubahan");
      }
      if (learningGoalCancelEditBtn) {
        learningGoalCancelEditBtn.hidden = false;
      }
    }

    async function loadClassesForLearningGoal() {
      try {
        const classes = await api("/api/v1/admin/classes?all=1", "GET");
        if (!learningGoalKelasInput) return;
        learningGoalKelasInput.innerHTML =
          '<option value="">Pilih Kelas</option>';
        if (Array.isArray(classes)) {
          classes.forEach(function (it) {
            const opt = document.createElement("option");
            opt.value = String(it.name || "");
            opt.textContent = String(it.name || "");
            learningGoalKelasInput.appendChild(opt);
          });
        }
      } catch (err) {
        console.error("Gagal memuat data kelas:", err);
      }
    }

    function fillLearningGoalSubjectSelect() {
      if (!learningGoalMapelInput) return;
      learningGoalMapelInput.innerHTML =
        '<option value="">Pilih Mata Pelajaran</option>';
      subjectsCache.forEach(function (it) {
        const opt = document.createElement("option");
        const label = subjectLabel(it);
        opt.value = String(it.name || "");
        opt.textContent = label;
        learningGoalMapelInput.appendChild(opt);
      });
    }

    async function loadLearningGoals() {
      const items = await api("/api/v1/learning-goals", "GET");
      learningGoalsCache = Array.isArray(items) ? items : [];
      if (learningGoalsPanel && !learningGoalsPanel.hidden) {
        activateGuruMenu("learning-goals");
      }
      renderLearningGoals(getFilteredLearningGoals());
      fillLearningGoalSelect(
        manuscriptLearningGoalSelect,
        getManuscriptTargetSubjectID(),
      );
      return learningGoalsCache;
    }

    function questionCodeLabel(it) {
      const code = String(
        (it && (it.code || it.question_code || it.question_code_code)) || "",
      ).trim();
      const name = String(
        (it && (it.name || it.question_code_name)) || "",
      ).trim();
      if (code && name) return code + " - " + name;
      if (code || name) return code || name;
      const id = Number((it && (it.question_code_id || it.id)) || 0);
      if (id > 0) {
        const cached = findQuestionCodeByID(id);
        if (cached && cached !== it) {
          const cachedCode = String(
            (cached &&
              (cached.code ||
                cached.question_code ||
                cached.question_code_code)) ||
              "",
          ).trim();
          const cachedName = String(
            (cached && (cached.name || cached.question_code_name)) || "",
          ).trim();
          if (cachedCode && cachedName) return cachedCode + " - " + cachedName;
          if (cachedCode || cachedName) return cachedCode || cachedName;
        }
      }
      return "-";
    }

    function findQuestionCodeByID(id) {
      return (Array.isArray(questionCodesCache) ? questionCodesCache : []).find(
        function (it) {
          return Number((it && it.id) || 0) === Number(id || 0);
        },
      );
    }

    function resetQuestionCodeFormMode() {
      questionCodeEditingID = 0;
      if (!questionCodeForm) return;
      const idField = questionCodeForm.elements.namedItem("id");
      if (idField) idField.value = "";
      const submitBtn = document.getElementById(
        "guru-question-code-submit-btn",
      );
      if (submitBtn) submitBtn.textContent = "Simpan Kode Soal";
      if (questionCodeCancelBtn) questionCodeCancelBtn.hidden = true;
    }

    function fillQuestionCodeSubjectSelect(selectedID) {
      if (!questionCodeSubjectSelect) return;
      const selected = Number(selectedID || 0);
      questionCodeSubjectSelect.innerHTML =
        '<option value="">Pilih mapel</option>';
      subjectsCache.forEach(function (it) {
        const id = Number((it && it.id) || 0);
        if (id <= 0) return;
        const opt = document.createElement("option");
        opt.value = String(id);
        opt.textContent = subjectLabel(it);
        if (selected > 0 && selected === id) opt.selected = true;
        questionCodeSubjectSelect.appendChild(opt);
      });
    }

    function fillQuestionCodeSelect(selectEl, subjectID, includeEmpty) {
      if (!selectEl) return;
      const current = String(selectEl.value || "");
      const sid = Number(subjectID || 0);
      const list = (Array.isArray(questionCodesCache) ? questionCodesCache : [])
        .filter(function (it) {
          const rowSubjectID = Number((it && it.subject_id) || 0);
          return sid <= 0 || rowSubjectID === sid;
        })
        .sort(function (a, b) {
          return String((a && a.code) || "").localeCompare(
            String((b && b.code) || ""),
            "id",
          );
        });
      selectEl.innerHTML = "";
      if (includeEmpty !== false) {
        const empty = document.createElement("option");
        empty.value = "";
        empty.textContent = "Tanpa kode soal";
        selectEl.appendChild(empty);
      }
      list.forEach(function (it) {
        const opt = document.createElement("option");
        opt.value = String(it.id || "");
        opt.textContent = questionCodeLabel(it);
        if (current && current === String(it.id || "")) opt.selected = true;
        selectEl.appendChild(opt);
      });
    }

    function renderQuestionCodes(items) {
      if (!questionCodeBody) return;
      if (!Array.isArray(items) || !items.length) {
        questionCodeBody.innerHTML =
          '<tr><td colspan="5" class="muted">Belum ada data kode soal.</td></tr>';
        return;
      }
      questionCodeBody.innerHTML = "";
      items.forEach(function (it) {
        const subject = subjectsCache.find(function (row) {
          return Number((row && row.id) || 0) === Number(it.subject_id || 0);
        });
        const tr = document.createElement("tr");
        tr.innerHTML = [
          "<td>" + escapeHtml(String(it.id || "")) + "</td>",
          "<td>" + escapeHtml(subjectLabel(subject || {})) + "</td>",
          "<td>" + escapeHtml(String(it.code || "")) + "</td>",
          "<td>" + escapeHtml(String(it.name || "-")) + "</td>",
          '<td><span class="action-icons">' +
            '<button class="icon-only-btn" type="button" data-question-code-action="edit" data-id="' +
            escapeHtml(String(it.id || "")) +
            '" title="Ubah" aria-label="Ubah">' +
            '<svg viewBox="0 0 24 24" focusable="false"><path d="M3 17.25V21h3.75L17.8 9.95l-3.75-3.75L3 17.25z"/><path d="M14.05 6.2l3.75 3.75"/></svg>' +
            "</button>" +
            '<button class="icon-only-btn danger" type="button" data-question-code-action="delete" data-id="' +
            escapeHtml(String(it.id || "")) +
            '" title="Hapus" aria-label="Hapus">' +
            '<svg viewBox="0 0 24 24" focusable="false"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>' +
            "</button>" +
            "</span></td>",
        ].join("");
        questionCodeBody.appendChild(tr);
      });
    }

    async function loadQuestionCodes(subjectID) {
      const items = await api("/api/v1/question-codes", "GET");
      questionCodesCache = Array.isArray(items) ? items : [];
      const sid = Number(subjectID || 0);
      const rows =
        sid > 0
          ? questionCodesCache.filter(function (it) {
              return Number((it && it.subject_id) || 0) === sid;
            })
          : questionCodesCache;
      renderQuestionCodes(rows);
      fillQuestionCodeSelect(
        manuscriptQuestionCodeSelect,
        getManuscriptTargetSubjectID(),
        true,
      );
      fillExamQuestionCodeSelectByExam(
        Number(
          (examQuestionCodeRuleExamIDInput &&
            examQuestionCodeRuleExamIDInput.value) ||
            (questionExamIDInput && questionExamIDInput.value) ||
            0,
        ),
      );
      return questionCodesCache;
    }

    function getExamManageByID(examID) {
      return (Array.isArray(examsManageCache) ? examsManageCache : []).find(
        function (it) {
          return Number((it && it.id) || 0) === Number(examID || 0);
        },
      );
    }

    function fillExamQuestionCodeSelectByExam(examID) {
      const id = Number(examID || 0);
      const exam = getExamManageByID(id);
      const subjectID = Number((exam && exam.subject_id) || 0);
      fillQuestionCodeSelect(examQuestionCodeSelect, subjectID, false);
      if (
        examQuestionCodeSelect &&
        examQuestionCodeSelect.options.length === 0
      ) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "Belum ada kode soal mapel ini";
        examQuestionCodeSelect.appendChild(opt);
      }
    }

    function renderExamQuestionCodeRules(items) {
      if (!examQuestionCodeRuleBody) return;
      if (!Array.isArray(items) || !items.length) {
        examQuestionCodeRuleBody.innerHTML =
          '<tr><td colspan="5" class="muted">Belum ada rule kode soal untuk ujian ini.</td></tr>';
        return;
      }
      examQuestionCodeRuleBody.innerHTML = "";
      items.forEach(function (it) {
        const tr = document.createElement("tr");
        tr.innerHTML = [
          "<td>" + escapeHtml(questionCodeLabel(it)) + "</td>",
          "<td>" + escapeHtml(String(it.strategy || "")) + "</td>",
          "<td>" + escapeHtml(String(it.pick_count || "-")) + "</td>",
          "<td>" + escapeHtml(String(it.weight || 1)) + "</td>",
          '<td><button class="icon-only-btn danger" type="button" data-exam-code-rule-del="' +
            escapeHtml(String(it.question_code_id || "")) +
            '" title="Hapus rule" aria-label="Hapus rule">' +
            '<svg viewBox="0 0 24 24" focusable="false"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>' +
            "</button></td>",
        ].join("");
        examQuestionCodeRuleBody.appendChild(tr);
      });
    }

    async function loadExamQuestionCodeRules(examID) {
      if (!examQuestionCodeRuleBody) return [];
      const id = Number(examID || 0);
      if (id <= 0) {
        renderExamQuestionCodeRules([]);
        return [];
      }
      const rows = await api(
        "/api/v1/admin/exams/" + id + "/question-codes",
        "GET",
      );
      const items = Array.isArray(rows) ? rows : [];
      renderExamQuestionCodeRules(items);
      return items;
    }

    function blueprintLabel(it) {
      const title = String((it && it.title) || "").trim();
      const subject = String((it && it.subject_name) || "").trim();
      const code = String((it && it.question_code) || "").trim();
      if (!title && !subject) return String((it && it.id) || "");
      if (!subject) return title;
      if (!title) return "#" + String((it && it.id) || "") + " - " + subject;
      const base =
        "#" +
        String((it && it.id) || "") +
        " - " +
        title +
        " (" +
        subject +
        ")";
      if (!code) return base;
      return base + " [" + code + "]";
    }

    function fillBlueprintSelect(selectEl) {
      if (!selectEl) return;
      const current = String(selectEl.value || "");
      selectEl.innerHTML = "";
      const firstOpt = document.createElement("option");
      firstOpt.value = "";
      firstOpt.textContent = "Pilih Soal";
      selectEl.appendChild(firstOpt);
      blueprintsCache.forEach(function (it) {
        const opt = document.createElement("option");
        opt.value = String(it.id || "");
        opt.textContent = blueprintLabel(it);
        if (current && current === String(it.id || "")) opt.selected = true;
        selectEl.appendChild(opt);
      });
      if (selectEl === manuscriptQuestionSelect) {
        if (!selectEl.value && selectEl.options.length > 1) {
          selectEl.selectedIndex = 1;
        }
      }
    }

    async function loadAllManuscriptVersionsFromBlueprints() {
      const qids = Array.from(
        new Set(
          (Array.isArray(blueprintsCache) ? blueprintsCache : [])
            .map(function (it) {
              return Number((it && it.id) || 0);
            })
            .filter(function (v) {
              return v > 0;
            }),
        ),
      );
      if (!qids.length) return [];
      const settled = await Promise.allSettled(
        qids.map(function (qid) {
          return api("/api/v1/questions/" + qid + "/versions", "GET");
        }),
      );
      return settled
        .map(function (it) {
          return it && it.status === "fulfilled" ? it.value : [];
        })
        .reduce(function (acc, rows) {
          if (Array.isArray(rows)) return acc.concat(rows);
          return acc;
        }, [])
        .sort(function (a, b) {
          const ta = new Date(a && a.created_at ? a.created_at : 0).getTime();
          const tb = new Date(b && b.created_at ? b.created_at : 0).getTime();
          if (tb !== ta) return tb - ta;
          const qa = Number((a && a.question_id) || 0);
          const qb = Number((b && b.question_id) || 0);
          if (qb !== qa) return qb - qa;
          return (
            Number((b && b.version_no) || 0) - Number((a && a.version_no) || 0)
          );
        });
    }

    function openSubjectDialog(editItem) {
      if (!subjectDialogForm || !subjectDialog) return;
      subjectDialogForm.reset();
      const idEl = subjectDialogForm.elements.namedItem("id");
      const typeEl = subjectDialogForm.elements.namedItem("subject_type");
      const nameEl = subjectDialogForm.elements.namedItem("name");
      if (idEl) idEl.value = editItem ? String(editItem.id || "") : "";
      fillSubjectEducationLevelSelect(
        editItem ? String(editItem.education_level || "") : "",
      );
      if (typeEl)
        typeEl.value = editItem ? String(editItem.subject_type || "") : "";
      if (nameEl) nameEl.value = editItem ? String(editItem.name || "") : "";
      if (subjectDialogTitle) {
        subjectDialogTitle.textContent = editItem
          ? "Ubah Mapel"
          : "Tambah Mapel";
      }
      if (typeof subjectDialog.showModal === "function") {
        subjectDialog.showModal();
      }
    }

    function openSubjectDeleteDialog(item) {
      if (!subjectDeleteDialog || !subjectDeleteForm) return;
      const idEl = subjectDeleteForm.elements.namedItem("id");
      if (idEl) idEl.value = String((item && item.id) || "");
      if (subjectDeleteLabel) {
        text(
          subjectDeleteLabel,
          "Mapel '" + String((item && item.name) || "") + "' akan dihapus.",
        );
      }
      if (typeof subjectDeleteDialog.showModal === "function") {
        subjectDeleteDialog.showModal();
      }
    }

    function renderBlueprints(items) {
      if (!blueprintBody) return;
      if (!Array.isArray(items) || items.length === 0) {
        blueprintBody.innerHTML =
          '<tr><td colspan="8" class="muted">Tidak ada data kisi-kisi.</td></tr>';
        return;
      }
      blueprintBody.innerHTML = "";
      items.forEach(function (it) {
        const tr = document.createElement("tr");
        tr.innerHTML = [
          "<td>" + escapeHtml(String(it.id || "")) + "</td>",
          "<td>" + escapeHtml(String(it.subject_name || "")) + "</td>",
          "<td>" + escapeHtml(shortQuestionType(it.question_type)) + "</td>",
          "<td>" + escapeHtml(String(it.title || "-")) + "</td>",
          "<td>" + escapeHtml(String(it.indicator || "-")) + "</td>",
          "<td>" + escapeHtml(String(it.material || "-")) + "</td>",
          "<td>" + escapeHtml(String(it.cognitive_level || "-")) + "</td>",
          "<td>" + escapeHtml(fmtDate(it.created_at)) + "</td>",
        ].join("");
        blueprintBody.appendChild(tr);
      });
    }

    function isManuscriptDeletable(item) {
      return !!item;
    }

    function manuscriptRowKey(item) {
      const qid = Number((item && item.question_id) || 0);
      const ver = Number((item && item.version_no) || 0);
      return String(qid) + ":" + String(ver);
    }

    const manuscriptSelectedKeys = new Set();

    function updateManuscriptBulkState(items) {
      if (!manuscriptBulkDeleteBtn || !manuscriptSelectAll) return;
      const rows = Array.isArray(items) ? items : [];
      const deletableRows = rows.filter(isManuscriptDeletable);
      const selectableCount = deletableRows.length;
      const selectedCount = deletableRows.filter(function (it) {
        return manuscriptSelectedKeys.has(manuscriptRowKey(it));
      }).length;
      manuscriptBulkDeleteBtn.disabled = selectedCount === 0;
      if (manuscriptDeleteAllBtn) {
        manuscriptDeleteAllBtn.disabled = selectableCount === 0;
      }
      if (selectableCount === 0) {
        manuscriptSelectAll.checked = false;
        manuscriptSelectAll.indeterminate = false;
        manuscriptSelectAll.disabled = true;
        return;
      }
      manuscriptSelectAll.disabled = false;
      manuscriptSelectAll.checked =
        selectedCount > 0 && selectedCount === selectableCount;
      manuscriptSelectAll.indeterminate =
        selectedCount > 0 && selectedCount < selectableCount;
    }

    function pruneManuscriptSelections(items) {
      const rows = Array.isArray(items) ? items : [];
      const valid = new Set(
        rows.map(function (it) {
          return manuscriptRowKey(it);
        }),
      );
      Array.from(manuscriptSelectedKeys).forEach(function (key) {
        if (!valid.has(key)) manuscriptSelectedKeys.delete(key);
      });
    }

    function renderManuscriptRows(items) {
      if (!manuscriptBody) return;
      if (!Array.isArray(items) || items.length === 0) {
        manuscriptBody.innerHTML =
          '<tr><td colspan="8" class="muted">Belum ada data versi naskah.</td></tr>';
        updateManuscriptBulkState([]);
        return;
      }
      manuscriptBody.innerHTML = "";
      items.forEach(function (it) {
        const key = manuscriptRowKey(it);
        const deletable = isManuscriptDeletable(it);
        const tr = document.createElement("tr");
        tr.innerHTML = [
          '<td><input type="checkbox" data-manuscript-select="' +
            escapeHtml(key) +
            '"' +
            (deletable ? "" : ' disabled aria-disabled="true"') +
            (manuscriptSelectedKeys.has(key) ? " checked" : "") +
            " /></td>",
          "<td>" +
            escapeHtml(resolveManuscriptQuestionCode(it) || "-") +
            "</td>",
          "<td>" +
            escapeHtml(resolveManuscriptLearningGoal(it) || "-") +
            "</td>",
          "<td>" + escapeHtml(previewText(it.stimulus_html, 70)) + "</td>",
          "<td>" + escapeHtml(previewText(it.stem_html, 90)) + "</td>",
          "<td>" +
            escapeHtml(shortQuestionType(resolveManuscriptQuestionType(it))) +
            "</td>",
          "<td>" + escapeHtml(fmtDate(it.created_at)) + "</td>",
        ].join("");

        const tdAction = document.createElement("td");
        const actionWrap = document.createElement("span");
        actionWrap.className = "action-icons";
        const qid = Number((it && it.question_id) || 0);
        const ver = Number((it && it.version_no) || 0);
        const iconMap = {
          "preview-manuscript":
            '<svg viewBox="0 0 24 24" focusable="false"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>',
          "edit-manuscript":
            '<svg viewBox="0 0 24 24" focusable="false"><path d="M3 17.25V21h3.75L17.8 9.95l-3.75-3.75L3 17.25z"/><path d="M14.05 6.2l3.75 3.75"/></svg>',
          "delete-manuscript":
            '<svg viewBox="0 0 24 24" focusable="false"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>',
        };
        [
          { action: "preview-manuscript", title: "Lihat", danger: false },
          { action: "edit-manuscript", title: "Ubah", danger: false },
          { action: "delete-manuscript", title: "Hapus", danger: true },
        ].forEach(function (cfg) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = cfg.danger ? "icon-only-btn danger" : "icon-only-btn";
          btn.setAttribute("data-action", cfg.action);
          btn.setAttribute("data-question-id", String(qid));
          btn.setAttribute("data-version-no", String(ver));
          btn.setAttribute("title", cfg.title);
          btn.setAttribute("aria-label", cfg.title);
          btn.innerHTML = iconMap[cfg.action] || "";
          actionWrap.appendChild(btn);
        });
        tdAction.appendChild(actionWrap);
        tr.appendChild(tdAction);
        manuscriptBody.appendChild(tr);
      });
      updateManuscriptBulkState(items);
    }

    function updateManuscriptPaginationInfo(totalRows, pageRows) {
      if (!manuscriptPageInfo) return;
      if (totalRows <= 0 || pageRows <= 0) {
        manuscriptPageInfo.textContent = "Baris 0 - 0";
        return;
      }
      const from = (manuscriptPage - 1) * manuscriptPageSize + 1;
      const to = from + pageRows - 1;
      manuscriptPageInfo.textContent =
        "Baris " +
        String(from) +
        " - " +
        String(to) +
        " dari " +
        String(totalRows);
    }

    function renderManuscripts(items) {
      if (!manuscriptBody) return;
      manuscriptAllItems = Array.isArray(items) ? items.slice() : [];
      if (manuscriptsPanel && !manuscriptsPanel.hidden) {
        activateGuruMenu("manuscripts");
      }
      manuscriptVersionsCache = manuscriptAllItems.slice();
      const total = manuscriptAllItems.length;
      const totalPages = Math.max(
        1,
        Math.ceil(total / Math.max(1, manuscriptPageSize)),
      );
      if (manuscriptPage > totalPages) manuscriptPage = totalPages;
      if (manuscriptPage < 1) manuscriptPage = 1;
      const start = (manuscriptPage - 1) * manuscriptPageSize;
      const pageRows = manuscriptAllItems.slice(
        start,
        start + manuscriptPageSize,
      );
      pruneManuscriptSelections(manuscriptAllItems);
      renderManuscriptRows(pageRows);
      updateManuscriptPaginationInfo(total, pageRows.length);
      if (manuscriptPrevBtn) manuscriptPrevBtn.disabled = manuscriptPage <= 1;
      if (manuscriptNextBtn)
        manuscriptNextBtn.disabled = manuscriptPage >= totalPages;
    }

    async function reloadManuscriptsByCurrentTableScope(fallbackQuestionID) {
      const questionIDs = Array.from(
        new Set(
          (Array.isArray(manuscriptVersionsCache)
            ? manuscriptVersionsCache
            : []
          )
            .map(function (it) {
              return Number((it && it.question_id) || 0);
            })
            .filter(function (v) {
              return v > 0;
            }),
        ),
      );
      if (!questionIDs.length) {
        const qid = Number(
          fallbackQuestionID ||
            (manuscriptQuestionSelect && manuscriptQuestionSelect.value) ||
            0,
        );
        if (qid <= 0) {
          renderManuscripts([]);
          return;
        }
        const one = await api("/api/v1/questions/" + qid + "/versions", "GET");
        renderManuscripts(Array.isArray(one) ? one : []);
        return;
      }
      const settled = await Promise.allSettled(
        questionIDs.map(function (qid) {
          return api("/api/v1/questions/" + qid + "/versions", "GET");
        }),
      );
      const merged = settled
        .map(function (it) {
          return it && it.status === "fulfilled" ? it.value : [];
        })
        .reduce(function (acc, rows) {
          if (Array.isArray(rows)) return acc.concat(rows);
          return acc;
        }, [])
        .sort(function (a, b) {
          const ta = new Date(a && a.created_at ? a.created_at : 0).getTime();
          const tb = new Date(b && b.created_at ? b.created_at : 0).getTime();
          if (tb !== ta) return tb - ta;
          const qa = Number((a && a.question_id) || 0);
          const qb = Number((b && b.question_id) || 0);
          if (qb !== qa) return qb - qa;
          return (
            Number((b && b.version_no) || 0) - Number((a && a.version_no) || 0)
          );
        });
      renderManuscripts(merged);
    }

    async function findManuscriptItemByKey(questionID, versionNo) {
      const qid = Number(questionID || 0);
      const ver = Number(versionNo || 0);
      if (qid <= 0 || ver <= 0) return null;
      const fromCache = (
        Array.isArray(manuscriptVersionsCache) ? manuscriptVersionsCache : []
      ).find(function (it) {
        return (
          Number((it && it.question_id) || 0) === qid &&
          Number((it && it.version_no) || 0) === ver
        );
      });
      if (fromCache) return fromCache;
      const rows = await api("/api/v1/questions/" + qid + "/versions", "GET");
      const list = Array.isArray(rows) ? rows : [];
      const found = list.find(function (it) {
        return Number((it && it.version_no) || 0) === ver;
      });
      if (found) {
        manuscriptVersionsCache = Array.isArray(manuscriptVersionsCache)
          ? manuscriptVersionsCache.concat([found])
          : [found];
        return found;
      }
      return null;
    }

    async function runManuscriptRowAction(btn, action, questionID, versionNo) {
      let item = null;
      try {
        item = await findManuscriptItemByKey(questionID, versionNo);
      } catch (err) {
        setManuscriptMsg(
          "Gagal memuat data naskah Question " +
            String(questionID) +
            " versi " +
            String(versionNo) +
            ": " +
            String((err && err.message) || "request error"),
        );
        return;
      }
      if (!item) {
        setManuscriptMsg(
          "Data naskah untuk Question " +
            String(questionID) +
            " versi " +
            String(versionNo) +
            " tidak ditemukan.",
        );
        return;
      }

      if (action === "preview-manuscript") {
        await previewManuscriptVersion(item);
        return;
      }
      if (action === "edit-manuscript") {
        const done = beginBusy(btn, msg, "Memuat naskah ke editor...");
        try {
          await beginManuscriptEdit(item);
          setManuscriptMsg(
            "Mode edit aktif untuk Question " +
              String(questionID) +
              " versi " +
              String(versionNo) +
              ".",
          );
        } catch (err) {
          setManuscriptMsg("Gagal memuat naskah untuk edit: " + err.message);
        } finally {
          done();
        }
        return;
      }
      if (action === "delete-manuscript") {
        const ok = window.confirm(
          "Hapus naskah versi " +
            String(versionNo) +
            " untuk Question " +
            String(questionID) +
            "?",
        );
        if (!ok) return;
        const done = beginBusy(btn, msg, "Menghapus naskah...");
        try {
          await api(
            "/api/v1/questions/" + questionID + "/versions/" + versionNo,
            "DELETE",
          );
          if (
            manuscriptEditingQuestionID === questionID &&
            Number(
              (manuscriptEditingVersionNoInput &&
                manuscriptEditingVersionNoInput.value) ||
                0,
            ) === versionNo
          ) {
            clearManuscriptEditMode();
            manuscriptForm && manuscriptForm.reset();
            resetManuscriptEditors();
          }
          await reloadManuscriptsByCurrentTableScope(questionID);
          setManuscriptMsg("Naskah berhasil dihapus.");
        } catch (err) {
          setManuscriptMsg("Hapus naskah gagal: " + err.message);
        } finally {
          done();
        }
        return;
      }
      return;
    }

    async function loadSubjects() {
      const items = await api("/api/v1/subjects", "GET");
      const subjectItems = Array.isArray(items) ? items : [];
      subjectsCache = subjectItems;
      if (subjectsPanel && !subjectsPanel.hidden) {
        activateGuruMenu("subjects");
      }
      const levels = {};
      subjectItems.forEach(function (it) {
        const lvl = String(it.education_level || "").trim();
        if (lvl) levels[lvl] = true;
      });

      if (statSubjects) statSubjects.textContent = String(subjectItems.length);
      if (statLevels)
        statLevels.textContent = String(Object.keys(levels).length);

      if (!subjectsBody) return subjectItems;
      if (!subjectItems.length) {
        subjectsBody.innerHTML =
          '<tr><td colspan="5" class="muted">Tidak ada data mapel.</td></tr>';
        return subjectItems;
      }
      subjectsBody.innerHTML = "";
      subjectItems.forEach(function (it) {
        const actionHTML = canManageSubjects
          ? '<span class="action-icons">' +
            '<button class="icon-only-btn" type="button" data-action="edit-subject" data-id="' +
            escapeHtml(String(it.id || "")) +
            '" title="Ubah" aria-label="Ubah">' +
            '<svg viewBox="0 0 24 24" focusable="false"><path d="M3 17.25V21h3.75L17.8 9.95l-3.75-3.75L3 17.25z"/><path d="M14.05 6.2l3.75 3.75"/></svg>' +
            "</button>" +
            '<button class="icon-only-btn danger" type="button" data-action="delete-subject" data-id="' +
            escapeHtml(String(it.id || "")) +
            '" title="Hapus" aria-label="Hapus">' +
            '<svg viewBox="0 0 24 24" focusable="false"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>' +
            "</button>" +
            "</span>"
          : "-";
        const tr = document.createElement("tr");
        tr.innerHTML = [
          "<td>" + escapeHtml(String(it.id || "")) + "</td>",
          "<td>" + escapeHtml(String(it.education_level || "")) + "</td>",
          "<td>" + escapeHtml(String(it.subject_type || "")) + "</td>",
          "<td>" + escapeHtml(String(it.name || "")) + "</td>",
          "<td>" + actionHTML + "</td>",
        ].join("");
        subjectsBody.appendChild(tr);
      });

      fillSubjectSelect(blueprintSubjectSelect, false);
      fillSubjectSelect(blueprintFilterSubject, true);
      fillSubjectSelect(manuscriptSubjectSelect, false);
      fillSubjectSelect(examSubjectSelect, false);
      fillQuestionCodeSubjectSelect(
        Number(
          (questionCodeSubjectSelect && questionCodeSubjectSelect.value) ||
            (manuscriptSubjectSelect && manuscriptSubjectSelect.value) ||
            0,
        ),
      );
      fillLearningGoalSelect(
        manuscriptLearningGoalSelect,
        getManuscriptTargetSubjectID(),
      );
      if (learningGoalMapelInput || learningGoalKelasInput) {
        const defaultSubject = findSubjectByID(
          Number(
            (manuscriptSubjectSelect && manuscriptSubjectSelect.value) || 0,
          ),
        );
        if (defaultSubject) {
          if (learningGoalMapelInput)
            learningGoalMapelInput.value = String(defaultSubject.name || "");
          if (learningGoalKelasInput)
            learningGoalKelasInput.value = String(
              defaultSubject.education_level || "",
            );
        }
      }
      syncManuscriptSubjectState();
      return subjectItems;
    }

    async function loadBlueprints(subjectID) {
      const id = Number(subjectID || 0);
      const params = new URLSearchParams();
      if (id > 0) params.set("subject_id", String(id));
      params.set(
        "owner_only",
        isOwnerOnlyQuestionsEnabled() ? "true" : "false",
      );
      const qs = params.toString() ? "?" + params.toString() : "";
      const items = await api("/api/v1/questions" + qs, "GET");
      blueprintsCache = Array.isArray(items) ? items : [];
      renderBlueprints(blueprintsCache);
      fillBlueprintSelect(manuscriptQuestionSelect);
      syncManuscriptSubjectState();
      applyManuscriptTypeUI(true);
      return blueprintsCache;
    }

    function buildManuscriptAutoQuestionTitle(stemHTML) {
      const container = document.createElement("div");
      container.innerHTML = String(stemHTML || "");
      const textValue = String(container.textContent || "")
        .replace(/\s+/g, " ")
        .trim();
      if (!textValue) {
        return "Soal Baru";
      }
      const maxLen = 80;
      return textValue.length > maxLen
        ? textValue.slice(0, maxLen - 1) + "..."
        : textValue;
    }

    async function ensureQuestionForManuscriptSubmission(payload) {
      const questionID = Number((payload && payload.question_id) || 0);
      if (questionID > 0) return questionID;
      const subjectID = Number((payload && payload.subject_id) || 0);
      const learningGoalID = Number((payload && payload.learning_goal_id) || 0);
      const questionCodeID = Number((payload && payload.question_code_id) || 0);
      const questionType = String((payload && payload.question_type) || "")
        .trim()
        .toLowerCase();
      if (subjectID <= 0) {
        throw new Error("Mapel wajib dipilih sebelum menyimpan naskah.");
      }
      if (!questionType) {
        throw new Error("Tipe soal wajib dipilih sebelum menyimpan naskah.");
      }
      if (learningGoalID <= 0) {
        throw new Error(
          "Tujuan Pembelajaran wajib dipilih sebelum menyimpan naskah.",
        );
      }
      const created = await api("/api/v1/questions", "POST", {
        subject_id: subjectID,
        learning_goal_id: learningGoalID,
        question_code_id: questionCodeID > 0 ? questionCodeID : null,
        question_type: questionType,
        title: buildManuscriptAutoQuestionTitle(payload.stem_html),
        indicator: "",
        material: "",
        objective: "",
        cognitive_level: "",
      });
      const newQuestionID = Number((created && created.id) || 0);
      if (newQuestionID <= 0) {
        throw new Error("Gagal membuat soal.");
      }
      return newQuestionID;
    }

    async function loadGuruExamSubjectOptions() {
      if (!examSubjectSelect) return;
      const subjects = await api("/api/v1/subjects", "GET");
      examSubjectSelect.innerHTML = '<option value="">Pilih mapel...</option>';
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
        examSubjectSelect.appendChild(o);
      });
    }

    function findExamManageByID(examID) {
      const id = Number(examID || 0);
      if (id <= 0) return null;
      const list = Array.isArray(examsManageCache) ? examsManageCache : [];
      for (let i = 0; i < list.length; i += 1) {
        const it = list[i];
        if (Number((it && it.id) || 0) === id) return it;
      }
      return null;
    }

    async function examHasInProgressAttempt(examID) {
      const id = Number(examID || 0);
      if (id <= 0) return false;
      const rows = await api(
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
      if (examRandomizeQuestionsInput) {
        examRandomizeQuestionsInput.checked = !!examRow.randomize_questions;
      }
      if (examRandomizeOptionsInput) {
        examRandomizeOptionsInput.checked = !!examRow.randomize_options;
      }
    }

    async function preventRandomizeChangeIfExamRunning(nextQ, nextO) {
      const examID = Number(
        (examForm &&
          examForm.elements &&
          examForm.elements.namedItem("exam_id") &&
          examForm.elements.namedItem("exam_id").value) ||
          0,
      );
      if (examID <= 0) return false;
      const examRow = findExamManageByID(examID);
      if (!examRow) return false;
      const changed =
        !!nextQ !== !!examRow.randomize_questions ||
        !!nextO !== !!examRow.randomize_options;
      if (!changed) return false;
      const running = await examHasInProgressAttempt(examID);
      if (!running) return false;
      resetRandomizeInputsToExam(examRow);
      window.alert("Jangan acak saat ini ujian sedang berlangsung");
      setMsg("Perubahan acak diblokir: ada peserta yang sedang mengerjakan.");
      return true;
    }

    async function loadGuruExamManageTable() {
      const exams = await api("/api/v1/admin/exams/manage", "GET");
      examsManageCache = Array.isArray(exams) ? exams : [];
      fillGuruResultsExamSelect();
      if (examsPanel && !examsPanel.hidden) {
        activateGuruMenu("exams");
      }
      if (!examsBody) return;
      if (!Array.isArray(exams) || !exams.length) {
        examsBody.innerHTML =
          '<tr><td colspan="8" class="muted">Belum ada data ujian.</td></tr>';
        return;
      }
      examsBody.innerHTML = "";
      exams.forEach(function (it) {
        const tr = document.createElement("tr");
        tr.innerHTML = [
          "<td>" + escapeHtml(String(it.id || "")) + "</td>",
          "<td>" +
            escapeHtml(String(it.code || "")) +
            "<br><small>" +
            escapeHtml(String(it.title || "")) +
            "</small></td>",
          "<td>" + escapeHtml(String(it.subject_name || "-")) + "</td>",
          "<td>" + escapeHtml(String(it.duration_minutes || 0)) + " menit</td>",
          "<td>" + escapeHtml(String(it.max_attempts || 1)) + "x</td>",
          "<td>" + escapeHtml(String(it.question_count || 0)) + "</td>",
          "<td>" + escapeHtml(String(it.assigned_count || 0)) + "</td>",
          '<td><span class="action-icons">' +
            '<button class="icon-only-btn" type="button" data-exam-action="use" data-id="' +
            escapeHtml(String(it.id || "")) +
            '" title="Pilih Ujian" aria-label="Pilih Ujian">' +
            '<svg viewBox="0 0 24 24" focusable="false"><path d="M5 12h14M13 6l6 6-6 6"/></svg>' +
            "</button>" +
            '<button class="icon-only-btn danger" type="button" data-exam-action="delete" data-id="' +
            escapeHtml(String(it.id || "")) +
            '" title="Nonaktifkan Ujian" aria-label="Nonaktifkan Ujian">' +
            '<svg viewBox="0 0 24 24" focusable="false"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>' +
            "</button>" +
            "</span></td>",
        ].join("");
        examsBody.appendChild(tr);
      });
    }

    function fillGuruResultsExamSelect() {
      if (!resultsExamSelect) return;
      const current = String(resultsExamSelect.value || "");
      resultsExamSelect.innerHTML = '<option value="">Pilih ujian...</option>';
      (Array.isArray(examsManageCache) ? examsManageCache : []).forEach(
        function (it) {
          const examID = Number((it && it.id) || 0);
          if (examID <= 0) return;
          const o = document.createElement("option");
          o.value = String(examID);
          o.textContent =
            "#" +
            String(examID) +
            " - " +
            String((it && it.title) || "") +
            " (" +
            String((it && it.code) || "") +
            ")";
          if (current && current === o.value) o.selected = true;
          resultsExamSelect.appendChild(o);
        },
      );
    }

    async function loadGuruExamQuestions(examID) {
      if (!examQuestionsBody) return;
      if (!examID || examID <= 0) {
        examQuestionsBody.innerHTML =
          '<tr><td colspan="5" class="muted">Pilih exam lalu muat soal ujian.</td></tr>';
        return;
      }
      const items = await api(
        "/api/v1/admin/exams/" + Number(examID) + "/questions",
        "GET",
      );
      if (!Array.isArray(items) || !items.length) {
        examQuestionsBody.innerHTML =
          '<tr><td colspan="5" class="muted">Belum ada soal di ujian ini.</td></tr>';
        return;
      }
      examQuestionsBody.innerHTML = "";
      items.forEach(function (it) {
        const tr = document.createElement("tr");
        tr.innerHTML = [
          "<td>" + escapeHtml(String(it.seq_no || "")) + "</td>",
          "<td>" + escapeHtml(shortQuestionType(it.question_type)) + "</td>",
          "<td>" + escapeHtml(cleanStemPreview(it.stem_preview)) + "</td>",
          "<td>" + escapeHtml(String(it.weight || 1)) + "</td>",
          '<td><button class="icon-only-btn danger" type="button" data-exam-question-del="' +
            escapeHtml(String(it.question_id || "")) +
            '" title="Hapus dari ujian" aria-label="Hapus dari ujian">' +
            '<svg viewBox="0 0 24 24" focusable="false"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>' +
            "</button></td>",
        ].join("");
        examQuestionsBody.appendChild(tr);
      });
    }

    async function loadGuruExamAssignments(examID) {
      if (!resultsAssignmentBody) return;
      if (!examID || examID <= 0) {
        resultsAssignmentsCount = 0;
        latestResultsMatrix = null;
        if (resultsPanel && !resultsPanel.hidden) {
          activateGuruMenu("results");
        }
        if (resultsMatrixHead) {
          resultsMatrixHead.innerHTML =
            "<th>Nama</th><th>Attempt Ke-</th><th>Skor Total</th><th>Nilai</th><th>Start Ujian</th><th>End Ujian</th>";
        }
        resultsAssignmentBody.innerHTML =
          '<tr><td colspan="6" class="muted">Pilih ujian lalu muat hasil ujian peserta.</td></tr>';
        setResultsSummary("Belum ada data hasil ujian.");
        return;
      }
      const matrix = await api(
        "/api/v1/admin/exams/" + Number(examID) + "/results",
        "GET",
      );
      latestResultsMatrix = matrix || null;
      const rows = Array.isArray(matrix && matrix.rows) ? matrix.rows : [];
      const questionNos = Array.isArray(matrix && matrix.question_nos)
        ? matrix.question_nos
        : [];
      resultsAssignmentsCount = rows.length;
      if (resultsPanel && !resultsPanel.hidden) {
        activateGuruMenu("results");
      }
      if (resultsMatrixHead) {
        const fixed = [
          "<th>Nama</th>",
          "<th>Attempt Ke-</th>",
          "<th>Skor Total</th>",
          "<th>Nilai</th>",
          "<th>Start Ujian</th>",
          "<th>End Ujian</th>",
        ];
        const dyn = questionNos.map(function (no) {
          return "<th>" + escapeHtml(String(no)) + "</th>";
        });
        resultsMatrixHead.innerHTML = fixed.concat(dyn).join("");
      }
      if (!rows.length) {
        resultsAssignmentBody.innerHTML =
          '<tr><td colspan="' +
          String(6 + questionNos.length) +
          '" class="muted">Belum ada peserta yang mengikuti ujian ini.</td></tr>';
        setResultsSummary("Belum ada data hasil ujian.");
        setResultsExtra("Belum ada data untuk laporan/statistik/grafik.");
        return;
      }
      resultsAssignmentBody.innerHTML = "";
      rows.forEach(function (it) {
        const answers = Array.isArray(it.answers) ? it.answers : [];
        const answerStates = Array.isArray(it.answer_states)
          ? it.answer_states
          : [];
        const totalQuestions = questionNos.length;
        const scoreValue = Number(it.skor_total || 0);
        const nilai =
          totalQuestions > 0
            ? ((scoreValue / totalQuestions) * 100).toFixed(2)
            : "0.00";
        const answerCells = questionNos.map(function (_, idx) {
          const state = String(answerStates[idx] || "")
            .trim()
            .toLowerCase();
          const cls =
            state === "correct"
              ? "result-cell-correct"
              : state === "wrong"
                ? "result-cell-wrong"
                : "";
          return (
            '<td class="' +
            cls +
            '">' +
            escapeHtml(String(answers[idx] || "")) +
            "</td>"
          );
        });
        const tr = document.createElement("tr");
        tr.innerHTML = [
          "<td>" + escapeHtml(String(it.full_name || "-")) + "</td>",
          "<td>" + escapeHtml(String(it.attempt_ke || 0)) + "</td>",
          "<td>" + escapeHtml(String(scoreValue)) + "</td>",
          "<td>" + escapeHtml(String(nilai)) + "</td>",
          "<td>" + escapeHtml(fmtDate(it.started_at)) + "</td>",
          "<td>" + escapeHtml(fmtDate(it.ended_at)) + "</td>",
        ]
          .concat(answerCells)
          .join("");
        resultsAssignmentBody.appendChild(tr);
      });
      setResultsSummary(
        "Exam #" +
          String((matrix && matrix.exam_id) || examID) +
          " | Attempt tercatat: " +
          String(rows.length) +
          " | Jumlah soal: " +
          String(questionNos.length),
      );
      setResultsExtra(
        "Hasil ujian dimuat. Gunakan Muat Laporan/Statistik/Grafik atau Download Excel.",
      );
    }

    async function loadGuruDashboard() {
      await Promise.all([
        loadEducationLevelsForGuruSubjectForm(),
        loadSubjects(),
        loadLearningGoals(),
        loadClassesForLearningGoal(),
        loadGuruExamSubjectOptions(),
        loadGuruExamManageTable(),
      ]);
      await loadQuestionCodes(
        Number(
          (questionCodeSubjectSelect && questionCodeSubjectSelect.value) || 0,
        ),
      );
      fillLearningGoalSubjectSelect();
      await Promise.all([
        loadBlueprints(
          Number((blueprintFilterSubject && blueprintFilterSubject.value) || 0),
        ),
      ]);
      try {
        const initialVersions = await loadAllManuscriptVersionsFromBlueprints();
        renderManuscripts(initialVersions);
      } catch (_) {
        renderManuscripts([]);
      }
      fillSubjectEducationLevelSelect("");
    }

    try {
      await ensureQuillReady();
      if (learningGoalPageSizeSelect) {
        learningGoalPageSize = Math.max(
          1,
          Number(learningGoalPageSizeSelect.value) || 10,
        );
      }
      if (manuscriptPageSizeSelect) {
        manuscriptPageSize = Math.max(
          1,
          Number(manuscriptPageSizeSelect.value) || 15,
        );
      }
      if (questionOwnerScopeSelect) {
        const role = String((user && user.role) || "")
          .trim()
          .toLowerCase();
        questionOwnerScopeSelect.value = role === "admin" ? "all" : "mine";
      }
      if (manuscriptStimulusEditor && !manuscriptStimulusQuill) {
        manuscriptStimulusQuill = createQuillEditor(
          manuscriptStimulusEditor,
          "Tulis stimulus...",
          { defaultFontSize: "12pt" },
        );
        if (manuscriptStimulusQuill) {
          manuscriptStimulusQuill.on("text-change", function () {
            syncManuscriptHiddenInputs();
          });
        }
      }
      if (manuscriptStemEditor && !manuscriptStemQuill) {
        manuscriptStemQuill = createQuillEditor(
          manuscriptStemEditor,
          "Tulis naskah soal...",
          { defaultFontSize: "12pt" },
        );
        if (manuscriptStemQuill) {
          manuscriptStemQuill.on("text-change", function () {
            syncManuscriptHiddenInputs();
          });
        }
      }
      if (manuscriptExplanationEditor && !manuscriptExplanationQuill) {
        manuscriptExplanationQuill = createQuillEditor(
          manuscriptExplanationEditor,
          "Tulis penjelasan...",
          { defaultFontSize: "12pt" },
        );
        if (manuscriptExplanationQuill) {
          manuscriptExplanationQuill.on("text-change", function () {
            syncManuscriptHiddenInputs();
          });
        }
      }
      if (manuscriptHintEditor && !manuscriptHintQuill) {
        manuscriptHintQuill = createQuillEditor(
          manuscriptHintEditor,
          "Tulis hint...",
          { defaultFontSize: "12pt" },
        );
        if (manuscriptHintQuill) {
          manuscriptHintQuill.on("text-change", function () {
            syncManuscriptHiddenInputs();
          });
        }
      }
      syncManuscriptHiddenInputs();
      const firstMenu =
        (menuButtons &&
          menuButtons.length > 0 &&
          menuButtons[0].getAttribute("data-guru-menu")) ||
        "dashboard";
      activateGuruMenu(firstMenu);
      await loadGuruDashboard();
      setMsg("Dashboard guru siap.");
    } catch (err) {
      setMsg("Gagal memuat dashboard guru: " + err.message);
    }

    menuButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        activateGuruMenu(btn.getAttribute("data-guru-menu") || "dashboard");
      });
    });
    root.querySelectorAll("[data-guru-jump]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        activateGuruMenu(btn.getAttribute("data-guru-jump") || "dashboard");
      });
    });

    if (learningGoalForm) {
      learningGoalForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(learningGoalForm);
        const id = Number(fd.get("id") || 0);
        const isEdit = id > 0 || learningGoalEditingID > 0;
        const targetID = id > 0 ? id : learningGoalEditingID;
        const done = beginBusy(
          learningGoalForm,
          msg,
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
            await api("/api/v1/learning-goals/" + targetID, "PUT", payload);
          } else {
            await api("/api/v1/learning-goals", "POST", payload);
          }
          await loadLearningGoals();
          learningGoalForm.reset();
          resetLearningGoalFormMode();
          setMsg(
            isEdit
              ? "Learning goal berhasil diperbarui."
              : "Learning goal berhasil disimpan.",
          );
        } catch (err) {
          setMsg(
            (isEdit
              ? "Simpan perubahan tujuan pembelajaran gagal: "
              : "Simpan tujuan pembelajaran gagal: ") + err.message,
          );
        } finally {
          done();
        }
      });
    }

    if (learningGoalCancelEditBtn) {
      learningGoalCancelEditBtn.addEventListener("click", function () {
        if (learningGoalForm) learningGoalForm.reset();
        resetLearningGoalFormMode();
        setMsg("Mode edit tujuan pembelajaran dibatalkan.");
      });
    }

    if (learningGoalRefreshBtn) {
      learningGoalRefreshBtn.addEventListener("click", async function () {
        const done = beginBusy(
          learningGoalRefreshBtn,
          msg,
          "Memuat tujuan pembelajaran...",
        );
        try {
          learningGoalPage = 1;
          await Promise.all([
            loadLearningGoals(),
            loadClassesForLearningGoal(),
            loadSubjects(),
          ]);
          fillLearningGoalSubjectSelect();
          setMsg("Learning goals berhasil dimuat.");
        } catch (err) {
          setMsg("Gagal memuat tujuan pembelajaran: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (learningGoalPageSizeSelect) {
      learningGoalPageSizeSelect.addEventListener("change", function () {
        learningGoalPageSize = Math.max(
          1,
          Number(learningGoalPageSizeSelect.value) || 10,
        );
        learningGoalPage = 1;
        renderLearningGoals(getFilteredLearningGoals());
      });
    }

    if (learningGoalPrevBtn) {
      learningGoalPrevBtn.addEventListener("click", function () {
        learningGoalPage = Math.max(1, learningGoalPage - 1);
        renderLearningGoals(getFilteredLearningGoals());
      });
    }

    if (learningGoalNextBtn) {
      learningGoalNextBtn.addEventListener("click", function () {
        learningGoalPage += 1;
        renderLearningGoals(getFilteredLearningGoals());
      });
    }

    if (learningGoalSearchInput) {
      learningGoalSearchInput.addEventListener("input", function () {
        learningGoalSearch = String(learningGoalSearchInput.value || "").trim();
        learningGoalPage = 1;
        renderLearningGoals(getFilteredLearningGoals());
      });
    }

    if (learningGoalTemplateBtn) {
      learningGoalTemplateBtn.addEventListener("click", async function () {
        const done = beginBusy(
          learningGoalTemplateBtn,
          msg,
          "Menyiapkan template tujuan pembelajaran...",
        );
        try {
          await downloadLearningGoalsTemplateCSV();
          setMsg("Template import tujuan pembelajaran berhasil diunduh.");
        } catch (err) {
          setMsg(
            "Gagal mengunduh template tujuan pembelajaran: " + err.message,
          );
        } finally {
          done();
        }
      });
    }

    if (learningGoalImportBtn) {
      learningGoalImportBtn.addEventListener("click", function () {
        if (learningGoalImportOutput) {
          learningGoalImportOutput.textContent = "";
        }
        if (
          learningGoalImportDialog &&
          typeof learningGoalImportDialog.showModal === "function"
        ) {
          learningGoalImportDialog.showModal();
        }
      });
    }

    if (learningGoalImportCancelBtn) {
      learningGoalImportCancelBtn.addEventListener("click", function () {
        if (
          learningGoalImportDialog &&
          typeof learningGoalImportDialog.close === "function"
        ) {
          learningGoalImportDialog.close();
        }
      });
    }

    if (learningGoalImportCloseBtn) {
      learningGoalImportCloseBtn.addEventListener("click", function () {
        if (
          learningGoalImportDialog &&
          typeof learningGoalImportDialog.close === "function"
        ) {
          learningGoalImportDialog.close();
        }
      });
    }

    if (learningGoalImportForm) {
      learningGoalImportForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const file =
          learningGoalImportFile &&
          learningGoalImportFile.files &&
          learningGoalImportFile.files[0];
        if (!file) {
          setMsg("Pilih file CSV terlebih dahulu.");
          return;
        }
        const fd = new FormData();
        fd.append("file", file);
        const done = beginBusy(
          learningGoalImportForm,
          msg,
          "Mengimpor tujuan pembelajaran dari CSV...",
        );
        try {
          const out = await apiMultipart(
            "/api/v1/learning-goals/import",
            "POST",
            fd,
          );
          const report = (out && out.report) || {};
          const total = Number(report.total_rows || 0);
          const okRows = Number(report.success_rows || 0);
          const failRows = Number(report.failed_rows || 0);
          const errors = Array.isArray(report.errors) ? report.errors : [];
          if (learningGoalImportOutput) {
            learningGoalImportOutput.textContent =
              failRows > 0
                ? formatLearningGoalImportErrorsMultiline(errors)
                : "Import berhasil tanpa error.";
          }
          setMsg(
            "Import tujuan pembelajaran selesai. Total: " +
              String(total) +
              ", berhasil: " +
              String(okRows) +
              ", gagal: " +
              String(failRows),
          );
          learningGoalImportForm.reset();
          await loadLearningGoals();
          if (
            learningGoalImportDialog &&
            typeof learningGoalImportDialog.close === "function"
          ) {
            learningGoalImportDialog.close();
          }
        } catch (err) {
          if (learningGoalImportOutput) {
            learningGoalImportOutput.textContent =
              "Import gagal:\n" + String(err.message || "Request failed");
          }
          setMsg("Import tujuan pembelajaran gagal: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (learningGoalBody) {
      learningGoalBody.addEventListener("click", async function (e) {
        const btn =
          e.target && e.target.closest("button[data-action][data-id]");
        if (!btn) return;
        const action = String(btn.getAttribute("data-action") || "");
        const id = Number(btn.getAttribute("data-id") || 0);
        if (id <= 0) return;
        const item = findLearningGoalByID(id);
        if (!item) {
          setMsg("Data tujuan pembelajaran tidak ditemukan.");
          return;
        }

        if (action === "view-learning-goal") {
          if (learningGoalViewTitle) {
            text(
              learningGoalViewTitle,
              "Detail Tujuan Pembelajaran: TP-" + String(id),
            );
          }
          fillLearningGoalViewPopup(item);
          if (
            learningGoalViewDialog &&
            typeof learningGoalViewDialog.showModal === "function"
          ) {
            learningGoalViewDialog.showModal();
          }
          return;
        }

        if (action === "edit-learning-goal") {
          startLearningGoalEdit(item);
          setMsg("Mode edit tujuan pembelajaran aktif.");
          return;
        }

        if (action !== "delete-learning-goal") return;
        const ok = window.confirm("Hapus tujuan pembelajaran ini?");
        if (!ok) return;
        const done = beginBusy(btn, msg, "Menghapus tujuan pembelajaran...");
        try {
          await api("/api/v1/learning-goals/" + id, "DELETE");
          await loadLearningGoals();
          if (learningGoalEditingID === id) {
            if (learningGoalForm) learningGoalForm.reset();
            resetLearningGoalFormMode();
          }
          setMsg("Learning goal berhasil dihapus.");
        } catch (err) {
          setMsg("Hapus tujuan pembelajaran gagal: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (blueprintForm) {
      blueprintForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(blueprintForm);
        const done = beginBusy(blueprintForm, msg, "Menyimpan kisi-kisi...");
        try {
          const payload = {
            subject_id: Number(fd.get("subject_id") || 0),
            learning_goal_id: Number(fd.get("learning_goal_id") || 0),
            question_type: String(fd.get("question_type") || "").trim(),
            title: String(fd.get("title") || "").trim(),
            indicator: String(fd.get("indicator") || "").trim(),
            material: String(fd.get("material") || "").trim(),
            objective: String(fd.get("objective") || "").trim(),
            cognitive_level: String(fd.get("cognitive_level") || "").trim(),
          };
          await api("/api/v1/questions", "POST", payload);
          await loadBlueprints(
            Number(
              (blueprintFilterSubject && blueprintFilterSubject.value) || 0,
            ),
          );
          blueprintForm.reset();
          fillSubjectSelect(blueprintSubjectSelect, false);
          setMsg("Kisi-kisi berhasil disimpan.");
        } catch (err) {
          setMsg("Simpan kisi-kisi gagal: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (blueprintFilterForm) {
      blueprintFilterForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const done = beginBusy(blueprintFilterForm, msg, "Memuat kisi-kisi...");
        try {
          await loadBlueprints(
            Number(
              (blueprintFilterSubject && blueprintFilterSubject.value) || 0,
            ),
          );
          setMsg("Data kisi-kisi berhasil dimuat.");
        } catch (err) {
          setMsg("Gagal memuat kisi-kisi: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (blueprintRefreshBtn) {
      blueprintRefreshBtn.addEventListener("click", async function () {
        const done = beginBusy(
          blueprintRefreshBtn,
          msg,
          "Muat ulang kisi-kisi...",
        );
        try {
          await loadBlueprints(
            Number(
              (blueprintFilterSubject && blueprintFilterSubject.value) || 0,
            ),
          );
          setMsg("Kisi-kisi berhasil dimuat ulang.");
        } catch (err) {
          setMsg("Gagal muat ulang kisi-kisi: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (manuscriptQuestionSelect) {
      manuscriptQuestionSelect.addEventListener("change", async function () {
        clearManuscriptEditMode();
        syncManuscriptSubjectState();
        applyManuscriptTypeUI(true);
      });
    }

    if (manuscriptSubjectSelect) {
      manuscriptSubjectSelect.addEventListener("change", async function () {
        clearManuscriptEditMode();
        if (manuscriptQuestionSelect && manuscriptQuestionSelect.value) {
          return;
        }
        fillLearningGoalSelect(
          manuscriptLearningGoalSelect,
          Number(
            (manuscriptSubjectSelect && manuscriptSubjectSelect.value) || 0,
          ),
        );
        fillQuestionCodeSelect(
          manuscriptQuestionCodeSelect,
          Number(
            (manuscriptSubjectSelect && manuscriptSubjectSelect.value) || 0,
          ),
          true,
        );
      });
    }

    if (manuscriptQuestionTypeUI) {
      manuscriptQuestionTypeUI.addEventListener("change", function () {
        applyManuscriptTypeUI(false);
      });
    }

    if (manuscriptForm) {
      manuscriptForm.addEventListener("change", function (e) {
        const target = e.target;
        if (!target) return;
        if (
          target.name === "manuscript_mc_key" ||
          target.name === "manuscript_mr_key" ||
          target.hasAttribute("data-option-key") ||
          target.hasAttribute("data-option-html") ||
          target.hasAttribute("data-statement-id") ||
          target.hasAttribute("data-statement-text") ||
          target.hasAttribute("data-statement-correct")
        ) {
          if (
            target.hasAttribute("data-option-key") ||
            target.hasAttribute("data-option-html")
          ) {
            renderManuscriptKeyChoices();
          }
          syncManuscriptAnswerKeyPreview();
        }
      });
      manuscriptForm.addEventListener("input", function (e) {
        const target = e.target;
        if (!target) return;
        if (
          target.hasAttribute("data-option-key") ||
          target.hasAttribute("data-option-html") ||
          target.hasAttribute("data-statement-id") ||
          target.hasAttribute("data-statement-text")
        ) {
          if (
            target.hasAttribute("data-option-key") ||
            target.hasAttribute("data-option-html")
          ) {
            renderManuscriptKeyChoices();
          }
          syncManuscriptAnswerKeyPreview();
        }
      });
    }

    if (manuscriptAddOptionBtn) {
      manuscriptAddOptionBtn.addEventListener("click", function () {
        if (!manuscriptOptionsWrap) return;
        const idx =
          manuscriptOptionsWrap.querySelectorAll("[data-option-row]").length ||
          0;
        manuscriptOptionsWrap.insertAdjacentHTML(
          "beforeend",
          createManuscriptOptionRow({ option_key: "", option_html: "" }, idx),
        );
        bindManuscriptOptionEditors();
        renderManuscriptKeyChoices();
        syncManuscriptAnswerKeyPreview();
      });
    }

    if (manuscriptOptionsWrap) {
      manuscriptOptionsWrap.addEventListener("click", function (e) {
        const btn = e.target && e.target.closest("button[data-option-remove]");
        if (!btn) return;
        const row = btn.closest("[data-option-row]");
        if (row) row.remove();
        ensureManuscriptOptionRows();
        renderManuscriptKeyChoices();
        syncManuscriptAnswerKeyPreview();
      });
    }

    if (manuscriptAddStatementBtn) {
      manuscriptAddStatementBtn.addEventListener("click", function () {
        if (!manuscriptStatementsWrap) return;
        const idx =
          manuscriptStatementsWrap.querySelectorAll("[data-statement-row]")
            .length || 0;
        manuscriptStatementsWrap.insertAdjacentHTML(
          "beforeend",
          createTFStatementRow(
            { id: "S" + String(idx + 1), statement: "", correct: true },
            idx,
          ),
        );
        syncManuscriptAnswerKeyPreview();
      });
    }

    if (manuscriptStatementsWrap) {
      manuscriptStatementsWrap.addEventListener("click", function (e) {
        const btn =
          e.target && e.target.closest("button[data-statement-remove]");
        if (!btn) return;
        const row = btn.closest("[data-statement-row]");
        if (row) row.remove();
        ensureTFStatementRows();
        syncManuscriptAnswerKeyPreview();
      });
    }

    if (manuscriptImportBtn) {
      manuscriptImportBtn.addEventListener("click", function () {
        fillSubjectSelect(manuscriptImportSubjectSelect, true);
        if (
          manuscriptImportSubjectSelect &&
          manuscriptImportSubjectSelect.options &&
          manuscriptImportSubjectSelect.options.length > 0
        ) {
          manuscriptImportSubjectSelect.options[0].textContent =
            "(Opsional) Gunakan Mapel di file";
        }
        if (manuscriptImportForm) manuscriptImportForm.reset();
        if (manuscriptImportOutput) {
          manuscriptImportOutput.textContent =
            "Format didukung: (1) TYPE/Stimulus/Q/Opsi/Kunci, atau (2) CSV header Mapel,Kode Soal,Nama Kode,stimulus,soal,opsi,kunci jawaban,Penjelasan.";
        }
        if (
          manuscriptImportDialog &&
          typeof manuscriptImportDialog.showModal === "function"
        ) {
          manuscriptImportDialog.showModal();
        }
      });
    }

    if (manuscriptImportCancelBtn) {
      manuscriptImportCancelBtn.addEventListener("click", function () {
        if (
          manuscriptImportDialog &&
          typeof manuscriptImportDialog.close === "function"
        ) {
          manuscriptImportDialog.close();
        }
      });
    }

    if (manuscriptImportForm) {
      manuscriptImportForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fallbackSubjectID = Number(
          (manuscriptImportSubjectSelect &&
            manuscriptImportSubjectSelect.value) ||
            0,
        );
        const file =
          manuscriptImportFileInput &&
          manuscriptImportFileInput.files &&
          manuscriptImportFileInput.files[0];
        if (!file) {
          setMsg("Pilih file CSV/TXT untuk import soal.");
          return;
        }
        const done = beginBusy(
          manuscriptImportForm,
          msg,
          "Mengimpor soal dari CSV Word...",
        );
        try {
          const rawText = await file.text();
          const parsedImport = parseImportContent(rawText);
          const importItems = Array.isArray(parsedImport.items)
            ? parsedImport.items
            : [];
          if (!importItems.length) {
            throw new Error("File tidak berisi blok soal yang valid.");
          }
          const report = {
            total_blocks: importItems.length,
            success_blocks: 0,
            failed_blocks: 0,
            errors: [],
            imported_question_ids: [],
          };
          const defaultLearningGoalBySubject = {};
          await loadQuestionCodes(fallbackSubjectID || 0);
          for (let i = 0; i < importItems.length; i += 1) {
            const blockNo = i + 1;
            try {
              const parsed =
                parsedImport.mode === "tabular"
                  ? parseImportQuestionRow(importItems[i], blockNo)
                  : parseImportQuestionBlock(importItems[i], blockNo);
              const subjectID = resolveImportSubjectID(
                parsed.mapel,
                fallbackSubjectID,
                blockNo,
              );
              if (!defaultLearningGoalBySubject[subjectID]) {
                const resolved = resolveDefaultLearningGoalID(subjectID);
                if (resolved <= 0) {
                  const sub = findSubjectByID(subjectID);
                  const label = sub
                    ? String(sub.name || "")
                    : "#" + String(subjectID);
                  throw new Error(
                    "Blok " +
                      String(blockNo) +
                      ': tujuan pembelajaran mapel "' +
                      label +
                      '" belum tersedia.',
                  );
                }
                defaultLearningGoalBySubject[subjectID] = resolved;
              }
              let learningGoalID = defaultLearningGoalBySubject[subjectID];
              let stimulusHTML = "";
              const questionCodeID = await ensureQuestionCodeForImport(
                subjectID,
                parsed.question_code_code,
                parsed.question_code_name,
              );
              if (parsed.stimulus_text) {
                const safeStimulus = escapeHtml(parsed.stimulus_text);
                stimulusHTML = "<p>" + safeStimulus + "</p>";
              }
              const blueprint = await api("/api/v1/questions", "POST", {
                subject_id: subjectID,
                learning_goal_id: learningGoalID,
                question_code_id: questionCodeID,
                question_type: parsed.question_type,
                title: parsed.title,
                indicator: parsed.indicator,
                material: parsed.material,
                objective: parsed.objective,
                cognitive_level: parsed.cognitive_level,
              });
              const qid = Number((blueprint && blueprint.id) || 0);
              if (qid <= 0) {
                throw new Error("gagal membuat soal.");
              }
              await api("/api/v1/questions/" + qid + "/versions", "POST", {
                stimulus_html: stimulusHTML,
                stem_html: parsed.stem_html,
                explanation_html: parsed.explanation_html || "",
                answer_key: parsed.answer_key,
                options: parsed.options,
              });
              report.success_blocks += 1;
              report.imported_question_ids.push(qid);
            } catch (err) {
              report.failed_blocks += 1;
              report.errors.push({
                block: blockNo,
                error: String((err && err.message) || "error tidak diketahui"),
              });
            }
          }
          if (manuscriptImportOutput) {
            manuscriptImportOutput.textContent = JSON.stringify(
              report,
              null,
              2,
            );
          }
          await Promise.all([loadBlueprints(fallbackSubjectID || 0)]);
          if (
            manuscriptImportDialog &&
            typeof manuscriptImportDialog.close === "function"
          ) {
            manuscriptImportDialog.close();
          }
          if (manuscriptImportForm) manuscriptImportForm.reset();
          const importedQuestionIDs = Array.from(
            new Set(
              (Array.isArray(report.imported_question_ids)
                ? report.imported_question_ids
                : []
              )
                .map(function (v) {
                  return Number(v || 0);
                })
                .filter(function (v) {
                  return v > 0;
                }),
            ),
          );
          if (importedQuestionIDs.length) {
            const batches = await Promise.all(
              importedQuestionIDs.map(function (qid) {
                return api("/api/v1/questions/" + qid + "/versions", "GET");
              }),
            );
            const mergedVersions = batches
              .reduce(function (acc, items) {
                if (Array.isArray(items)) return acc.concat(items);
                return acc;
              }, [])
              .sort(function (a, b) {
                const ta = new Date(
                  a && a.created_at ? a.created_at : 0,
                ).getTime();
                const tb = new Date(
                  b && b.created_at ? b.created_at : 0,
                ).getTime();
                if (tb !== ta) return tb - ta;
                const qa = Number((a && a.question_id) || 0);
                const qb = Number((b && b.question_id) || 0);
                if (qb !== qa) return qb - qa;
                return (
                  Number((b && b.version_no) || 0) -
                  Number((a && a.version_no) || 0)
                );
              });
            renderManuscripts(mergedVersions);
          }
          const maxErrorPreview = 8;
          const errorPreview = report.errors.slice(0, maxErrorPreview);
          const errorDetail = report.errors.length
            ? " Penyebab gagal: " +
              errorPreview
                .map(function (it) {
                  return (
                    "blok " +
                    String((it && it.block) || "-") +
                    " (" +
                    String((it && it.error) || "error") +
                    ")"
                  );
                })
                .join("; ") +
              (report.errors.length > maxErrorPreview
                ? "; dan " +
                  String(report.errors.length - maxErrorPreview) +
                  " error lainnya"
                : "")
            : "";
          setMsg(
            "Import soal selesai. Berhasil: " +
              String(report.success_blocks) +
              ", gagal: " +
              String(report.failed_blocks) +
              "." +
              errorDetail,
          );
        } catch (err) {
          if (manuscriptImportOutput) {
            manuscriptImportOutput.textContent =
              "Import gagal:\n" +
              String((err && err.message) || "Request failed");
          }
          setMsg("Import soal gagal: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (manuscriptForm) {
      manuscriptForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        syncManuscriptHiddenInputs();
        const fd = new FormData(manuscriptForm);
        const editingVersionNo = Number(fd.get("editing_version_no") || 0);
        const isEditMode = editingVersionNo > 0;
        const stemHTML = String(fd.get("stem_html") || "");
        if (isBlankHTML(stemHTML)) {
          setMsg("Naskah Soal (Stem) wajib diisi.");
          return;
        }
        const blueprintType = getCurrentManuscriptQuestionType();
        const selectedType = String(
          (manuscriptQuestionTypeUI && manuscriptQuestionTypeUI.value) || "",
        )
          .trim()
          .toLowerCase();
        if (!selectedType) {
          setMsg("Tipe Soal wajib dipilih.");
          return;
        }
        if (blueprintType && selectedType !== blueprintType) {
          setMsg(
            "Tipe Soal harus sama dengan tipe pada Soal terpilih (" +
              blueprintType +
              ").",
          );
          return;
        }
        currentManuscriptQuestionType = selectedType;
        let answerKeyObj;
        let optionsPayload = [];
        try {
          optionsPayload = validateManuscriptOptions(
            collectManuscriptOptions(),
          );
          answerKeyObj = collectManuscriptAnswerKey();
          if (manuscriptAnswerKeyRaw) {
            manuscriptAnswerKeyRaw.value = JSON.stringify(
              answerKeyObj,
              null,
              2,
            );
          }
        } catch (err) {
          setMsg("Kunci jawaban belum valid: " + err.message);
          return;
        }
        const done = beginBusy(
          manuscriptForm,
          msg,
          isEditMode ? "Menyimpan perubahan naskah..." : "Menyimpan naskah...",
        );
        try {
          let questionID = isEditMode
            ? manuscriptEditingQuestionID
            : Number(fd.get("question_id") || 0);
          const selectedQuestionCodeID = Number(
            fd.get("question_code_id") || 0,
          );
          if (!isEditMode) {
            questionID = await ensureQuestionForManuscriptSubmission({
              question_id: questionID,
              subject_id: Number(fd.get("subject_id") || 0),
              learning_goal_id: Number(fd.get("learning_goal_id") || 0),
              question_code_id: selectedQuestionCodeID,
              question_type: selectedType,
              stem_html: stemHTML,
            });
            await loadBlueprints(0);
            if (manuscriptQuestionSelect) {
              manuscriptQuestionSelect.value = String(questionID);
            }
            syncManuscriptSubjectState();
          }
          const stimulusHTML = String(fd.get("stimulus_html") || "").trim();
          const payload = {
            stimulus_html: stimulusHTML,
            stem_html: stemHTML.trim(),
            answer_key: answerKeyObj,
            options: optionsPayload,
            explanation_html: String(fd.get("explanation_html") || "").trim(),
            hint_html: String(fd.get("hint_html") || "").trim(),
          };
          if (questionID > 0) {
            await api("/api/v1/questions/" + questionID + "/code", "PUT", {
              question_code_id:
                selectedQuestionCodeID > 0 ? selectedQuestionCodeID : null,
            });
          }
          const endpoint = isEditMode
            ? "/api/v1/questions/" +
              questionID +
              "/versions/" +
              editingVersionNo
            : "/api/v1/questions/" + questionID + "/versions";
          const method = isEditMode ? "PUT" : "POST";
          await api(endpoint, method, payload);
          const versions = await api(
            "/api/v1/questions/" + questionID + "/versions",
            "GET",
          );
          renderManuscripts(versions);
          resetManuscriptEditors();
          manuscriptForm.reset();
          syncManuscriptSubjectState();
          fillBlueprintSelect(manuscriptQuestionSelect);
          if (manuscriptStatementsWrap) {
            manuscriptStatementsWrap.innerHTML = "";
          }
          if (manuscriptOptionsWrap) {
            manuscriptOptionsWrap.innerHTML = "";
          }
          ensureManuscriptOptionRows();
          ensureTFStatementRows();
          applyManuscriptTypeUI(true);
          clearManuscriptEditMode();
          setMsg(
            isEditMode
              ? "Naskah soal berhasil diperbarui."
              : "Naskah soal berhasil disimpan.",
          );
        } catch (err) {
          setMsg(
            (isEditMode
              ? "Simpan perubahan naskah gagal: "
              : "Simpan naskah gagal: ") + err.message,
          );
        } finally {
          done();
        }
      });
    }

    if (manuscriptRefreshBtn) {
      manuscriptRefreshBtn.addEventListener("click", async function () {
        const done = beginBusy(
          manuscriptRefreshBtn,
          msg,
          "Muat ulang naskah...",
        );
        try {
          const questionID = Number(
            (manuscriptQuestionSelect && manuscriptQuestionSelect.value) || 0,
          );
          const versions =
            questionID > 0
              ? await api(
                  "/api/v1/questions/" + questionID + "/versions",
                  "GET",
                )
              : await loadAllManuscriptVersionsFromBlueprints();
          renderManuscripts(versions);
          setMsg("Data naskah berhasil dimuat ulang.");
        } catch (err) {
          setMsg("Gagal muat ulang naskah: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (manuscriptPageSizeSelect) {
      manuscriptPageSizeSelect.addEventListener("change", function () {
        manuscriptPageSize = Math.max(
          1,
          Number(manuscriptPageSizeSelect.value) || 15,
        );
        manuscriptPage = 1;
        renderManuscripts(manuscriptAllItems);
      });
    }

    if (manuscriptPrevBtn) {
      manuscriptPrevBtn.addEventListener("click", function () {
        manuscriptPage = Math.max(1, manuscriptPage - 1);
        renderManuscripts(manuscriptAllItems);
      });
    }

    if (manuscriptNextBtn) {
      manuscriptNextBtn.addEventListener("click", function () {
        manuscriptPage += 1;
        renderManuscripts(manuscriptAllItems);
      });
    }

    if (manuscriptCancelEditBtn) {
      manuscriptCancelEditBtn.addEventListener("click", function () {
        if (!manuscriptForm) return;
        clearManuscriptEditMode();
        manuscriptForm.reset();
        syncManuscriptSubjectState();
        resetManuscriptEditors();
        if (manuscriptStatementsWrap) manuscriptStatementsWrap.innerHTML = "";
        if (manuscriptOptionsWrap) manuscriptOptionsWrap.innerHTML = "";
        ensureManuscriptOptionRows();
        ensureTFStatementRows();
        applyManuscriptTypeUI(true);
      });
    }

    if (questionOwnerScopeSelect) {
      questionOwnerScopeSelect.addEventListener("change", async function () {
        const done = beginBusy(
          questionOwnerScopeSelect,
          msg,
          "Memuat data soal sesuai scope...",
        );
        try {
          await loadBlueprints(
            Number(
              (blueprintFilterSubject && blueprintFilterSubject.value) || 0,
            ),
          );
          const versions = await loadAllManuscriptVersionsFromBlueprints();
          manuscriptPage = 1;
          renderManuscripts(versions);
          setManuscriptMsg("Scope soal berhasil diperbarui.");
        } catch (err) {
          setManuscriptMsg("Gagal memuat scope soal: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (manuscriptBody) {
      manuscriptBody.addEventListener("click", async function (e) {
        const btn =
          e.target &&
          e.target.closest(
            "button[data-action][data-question-id][data-version-no]",
          );
        if (!btn) return;
        const action = String(btn.getAttribute("data-action") || "").trim();
        if (
          action !== "preview-manuscript" &&
          action !== "edit-manuscript" &&
          action !== "delete-manuscript"
        ) {
          return;
        }
        const questionID = Number(btn.getAttribute("data-question-id") || 0);
        const versionNo = Number(btn.getAttribute("data-version-no") || 0);
        if (questionID <= 0 || versionNo <= 0) {
          setManuscriptMsg(
            "Aksi tidak valid: question/version tidak ditemukan.",
          );
          return;
        }
        e.preventDefault();
        await runManuscriptRowAction(btn, action, questionID, versionNo);
      });

      manuscriptBody.addEventListener("change", function (e) {
        const input = e.target;
        if (!input || input.type !== "checkbox") return;
        const key = String(input.getAttribute("data-manuscript-select") || "");
        if (!key) return;
        if (input.checked) {
          manuscriptSelectedKeys.add(key);
        } else {
          manuscriptSelectedKeys.delete(key);
        }
        updateManuscriptBulkState(
          Array.isArray(manuscriptAllItems) ? manuscriptAllItems : [],
        );
      });
    }

    if (manuscriptSelectAll) {
      manuscriptSelectAll.addEventListener("change", function () {
        const checked = !!manuscriptSelectAll.checked;
        const rows = Array.isArray(manuscriptAllItems)
          ? manuscriptAllItems
          : [];
        rows.forEach(function (it) {
          if (!isManuscriptDeletable(it)) return;
          const key = manuscriptRowKey(it);
          if (checked) {
            manuscriptSelectedKeys.add(key);
          } else {
            manuscriptSelectedKeys.delete(key);
          }
        });
        renderManuscriptRows(
          manuscriptAllItems.slice(
            (manuscriptPage - 1) * manuscriptPageSize,
            (manuscriptPage - 1) * manuscriptPageSize + manuscriptPageSize,
          ),
        );
      });
    }

    if (manuscriptBulkDeleteBtn) {
      manuscriptBulkDeleteBtn.addEventListener("click", async function () {
        const rows = Array.isArray(manuscriptAllItems)
          ? manuscriptAllItems
          : [];
        const targets = rows.filter(function (it) {
          return (
            isManuscriptDeletable(it) &&
            manuscriptSelectedKeys.has(manuscriptRowKey(it))
          );
        });
        if (!targets.length) return;
        const ok = window.confirm(
          "Hapus " + String(targets.length) + " naskah terpilih?",
        );
        if (!ok) return;
        const done = beginBusy(
          manuscriptBulkDeleteBtn,
          msg,
          "Menghapus naskah terpilih...",
        );
        try {
          for (let i = 0; i < targets.length; i += 1) {
            const it = targets[i];
            await api(
              "/api/v1/questions/" +
                String(it.question_id) +
                "/versions/" +
                String(it.version_no),
              "DELETE",
            );
            manuscriptSelectedKeys.delete(manuscriptRowKey(it));
          }
          await reloadManuscriptsByCurrentTableScope(
            Number(
              (manuscriptQuestionSelect && manuscriptQuestionSelect.value) || 0,
            ),
          );
          setManuscriptMsg("Naskah terpilih berhasil dihapus.");
        } catch (err) {
          setManuscriptMsg("Hapus naskah terpilih gagal: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (manuscriptDeleteAllBtn) {
      manuscriptDeleteAllBtn.addEventListener("click", async function () {
        const rows = Array.isArray(manuscriptAllItems)
          ? manuscriptAllItems
          : [];
        const targets = rows.filter(isManuscriptDeletable);
        if (!targets.length) return;
        const ok = window.confirm(
          "Hapus semua naskah pada scope ini? Total: " + String(targets.length),
        );
        if (!ok) return;
        const done = beginBusy(
          manuscriptDeleteAllBtn,
          msg,
          "Menghapus semua naskah...",
        );
        try {
          for (let i = 0; i < targets.length; i += 1) {
            const it = targets[i];
            await api(
              "/api/v1/questions/" +
                String(it.question_id) +
                "/versions/" +
                String(it.version_no),
              "DELETE",
            );
          }
          manuscriptSelectedKeys.clear();
          await reloadManuscriptsByCurrentTableScope(
            Number(
              (manuscriptQuestionSelect && manuscriptQuestionSelect.value) || 0,
            ),
          );
          setManuscriptMsg("Semua naskah pada scope ini dihapus.");
        } catch (err) {
          setManuscriptMsg("Hapus semua naskah gagal: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (questionCodeSubjectSelect) {
      questionCodeSubjectSelect.addEventListener("change", async function () {
        const subjectID = Number(questionCodeSubjectSelect.value || 0);
        const done = beginBusy(
          questionCodeSubjectSelect,
          msg,
          "Memuat kode soal...",
        );
        try {
          await loadQuestionCodes(subjectID);
          setMsg("Kode soal berhasil dimuat.");
        } catch (err) {
          setMsg("Gagal memuat kode soal: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (questionCodeRefreshBtn) {
      questionCodeRefreshBtn.addEventListener("click", async function () {
        const subjectID = Number(
          (questionCodeSubjectSelect && questionCodeSubjectSelect.value) || 0,
        );
        const done = beginBusy(
          questionCodeRefreshBtn,
          msg,
          "Memuat kode soal...",
        );
        try {
          await loadQuestionCodes(subjectID);
          setMsg("Kode soal berhasil dimuat.");
        } catch (err) {
          setMsg("Gagal memuat kode soal: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (questionCodeCancelBtn) {
      questionCodeCancelBtn.addEventListener("click", function () {
        if (questionCodeForm) questionCodeForm.reset();
        resetQuestionCodeFormMode();
        setMsg("Mode edit kode soal dibatalkan.");
      });
    }

    if (questionCodeForm) {
      questionCodeForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(questionCodeForm);
        const id = Number(fd.get("id") || questionCodeEditingID || 0);
        const subjectID = Number(fd.get("subject_id") || 0);
        const payload = {
          subject_id: subjectID,
          code: String(fd.get("code") || "").trim(),
          name: String(fd.get("name") || "").trim(),
        };
        const done = beginBusy(
          questionCodeForm,
          msg,
          id > 0
            ? "Menyimpan perubahan kode soal..."
            : "Menyimpan kode soal...",
        );
        try {
          if (id > 0) {
            await api("/api/v1/question-codes/" + id, "PUT", payload);
          } else {
            await api("/api/v1/question-codes", "POST", payload);
          }
          await loadQuestionCodes(subjectID);
          await loadBlueprints(
            Number(
              (blueprintFilterSubject && blueprintFilterSubject.value) || 0,
            ),
          );
          questionCodeForm.reset();
          resetQuestionCodeFormMode();
          setMsg(
            id > 0
              ? "Kode soal berhasil diperbarui."
              : "Kode soal berhasil disimpan.",
          );
        } catch (err) {
          setMsg(
            (id > 0
              ? "Simpan perubahan kode soal gagal: "
              : "Simpan kode soal gagal: ") + err.message,
          );
        } finally {
          done();
        }
      });
    }

    if (questionCodeBody) {
      questionCodeBody.addEventListener("click", async function (e) {
        const btn =
          e.target &&
          e.target.closest("button[data-question-code-action][data-id]");
        if (!btn) return;
        const id = Number(btn.getAttribute("data-id") || 0);
        if (id <= 0) return;
        const action = String(
          btn.getAttribute("data-question-code-action") || "",
        );
        const item = findQuestionCodeByID(id);
        if (!item) {
          setMsg("Data kode soal tidak ditemukan.");
          return;
        }
        if (action === "edit") {
          if (!questionCodeForm) return;
          const idField = questionCodeForm.elements.namedItem("id");
          const subjectField =
            questionCodeForm.elements.namedItem("subject_id");
          const codeField = questionCodeForm.elements.namedItem("code");
          const nameField = questionCodeForm.elements.namedItem("name");
          if (idField) idField.value = String(id);
          if (subjectField) subjectField.value = String(item.subject_id || "");
          if (codeField) codeField.value = String(item.code || "");
          if (nameField) nameField.value = String(item.name || "");
          questionCodeEditingID = id;
          const submitBtn = document.getElementById(
            "guru-question-code-submit-btn",
          );
          if (submitBtn) submitBtn.textContent = "Simpan Perubahan Kode";
          if (questionCodeCancelBtn) questionCodeCancelBtn.hidden = false;
          return;
        }
        if (action === "delete") {
          if (
            !window.confirm("Hapus kode soal " + String(item.code || "") + "?")
          ) {
            return;
          }
          const done = beginBusy(btn, msg, "Menghapus kode soal...");
          try {
            await api("/api/v1/question-codes/" + id, "DELETE", {});
            await loadQuestionCodes(
              Number(
                (questionCodeSubjectSelect &&
                  questionCodeSubjectSelect.value) ||
                  0,
              ),
            );
            await loadBlueprints(
              Number(
                (blueprintFilterSubject && blueprintFilterSubject.value) || 0,
              ),
            );
            setMsg("Kode soal berhasil dihapus.");
          } catch (err) {
            setMsg("Gagal menghapus kode soal: " + err.message);
          } finally {
            done();
          }
        }
      });
    }

    if (examsRefreshBtn) {
      examsRefreshBtn.addEventListener("click", async function () {
        const done = beginBusy(examsRefreshBtn, msg, "Memuat data ujian...");
        try {
          await Promise.all([
            loadGuruExamManageTable(),
            loadGuruExamSubjectOptions(),
          ]);
          const selectedExamID = Number(
            (questionExamIDInput && questionExamIDInput.value) || 0,
          );
          fillExamQuestionCodeSelectByExam(selectedExamID);
          await loadExamQuestionCodeRules(selectedExamID);
          setMsg("Data ujian berhasil dimuat.");
        } catch (err) {
          setMsg("Gagal memuat data ujian: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (examForm) {
      examForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        if (examFormSubmitting) {
          setMsg("Penyimpanan ujian sedang diproses. Mohon tunggu...");
          return;
        }
        const fd = new FormData(examForm);
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
        const done = beginBusy(examForm, msg, "Menyimpan ujian...");
        try {
          const out =
            examID > 0
              ? await api("/api/v1/admin/exams/" + examID, "PUT", payload)
              : await api("/api/v1/admin/exams", "POST", payload);
          const savedID = out && out.id ? String(out.id) : "-";
          setMsg("Ujian berhasil disimpan. ID: " + savedID);
          examForm.reset();
          const examIDInput = examForm.elements.namedItem("exam_id");
          if (examIDInput) examIDInput.value = "";
          await loadGuruExamManageTable();
        } catch (err) {
          setMsg("Gagal menyimpan ujian: " + err.message);
        } finally {
          done();
          window.setTimeout(function () {
            examFormSubmitting = false;
          }, 700);
        }
      });
    }

    if (examsBody) {
      examsBody.addEventListener("click", async function (e) {
        const btn =
          e.target && e.target.closest("button[data-exam-action][data-id]");
        if (!btn) return;
        const examID = Number(btn.getAttribute("data-id") || 0);
        const action = String(btn.getAttribute("data-exam-action") || "");
        if (examID <= 0) return;
        if (action === "use") {
          const examRow = findExamManageByID(examID);
          if (examForm && examRow) {
            const idField = examForm.elements.namedItem("exam_id");
            const codeField = examForm.elements.namedItem("code");
            const titleField = examForm.elements.namedItem("title");
            const subjectField = examForm.elements.namedItem("subject_id");
            const durationField =
              examForm.elements.namedItem("duration_minutes");
            const maxAttemptField = examForm.elements.namedItem("max_attempts");
            const policyField = examForm.elements.namedItem("review_policy");
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
          if (questionExamIDInput) questionExamIDInput.value = String(examID);
          if (examQuestionCodeRuleExamIDInput) {
            examQuestionCodeRuleExamIDInput.value = String(examID);
          }
          if (resultsExamSelect) resultsExamSelect.value = String(examID);
          fillExamQuestionCodeSelectByExam(examID);
          try {
            await Promise.all([
              loadGuruExamQuestions(examID),
              loadExamQuestionCodeRules(examID),
              loadGuruExamAssignments(examID),
            ]);
            setMsg("Exam ID " + examID + " dipilih.");
          } catch (err) {
            setMsg("Gagal memuat data ujian: " + err.message);
          }
          return;
        }
        if (action === "delete") {
          if (!window.confirm("Nonaktifkan ujian ini?")) return;
          const done = beginBusy(btn, msg, "Menonaktifkan ujian...");
          try {
            await api("/api/v1/admin/exams/" + examID, "DELETE");
            await loadGuruExamManageTable();
            setMsg("Ujian berhasil dinonaktifkan.");
          } catch (err) {
            setMsg("Gagal menonaktifkan ujian: " + err.message);
          } finally {
            done();
          }
        }
      });
    }

    if (examQuestionForm) {
      examQuestionForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(examQuestionForm);
        const examID = Number(fd.get("exam_id") || 0);
        if (examID <= 0) {
          setMsg("Isi Exam ID untuk menambah naskah.");
          return;
        }
        const payload = {
          question_id: Number(fd.get("question_id") || 0),
          seq_no: Number(fd.get("seq_no") || 0),
          weight: Number(fd.get("weight") || 1),
        };
        const done = beginBusy(
          examQuestionForm,
          msg,
          "Menyimpan naskah ke ujian...",
        );
        try {
          await api(
            "/api/v1/admin/exams/" + examID + "/questions",
            "POST",
            payload,
          );
          await Promise.all([
            loadGuruExamQuestions(examID),
            loadGuruExamManageTable(),
          ]);
          setMsg("Naskah berhasil dimasukkan ke ujian.");
        } catch (err) {
          setMsg("Gagal menyimpan naskah ke ujian: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (questionExamIDInput) {
      questionExamIDInput.addEventListener("change", function () {
        const examID = Number(questionExamIDInput.value || 0);
        if (examQuestionCodeRuleExamIDInput) {
          examQuestionCodeRuleExamIDInput.value =
            examID > 0 ? String(examID) : "";
        }
        fillExamQuestionCodeSelectByExam(examID);
      });
    }

    if (examQuestionCodeRuleExamIDInput) {
      examQuestionCodeRuleExamIDInput.addEventListener(
        "change",
        async function () {
          const examID = Number(examQuestionCodeRuleExamIDInput.value || 0);
          fillExamQuestionCodeSelectByExam(examID);
          try {
            await loadExamQuestionCodeRules(examID);
          } catch (_) {
            // no-op
          }
        },
      );
    }

    if (examQuestionCodeRuleForm) {
      examQuestionCodeRuleForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(examQuestionCodeRuleForm);
        const examID = Number(fd.get("exam_id") || 0);
        if (examID <= 0) {
          setMsg("Isi Exam ID untuk menyimpan rule kode soal.");
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
        const done = beginBusy(
          examQuestionCodeRuleForm,
          msg,
          "Menyimpan rule kode soal...",
        );
        try {
          await api(
            "/api/v1/admin/exams/" + examID + "/question-codes",
            "POST",
            payload,
          );
          await Promise.all([
            loadExamQuestionCodeRules(examID),
            loadGuruExamManageTable(),
          ]);
          setMsg("Rule kode soal berhasil disimpan.");
        } catch (err) {
          setMsg("Gagal menyimpan rule kode soal: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (examQuestionCodeSyncBtn) {
      examQuestionCodeSyncBtn.addEventListener("click", async function () {
        const examID = Number(
          (examQuestionCodeRuleExamIDInput &&
            examQuestionCodeRuleExamIDInput.value) ||
            (questionExamIDInput && questionExamIDInput.value) ||
            0,
        );
        if (examID <= 0) {
          setMsg("Pilih Exam ID sebelum sinkronisasi dari kode soal.");
          return;
        }
        const done = beginBusy(
          examQuestionCodeSyncBtn,
          msg,
          "Sinkronisasi soal ujian dari kode soal...",
        );
        try {
          const out = await api(
            "/api/v1/admin/exams/" + examID + "/question-codes/sync",
            "POST",
            {},
          );
          await Promise.all([
            loadGuruExamQuestions(examID),
            loadExamQuestionCodeRules(examID),
            loadGuruExamManageTable(),
          ]);
          const count = Number((out && out.total_questions) || 0);
          setMsg(
            "Sinkronisasi soal dari kode berhasil. Total soal ujian: " +
              String(count),
          );
        } catch (err) {
          setMsg("Sinkronisasi soal dari kode gagal: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (examQuestionsLoadBtn) {
      examQuestionsLoadBtn.addEventListener("click", async function () {
        const examID = Number(
          (questionExamIDInput && questionExamIDInput.value) || 0,
        );
        const done = beginBusy(
          examQuestionsLoadBtn,
          msg,
          "Memuat soal ujian...",
        );
        try {
          await loadGuruExamQuestions(examID);
          setMsg("Soal ujian berhasil dimuat.");
        } catch (err) {
          setMsg("Gagal memuat soal ujian: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (examQuestionsBody) {
      examQuestionsBody.addEventListener("click", async function (e) {
        const btn =
          e.target && e.target.closest("button[data-exam-question-del]");
        if (!btn) return;
        const examID = Number(
          (questionExamIDInput && questionExamIDInput.value) || 0,
        );
        const questionID = Number(
          btn.getAttribute("data-exam-question-del") || 0,
        );
        if (examID <= 0 || questionID <= 0) return;
        if (!window.confirm("Hapus soal ini dari ujian?")) return;
        const done = beginBusy(btn, msg, "Menghapus soal dari ujian...");
        try {
          await api(
            "/api/v1/admin/exams/" + examID + "/questions/" + questionID,
            "DELETE",
            {},
          );
          await Promise.all([
            loadGuruExamQuestions(examID),
            loadGuruExamManageTable(),
          ]);
          setMsg("Soal berhasil dihapus dari ujian.");
        } catch (err) {
          setMsg("Gagal menghapus soal dari ujian: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (examQuestionCodeRuleBody) {
      examQuestionCodeRuleBody.addEventListener("click", async function (e) {
        const btn =
          e.target && e.target.closest("button[data-exam-code-rule-del]");
        if (!btn) return;
        const examID = Number(
          (examQuestionCodeRuleExamIDInput &&
            examQuestionCodeRuleExamIDInput.value) ||
            (questionExamIDInput && questionExamIDInput.value) ||
            0,
        );
        const questionCodeID = Number(
          btn.getAttribute("data-exam-code-rule-del") || 0,
        );
        if (examID <= 0 || questionCodeID <= 0) return;
        if (!window.confirm("Hapus rule kode soal ini dari ujian?")) return;
        const done = beginBusy(btn, msg, "Menghapus rule kode soal...");
        try {
          await api(
            "/api/v1/admin/exams/" +
              examID +
              "/question-codes/" +
              questionCodeID,
            "DELETE",
            {},
          );
          await Promise.all([
            loadExamQuestionCodeRules(examID),
            loadGuruExamManageTable(),
          ]);
          setMsg("Rule kode soal berhasil dihapus.");
        } catch (err) {
          setMsg("Gagal menghapus rule kode soal: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (resultsRefreshBtn) {
      resultsRefreshBtn.addEventListener("click", async function () {
        const done = beginBusy(
          resultsRefreshBtn,
          msg,
          "Memuat daftar ujian...",
        );
        try {
          await loadGuruExamManageTable();
          setMsg("Daftar ujian berhasil dimuat.");
        } catch (err) {
          setMsg("Gagal memuat daftar ujian: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (resultsAssignmentForm) {
      resultsAssignmentForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(resultsAssignmentForm);
        const examID = Number(fd.get("exam_id") || 0);
        if (examID <= 0) {
          setMsg("Pilih ujian terlebih dahulu.");
          return;
        }
        const done = beginBusy(
          resultsAssignmentForm,
          msg,
          "Memuat hasil ujian peserta...",
        );
        try {
          await loadGuruExamAssignments(examID);
          setMsg("Hasil ujian peserta berhasil dimuat.");
        } catch (err) {
          setMsg("Gagal memuat hasil ujian peserta: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (resultsExamSelect) {
      resultsExamSelect.addEventListener("change", async function () {
        const examID = Number(resultsExamSelect.value || 0);
        if (examID <= 0) {
          await loadGuruExamAssignments(0);
          setMsg("Pilih ujian terlebih dahulu.");
          return;
        }
        const done = beginBusy(
          resultsExamSelect,
          msg,
          "Memuat hasil ujian peserta...",
        );
        try {
          await loadGuruExamAssignments(examID);
          setMsg("Hasil ujian peserta berhasil dimuat.");
        } catch (err) {
          setMsg("Gagal memuat hasil ujian peserta: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (resultsExportBtn) {
      resultsExportBtn.addEventListener("click", async function () {
        const examID = Number(
          (resultsExamSelect && resultsExamSelect.value) || 0,
        );
        if (examID <= 0) {
          setMsg("Pilih ujian terlebih dahulu.");
          return;
        }
        const done = beginBusy(
          resultsExportBtn,
          msg,
          "Menyiapkan file Excel...",
        );
        try {
          const res = await fetch(
            "/api/v1/admin/exams/" + examID + "/results/export",
            { method: "GET", credentials: "include" },
          );
          if (!res.ok) {
            const textBody = await res.text().catch(function () {
              return "";
            });
            throw new Error(textBody || "gagal mengunduh excel");
          }
          const blob = await res.blob();
          const cd = String(res.headers.get("content-disposition") || "");
          const m = cd.match(/filename=\"?([^\";]+)\"?/i);
          const filename = (m && m[1]) || "hasil_ujian.xlsx";
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
          setMsg("Excel hasil ujian berhasil diunduh.");
        } catch (err) {
          setMsg("Gagal mengunduh Excel: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (resultsReportBtn) {
      resultsReportBtn.addEventListener("click", function () {
        summarizeAttemptResult("report");
      });
    }
    if (resultsStatsBtn) {
      resultsStatsBtn.addEventListener("click", function () {
        summarizeAttemptResult("stats");
      });
    }
    if (resultsChartBtn) {
      resultsChartBtn.addEventListener("click", function () {
        renderResultsChart();
      });
    }

    if (subjectRefreshBtn) {
      subjectRefreshBtn.addEventListener("click", async function () {
        const done = beginBusy(subjectRefreshBtn, msg, "Memuat ulang mapel...");
        try {
          await loadSubjects();
          setMsg("Data mapel berhasil dimuat ulang.");
        } catch (err) {
          setMsg("Gagal memuat mapel: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (subjectAddBtn) {
      subjectAddBtn.hidden = !canManageSubjects;
      if (canManageSubjects) {
        subjectAddBtn.addEventListener("click", function () {
          openSubjectDialog(null);
        });
      }
    }

    if (subjectsBody && canManageSubjects) {
      subjectsBody.addEventListener("click", function (e) {
        const btn =
          e.target && e.target.closest("button[data-action][data-id]");
        if (!btn) return;
        const id = Number(btn.getAttribute("data-id") || 0);
        const action = String(btn.getAttribute("data-action") || "");
        if (!id) return;
        const item = subjectsCache.find(function (it) {
          return Number(it.id) === id;
        });
        if (!item) return;
        if (action === "edit-subject") {
          openSubjectDialog(item);
        } else if (action === "delete-subject") {
          openSubjectDeleteDialog(item);
        }
      });
    }

    if (subjectCancelBtn) {
      subjectCancelBtn.addEventListener("click", function () {
        if (subjectDialog && typeof subjectDialog.close === "function") {
          subjectDialog.close();
        }
      });
    }

    if (subjectDeleteCancelBtn) {
      subjectDeleteCancelBtn.addEventListener("click", function () {
        if (
          subjectDeleteDialog &&
          typeof subjectDeleteDialog.close === "function"
        ) {
          subjectDeleteDialog.close();
        }
      });
    }

    if (subjectDialogForm && canManageSubjects) {
      subjectDialogForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(subjectDialogForm);
        const id = Number(fd.get("id") || 0);
        const payload = {
          education_level: String(fd.get("education_level") || "").trim(),
          subject_type: String(fd.get("subject_type") || "").trim(),
          name: String(fd.get("name") || "").trim(),
        };
        const done = beginBusy(subjectDialogForm, msg, "Menyimpan mapel...");
        try {
          if (id > 0) {
            await api("/api/v1/subjects/" + id, "PUT", payload);
            setMsg("Mapel berhasil diperbarui.");
          } else {
            await api("/api/v1/subjects", "POST", payload);
            setMsg("Mapel berhasil ditambahkan.");
          }
          if (subjectDialog && typeof subjectDialog.close === "function") {
            subjectDialog.close();
          }
          await loadSubjects();
        } catch (err) {
          setMsg("Simpan mapel gagal: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (subjectDeleteForm && canManageSubjects) {
      subjectDeleteForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(subjectDeleteForm);
        const id = Number(fd.get("id") || 0);
        if (!id) return;
        const done = beginBusy(subjectDeleteForm, msg, "Menghapus mapel...");
        try {
          await api("/api/v1/subjects/" + id, "DELETE");
          if (
            subjectDeleteDialog &&
            typeof subjectDeleteDialog.close === "function"
          ) {
            subjectDeleteDialog.close();
          }
          await loadSubjects();
          setMsg("Mapel berhasil dihapus.");
        } catch (err) {
          setMsg("Hapus mapel gagal: " + err.message);
        } finally {
          done();
        }
      });
    }
  }

  async function initAuthoringPage() {
    const root = document.querySelector('[data-page="authoring_content"]');
    if (!root) return;

    const user = await meOrNull();
    if (!user) {
      window.location.href = "/login";
      return;
    }
    if (!["admin", "proktor", "guru"].includes(String(user.role || ""))) {
      alert("Halaman authoring hanya untuk admin/proktor/guru");
      window.location.href = "/";
      return;
    }

    const message = document.getElementById("authoring-message");
    const versionOut = document.getElementById("version-output");
    const parallelOut = document.getElementById("parallel-output");
    const reviewOut = document.getElementById("review-output");
    const reviewTaskList = document.getElementById("review-task-list");

    function pretty(el, data) {
      if (el) el.textContent = JSON.stringify(data, null, 2);
    }
    function setMsg(msg) {
      text(message, msg);
    }

    const versionCreateForm = document.getElementById("version-create-form");
    if (versionCreateForm) {
      versionCreateForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(versionCreateForm);
        const done = beginBusy(
          versionCreateForm,
          message,
          "Menyimpan versi soal...",
        );
        try {
          const qid = Number(fd.get("question_id") || 0);
          const payload = {
            stem_html: String(fd.get("stem_html") || ""),
            explanation_html: String(fd.get("explanation_html") || ""),
            hint_html: String(fd.get("hint_html") || ""),
            answer_key: JSON.parse(String(fd.get("answer_key_raw") || "{}")),
          };
          const stimulusHTML = String(fd.get("stimulus_html") || "").trim();
          if (stimulusHTML) payload.stimulus_html = stimulusHTML;
          const durationRaw = String(fd.get("duration_seconds") || "").trim();
          if (durationRaw !== "")
            payload.duration_seconds = Number(durationRaw);
          const weightRaw = String(fd.get("weight") || "").trim();
          if (weightRaw !== "") payload.weight = Number(weightRaw);
          const changeNote = String(fd.get("change_note") || "").trim();
          if (changeNote) payload.change_note = changeNote;

          const out = await api(
            "/api/v1/questions/" + qid + "/versions",
            "POST",
            payload,
          );
          pretty(versionOut, out);
          setMsg("Versi soal berhasil disimpan.");
        } catch (err) {
          setMsg("Gagal simpan versi: " + err.message);
        } finally {
          done();
        }
      });
    }

    const versionFinalizeForm = document.getElementById(
      "version-finalize-form",
    );
    if (versionFinalizeForm) {
      versionFinalizeForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(versionFinalizeForm);
        const done = beginBusy(
          versionFinalizeForm,
          message,
          "Memfinalisasi versi soal...",
        );
        try {
          const qid = Number(fd.get("question_id") || 0);
          const ver = Number(fd.get("version_no") || 0);
          const out = await api(
            "/api/v1/questions/" + qid + "/versions/" + ver + "/finalize",
            "POST",
          );
          pretty(versionOut, out);
          setMsg("Versi berhasil difinalkan.");
        } catch (err) {
          setMsg("Gagal finalize versi: " + err.message);
        } finally {
          done();
        }
      });
    }

    const versionListForm = document.getElementById("version-list-form");
    if (versionListForm) {
      versionListForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(versionListForm);
        const done = beginBusy(
          versionListForm,
          message,
          "Memuat daftar versi soal...",
        );
        try {
          const qid = Number(fd.get("question_id") || 0);
          const out = await api(
            "/api/v1/questions/" + qid + "/versions",
            "GET",
          );
          pretty(versionOut, out);
          setMsg("List versi berhasil dimuat.");
        } catch (err) {
          setMsg("Gagal list versi: " + err.message);
        } finally {
          done();
        }
      });
    }

    const parallelCreateForm = document.getElementById("parallel-create-form");
    if (parallelCreateForm) {
      parallelCreateForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(parallelCreateForm);
        const done = beginBusy(
          parallelCreateForm,
          message,
          "Menambahkan parallel exam...",
        );
        try {
          const examID = Number(fd.get("exam_id") || 0);
          const out = await api(
            "/api/v1/exams/" + examID + "/parallels",
            "POST",
            {
              question_id: Number(fd.get("question_id") || 0),
              parallel_group: String(fd.get("parallel_group") || "default"),
              parallel_order: Number(fd.get("parallel_order") || 0),
              parallel_label: String(fd.get("parallel_label") || ""),
            },
          );
          pretty(parallelOut, out);
          setMsg("Parallel berhasil ditambahkan.");
        } catch (err) {
          setMsg("Gagal tambah parallel: " + err.message);
        } finally {
          done();
        }
      });
    }

    const parallelListForm = document.getElementById("parallel-list-form");
    if (parallelListForm) {
      parallelListForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(parallelListForm);
        const done = beginBusy(
          parallelListForm,
          message,
          "Memuat daftar parallel exam...",
        );
        try {
          const examID = Number(fd.get("exam_id") || 0);
          const group = String(fd.get("parallel_group") || "").trim();
          const qs = group
            ? "?parallel_group=" + encodeURIComponent(group)
            : "";
          const out = await api(
            "/api/v1/exams/" + examID + "/parallels" + qs,
            "GET",
          );
          pretty(parallelOut, out);
          setMsg("List parallel berhasil dimuat.");
        } catch (err) {
          setMsg("Gagal list parallel: " + err.message);
        } finally {
          done();
        }
      });
    }

    function formatLocalDate(ts) {
      if (!ts) return "-";
      const d = new Date(ts);
      if (Number.isNaN(d.getTime())) return String(ts);
      return d.toLocaleString("id-ID");
    }

    function renderReviewTasks(items) {
      if (!reviewTaskList) return;
      if (!Array.isArray(items) || items.length === 0) {
        reviewTaskList.innerHTML =
          '<p class="muted">Belum ada review task untuk filter ini.</p>';
        return;
      }

      const blocks = items.map(function (it) {
        const note = it.note ? escapeHtml(String(it.note)) : "-";
        const examID =
          it.exam_id === null || typeof it.exam_id === "undefined"
            ? "-"
            : escapeHtml(String(it.exam_id));
        return [
          '<article class="review-item">',
          "<div><strong>Task #" +
            escapeHtml(String(it.id)) +
            "</strong> | status: <strong>" +
            escapeHtml(String(it.status || "")) +
            "</strong></div>",
          "<div>QID: " +
            escapeHtml(String(it.question_id || "")) +
            " | QVID: " +
            escapeHtml(String(it.question_version_id || "")) +
            " | reviewer: " +
            escapeHtml(String(it.reviewer_id || "")) +
            " | exam: " +
            examID +
            "</div>",
          "<div>Assigned: " +
            escapeHtml(formatLocalDate(it.assigned_at)) +
            " | Reviewed: " +
            escapeHtml(formatLocalDate(it.reviewed_at)) +
            "</div>",
          "<div>Note: " + note + "</div>",
          "</article>",
        ].join("");
      });
      reviewTaskList.innerHTML =
        '<div class="review-list">' + blocks.join("") + "</div>";
    }

    const reviewCreateForm = document.getElementById("review-create-form");
    if (reviewCreateForm) {
      reviewCreateForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(reviewCreateForm);
        const done = beginBusy(
          reviewCreateForm,
          message,
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

          const out = await api("/api/v1/reviews/tasks", "POST", payload);
          pretty(reviewOut, out);
          setMsg("Review task berhasil dibuat.");
        } catch (err) {
          setMsg("Gagal buat review task: " + err.message);
        } finally {
          done();
        }
      });
    }

    const reviewListForm = document.getElementById("review-list-form");
    if (reviewListForm) {
      reviewListForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(reviewListForm);
        const done = beginBusy(
          reviewListForm,
          message,
          "Memuat daftar review task...",
        );
        try {
          const params = new URLSearchParams();
          const status = String(fd.get("status") || "").trim();
          const reviewerID = String(fd.get("reviewer_id") || "").trim();
          if (status) params.set("status", status);
          if (reviewerID) params.set("reviewer_id", reviewerID);
          const qs = params.toString() ? "?" + params.toString() : "";

          const out = await api("/api/v1/reviews/tasks" + qs, "GET");
          renderReviewTasks(out);
          pretty(reviewOut, out);
          setMsg("Review task berhasil dimuat.");
        } catch (err) {
          setMsg("Gagal muat review task: " + err.message);
        } finally {
          done();
        }
      });
    }

    const decisionForm = document.getElementById("review-decision-form");
    const decisionStatus = document.getElementById("review-decision-status");
    const decisionNoteInput = document.getElementById("review-note-input");
    if (decisionStatus && decisionNoteInput) {
      const syncDecisionRule = function () {
        const mustFill = decisionStatus.value === "perlu_revisi";
        decisionNoteInput.required = mustFill;
      };
      syncDecisionRule();
      decisionStatus.addEventListener("change", syncDecisionRule);
    }
    if (decisionForm) {
      decisionForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(decisionForm);
        const done = beginBusy(
          decisionForm,
          message,
          "Menyimpan keputusan review...",
        );
        try {
          const taskID = Number(fd.get("task_id") || 0);
          const status = String(fd.get("status") || "").trim();
          const note = String(fd.get("note") || "").trim();
          if (status === "perlu_revisi" && !note) {
            setMsg("Alasan wajib diisi jika status perlu_revisi.");
            return;
          }

          const out = await api(
            "/api/v1/reviews/tasks/" + taskID + "/decision",
            "POST",
            { status: status, note: note },
          );
          pretty(reviewOut, out);
          setMsg("Keputusan review berhasil disimpan.");
        } catch (err) {
          setMsg("Gagal simpan keputusan review: " + err.message);
        } finally {
          done();
        }
      });
    }

    const reviewHistoryForm = document.getElementById("review-history-form");
    if (reviewHistoryForm) {
      reviewHistoryForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(reviewHistoryForm);
        const done = beginBusy(
          reviewHistoryForm,
          message,
          "Memuat riwayat review soal...",
        );
        try {
          const questionID = Number(fd.get("question_id") || 0);
          const out = await api(
            "/api/v1/questions/" + questionID + "/reviews",
            "GET",
          );
          pretty(reviewOut, out);
          setMsg("Riwayat review soal berhasil dimuat.");
        } catch (err) {
          setMsg("Gagal muat riwayat review soal: " + err.message);
        } finally {
          done();
        }
      });
    }
  }

  initTopbarAuth();
  initLoginPage();
  initHomePage();
  initSimulasiPage();
  initAdminPage();
  initProktorPage();
  initGuruPage();
  initAuthoringPage();
  initAttemptPage();
  initResultPage();
})();
