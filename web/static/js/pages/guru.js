(function () {
  const core = window.AppCore || {};
  const api = core.api;
  const apiMultipart = core.apiMultipart;
  const downloadCSV = core.downloadCSV;
  const extractAPIError = core.extractAPIError;
  const meOrNull = core.meOrNull;
  const text = core.text;
  const escapeHtml = core.escapeHtml;
  const beginBusy = core.beginBusy;
  const enhanceButtonIcons = core.enhanceButtonIcons;

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
    const shared = window.AppPagesShared || {};
    const shortQuestionType = shared.shortQuestionType;
    const cleanStemPreview = shared.cleanStemPreview;
    const createQuillEditor = shared.createQuillEditor;
    const getQuillHTML = shared.getQuillHTML;
    const ensureQuillReady = shared.ensureQuillReady;
    const previewText = shared.previewText;

    const msg = document.getElementById("guru-message");
    const statSubjects = document.getElementById("guru-stat-subjects");
    const statLevels = document.getElementById("guru-stat-levels");
    const statLearningGoals = document.getElementById(
      "guru-stat-learning-goals",
    );
    const statManuscripts = document.getElementById("guru-stat-manuscripts");
    const statExams = document.getElementById("guru-stat-exams");
    const statCompletedExams = document.getElementById(
      "guru-stat-completed-exams",
    );
    const statInProgress = document.getElementById("guru-stat-in-progress");
    const statResults = document.getElementById("guru-stat-results");
    const statRegularParticipants = document.getElementById(
      "guru-stat-regular-participants",
    );
    const statNonRegularParticipants = document.getElementById(
      "guru-stat-non-regular-participants",
    );
    const dashboardMonitorRefreshBtn = document.getElementById(
      "guru-dashboard-monitor-refresh-btn",
    );
    const dashboardMonitorExamFilter = document.getElementById(
      "guru-dashboard-monitor-exam-filter",
    );
    const dashboardMonitorIdleThreshold = document.getElementById(
      "guru-dashboard-monitor-idle-threshold",
    );
    const dashboardMonitorMeta = document.getElementById(
      "guru-dashboard-monitor-meta",
    );
    const dashboardMonitorBody = document.getElementById(
      "guru-dashboard-monitor-body",
    );
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
    const tokenPanel = document.getElementById("guru-token-panel");
    const enrollPanel = document.getElementById("guru-enroll-panel");
    const resultsPanel = document.getElementById("guru-results-panel");
    const guidePanel = document.getElementById("guru-guide-panel");
    const menuButtons = root.querySelectorAll("[data-guru-menu]");
    const menuJumpButtons = root.querySelectorAll("[data-guru-jump]");
    const guruPageTitle = document.getElementById("guru-page-title");
    const guruPageDesc = document.getElementById("guru-page-desc");
    const guruSidebar = root.querySelector(".portal-sidebar");
    const guruSidebarToggleBtn = root.querySelector(".guru-sidebar-toggle");
    const dashboardGreetingEyebrow = root.querySelector(
      ".dashboard-greeting-eyebrow",
    );
    const dashboardGreetingSummary = root.querySelector(
      ".dashboard-greeting-summary",
    );

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
    const learningGoalExportBtn = document.getElementById(
      "guru-learning-goals-export-btn",
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
    const manuscriptExportFormatInput = document.getElementById(
      "guru-manuscript-export-format",
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
    const manuscriptFormMessage = document.getElementById(
      "guru-manuscript-form-message",
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
    const manuscriptStimulusGroupSelect = document.getElementById(
      "guru-manuscript-stimulus-group-select",
    );
    const manuscriptStimulusGroupInfo = document.getElementById(
      "guru-manuscript-stimulus-group-info",
    );
    const manuscriptStimulusGroupStatus = document.getElementById(
      "guru-manuscript-stimulus-group-status",
    );
    const manuscriptStimulusGroupQuickActions = document.getElementById(
      "guru-manuscript-stimulus-group-quick-actions",
    );
    const manuscriptStimulusGroupRefreshBtn = document.getElementById(
      "guru-manuscript-stimulus-group-refresh-btn",
    );
    const manuscriptStimulusGroupCreateBtn = document.getElementById(
      "guru-manuscript-stimulus-group-create-btn",
    );
    const manuscriptStimulusGroupClearBtn = document.getElementById(
      "guru-manuscript-stimulus-group-clear-btn",
    );
    const manuscriptStimulusEditor = document.getElementById(
      "guru-manuscript-stimulus-editor",
    );
    const manuscriptStimulusType = document.getElementById(
      "guru-manuscript-stimulus-type",
    );
    const manuscriptStimulusSinglePanel = document.getElementById(
      "guru-manuscript-stimulus-single-panel",
    );
    const manuscriptStimulusMultiteksPanel = document.getElementById(
      "guru-manuscript-stimulus-multiteks-panel",
    );
    const manuscriptStimulusTabsWrap = document.getElementById(
      "guru-manuscript-stimulus-tabs",
    );
    const manuscriptAddStimulusTabBtn = document.getElementById(
      "guru-manuscript-add-stimulus-tab-btn",
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
    const manuscriptOptionLayout = document.getElementById(
      "guru-manuscript-option-layout",
    );
    const manuscriptOptionComparisonFields = document.getElementById(
      "guru-manuscript-option-comparison-fields",
    );
    const manuscriptOptionLeftLabel = document.getElementById(
      "guru-manuscript-option-left-label",
    );
    const manuscriptOptionRightLabel = document.getElementById(
      "guru-manuscript-option-right-label",
    );
    const manuscriptAddOptionBtn = document.getElementById(
      "guru-manuscript-add-option-btn",
    );
    const manuscriptAddOptionBtnBottom = document.getElementById(
      "guru-manuscript-add-option-btn-bottom",
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
    const manuscriptKeyMatch = document.getElementById(
      "guru-manuscript-key-match",
    );
    const manuscriptKeyShortAnswer = document.getElementById(
      "guru-manuscript-key-short-answer",
    );
    const manuscriptStatementsWrap = document.getElementById(
      "guru-manuscript-statements",
    );
    const manuscriptAddStatementBtn = document.getElementById(
      "guru-manuscript-add-statement-btn",
    );
    const manuscriptAddStatementBtnBottom = document.getElementById(
      "guru-manuscript-add-statement-btn-bottom",
    );
    const manuscriptMatchPromptsWrap = document.getElementById(
      "guru-manuscript-match-prompts",
    );
    const manuscriptMatchChoicesWrap = document.getElementById(
      "guru-manuscript-match-choices",
    );
    const manuscriptMatchPairsWrap = document.getElementById(
      "guru-manuscript-match-pairs",
    );
    const manuscriptAddMatchPromptBtn = document.getElementById(
      "guru-manuscript-add-match-prompt-btn",
    );
    const manuscriptAddMatchChoiceBtn = document.getElementById(
      "guru-manuscript-add-match-choice-btn",
    );
    const manuscriptSyncMatchPairsBtn = document.getElementById(
      "guru-manuscript-sync-match-pairs-btn",
    );
    const manuscriptMatchNoteHTML = document.getElementById(
      "guru-manuscript-match-note-html",
    );
    const manuscriptShortAnswerAccepted = document.getElementById(
      "guru-manuscript-short-answer-accepted",
    );
    const manuscriptShortAnswerPlaceholder = document.getElementById(
      "guru-manuscript-short-answer-placeholder",
    );
    const manuscriptShortAnswerInputType = document.getElementById(
      "guru-manuscript-short-answer-input-type",
    );
    const manuscriptShortAnswerMaxLength = document.getElementById(
      "guru-manuscript-short-answer-max-length",
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
    const tokenForm = document.getElementById("guru-token-form");
    const tokenExamSelect = document.getElementById("guru-token-exam");
    const tokenTTLInput = document.getElementById("guru-token-ttl");
    const tokenResult = document.getElementById("guru-token-result");
    const tokenListBody = document.getElementById("guru-token-list-body");
    const enrollRefreshBtn = document.getElementById("guru-enroll-refresh-btn");
    const examAssignForm = document.getElementById("guru-exam-assign-form");
    const assignExamIDInput = document.getElementById("guru-assign-exam-id");
    const assignSchoolSelect = document.getElementById("guru-assign-school");
    const assignClassSelect = document.getElementById("guru-assign-class");
    const assignScopeHint = document.getElementById("guru-assign-scope-hint");
    const examAssignmentsLoadBtn = document.getElementById(
      "guru-exam-assignments-load-btn",
    );
    const examAssignmentsBody = document.getElementById(
      "guru-exam-assignments-body",
    );
    const examDialog = document.getElementById("guru-exam-dialog");
    const examDialogOpenBtn = document.getElementById(
      "guru-exam-dialog-open-btn",
    );
    const examDialogTitle = document.getElementById("guru-exam-dialog-title");
    const examCancelBtn = document.getElementById("guru-exam-cancel-btn");
    const examForm = document.getElementById("guru-exam-form");
    const examRandomizeQuestionsInput =
      examForm && examForm.elements
        ? examForm.elements.namedItem("randomize_questions")
        : null;
    const examRandomizeOptionsInput =
      examForm && examForm.elements
        ? examForm.elements.namedItem("randomize_options")
        : null;
    const examAllowNonRegularInput =
      examForm && examForm.elements
        ? examForm.elements.namedItem("allow_non_regular_self_enroll")
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
    const examQuestionViewDialog = document.getElementById(
      "guru-exam-question-view-dialog",
    );
    const examQuestionViewTitle = document.getElementById(
      "guru-exam-question-view-title",
    );
    const examQuestionViewStimulus = document.getElementById(
      "guru-exam-question-view-stimulus",
    );
    const examQuestionViewStem = document.getElementById(
      "guru-exam-question-view-stem",
    );
    const examQuestionViewOptions = document.getElementById(
      "guru-exam-question-view-options",
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
    const resultsViewMode = document.getElementById(
      "guru-results-view-mode",
    );
    const resultsViewModeField = resultsViewMode
      ? resultsViewMode.closest("label")
      : null;
    const resultsFinalScheme = document.getElementById(
      "guru-results-final-scheme",
    );
    const resultsFinalSchemeField = resultsFinalScheme
      ? resultsFinalScheme.closest("label")
      : null;
    const resultsAttemptFilter = document.getElementById(
      "guru-results-attempt-filter",
    );
    const resultsAttemptFilterField = resultsAttemptFilter
      ? resultsAttemptFilter.closest("label")
      : null;
    const resultsClassFilter = document.getElementById(
      "guru-results-class-filter",
    );
    const resultsSchoolFilter = document.getElementById(
      "guru-results-school-filter",
    );
    const resultsAssignmentBody = document.getElementById(
      "guru-results-assignment-body",
    );
    const resultsMatrixHead = document.getElementById(
      "guru-results-matrix-head",
    );
    const resultsAttemptWrap = document.getElementById(
      "guru-results-attempt-wrap",
    );
    const resultsRecapWrap = document.getElementById(
      "guru-results-recap-wrap",
    );
    const resultsRecapBody = document.getElementById(
      "guru-results-recap-body",
    );
    const scoreRecapDetailDialog = document.getElementById(
      "guru-score-recap-detail-dialog",
    );
    const scoreRecapDetailSubtitle = document.getElementById(
      "guru-score-recap-detail-subtitle",
    );
    const scoreRecapDetailSummary = document.getElementById(
      "guru-score-recap-detail-summary",
    );
    const scoreRecapDetailBody = document.getElementById(
      "guru-score-recap-detail-body",
    );
    const examParticipantsDialog = document.getElementById(
      "guru-exam-participants-dialog",
    );
    const examParticipantsSubtitle = document.getElementById(
      "guru-exam-participants-subtitle",
    );
    const examParticipantsSummary = document.getElementById(
      "guru-exam-participants-summary",
    );
    const examParticipantsBody = document.getElementById(
      "guru-exam-participants-body",
    );
    const resultsPageInfo = document.getElementById("guru-results-page-info");
    const resultsPrevBtn = document.getElementById("guru-results-prev-btn");
    const resultsNextBtn = document.getElementById("guru-results-next-btn");
    const resultsPageSizeSelect = document.getElementById(
      "guru-results-page-size",
    );
    const resultsSummary = document.getElementById("guru-results-summary");
    const resultsAnalysisActions = document.getElementById(
      "guru-results-analysis-actions",
    );
    const resultsExtra = document.getElementById("guru-results-extra");
    const resultsReportBtn = document.getElementById("guru-results-report-btn");
    const resultsStatsBtn = document.getElementById("guru-results-stats-btn");
    const resultsChartBtn = document.getElementById("guru-results-chart-btn");
    const resultsExportBtn = document.getElementById("guru-results-export-btn");
    const itemAnalysisBtn = document.getElementById(
      "guru-results-item-analysis-btn",
    );
    const learningGoalBtn = document.getElementById(
      "guru-results-learning-goal-btn",
    );
    const itemAnalysisDialog = document.getElementById(
      "guru-item-analysis-dialog",
    );
    const itemAnalysisBody = document.getElementById("guru-item-analysis-body");
    const itemAnalysisSummary = document.getElementById(
      "guru-item-analysis-summary",
    );
    const itemAnalysisIdentity = document.getElementById(
      "guru-item-analysis-identity",
    );
    const itemAnalysisFilter = document.getElementById(
      "guru-item-analysis-filter",
    );
    const itemAnalysisFilterNo = document.getElementById(
      "guru-item-analysis-filter-no",
    );
    const itemAnalysisFilterTypeHead = document.getElementById(
      "guru-item-analysis-filter-type-head",
    );
    const itemAnalysisFilterQuestion = document.getElementById(
      "guru-item-analysis-filter-question",
    );
    const itemAnalysisFilterValidity = document.getElementById(
      "guru-item-analysis-filter-validity",
    );
    const itemAnalysisFilterStatus = document.getElementById(
      "guru-item-analysis-filter-status",
    );
    const itemAnalysisDetail = document.getElementById(
      "guru-item-analysis-detail",
    );
    const itemAnalysisSubtitle = document.getElementById(
      "guru-item-analysis-subtitle",
    );
    const itemAnalysisExportBtn = document.getElementById(
      "guru-item-analysis-export-btn",
    );
    const itemAnalysisPrintBtn = document.getElementById(
      "guru-item-analysis-print-btn",
    );
    const learningGoalDialog = document.getElementById(
      "guru-learning-goal-dialog",
    );
    const learningGoalAnalysisBody = document.getElementById(
      "guru-learning-goal-analysis-body",
    );
    const learningGoalAnalysisSummary = document.getElementById(
      "guru-learning-goal-summary",
    );
    const learningGoalAnalysisIdentity = document.getElementById(
      "guru-learning-goal-identity",
    );
    const learningGoalAnalysisDetail = document.getElementById(
      "guru-learning-goal-detail",
    );
    const learningGoalAnalysisSubtitle = document.getElementById(
      "guru-learning-goal-subtitle",
    );
    const learningGoalAnalysisExportBtn = document.getElementById(
      "guru-learning-goal-export-btn",
    );
    const learningGoalAnalysisPrintBtn = document.getElementById(
      "guru-learning-goal-print-btn",
    );
    const learningGoalAnalysisKKTP = document.getElementById(
      "guru-learning-goal-kktp",
    );
    const learningGoalStudentDialog = document.getElementById(
      "guru-learning-goal-student-dialog",
    );
    const learningGoalStudentBody = document.getElementById(
      "guru-learning-goal-student-body",
    );
    const learningGoalStudentSummary = document.getElementById(
      "guru-learning-goal-student-summary",
    );
    const learningGoalStudentIdentity = document.getElementById(
      "guru-learning-goal-student-identity",
    );
    const learningGoalStudentDetail = document.getElementById(
      "guru-learning-goal-student-detail",
    );
    const learningGoalStudentSubtitle = document.getElementById(
      "guru-learning-goal-student-subtitle",
    );
    const learningGoalStudentKKTP = document.getElementById(
      "guru-learning-goal-student-kktp",
    );
    const tabQuillByWrap = new Map();

    let guruUniqueParticipantCount = 0;
    let guruCompletedExamCount = 0;
    let guruInProgressCount = 0;
    let guruRegularParticipantCount = 0;
    let guruNonRegularParticipantCount = 0;
    let dashboardMonitorTimer = null;
    let dashboardMonitorLoading = false;
    let dashboardMonitorExamItems = [];
    let dashboardMonitorRows = [];
    const dashboardIdleThresholdStorageKey =
      "cbtlms_guru_dashboard_idle_threshold";
    const guruSidebarCollapsedStorageKey = "cbtlms_guru_sidebar_collapsed";

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
      if (statCompletedExams) {
        statCompletedExams.textContent = String(
          Number(guruCompletedExamCount || 0),
        );
      }
      if (statInProgress) {
        statInProgress.textContent = String(Number(guruInProgressCount || 0));
      }
      if (statResults) {
        statResults.textContent = String(
          Number(guruUniqueParticipantCount || 0),
        );
      }
      if (statRegularParticipants) {
        statRegularParticipants.textContent = String(
          Number(guruRegularParticipantCount || 0),
        );
      }
      if (statNonRegularParticipants) {
        statNonRegularParticipants.textContent = String(
          Number(guruNonRegularParticipantCount || 0),
        );
      }
      updateDashboardGreetingSummary();
    }

    function resolveDayGreeting() {
      const hour = new Date().getHours();
      if (hour < 11) return "Selamat pagi";
      if (hour < 15) return "Selamat siang";
      if (hour < 19) return "Selamat sore";
      return "Selamat malam";
    }

    function updateDashboardGreeting() {
      if (!dashboardGreetingEyebrow) return;
      dashboardGreetingEyebrow.textContent =
        resolveDayGreeting() + ", semoga aktivitas mengajar lancar.";
    }

    function updateDashboardGreetingSummary() {
      if (!dashboardGreetingSummary) return;
      const inProgress = Number(guruInProgressCount || 0);
      const completed = Number(guruCompletedExamCount || 0);
      const totalParticipants = Number(guruUniqueParticipantCount || 0);
      if (inProgress > 0) {
        dashboardGreetingSummary.textContent =
          "Ada " +
          String(inProgress) +
          " ujian aktif dipantau, " +
          String(completed) +
          " sesi sudah selesai.";
        return;
      }
      dashboardGreetingSummary.textContent =
        "Belum ada ujian aktif. Total peserta yang pernah mengerjakan: " +
        String(totalParticipants) +
        ".";
    }

    function saveGuruSidebarCollapsed(value) {
      const normalized = value === true;
      try {
        window.localStorage.setItem(
          guruSidebarCollapsedStorageKey,
          normalized ? "1" : "0",
        );
      } catch (_) {
        // Ignore if storage is unavailable.
      }
      return normalized;
    }

    function loadGuruSidebarCollapsed() {
      try {
        return (
          window.localStorage.getItem(guruSidebarCollapsedStorageKey) === "1"
        );
      } catch (_) {
        return false;
      }
    }

    function applyGuruSidebarCollapsed(value) {
      const collapsed = value === true;
      root.classList.toggle("guru-sidebar-collapsed", collapsed);
      if (guruSidebarToggleBtn) {
        guruSidebarToggleBtn.setAttribute(
          "aria-pressed",
          collapsed ? "true" : "false",
        );
      }
      if (guruSidebar) {
        guruSidebar.classList.toggle("is-collapsed", collapsed);
      }
    }

    const setMsg = function (value) {
      text(msg, value);
    };
    const setManuscriptMsg = function (value) {
      text(manuscriptMessage, value);
    };
    const fmtDate = function (raw) {
      if (!raw) return "-";
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return String(raw);
      return d.toLocaleString("id-ID");
    };

    function setDashboardMonitorMeta(value, muted) {
      if (!dashboardMonitorMeta) return;
      text(dashboardMonitorMeta, value);
      dashboardMonitorMeta.classList.toggle("muted", muted !== false);
    }

    function fillDashboardMonitorExamFilter(exams) {
      if (!dashboardMonitorExamFilter) return;
      const current = String(dashboardMonitorExamFilter.value || "");
      const items = Array.isArray(exams) ? exams : [];
      dashboardMonitorExamItems = items.slice();
      dashboardMonitorExamFilter.innerHTML =
        '<option value="">Semua ujian</option>';
      items.forEach(function (exam) {
        const examID = String((exam && exam.id) || "");
        if (!examID) return;
        const opt = document.createElement("option");
        opt.value = examID;
        opt.textContent =
          [
            String((exam && exam.code) || "").trim(),
            String((exam && exam.title) || "").trim(),
          ]
            .filter(Boolean)
            .join(" | ") || "Ujian #" + examID;
        if (current && current === examID) opt.selected = true;
        dashboardMonitorExamFilter.appendChild(opt);
      });
      if (current && !dashboardMonitorExamFilter.value) {
        dashboardMonitorExamFilter.value = "";
      }
    }

    function getDashboardMonitorFilteredRows() {
      const examFilter = String(
        (dashboardMonitorExamFilter && dashboardMonitorExamFilter.value) || "",
      );
      return (Array.isArray(dashboardMonitorRows) ? dashboardMonitorRows : [])
        .filter(function (it) {
          if (!examFilter) return true;
          return String((it && it.exam_id) || "") === examFilter;
        })
        .slice();
    }

    function statusBadgeHTML(status) {
      const raw = String(status || "in_progress")
        .trim()
        .toLowerCase();
      return (
        '<span class="dashboard-status-badge status-' +
        escapeHtml(raw.replace(/[^a-z0-9_-]+/g, "-")) +
        '">' +
        escapeHtml(raw || "-") +
        "</span>"
      );
    }

    function activityBadgeHTML(kind, label) {
      return (
        '<span class="dashboard-status-badge status-' +
        escapeHtml(String(kind || "no-event")) +
        '">' +
        escapeHtml(String(label || "-")) +
        "</span>"
      );
    }

    function saveDashboardIdleThreshold(value) {
      const allowed = ["2", "5", "10"];
      const normalized = allowed.includes(String(value || ""))
        ? String(value)
        : "2";
      try {
        window.localStorage.setItem(
          dashboardIdleThresholdStorageKey,
          normalized,
        );
      } catch (_) {
        // Ignore if storage is unavailable.
      }
      return normalized;
    }

    function loadSavedDashboardIdleThreshold() {
      try {
        const saved = window.localStorage.getItem(
          dashboardIdleThresholdStorageKey,
        );
        if (saved) return saveDashboardIdleThreshold(saved);
      } catch (_) {
        // Ignore if storage is unavailable.
      }
      return "2";
    }

    function getDashboardIdleThresholdMs() {
      const current =
        (dashboardMonitorIdleThreshold &&
          dashboardMonitorIdleThreshold.value) ||
        loadSavedDashboardIdleThreshold();
      const minutes = Number(saveDashboardIdleThreshold(current));
      if (!Number.isFinite(minutes) || minutes <= 0) {
        return 2 * 60 * 1000;
      }
      return minutes * 60 * 1000;
    }

    function isDashboardActiveAssignment(it) {
      const row = it || {};
      if (String((row.role || "")).toLowerCase() !== "siswa") return false;
      const status = String(row.latest_attempt_status || "")
        .trim()
        .toLowerCase();
      if (status === "in_progress") return true;
      const startedAt = String(row.latest_started_at || "").trim();
      const submittedAt = String(row.latest_submitted_at || "").trim();
      return Boolean(startedAt) && !submittedAt;
    }

    function loadDashboardMonitorActivity(rows) {
      const items = Array.isArray(rows) ? rows : [];
      const now = Date.now();
      const idleThresholdMs = getDashboardIdleThresholdMs();
      return items.map(function (it) {
        const copy = Object.assign({}, it || {});
        const lastActivityAt = String(
          (copy && copy.latest_activity_at) || "",
        ).trim();
        copy.latest_activity_at = lastActivityAt || null;
        if (!lastActivityAt) {
          copy.activity_state = "no-event";
          copy.activity_label = "Belum ada event";
          copy.idle_minutes = null;
          return copy;
        }
        const ageMs = Math.max(0, now - new Date(lastActivityAt).getTime());
        const idleMinutes = Math.floor(ageMs / 60000);
        copy.idle_minutes = idleMinutes;
        if (ageMs >= idleThresholdMs) {
          copy.activity_state = "idle";
          copy.activity_label =
            idleMinutes > 0 ? "Idle " + String(idleMinutes) + "m" : "Idle";
          return copy;
        }
        copy.activity_state = "in-progress";
        copy.activity_label = "Aktif";
        return copy;
      });
    }

    function renderDashboardMonitorRows(rows) {
      if (!dashboardMonitorBody) return;
      const items = Array.isArray(rows) ? rows : [];
      if (!items.length) {
        dashboardMonitorBody.innerHTML =
          '<tr><td colspan="7" class="muted">Belum ada peserta yang sedang mengerjakan ujian.</td></tr>';
        return;
      }
      dashboardMonitorBody.innerHTML = "";
      items.forEach(function (it) {
        const tr = document.createElement("tr");
        const startedAt = it.latest_started_at || it.assigned_at;
        const latestActivityAt = it.latest_activity_at;
        tr.classList.toggle(
          "dashboard-monitor-row-idle",
          String(it.activity_state || "") === "idle",
        );
        tr.innerHTML = [
          "<td>" +
            escapeHtml(String(it.full_name || "-")) +
            "<br><small>" +
            escapeHtml(String(it.username || "-")) +
            "</small></td>",
          "<td>" +
            escapeHtml(String(it.school_name || "-")) +
            "</td>",
          "<td>" +
            escapeHtml(String(it.class_name || it.school_name || "-")) +
            "</td>",
          "<td>" + escapeHtml(String(it.exam_label || "-")) + "</td>",
          "<td>" + escapeHtml(fmtDate(startedAt)) + "</td>",
          "<td>" +
            escapeHtml(fmtDate(latestActivityAt)) +
            "<br><small>" +
            activityBadgeHTML(it.activity_state, it.activity_label) +
            "</small></td>",
          "<td>" +
            statusBadgeHTML(it.latest_attempt_status || "in_progress") +
            "</td>",
        ].join("");
        dashboardMonitorBody.appendChild(tr);
      });
    }

    function applyDashboardMonitorView() {
      const rows = getDashboardMonitorFilteredRows().sort(function (a, b) {
        const rank = function (it) {
          const state = String((it && it.activity_state) || "");
          if (state === "idle") return 0;
          if (state === "no-event") return 1;
          return 2;
        };
        const rankDiff = rank(a) - rank(b);
        if (rankDiff !== 0) return rankDiff;
        const aIdle = Number((a && a.idle_minutes) || 0);
        const bIdle = Number((b && b.idle_minutes) || 0);
        if (rank(a) === 0 && aIdle !== bIdle) return bIdle - aIdle;
        const aActivity = new Date(
          (a && a.latest_activity_at) || (a && a.latest_started_at) || 0,
        ).getTime();
        const bActivity = new Date(
          (b && b.latest_activity_at) || (b && b.latest_started_at) || 0,
        ).getTime();
        return bActivity - aActivity;
      });
      renderDashboardMonitorRows(rows);
      const idleCount = rows.filter(function (it) {
        return String((it && it.activity_state) || "") === "idle";
      }).length;
      const examFilter = String(
        (dashboardMonitorExamFilter && dashboardMonitorExamFilter.value) || "",
      );
      const examLabel = examFilter
        ? (() => {
            const target = dashboardMonitorExamItems.find(function (it) {
              return String((it && it.id) || "") === examFilter;
            });
            if (!target) return "";
            return (
              [
                String((target && target.code) || "").trim(),
                String((target && target.title) || "").trim(),
              ]
                .filter(Boolean)
                .join(" | ") || "Ujian #" + examFilter
            );
          })()
        : "";
      setDashboardMonitorMeta(
        "Peserta aktif: " +
          String(rows.length) +
          " | Idle: " +
          String(idleCount) +
          (examLabel ? " | Filter: " + examLabel : "") +
          " | Diperbarui " +
          fmtDate(new Date().toISOString()),
        rows.length === 0,
      );
    }

    async function loadGuruDashboardMonitor(force) {
      if (!dashboardPanel || dashboardPanel.hidden) return;
      if (dashboardMonitorLoading && !force) return;
      dashboardMonitorLoading = true;
      if (dashboardMonitorRefreshBtn) {
        dashboardMonitorRefreshBtn.disabled = true;
      }
      try {
        const exams = await api("/api/v1/admin/exams/manage", "GET");
        const examItems = (Array.isArray(exams) ? exams : []).filter(
          function (it) {
            return Number((it && it.assigned_count) || 0) > 0;
          },
        );
        fillDashboardMonitorExamFilter(examItems);
        const assignmentLists = await Promise.all(
          examItems.map(async function (exam) {
            const examID = Number((exam && exam.id) || 0);
            if (examID <= 0) return [];
            const rows = await api(
              "/api/v1/admin/exams/" + examID + "/assignments",
              "GET",
            );
            return (Array.isArray(rows) ? rows : []).map(function (it) {
              const copy = Object.assign({}, it || {});
              copy.exam_id = examID;
              copy.exam_label =
                [
                  String((exam && exam.code) || "").trim(),
                  String((exam && exam.title) || "").trim(),
                ]
                  .filter(Boolean)
                  .join(" | ") || "Ujian #" + String(examID);
              return copy;
            });
          }),
        );
        const activeRows = assignmentLists.flat().filter(function (it) {
          return isDashboardActiveAssignment(it);
        });
        dashboardMonitorRows = loadDashboardMonitorActivity(activeRows);
        guruInProgressCount = activeRows.length;
        refreshGuruSummaryStats();
        applyDashboardMonitorView();
      } catch (err) {
        dashboardMonitorRows = [];
        renderDashboardMonitorRows([]);
        setDashboardMonitorMeta(
          "Gagal memuat monitor peserta: " + err.message,
          true,
        );
      } finally {
        dashboardMonitorLoading = false;
        if (dashboardMonitorRefreshBtn) {
          dashboardMonitorRefreshBtn.disabled = false;
        }
      }
    }

    function scheduleGuruDashboardMonitor() {
      if (dashboardMonitorTimer) {
        window.clearInterval(dashboardMonitorTimer);
      }
      dashboardMonitorTimer = window.setInterval(function () {
        if (!dashboardPanel || dashboardPanel.hidden) return;
        loadGuruDashboardMonitor(false);
      }, 15000);
    }

    function csvEscape(raw) {
      const s = String(raw || "");
      if (!s) return "";
      if (s.includes(",") || s.includes("\n") || s.includes('"')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }

    function decodeImportWordCSVLine(text) {
      const line = String(text || "");
      if (!line.trim()) return [];
      const out = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i += 1;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (ch === "," && !inQuotes) {
          out.push(current);
          current = "";
        } else {
          current += ch;
        }
      }
      out.push(current);
      return out;
    }

    function normalizeImportHeaderKey(raw) {
      return String(raw || "")
        .trim()
        .toLowerCase()
        .replace(/[\s_]+/g, " ")
        .replace(/[^\w\s]/g, "")
        .replace(/\s+/g, " ")
        .trim();
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
    const GuruEnroll = window.GuruEnroll || {};
    const ProktorToken = window.ProktorToken || {};
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
      if (!it) return "-";
      const code = String((it && (it.code || it.question_code)) || "").trim();
      const name = String(
        (it && (it.name || it.question_code_name)) || "",
      ).trim();
      if (code && name) return code + " - " + name;
      if (code || name) return code || name;
      const questionCodeID = Number(
        (it && (it.question_code_id || it.id)) || 0,
      );
      if (questionCodeID > 0) {
        const found = findQuestionCodeByID(questionCodeID);
        if (found && found !== it) {
          const fallbackCode = String(
            (found && (found.code || found.question_code)) || "",
          ).trim();
          const fallbackName = String(
            (found && (found.name || found.question_code_name)) || "",
          ).trim();
          if (fallbackCode && fallbackName) {
            return fallbackCode + " - " + fallbackName;
          }
          if (fallbackCode || fallbackName) {
            return fallbackCode || fallbackName;
          }
        }
      }
      return "-";
    }

    function getSubjectsCache() {
      if (GuruSubjects && typeof GuruSubjects.getCache === "function") {
        return GuruSubjects.getCache();
      }
      return [];
    }

    function findQuestionCodeByID(questionCodeID) {
      if (QuestionCodes && typeof QuestionCodes.findByID === "function") {
        return QuestionCodes.findByID(questionCodeID);
      }
      return null;
    }

    function fillQuestionCodeSubjectSelect(subjectID) {
      if (
        QuestionCodes &&
        typeof QuestionCodes.fillSubjectSelect === "function"
      ) {
        QuestionCodes.fillSubjectSelect(subjectID);
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

    function initGuruBlueprintsModule() {
      if (!GuruBlueprints || typeof GuruBlueprints.init !== "function") {
        return;
      }
      GuruBlueprints.init({
        blueprints: Blueprints,
      });
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

    function findQuestionByID(questionID) {
      if (GuruBlueprints && typeof GuruBlueprints.findByID === "function") {
        return GuruBlueprints.findByID(questionID);
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

    function findLearningGoalByID(goalID) {
      if (LearningGoals && typeof LearningGoals.findByID === "function") {
        return LearningGoals.findByID(goalID);
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

    function resolveLearningGoalIDByCode(subjectID, code) {
      if (
        LearningGoals &&
        typeof LearningGoals.resolveLearningGoalIDByCode === "function"
      ) {
        return LearningGoals.resolveLearningGoalIDByCode(subjectID, code);
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
      return [];
    }

    function fillLearningGoalSubjectSelect() {
      if (
        LearningGoals &&
        typeof LearningGoals.fillSubjectSelect === "function"
      ) {
        LearningGoals.fillSubjectSelect();
      }
    }

    function initBlueprintsModule() {
      if (!Blueprints || typeof Blueprints.init !== "function") {
        return;
      }
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
          if (
            LearningGoals &&
            typeof LearningGoals.fillSubjectSelect === "function"
          ) {
            LearningGoals.fillSubjectSelect();
          }
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

    function initLearningGoalsModule() {
      if (!LearningGoals || typeof LearningGoals.init !== "function") {
        return;
      }
      LearningGoals.init({
        api: api,
        apiMultipart: apiMultipart,
        beginBusy: beginBusy,
        setMsg: setMsg,
        msg: msg,
        escapeHtml: escapeHtml,
        extractAPIError: extractAPIError,
        subjectLabel: subjectLabel,
        getSubjectsCache: getSubjectsCache,
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
        learningGoalExportBtn: learningGoalExportBtn,
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

    function fillExamQuestionCodeSelectByExam(examID) {
      if (QuestionCodes && typeof QuestionCodes.fillExamSelect === "function") {
        QuestionCodes.fillExamSelect(examID);
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
      if (GuruExams && typeof GuruExams.loadSubjectOptions === "function") {
        return GuruExams.loadSubjectOptions();
      }
      return [];
    }

    async function loadGuruExamManageTable() {
      if (GuruExams && typeof GuruExams.loadExamManageTable === "function") {
        return GuruExams.loadExamManageTable();
      }
      return [];
    }

    async function loadGuruResultExamOptions() {
      const exams = await api("/api/v1/admin/exams/manage?all=1", "GET");
      if (GuruResults && typeof GuruResults.setExams === "function") {
        GuruResults.setExams(exams);
      }
      return Array.isArray(exams) ? exams : [];
    }

    async function loadGuruExamQuestions(examID) {
      if (GuruExams && typeof GuruExams.loadExamQuestions === "function") {
        return GuruExams.loadExamQuestions(examID);
      }
      return [];
    }

    async function loadGuruExamAssignments() {
      if (GuruExams && typeof GuruExams.loadExamAssignments === "function") {
        return GuruExams.loadExamAssignments();
      }
      return [];
    }

    async function loadGuruEnrollExamManageTable() {
      if (GuruEnroll && typeof GuruEnroll.loadExamManageTable === "function") {
        return GuruEnroll.loadExamManageTable();
      }
      return [];
    }

    async function loadGuruTokenExamOptions() {
      const exams = await api("/api/v1/admin/exams", "GET");
      const items = Array.isArray(exams) ? exams : [];
      if (!tokenExamSelect) return items;
      const current = String(tokenExamSelect.value || "");
      tokenExamSelect.innerHTML = '<option value="">Pilih ujian...</option>';
      items.forEach(function (it) {
        const option = document.createElement("option");
        option.value = String((it && it.id) || "");
        option.textContent = [
          String((it && it.code) || "").trim(),
          String((it && it.title) || "").trim(),
          String((it && it.subject_name) || "").trim(),
        ]
          .filter(Boolean)
          .join(" | ");
        if (current && current === option.value) {
          option.selected = true;
        }
        tokenExamSelect.appendChild(option);
      });
      return items;
    }

    async function loadGuruEnrollSchoolsAndClasses() {
      if (
        GuruEnroll &&
        typeof GuruEnroll.loadSchoolsAndClasses === "function"
      ) {
        return GuruEnroll.loadSchoolsAndClasses();
      }
      return [];
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
        previewText: previewText,
        questionCodeLabel: questionCodeLabel,
        fillQuestionCodeSelect: fillQuestionCodeSelect,
        refreshStats: refreshGuruSummaryStats,
        activateGuruMenu: activateGuruMenu,
        examsPanel: examsPanel,
        examsRefreshBtn: examsRefreshBtn,
        examDialog: examDialog,
        examDialogOpenBtn: examDialogOpenBtn,
        examDialogTitle: examDialogTitle,
        examCancelBtn: examCancelBtn,
        examForm: examForm,
        examRandomizeQuestionsInput: examRandomizeQuestionsInput,
        examRandomizeOptionsInput: examRandomizeOptionsInput,
        examAllowNonRegularInput: examAllowNonRegularInput,
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
        examQuestionViewDialog: examQuestionViewDialog,
        examQuestionViewTitle: examQuestionViewTitle,
        examQuestionViewStimulus: examQuestionViewStimulus,
        examQuestionViewStem: examQuestionViewStem,
        examQuestionViewOptions: examQuestionViewOptions,
        examParticipantsDialog: examParticipantsDialog,
        examParticipantsSubtitle: examParticipantsSubtitle,
        examParticipantsSummary: examParticipantsSummary,
        examParticipantsBody: examParticipantsBody,
        onExamsLoaded: function (list) {
          if (
            GuruDashboard &&
            typeof GuruDashboard.onExamsLoaded === "function"
          ) {
            GuruDashboard.onExamsLoaded(list);
          }
        },
        onExamSelected: function (examID) {
          if (
            QuestionCodes &&
            typeof QuestionCodes.fillExamSelect === "function"
          ) {
            QuestionCodes.fillExamSelect(examID);
          }
          if (GuruResults && typeof GuruResults.selectExam === "function") {
            GuruResults.selectExam(examID);
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

    function initGuruEnrollModule() {
      if (!GuruEnroll || typeof GuruEnroll.init !== "function") return;
      GuruEnroll.init({
        api: api,
        beginBusy: beginBusy,
        setMsg: setMsg,
        msg: msg,
        escapeHtml: escapeHtml,
        fmtDate: fmtDate,
        refreshBtn: enrollRefreshBtn,
        examAssignForm: examAssignForm,
        assignExamIDInput: assignExamIDInput,
        assignSchoolSelect: assignSchoolSelect,
        assignClassSelect: assignClassSelect,
        assignScopeHint: assignScopeHint,
        examAssignmentsLoadBtn: examAssignmentsLoadBtn,
        examAssignmentsBody: examAssignmentsBody,
      });
    }

    function initQuestionCodesModule() {
      if (!QuestionCodes || typeof QuestionCodes.init !== "function") return;
      QuestionCodes.init({
        api: api,
        beginBusy: beginBusy,
        setMsg: setMsg,
        msg: msg,
        escapeHtml: escapeHtml,
        subjectLabel: subjectLabel,
        getSubjectsCache: getSubjectsCache,
        getManuscriptTargetSubjectID: getManuscriptTargetSubjectID,
        manuscriptQuestionCodeSelect: manuscriptQuestionCodeSelect,
        fillExamQuestionCodeSelectByExam: fillExamQuestionCodeSelectByExam,
        examQuestionCodeRuleExamIDInput: examQuestionCodeRuleExamIDInput,
        questionExamIDInput: questionExamIDInput,
        loadBlueprints: loadBlueprints,
        blueprintFilterSubjectSelect: blueprintFilterSubject,
      });
    }

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

    function initManuscriptTransferExportModule() {
      if (
        !GuruManuscript ||
        typeof GuruManuscript.initTransferExport !== "function"
      ) {
        return;
      }
      GuruManuscript.initTransferExport({
        api: api,
        beginBusy: beginBusy,
        setMsg: setMsg,
        msg: msg,
        escapeHtml: escapeHtml,
        loadSubjects: loadSubjects,
        loadTransferGuruOptions: loadTransferGuruOptions,
        loadTransferSubjectOptions: loadTransferSubjectOptions,
        collectManuscriptItems: collectManuscriptItems,
        manuscriptTransferBtn: manuscriptTransferBtn,
        manuscriptTransferDialog: manuscriptTransferDialog,
        manuscriptTransferForm: manuscriptTransferForm,
        manuscriptTransferOutput: manuscriptTransferOutput,
        manuscriptTransferSummary: manuscriptTransferSummary,
        manuscriptTransferCancelBtn: manuscriptTransferCancelBtn,
      });
    }

    function initManuscriptExportModule() {
      if (!manuscriptExportBtn) return;
      if (
        manuscriptExportBtn.dataset &&
        manuscriptExportBtn.dataset.bound === "1"
      ) {
        return;
      }
      if (manuscriptExportBtn.dataset) {
        manuscriptExportBtn.dataset.bound = "1";
      }
      manuscriptExportBtn.addEventListener("click", async function () {
        const items = collectManuscriptItems(true);
        if (!items.length) {
          setMsg("Tidak ada naskah yang bisa diekspor.");
          return;
        }
        const exportFormat = String(
          (manuscriptExportFormatInput &&
            manuscriptExportFormatInput.value) ||
            "csv",
        )
          .trim()
          .toLowerCase();
        if (typeof downloadCSV !== "function") {
          setMsg("Fitur export belum siap. Muat ulang halaman.");
          return;
        }
        const done = beginBusy(
          manuscriptExportBtn,
          msg,
          "Menyiapkan export naskah " + exportFormat.toUpperCase() + "...",
        );
        try {
          await downloadCSV(
            "/api/v1/questions/export?format=" +
              encodeURIComponent(exportFormat),
            { items: items },
            "naskah_soal." + exportFormat,
          );
          setMsg(
            "Export naskah " +
              exportFormat.toUpperCase() +
              " berhasil dibuat.",
          );
        } catch (err) {
          setMsg("Export naskah gagal: " + err.message);
        } finally {
          done();
        }
      });
    }

    function initGuruDashboardModule() {
      if (!GuruDashboard || typeof GuruDashboard.init !== "function") {
        return;
      }
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
          token: tokenPanel,
          enroll: enrollPanel,
          results: resultsPanel,
          "score-recap": resultsPanel,
          subjects: subjectsPanel,
          guide: guidePanel,
        },
        getMenuInfo: getGuruMenuInfo,
        onMenuActivated: async function (menuKey) {
          if (menuKey === "subjects") {
            refreshGuruSummaryStats();
            return;
          }
          if (menuKey === "dashboard") {
            loadGuruDashboardMonitor(false);
            return;
          }
          if (menuKey === "exams") {
            try {
              await Promise.all([
                loadGuruExamManageTable(),
                loadGuruExamSubjectOptions(),
              ]);
            } catch (_) {
              // error already surfaced by the module
            }
            return;
          }
          if (menuKey === "token") {
            try {
              await loadGuruTokenExamOptions();
            } catch (_) {
              // error already surfaced by the module
            }
            return;
          }
          if (menuKey === "enroll") {
            try {
              await Promise.all([
                loadGuruEnrollExamManageTable(),
                loadGuruEnrollSchoolsAndClasses(),
              ]);
            } catch (_) {
              // error already surfaced by the module
            }
            return;
          }
          if (menuKey === "results" || menuKey === "score-recap") {
            if (resultsViewModeField) {
              resultsViewModeField.hidden = menuKey === "score-recap";
            }
            if (resultsFinalSchemeField) {
              resultsFinalSchemeField.hidden = menuKey !== "score-recap";
            }
            if (resultsAttemptFilterField) {
              resultsAttemptFilterField.hidden = menuKey === "score-recap";
            }
            if (resultsAnalysisActions) {
              resultsAnalysisActions.hidden = menuKey === "score-recap";
            }
            if (resultsExtra) {
              resultsExtra.hidden = menuKey === "score-recap";
            }
            if (
              GuruResults &&
              typeof GuruResults.setViewMode === "function"
            ) {
              GuruResults.setViewMode(
                menuKey === "score-recap" ? "recap" : "attempt",
              );
            }
            try {
              await loadGuruResultExamOptions();
              if (
                GuruResults &&
                typeof GuruResults.reloadActiveView === "function"
              ) {
                await GuruResults.reloadActiveView();
              }
            } catch (_) {
              // error already surfaced by the module
            }
          }
        },
      });
    }

    function activateGuruMenu(key) {
      if (GuruDashboard && typeof GuruDashboard.activate === "function") {
        GuruDashboard.activate(key);
      }
    }

    function initGuruManuscriptModule() {
      if (!GuruManuscript || typeof GuruManuscript.init !== "function") {
        return;
      }
      GuruManuscript.init({
        api: api,
        beginBusy: beginBusy,
        setMsg: setMsg,
        setLocalMsg: setManuscriptMsg,
        msg: msg,
        text: text,
        escapeHtml: escapeHtml,
        createQuillEditor: createQuillEditor,
        getQuillHTML: getQuillHTML,
        getCurrentQuestionType: getCurrentManuscriptQuestionType,
        getCurrentManuscriptQuestionType: getCurrentManuscriptQuestionType,
        syncManuscriptSubjectState: syncManuscriptSubjectState,
        fillLearningGoalSelect: fillLearningGoalSelect,
        fillQuestionCodeSelect: fillQuestionCodeSelect,
        ensureQuestionForSubmission: ensureQuestionForManuscriptSubmission,
        ensureQuestionForManuscriptSubmission:
          ensureQuestionForManuscriptSubmission,
        findQuestionByID: findQuestionByID,
        loadBlueprints: loadBlueprints,
        fillBlueprintSelect: fillBlueprintSelect,
        resolveQuestionType: resolveManuscriptQuestionType,
        resolveQuestionCode: resolveManuscriptQuestionCode,
        resolveLearningGoal: resolveManuscriptLearningGoal,
        shortQuestionType: shortQuestionType,
        loadAllManuscriptVersionsFromBlueprints:
          loadAllManuscriptVersionsFromBlueprints,
        reloadManuscriptsByCurrentTableScope:
          reloadManuscriptsByCurrentTableScope,
        reloadManuscriptsByQuestionID: reloadManuscriptsByQuestionID,
        renderManuscripts: renderManuscripts,
        manuscriptForm: manuscriptForm,
        manuscriptQuestionSelect: manuscriptQuestionSelect,
        manuscriptQuestionCodeSelect: manuscriptQuestionCodeSelect,
        manuscriptSubjectSelect: manuscriptSubjectSelect,
        manuscriptLearningGoalSelect: manuscriptLearningGoalSelect,
        manuscriptQuestionTypeUI: manuscriptQuestionTypeUI,
        manuscriptStimulusGroupSelect: manuscriptStimulusGroupSelect,
        manuscriptStimulusGroupInfo: manuscriptStimulusGroupInfo,
        manuscriptStimulusGroupStatus: manuscriptStimulusGroupStatus,
        manuscriptStimulusGroupQuickActions:
          manuscriptStimulusGroupQuickActions,
        manuscriptStimulusGroupRefreshBtn: manuscriptStimulusGroupRefreshBtn,
        manuscriptStimulusGroupCreateBtn: manuscriptStimulusGroupCreateBtn,
        manuscriptStimulusGroupClearBtn: manuscriptStimulusGroupClearBtn,
        manuscriptStimulusEditor: manuscriptStimulusEditor,
        manuscriptStimulusType: manuscriptStimulusType,
        manuscriptStimulusSinglePanel: manuscriptStimulusSinglePanel,
        manuscriptStimulusMultiteksPanel: manuscriptStimulusMultiteksPanel,
        manuscriptStimulusTabsWrap: manuscriptStimulusTabsWrap,
        manuscriptAddStimulusTabBtn: manuscriptAddStimulusTabBtn,
        manuscriptStemEditor: manuscriptStemEditor,
        manuscriptExplanationEditor: manuscriptExplanationEditor,
        manuscriptHintEditor: manuscriptHintEditor,
        manuscriptStimulusHTMLInput: manuscriptStimulusHTMLInput,
        manuscriptStemHTMLInput: manuscriptStemHTMLInput,
        manuscriptExplanationHTMLInput: manuscriptExplanationHTMLInput,
        manuscriptHintHTMLInput: manuscriptHintHTMLInput,
        manuscriptOptionsPanel: manuscriptOptionsPanel,
        manuscriptOptionsWrap: manuscriptOptionsWrap,
        manuscriptOptionLayout: manuscriptOptionLayout,
        manuscriptOptionComparisonFields: manuscriptOptionComparisonFields,
        manuscriptOptionLeftLabel: manuscriptOptionLeftLabel,
        manuscriptOptionRightLabel: manuscriptOptionRightLabel,
        manuscriptAddOptionBtn: manuscriptAddOptionBtn,
        manuscriptAddOptionBtnBottom: manuscriptAddOptionBtnBottom,
        manuscriptKeyMC: manuscriptKeyMC,
        manuscriptKeyMR: manuscriptKeyMR,
        manuscriptKeyMCOptions: manuscriptKeyMCOptions,
        manuscriptKeyMROptions: manuscriptKeyMROptions,
        manuscriptKeyTF: manuscriptKeyTF,
        manuscriptKeyMatch: manuscriptKeyMatch,
        manuscriptKeyShortAnswer: manuscriptKeyShortAnswer,
        manuscriptStatementsWrap: manuscriptStatementsWrap,
        manuscriptAddStatementBtn: manuscriptAddStatementBtn,
        manuscriptAddStatementBtnBottom: manuscriptAddStatementBtnBottom,
        manuscriptMatchPromptsWrap: manuscriptMatchPromptsWrap,
        manuscriptMatchChoicesWrap: manuscriptMatchChoicesWrap,
        manuscriptMatchPairsWrap: manuscriptMatchPairsWrap,
        manuscriptAddMatchPromptBtn: manuscriptAddMatchPromptBtn,
        manuscriptAddMatchChoiceBtn: manuscriptAddMatchChoiceBtn,
        manuscriptSyncMatchPairsBtn: manuscriptSyncMatchPairsBtn,
        manuscriptMatchNoteHTML: manuscriptMatchNoteHTML,
        manuscriptShortAnswerAccepted: manuscriptShortAnswerAccepted,
        manuscriptShortAnswerPlaceholder: manuscriptShortAnswerPlaceholder,
        manuscriptShortAnswerInputType: manuscriptShortAnswerInputType,
        manuscriptShortAnswerMaxLength: manuscriptShortAnswerMaxLength,
        manuscriptAnswerKeyRaw: manuscriptAnswerKeyRaw,
        manuscriptEditingVersionNoInput: manuscriptEditingVersionNoInput,
        manuscriptSubmitBtn: manuscriptSubmitBtn,
        manuscriptCancelEditBtn: manuscriptCancelEditBtn,
        manuscriptPreviewDialog: manuscriptPreviewDialog,
        manuscriptPreviewTitle: manuscriptPreviewTitle,
        manuscriptPreviewContent: manuscriptPreviewContent,
        manuscriptRefreshBtn: manuscriptRefreshBtn,
        manuscriptFormMessage: manuscriptFormMessage,
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
        resultsViewMode: resultsViewMode,
        resultsFinalScheme: resultsFinalScheme,
        resultsAttemptFilter: resultsAttemptFilter,
        resultsClassFilter: resultsClassFilter,
        resultsSchoolFilter: resultsSchoolFilter,
        resultsAssignmentBody: resultsAssignmentBody,
        resultsMatrixHead: resultsMatrixHead,
        resultsAttemptWrap: resultsAttemptWrap,
        resultsRecapWrap: resultsRecapWrap,
        resultsRecapBody: resultsRecapBody,
        scoreRecapDetailDialog: scoreRecapDetailDialog,
        scoreRecapDetailSubtitle: scoreRecapDetailSubtitle,
        scoreRecapDetailSummary: scoreRecapDetailSummary,
        scoreRecapDetailBody: scoreRecapDetailBody,
        resultsPageInfo: resultsPageInfo,
        resultsPrevBtn: resultsPrevBtn,
        resultsNextBtn: resultsNextBtn,
        resultsPageSizeSelect: resultsPageSizeSelect,
        resultsSummary: resultsSummary,
        resultsExtra: resultsExtra,
        resultsReportBtn: resultsReportBtn,
        resultsStatsBtn: resultsStatsBtn,
        resultsChartBtn: resultsChartBtn,
        resultsExportBtn: resultsExportBtn,
        itemAnalysisBtn: itemAnalysisBtn,
        learningGoalBtn: learningGoalBtn,
        itemAnalysisDialog: itemAnalysisDialog,
        itemAnalysisBody: itemAnalysisBody,
        itemAnalysisSummary: itemAnalysisSummary,
        itemAnalysisIdentity: itemAnalysisIdentity,
        itemAnalysisFilter: itemAnalysisFilter,
        itemAnalysisFilterNo: itemAnalysisFilterNo,
        itemAnalysisFilterTypeHead: itemAnalysisFilterTypeHead,
        itemAnalysisFilterQuestion: itemAnalysisFilterQuestion,
        itemAnalysisFilterValidity: itemAnalysisFilterValidity,
        itemAnalysisFilterStatus: itemAnalysisFilterStatus,
        itemAnalysisDetail: itemAnalysisDetail,
        itemAnalysisSubtitle: itemAnalysisSubtitle,
        itemAnalysisExportBtn: itemAnalysisExportBtn,
        itemAnalysisPrintBtn: itemAnalysisPrintBtn,
        learningGoalDialog: learningGoalDialog,
        learningGoalBody: learningGoalAnalysisBody,
        learningGoalSummary: learningGoalAnalysisSummary,
        learningGoalIdentity: learningGoalAnalysisIdentity,
        learningGoalDetail: learningGoalAnalysisDetail,
        learningGoalSubtitle: learningGoalAnalysisSubtitle,
        learningGoalExportBtn: learningGoalAnalysisExportBtn,
        learningGoalPrintBtn: learningGoalAnalysisPrintBtn,
        learningGoalKKTP: learningGoalAnalysisKKTP,
        learningGoalStudentDialog: learningGoalStudentDialog,
        learningGoalStudentBody: learningGoalStudentBody,
        learningGoalStudentSummary: learningGoalStudentSummary,
        learningGoalStudentIdentity: learningGoalStudentIdentity,
        learningGoalStudentDetail: learningGoalStudentDetail,
        learningGoalStudentSubtitle: learningGoalStudentSubtitle,
        learningGoalStudentKKTP: learningGoalStudentKKTP,
        meOrNull: meOrNull,
        refreshExams: loadGuruResultExamOptions,
      });
    }

    function initGuruTokenModule() {
      if (!ProktorToken || typeof ProktorToken.init !== "function") return;
      ProktorToken.init({
        api: api,
        beginBusy: beginBusy,
        setMsg: setMsg,
        msg: msg,
        text: text,
        escapeHtml: escapeHtml,
        fmtDate: fmtDate,
        storageKey: "cbtlms.guru.activeExamTokens",
        emptyStateText: "Belum ada token aktif untuk ujian Anda.",
        tokenForm: tokenForm,
        tokenExamSelect: tokenExamSelect,
        tokenTTLInput: tokenTTLInput,
        tokenResult: tokenResult,
        tokenListBody: tokenListBody,
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
      const buildTokenDesc = function () {
        if (!tokenExamSelect) {
          return "Buat dan kirim token untuk ujian yang Anda kelola.";
        }
        const total = Math.max((tokenExamSelect.options || []).length - 1, 0);
        return buildGuruCountDesc(
          "Buat dan kirim token untuk ujian yang Anda buat sendiri.",
          "ujian siap token",
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
        token: {
          title: "Token Ujian",
          desc: buildTokenDesc(),
        },
        enroll: {
          title: "Enroll Peserta",
          desc: "Enroll peserta ke ujian Anda per kelas.",
        },
        results: {
          title: "Hasil Ujian",
          desc: buildResultsDesc(),
        },
        "score-recap": {
          title: "Rekap Nilai",
          desc:
            "Lihat nilai akhir per peserta berdasarkan skema nilai yang dipilih.",
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

    async function reloadManuscriptsByCurrentTableScope(fallbackQuestionID) {
      if (
        ManuscriptTable &&
        typeof ManuscriptTable.reloadByCurrentScope === "function"
      ) {
        return ManuscriptTable.reloadByCurrentScope(fallbackQuestionID);
      }
    }

    async function reloadManuscriptsByQuestionID(questionID) {
      if (
        ManuscriptTable &&
        typeof ManuscriptTable.reloadByQuestionID === "function"
      ) {
        return ManuscriptTable.reloadByQuestionID(questionID);
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
      const dashboardStats = await api("/api/v1/admin/dashboard/stats", "GET");
      guruUniqueParticipantCount = Number(
        (dashboardStats && dashboardStats.unique_participant_count) || 0,
      );
      guruCompletedExamCount = Number(
        (dashboardStats && dashboardStats.completed_exam_count) || 0,
      );
      guruInProgressCount = Number(
        (dashboardStats && dashboardStats.in_progress_count) || 0,
      );
      guruRegularParticipantCount = Number(
        (dashboardStats && dashboardStats.regular_participant_count) || 0,
      );
      guruNonRegularParticipantCount = Number(
        (dashboardStats && dashboardStats.non_regular_participant_count) || 0,
      );
      await Promise.all([
        loadEducationLevelsForGuruSubjectForm(),
        loadSubjects(),
        loadLearningGoals(),
        loadClassesForLearningGoal(),
        loadGuruExamSubjectOptions(),
        loadGuruExamManageTable(),
        loadGuruTokenExamOptions(),
        loadGuruResultExamOptions(),
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
      refreshGuruSummaryStats();
      await loadGuruDashboardMonitor(true);
    }

    initGuruSubjectsModule();
    initLearningGoalsModule();
    initGuruBlueprintsModule();
    initBlueprintsModule();
    initQuestionCodesModule();
    initManuscriptImportModule();
    initManuscriptTransferExportModule();
    initManuscriptExportModule();
    initGuruExamsModule();
    initGuruTokenModule();
    initGuruEnrollModule();
    initGuruResultsModule();
    initGuruDashboardModule();
    updateDashboardGreeting();
    applyGuruSidebarCollapsed(loadGuruSidebarCollapsed());
    if (guruSidebarToggleBtn) {
      guruSidebarToggleBtn.addEventListener("click", function () {
        const nextCollapsed = !root.classList.contains(
          "guru-sidebar-collapsed",
        );
        applyGuruSidebarCollapsed(nextCollapsed);
        saveGuruSidebarCollapsed(nextCollapsed);
      });
    }
    if (dashboardMonitorRefreshBtn) {
      dashboardMonitorRefreshBtn.addEventListener("click", function () {
        loadGuruDashboardMonitor(true);
      });
    }
    if (dashboardMonitorExamFilter) {
      dashboardMonitorExamFilter.addEventListener("change", function () {
        applyDashboardMonitorView();
      });
    }
    if (dashboardMonitorIdleThreshold) {
      dashboardMonitorIdleThreshold.value = loadSavedDashboardIdleThreshold();
      dashboardMonitorIdleThreshold.addEventListener("change", function () {
        dashboardMonitorIdleThreshold.value = saveDashboardIdleThreshold(
          dashboardMonitorIdleThreshold.value,
        );
        loadGuruDashboardMonitor(true);
      });
    }
    scheduleGuruDashboardMonitor();
    initGuruManuscriptModule();
    initManuscriptTableModule();

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

  window.AppPages = window.AppPages || {};
  window.AppPages.initGuruPage = initGuruPage;
})();
