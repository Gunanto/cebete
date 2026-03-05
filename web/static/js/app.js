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

  function parseDownloadFilename(res, fallbackName) {
    const disposition = res.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename=\"?([^\";]+)\"?/i);
    if (match && match[1]) return match[1];
    return fallbackName || "download.csv";
  }

  async function downloadCSV(path, payload, fallbackName) {
    const res = await fetch(path, {
      method: "POST",
      credentials: "include",
      headers: csrfHeaders("POST"),
      body: JSON.stringify(payload || {}),
    });
    if (!res.ok) {
      const json = await res.json().catch(function () {
        return {};
      });
      const msg = extractAPIError(json, res.statusText || "Request failed");
      throw new Error(msg);
    }
    const blob = await res.blob();
    const name = parseDownloadFilename(res, fallbackName);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name || "download.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
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

  function iconSVGPath(kind) {
    const key = String(kind || "")
      .trim()
      .toLowerCase();
    if (key === "download") {
      return '<path d="M12 4v10" /><path d="M8 10l4 4 4-4" /><path d="M4 18h16" />';
    }
    if (key === "upload") {
      return '<path d="M12 20V10" /><path d="M8 14l4-4 4 4" /><path d="M4 6h16" />';
    }
    if (key === "plus") {
      return '<path d="M12 5v14M5 12h14" />';
    }
    if (key === "left") {
      return '<path d="M15 18l-6-6 6-6" />';
    }
    if (key === "right") {
      return '<path d="M9 18l6-6-6-6" />';
    }
    if (key === "trash") {
      return '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>';
    }
    if (key === "close") {
      return '<path d="M6 6l12 12"/><path d="M18 6L6 18"/>';
    }
    if (key === "check") {
      return '<path d="M20 6L9 17l-5-5" />';
    }
    return '<path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" />';
  }

  function iconKindForButton(el) {
    if (!el) return "";
    const className = String(el.className || "").toLowerCase();
    const txt = String(el.textContent || "")
      .trim()
      .toLowerCase();
    if (!txt) return "";
    if (className.includes("btn-danger") || txt.includes("hapus"))
      return "trash";
    if (
      txt.includes("sebelumnya") ||
      txt.includes("kembali") ||
      txt === "kembali"
    ) {
      return "left";
    }
    if (txt.includes("berikutnya") || txt.includes("lanjut")) return "right";
    if (txt.includes("import") || txt.includes("impor")) return "upload";
    if (
      txt.includes("ekspor") ||
      txt.includes("export") ||
      txt.includes("unduh") ||
      txt.includes("template")
    ) {
      return "download";
    }
    if (
      txt.includes("tambah") ||
      txt.includes("buat") ||
      txt.includes("baru")
    ) {
      return "plus";
    }
    if (
      txt.includes("tutup") ||
      txt.includes("batal") ||
      txt.includes("close")
    ) {
      return "close";
    }
    if (
      txt.includes("simpan") ||
      txt.includes("kirim") ||
      txt.includes("submit")
    ) {
      return "check";
    }
    if (
      txt.includes("muat") ||
      txt.includes("refresh") ||
      txt.includes("cari") ||
      txt.includes("filter")
    ) {
      return "refresh";
    }
    return "";
  }

  function applyAutoIconToButton(el) {
    if (!el || !el.classList) return;
    if (el.classList.contains("icon-only-btn")) return;
    if (el.classList.contains("admin-menu-btn")) return;
    if (el.querySelector(".icon-wrap, .admin-menu-icon, svg")) return;
    if (el.getAttribute("data-auto-iconified") === "1") return;
    const kind = iconKindForButton(el);
    if (!kind) return;
    const iconWrap = document.createElement("span");
    iconWrap.className = "icon-wrap";
    iconWrap.setAttribute("aria-hidden", "true");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("focusable", "false");
    svg.innerHTML = iconSVGPath(kind);
    iconWrap.appendChild(svg);
    el.classList.add("icon-btn");
    el.prepend(iconWrap);
    el.setAttribute("data-auto-iconified", "1");
  }

  function enhanceButtonIcons(root) {
    if (!root || !root.querySelectorAll) return;
    const scan = function (container) {
      if (!container || !container.querySelectorAll) return;
      if (container.matches && container.matches("button.btn, a.btn")) {
        applyAutoIconToButton(container);
      }
      container
        .querySelectorAll("button.btn, a.btn")
        .forEach(applyAutoIconToButton);
    };
    scan(root);
    if (root.getAttribute("data-auto-icon-observer") === "1") return;
    if (typeof MutationObserver !== "function") return;
    const observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        const added = mutation.addedNodes || [];
        for (let i = 0; i < added.length; i += 1) {
          const node = added[i];
          if (!node || node.nodeType !== 1) continue;
          scan(node);
        }
      });
    });
    observer.observe(root, { childList: true, subtree: true });
    root.setAttribute("data-auto-icon-observer", "1");
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
    const signinForm = document.getElementById("login-form");
    if (!signinForm) return;
    const loginOTPForm = document.getElementById("login-otp-form");
    const signupForm = document.getElementById("signup-form");
    const msg = document.getElementById("login-message");
    const passwordInput = document.getElementById("login-password");
    const togglePasswordBtn = document.getElementById("toggle-login-password");
    const signinTabBtn = document.getElementById("login-tab-signin");
    const signupTabBtn = document.getElementById("login-tab-signup");
    const signinPanel = document.getElementById("login-signin-panel");
    const signupPanel = document.getElementById("login-signup-panel");
    const signupRequestOTPBtn = document.getElementById(
      "signup-request-otp-btn",
    );
    const signupEmailInput = document.getElementById("signup-email");
    const signupOTPCodeInput = document.getElementById("signup-otp-code");
    const loginOTPRequestBtn = document.getElementById("login-otp-request-btn");
    const loginOTPEmailInput = document.getElementById("login-otp-email");
    const loginOTPCodeInput = document.getElementById("login-otp-code");
    const passwordMethodTabBtn = document.getElementById(
      "login-auth-tab-password",
    );
    const otpMethodTabBtn = document.getElementById("login-auth-tab-otp");
    const loginOTPStepRequest = document.getElementById(
      "login-otp-step-request",
    );
    const loginOTPStepVerify = document.getElementById("login-otp-step-verify");
    const loginOTPResetBtn = document.getElementById("login-otp-reset-btn");
    const loginOTPDigitInputs = Array.from(
      document.querySelectorAll(".login-otp-digit"),
    );

    if (passwordInput && togglePasswordBtn) {
      togglePasswordBtn.addEventListener("click", function () {
        const show = passwordInput.type === "password";
        passwordInput.type = show ? "text" : "password";
        togglePasswordBtn.setAttribute("aria-pressed", show ? "true" : "false");
        togglePasswordBtn.setAttribute(
          "aria-label",
          show ? "Sembunyikan password" : "Tampilkan password",
        );
        const eyeOpen = togglePasswordBtn.querySelector("[data-eye-open]");
        const eyeClosed = togglePasswordBtn.querySelector("[data-eye-closed]");
        if (eyeOpen) eyeOpen.hidden = show;
        if (eyeClosed) eyeClosed.hidden = !show;
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

    function activateLoginTab(tab) {
      const showSignup = tab === "signup";
      if (signinPanel) signinPanel.hidden = showSignup;
      if (signupPanel) signupPanel.hidden = !showSignup;
      if (signinTabBtn)
        signinTabBtn.setAttribute(
          "aria-pressed",
          showSignup ? "false" : "true",
        );
      if (signupTabBtn)
        signupTabBtn.setAttribute(
          "aria-pressed",
          showSignup ? "true" : "false",
        );
      text(
        msg,
        showSignup
          ? "Masukkan data pendaftaran, kirim OTP, lalu verifikasi."
          : "Masukkan username/email dan password untuk login.",
      );
    }

    function resetLoginOTPSteps() {
      if (loginOTPStepRequest) loginOTPStepRequest.hidden = false;
      if (loginOTPStepVerify) loginOTPStepVerify.hidden = true;
      if (loginOTPCodeInput) loginOTPCodeInput.value = "";
      loginOTPDigitInputs.forEach(function (input) {
        input.value = "";
      });
    }

    function syncLoginOTPCode() {
      if (!loginOTPCodeInput || loginOTPDigitInputs.length === 0) return;
      loginOTPCodeInput.value = loginOTPDigitInputs
        .map(function (input) {
          return String(input.value || "")
            .replace(/\D/g, "")
            .slice(0, 1);
        })
        .join("");
    }

    if (loginOTPDigitInputs.length > 0) {
      loginOTPDigitInputs.forEach(function (input, idx) {
        input.addEventListener("input", function () {
          const cleaned = String(input.value || "").replace(/\D/g, "");
          input.value = cleaned ? cleaned.charAt(cleaned.length - 1) : "";
          syncLoginOTPCode();
          if (input.value && idx < loginOTPDigitInputs.length - 1) {
            loginOTPDigitInputs[idx + 1].focus();
          }
        });
        input.addEventListener("keydown", function (ev) {
          if (ev.key === "Backspace" && !input.value && idx > 0) {
            loginOTPDigitInputs[idx - 1].focus();
          }
        });
        input.addEventListener("paste", function (ev) {
          const pasted = (ev.clipboardData || window.clipboardData || {})
            .getData?.("text")
            ?.replace(/\D/g, "")
            .slice(0, loginOTPDigitInputs.length);
          if (!pasted) return;
          ev.preventDefault();
          loginOTPDigitInputs.forEach(function (slot, slotIdx) {
            slot.value = pasted.charAt(slotIdx) || "";
          });
          syncLoginOTPCode();
          const nextIdx = Math.min(
            pasted.length,
            loginOTPDigitInputs.length - 1,
          );
          loginOTPDigitInputs[nextIdx].focus();
        });
      });
    }

    function activateAuthMethod(method) {
      const useOTP = method === "otp";
      if (signinForm) signinForm.hidden = useOTP;
      if (loginOTPForm) loginOTPForm.hidden = !useOTP;
      if (passwordMethodTabBtn) {
        passwordMethodTabBtn.setAttribute(
          "aria-pressed",
          useOTP ? "false" : "true",
        );
        passwordMethodTabBtn.classList.toggle("is-active", !useOTP);
      }
      if (otpMethodTabBtn) {
        otpMethodTabBtn.setAttribute("aria-pressed", useOTP ? "true" : "false");
        otpMethodTabBtn.classList.toggle("is-active", useOTP);
      }
      if (useOTP) resetLoginOTPSteps();
      text(
        msg,
        useOTP
          ? "Masukkan email, kirim OTP, lalu verifikasi untuk login."
          : "Masukkan username/email dan password untuk login.",
      );
    }

    if (signinTabBtn) {
      signinTabBtn.addEventListener("click", function () {
        activateLoginTab("signin");
      });
    }
    if (signupTabBtn) {
      signupTabBtn.addEventListener("click", function () {
        activateLoginTab("signup");
      });
    }
    if (passwordMethodTabBtn) {
      passwordMethodTabBtn.addEventListener("click", function () {
        activateAuthMethod("password");
      });
    }
    if (otpMethodTabBtn) {
      otpMethodTabBtn.addEventListener("click", function () {
        activateAuthMethod("otp");
      });
    }

    activateLoginTab("signin");
    activateAuthMethod("password");

    const user = await meOrNull();
    if (user) {
      window.location.href = homeByRole(user);
      return;
    }

    signinForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      const done = beginBusy(signinForm, msg, "Memproses login...");
      const fd = new FormData(signinForm);
      try {
        const identifier = normalizeCredential(fd.get("identifier"));
        const password = normalizeCredential(fd.get("password"));
        await api("/api/v1/auth/login-password", "POST", {
          identifier: identifier,
          password: password,
        });
        const me = await meOrNull();
        window.location.href = homeByRole(me);
      } catch (err) {
        text(msg, "Login gagal: " + err.message);
      } finally {
        done();
      }
    });

    if (loginOTPRequestBtn && loginOTPEmailInput) {
      loginOTPRequestBtn.addEventListener("click", async function () {
        const done = beginBusy(
          loginOTPForm || loginOTPRequestBtn,
          msg,
          "Mengirim OTP login...",
        );
        try {
          const email = normalizeCredential(loginOTPEmailInput.value);
          await api("/api/v1/auth/otp/request", "POST", { email: email });
          text(msg, "OTP login sudah dikirim jika akun memenuhi syarat.");
          if (loginOTPStepRequest) loginOTPStepRequest.hidden = true;
          if (loginOTPStepVerify) loginOTPStepVerify.hidden = false;
          if (loginOTPDigitInputs.length > 0 && loginOTPDigitInputs[0].focus) {
            loginOTPDigitInputs[0].focus();
          } else if (loginOTPCodeInput && loginOTPCodeInput.focus) {
            loginOTPCodeInput.focus();
          }
        } catch (err) {
          text(msg, "Gagal kirim OTP login: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (loginOTPForm) {
      loginOTPForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        syncLoginOTPCode();
        const done = beginBusy(loginOTPForm, msg, "Memverifikasi OTP login...");
        const fd = new FormData(loginOTPForm);
        try {
          const email = normalizeCredential(fd.get("email"));
          const code = normalizeCredential(fd.get("code"));
          await api("/api/v1/auth/otp/verify", "POST", {
            email: email,
            code: code,
          });
          const me = await meOrNull();
          window.location.href = homeByRole(me);
        } catch (err) {
          text(msg, "Login OTP gagal: " + err.message);
        } finally {
          done();
        }
      });
    }
    if (loginOTPResetBtn) {
      loginOTPResetBtn.addEventListener("click", function () {
        resetLoginOTPSteps();
        if (loginOTPEmailInput && loginOTPEmailInput.focus) {
          loginOTPEmailInput.focus();
        }
      });
    }

    if (signupRequestOTPBtn && signupEmailInput) {
      signupRequestOTPBtn.addEventListener("click", async function () {
        const done = beginBusy(
          signupForm || signupRequestOTPBtn,
          msg,
          "Mengirim OTP verifikasi email...",
        );
        try {
          const email = normalizeCredential(signupEmailInput.value);
          await api("/api/v1/auth/signup/otp/request", "POST", {
            email: email,
          });
          text(
            msg,
            "OTP sudah dikirim jika email memenuhi syarat pendaftaran.",
          );
          if (signupOTPCodeInput && signupOTPCodeInput.focus)
            signupOTPCodeInput.focus();
        } catch (err) {
          text(msg, "Gagal kirim OTP: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (signupForm) {
      signupForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const done = beginBusy(
          signupForm,
          msg,
          "Memverifikasi OTP dan membuat pendaftaran...",
        );
        const fd = new FormData(signupForm);
        try {
          const payload = {
            role_requested: normalizeCredential(
              fd.get("role_requested"),
            ).toLowerCase(),
            full_name: normalizeCredential(fd.get("full_name")),
            email: normalizeCredential(fd.get("email")),
            phone: normalizeCredential(fd.get("phone")),
            institution_name: normalizeCredential(fd.get("institution_name")),
            code: normalizeCredential(fd.get("code")),
          };
          const data = await api(
            "/api/v1/auth/signup/otp/verify",
            "POST",
            payload,
          );
          const regID =
            data && data.registration_id ? String(data.registration_id) : "-";
          text(
            msg,
            "Pendaftaran terkirim (ID: " +
              regID +
              "). Tunggu verifikasi proktor/admin sebelum bisa login.",
          );
          signupForm.reset();
          if (signupOTPCodeInput) signupOTPCodeInput.value = "";
        } catch (err) {
          text(msg, "Pendaftaran gagal: " + err.message);
        } finally {
          done();
        }
      });
    }
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
        if (isStudentRole) {
          api("/api/v1/auth/logout", "POST")
            .catch(function () {
              // no-op
            })
            .finally(function () {
              window.location.href = "/login";
            });
          return;
        }
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
          const errMsg = String((err && err.message) || "").toLowerCase();
          const warn = errMsg.includes("token")
            ? "Token ujian salah atau tidak berlaku."
            : "Gagal memulai ujian: " + err.message;
          if (examInstructionDialogHelp) {
            examInstructionDialogHelp.textContent = warn;
          }
          window.alert(warn);
        }
      });
    }

    if (isStudentRole) {
      if (legacyFlow) legacyFlow.hidden = true;
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
    let timeoutAutoSubmitFired = false;
    let submitInProgress = false;

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
      if (remain <= 0 && attemptEditable) {
        triggerTimeoutAutoSubmit();
      }
      remainInterval = setInterval(function () {
        remain = Math.max(0, remain - 1);
        text(remainingLabel, formatRemain(remain));
        if (remain <= 0 && attemptEditable) {
          triggerTimeoutAutoSubmit();
        }
      }, 1000);
      return sum;
    }

    function normalizeAttemptStemHTML(stemHTML) {
      let stem = String(stemHTML || "");
      stem = stem.replace(/^\s*<p>\s*draft naskah soal:\s*/i, "<p>");
      stem = stem.replace(/^\s*draft naskah soal:\s*/i, "");
      return stem;
    }

    function applyAttemptReadonlyState(summaryStatus, customMessageHTML) {
      if (remainInterval) {
        clearInterval(remainInterval);
        remainInterval = null;
      }
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
      if (customMessageHTML) {
        html(message, customMessageHTML);
        return;
      }
      html(
        message,
        "Attempt sudah " +
          escapeHtml(String(summaryStatus || "final")) +
          ' dan tidak bisa diedit. Buka <a href="/hasil/' +
          encodeURIComponent(String(attemptID)) +
          '">halaman hasil</a>.',
      );
    }

    async function submitAttemptNow() {
      if (submitInProgress) return;
      submitInProgress = true;
      try {
        await api("/api/v1/attempts/" + attemptID + "/submit", "POST");
      } finally {
        submitInProgress = false;
      }
    }

    async function triggerTimeoutAutoSubmit() {
      if (timeoutAutoSubmitFired) return;
      timeoutAutoSubmitFired = true;
      if (remainInterval) {
        clearInterval(remainInterval);
        remainInterval = null;
      }
      applyAttemptReadonlyState(
        "expired",
        "Waktu habis. Jawaban dikunci dan ujian sedang disubmit otomatis...",
      );
      try {
        await submitAttemptNow();
        text(message, "Waktu habis. Ujian disubmit otomatis.");
        showAttemptFinishDialog();
      } catch (err) {
        html(
          message,
          "Waktu habis, jawaban sudah dikunci tetapi submit otomatis gagal: " +
            escapeHtml(err.message) +
            '. Buka <a href="/hasil/' +
            encodeURIComponent(String(attemptID)) +
            '">halaman hasil</a> atau hubungi pengawas.',
        );
      }
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
          await submitAttemptNow();
          applyAttemptReadonlyState("submitted", "Ujian telah disubmit.");
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
    enhanceButtonIcons(root);
    const AdminUsers = window.AdminUsers || {};
    const AdminMaster = window.AdminMaster || {};

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
    const classImportBtn = document.getElementById("admin-class-import-btn");
    const classImportTemplateBtn = document.getElementById(
      "admin-class-import-template-btn",
    );
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
    const classImportDialog = document.getElementById(
      "admin-class-import-dialog",
    );
    const classImportForm = document.getElementById("admin-class-import-form");
    const classImportCancelBtn = document.getElementById(
      "admin-class-import-cancel-btn",
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

    function initAdminUsersModule() {
      if (!AdminUsers || typeof AdminUsers.init !== "function") return;
      AdminUsers.init({
        api: api,
        apiMultipart: apiMultipart,
        beginBusy: beginBusy,
        setMsg: setMsg,
        message: message,
        text: text,
        escapeHtml: escapeHtml,
        extractAPIError: extractAPIError,
        fmtDate: fmtDate,
        isAdmin: isAdmin,
        regSummary: regSummary,
        regBody: regBody,
        regOut: regOut,
        regFilterForm: regFilterForm,
        prevPageBtn: prevPageBtn,
        nextPageBtn: nextPageBtn,
        pageInfo: pageInfo,
        exportUsersBtn: exportUsersBtn,
        importUsersBtn: importUsersBtn,
        addUserBtn: addUserBtn,
        userDetailDialog: userDetailDialog,
        userDetailOut: userDetailOut,
        userCreateDialog: userCreateDialog,
        userCreateForm: userCreateForm,
        userCreateCancelBtn: userCreateCancelBtn,
        userUpdateDialog: userUpdateDialog,
        userUpdateForm: userUpdateForm,
        userUpdateCancelBtn: userUpdateCancelBtn,
        userDeleteDialog: userDeleteDialog,
        userDeleteForm: userDeleteForm,
        userDeleteLabel: userDeleteLabel,
        userDeleteCancelBtn: userDeleteCancelBtn,
        userImportDialog: userImportDialog,
        userImportForm: userImportForm,
        userImportOut: userImportOut,
        userImportTemplateBtn: userImportTemplateBtn,
        userImportCancelBtn: userImportCancelBtn,
        userImportErrorDialog: userImportErrorDialog,
        userImportErrorOut: userImportErrorOut,
        userImportErrorCloseBtn: userImportErrorCloseBtn,
        loadDashboardStats: loadDashboardStats,
      });
    }

    function initAdminMasterModule() {
      if (!AdminMaster || typeof AdminMaster.init !== "function") return;
      AdminMaster.init({
        api: api,
        apiMultipart: apiMultipart,
        beginBusy: beginBusy,
        setMsg: setMsg,
        message: message,
        escapeHtml: escapeHtml,
        extractAPIError: extractAPIError,
        isAdmin: isAdmin,
        schoolLabel: schoolLabel,
        masterMessage: masterMessage,
        masterOut: masterOut,
        masterRefreshBtn: masterRefreshBtn,
        levelAddBtn: levelAddBtn,
        schoolAddBtn: schoolAddBtn,
        classAddBtn: classAddBtn,
        classImportBtn: classImportBtn,
        classImportTemplateBtn: classImportTemplateBtn,
        levelTableBody: levelTableBody,
        schoolTableBody: schoolTableBody,
        classTableBody: classTableBody,
        levelDialog: levelDialog,
        levelDialogForm: levelDialogForm,
        levelDialogTitle: levelDialogTitle,
        levelDialogCancelBtn: levelDialogCancelBtn,
        schoolDialog: schoolDialog,
        schoolDialogForm: schoolDialogForm,
        schoolDialogTitle: schoolDialogTitle,
        schoolDialogCancelBtn: schoolDialogCancelBtn,
        classDialog: classDialog,
        classDialogForm: classDialogForm,
        classDialogTitle: classDialogTitle,
        classDialogCancelBtn: classDialogCancelBtn,
        classImportDialog: classImportDialog,
        classImportForm: classImportForm,
        classImportCancelBtn: classImportCancelBtn,
        masterDeleteDialog: masterDeleteDialog,
        masterDeleteForm: masterDeleteForm,
        masterDeleteLabel: masterDeleteLabel,
        masterDeleteCancelBtn: masterDeleteCancelBtn,
        loadDashboardStats: loadDashboardStats,
        loadSchoolsForUserForms: loadSchoolsForUserForms,
        loadUsers: loadUsers,
        getSchoolsCache: function () {
          if (AdminUsers && typeof AdminUsers.getSchoolsCache === "function") {
            return AdminUsers.getSchoolsCache();
          }
          return [];
        },
      });
    }

    async function loadUsers() {
      if (AdminUsers && typeof AdminUsers.loadUsers === "function") {
        return AdminUsers.loadUsers();
      }
    }

    async function loadMasterSummaryTable() {
      if (
        AdminMaster &&
        typeof AdminMaster.loadMasterSummaryTable === "function"
      ) {
        return AdminMaster.loadMasterSummaryTable();
      }
    }

    async function loadSchoolsForUserForms() {
      if (
        AdminUsers &&
        typeof AdminUsers.loadSchoolsForUserForms === "function"
      ) {
        return AdminUsers.loadSchoolsForUserForms();
      }
    }

    function applyUserFormRoleRequirements(formEl) {
      if (
        AdminUsers &&
        typeof AdminUsers.applyUserFormRoleRequirements === "function"
      ) {
        return AdminUsers.applyUserFormRoleRequirements(formEl);
      }
    }

    function fillSchoolSelect(selectEl, selectedID) {
      if (AdminUsers && typeof AdminUsers.fillSchoolSelect === "function") {
        return AdminUsers.fillSchoolSelect(selectEl, selectedID);
      }
    }

    function resetClassSelect(selectEl, placeholder) {
      if (AdminUsers && typeof AdminUsers.resetClassSelect === "function") {
        return AdminUsers.resetClassSelect(selectEl, placeholder);
      }
    }

    function syncSchoolCodeDisplay(formEl) {
      if (
        AdminUsers &&
        typeof AdminUsers.syncSchoolCodeDisplay === "function"
      ) {
        return AdminUsers.syncSchoolCodeDisplay(formEl);
      }
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

    async function loadDashboardStats() {
      const out = await api("/api/v1/admin/dashboard/stats", "GET");
      if (statAdmin) statAdmin.textContent = String(out.admin_count || 0);
      if (statProktor) statProktor.textContent = String(out.proktor_count || 0);
      if (statGuru) statGuru.textContent = String(out.guru_count || 0);
      if (statSiswa) statSiswa.textContent = String(out.siswa_count || 0);
      if (statSekolah) statSekolah.textContent = String(out.school_count || 0);
    }

    initAdminUsersModule();
    initAdminMasterModule();

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

    try {
      if (
        AdminUsers &&
        typeof AdminUsers.setInitialFilterFromForm === "function"
      ) {
        AdminUsers.setInitialFilterFromForm();
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
    enhanceButtonIcons(root);
    const ProktorExams = window.ProktorExams || {};
    const ProktorCards = window.ProktorCards || {};
    const ProktorAttendance = window.ProktorAttendance || {};
    const ProktorToken = window.ProktorToken || {};
    const ProktorEvents = window.ProktorEvents || {};
    const ProktorRegistrations = window.ProktorRegistrations || {};
    const ProktorMaster = window.ProktorMaster || {};
    const ProktorPlacement = window.ProktorPlacement || {};
    const ProktorDashboard = window.ProktorDashboard || {};
    const ProktorQuick = window.ProktorQuick || {};
    const ProktorAudit = window.ProktorAudit || {};

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
    const eventsScopeSelect = document.getElementById("proktor-events-scope");
    const eventsExamSelect = document.getElementById("proktor-events-exam");
    const eventsClassSelect = document.getElementById("proktor-events-class");
    const eventsUserSelect = document.getElementById("proktor-events-user");
    const eventsAttemptInput = document.getElementById(
      "proktor-events-attempt-id",
    );
    const tokenPanel = document.getElementById("proktor-token-panel");
    const tokenForm = document.getElementById("proktor-token-form");
    const tokenExamSelect = document.getElementById("proktor-token-exam");
    const tokenTTLInput = document.getElementById("proktor-token-ttl");
    const tokenResult = document.getElementById("proktor-token-result");
    const cardsPanel = document.getElementById("proktor-cards-panel");
    const cardsForm = document.getElementById("proktor-cards-form");
    const cardsExamSelect = document.getElementById("proktor-cards-exam");
    const cardsSchoolSelect = document.getElementById("proktor-cards-school");
    const cardsClassSelect = document.getElementById("proktor-cards-class");
    const cardsOnlyActiveInput = document.getElementById(
      "proktor-cards-only-active",
    );
    const cardsMeta = document.getElementById("proktor-cards-meta");
    const cardsPages = document.getElementById("proktor-cards-pages");
    const cardsPrintBtn = document.getElementById("proktor-cards-print-btn");
    const attendancePanel = document.getElementById("proktor-attendance-panel");
    const attendanceForm = document.getElementById("proktor-attendance-form");
    const attendanceExamSelect = document.getElementById(
      "proktor-attendance-exam",
    );
    const attendanceSchoolSelect = document.getElementById(
      "proktor-attendance-school",
    );
    const attendanceClassSelect = document.getElementById(
      "proktor-attendance-class",
    );
    const attendanceDayInput = document.getElementById(
      "proktor-attendance-day",
    );
    const attendanceDateInput = document.getElementById(
      "proktor-attendance-date",
    );
    const attendanceTimeInput = document.getElementById(
      "proktor-attendance-time",
    );
    const attendanceOnlyActiveInput = document.getElementById(
      "proktor-attendance-only-active",
    );
    const attendanceMeta = document.getElementById("proktor-attendance-meta");
    const attendancePages = document.getElementById("proktor-attendance-pages");
    const attendancePrintBtn = document.getElementById(
      "proktor-attendance-print-btn",
    );
    const examsPanel = document.getElementById("proktor-exams-panel");
    const examsRefreshBtn = document.getElementById(
      "proktor-exams-refresh-btn",
    );
    const examForm = document.getElementById("proktor-exam-form");
    const examRandomizeQuestionsInput =
      examForm && examForm.elements
        ? examForm.elements.namedItem("randomize_questions")
        : null;
    const examRandomizeOptionsInput =
      examForm && examForm.elements
        ? examForm.elements.namedItem("randomize_options")
        : null;
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
    const auditPanel = document.getElementById("proktor-audit-panel");
    const auditForm = document.getElementById("proktor-audit-form");
    const auditBody = document.getElementById("proktor-audit-body");
    const auditAction = document.getElementById("proktor-audit-action");
    const auditEntityType = document.getElementById(
      "proktor-audit-entity-type",
    );
    const auditEntityID = document.getElementById("proktor-audit-entity-id");
    const auditUserID = document.getElementById("proktor-audit-user-id");
    const auditLimit = document.getElementById("proktor-audit-limit");
    const auditRefreshBtn = document.getElementById(
      "proktor-audit-refresh-btn",
    );
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
    const guidePanel = document.getElementById("proktor-guide-panel");
    const quickPanel = document.getElementById("proktor-quick-panel");
    const menuButtons = root.querySelectorAll("[data-proktor-menu]");
    const proktorPageTitle = document.getElementById("proktor-page-title");
    const proktorPageDesc = document.getElementById("proktor-page-desc");

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
    let eventsAssignments = [];

    function initProktorExamsModule() {
      if (!ProktorExams || typeof ProktorExams.init !== "function") return;
      ProktorExams.init({
        api: api,
        beginBusy: beginBusy,
        setMsg: setMsg,
        msg: msg,
        text: text,
        escapeHtml: escapeHtml,
        shortQuestionType: shortQuestionType,
        cleanStemPreview: cleanStemPreview,
        fmtDate: fmtDate,
        examsPanel: examsPanel,
        examsRefreshBtn: examsRefreshBtn,
        examForm: examForm,
        examRandomizeQuestionsInput: examRandomizeQuestionsInput,
        examRandomizeOptionsInput: examRandomizeOptionsInput,
        examSubjectSelect: examSubjectSelect,
        examsBody: examsBody,
        examAssignForm: examAssignForm,
        assignExamIDInput: assignExamIDInput,
        assignSchoolSelect: assignSchoolSelect,
        assignClassSelect: assignClassSelect,
        examAssignmentsLoadBtn: examAssignmentsLoadBtn,
        examAssignmentsBody: examAssignmentsBody,
        examQuestionForm: examQuestionForm,
        questionExamIDInput: questionExamIDInput,
        examQuestionsLoadBtn: examQuestionsLoadBtn,
        examQuestionsBody: examQuestionsBody,
        resultsRefreshBtn: resultsRefreshBtn,
        resultsAttemptForm: resultsAttemptForm,
        resultsResetAttemptForm: resultsResetAttemptForm,
        resultsSummary: resultsSummary,
        resultsExtra: resultsExtra,
        resultsReportBtn: resultsReportBtn,
        resultsStatsBtn: resultsStatsBtn,
        resultsChartBtn: resultsChartBtn,
        loadTokenExamOptions: loadTokenExamOptions,
        fillAssignClassSelectBySchool: fillAssignClassSelectBySchool,
        activateMenu: activateProktorMenu,
      });
    }

    function initProktorCardsModule() {
      if (!ProktorCards || typeof ProktorCards.init !== "function") return;
      ProktorCards.init({
        api: api,
        apiMultipart: apiMultipart,
        beginBusy: beginBusy,
        setMsg: setMsg,
        msg: msg,
        text: text,
        escapeHtml: escapeHtml,
        fmtDate: fmtDate,
        cardsForm: cardsForm,
        cardsExamSelect: cardsExamSelect,
        cardsSchoolSelect: cardsSchoolSelect,
        cardsClassSelect: cardsClassSelect,
        cardsOnlyActiveInput: cardsOnlyActiveInput,
        cardsMeta: cardsMeta,
        cardsPages: cardsPages,
        cardsPrintBtn: cardsPrintBtn,
      });
    }

    function initProktorAttendanceModule() {
      if (!ProktorAttendance || typeof ProktorAttendance.init !== "function") {
        return;
      }
      ProktorAttendance.init({
        api: api,
        beginBusy: beginBusy,
        setMsg: setMsg,
        msg: msg,
        text: text,
        escapeHtml: escapeHtml,
        attendanceForm: attendanceForm,
        attendanceExamSelect: attendanceExamSelect,
        attendanceSchoolSelect: attendanceSchoolSelect,
        attendanceClassSelect: attendanceClassSelect,
        attendanceDayInput: attendanceDayInput,
        attendanceDateInput: attendanceDateInput,
        attendanceTimeInput: attendanceTimeInput,
        attendanceOnlyActiveInput: attendanceOnlyActiveInput,
        attendanceMeta: attendanceMeta,
        attendancePages: attendancePages,
        attendancePrintBtn: attendancePrintBtn,
      });
    }

    function initProktorTokenModule() {
      if (!ProktorToken || typeof ProktorToken.init !== "function") return;
      ProktorToken.init({
        api: api,
        beginBusy: beginBusy,
        setMsg: setMsg,
        msg: msg,
        text: text,
        fmtDate: fmtDate,
        tokenForm: tokenForm,
        tokenExamSelect: tokenExamSelect,
        tokenTTLInput: tokenTTLInput,
        tokenResult: tokenResult,
      });
    }

    function initProktorEventsModule() {
      if (!ProktorEvents || typeof ProktorEvents.init !== "function") return;
      ProktorEvents.init({
        api: api,
        beginBusy: beginBusy,
        setMsg: setMsg,
        msg: msg,
        escapeHtml: escapeHtml,
        fmtDate: fmtDate,
        eventsForm: eventsForm,
        eventsBody: eventsBody,
      });
    }

    function initProktorRegistrationsModule() {
      if (
        !ProktorRegistrations ||
        typeof ProktorRegistrations.init !== "function"
      ) {
        return;
      }
      ProktorRegistrations.init({
        api: api,
        beginBusy: beginBusy,
        setMsg: setMsg,
        msg: msg,
        escapeHtml: escapeHtml,
        fmtDate: fmtDate,
        regRefreshBtn: regRefreshBtn,
        regBody: regBody,
        statPending: statPending,
      });
    }

    function initProktorMasterModule() {
      if (!ProktorMaster || typeof ProktorMaster.init !== "function") return;
      ProktorMaster.init({
        api: api,
        beginBusy: beginBusy,
        setMsg: setMsg,
        msg: msg,
        escapeHtml: escapeHtml,
        localSchoolLabel: localSchoolLabel,
        levelsBody: levelsBody,
        schoolsBody: schoolsBody,
        classesBody: classesBody,
        masterRefreshBtn: masterRefreshBtn,
        loadPlacementOptions: loadPlacementOptions,
      });
    }

    function initProktorPlacementModule() {
      if (!ProktorPlacement || typeof ProktorPlacement.init !== "function") {
        return;
      }
      ProktorPlacement.init({
        api: api,
        beginBusy: beginBusy,
        setMsg: setMsg,
        msg: msg,
        escapeHtml: escapeHtml,
        assignSchoolSelect: assignSchoolSelect,
        assignClassSelect: assignClassSelect,
        placementForm: placementForm,
        placementUserSelect: placementUserSelect,
        placementSchoolSelect: placementSchoolSelect,
        placementClassSelect: placementClassSelect,
      });
    }

    function initProktorDashboardModule() {
      if (!ProktorDashboard || typeof ProktorDashboard.init !== "function") {
        return;
      }
      ProktorDashboard.init({
        api: api,
        loadPendingRegistrations: loadPendingRegistrations,
        statUsers: statUsers,
        statSchools: statSchools,
      });
    }

    function initProktorQuickModule() {
      if (!ProktorQuick || typeof ProktorQuick.init !== "function") return;
      ProktorQuick.init({
        quickPanel: quickPanel,
      });
    }

    function initProktorAuditModule() {
      if (!ProktorAudit || typeof ProktorAudit.init !== "function") return;
      ProktorAudit.init({
        api: api,
        beginBusy: beginBusy,
        setMsg: setMsg,
        msg: msg,
        escapeHtml: escapeHtml,
        fmtDate: fmtDate,
        auditPanel: auditPanel,
        auditForm: auditForm,
        auditBody: auditBody,
        auditAction: auditAction,
        auditEntityType: auditEntityType,
        auditEntityID: auditEntityID,
        auditUserID: auditUserID,
        auditLimit: auditLimit,
        auditRefreshBtn: auditRefreshBtn,
      });
    }

    function safeInitModule(label, initFn) {
      if (typeof initFn !== "function") return;
      try {
        initFn();
      } catch (err) {
        setMsg("Modul " + label + " gagal inisialisasi: " + err.message);
      }
    }

    async function loadPendingRegistrations() {
      if (
        ProktorRegistrations &&
        typeof ProktorRegistrations.loadPendingRegistrations === "function"
      ) {
        return ProktorRegistrations.loadPendingRegistrations();
      }
      return [];
    }

    async function loadMasterReadonly() {
      if (
        ProktorMaster &&
        typeof ProktorMaster.loadMasterReadonly === "function"
      ) {
        return ProktorMaster.loadMasterReadonly();
      }
    }

    async function loadPlacementOptions() {
      if (
        ProktorPlacement &&
        typeof ProktorPlacement.loadPlacementOptions === "function"
      ) {
        return ProktorPlacement.loadPlacementOptions();
      }
    }

    function fillAssignClassSelectBySchool(schoolID) {
      if (
        ProktorPlacement &&
        typeof ProktorPlacement.fillAssignClassSelectBySchool === "function"
      ) {
        return ProktorPlacement.fillAssignClassSelectBySchool(schoolID);
      }
    }

    function resetEventsClassSelect(label) {
      if (!eventsClassSelect) return;
      eventsClassSelect.innerHTML =
        '<option value="">' +
        escapeHtml(label || "Pilih kelas...") +
        "</option>";
      eventsClassSelect.value = "";
    }

    function resetEventsUserSelect(label) {
      if (!eventsUserSelect) return;
      eventsUserSelect.innerHTML =
        '<option value="">' +
        escapeHtml(label || "Pilih peserta...") +
        "</option>";
      eventsUserSelect.value = "";
    }

    function fillEventsClassOptions(rows) {
      if (!eventsClassSelect) return;
      const seen = new Map();
      (Array.isArray(rows) ? rows : []).forEach(function (it) {
        const classID = String(it.class_id || "");
        if (!classID || seen.has(classID)) return;
        const label = String(
          it.class_name || it.class_label || it.class_id || "",
        ).trim();
        if (!label) return;
        seen.set(classID, label);
      });
      const entries = Array.from(seen.entries()).sort(function (a, b) {
        return String(a[1]).localeCompare(String(b[1]), "id");
      });
      resetEventsClassSelect("Pilih kelas...");
      entries.forEach(function (entry) {
        const o = document.createElement("option");
        o.value = entry[0];
        o.textContent = entry[1];
        eventsClassSelect.appendChild(o);
      });
    }

    function fillEventsUserOptions(rows, classID) {
      if (!eventsUserSelect) return;
      const classKey = String(classID || "");
      resetEventsUserSelect("Pilih peserta...");
      (Array.isArray(rows) ? rows : []).forEach(function (it) {
        if (classKey && String(it.class_id || "") !== classKey) return;
        const role = String(it.role || "").toLowerCase();
        if (role && role !== "student") return;
        const userID = String(it.user_id || "");
        if (!userID) return;
        const name = String(it.full_name || "-");
        const username = String(it.username || "-");
        const o = document.createElement("option");
        o.value = userID;
        o.textContent = name + " (" + username + ")";
        if (it.latest_attempt_id) {
          o.setAttribute("data-attempt-id", String(it.latest_attempt_id));
        }
        eventsUserSelect.appendChild(o);
      });
    }

    function syncEventsAttemptFromUser() {
      if (!eventsAttemptInput || !eventsUserSelect) return;
      const selected = eventsUserSelect.options[eventsUserSelect.selectedIndex];
      const attemptID = Number(
        selected ? selected.getAttribute("data-attempt-id") || 0 : 0,
      );
      eventsAttemptInput.value = attemptID > 0 ? String(attemptID) : "";
      if (eventsUserSelect.value && attemptID <= 0) {
        setMsg("Peserta ini belum memiliki attempt.");
      }
    }

    function setEventsScope(scope) {
      if (!eventsScopeSelect) return;
      const value = String(scope || eventsScopeSelect.value || "user");
      eventsScopeSelect.value = value;
      const isExam = value === "exam";
      const isClass = value === "class";
      const isUser = value === "user";
      if (eventsClassSelect) {
        eventsClassSelect.required = isClass || isUser;
        const label = eventsClassSelect.closest("label");
        if (label) label.hidden = isExam;
      }
      if (eventsUserSelect) {
        eventsUserSelect.required = isUser;
        const label = eventsUserSelect.closest("label");
        if (label) label.hidden = !isUser;
      }
      if (eventsAttemptInput && !isUser) {
        eventsAttemptInput.value = "";
      }
    }

    function initEventsFilters() {
      if (!eventsExamSelect || !eventsForm) return;
      if (eventsScopeSelect) {
        eventsScopeSelect.addEventListener("change", function () {
          setEventsScope(eventsScopeSelect.value);
        });
        setEventsScope(eventsScopeSelect.value);
      }
      eventsExamSelect.addEventListener("change", async function () {
        const examID = Number(eventsExamSelect.value || 0);
        eventsAssignments = [];
        resetEventsClassSelect(
          examID > 0 ? "Memuat kelas..." : "Pilih kelas...",
        );
        resetEventsUserSelect("Pilih peserta...");
        if (examID <= 0) return;
        const done = beginBusy(eventsForm, msg, "Memuat peserta ujian...");
        try {
          const rows = await api(
            "/api/v1/admin/exams/" + examID + "/assignments",
            "GET",
          );
          eventsAssignments = Array.isArray(rows) ? rows : [];
          fillEventsClassOptions(eventsAssignments);
          setMsg("Peserta ujian berhasil dimuat.");
        } catch (err) {
          resetEventsClassSelect("Pilih kelas...");
          resetEventsUserSelect("Pilih peserta...");
          setMsg("Gagal memuat peserta ujian: " + err.message);
        } finally {
          done();
        }
      });
      if (eventsClassSelect) {
        eventsClassSelect.addEventListener("change", function () {
          fillEventsUserOptions(eventsAssignments, eventsClassSelect.value);
          if (eventsAttemptInput) eventsAttemptInput.value = "";
          syncEventsAttemptFromUser();
        });
      }
      if (eventsUserSelect) {
        eventsUserSelect.addEventListener("change", function () {
          syncEventsAttemptFromUser();
        });
      }
    }

    async function loadExamSubjectOptions() {
      if (
        ProktorExams &&
        typeof ProktorExams.loadExamSubjectOptions === "function"
      ) {
        return ProktorExams.loadExamSubjectOptions();
      }
    }

    async function loadExamManageTable() {
      if (
        ProktorExams &&
        typeof ProktorExams.loadExamManageTable === "function"
      ) {
        return ProktorExams.loadExamManageTable();
      }
    }

    function renderEnrollAssignments(rows, replace) {
      if (!examAssignmentsBody) return;
      const items = Array.isArray(rows) ? rows : [];
      if (!items.length) {
        if (replace) {
          examAssignmentsBody.innerHTML =
            '<tr><td colspan="8" class="muted">Belum ada data peserta ujian.</td></tr>';
        }
        return;
      }
      if (replace) examAssignmentsBody.innerHTML = "";
      items.forEach(function (it) {
        const userID = String(it.user_id || "");
        if (!userID) return;
        const existing = examAssignmentsBody.querySelector(
          'tr[data-user-id="' + CSS.escape(userID) + '"]',
        );
        const tr = existing || document.createElement("tr");
        tr.setAttribute("data-user-id", userID);
        tr.innerHTML = [
          "<td>" + escapeHtml(String(it.user_id || "")) + "</td>",
          "<td>" + escapeHtml(String(it.full_name || "-")) + "</td>",
          "<td>" + escapeHtml(String(it.username || "-")) + "</td>",
          "<td>" + escapeHtml(String(it.role || "-")) + "</td>",
          "<td>" +
            escapeHtml(
              String(it.class_name || it.class_label || it.class_id || "-"),
            ) +
            "</td>",
          "<td>" + escapeHtml(String(it.status || "-")) + "</td>",
          "<td>" + escapeHtml(fmtDate(it.assigned_at)) + "</td>",
          '<td><button class="icon-only-btn danger" type="button" data-exam-assignment-del="' +
            escapeHtml(String(it.user_id || "")) +
            '" title="Keluarkan peserta" aria-label="Keluarkan peserta">' +
            '<svg viewBox="0 0 24 24" focusable="false"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/></svg>' +
            "</button></td>",
        ].join("");
        if (!existing) examAssignmentsBody.appendChild(tr);
      });
    }

    function bindEnrollFallbackHandlers() {
      if (
        examAssignForm &&
        !examAssignForm.getAttribute("data-proktor-bound")
      ) {
        examAssignForm.setAttribute("data-proktor-bound", "1");
        examAssignForm.addEventListener("submit", async function (e) {
          e.preventDefault();
          const examID = Number(
            (assignExamIDInput && assignExamIDInput.value) || 0,
          );
          const schoolID = Number(
            (assignSchoolSelect && assignSchoolSelect.value) || 0,
          );
          const classID = Number(
            (assignClassSelect && assignClassSelect.value) || 0,
          );
          if (examID <= 0) {
            setMsg("Pilih ujian untuk enroll peserta.");
            return;
          }
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
            const rows = await api(
              "/api/v1/admin/exams/" + examID + "/assignments/by-class/append",
              "POST",
              { school_id: schoolID, class_id: classID },
            );
            renderEnrollAssignments(rows, false);
            setMsg("Enroll peserta berhasil disimpan.");
          } catch (err) {
            setMsg("Gagal menyimpan enroll peserta: " + err.message);
          } finally {
            done();
          }
        });
      }
      if (
        examAssignmentsLoadBtn &&
        !examAssignmentsLoadBtn.getAttribute("data-proktor-bound")
      ) {
        examAssignmentsLoadBtn.setAttribute("data-proktor-bound", "1");
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
            const rows = await api(
              "/api/v1/admin/exams/" + examID + "/assignments",
              "GET",
            );
            renderEnrollAssignments(rows, true);
            setMsg("Peserta ujian berhasil dimuat.");
          } catch (err) {
            setMsg("Gagal memuat peserta ujian: " + err.message);
          } finally {
            done();
          }
        });
      }
      if (
        examAssignmentsBody &&
        !examAssignmentsBody.getAttribute("data-proktor-bound")
      ) {
        examAssignmentsBody.setAttribute("data-proktor-bound", "1");
        examAssignmentsBody.addEventListener("click", async function (e) {
          const btn =
            e.target && e.target.closest("button[data-exam-assignment-del]");
          if (!btn) return;
          const examID = Number(
            (assignExamIDInput && assignExamIDInput.value) || 0,
          );
          const userID = Number(
            btn.getAttribute("data-exam-assignment-del") || 0,
          );
          if (examID <= 0 || userID <= 0) return;
          if (!window.confirm("Keluarkan peserta ini dari ujian?")) return;
          const done = beginBusy(btn, msg, "Mengeluarkan peserta...");
          try {
            await api(
              "/api/v1/admin/exams/" + examID + "/assignments/" + userID,
              "DELETE",
              {},
            );
            const row = btn.closest("tr[data-user-id]") || btn.closest("tr");
            if (row && row.parentNode) row.parentNode.removeChild(row);
            setMsg("Peserta berhasil dikeluarkan.");
          } catch (err) {
            setMsg("Gagal mengeluarkan peserta: " + err.message);
          } finally {
            done();
          }
        });
      }
    }

    function activateProktorMenu(menu) {
      const allowed = [
        "dashboard",
        "registrations",
        "events",
        "token",
        "cards",
        "attendance",
        "exams",
        "results",
        "audit",
        "master",
        "guide",
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
      if (cardsPanel) cardsPanel.hidden = key !== "cards";
      if (attendancePanel) attendancePanel.hidden = key !== "attendance";
      if (examsPanel) examsPanel.hidden = key !== "exams";
      if (resultsPanel) resultsPanel.hidden = key !== "results";
      if (auditPanel) auditPanel.hidden = key !== "audit";
      if (masterPanel) masterPanel.hidden = key !== "master";
      if (guidePanel) guidePanel.hidden = key !== "guide";
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
        cards: {
          title: "Kartu Ujian",
          desc: "Cetak kartu peserta ujian per event ujian.",
        },
        attendance: {
          title: "Daftar Hadir",
          desc: "Cetak daftar hadir peserta asesmen per kelas.",
        },
        exams: {
          title: "Enroll Peserta",
          desc: "Enroll peserta ke ujian per kelas.",
        },
        results: {
          title: "Hasil Ujian",
          desc: "Lihat rekap dan detail hasil peserta.",
        },
        audit: {
          title: "Audit Log",
          desc: "Pantau perubahan kunci jawaban dan regrade ujian.",
        },
        master: {
          title: "Data Master",
          desc: "Kelola jenjang, sekolah, dan kelas.",
        },
        guide: {
          title: "Petunjuk Penggunaan",
          desc: "Panduan singkat penggunaan fitur proktor.",
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
      const exams = await api("/api/v1/admin/exams", "GET");
      const items = Array.isArray(exams) ? exams : [];
      if (
        ProktorAttendance &&
        typeof ProktorAttendance.setExamMetaByID === "function"
      ) {
        ProktorAttendance.setExamMetaByID(items);
      }
      function fillExamSelect(el) {
        if (!el) return;
        const current = String(el.value || "");
        el.innerHTML = '<option value="">Pilih ujian...</option>';
        items.forEach(function (it) {
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
      fillExamSelect(tokenExamSelect);
      fillExamSelect(cardsExamSelect);
      fillExamSelect(attendanceExamSelect);
      fillExamSelect(assignExamIDInput);
      fillExamSelect(eventsExamSelect);
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
    activateProktorMenu("dashboard");

    safeInitModule("Enroll Peserta", initProktorExamsModule);
    safeInitModule("Kartu Ujian", initProktorCardsModule);
    safeInitModule("Daftar Hadir", initProktorAttendanceModule);
    safeInitModule("Token Ujian", initProktorTokenModule);
    safeInitModule("Monitoring Event", initProktorEventsModule);
    safeInitModule("Verifikasi Pendaftaran", initProktorRegistrationsModule);
    safeInitModule("Data Master", initProktorMasterModule);
    safeInitModule("Penempatan Kelas", initProktorPlacementModule);
    safeInitModule("Dashboard", initProktorDashboardModule);
    safeInitModule("Aksi Cepat", initProktorQuickModule);
    safeInitModule("Audit Log", initProktorAuditModule);
    bindEnrollFallbackHandlers();
    initEventsFilters();

    try {
      let hadInitError = false;
      const safeStep = async function (label, fn) {
        try {
          await fn();
        } catch (err) {
          hadInitError = true;
          setMsg(label + " gagal dimuat: " + err.message);
        }
      };
      if (String((user && user.role) || "") === "proktor") {
        if (examQuestionForm) examQuestionForm.hidden = true;
        if (examQuestionsLoadBtn) examQuestionsLoadBtn.hidden = true;
      }
      if (
        ProktorDashboard &&
        typeof ProktorDashboard.loadProktorStatsAndPending === "function"
      ) {
        await safeStep("Dashboard", function () {
          return ProktorDashboard.loadProktorStatsAndPending();
        });
      }
      await safeStep("Data master", loadMasterReadonly);
      await safeStep("Penempatan kelas", loadPlacementOptions);
      await safeStep("Daftar ujian", loadTokenExamOptions);
      await safeStep("Daftar ujian", loadExamManageTable);
      const firstMenu =
        (menuButtons &&
          menuButtons.length > 0 &&
          menuButtons[0].getAttribute("data-proktor-menu")) ||
        "dashboard";
      activateProktorMenu(firstMenu);
      if (!hadInitError) setMsg("Dashboard proktor siap.");
    } catch (err) {
      setMsg("Gagal memuat dashboard proktor: " + err.message);
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
    enhanceButtonIcons(root);
    const canManageSubjects = String(user.role || "") === "guru";

    const msg = document.getElementById("guru-message");
    const statSubjects = document.getElementById("guru-stat-subjects");
    const statLevels = document.getElementById("guru-stat-levels");
    const statLearningGoals = document.getElementById(
      "guru-stat-learning-goals",
    );
    const statManuscripts = document.getElementById("guru-stat-manuscripts");
    const statExams = document.getElementById("guru-stat-exams");
    const statResults = document.getElementById("guru-stat-results");
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
    const guidePanel = document.getElementById("guru-guide-panel");
    const menuButtons = root.querySelectorAll("[data-guru-menu]");
    const menuJumpButtons = root.querySelectorAll("[data-guru-jump]");
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
    const manuscriptExportBtn = document.getElementById(
      "guru-manuscript-export-btn",
    );
    const manuscriptTransferBtn = document.getElementById(
      "guru-manuscript-transfer-btn",
    );
    const manuscriptTransferDialog = document.getElementById(
      "guru-manuscript-transfer-dialog",
    );
    const manuscriptTransferForm = document.getElementById(
      "guru-manuscript-transfer-form",
    );
    const manuscriptTransferUserInput = document.getElementById(
      "guru-manuscript-transfer-user",
    );
    const manuscriptTransferSubjectInput = document.getElementById(
      "guru-manuscript-transfer-subject",
    );
    const manuscriptTransferSourceInput = document.getElementById(
      "guru-manuscript-transfer-source",
    );
    const manuscriptTransferOutput = document.getElementById(
      "guru-manuscript-transfer-output",
    );
    const manuscriptTransferSummary = document.getElementById(
      "guru-manuscript-transfer-summary",
    );
    const manuscriptTransferCancelBtn = document.getElementById(
      "guru-manuscript-transfer-cancel-btn",
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
    const manuscriptQuestionCodeSubjectSelect = document.getElementById(
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
    const examQuestionPickForm = document.getElementById(
      "guru-exam-question-pick-form",
    );
    const questionPickExamIDInput = document.getElementById(
      "guru-question-pick-exam-id",
    );
    const examQuestionPickCodeSelect = document.getElementById(
      "guru-exam-question-pick-code-select",
    );
    const examQuestionPickLoadBtn = document.getElementById(
      "guru-exam-question-pick-load-btn",
    );
    const examQuestionPickToggleBtn = document.getElementById(
      "guru-exam-question-pick-toggle-btn",
    );
    const examQuestionPickAddBtn = document.getElementById(
      "guru-exam-question-pick-add-btn",
    );
    const examQuestionsPreviewDialog = document.getElementById(
      "guru-exam-questions-preview-dialog",
    );
    const examQuestionsPreviewTitle = document.getElementById(
      "guru-exam-questions-preview-title",
    );
    const examQuestionsPreviewBody = document.getElementById(
      "guru-exam-questions-preview-body",
    );
    const examQuestionsPreviewLimit = document.getElementById(
      "guru-exam-questions-preview-limit",
    );
    const examQuestionsPreviewPrev = document.getElementById(
      "guru-exam-questions-preview-prev",
    );
    const examQuestionsPreviewNext = document.getElementById(
      "guru-exam-questions-preview-next",
    );
    const examQuestionsPreviewPage = document.getElementById(
      "guru-exam-questions-preview-page",
    );
    const examQuestionPickBody = document.getElementById(
      "guru-exam-question-pick-body",
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

    const tabQuillByWrap = new WeakMap();

    function refreshGuruSummaryStats() {
      if (statLearningGoals) {
        const count =
          LearningGoals && typeof LearningGoals.getCount === "function"
            ? LearningGoals.getCount()
            : 0;
        statLearningGoals.textContent = String(Number(count || 0));
      }
      if (statManuscripts) {
        const count =
          ManuscriptTable &&
          typeof ManuscriptTable.getQuestionCount === "function"
            ? ManuscriptTable.getQuestionCount()
            : 0;
        statManuscripts.textContent = String(Number(count || 0));
      }
      if (statExams) {
        const total =
          GuruExams && typeof GuruExams.getExamCount === "function"
            ? GuruExams.getExamCount()
            : 0;
        statExams.textContent = String(Number(total || 0));
      }
      if (statResults) {
        const total =
          GuruExams && typeof GuruExams.getResultsCount === "function"
            ? GuruExams.getResultsCount()
            : 0;
        statResults.textContent = String(Number(total || 0));
      }
    }

    const setMsg = function (value) {
      text(msg, value);
    };
    const setManuscriptMsg = function (value) {
      const message = String(value || "");
      if (manuscriptMessage) text(manuscriptMessage, message);
      setMsg(message);
    };
    const fmtDate = function (raw) {
      if (!raw) return "-";
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return String(raw);
      return d.toLocaleString("id-ID");
    };

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

    const ImportParser = window.ImportParser || {};
    const parseImportContent = ImportParser.parseImportContent;
    const parseImportQuestionRow = ImportParser.parseImportQuestionRow;
    const parseImportQuestionBlock = ImportParser.parseImportQuestionBlock;
    const resolveImportSubjectID = ImportParser.resolveImportSubjectID;
    const QuestionCodes = window.QuestionCodes || {};
    const Blueprints = window.Blueprints || {};
    const LearningGoals = window.LearningGoals || {};
    const GuruSubjects = window.GuruSubjects || {};
    const GuruDashboard = window.GuruDashboard || {};
    const GuruManuscript = window.GuruManuscript || {};
    const GuruBlueprints = window.GuruBlueprints || {};
    const GuruResults = window.GuruResults || {};
    const GuruExams = window.GuruExams || {};
    const AuthoringReviews = window.AuthoringReviews || {};
    const ManuscriptImport = window.ManuscriptImport || {};
    const ManuscriptTable = window.ManuscriptTable || {};

    function getQuestionCodesCache() {
      if (QuestionCodes && typeof QuestionCodes.getCache === "function") {
        return QuestionCodes.getCache();
      }
      return [];
    }

    function questionCodeLabel(it) {
      if (QuestionCodes && typeof QuestionCodes.label === "function") {
        return QuestionCodes.label(it);
      }
      return "-";
    }

    function getSubjectsCache() {
      if (GuruSubjects && typeof GuruSubjects.getCache === "function") {
        return GuruSubjects.getCache();
      }
      return [];
    }

    function findQuestionCodeByID(id) {
      if (QuestionCodes && typeof QuestionCodes.findByID === "function") {
        return QuestionCodes.findByID(id);
      }
      return null;
    }

    function fillQuestionCodeSubjectSelect(selectedID) {
      if (
        QuestionCodes &&
        typeof QuestionCodes.fillSubjectSelect === "function"
      ) {
        QuestionCodes.fillSubjectSelect(selectedID);
      }
    }

    function fillQuestionCodeSelect(selectEl, subjectID, includeEmpty) {
      if (QuestionCodes && typeof QuestionCodes.fillSelect === "function") {
        QuestionCodes.fillSelect(selectEl, subjectID, includeEmpty);
      }
    }

    async function loadQuestionCodes(subjectID) {
      if (QuestionCodes && typeof QuestionCodes.load === "function") {
        return QuestionCodes.load(subjectID);
      }
      return [];
    }

    function initGuruBlueprintsModule() {
      if (!GuruBlueprints || typeof GuruBlueprints.init !== "function") return;
      GuruBlueprints.init({ blueprints: Blueprints });
    }

    function fillBlueprintSelect(selectEl) {
      if (GuruBlueprints && typeof GuruBlueprints.fillSelect === "function") {
        GuruBlueprints.fillSelect(selectEl);
      }
    }

    function getCurrentManuscriptQuestionType() {
      if (
        GuruBlueprints &&
        typeof GuruBlueprints.getCurrentManuscriptQuestionType === "function"
      ) {
        return GuruBlueprints.getCurrentManuscriptQuestionType();
      }
      return "";
    }

    function findQuestionByID(id) {
      if (GuruBlueprints && typeof GuruBlueprints.findByID === "function") {
        return GuruBlueprints.findByID(id);
      }
      return null;
    }

    function syncManuscriptSubjectState() {
      if (
        GuruBlueprints &&
        typeof GuruBlueprints.syncManuscriptSubjectState === "function"
      ) {
        return GuruBlueprints.syncManuscriptSubjectState();
      }
    }

    function getManuscriptTargetSubjectID() {
      if (
        GuruBlueprints &&
        typeof GuruBlueprints.getManuscriptTargetSubjectID === "function"
      ) {
        return GuruBlueprints.getManuscriptTargetSubjectID();
      }
      return 0;
    }

    function getManuscriptTargetLearningGoalID() {
      if (
        GuruBlueprints &&
        typeof GuruBlueprints.getManuscriptTargetLearningGoalID === "function"
      ) {
        return GuruBlueprints.getManuscriptTargetLearningGoalID();
      }
      return 0;
    }

    function resolveManuscriptQuestionType(item) {
      if (
        GuruBlueprints &&
        typeof GuruBlueprints.resolveManuscriptQuestionType === "function"
      ) {
        return GuruBlueprints.resolveManuscriptQuestionType(item);
      }
      return "";
    }

    function resolveManuscriptQuestionCode(item) {
      if (
        GuruBlueprints &&
        typeof GuruBlueprints.resolveManuscriptQuestionCode === "function"
      ) {
        return GuruBlueprints.resolveManuscriptQuestionCode(item);
      }
      return "";
    }

    function resolveManuscriptLearningGoal(item) {
      if (
        GuruBlueprints &&
        typeof GuruBlueprints.resolveManuscriptLearningGoal === "function"
      ) {
        return GuruBlueprints.resolveManuscriptLearningGoal(item);
      }
      return "";
    }

    async function loadAllManuscriptVersionsFromBlueprints() {
      if (
        GuruBlueprints &&
        typeof GuruBlueprints.loadAllManuscriptVersions === "function"
      ) {
        return GuruBlueprints.loadAllManuscriptVersions();
      }
      return [];
    }

    async function loadBlueprints(subjectID) {
      if (GuruBlueprints && typeof GuruBlueprints.load === "function") {
        return GuruBlueprints.load(subjectID);
      }
      return [];
    }

    function learningGoalLabel(it) {
      if (LearningGoals && typeof LearningGoals.label === "function") {
        return LearningGoals.label(it);
      }
      return "-";
    }

    function findLearningGoalByID(id) {
      if (LearningGoals && typeof LearningGoals.findByID === "function") {
        return LearningGoals.findByID(id);
      }
      return null;
    }

    function fillLearningGoalSelect(selectEl, subjectID) {
      if (LearningGoals && typeof LearningGoals.fillSelect === "function") {
        LearningGoals.fillSelect(selectEl, subjectID);
      }
    }

    function resolveDefaultLearningGoalID(subjectID) {
      if (
        LearningGoals &&
        typeof LearningGoals.resolveDefaultLearningGoalID === "function"
      ) {
        return LearningGoals.resolveDefaultLearningGoalID(subjectID);
      }
      return 0;
    }

    function resolveLearningGoalIDByCode(subjectID, codeRaw) {
      if (
        LearningGoals &&
        typeof LearningGoals.resolveLearningGoalIDByCode === "function"
      ) {
        return LearningGoals.resolveLearningGoalIDByCode(subjectID, codeRaw);
      }
      return 0;
    }

    function findLearningGoalByDetails(mapel, kelas, semester, tujuan, materi) {
      if (LearningGoals && typeof LearningGoals.findByDetails === "function") {
        return LearningGoals.findByDetails(
          mapel,
          kelas,
          semester,
          tujuan,
          materi,
        );
      }
      return null;
    }

    async function loadLearningGoals() {
      if (LearningGoals && typeof LearningGoals.load === "function") {
        return LearningGoals.load();
      }
      return [];
    }

    async function ensureLearningGoalForImport(subjectID, parsed) {
      const subject = findSubjectByID(subjectID);
      if (!subject) return 0;
      const tujuan = String(parsed.learning_goal_text || "").trim();
      const materi = String(parsed.learning_goal_materi || "").trim();
      if (!tujuan || !materi) return 0;
      const kelas =
        String(parsed.learning_goal_kelas || "").trim() ||
        String(subject.education_level || "").trim();
      const semester = Number(parsed.learning_goal_semester || 0) || 0;
      if (semester <= 0) return 0;
      const existing = findLearningGoalByDetails(
        String(subject.name || "").trim(),
        kelas,
        String(semester),
        tujuan,
        materi,
      );
      if (existing && Number(existing.id || 0) > 0) {
        return Number(existing.id || 0);
      }
      const created = await api("/api/v1/learning-goals", "POST", {
        mata_pelajaran: String(subject.name || "").trim(),
        kelas: kelas,
        semester: semester,
        tujuan_pembelajaran: tujuan,
        materi: materi,
      });
      await loadLearningGoals();
      return Number((created && created.id) || 0) || 0;
    }

    async function loadClassesForLearningGoal() {
      if (LearningGoals && typeof LearningGoals.loadClasses === "function") {
        return LearningGoals.loadClasses();
      }
    }

    function fillLearningGoalSubjectSelect() {
      if (
        LearningGoals &&
        typeof LearningGoals.fillSubjectSelect === "function"
      ) {
        return LearningGoals.fillSubjectSelect();
      }
    }

    function initBlueprintsModule() {
      if (!Blueprints || typeof Blueprints.init !== "function") return;
      Blueprints.init({
        api: api,
        beginBusy: beginBusy,
        setMsg: setMsg,
        msg: msg,
        escapeHtml: escapeHtml,
        shortQuestionType: shortQuestionType,
        fmtDate: fmtDate,
        fillSubjectSelect: fillSubjectSelect,
        questionCodeLabel: questionCodeLabel,
        findLearningGoalByID: findLearningGoalByID,
        learningGoalLabel: learningGoalLabel,
        fillLearningGoalSelect: fillLearningGoalSelect,
        fillQuestionCodeSelect: fillQuestionCodeSelect,
        manuscriptQuestionSelect: manuscriptQuestionSelect,
        manuscriptSubjectSelect: manuscriptSubjectSelect,
        manuscriptLearningGoalSelect: manuscriptLearningGoalSelect,
        manuscriptQuestionCodeSelect: manuscriptQuestionCodeSelect,
        blueprintForm: blueprintForm,
        blueprintFilterForm: blueprintFilterForm,
        blueprintRefreshBtn: blueprintRefreshBtn,
        blueprintBody: blueprintBody,
        blueprintSubjectSelect: blueprintSubjectSelect,
        blueprintFilterSubject: blueprintFilterSubject,
        applyManuscriptTypeUI: applyManuscriptTypeUI,
      });
    }

    initBlueprintsModule();

    function initGuruSubjectsModule() {
      if (!GuruSubjects || typeof GuruSubjects.init !== "function") return;
      GuruSubjects.init({
        api: api,
        beginBusy: beginBusy,
        setMsg: setMsg,
        msg: msg,
        text: text,
        escapeHtml: escapeHtml,
        canManageSubjects: canManageSubjects,
        refreshStats: refreshGuruSummaryStats,
        activateGuruMenu: activateGuruMenu,
        statSubjects: statSubjects,
        statLevels: statLevels,
        subjectsPanel: subjectsPanel,
        subjectRefreshBtn: subjectRefreshBtn,
        subjectAddBtn: subjectAddBtn,
        subjectsBody: subjectsBody,
        subjectDialog: subjectDialog,
        subjectDialogForm: subjectDialogForm,
        subjectDialogTitle: subjectDialogTitle,
        subjectLevelSelect: subjectLevelSelect,
        subjectCancelBtn: subjectCancelBtn,
        subjectDeleteDialog: subjectDeleteDialog,
        subjectDeleteForm: subjectDeleteForm,
        subjectDeleteLabel: subjectDeleteLabel,
        subjectDeleteCancelBtn: subjectDeleteCancelBtn,
        onSubjectsUpdated: function () {
          fillSubjectSelect(blueprintSubjectSelect, false);
          fillSubjectSelect(blueprintFilterSubject, true);
          fillSubjectSelect(manuscriptSubjectSelect, false);
          fillSubjectSelect(examSubjectSelect, false);
          fillQuestionCodeSubjectSelect(
            Number(
              (QuestionCodes && QuestionCodes.getSelectedSubjectID
                ? QuestionCodes.getSelectedSubjectID()
                : 0) ||
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
            if (defaultSubject && learningGoalMapelInput) {
              learningGoalMapelInput.value = String(defaultSubject.name || "");
            }
          }
          syncManuscriptSubjectState();
        },
      });
    }

    initGuruSubjectsModule();
    initGuruDashboardModule();
    initGuruManuscriptModule();
    initGuruBlueprintsModule();
    initGuruResultsModule();

    function initLearningGoalsModule() {
      if (!LearningGoals || typeof LearningGoals.init !== "function") return;
      LearningGoals.init({
        api: api,
        apiMultipart: apiMultipart,
        beginBusy: beginBusy,
        setMsg: setMsg,
        msg: msg,
        escapeHtml: escapeHtml,
        extractAPIError: extractAPIError,
        subjectLabel: subjectLabel,
        getSubjectsCache: function () {
          return getSubjectsCache();
        },
        findSubjectByID: findSubjectByID,
        getManuscriptTargetSubjectID: getManuscriptTargetSubjectID,
        refreshStats: refreshGuruSummaryStats,
        activateGuruMenu: activateGuruMenu,
        loadSubjects: loadSubjects,
        manuscriptLearningGoalSelect: manuscriptLearningGoalSelect,
        learningGoalsPanel: learningGoalsPanel,
        learningGoalForm: learningGoalForm,
        learningGoalRefreshBtn: learningGoalRefreshBtn,
        learningGoalSearchInput: learningGoalSearchInput,
        learningGoalPageSizeSelect: learningGoalPageSizeSelect,
        learningGoalPrevBtn: learningGoalPrevBtn,
        learningGoalNextBtn: learningGoalNextBtn,
        learningGoalPageInfo: learningGoalPageInfo,
        learningGoalTemplateBtn: learningGoalTemplateBtn,
        learningGoalImportBtn: learningGoalImportBtn,
        learningGoalImportDialog: learningGoalImportDialog,
        learningGoalImportForm: learningGoalImportForm,
        learningGoalImportFile: learningGoalImportFile,
        learningGoalImportOutput: learningGoalImportOutput,
        learningGoalImportCloseBtn: learningGoalImportCloseBtn,
        learningGoalImportCancelBtn: learningGoalImportCancelBtn,
        learningGoalBody: learningGoalBody,
        learningGoalMapelInput: learningGoalMapelInput,
        learningGoalKelasInput: learningGoalKelasInput,
        learningGoalSubmitBtn: learningGoalSubmitBtn,
        learningGoalCancelEditBtn: learningGoalCancelEditBtn,
        learningGoalViewDialog: learningGoalViewDialog,
        learningGoalViewTitle: learningGoalViewTitle,
        learningGoalViewContent: learningGoalViewContent,
      });
    }

    initLearningGoalsModule();

    function fillExamQuestionCodeSelectByExam(examID) {
      if (
        GuruExams &&
        typeof GuruExams.fillExamQuestionCodeSelectByExam === "function"
      ) {
        return GuruExams.fillExamQuestionCodeSelectByExam(examID);
      }
    }

    function findExamManageByID(examID) {
      if (GuruExams && typeof GuruExams.findExamByID === "function") {
        return GuruExams.findExamByID(examID);
      }
      return null;
    }

    async function loadExamQuestionCodeRules(examID) {
      if (
        GuruExams &&
        typeof GuruExams.loadExamQuestionCodeRules === "function"
      ) {
        return GuruExams.loadExamQuestionCodeRules(examID);
      }
      return [];
    }

    async function loadGuruExamSubjectOptions() {
      if (GuruExams && typeof GuruExams.loadExamSubjectOptions === "function") {
        return GuruExams.loadExamSubjectOptions();
      }
    }

    async function loadGuruExamManageTable() {
      if (GuruExams && typeof GuruExams.loadExamManageTable === "function") {
        return GuruExams.loadExamManageTable();
      }
    }

    async function loadGuruExamQuestions(examID) {
      if (GuruExams && typeof GuruExams.loadExamQuestions === "function") {
        return GuruExams.loadExamQuestions(examID);
      }
    }

    async function loadGuruExamAssignments(examID) {
      if (GuruExams && typeof GuruExams.loadExamAssignments === "function") {
        return GuruExams.loadExamAssignments(examID);
      }
    }

    function initGuruExamsModule() {
      if (!GuruExams || typeof GuruExams.init !== "function") return;
      GuruExams.init({
        api: api,
        beginBusy: beginBusy,
        setMsg: setMsg,
        msg: msg,
        escapeHtml: escapeHtml,
        text: text,
        fmtDate: fmtDate,
        shortQuestionType: shortQuestionType,
        cleanStemPreview: cleanStemPreview,
        questionCodeLabel: questionCodeLabel,
        fillQuestionCodeSelect: fillQuestionCodeSelect,
        refreshStats: refreshGuruSummaryStats,
        activateGuruMenu: activateGuruMenu,
        examsPanel: examsPanel,
        examsRefreshBtn: examsRefreshBtn,
        examForm: examForm,
        examRandomizeQuestionsInput: examRandomizeQuestionsInput,
        examRandomizeOptionsInput: examRandomizeOptionsInput,
        examSubjectSelect: examSubjectSelect,
        examsBody: examsBody,
        examQuestionForm: examQuestionForm,
        questionExamIDInput: questionExamIDInput,
        examQuestionsLoadBtn: examQuestionsLoadBtn,
        examQuestionsBody: examQuestionsBody,
        examQuestionCodeRuleForm: examQuestionCodeRuleForm,
        examQuestionCodeRuleExamIDInput: examQuestionCodeRuleExamIDInput,
        examQuestionCodeSelect: examQuestionCodeSelect,
        examQuestionCodeRuleBody: examQuestionCodeRuleBody,
        examQuestionCodeSyncBtn: examQuestionCodeSyncBtn,
        examQuestionPickForm: examQuestionPickForm,
        questionPickExamIDInput: questionPickExamIDInput,
        examQuestionPickCodeSelect: examQuestionPickCodeSelect,
        examQuestionPickLoadBtn: examQuestionPickLoadBtn,
        examQuestionPickToggleBtn: examQuestionPickToggleBtn,
        examQuestionPickAddBtn: examQuestionPickAddBtn,
        examQuestionPickBody: examQuestionPickBody,
        examQuestionsPreviewDialog: examQuestionsPreviewDialog,
        examQuestionsPreviewTitle: examQuestionsPreviewTitle,
        examQuestionsPreviewBody: examQuestionsPreviewBody,
        examQuestionsPreviewLimit: examQuestionsPreviewLimit,
        examQuestionsPreviewPrev: examQuestionsPreviewPrev,
        examQuestionsPreviewNext: examQuestionsPreviewNext,
        examQuestionsPreviewPage: examQuestionsPreviewPage,
        onExamsLoaded: function (exams) {
          if (GuruResults && typeof GuruResults.setExams === "function") {
            GuruResults.setExams(exams);
          }
        },
        onExamSelected: function (examID) {
          if (GuruResults && typeof GuruResults.selectExam === "function") {
            GuruResults.selectExam(examID, true);
          }
        },
        getResultsCount: function () {
          if (
            GuruResults &&
            typeof GuruResults.getResultsCount === "function"
          ) {
            return GuruResults.getResultsCount();
          }
          return 0;
        },
      });
    }

    initGuruExamsModule();

    function initQuestionCodesModule() {
      if (!QuestionCodes || typeof QuestionCodes.init !== "function") return;
      QuestionCodes.init({
        api: api,
        beginBusy: beginBusy,
        setMsg: setMsg,
        msg: msg,
        escapeHtml: escapeHtml,
        subjectLabel: subjectLabel,
        getSubjectsCache: function () {
          return getSubjectsCache();
        },
        getManuscriptTargetSubjectID: getManuscriptTargetSubjectID,
        manuscriptQuestionCodeSelect: manuscriptQuestionCodeSelect,
        fillExamQuestionCodeSelectByExam: fillExamQuestionCodeSelectByExam,
        examQuestionCodeRuleExamIDInput: examQuestionCodeRuleExamIDInput,
        questionExamIDInput: questionExamIDInput,
        loadBlueprints: loadBlueprints,
        blueprintFilterSubjectSelect: blueprintFilterSubject,
      });
    }

    initQuestionCodesModule();

    function initManuscriptImportModule() {
      if (!ManuscriptImport || typeof ManuscriptImport.init !== "function") {
        return;
      }
      ManuscriptImport.init({
        api: api,
        beginBusy: beginBusy,
        setMsg: setMsg,
        msg: msg,
        fillSubjectSelect: fillSubjectSelect,
        loadQuestionCodes: loadQuestionCodes,
        parseImportContent: parseImportContent,
        parseImportQuestionRow: parseImportQuestionRow,
        parseImportQuestionBlock: parseImportQuestionBlock,
        resolveImportSubjectID: resolveImportSubjectID,
        ensureQuestionCodeForImport: ensureQuestionCodeForImport,
        resolveDefaultLearningGoalID: resolveDefaultLearningGoalID,
        resolveLearningGoalIDByCode: resolveLearningGoalIDByCode,
        ensureLearningGoalForImport: ensureLearningGoalForImport,
        findSubjectByID: findSubjectByID,
        escapeHtml: escapeHtml,
        loadBlueprints: loadBlueprints,
        renderManuscripts: renderManuscripts,
        activateGuruMenu: activateGuruMenu,
      });
    }

    initManuscriptImportModule();
    initManuscriptTransferExportModule();

    function initManuscriptTransferExportModule() {
      function updateTransferSummary() {
        if (!manuscriptTransferSummary) return;
        const selectedCount =
          ManuscriptTable &&
          typeof ManuscriptTable.getSelectedItems === "function"
            ? ManuscriptTable.getSelectedItems().length
            : 0;
        const totalCount =
          ManuscriptTable && typeof ManuscriptTable.getAllItems === "function"
            ? ManuscriptTable.getAllItems().length
            : 0;
        const sourceMode = String(
          (manuscriptTransferSourceInput &&
            manuscriptTransferSourceInput.value) ||
            "selected",
        );
        if (sourceMode === "selected") {
          manuscriptTransferSummary.textContent =
            String(selectedCount) +
            " naskah terpilih siap ditransfer dari total " +
            String(totalCount) +
            ".";
          return;
        }
        manuscriptTransferSummary.textContent =
          String(totalCount) + " naskah pada tabel aktif siap ditransfer.";
      }

      async function loadTransferGuruOptions() {
        if (!manuscriptTransferUserInput) return;
        const role = String((user && user.role) || "").toLowerCase();
        manuscriptTransferUserInput.innerHTML =
          '<option value="">Pilih guru...</option>';
        if (role !== "admin" && role !== "proktor") {
          const opt = document.createElement("option");
          opt.value = String((user && user.id) || "");
          opt.textContent = String((user && user.full_name) || "Guru");
          manuscriptTransferUserInput.appendChild(opt);
          manuscriptTransferUserInput.value = opt.value;
          manuscriptTransferUserInput.disabled = true;
          return;
        }
        manuscriptTransferUserInput.disabled = false;
        const out = await api(
          "/api/v1/admin/users?role=guru&limit=500&offset=0",
          "GET",
        );
        const rows = Array.isArray(out && out.items) ? out.items : [];
        rows.forEach(function (it) {
          const id = Number((it && it.id) || 0);
          if (id <= 0) return;
          const name = String((it && it.full_name) || "").trim();
          const username = String((it && it.username) || "").trim();
          const label =
            String(id) +
            " | " +
            (name || username || "Guru") +
            (username ? " (@" + username + ")" : "");
          const opt = document.createElement("option");
          opt.value = String(id);
          opt.textContent = label;
          manuscriptTransferUserInput.appendChild(opt);
        });
      }

      async function loadTransferSubjectOptions() {
        if (!manuscriptTransferSubjectInput) return;
        if (!Array.isArray(subjects) || subjects.length === 0) {
          await loadSubjects();
        }
        const current = String(
          (manuscriptTransferSubjectInput &&
            manuscriptTransferSubjectInput.value) ||
            "",
        );
        manuscriptTransferSubjectInput.innerHTML =
          '<option value="">Pilih mapel...</option>';
        const list = Array.isArray(subjects) ? subjects : [];
        list.forEach(function (it) {
          const id = Number((it && it.id) || 0);
          if (id <= 0) return;
          const opt = document.createElement("option");
          opt.value = String(id);
          opt.textContent = subjectLabel(it) + " [ID " + String(id) + "]";
          manuscriptTransferSubjectInput.appendChild(opt);
        });
        if (current) manuscriptTransferSubjectInput.value = current;
      }

      if (manuscriptExportBtn) {
        manuscriptExportBtn.addEventListener("click", async function () {
          const items = collectManuscriptItems(true);
          if (!items.length) {
            setManuscriptMsg("Tidak ada naskah yang bisa diekspor.");
            return;
          }
          const done = beginBusy(
            manuscriptExportBtn,
            msg,
            "Menyiapkan export naskah...",
          );
          try {
            await downloadCSV(
              "/api/v1/questions/export",
              { items: items },
              "naskah_soal.csv",
            );
            setManuscriptMsg("Export naskah berhasil dibuat.");
          } catch (err) {
            setManuscriptMsg("Export naskah gagal: " + err.message);
          } finally {
            done();
          }
        });
      }

      if (manuscriptTransferBtn) {
        manuscriptTransferBtn.addEventListener("click", async function () {
          if (manuscriptTransferForm) manuscriptTransferForm.reset();
          if (manuscriptTransferOutput)
            manuscriptTransferOutput.textContent = "";
          const selectedCount =
            ManuscriptTable &&
            typeof ManuscriptTable.getSelectedItems === "function"
              ? ManuscriptTable.getSelectedItems().length
              : 0;
          if (manuscriptTransferSourceInput) {
            manuscriptTransferSourceInput.value =
              selectedCount > 0 ? "selected" : "filtered";
          }
          updateTransferSummary();
          try {
            await loadTransferGuruOptions();
            await loadTransferSubjectOptions();
          } catch (err) {
            setManuscriptMsg("Gagal memuat opsi transfer: " + err.message);
          }
          if (
            manuscriptTransferSubjectInput &&
            manuscriptSubjectSelect &&
            manuscriptSubjectSelect.value
          ) {
            manuscriptTransferSubjectInput.value =
              manuscriptSubjectSelect.value;
          }
          if (
            manuscriptTransferDialog &&
            typeof manuscriptTransferDialog.showModal === "function"
          ) {
            manuscriptTransferDialog.showModal();
          }
        });
      }

      if (manuscriptTransferCancelBtn) {
        manuscriptTransferCancelBtn.addEventListener("click", function () {
          if (
            manuscriptTransferDialog &&
            typeof manuscriptTransferDialog.close === "function"
          ) {
            manuscriptTransferDialog.close();
          }
        });
      }

      if (manuscriptTransferForm) {
        if (manuscriptTransferSourceInput) {
          manuscriptTransferSourceInput.addEventListener("change", function () {
            updateTransferSummary();
          });
        }
        manuscriptTransferForm.addEventListener("submit", async function (e) {
          e.preventDefault();
          const targetUserID = Number(
            (manuscriptTransferUserInput &&
              manuscriptTransferUserInput.value) ||
              0,
          );
          const targetSubjectID = Number(
            (manuscriptTransferSubjectInput &&
              manuscriptTransferSubjectInput.value) ||
              0,
          );
          if (targetUserID <= 0 || targetSubjectID <= 0) {
            setManuscriptMsg("Target guru dan mapel wajib diisi.");
            return;
          }
          const sourceMode = String(
            (manuscriptTransferSourceInput &&
              manuscriptTransferSourceInput.value) ||
              "selected",
          );
          const useSelected = sourceMode === "selected";
          const items = collectManuscriptItems(useSelected);
          if (!items.length) {
            if (useSelected) {
              setManuscriptMsg(
                "Belum ada naskah terpilih. Pilih baris dulu atau ubah sumber ke semua naskah tabel aktif.",
              );
            } else {
              setManuscriptMsg("Tidak ada naskah pada tabel aktif.");
            }
            return;
          }
          const done = beginBusy(
            manuscriptTransferForm,
            msg,
            "Mentransfer naskah...",
          );
          try {
            const report = await api("/api/v1/questions/transfer", "POST", {
              items: items,
              target_user_id: targetUserID,
              target_subject_id: targetSubjectID,
            });
            if (manuscriptTransferOutput) {
              manuscriptTransferOutput.textContent = JSON.stringify(
                report || {},
                null,
                2,
              );
            }
            await reloadManuscriptsByCurrentTableScope();
            setManuscriptMsg("Transfer naskah selesai.");
            if (
              manuscriptTransferDialog &&
              typeof manuscriptTransferDialog.close === "function"
            ) {
              manuscriptTransferDialog.close();
            }
          } catch (err) {
            setManuscriptMsg("Transfer naskah gagal: " + err.message);
          } finally {
            done();
          }
        });
      }
    }

    async function ensureQuestionCodeForImport(subjectID, codeRaw, nameRaw) {
      const code = String(codeRaw || "").trim();
      const name = String(nameRaw || "").trim();
      if (!code && !name) return null;
      if (!code) {
        throw new Error("Kode Soal wajib diisi jika Nama Kode tersedia.");
      }
      const codeNorm = code.toLowerCase();
      const existing = getQuestionCodesCache().find(function (it) {
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
        if (QuestionCodes && typeof QuestionCodes.addToCache === "function") {
          QuestionCodes.addToCache(created);
        }
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

    const QUESTION_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

    function fileToDataURL(file) {
      return new Promise(function (resolve, reject) {
        const reader = new FileReader();
        reader.onload = function () {
          const base64 = String(reader.result || "");
          if (!base64) {
            reject(new Error("gambar tidak valid"));
            return;
          }
          resolve(base64);
        };
        reader.onerror = function () {
          reject(new Error("gagal membaca gambar"));
        };
        reader.readAsDataURL(file);
      });
    }

    async function uploadQuestionImageFile(file) {
      if (!file) throw new Error("file gambar tidak ditemukan");
      if (file.size > QUESTION_IMAGE_MAX_BYTES) {
        throw new Error("ukuran gambar maksimal 2MB");
      }
      const form = new FormData();
      form.append("file", file);
      return await apiMultipart("/api/v1/media/question-images", "POST", form);
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
                  input.onchange = async function () {
                    const file = input.files && input.files[0];
                    if (!file) return;
                    const range = this.quill.getSelection(true);
                    const index = range ? range.index : this.quill.getLength();
                    try {
                      const uploaded = await uploadQuestionImageFile(file);
                      const imageURL = String(
                        (uploaded && uploaded.url) || "",
                      ).trim();
                      if (!imageURL) {
                        throw new Error("URL gambar tidak tersedia");
                      }
                      this.quill.insertEmbed(index, "image", imageURL, "user");
                      this.quill.setSelection(index + 1, 0, "silent");
                    } catch (err) {
                      const msg = String(
                        (err && err.message) || "gagal upload gambar",
                      ).trim();
                      if (/maksimal 2mb/i.test(msg)) {
                        window.alert(msg);
                        return;
                      }
                      try {
                        const base64 = await fileToDataURL(file);
                        this.quill.insertEmbed(index, "image", base64, "user");
                        this.quill.setSelection(index + 1, 0, "silent");
                        window.alert(
                          "Upload ke server gagal, gambar disimpan sebagai base64 sementara.",
                        );
                      } catch (_) {
                        window.alert("Gagal memproses gambar.");
                      }
                    }
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

    initManuscriptTableModule();

    function buildGuruCountDesc(base, noun, total) {
      if (total <= 0) return base + " Anda belum membuat " + noun + ".";
      return base + " Saat ini ada " + String(total) + " " + String(noun) + ".";
    }

    function getGuruMenuInfo(menuKey) {
      const key = String(menuKey || "").trim();
      const buildSubjectsDesc = function () {
        const total = Number(getSubjectsCache().length || 0);
        return buildGuruCountDesc(
          "Kelola daftar mapel yang tersedia.",
          "mapel",
          total,
        );
      };
      const buildLearningGoalsDesc = function () {
        const total = Number(
          LearningGoals && typeof LearningGoals.getCount === "function"
            ? LearningGoals.getCount()
            : 0,
        );
        return buildGuruCountDesc(
          "Kelola tujuan pembelajaran per mapel dan jenjang.",
          "tujuan pembelajaran",
          total,
        );
      };
      const buildManuscriptsDesc = function () {
        const total = Number(
          ManuscriptTable && typeof ManuscriptTable.getCount === "function"
            ? ManuscriptTable.getCount()
            : 0,
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
          GuruExams && typeof GuruExams.getExamCount === "function"
            ? GuruExams.getExamCount()
            : 0,
        );
        return buildGuruCountDesc(
          "Kelola paket ujian dan jadwal pelaksanaan.",
          "ujian",
          total,
        );
      };
      const buildResultsDesc = function () {
        const total = Number(
          GuruResults && typeof GuruResults.getResultsCount === "function"
            ? GuruResults.getResultsCount()
            : GuruExams && typeof GuruExams.getResultsCount === "function"
              ? GuruExams.getResultsCount()
              : 0,
        );
        if (total <= 0) {
          return "Lihat hasil dan performa peserta. Belum ada peserta ujian yang dimuat.";
        }
        return (
          "Lihat hasil dan performa peserta. Saat ini ada " +
          String(total) +
          " peserta terdaftar pada ujian terpilih."
        );
      };
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
        guide: {
          title: "Petunjuk Penggunaan",
          desc: "Panduan singkat penggunaan menu guru.",
        },
      };
      return guruTitles[key] || guruTitles.dashboard;
    }

    function initGuruDashboardModule() {
      if (!GuruDashboard || typeof GuruDashboard.init !== "function") return;
      GuruDashboard.init({
        menuButtons: menuButtons,
        jumpButtons: menuJumpButtons,
        pageTitleEl: guruPageTitle,
        pageDescEl: guruPageDesc,
        panels: {
          dashboard: dashboardPanel,
          reviews: reviewsPanel,
          "learning-goals": learningGoalsPanel,
          blueprints: blueprintsPanel,
          manuscripts: manuscriptsPanel,
          exams: examsPanel,
          results: resultsPanel,
          subjects: subjectsPanel,
          guide: guidePanel,
        },
        getMenuInfo: getGuruMenuInfo,
        onMenuActivated: async function (key) {
          if (key !== "exams") return;
          try {
            await Promise.all([
              loadGuruExamManageTable(),
              loadGuruExamSubjectOptions(),
            ]);
          } catch (_) {
            // error already surfaced by the module
          }
        },
      });
    }

    function activateGuruMenu(menu) {
      if (GuruDashboard && typeof GuruDashboard.activateMenu === "function") {
        return GuruDashboard.activateMenu(menu);
      }
      return "dashboard";
    }

    function initGuruManuscriptModule() {
      if (!GuruManuscript || typeof GuruManuscript.init !== "function") return;
      GuruManuscript.init({
        api: api,
        beginBusy: beginBusy,
        setMsg: setMsg,
        msg: msg,
        text: text,
        escapeHtml: escapeHtml,
        createQuillEditor: createQuillEditor,
        getQuillHTML: getQuillHTML,
        getCurrentManuscriptQuestionType: getCurrentManuscriptQuestionType,
        syncManuscriptSubjectState: syncManuscriptSubjectState,
        fillLearningGoalSelect: fillLearningGoalSelect,
        fillQuestionCodeSelect: fillQuestionCodeSelect,
        ensureQuestionForManuscriptSubmission:
          ensureQuestionForManuscriptSubmission,
        findQuestionByID: findQuestionByID,
        loadBlueprints: loadBlueprints,
        fillBlueprintSelect: fillBlueprintSelect,
        loadAllManuscriptVersionsFromBlueprints:
          loadAllManuscriptVersionsFromBlueprints,
        reloadManuscriptsByCurrentTableScope:
          reloadManuscriptsByCurrentTableScope,
        renderManuscripts: renderManuscripts,
        manuscriptForm: manuscriptForm,
        manuscriptQuestionSelect: manuscriptQuestionSelect,
        manuscriptQuestionCodeSelect: manuscriptQuestionCodeSelect,
        manuscriptSubjectSelect: manuscriptSubjectSelect,
        manuscriptLearningGoalSelect: manuscriptLearningGoalSelect,
        manuscriptQuestionTypeUI: manuscriptQuestionTypeUI,
        manuscriptStimulusEditor: manuscriptStimulusEditor,
        manuscriptStemEditor: manuscriptStemEditor,
        manuscriptExplanationEditor: manuscriptExplanationEditor,
        manuscriptHintEditor: manuscriptHintEditor,
        manuscriptStimulusHTMLInput: manuscriptStimulusHTMLInput,
        manuscriptStemHTMLInput: manuscriptStemHTMLInput,
        manuscriptExplanationHTMLInput: manuscriptExplanationHTMLInput,
        manuscriptHintHTMLInput: manuscriptHintHTMLInput,
        manuscriptOptionsPanel: manuscriptOptionsPanel,
        manuscriptOptionsWrap: manuscriptOptionsWrap,
        manuscriptAddOptionBtn: manuscriptAddOptionBtn,
        manuscriptKeyMC: manuscriptKeyMC,
        manuscriptKeyMR: manuscriptKeyMR,
        manuscriptKeyMCOptions: manuscriptKeyMCOptions,
        manuscriptKeyMROptions: manuscriptKeyMROptions,
        manuscriptKeyTF: manuscriptKeyTF,
        manuscriptStatementsWrap: manuscriptStatementsWrap,
        manuscriptAddStatementBtn: manuscriptAddStatementBtn,
        manuscriptAnswerKeyRaw: manuscriptAnswerKeyRaw,
        manuscriptEditingVersionNoInput: manuscriptEditingVersionNoInput,
        manuscriptSubmitBtn: manuscriptSubmitBtn,
        manuscriptCancelEditBtn: manuscriptCancelEditBtn,
        manuscriptPreviewDialog: manuscriptPreviewDialog,
        manuscriptPreviewTitle: manuscriptPreviewTitle,
        manuscriptPreviewContent: manuscriptPreviewContent,
        manuscriptRefreshBtn: manuscriptRefreshBtn,
      });
    }

    function initGuruResultsModule() {
      if (!GuruResults || typeof GuruResults.init !== "function") return;
      GuruResults.init({
        api: api,
        beginBusy: beginBusy,
        setMsg: setMsg,
        msg: msg,
        text: text,
        escapeHtml: escapeHtml,
        fmtDate: fmtDate,
        refreshStats: refreshGuruSummaryStats,
        activateGuruMenu: activateGuruMenu,
        resultsPanel: resultsPanel,
        resultsRefreshBtn: resultsRefreshBtn,
        resultsAssignmentForm: resultsAssignmentForm,
        resultsExamSelect: resultsExamSelect,
        resultsAssignmentBody: resultsAssignmentBody,
        resultsMatrixHead: resultsMatrixHead,
        resultsSummary: resultsSummary,
        resultsExtra: resultsExtra,
        resultsReportBtn: resultsReportBtn,
        resultsStatsBtn: resultsStatsBtn,
        resultsChartBtn: resultsChartBtn,
        resultsExportBtn: resultsExportBtn,
        refreshExams: loadGuruExamManageTable,
      });
    }

    function syncManuscriptHiddenInputs() {
      if (
        GuruManuscript &&
        typeof GuruManuscript.syncHiddenInputs === "function"
      ) {
        GuruManuscript.syncHiddenInputs();
      }
    }

    function resetManuscriptEditors() {
      if (GuruManuscript && typeof GuruManuscript.resetEditors === "function") {
        GuruManuscript.resetEditors();
      }
    }

    function applyManuscriptTypeUI(fromBlueprint) {
      if (GuruManuscript && typeof GuruManuscript.applyTypeUI === "function") {
        GuruManuscript.applyTypeUI(fromBlueprint);
      }
    }

    function clearManuscriptEditMode() {
      if (
        GuruManuscript &&
        typeof GuruManuscript.clearEditMode === "function"
      ) {
        GuruManuscript.clearEditMode();
      }
    }

    function beginManuscriptEdit(item) {
      if (GuruManuscript && typeof GuruManuscript.beginEdit === "function") {
        return GuruManuscript.beginEdit(item);
      }
    }

    function previewManuscriptVersion(item) {
      if (
        GuruManuscript &&
        typeof GuruManuscript.previewVersion === "function"
      ) {
        return GuruManuscript.previewVersion(item);
      }
    }

    function subjectLabel(it) {
      if (GuruSubjects && typeof GuruSubjects.label === "function") {
        return GuruSubjects.label(it);
      }
      return "-";
    }

    function fillSubjectSelect(selectEl, withAllOption) {
      if (GuruSubjects && typeof GuruSubjects.fillSelect === "function") {
        GuruSubjects.fillSelect(selectEl, withAllOption);
      }
    }

    function findSubjectByID(subjectID) {
      if (GuruSubjects && typeof GuruSubjects.findByID === "function") {
        return GuruSubjects.findByID(subjectID);
      }
      return null;
    }

    function initManuscriptTableModule() {
      if (!ManuscriptTable || typeof ManuscriptTable.init !== "function") {
        return;
      }
      ManuscriptTable.init({
        api: api,
        beginBusy: beginBusy,
        setManuscriptMsg: setManuscriptMsg,
        msg: msg,
        escapeHtml: escapeHtml,
        resolveQuestionCode: resolveManuscriptQuestionCode,
        resolveLearningGoal: resolveManuscriptLearningGoal,
        resolveQuestionType: resolveManuscriptQuestionType,
        previewText: previewText,
        shortQuestionType: shortQuestionType,
        fmtDate: fmtDate,
        previewManuscriptVersion: previewManuscriptVersion,
        beginManuscriptEdit: beginManuscriptEdit,
        onDeletedEditingVersion: function (questionID, versionNo) {
          if (
            GuruManuscript &&
            typeof GuruManuscript.onDeletedEditingVersion === "function"
          ) {
            GuruManuscript.onDeletedEditingVersion(questionID, versionNo);
          }
        },
        questionSelect: manuscriptQuestionSelect,
        panel: manuscriptsPanel,
        refreshStats: refreshGuruSummaryStats,
        activateMenu: activateGuruMenu,
        pageInfo: manuscriptPageInfo,
        prevBtn: manuscriptPrevBtn,
        nextBtn: manuscriptNextBtn,
        pageSizeSelect: manuscriptPageSizeSelect,
        selectAll: manuscriptSelectAll,
        bulkDeleteBtn: manuscriptBulkDeleteBtn,
        deleteAllBtn: manuscriptDeleteAllBtn,
        body: manuscriptBody,
        initialPageSize: Number(
          (manuscriptPageSizeSelect && manuscriptPageSizeSelect.value) || 15,
        ),
      });
    }

    function collectManuscriptItems(useSelected) {
      if (!ManuscriptTable) return [];
      if (
        useSelected &&
        typeof ManuscriptTable.getSelectedItems === "function"
      ) {
        const selected = ManuscriptTable.getSelectedItems();
        if (selected.length) return selected;
      }
      if (typeof ManuscriptTable.getAllItems === "function") {
        return ManuscriptTable.getAllItems();
      }
      return [];
    }

    function renderManuscripts(items) {
      if (ManuscriptTable && typeof ManuscriptTable.render === "function") {
        ManuscriptTable.render(items);
        return;
      }
    }

    async function reloadManuscriptsByCurrentTableScope(fallbackQuestionID) {
      if (
        ManuscriptTable &&
        typeof ManuscriptTable.reloadByCurrentScope === "function"
      ) {
        return ManuscriptTable.reloadByCurrentScope(fallbackQuestionID);
      }
    }

    async function loadEducationLevelsForGuruSubjectForm() {
      if (
        GuruSubjects &&
        typeof GuruSubjects.loadEducationLevels === "function"
      ) {
        return GuruSubjects.loadEducationLevels();
      }
      return [];
    }

    function fillSubjectEducationLevelSelect(selectedValue) {
      if (
        GuruSubjects &&
        typeof GuruSubjects.fillEducationLevelSelect === "function"
      ) {
        GuruSubjects.fillEducationLevelSelect(selectedValue);
      }
    }

    async function loadSubjects() {
      if (GuruSubjects && typeof GuruSubjects.loadSubjects === "function") {
        return GuruSubjects.loadSubjects();
      }
      return [];
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
          (QuestionCodes && QuestionCodes.getSelectedSubjectID
            ? QuestionCodes.getSelectedSubjectID()
            : 0) || 0,
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
      if (
        GuruManuscript &&
        typeof GuruManuscript.ensureEditors === "function"
      ) {
        GuruManuscript.ensureEditors();
      }
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
    const reviewCreateForm = document.getElementById("review-create-form");
    const reviewListForm = document.getElementById("review-list-form");
    const decisionForm = document.getElementById("review-decision-form");
    const decisionStatus = document.getElementById("review-decision-status");
    const decisionNoteInput = document.getElementById("review-note-input");
    const reviewHistoryForm = document.getElementById("review-history-form");

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

    if (AuthoringReviews && typeof AuthoringReviews.init === "function") {
      AuthoringReviews.init({
        api: api,
        beginBusy: beginBusy,
        setMsg: setMsg,
        message: message,
        pretty: pretty,
        escapeHtml: escapeHtml,
        reviewOut: reviewOut,
        reviewTaskList: reviewTaskList,
        reviewCreateForm: reviewCreateForm,
        reviewListForm: reviewListForm,
        decisionForm: decisionForm,
        decisionStatus: decisionStatus,
        decisionNoteInput: decisionNoteInput,
        reviewHistoryForm: reviewHistoryForm,
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
