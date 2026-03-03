(function () {
  var deps = null;
  var cache = [];

  function setDeps(opts) {
    deps = opts || {};
  }

  function label(it) {
    const title = String((it && it.title) || "").trim();
    const subject = String((it && it.subject_name) || "").trim();
    const code = String((it && it.question_code) || "").trim();
    if (!title && !subject) return String((it && it.id) || "");
    if (!subject) return title;
    if (!title) return "#" + String((it && it.id) || "") + " - " + subject;
    const base =
      "#" + String((it && it.id) || "") + " - " + title + " (" + subject + ")";
    if (!code) return base;
    return base + " [" + code + "]";
  }

  function getCache() {
    return Array.isArray(cache) ? cache : [];
  }

  function findByID(questionID) {
    return (Array.isArray(cache) ? cache : []).find(function (it) {
      return Number((it && it.id) || 0) === Number(questionID || 0);
    });
  }

  function getCurrentManuscriptQuestionType() {
    if (!deps || !deps.manuscriptQuestionSelect) return "";
    const questionID = Number(
      (deps.manuscriptQuestionSelect && deps.manuscriptQuestionSelect.value) ||
        0,
    );
    const item = findByID(questionID);
    return String((item && item.question_type) || "")
      .trim()
      .toLowerCase();
  }

  function fillSelect(selectEl) {
    if (!selectEl) return;
    const current = String(selectEl.value || "");
    selectEl.innerHTML = "";
    const firstOpt = document.createElement("option");
    firstOpt.value = "";
    firstOpt.textContent = "Pilih Soal";
    selectEl.appendChild(firstOpt);
    cache.forEach(function (it) {
      const opt = document.createElement("option");
      opt.value = String(it.id || "");
      opt.textContent = label(it);
      if (current && current === String(it.id || "")) opt.selected = true;
      selectEl.appendChild(opt);
    });
    if (deps && selectEl === deps.manuscriptQuestionSelect) {
      if (!selectEl.value && selectEl.options.length > 1) {
        selectEl.selectedIndex = 1;
      }
    }
  }

  function syncManuscriptSubjectState() {
    if (!deps || !deps.manuscriptSubjectSelect) return;
    const selectedQuestionID = Number(
      (deps.manuscriptQuestionSelect && deps.manuscriptQuestionSelect.value) ||
        0,
    );
    const selectedQuestion = findByID(selectedQuestionID);
    const questionSubjectID = Number(
      (selectedQuestion && selectedQuestion.subject_id) || 0,
    );
    if (questionSubjectID > 0) {
      deps.manuscriptSubjectSelect.value = String(questionSubjectID);
      deps.manuscriptSubjectSelect.disabled = true;
      if (typeof deps.fillLearningGoalSelect === "function") {
        deps.fillLearningGoalSelect(
          deps.manuscriptLearningGoalSelect,
          questionSubjectID,
        );
      }
      const selectedQuestionGoalID = Number(
        (selectedQuestion && selectedQuestion.learning_goal_id) || 0,
      );
      if (selectedQuestionGoalID > 0 && deps.manuscriptLearningGoalSelect) {
        deps.manuscriptLearningGoalSelect.value = String(
          selectedQuestionGoalID,
        );
      }
      if (typeof deps.fillQuestionCodeSelect === "function") {
        deps.fillQuestionCodeSelect(
          deps.manuscriptQuestionCodeSelect,
          questionSubjectID,
          true,
        );
      }
      if (deps.manuscriptQuestionCodeSelect) {
        deps.manuscriptQuestionCodeSelect.value = String(
          Number(
            (selectedQuestion && selectedQuestion.question_code_id) || 0,
          ) || "",
        );
        deps.manuscriptQuestionCodeSelect.disabled = false;
      }
      return;
    }
    deps.manuscriptSubjectSelect.disabled = false;
    if (typeof deps.fillLearningGoalSelect === "function") {
      deps.fillLearningGoalSelect(
        deps.manuscriptLearningGoalSelect,
        Number(
          (deps.manuscriptSubjectSelect &&
            deps.manuscriptSubjectSelect.value) ||
            0,
        ),
      );
    }
    if (deps.manuscriptLearningGoalSelect) {
      deps.manuscriptLearningGoalSelect.disabled = false;
    }
    if (typeof deps.fillQuestionCodeSelect === "function") {
      deps.fillQuestionCodeSelect(
        deps.manuscriptQuestionCodeSelect,
        Number(
          (deps.manuscriptSubjectSelect &&
            deps.manuscriptSubjectSelect.value) ||
            0,
        ),
        true,
      );
    }
    if (deps.manuscriptQuestionCodeSelect) {
      deps.manuscriptQuestionCodeSelect.disabled = false;
    }
  }

  function getManuscriptTargetSubjectID() {
    const selectedQuestionID = Number(
      (deps && deps.manuscriptQuestionSelect
        ? deps.manuscriptQuestionSelect.value
        : 0) || 0,
    );
    const selectedQuestion = findByID(selectedQuestionID);
    const questionSubjectID = Number(
      (selectedQuestion && selectedQuestion.subject_id) || 0,
    );
    if (questionSubjectID > 0) return questionSubjectID;
    return Number(
      (deps && deps.manuscriptSubjectSelect
        ? deps.manuscriptSubjectSelect.value
        : 0) || 0,
    );
  }

  function getManuscriptTargetLearningGoalID() {
    const selectedQuestionID = Number(
      (deps && deps.manuscriptQuestionSelect
        ? deps.manuscriptQuestionSelect.value
        : 0) || 0,
    );
    const selectedQuestion = findByID(selectedQuestionID);
    const questionGoalID = Number(
      (selectedQuestion && selectedQuestion.learning_goal_id) || 0,
    );
    if (questionGoalID > 0) return questionGoalID;
    return Number(
      (deps && deps.manuscriptLearningGoalSelect
        ? deps.manuscriptLearningGoalSelect.value
        : 0) || 0,
    );
  }

  function resolveManuscriptQuestionType(item) {
    if (!item) return "";
    if (item.question_type) return String(item.question_type || "");
    const qid = Number(item.question_id || 0);
    if (qid > 0 && Array.isArray(cache)) {
      const found = cache.find(function (q) {
        return Number((q && q.id) || 0) === qid;
      });
      if (found && found.question_type) return String(found.question_type);
    }
    return "";
  }

  function resolveManuscriptQuestionCode(item) {
    if (!item) return "";
    const qid = Number(item.question_id || 0);
    if (qid > 0 && Array.isArray(cache)) {
      const found = cache.find(function (q) {
        return Number((q && q.id) || 0) === qid;
      });
      if (found && deps && typeof deps.questionCodeLabel === "function") {
        return deps.questionCodeLabel(found);
      }
    }
    return "";
  }

  function resolveManuscriptLearningGoal(item) {
    if (!item) return "";
    const qid = Number(item.question_id || 0);
    if (qid > 0 && Array.isArray(cache)) {
      const found = cache.find(function (q) {
        return Number((q && q.id) || 0) === qid;
      });
      if (found && found.learning_goal_id) {
        if (
          deps &&
          typeof deps.findLearningGoalByID === "function" &&
          typeof deps.learningGoalLabel === "function"
        ) {
          const goal = deps.findLearningGoalByID(found.learning_goal_id);
          if (goal) return deps.learningGoalLabel(goal);
        }
      }
    }
    return "";
  }

  function render(items) {
    if (!deps || !deps.blueprintBody) return;
    if (!Array.isArray(items) || items.length === 0) {
      deps.blueprintBody.innerHTML =
        '<tr><td colspan="8" class="muted">Tidak ada data kisi-kisi.</td></tr>';
      return;
    }
    deps.blueprintBody.innerHTML = "";
    items.forEach(function (it) {
      const tr = document.createElement("tr");
      tr.innerHTML = [
        "<td>" + deps.escapeHtml(String(it.id || "")) + "</td>",
        "<td>" + deps.escapeHtml(String(it.subject_name || "")) + "</td>",
        "<td>" +
          deps.escapeHtml(deps.shortQuestionType(it.question_type)) +
          "</td>",
        "<td>" + deps.escapeHtml(String(it.title || "-")) + "</td>",
        "<td>" + deps.escapeHtml(String(it.indicator || "-")) + "</td>",
        "<td>" + deps.escapeHtml(String(it.material || "-")) + "</td>",
        "<td>" + deps.escapeHtml(String(it.cognitive_level || "-")) + "</td>",
        "<td>" + deps.escapeHtml(deps.fmtDate(it.created_at)) + "</td>",
      ].join("");
      deps.blueprintBody.appendChild(tr);
    });
  }

  async function loadAllManuscriptVersions() {
    const qids = Array.from(
      new Set(
        (Array.isArray(cache) ? cache : [])
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
        return deps.api("/api/v1/questions/" + qid + "/versions", "GET");
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

  async function load(subjectID) {
    const id = Number(subjectID || 0);
    const params = new URLSearchParams();
    if (id > 0) params.set("subject_id", String(id));
    if (
      deps &&
      typeof deps.isOwnerOnlyQuestionsEnabled === "function" &&
      deps.isOwnerOnlyQuestionsEnabled()
    ) {
      params.set("owner_only", "true");
    }
    const qs = params.toString() ? "?" + params.toString() : "";
    const items = await deps.api("/api/v1/questions" + qs, "GET");
    cache = Array.isArray(items) ? items : [];
    render(cache);
    if (deps && deps.manuscriptQuestionSelect) {
      fillSelect(deps.manuscriptQuestionSelect);
    }
    syncManuscriptSubjectState();
    if (deps && typeof deps.applyManuscriptTypeUI === "function") {
      deps.applyManuscriptTypeUI(true);
    }
    return cache;
  }

  function bindHandlers() {
    if (!deps) return;
    if (deps.blueprintForm) {
      deps.blueprintForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(deps.blueprintForm);
        const done = deps.beginBusy(
          deps.blueprintForm,
          deps.msg,
          "Menyimpan kisi-kisi...",
        );
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
          await deps.api("/api/v1/questions", "POST", payload);
          await load(
            Number(
              (deps.blueprintFilterSubject &&
                deps.blueprintFilterSubject.value) ||
                0,
            ),
          );
          deps.blueprintForm.reset();
          if (typeof deps.fillSubjectSelect === "function") {
            deps.fillSubjectSelect(deps.blueprintSubjectSelect, false);
          }
          deps.setMsg("Kisi-kisi berhasil disimpan.");
        } catch (err) {
          deps.setMsg("Simpan kisi-kisi gagal: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (deps.blueprintFilterForm) {
      deps.blueprintFilterForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const done = deps.beginBusy(
          deps.blueprintFilterForm,
          deps.msg,
          "Memuat kisi-kisi...",
        );
        try {
          await load(
            Number(
              (deps.blueprintFilterSubject &&
                deps.blueprintFilterSubject.value) ||
                0,
            ),
          );
          deps.setMsg("Data kisi-kisi berhasil dimuat.");
        } catch (err) {
          deps.setMsg("Gagal memuat kisi-kisi: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (deps.blueprintRefreshBtn) {
      deps.blueprintRefreshBtn.addEventListener("click", async function () {
        const done = deps.beginBusy(
          deps.blueprintRefreshBtn,
          deps.msg,
          "Muat ulang kisi-kisi...",
        );
        try {
          await load(
            Number(
              (deps.blueprintFilterSubject &&
                deps.blueprintFilterSubject.value) ||
                0,
            ),
          );
          deps.setMsg("Kisi-kisi berhasil dimuat ulang.");
        } catch (err) {
          deps.setMsg("Gagal muat ulang kisi-kisi: " + err.message);
        } finally {
          done();
        }
      });
    }
  }

  function init(opts) {
    setDeps(opts);
    bindHandlers();
  }

  window.Blueprints = {
    init: init,
    getCache: getCache,
    label: label,
    findByID: findByID,
    getCurrentManuscriptQuestionType: getCurrentManuscriptQuestionType,
    fillSelect: fillSelect,
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
