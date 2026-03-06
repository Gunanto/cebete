(function () {
  var deps = null;
  var manuscriptStimulusQuill = null;
  var manuscriptStemQuill = null;
  var manuscriptExplanationQuill = null;
  var manuscriptHintQuill = null;
  var manuscriptOptionQuillByRow = new WeakMap();
  var currentManuscriptQuestionType = "";
  var manuscriptEditingQuestionID = 0;
  var manuscriptEditSnapshot = null;

  function setDeps(opts) {
    deps = opts || {};
  }

  function getQuillHTML(quill) {
    if (!deps || typeof deps.getQuillHTML !== "function") return "";
    return deps.getQuillHTML(quill);
  }

  function setMsg(value) {
    if (deps && typeof deps.setMsg === "function") deps.setMsg(value);
  }

  function syncHiddenInputs() {
    if (!deps) return;
    if (deps.manuscriptStimulusHTMLInput) {
      deps.manuscriptStimulusHTMLInput.value = getQuillHTML(
        manuscriptStimulusQuill,
      );
    }
    if (deps.manuscriptStemHTMLInput) {
      deps.manuscriptStemHTMLInput.value = getQuillHTML(manuscriptStemQuill);
    }
    if (deps.manuscriptExplanationHTMLInput) {
      deps.manuscriptExplanationHTMLInput.value = getQuillHTML(
        manuscriptExplanationQuill,
      );
    }
    if (deps.manuscriptHintHTMLInput) {
      deps.manuscriptHintHTMLInput.value = getQuillHTML(manuscriptHintQuill);
    }
  }

  function resetEditors() {
    if (manuscriptStimulusQuill) manuscriptStimulusQuill.setContents([]);
    if (manuscriptStemQuill) manuscriptStemQuill.setContents([]);
    if (manuscriptExplanationQuill) manuscriptExplanationQuill.setContents([]);
    if (manuscriptHintQuill) manuscriptHintQuill.setContents([]);
    syncHiddenInputs();
  }

  function createOptionRow(data, idx) {
    if (!deps || typeof deps.escapeHtml !== "function") return "";
    const key =
      String((data && data.option_key) || "").trim() ||
      String.fromCharCode(65 + idx);
    const htmlValue = String((data && data.option_html) || "").trim();
    return (
      '<div class="panel mt" data-option-row="1">' +
      '<label>Kode Opsi<input type="text" data-option-key value="' +
      deps.escapeHtml(key) +
      '" placeholder="A" maxlength="10" /></label>' +
      '<label class="mt">Konten Opsi</label>' +
      '<div class="quill-editor-shell mt"><div class="manuscript-option-editor"></div></div>' +
      '<input type="hidden" data-option-html value="' +
      deps.escapeHtml(htmlValue) +
      '" />' +
      '<button type="button" class="btn btn-secondary btn-inline mt" data-option-remove="1">Hapus Opsi</button>' +
      "</div>"
    );
  }

  function bindOptionEditor(row) {
    if (!row || manuscriptOptionQuillByRow.has(row) || !window.Quill) return;
    if (!deps || typeof deps.createQuillEditor !== "function") return;
    const host = row.querySelector(".manuscript-option-editor");
    const hidden = row.querySelector("[data-option-html]");
    if (!host || !hidden) return;
    const initialHTML = String(hidden.value || "").trim();
    const quill = deps.createQuillEditor(host, "Isi opsi jawaban...", {
      defaultFontSize: "12pt",
    });
    if (!quill) return;
    if (initialHTML) {
      quill.clipboard.dangerouslyPasteHTML(initialHTML);
    }
    hidden.value = getQuillHTML(quill);
    quill.on("text-change", function () {
      hidden.value = getQuillHTML(quill);
      syncAnswerKeyPreview();
    });
    manuscriptOptionQuillByRow.set(row, quill);
  }

  function bindOptionEditors() {
    if (!deps || !deps.manuscriptOptionsWrap) return;
    deps.manuscriptOptionsWrap
      .querySelectorAll("[data-option-row]")
      .forEach(function (row) {
        bindOptionEditor(row);
      });
  }

  function ensureOptionRows() {
    if (!deps || !deps.manuscriptOptionsWrap) return;
    if (!deps.manuscriptOptionsWrap.querySelector("[data-option-row]")) {
      deps.manuscriptOptionsWrap.innerHTML =
        createOptionRow({ option_key: "A", option_html: "" }, 0) +
        createOptionRow({ option_key: "B", option_html: "" }, 1);
    }
    bindOptionEditors();
  }

  function collectOptions() {
    const rows = Array.from(
      (deps &&
        deps.manuscriptOptionsWrap &&
        deps.manuscriptOptionsWrap.querySelectorAll("[data-option-row]")) ||
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

  function validateOptions(options) {
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
        throw new Error("Kode opsi baris " + String(idx + 1) + " wajib diisi.");
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

  function renderKeyChoices() {
    if (!deps || !deps.manuscriptKeyMCOptions || !deps.manuscriptKeyMROptions)
      return;
    const options = collectOptions();
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
    deps.manuscriptKeyMCOptions.innerHTML = "";
    deps.manuscriptKeyMROptions.innerHTML = "";
    options.forEach(function (it, idx) {
      const key = String((it && it.option_key) || "")
        .trim()
        .toUpperCase();
      const label = key || "Opsi " + String(idx + 1);
      const mcRow = document.createElement("label");
      mcRow.className = "option-row";
      mcRow.innerHTML =
        '<input type="radio" name="manuscript_mc_key" value="' +
        deps.escapeHtml(key) +
        '" ' +
        ((mcKey ? mcKey === key : idx === 0) ? "checked" : "") +
        ">" +
        "<div>" +
        deps.escapeHtml(label) +
        "</div>";
      deps.manuscriptKeyMCOptions.appendChild(mcRow);

      const mrRow = document.createElement("label");
      mrRow.className = "option-row";
      mrRow.innerHTML =
        '<input type="checkbox" name="manuscript_mr_key" value="' +
        deps.escapeHtml(key) +
        '" ' +
        (mrChecked.includes(key) ? "checked" : "") +
        ">" +
        "<div>" +
        deps.escapeHtml(label) +
        "</div>";
      deps.manuscriptKeyMROptions.appendChild(mrRow);
    });
  }

  function createTFStatementRow(data, idx) {
    if (!deps || typeof deps.escapeHtml !== "function") return "";
    const id = String((data && data.id) || "S" + String(idx + 1)).trim();
    const statement = String((data && data.statement) || "").trim();
    const correct = !!(data && data.correct);
    return (
      '<div class="panel mt" data-statement-row="1">' +
      '<label>ID Pernyataan<input type="text" data-statement-id value="' +
      deps.escapeHtml(id) +
      '" placeholder="S1" /></label>' +
      '<label class="mt">Teks Pernyataan<input type="text" data-statement-text value="' +
      deps.escapeHtml(statement) +
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
    if (!deps || !deps.manuscriptStatementsWrap) return;
    if (!deps.manuscriptStatementsWrap.querySelector("[data-statement-row]")) {
      deps.manuscriptStatementsWrap.innerHTML = createTFStatementRow(
        { id: "S1", statement: "", correct: true },
        0,
      );
    }
  }

  function collectAnswerKey() {
    const qType = String(currentManuscriptQuestionType || "").toLowerCase();
    if (qType === "pg_tunggal") {
      renderKeyChoices();
      const checked = document.querySelector(
        'input[name="manuscript_mc_key"]:checked',
      );
      const correct = String((checked && checked.value) || "").trim();
      if (!correct) throw new Error("Kunci MC wajib dipilih.");
      return { correct: correct };
    }
    if (qType === "multi_jawaban") {
      renderKeyChoices();
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
        (deps &&
          deps.manuscriptStatementsWrap &&
          deps.manuscriptStatementsWrap.querySelectorAll(
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

  function syncAnswerKeyPreview() {
    if (!deps || !deps.manuscriptAnswerKeyRaw) return;
    try {
      const key = collectAnswerKey();
      deps.manuscriptAnswerKeyRaw.value = JSON.stringify(key, null, 2);
    } catch (_) {
      deps.manuscriptAnswerKeyRaw.value = "{}";
    }
  }

  function applyTypeUI(fromBlueprint) {
    if (!deps || typeof deps.getCurrentManuscriptQuestionType !== "function")
      return;
    const blueprintType = deps.getCurrentManuscriptQuestionType();
    let selectedType = String(
      (deps.manuscriptQuestionTypeUI && deps.manuscriptQuestionTypeUI.value) ||
        "",
    )
      .trim()
      .toLowerCase();
    if (fromBlueprint || !selectedType) {
      selectedType = blueprintType;
      if (deps.manuscriptQuestionTypeUI) {
        deps.manuscriptQuestionTypeUI.value = selectedType || "";
      }
    }
    currentManuscriptQuestionType = selectedType || blueprintType;
    if (deps.manuscriptOptionsPanel) {
      deps.manuscriptOptionsPanel.hidden = ![
        "pg_tunggal",
        "multi_jawaban",
      ].includes(currentManuscriptQuestionType);
    }
    if (deps.manuscriptKeyMC) {
      deps.manuscriptKeyMC.hidden =
        currentManuscriptQuestionType !== "pg_tunggal";
    }
    if (deps.manuscriptKeyMR) {
      deps.manuscriptKeyMR.hidden =
        currentManuscriptQuestionType !== "multi_jawaban";
    }
    if (deps.manuscriptKeyTF) {
      deps.manuscriptKeyTF.hidden =
        currentManuscriptQuestionType !== "benar_salah_pernyataan";
    }
    if (currentManuscriptQuestionType === "benar_salah_pernyataan") {
      ensureTFStatementRows();
    } else {
      ensureOptionRows();
      renderKeyChoices();
    }
    syncAnswerKeyPreview();
  }

  function setEditMode(questionID, versionNo) {
    manuscriptEditingQuestionID = Number(questionID || 0);
    if (deps && deps.manuscriptEditingVersionNoInput) {
      deps.manuscriptEditingVersionNoInput.value = String(versionNo || "");
    }
    if (deps && deps.manuscriptSubmitBtn) {
      deps.manuscriptSubmitBtn.textContent =
        "Simpan Perubahan (v" + String(versionNo || "") + ")";
    }
    if (deps && deps.manuscriptCancelEditBtn) {
      deps.manuscriptCancelEditBtn.hidden = false;
    }
  }

  function clearEditMode() {
    manuscriptEditingQuestionID = 0;
    manuscriptEditSnapshot = null;
    if (deps && deps.manuscriptEditingVersionNoInput) {
      deps.manuscriptEditingVersionNoInput.value = "";
    }
    if (deps && deps.manuscriptSubmitBtn) {
      deps.manuscriptSubmitBtn.textContent = "Simpan Naskah";
    }
    if (deps && deps.manuscriptCancelEditBtn) {
      deps.manuscriptCancelEditBtn.hidden = true;
    }
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

  function stableStringify(value) {
    if (value === null || value === undefined) return "";
    if (Array.isArray(value)) {
      return (
        "[" +
        value
          .map(function (it) {
            return stableStringify(it);
          })
          .join(",") +
        "]"
      );
    }
    if (typeof value === "object") {
      const keys = Object.keys(value).sort();
      return (
        "{" +
        keys
          .map(function (k) {
            return JSON.stringify(k) + ":" + stableStringify(value[k]);
          })
          .join(",") +
        "}"
      );
    }
    return JSON.stringify(value);
  }

  function normalizeAnswerKeyForCompare(answerKeyObj) {
    if (!answerKeyObj || typeof answerKeyObj !== "object") return {};
    const out = Array.isArray(answerKeyObj)
      ? answerKeyObj.slice()
      : Object.assign({}, answerKeyObj);
    if (Array.isArray(out.correct)) {
      out.correct = out.correct
        .map(function (it) {
          return String(it || "")
            .trim()
            .toUpperCase();
        })
        .filter(Boolean)
        .sort();
    }
    return out;
  }

  function normalizeOptionsForCompare(options) {
    const list = Array.isArray(options) ? options : [];
    return list
      .map(function (it) {
        return {
          option_key: String((it && it.option_key) || "")
            .trim()
            .toUpperCase(),
          option_html: String((it && it.option_html) || "").trim(),
        };
      })
      .sort(function (a, b) {
        return a.option_key.localeCompare(b.option_key);
      });
  }

  function buildEditSnapshot(item, questionID, versionNo) {
    if (!deps || typeof deps.findQuestionByID !== "function") return null;
    const selectedQuestion = deps.findQuestionByID(questionID);
    return {
      question_id: Number(questionID || 0),
      version_no: Number(versionNo || 0),
      learning_goal_id: Number(
        (selectedQuestion && selectedQuestion.learning_goal_id) || 0,
      ),
      question_code_id: Number(
        (selectedQuestion && selectedQuestion.question_code_id) || 0,
      ),
      stimulus_html: String((item && item.stimulus_html) || "").trim(),
      stem_html: String((item && item.stem_html) || "").trim(),
      explanation_html: String((item && item.explanation_html) || "").trim(),
      hint_html: String((item && item.hint_html) || "").trim(),
      answer_key: stableStringify(
        normalizeAnswerKeyForCompare(parseAnswerKeyObject(item.answer_key)),
      ),
      options: stableStringify(
        normalizeOptionsForCompare(item && item.options),
      ),
    };
  }

  function buildCurrentSnapshot(data) {
    return {
      question_id: Number((data && data.question_id) || 0),
      version_no: Number((data && data.version_no) || 0),
      learning_goal_id: Number((data && data.learning_goal_id) || 0),
      question_code_id: Number((data && data.question_code_id) || 0),
      stimulus_html: String((data && data.stimulus_html) || "").trim(),
      stem_html: String((data && data.stem_html) || "").trim(),
      explanation_html: String((data && data.explanation_html) || "").trim(),
      hint_html: String((data && data.hint_html) || "").trim(),
      answer_key: stableStringify(
        normalizeAnswerKeyForCompare(data && data.answer_key),
      ),
      options: stableStringify(
        normalizeOptionsForCompare(data && data.options),
      ),
    };
  }

  function isSameContent(a, b) {
    if (!a || !b) return false;
    return (
      a.question_id === b.question_id &&
      a.version_no === b.version_no &&
      a.stimulus_html === b.stimulus_html &&
      a.stem_html === b.stem_html &&
      a.explanation_html === b.explanation_html &&
      a.hint_html === b.hint_html &&
      a.answer_key === b.answer_key &&
      a.options === b.options
    );
  }

  function renderOptionsFromData(options) {
    if (!deps || !deps.manuscriptOptionsWrap) return;
    const list = Array.isArray(options) ? options : [];
    if (!list.length) {
      ensureOptionRows();
      return;
    }
    deps.manuscriptOptionsWrap.innerHTML = list
      .map(function (it, idx) {
        return createOptionRow(it || {}, idx);
      })
      .join("");
    bindOptionEditors();
  }

  function renderTFStatementsFromData(statements) {
    if (!deps || !deps.manuscriptStatementsWrap) return;
    const list = Array.isArray(statements) ? statements : [];
    if (!list.length) {
      ensureTFStatementRows();
      return;
    }
    deps.manuscriptStatementsWrap.innerHTML = list
      .map(function (it, idx) {
        return createTFStatementRow(it || {}, idx);
      })
      .join("");
  }

  function applyAnswerKeyToUI(answerKeyObj) {
    const qType = String(currentManuscriptQuestionType || "").toLowerCase();
    const key =
      answerKeyObj && typeof answerKeyObj === "object" ? answerKeyObj : {};
    if (qType === "pg_tunggal") {
      renderKeyChoices();
      const correct = String(key.correct || "")
        .trim()
        .toUpperCase();
      const target = deps.manuscriptKeyMCOptions
        ? deps.manuscriptKeyMCOptions.querySelector(
            'input[name="manuscript_mc_key"][value="' + correct + '"]',
          )
        : null;
      if (target) target.checked = true;
    } else if (qType === "multi_jawaban") {
      renderKeyChoices();
      const correctKeys = Array.isArray(key.correct)
        ? key.correct
            .map(function (it) {
              return String(it || "")
                .trim()
                .toUpperCase();
            })
            .filter(Boolean)
        : [];
      if (deps.manuscriptKeyMROptions) {
        deps.manuscriptKeyMROptions
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
    syncAnswerKeyPreview();
  }

  function beginEdit(item) {
    if (!item || !deps || !deps.manuscriptForm) return;
    const questionID = Number(item.question_id || 0);
    const versionNo = Number(item.version_no || 0);
    if (questionID <= 0 || versionNo <= 0) return;

    if (deps.manuscriptQuestionSelect) {
      deps.manuscriptQuestionSelect.value = String(questionID);
    }
    if (typeof deps.syncManuscriptSubjectState === "function") {
      deps.syncManuscriptSubjectState();
    }
    
    // Fallback: if syncManuscriptSubjectState didn't populate fields (e.g., transferred questions not in blueprint cache),
    // populate them directly from item data
    const subjectID = Number(item.subject_id || 0);
    if (subjectID > 0 && deps.manuscriptSubjectSelect) {
      if (!deps.manuscriptSubjectSelect.value || deps.manuscriptSubjectSelect.value === "") {
        deps.manuscriptSubjectSelect.value = String(subjectID);
        deps.manuscriptSubjectSelect.disabled = true;
        
        // Fill learning goal select for this subject
        if (typeof deps.fillLearningGoalSelect === "function") {
          deps.fillLearningGoalSelect(deps.manuscriptLearningGoalSelect, subjectID);
        }
        
        // Set learning goal value
        const learningGoalID = Number(item.learning_goal_id || 0);
        if (learningGoalID > 0 && deps.manuscriptLearningGoalSelect) {
          deps.manuscriptLearningGoalSelect.value = String(learningGoalID);
        }
        
        // Fill question code select for this subject
        if (typeof deps.fillQuestionCodeSelect === "function") {
          deps.fillQuestionCodeSelect(deps.manuscriptQuestionCodeSelect, subjectID, true);
        }
        
        // Set question code value
        const questionCodeID = Number(item.question_code_id || 0);
        if (deps.manuscriptQuestionCodeSelect) {
          deps.manuscriptQuestionCodeSelect.value = questionCodeID > 0 ? String(questionCodeID) : "";
          deps.manuscriptQuestionCodeSelect.disabled = false;
        }
      }
    }
    
    applyTypeUI(true);
    setQuillHTMLValue(manuscriptStimulusQuill, item.stimulus_html);
    setQuillHTMLValue(manuscriptStemQuill, item.stem_html);
    setQuillHTMLValue(manuscriptExplanationQuill, item.explanation_html);
    setQuillHTMLValue(manuscriptHintQuill, item.hint_html);
    syncHiddenInputs();

    const keyObj = parseAnswerKeyObject(item.answer_key);
    if (currentManuscriptQuestionType === "benar_salah_pernyataan") {
      renderTFStatementsFromData(keyObj.statements);
    } else {
      renderOptionsFromData(item.options);
    }
    applyTypeUI(false);
    applyAnswerKeyToUI(keyObj);

    manuscriptEditSnapshot = buildEditSnapshot(item, questionID, versionNo);
    setEditMode(questionID, versionNo);
    deps.manuscriptForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function previewVersion(item) {
    if (!item || !deps || !deps.manuscriptPreviewContent) return;
    const keyObj = parseAnswerKeyObject(item.answer_key);
    const safeJSON = deps.escapeHtml(JSON.stringify(keyObj, null, 2));
    const stem = String(item.stem_html || "").trim();
    const explanation = String(item.explanation_html || "").trim();
    const hint = String(item.hint_html || "").trim();
    const options = Array.isArray(item.options) ? item.options : [];
    const statements = Array.isArray(keyObj && keyObj.statements)
      ? keyObj.statements
      : [];
    const stimulusHTML = String(item.stimulus_html || "").trim()
      ? String(item.stimulus_html || "").trim()
      : '<div class="muted">(tanpa stimulus)</div>';
    const optionsHTML = options.length
      ? options
          .map(function (it) {
            return (
              '<div class="mt"><strong>' +
              deps.escapeHtml(String((it && it.option_key) || "")) +
              "</strong><div>" +
              String((it && it.option_html) || "") +
              "</div></div>"
            );
          })
          .join("")
      : '<div class="muted">Tidak ada opsi tersimpan.</div>';
    const statementsHTML = statements.length
      ? "<ol>" +
        statements
          .map(function (it) {
            const id = deps.escapeHtml(String((it && it.id) || "-"));
            const text = deps.escapeHtml(String((it && it.statement) || ""));
            const keyLabel = (it && it.correct) === true ? "Benar" : "Salah";
            return (
              "<li><div><strong>" +
              id +
              "</strong> " +
              text +
              '</div><div class="muted">Kunci: ' +
              deps.escapeHtml(keyLabel) +
              "</div></li>"
            );
          })
          .join("") +
        "</ol>"
      : '<div class="muted">Tidak ada pernyataan tersimpan.</div>';
    const rightPanelHTML = statements.length
      ? '<div><strong>Pernyataan:</strong><div class="box mt">' +
        statementsHTML +
        "</div></div>"
      : '<div><strong>Opsi:</strong><div class="box mt">' +
        optionsHTML +
        "</div></div>";
    if (deps.manuscriptPreviewTitle) {
      deps.text(
        deps.manuscriptPreviewTitle,
        "Detail Naskah Q" +
          String(item.question_id || "-") +
          " v" +
          String(item.version_no || "-"),
      );
    }
    deps.manuscriptPreviewContent.innerHTML = [
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
        rightPanelHTML +
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
      deps.manuscriptPreviewDialog &&
      typeof deps.manuscriptPreviewDialog.showModal === "function"
    ) {
      deps.manuscriptPreviewDialog.showModal();
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

  async function onSubmitForm(e) {
    if (!deps || !deps.manuscriptForm || !deps.api) return;
    e.preventDefault();
    syncHiddenInputs();
    const fd = new FormData(deps.manuscriptForm);
    const editingVersionNo = Number(fd.get("editing_version_no") || 0);
    const isEditMode = editingVersionNo > 0;
    const stemHTML = String(fd.get("stem_html") || "");
    if (isBlankHTML(stemHTML)) {
      setMsg("Naskah Soal (Stem) wajib diisi.");
      return;
    }
    const blueprintType =
      typeof deps.getCurrentManuscriptQuestionType === "function"
        ? deps.getCurrentManuscriptQuestionType()
        : "";
    const selectedType = String(
      (deps.manuscriptQuestionTypeUI && deps.manuscriptQuestionTypeUI.value) ||
        "",
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
    var answerKeyObj;
    var optionsPayload = [];
    try {
      optionsPayload = validateOptions(collectOptions());
      answerKeyObj = collectAnswerKey();
      if (deps.manuscriptAnswerKeyRaw) {
        deps.manuscriptAnswerKeyRaw.value = JSON.stringify(
          answerKeyObj,
          null,
          2,
        );
      }
    } catch (err) {
      setMsg("Kunci jawaban belum valid: " + err.message);
      return;
    }
    const done = deps.beginBusy(
      deps.manuscriptForm,
      deps.msg,
      isEditMode ? "Menyimpan perubahan naskah..." : "Menyimpan naskah...",
    );
    try {
      var questionID = isEditMode
        ? manuscriptEditingQuestionID
        : Number(fd.get("question_id") || 0);
      const selectedQuestionCodeID = Number(fd.get("question_code_id") || 0);
      const selectedLearningGoalID = Number(fd.get("learning_goal_id") || 0);
      var blueprintChanged = false;
      if (!isEditMode) {
        if (typeof deps.ensureQuestionForManuscriptSubmission !== "function") {
          throw new Error("Tidak bisa membuat soal baru.");
        }
        questionID = await deps.ensureQuestionForManuscriptSubmission({
          question_id: questionID,
          subject_id: Number(fd.get("subject_id") || 0),
          learning_goal_id: selectedLearningGoalID,
          question_code_id: selectedQuestionCodeID,
          question_type: selectedType,
          stem_html: stemHTML,
        });
        if (typeof deps.loadBlueprints === "function") {
          await deps.loadBlueprints(0);
        }
        if (deps.manuscriptQuestionSelect) {
          deps.manuscriptQuestionSelect.value = String(questionID);
        }
        if (typeof deps.syncManuscriptSubjectState === "function") {
          deps.syncManuscriptSubjectState();
        }
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
        const selectedQuestion =
          typeof deps.findQuestionByID === "function"
            ? deps.findQuestionByID(questionID)
            : null;
        if (
          selectedLearningGoalID > 0 &&
          selectedQuestion &&
          Number(
            (selectedQuestion && selectedQuestion.learning_goal_id) || 0,
          ) !== selectedLearningGoalID
        ) {
          await deps.api(
            "/api/v1/questions/" + questionID + "/learning-goal",
            "PUT",
            { learning_goal_id: selectedLearningGoalID },
          );
          blueprintChanged = true;
        }
        const prevCodeID = Number(
          (selectedQuestion && selectedQuestion.question_code_id) || 0,
        );
        const nextCodeID =
          selectedQuestionCodeID > 0 ? selectedQuestionCodeID : 0;
        if (prevCodeID !== nextCodeID) {
          await deps.api("/api/v1/questions/" + questionID + "/code", "PUT", {
            question_code_id:
              selectedQuestionCodeID > 0 ? selectedQuestionCodeID : null,
          });
          blueprintChanged = true;
        }
      }
      const currentSnapshot = buildCurrentSnapshot({
        question_id: questionID,
        version_no: editingVersionNo,
        learning_goal_id: selectedLearningGoalID,
        question_code_id: selectedQuestionCodeID,
        stimulus_html: stimulusHTML,
        stem_html: stemHTML,
        explanation_html: payload.explanation_html,
        hint_html: payload.hint_html,
        answer_key: answerKeyObj,
        options: optionsPayload,
      });
      const hasContentChanges = !isSameContent(
        manuscriptEditSnapshot,
        currentSnapshot,
      );
      if (!isEditMode || hasContentChanges) {
        const endpoint = isEditMode
          ? "/api/v1/questions/" + questionID + "/versions/" + editingVersionNo
          : "/api/v1/questions/" + questionID + "/versions";
        const method = isEditMode ? "PUT" : "POST";
        await deps.api(endpoint, method, payload);
      } else if (!blueprintChanged) {
        setMsg("Tidak ada perubahan pada naskah untuk disimpan.");
        return;
      }
      if (blueprintChanged && typeof deps.loadBlueprints === "function") {
        await deps.loadBlueprints(0);
      }
      if (typeof deps.reloadManuscriptsByCurrentTableScope === "function") {
        await deps.reloadManuscriptsByCurrentTableScope(questionID);
      } else {
        const versions = await deps.api(
          "/api/v1/questions/" + questionID + "/versions",
          "GET",
        );
        if (typeof deps.renderManuscripts === "function") {
          deps.renderManuscripts(versions);
        }
      }
      resetEditors();
      deps.manuscriptForm.reset();
      if (typeof deps.syncManuscriptSubjectState === "function") {
        deps.syncManuscriptSubjectState();
      }
      if (typeof deps.fillBlueprintSelect === "function") {
        deps.fillBlueprintSelect(deps.manuscriptQuestionSelect);
      }
      if (deps.manuscriptStatementsWrap) {
        deps.manuscriptStatementsWrap.innerHTML = "";
      }
      if (deps.manuscriptOptionsWrap) {
        deps.manuscriptOptionsWrap.innerHTML = "";
      }
      ensureOptionRows();
      ensureTFStatementRows();
      applyTypeUI(true);
      clearEditMode();
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
  }

  async function onRefreshClick() {
    if (!deps || !deps.manuscriptRefreshBtn) return;
    const done = deps.beginBusy(
      deps.manuscriptRefreshBtn,
      deps.msg,
      "Muat ulang naskah...",
    );
    try {
      const versions =
        typeof deps.loadAllManuscriptVersionsFromBlueprints === "function"
          ? await deps.loadAllManuscriptVersionsFromBlueprints()
          : [];
      if (typeof deps.renderManuscripts === "function") {
        deps.renderManuscripts(versions);
      }
      setMsg("Data naskah berhasil dimuat ulang.");
    } catch (err) {
      setMsg("Gagal muat ulang naskah: " + err.message);
    } finally {
      done();
    }
  }

  function onCancelEdit() {
    if (!deps || !deps.manuscriptForm) return;
    clearEditMode();
    deps.manuscriptForm.reset();
    if (typeof deps.syncManuscriptSubjectState === "function") {
      deps.syncManuscriptSubjectState();
    }
    resetEditors();
    if (deps.manuscriptStatementsWrap)
      deps.manuscriptStatementsWrap.innerHTML = "";
    if (deps.manuscriptOptionsWrap) deps.manuscriptOptionsWrap.innerHTML = "";
    ensureOptionRows();
    ensureTFStatementRows();
    applyTypeUI(true);
  }

  function onQuestionSelectChange() {
    clearEditMode();
    if (typeof deps.syncManuscriptSubjectState === "function") {
      deps.syncManuscriptSubjectState();
    }
    applyTypeUI(true);
  }

  function onSubjectSelectChange() {
    clearEditMode();
    if (deps.manuscriptQuestionSelect && deps.manuscriptQuestionSelect.value) {
      return;
    }
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
  }

  function onQuestionTypeChange() {
    applyTypeUI(false);
  }

  function onFormChangeOrInput(e) {
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
        renderKeyChoices();
      }
      syncAnswerKeyPreview();
    }
  }

  function bindEvents() {
    if (!deps) return;
    if (deps.manuscriptQuestionSelect) {
      deps.manuscriptQuestionSelect.addEventListener(
        "change",
        onQuestionSelectChange,
      );
    }
    if (deps.manuscriptSubjectSelect) {
      deps.manuscriptSubjectSelect.addEventListener(
        "change",
        onSubjectSelectChange,
      );
    }
    if (deps.manuscriptQuestionTypeUI) {
      deps.manuscriptQuestionTypeUI.addEventListener(
        "change",
        onQuestionTypeChange,
      );
    }
    if (deps.manuscriptForm) {
      deps.manuscriptForm.addEventListener("submit", onSubmitForm);
      deps.manuscriptForm.addEventListener("change", onFormChangeOrInput);
      deps.manuscriptForm.addEventListener("input", onFormChangeOrInput);
    }
    if (deps.manuscriptAddOptionBtn) {
      deps.manuscriptAddOptionBtn.addEventListener("click", function () {
        if (!deps.manuscriptOptionsWrap) return;
        const idx =
          deps.manuscriptOptionsWrap.querySelectorAll("[data-option-row]")
            .length || 0;
        deps.manuscriptOptionsWrap.insertAdjacentHTML(
          "beforeend",
          createOptionRow({ option_key: "", option_html: "" }, idx),
        );
        bindOptionEditors();
        renderKeyChoices();
        syncAnswerKeyPreview();
      });
    }
    if (deps.manuscriptOptionsWrap) {
      deps.manuscriptOptionsWrap.addEventListener("click", function (e) {
        const btn = e.target && e.target.closest("button[data-option-remove]");
        if (!btn) return;
        const row = btn.closest("[data-option-row]");
        if (row) row.remove();
        ensureOptionRows();
        renderKeyChoices();
        syncAnswerKeyPreview();
      });
    }
    if (deps.manuscriptAddStatementBtn) {
      deps.manuscriptAddStatementBtn.addEventListener("click", function () {
        if (!deps.manuscriptStatementsWrap) return;
        const idx =
          deps.manuscriptStatementsWrap.querySelectorAll("[data-statement-row]")
            .length || 0;
        deps.manuscriptStatementsWrap.insertAdjacentHTML(
          "beforeend",
          createTFStatementRow(
            { id: "S" + String(idx + 1), statement: "", correct: true },
            idx,
          ),
        );
        syncAnswerKeyPreview();
      });
    }
    if (deps.manuscriptStatementsWrap) {
      deps.manuscriptStatementsWrap.addEventListener("click", function (e) {
        const btn =
          e.target && e.target.closest("button[data-statement-remove]");
        if (!btn) return;
        const row = btn.closest("[data-statement-row]");
        if (row) row.remove();
        ensureTFStatementRows();
        syncAnswerKeyPreview();
      });
    }
    if (deps.manuscriptRefreshBtn) {
      deps.manuscriptRefreshBtn.addEventListener("click", onRefreshClick);
    }
    if (deps.manuscriptCancelEditBtn) {
      deps.manuscriptCancelEditBtn.addEventListener("click", onCancelEdit);
    }
  }

  function ensureEditors() {
    if (!deps || typeof deps.createQuillEditor !== "function") return;
    if (deps.manuscriptStimulusEditor && !manuscriptStimulusQuill) {
      manuscriptStimulusQuill = deps.createQuillEditor(
        deps.manuscriptStimulusEditor,
        "Tulis stimulus...",
        { defaultFontSize: "12pt" },
      );
      if (manuscriptStimulusQuill) {
        manuscriptStimulusQuill.on("text-change", function () {
          syncHiddenInputs();
        });
      }
    }
    if (deps.manuscriptStemEditor && !manuscriptStemQuill) {
      manuscriptStemQuill = deps.createQuillEditor(
        deps.manuscriptStemEditor,
        "Tulis naskah soal...",
        { defaultFontSize: "12pt" },
      );
      if (manuscriptStemQuill) {
        manuscriptStemQuill.on("text-change", function () {
          syncHiddenInputs();
        });
      }
    }
    if (deps.manuscriptExplanationEditor && !manuscriptExplanationQuill) {
      manuscriptExplanationQuill = deps.createQuillEditor(
        deps.manuscriptExplanationEditor,
        "Tulis penjelasan...",
        { defaultFontSize: "12pt" },
      );
      if (manuscriptExplanationQuill) {
        manuscriptExplanationQuill.on("text-change", function () {
          syncHiddenInputs();
        });
      }
    }
    if (deps.manuscriptHintEditor && !manuscriptHintQuill) {
      manuscriptHintQuill = deps.createQuillEditor(
        deps.manuscriptHintEditor,
        "Tulis hint...",
        { defaultFontSize: "12pt" },
      );
      if (manuscriptHintQuill) {
        manuscriptHintQuill.on("text-change", function () {
          syncHiddenInputs();
        });
      }
    }
    syncHiddenInputs();
  }

  function onDeletedEditingVersion(questionID, versionNo) {
    if (
      manuscriptEditingQuestionID === questionID &&
      Number(
        (deps &&
          deps.manuscriptEditingVersionNoInput &&
          deps.manuscriptEditingVersionNoInput.value) ||
          0,
      ) === Number(versionNo || 0)
    ) {
      clearEditMode();
      if (deps && deps.manuscriptForm) deps.manuscriptForm.reset();
      resetEditors();
    }
  }

  function init(opts) {
    setDeps(opts);
    bindEvents();
  }

  window.GuruManuscript = {
    init: init,
    ensureEditors: ensureEditors,
    syncHiddenInputs: syncHiddenInputs,
    resetEditors: resetEditors,
    applyTypeUI: applyTypeUI,
    clearEditMode: clearEditMode,
    beginEdit: beginEdit,
    previewVersion: previewVersion,
    onDeletedEditingVersion: onDeletedEditingVersion,
    getEditingQuestionID: function () {
      return manuscriptEditingQuestionID;
    },
  };
})();
