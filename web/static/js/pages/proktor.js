(function () {
  const core = window.AppCore || {};
  const api = core.api;
  const apiMultipart = core.apiMultipart;
  const meOrNull = core.meOrNull;
  const text = core.text;
  const escapeHtml = core.escapeHtml;
  const beginBusy = core.beginBusy;
  const enhanceButtonIcons = core.enhanceButtonIcons;

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
    const shared = window.AppPagesShared || {};
    const shortQuestionType = shared.shortQuestionType;
    const cleanStemPreview = shared.cleanStemPreview;
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
    const GuruResults = window.GuruResults || {};

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
    const resultsAssignmentForm = document.getElementById(
      "proktor-results-assignment-form",
    );
    const resultsExamSelect = document.getElementById(
      "proktor-results-exam-select",
    );
    const resultsAssignmentBody = document.getElementById(
      "proktor-results-assignment-body",
    );
    const resultsMatrixHead = document.getElementById(
      "proktor-results-matrix-head",
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
    const resultsExportBtn = document.getElementById(
      "proktor-results-export-btn",
    );
    const itemAnalysisBtn = document.getElementById(
      "proktor-results-item-analysis-btn",
    );
    const itemAnalysisDialog = document.getElementById(
      "proktor-item-analysis-dialog",
    );
    const itemAnalysisBody = document.getElementById(
      "proktor-item-analysis-body",
    );
    const itemAnalysisSummary = document.getElementById(
      "proktor-item-analysis-summary",
    );
    const itemAnalysisIdentity = document.getElementById(
      "proktor-item-analysis-identity",
    );
    const itemAnalysisFilter = document.getElementById(
      "proktor-item-analysis-filter",
    );
    const itemAnalysisDetail = document.getElementById(
      "proktor-item-analysis-detail",
    );
    const itemAnalysisSubtitle = document.getElementById(
      "proktor-item-analysis-subtitle",
    );
    const itemAnalysisExportBtn = document.getElementById(
      "proktor-item-analysis-export-btn",
    );
    const itemAnalysisPrintBtn = document.getElementById(
      "proktor-item-analysis-print-btn",
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
        resultsAssignmentForm: resultsAssignmentForm,
        resultsExamSelect: resultsExamSelect,
        resultsAssignmentBody: resultsAssignmentBody,
        resultsMatrixHead: resultsMatrixHead,
        resultsAttemptForm: resultsAttemptForm,
        resultsResetAttemptForm: resultsResetAttemptForm,
        resultsSummary: resultsSummary,
        resultsExtra: resultsExtra,
        resultsReportBtn: resultsReportBtn,
        resultsStatsBtn: resultsStatsBtn,
        resultsChartBtn: resultsChartBtn,
        useSharedResultsModule: true,
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
        loadTokenExamOptions: loadTokenExamOptions,
        fillAssignClassSelectBySchool: fillAssignClassSelectBySchool,
        activateMenu: activateProktorMenu,
      });
    }

    function initProktorResultsModule() {
      if (!GuruResults || typeof GuruResults.init !== "function") return;
      GuruResults.init({
        api: api,
        beginBusy: beginBusy,
        setMsg: setMsg,
        msg: msg,
        text: text,
        escapeHtml: escapeHtml,
        fmtDate: fmtDate,
        activateMenu: activateProktorMenu,
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
        itemAnalysisBtn: itemAnalysisBtn,
        itemAnalysisDialog: itemAnalysisDialog,
        itemAnalysisBody: itemAnalysisBody,
        itemAnalysisSummary: itemAnalysisSummary,
        itemAnalysisIdentity: itemAnalysisIdentity,
        itemAnalysisFilter: itemAnalysisFilter,
        itemAnalysisDetail: itemAnalysisDetail,
        itemAnalysisSubtitle: itemAnalysisSubtitle,
        itemAnalysisExportBtn: itemAnalysisExportBtn,
        itemAnalysisPrintBtn: itemAnalysisPrintBtn,
        meOrNull: meOrNull,
        refreshExams: function () {
          if (
            ProktorExams &&
            typeof ProktorExams.loadExamManageTable === "function"
          ) {
            return ProktorExams.loadExamManageTable();
          }
          return Promise.resolve([]);
        },
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
        escapeHtml: escapeHtml,
        fmtDate: fmtDate,
        tokenForm: tokenForm,
        tokenExamSelect: tokenExamSelect,
        tokenTTLInput: tokenTTLInput,
        tokenResult: tokenResult,
        tokenListBody: document.getElementById("proktor-token-list-body"),
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
    safeInitModule("Hasil Ujian", initProktorResultsModule);
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

  window.AppPages = window.AppPages || {};
  window.AppPages.initProktorPage = initProktorPage;
})();
