(function () {
  var deps = null;

  function setDeps(opts) {
    deps = opts || {};
  }

  function bp() {
    return (deps && deps.blueprints) || window.Blueprints || {};
  }

  function label(it) {
    const mod = bp();
    if (mod && typeof mod.label === "function") return mod.label(it);
    return "-";
  }

  function fillSelect(selectEl) {
    const mod = bp();
    if (mod && typeof mod.fillSelect === "function") {
      mod.fillSelect(selectEl);
    }
  }

  function getCurrentManuscriptQuestionType() {
    const mod = bp();
    if (mod && typeof mod.getCurrentManuscriptQuestionType === "function") {
      return mod.getCurrentManuscriptQuestionType();
    }
    return "";
  }

  function findByID(id) {
    const mod = bp();
    if (mod && typeof mod.findByID === "function") return mod.findByID(id);
    return null;
  }

  function syncManuscriptSubjectState() {
    const mod = bp();
    if (mod && typeof mod.syncManuscriptSubjectState === "function") {
      return mod.syncManuscriptSubjectState();
    }
  }

  function getManuscriptTargetSubjectID() {
    const mod = bp();
    if (mod && typeof mod.getManuscriptTargetSubjectID === "function") {
      return mod.getManuscriptTargetSubjectID();
    }
    return 0;
  }

  function getManuscriptTargetLearningGoalID() {
    const mod = bp();
    if (mod && typeof mod.getManuscriptTargetLearningGoalID === "function") {
      return mod.getManuscriptTargetLearningGoalID();
    }
    return 0;
  }

  function resolveManuscriptQuestionType(item) {
    const mod = bp();
    if (mod && typeof mod.resolveManuscriptQuestionType === "function") {
      return mod.resolveManuscriptQuestionType(item);
    }
    return "";
  }

  function resolveManuscriptQuestionCode(item) {
    const mod = bp();
    if (mod && typeof mod.resolveManuscriptQuestionCode === "function") {
      return mod.resolveManuscriptQuestionCode(item);
    }
    return "";
  }

  function resolveManuscriptLearningGoal(item) {
    const mod = bp();
    if (mod && typeof mod.resolveManuscriptLearningGoal === "function") {
      return mod.resolveManuscriptLearningGoal(item);
    }
    return "";
  }

  async function loadAllManuscriptVersions() {
    const mod = bp();
    if (mod && typeof mod.loadAllManuscriptVersions === "function") {
      return mod.loadAllManuscriptVersions();
    }
    return [];
  }

  async function load(subjectID) {
    const mod = bp();
    if (mod && typeof mod.load === "function") {
      return mod.load(subjectID);
    }
    return [];
  }

  function init(opts) {
    setDeps(opts);
  }

  window.GuruBlueprints = {
    init: init,
    label: label,
    fillSelect: fillSelect,
    getCurrentManuscriptQuestionType: getCurrentManuscriptQuestionType,
    findByID: findByID,
    syncManuscriptSubjectState: syncManuscriptSubjectState,
    getManuscriptTargetSubjectID: getManuscriptTargetSubjectID,
    getManuscriptTargetLearningGoalID: getManuscriptTargetLearningGoalID,
    resolveManuscriptQuestionType: resolveManuscriptQuestionType,
    resolveManuscriptQuestionCode: resolveManuscriptQuestionCode,
    resolveManuscriptLearningGoal: resolveManuscriptLearningGoal,
    loadAllManuscriptVersions: loadAllManuscriptVersions,
    load: load,
  };
})();
