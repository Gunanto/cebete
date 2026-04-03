(function () {
  const core = window.AppCore || {};
  const api = core.api;
  const apiMultipart = core.apiMultipart;
  const extractAPIError = core.extractAPIError;
  const meOrNull = core.meOrNull;
  const text = core.text;
  const escapeHtml = core.escapeHtml;
  const beginBusy = core.beginBusy;
  const enhanceButtonIcons = core.enhanceButtonIcons;

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
    const adminRegistrationsPanel = document.getElementById(
      "admin-registrations-panel",
    );
    const adminRegistrationsRefreshBtn = document.getElementById(
      "admin-registrations-refresh-btn",
    );
    const adminRegistrationsSelectAll = document.getElementById(
      "admin-registrations-select-all",
    );
    const adminRegistrationsBulkApproveBtn = document.getElementById(
      "admin-registrations-bulk-approve-btn",
    );
    const adminRegistrationsBody = document.getElementById(
      "admin-registrations-body",
    );
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
    const statRegularParticipants = document.getElementById(
      "admin-stat-regular-participants",
    );
    const statNonRegularParticipants = document.getElementById(
      "admin-stat-non-regular-participants",
    );
    const statActiveUsers = document.getElementById("admin-stat-active-users");
    const statActiveUsersDaily = document.getElementById(
      "admin-stat-active-users-daily",
    );
    const statActiveUsersWeekly = document.getElementById(
      "admin-stat-active-users-weekly",
    );
    const statActiveUsersMonthly = document.getElementById(
      "admin-stat-active-users-monthly",
    );
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
    const schoolStatsPanel = document.getElementById("admin-school-stats-panel");
    const schoolStatsTitle = document.getElementById("admin-school-stats-title");
    const schoolStatsBody = document.getElementById("admin-school-stats-body");
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
        schoolStatsPanel: schoolStatsPanel,
        schoolStatsTitle: schoolStatsTitle,
        schoolStatsBody: schoolStatsBody,
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
      if (adminRegistrationsPanel)
        adminRegistrationsPanel.hidden = target !== "registrations";
      menuButtons.forEach(function (btn) {
        const isActive = btn.getAttribute("data-admin-menu") === target;
        btn.classList.toggle("active", isActive);
      });
      const adminTitles = {
        dashboard: {
          title: "Dasbor Admin",
          desc: "Ringkasan sistem dan akses cepat ke data utama.",
        },
        registrations: {
          title: "Verifikasi Pendaftaran",
          desc: "Tinjau dan setujui pendaftaran non-reguler yang pending.",
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
      if (target === "registrations") {
        loadPendingRegistrations().catch(function (err) {
          setMsg("Gagal memuat pendaftaran pending: " + err.message);
        });
      }
    }

    function initAdminRegistrationsModule() {
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
        msg: message,
        escapeHtml: escapeHtml,
        fmtDate: fmtDate,
        regRefreshBtn: adminRegistrationsRefreshBtn,
        regSelectAll: adminRegistrationsSelectAll,
        regBulkApproveBtn: adminRegistrationsBulkApproveBtn,
        regBody: adminRegistrationsBody,
      });
    }

    async function loadPendingRegistrations() {
      if (
        ProktorRegistrations &&
        typeof ProktorRegistrations.loadPendingRegistrations === "function"
      ) {
        return ProktorRegistrations.loadPendingRegistrations();
      }
    }

    async function loadDashboardStats() {
      const out = await api("/api/v1/admin/dashboard/stats", "GET");
      if (statAdmin) statAdmin.textContent = String(out.admin_count || 0);
      if (statProktor) statProktor.textContent = String(out.proktor_count || 0);
      if (statGuru) statGuru.textContent = String(out.guru_count || 0);
      if (statSiswa) statSiswa.textContent = String(out.siswa_count || 0);
      if (statRegularParticipants) {
        statRegularParticipants.textContent = String(
          out.regular_participant_count || 0,
        );
      }
      if (statNonRegularParticipants) {
        statNonRegularParticipants.textContent = String(
          out.non_regular_participant_count || 0,
        );
      }
      if (statActiveUsers)
        statActiveUsers.textContent = String(
          out.active_user_count_monthly || 0,
        );
      if (statActiveUsersDaily)
        statActiveUsersDaily.textContent = String(
          out.active_user_count_daily || 0,
        );
      if (statActiveUsersWeekly)
        statActiveUsersWeekly.textContent = String(
          out.active_user_count_weekly || 0,
        );
      if (statActiveUsersMonthly)
        statActiveUsersMonthly.textContent = String(
          out.active_user_count_monthly || 0,
        );
      if (statSekolah) statSekolah.textContent = String(out.school_count || 0);
    }

    initAdminUsersModule();
    initAdminMasterModule();
    initAdminRegistrationsModule();

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
      await loadPendingRegistrations();
      activateMenu("dashboard");
      setMsg("Dashboard admin siap.");
    } catch (err) {
      setMsg("Gagal memuat data awal admin: " + err.message);
    }
  }

  window.AppPages = window.AppPages || {};
  window.AppPages.initAdminPage = initAdminPage;
})();
