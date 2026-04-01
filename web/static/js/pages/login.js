(function () {
  const core = window.AppCore || {};
  const api = core.api;
  const meOrNull = core.meOrNull;
  const text = core.text;
  const beginBusy = core.beginBusy;

  function normalizeCredential(input) {
    return String(input || "")
      .normalize("NFKC")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/\u00A0/g, " ")
      .trim();
  }

  function rawPassword(input) {
    return String(input || "");
  }

  async function initLoginPage() {
    const root = document.querySelector(".login-shell");
    if (!root) return;
    const loginVariant = String(root.dataset.loginVariant || "regular").trim();
    const isNonRegularPage = loginVariant === "non_regular";
    const signinForm = document.getElementById("login-form");
    const signupForm = document.getElementById("signup-form");
    const msg = document.getElementById("login-message");
    const passwordInput = document.getElementById("login-password");
    const togglePasswordBtn = document.getElementById("toggle-login-password");
    const signinTabBtn = document.getElementById("login-tab-signin");
    const signupTabBtn = document.getElementById("login-tab-signup");
    const signinPanel = document.getElementById("login-signin-panel");
    const signupPanel = document.getElementById("login-signup-panel");
    const showSignupBtn = document.getElementById("login-show-signup-btn");
    const signupBackToLoginBtn = document.getElementById(
      "signup-back-to-login-btn",
    );
    const signupBackToRequestBtn = document.getElementById(
      "signup-back-to-request-btn",
    );
    const loginSubHeader = document.getElementById("login-sub-header");
    const signupGoogleTokenInput = document.getElementById(
      "signup-google-token",
    );
    const signupStepRequest = document.getElementById("signup-step-request");
    const signupStepProfile = document.getElementById("signup-step-profile");
    const signupGoogleBtn = document.getElementById("signup-google-btn");
    const signupSchoolInput = document.getElementById("signup-school-name");
    const signupNpsnInput = document.getElementById("signup-npsn");
    const signupJenjangInput = document.getElementById("signup-jenjang");
    const signupStatusSekolahInput = document.getElementById(
      "signup-status-sekolah",
    );
    const signupKabupatenInput = document.getElementById("signup-kabupaten");
    const signupProvinsiInput = document.getElementById("signup-provinsi");
    const signupKecamatanInput = document.getElementById("signup-kecamatan");
    const signupAlamatInput = document.getElementById("signup-alamat");
    const signupSchoolEmailInput = document.getElementById(
      "signup-school-email",
    );
    const signupClassNameInput = document.getElementById("signup-class-name");
    const signupSchoolSuggest = document.getElementById(
      "signup-school-suggest",
    );
    const signupSchoolSuggestList = document.getElementById(
      "signup-school-suggest-list",
    );
    const signupSchoolSuggestEmpty = document.getElementById(
      "signup-school-suggest-empty",
    );
    const signupSchoolSuggestStatus = document.getElementById(
      "signup-school-suggest-status",
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
      if (role === "siswa") return "/peserta";
      return "/ujian";
    }

    function activateLoginTab(tab) {
      const showSignup = isNonRegularPage ? true : tab === "signup";
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
          ? "Gunakan Google untuk login atau mendaftar non-reguler."
          : "Masukkan username/email dan password untuk login.",
      );
      if (loginSubHeader) {
        loginSubHeader.textContent = showSignup
          ? "Gunakan akun Google untuk masuk atau mendaftar."
          : "Masuk dengan username/email dan password.";
      }
      if (showSignup) resetSignupSteps();
    }

    function activateSignupStep(step) {
      if (signupStepRequest) signupStepRequest.hidden = step !== "request";
      if (signupStepProfile) signupStepProfile.hidden = step !== "profile";
      if (loginSubHeader && showSignupPanel()) {
        loginSubHeader.textContent =
          step === "profile"
            ? "Lengkapi data siswa non-reguler."
            : "Gunakan Google untuk mendaftar non-reguler.";
      }
    }

    function resetSignupSteps() {
      activateSignupStep("request");
      if (signupGoogleTokenInput) signupGoogleTokenInput.value = "";
      syncSignupClassOptions();
    }

    function showSignupPanel() {
      return Boolean(signupPanel && !signupPanel.hidden);
    }

    function showSchoolSuggest(items, query) {
      if (!signupSchoolSuggest || !signupSchoolSuggestList) return;
      signupSchoolSuggestList.innerHTML = "";
      if (signupSchoolSuggestStatus) signupSchoolSuggestStatus.hidden = true;
      if (!items || items.length === 0) {
        if (signupSchoolSuggestEmpty) {
          signupSchoolSuggestEmpty.textContent = query
            ? 'Sekolah tidak ditemukan untuk "' + query + '".'
            : "Sekolah tidak ditemukan.";
          signupSchoolSuggestEmpty.hidden = false;
        }
      } else if (signupSchoolSuggestEmpty) {
        signupSchoolSuggestEmpty.hidden = true;
      }

      (items || []).forEach(function (item) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "login-suggest-item";
        const title = document.createElement("div");
        title.className = "login-suggest-title";
        title.textContent = item.nama || "-";
        const meta = document.createElement("div");
        meta.className = "login-suggest-meta";
        const parts = [];
        if (item.kota_kab) parts.push(item.kota_kab);
        if (item.provinsi) parts.push(item.provinsi);
        if (item.npsn) parts.push("NPSN " + item.npsn);
        meta.textContent = parts.join(" • ");
        btn.appendChild(title);
        btn.appendChild(meta);
        btn.addEventListener("mousedown", function (e) {
          e.preventDefault();
          if (signupSchoolInput && item.nama)
            signupSchoolInput.value = item.nama;
          if (signupNpsnInput && item.npsn) signupNpsnInput.value = item.npsn;
          if (signupKabupatenInput && item.kota_kab)
            signupKabupatenInput.value = item.kota_kab;
          if (signupProvinsiInput && item.provinsi)
            signupProvinsiInput.value = item.provinsi;
          if (signupKecamatanInput && item.kecamatan)
            signupKecamatanInput.value = item.kecamatan;
          if (signupJenjangInput) {
            const jenjang = item.nama_jenjang || "";
            signupJenjangInput.value = jenjang;
            syncSignupClassOptions();
          }
          hideSchoolSuggest();
          if (item.npsn) {
            fetchSchoolDetail(item.npsn);
          }
        });
        signupSchoolSuggestList.appendChild(btn);
      });
      signupSchoolSuggest.hidden = false;
    }

    function hideSchoolSuggest() {
      if (!signupSchoolSuggest || !signupSchoolSuggestList) return;
      signupSchoolSuggest.hidden = true;
      signupSchoolSuggestList.innerHTML = "";
      if (signupSchoolSuggestEmpty) signupSchoolSuggestEmpty.hidden = true;
      if (signupSchoolSuggestStatus) signupSchoolSuggestStatus.hidden = true;
    }

    function setSchoolSuggestStatus(message) {
      if (!signupSchoolSuggestStatus || !signupSchoolSuggest) return;
      signupSchoolSuggestStatus.textContent = message;
      signupSchoolSuggestStatus.hidden = false;
      signupSchoolSuggest.hidden = false;
    }

    let schoolSuggestTimer = null;
    let schoolSuggestAbort = null;
    let lastSchoolQuery = "";
    let schoolDetailAbort = null;
    let lastDetailNpsn = "";
    const schoolSearchCache = new Map();
    const schoolDetailCache = new Map();
    const schoolCacheTTL = 10 * 60 * 1000;
    const signupClassOptions = {
      sd: ["Kelas 4", "Kelas 5", "Kelas 6"],
      smp: ["Kelas 7", "Kelas 8", "Kelas 9"],
      sma: ["Kelas 10", "Kelas 11", "Kelas 12"],
    };

    function normalizeSchoolStage(value) {
      const raw = String(value || "").trim().toUpperCase();
      if (!raw) return "";
      if (
        raw.includes("SD") ||
        raw.includes("SEKOLAH DASAR") ||
        raw.includes("MI") ||
        raw.includes("MADRASAH IBTIDAIYAH")
      ) {
        return "sd";
      }
      if (
        raw.includes("SMP") ||
        raw.includes("SEKOLAH MENENGAH PERTAMA") ||
        raw.includes("MTS") ||
        raw.includes("MADRASAH TSANAWIYAH")
      ) {
        return "smp";
      }
      if (
        raw.includes("SMA") ||
        raw.includes("SMK") ||
        raw.includes("SEKOLAH MENENGAH ATAS") ||
        raw.includes("SEKOLAH MENENGAH KEJURUAN") ||
        raw.includes("MA") ||
        raw.includes("MADRASAH ALIYAH")
      ) {
        return "sma";
      }
      return "";
    }

    function setSignupClassOptions(stage, selectedValue) {
      if (!signupClassNameInput) return;
      const options = signupClassOptions[stage] || [];
      const preferred = String(selectedValue || "").trim();
      const placeholder = options.length
        ? "Pilih kelas..."
        : "Pilih sekolah/NPSN dulu";
      signupClassNameInput.innerHTML =
        '<option value="">' + placeholder + "</option>";
      options.forEach(function (value) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        if (preferred && preferred === value) option.selected = true;
        signupClassNameInput.appendChild(option);
      });
      signupClassNameInput.disabled = options.length === 0;
      if (!preferred || options.indexOf(preferred) === -1) {
        signupClassNameInput.value = "";
      }
    }

    function syncSignupClassOptions(preferred) {
      const stage = normalizeSchoolStage(
        signupJenjangInput && signupJenjangInput.value,
      );
      setSignupClassOptions(stage, preferred);
    }

    async function fetchSchoolSuggestions(query) {
      const q = String(query || "").trim();
      if (!q || q.length < 3) {
        lastSchoolQuery = "";
        hideSchoolSuggest();
        return;
      }
      if (q === lastSchoolQuery) return;
      lastSchoolQuery = q;
      if (schoolSuggestAbort) schoolSuggestAbort.abort();
      schoolSuggestAbort = new AbortController();
      try {
        const cached = schoolSearchCache.get(q.toLowerCase());
        if (cached && Date.now() - cached.ts < schoolCacheTTL) {
          showSchoolSuggest(cached.items, q);
          return;
        }
        setSchoolSuggestStatus("Memuat data sekolah...");
        const url =
          "https://jaga.id/api/v5/sekolah/search?limit=8&offset=0&keyword=" +
          encodeURIComponent(q);
        const res = await fetch(url, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: schoolSuggestAbort.signal,
        });
        const json = await res.json().catch(function () {
          return null;
        });
        if (!res.ok || !json || json.success !== true) {
          throw new Error("fetch failed");
        }
        const items =
          json && json.data && Array.isArray(json.data.result)
            ? json.data.result
            : [];
        schoolSearchCache.set(q.toLowerCase(), {
          ts: Date.now(),
          items: items,
        });
        showSchoolSuggest(items, q);
      } catch (err) {
        if (err && err.name === "AbortError") return;
        if (q) {
          setSchoolSuggestStatus(
            "Gagal memuat data sekolah. Anda bisa isi manual.",
          );
        } else {
          showSchoolSuggest([], q);
        }
      }
    }

    async function fetchSchoolDetail(npsn) {
      const value = String(npsn || "").trim();
      if (!value) return;
      if (value === lastDetailNpsn) return;
      lastDetailNpsn = value;
      if (schoolDetailAbort) schoolDetailAbort.abort();
      schoolDetailAbort = new AbortController();
      try {
        const cached = schoolDetailCache.get(value);
        if (cached && Date.now() - cached.ts < schoolCacheTTL) {
          applySchoolDetail(cached.item);
          hideSchoolSuggest();
          return;
        }
        setSchoolSuggestStatus("Memuat detail sekolah...");
        const url =
          "https://jaga.id/api/v5/sekolah/detail?npsn=" +
          encodeURIComponent(value);
        const res = await fetch(url, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: schoolDetailAbort.signal,
        });
        const json = await res.json().catch(function () {
          return null;
        });
        if (!res.ok || !json || json.success !== true) {
          throw new Error("detail failed");
        }
        const list = json && json.data && json.data.result;
        const item = Array.isArray(list) && list.length ? list[0] : null;
        if (!item) throw new Error("detail empty");
        schoolDetailCache.set(value, { ts: Date.now(), item: item });
        applySchoolDetail(item);
        hideSchoolSuggest();
      } catch (err) {
        if (err && err.name === "AbortError") return;
        setSchoolSuggestStatus(
          "Detail sekolah gagal dimuat. Anda bisa isi manual.",
        );
      }
    }

    function applySchoolDetail(item) {
      if (!item) return;
      if (signupSchoolInput && item.nama) signupSchoolInput.value = item.nama;
      if (signupNpsnInput && item.npsn) signupNpsnInput.value = item.npsn;
      if (signupKabupatenInput && item.kota_kab)
        signupKabupatenInput.value = item.kota_kab;
      if (signupProvinsiInput && item.provinsi)
        signupProvinsiInput.value = item.provinsi;
      if (signupKecamatanInput && item.kecamatan)
        signupKecamatanInput.value = item.kecamatan;
      if (signupAlamatInput && item.alamat)
        signupAlamatInput.value = item.alamat;
      if (signupSchoolEmailInput && item.email)
        signupSchoolEmailInput.value = item.email;
      if (signupJenjangInput) {
        const jenjang =
          item.jenjang && item.jenjang.nama_jenjang
            ? item.jenjang.nama_jenjang
            : item.nama_jenjang || "";
        signupJenjangInput.value = jenjang;
      }
      if (signupStatusSekolahInput && item.status_sekolah)
        signupStatusSekolahInput.value = item.status_sekolah;
      syncSignupClassOptions(
        signupClassNameInput ? signupClassNameInput.value : "",
      );
    }

    if (signupSchoolInput) {
      signupSchoolInput.addEventListener("input", function (e) {
        const value = e.target ? e.target.value : "";
        if (schoolSuggestTimer) clearTimeout(schoolSuggestTimer);
        schoolSuggestTimer = setTimeout(function () {
          fetchSchoolSuggestions(value);
        }, 280);
      });

      signupSchoolInput.addEventListener("blur", function () {
        setTimeout(function () {
          hideSchoolSuggest();
        }, 200);
      });

      signupSchoolInput.addEventListener("focus", function () {
        if (
          signupSchoolSuggestList &&
          signupSchoolSuggestList.childElementCount > 0
        ) {
          signupSchoolSuggest.hidden = false;
        }
      });
    }

    if (signupNpsnInput) {
      signupNpsnInput.addEventListener("input", function (e) {
        const value = e.target ? e.target.value : "";
        if (schoolSuggestTimer) clearTimeout(schoolSuggestTimer);
        schoolSuggestTimer = setTimeout(function () {
          const v = String(value || "").trim();
          if (v.length >= 6) fetchSchoolDetail(v);
        }, 350);
      });
    }

    if (signupJenjangInput) {
      signupJenjangInput.addEventListener("input", function () {
        syncSignupClassOptions(
          signupClassNameInput ? signupClassNameInput.value : "",
        );
      });
    }

    syncSignupClassOptions();

    document.addEventListener("click", function (e) {
      if (!signupSchoolSuggest || signupSchoolSuggest.hidden) return;
      if (e.target === signupSchoolInput) return;
      if (signupSchoolSuggest.contains(e.target)) return;
      hideSchoolSuggest();
    });

    const registrationStorageKey = "non_regular_registration_id";
    let registrationPollingStop = null;

    function safeStorageGet(key) {
      try {
        return window.localStorage ? localStorage.getItem(key) : null;
      } catch (err) {
        return null;
      }
    }

    function safeStorageSet(key, value) {
      try {
        if (window.localStorage) localStorage.setItem(key, value);
      } catch (err) {}
    }

    function safeStorageRemove(key) {
      try {
        if (window.localStorage) localStorage.removeItem(key);
      } catch (err) {}
    }

    function startRegistrationPolling(regID) {
      const id = String(regID || "").trim();
      if (!id) return;
      if (registrationPollingStop) registrationPollingStop();
      let tries = 0;
      let lastStatus = "";
      const maxTries = 180;
      const intervalMs = 10000;

      async function checkOnce() {
        tries += 1;
        try {
          const data = await api(
            "/api/v1/auth/registrations/" + encodeURIComponent(id) + "/status",
            "GET",
          );
          const status = String((data && data.status) || "")
            .trim()
            .toLowerCase();
          if (status && status !== lastStatus) {
            lastStatus = status;
          }
          if (status === "approved") {
            text(msg, "Pendaftaran disetujui. Mengarahkan ke login Google...");
            activateLoginTab("signin");
            safeStorageRemove(registrationStorageKey);
            if (signupGoogleBtn) signupGoogleBtn.blur();
            registrationPollingStop();
            setTimeout(function () {
              window.location.href = "/auth/google/start?flow=login";
            }, 800);
            return;
          }
          if (status === "rejected") {
            text(
              msg,
              "Pendaftaran ditolak. Hubungi proktor/admin untuk informasi lanjut.",
            );
            safeStorageRemove(registrationStorageKey);
            registrationPollingStop();
            return;
          }
          if (status === "pending" && lastStatus !== "pending") {
            text(msg, "Pendaftaran masih diproses. Menunggu persetujuan...");
          }
        } catch (err) {
          if (err && err.message && err.message.includes("not found")) {
            safeStorageRemove(registrationStorageKey);
            registrationPollingStop();
            return;
          }
        }
        if (tries >= maxTries) {
          registrationPollingStop();
        }
      }

      const timer = setInterval(checkOnce, intervalMs);
      registrationPollingStop = function () {
        clearInterval(timer);
        registrationPollingStop = null;
      };
      checkOnce();
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
    if (showSignupBtn) {
      showSignupBtn.addEventListener("click", function () {
        activateLoginTab("signup");
      });
    }
    if (signupBackToLoginBtn) {
      signupBackToLoginBtn.addEventListener("click", function () {
        if (isNonRegularPage) {
          activateSignupStep("request");
          return;
        }
        activateLoginTab("signin");
      });
    }
    if (signupBackToRequestBtn) {
      signupBackToRequestBtn.addEventListener("click", function () {
        activateSignupStep("request");
      });
    }
    activateLoginTab(isNonRegularPage ? "signup" : "signin");

    const params = new URLSearchParams(window.location.search || "");
    const oauthStatus = params.get("oauth");
    if (oauthStatus) {
      const oauthText = {
        success: "Login Google berhasil. Mengarahkan ke dashboard...",
        not_registered:
          "Akun Google belum terdaftar. Silakan daftar non-reguler terlebih dahulu.",
        registered: "Email ini sudah terdaftar. Silakan login dengan Google.",
        registration_pending:
          "Pendaftaran masih diproses. Tunggu persetujuan admin/proktor.",
        domain_denied:
          "Email Google tidak diizinkan. Gunakan Gmail, sch.id, atau belajar.id.",
        inactive: "Akun belum aktif. Hubungi admin/proktor.",
        cancelled: "Login Google dibatalkan.",
        invalid: "Sesi login Google tidak valid. Coba lagi.",
        exchange_failed: "Gagal memproses login Google. Coba lagi.",
        userinfo_failed: "Gagal membaca profil Google. Coba lagi.",
        disabled: "Login Google belum dikonfigurasi.",
        error: "Terjadi kesalahan pada login Google.",
      }[oauthStatus];
      if (oauthText) text(msg, oauthText);
    }

    const googleSignupToken = params.get("token");
    if (params.get("google_signup") === "1" && googleSignupToken) {
      activateLoginTab("signup");
      activateSignupStep("profile");
      if (signupGoogleTokenInput)
        signupGoogleTokenInput.value = googleSignupToken;
      if (signupStepRequest) signupStepRequest.hidden = true;
      if (signupBackToRequestBtn) signupBackToRequestBtn.hidden = true;
      if (loginSubHeader)
        loginSubHeader.textContent = "Lengkapi data siswa non-reguler.";
      try {
        const prefill = await api(
          "/api/v1/auth/google/signup/prefill?token=" +
            encodeURIComponent(googleSignupToken),
          "GET",
        );
        const fullNameInput = document.getElementById("signup-full-name");
        if (fullNameInput && prefill && prefill.full_name) {
          fullNameInput.value = prefill.full_name;
        }
      } catch (err) {
        text(msg, "Sesi pendaftaran Google kedaluwarsa. Silakan daftar ulang.");
        if (signupGoogleTokenInput) signupGoogleTokenInput.value = "";
      }
    }

    const user = await meOrNull();
    if (user) {
      window.location.href = homeByRole(user);
      return;
    }

    const storedRegID = safeStorageGet(registrationStorageKey);
    if (storedRegID) {
      startRegistrationPolling(storedRegID);
    }

    if (signinForm) {
      signinForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const done = beginBusy(signinForm, msg, "Memproses login...");
        const fd = new FormData(signinForm);
        try {
          const identifier = normalizeCredential(fd.get("identifier"));
          const password = rawPassword(fd.get("password"));
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
    }

    if (signupForm) {
      signupForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const done = beginBusy(signupForm, msg, "Membuat pendaftaran...");
        const fd = new FormData(signupForm);
        try {
          const schoolName = normalizeCredential(fd.get("institution_name"));
          const npsn = normalizeCredential(fd.get("npsn"));
          if (npsn && !/^[A-Za-z0-9]{8}$/.test(npsn)) {
            text(
              msg,
              "Format NPSN tidak valid. Gunakan 8 karakter (angka/huruf).",
            );
            return;
          }
          const payloadForm = {
            non_regular: true,
            status: "siswa",
            school_name: schoolName,
            npsn: npsn,
            kabupaten: normalizeCredential(fd.get("kabupaten")),
            provinsi: normalizeCredential(fd.get("provinsi")),
            kecamatan: normalizeCredential(fd.get("kecamatan")),
            alamat: normalizeCredential(fd.get("alamat")),
            school_email: normalizeCredential(fd.get("school_email")),
            jenjang: normalizeCredential(fd.get("jenjang")),
            status_sekolah: normalizeCredential(fd.get("status_sekolah")),
            class_name: normalizeCredential(fd.get("class_name")),
          };
          const googleToken =
            (signupGoogleTokenInput && signupGoogleTokenInput.value) || "";
          if (!googleToken) {
            text(
              msg,
              "Silakan login dengan Google terlebih dahulu untuk pendaftaran non-reguler.",
            );
            return;
          }
          const payload = {
            role_requested: "siswa",
            full_name: normalizeCredential(fd.get("full_name")),
            phone: normalizeCredential(fd.get("phone")),
            institution_name: schoolName,
            form_payload: payloadForm,
          };
          const data = await api(
            "/api/v1/auth/google/signup/complete",
            "POST",
            { token: googleToken, ...payload },
          );
          const regID =
            data && data.registration_id ? String(data.registration_id) : "-";
          text(
            msg,
            "Pendaftaran terkirim (ID: " +
              regID +
              "). Tunggu verifikasi proktor/admin sebelum bisa login.",
          );
          if (regID && regID !== "-") {
            safeStorageSet(registrationStorageKey, regID);
            startRegistrationPolling(regID);
          }
          signupForm.reset();
          resetSignupSteps();
          if (signupGoogleTokenInput) signupGoogleTokenInput.value = "";
        } catch (err) {
          text(msg, "Pendaftaran gagal: " + err.message);
        } finally {
          done();
        }
      });
    }
  }

  window.AppPages = window.AppPages || {};
  window.AppPages.initLoginPage = initLoginPage;
})();
