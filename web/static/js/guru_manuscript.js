(function () {
  var deps = null;
  var manuscriptStimulusQuill = null;
  var manuscriptStemQuill = null;
  var manuscriptExplanationQuill = null;
  var manuscriptHintQuill = null;
  var manuscriptOptionQuillByRow = new WeakMap();
  var manuscriptStimulusTabQuillByRow = new WeakMap();
  var manuscriptDraggingStimulusTabRow = null;
  var manuscriptFormMessageTimer = null;
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

  function showFormMessage(value, durationMs) {
    if (!deps || !deps.manuscriptFormMessage) return;
    const message = String(value || "").trim();
    if (manuscriptFormMessageTimer) {
      clearTimeout(manuscriptFormMessageTimer);
      manuscriptFormMessageTimer = null;
    }
    deps.manuscriptFormMessage.textContent = message;
    deps.manuscriptFormMessage.hidden = message === "";
    if (!message) return;
    deps.manuscriptFormMessage.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
    if (durationMs && durationMs > 0) {
      manuscriptFormMessageTimer = setTimeout(function () {
        if (deps && deps.manuscriptFormMessage) {
          deps.manuscriptFormMessage.hidden = true;
          deps.manuscriptFormMessage.textContent = "";
        }
        manuscriptFormMessageTimer = null;
      }, durationMs);
    }
  }

  function syncHiddenInputs() {
    if (!deps) return;
    if (deps.manuscriptStimulusHTMLInput) {
      deps.manuscriptStimulusHTMLInput.value = buildStimulusPayload().html;
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
    if (deps && deps.manuscriptStimulusType) {
      deps.manuscriptStimulusType.value = "single";
    }
    if (deps && deps.manuscriptStimulusTabsWrap) {
      deps.manuscriptStimulusTabsWrap.innerHTML = "";
    }
    if (deps && deps.manuscriptShortAnswerAccepted) {
      deps.manuscriptShortAnswerAccepted.value = "";
    }
    if (deps && deps.manuscriptShortAnswerPlaceholder) {
      deps.manuscriptShortAnswerPlaceholder.value = "";
    }
    if (deps && deps.manuscriptShortAnswerInputType) {
      deps.manuscriptShortAnswerInputType.value = "textarea";
    }
    if (deps && deps.manuscriptShortAnswerMaxLength) {
      deps.manuscriptShortAnswerMaxLength.value = "33";
    }
    showFormMessage("", 0);
    ensureStimulusTabRows();
    applyStimulusTypeUI();
    syncHiddenInputs();
  }

  function createStimulusTabRow(data, idx) {
    if (!deps || typeof deps.escapeHtml !== "function") return "";
    const title = String((data && data.title) || "").trim();
    const body = String((data && data.body) || "").trim();
    return (
      '<div class="panel mt" data-stimulus-tab-row="1">' +
      '<div class="admin-section-head">' +
      '<div class="action-icons">' +
      '<button type="button" class="btn btn-secondary btn-inline" draggable="true" data-stimulus-tab-drag-handle="1" title="Geser urutan tab">Geser</button>' +
      "<strong>Tab " +
      String(idx + 1) +
      "</strong>" +
      "</div>" +
      '<div class="action-icons">' +
      '<button type="button" class="btn btn-secondary btn-inline" data-stimulus-tab-up="1">Naik</button>' +
      '<button type="button" class="btn btn-secondary btn-inline" data-stimulus-tab-down="1">Turun</button>' +
      "</div>" +
      "</div>" +
      '<label>Judul Tab<input type="text" data-stimulus-tab-title value="' +
      deps.escapeHtml(title) +
      '" placeholder="Teks 1" /></label>' +
      '<label class="mt">Isi Tab</label>' +
      '<div class="quill-editor-shell mt"><div class="manuscript-stimulus-tab-editor"></div></div>' +
      '<input type="hidden" data-stimulus-tab-body value="' +
      deps.escapeHtml(body) +
      '" />' +
      '<button type="button" class="btn btn-secondary btn-inline mt" data-stimulus-tab-remove="1">Hapus Tab</button>' +
      "</div>"
    );
  }

  function bindStimulusTabEditor(row) {
    if (!row || manuscriptStimulusTabQuillByRow.has(row) || !window.Quill) {
      return;
    }
    if (!deps || typeof deps.createQuillEditor !== "function") return;
    const host = row.querySelector(".manuscript-stimulus-tab-editor");
    const hidden = row.querySelector("[data-stimulus-tab-body]");
    if (!host || !hidden) return;
    const initialHTML = String(hidden.value || "").trim();
    const quill = deps.createQuillEditor(host, "Isi stimulus tab...", {
      defaultFontSize: "12pt",
    });
    if (!quill) return;
    if (initialHTML) {
      quill.clipboard.dangerouslyPasteHTML(initialHTML);
    }
    hidden.value = getQuillHTML(quill);
    quill.on("text-change", function () {
      hidden.value = getQuillHTML(quill);
      syncHiddenInputs();
    });
    manuscriptStimulusTabQuillByRow.set(row, quill);
  }

  function bindStimulusTabEditors() {
    if (!deps || !deps.manuscriptStimulusTabsWrap) return;
    deps.manuscriptStimulusTabsWrap
      .querySelectorAll("[data-stimulus-tab-row]")
      .forEach(function (row) {
        bindStimulusTabEditor(row);
      });
  }

  function getStimulusTabRows() {
    return Array.from(
      (deps &&
        deps.manuscriptStimulusTabsWrap &&
        deps.manuscriptStimulusTabsWrap.querySelectorAll(
          "[data-stimulus-tab-row]",
        )) ||
        [],
    );
  }

  function refreshStimulusTabRowLabels() {
    const rows = getStimulusTabRows();
    rows.forEach(function (row, idx) {
      const label = row.querySelector(".admin-section-head strong");
      const upBtn = row.querySelector("button[data-stimulus-tab-up]");
      const downBtn = row.querySelector("button[data-stimulus-tab-down]");
      if (label) {
        label.textContent = "Tab " + String(idx + 1);
      }
      if (upBtn) {
        upBtn.disabled = idx === 0;
      }
      if (downBtn) {
        downBtn.disabled = idx === rows.length - 1;
      }
    });
  }

  function syncStimulusTabState() {
    refreshStimulusTabRowLabels();
    syncHiddenInputs();
  }

  function appendStimulusTabRow(data) {
    if (!deps || !deps.manuscriptStimulusTabsWrap) return;
    const idx = getStimulusTabRows().length;
    deps.manuscriptStimulusTabsWrap.insertAdjacentHTML(
      "beforeend",
      createStimulusTabRow(data || {}, idx),
    );
    bindStimulusTabEditors();
    syncStimulusTabState();
  }

  function setStimulusTabRows(tabs) {
    if (!deps || !deps.manuscriptStimulusTabsWrap) return;
    const list = Array.isArray(tabs) ? tabs : [];
    deps.manuscriptStimulusTabsWrap.innerHTML = list.length
      ? list
          .map(function (it, idx) {
            return createStimulusTabRow(it || {}, idx);
          })
          .join("")
      : "";
    ensureStimulusTabRows();
  }

  function moveStimulusTabRowBefore(sourceRow, targetRow) {
    if (
      !deps ||
      !deps.manuscriptStimulusTabsWrap ||
      !sourceRow ||
      !targetRow ||
      sourceRow === targetRow
    ) {
      return;
    }
    deps.manuscriptStimulusTabsWrap.insertBefore(sourceRow, targetRow);
    syncStimulusTabState();
  }

  function clearStimulusTabDropTargets() {
    if (!deps || !deps.manuscriptStimulusTabsWrap) return;
    deps.manuscriptStimulusTabsWrap
      .querySelectorAll("[data-stimulus-tab-row].is-drop-target")
      .forEach(function (row) {
        row.classList.remove("is-drop-target");
      });
  }

  function ensureStimulusTabRows() {
    if (!deps || !deps.manuscriptStimulusTabsWrap) return;
    if (!getStimulusTabRows().length) {
      deps.manuscriptStimulusTabsWrap.innerHTML = createStimulusTabRow(
        { title: "Teks 1", body: "" },
        0,
      );
    }
    bindStimulusTabEditors();
    refreshStimulusTabRowLabels();
  }

  function collectStimulusTabs() {
    return getStimulusTabRows()
      .map(function (row, idx) {
        const titleInput = row.querySelector("[data-stimulus-tab-title]");
        const bodyInput = row.querySelector("[data-stimulus-tab-body]");
        const title = String((titleInput && titleInput.value) || "").trim();
        const body = String((bodyInput && bodyInput.value) || "").trim();
        return {
          title: title || "Teks " + String(idx + 1),
          body: body,
        };
      })
      .filter(function (it) {
        return it.body;
      });
  }

  function renderStimulusHTMLFromTabs(tabs) {
    const list = Array.isArray(tabs) ? tabs : [];
    return list
      .map(function (it, idx) {
        const title = deps.escapeHtml(
          String((it && it.title) || "").trim() || "Tab " + String(idx + 1),
        );
        const body = String((it && it.body) || "").trim();
        if (!body) return "";
        return (
          '<section class="panel mt"><h4>' +
          title +
          '</h4><div class="box mt">' +
          body +
          "</div></section>"
        );
      })
      .join("");
  }

  function buildStimulusPayload() {
    const stimulusType = String(
      (deps &&
        deps.manuscriptStimulusType &&
        deps.manuscriptStimulusType.value) ||
        "single",
    )
      .trim()
      .toLowerCase();
    if (stimulusType === "multiteks") {
      const tabs = collectStimulusTabs();
      return {
        type: "multiteks",
        content: tabs.length ? { tabs: tabs } : null,
        html: renderStimulusHTMLFromTabs(tabs).trim(),
      };
    }
    const body = getQuillHTML(manuscriptStimulusQuill).trim();
    return {
      type: "single",
      content: body ? { body: body } : null,
      html: body,
    };
  }

  function applyStimulusTypeUI() {
    if (!deps || !deps.manuscriptStimulusType) return;
    const isMulti =
      String(deps.manuscriptStimulusType.value || "")
        .trim()
        .toLowerCase() === "multiteks";
    if (deps.manuscriptStimulusSinglePanel) {
      deps.manuscriptStimulusSinglePanel.hidden = isMulti;
    }
    if (deps.manuscriptStimulusMultiteksPanel) {
      deps.manuscriptStimulusMultiteksPanel.hidden = !isMulti;
    }
    if (isMulti) {
      ensureStimulusTabRows();
    }
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

  function createMatchContentRow(kind, data, idx) {
    if (!deps || typeof deps.escapeHtml !== "function") return "";
    const prefix = kind === "choice" ? "C" : "P";
    const id = String((data && data.id) || prefix + String(idx + 1)).trim();
    const htmlValue = String((data && data.html) || "").trim();
    const title = kind === "choice" ? "Choice" : "Prompt";
    return (
      '<div class="panel mt" data-match-row="' +
      kind +
      '">' +
      "<label>ID " +
      title +
      '<input type="text" data-match-id value="' +
      deps.escapeHtml(id) +
      '" placeholder="' +
      prefix +
      String(idx + 1) +
      '" /></label>' +
      '<label class="mt">HTML ' +
      title +
      '<textarea data-match-html rows="3" placeholder="<p>Isi ' +
      title.toLowerCase() +
      '...</p>">' +
      deps.escapeHtml(htmlValue) +
      "</textarea></label>" +
      '<button type="button" class="btn btn-secondary btn-inline mt" data-match-remove="' +
      kind +
      '">Hapus</button>' +
      "</div>"
    );
  }

  function ensureMatchRows(kind) {
    const wrap =
      kind === "choice"
        ? deps && deps.manuscriptMatchChoicesWrap
        : deps && deps.manuscriptMatchPromptsWrap;
    if (!wrap) return;
    if (!wrap.querySelector('[data-match-row="' + kind + '"]')) {
      wrap.innerHTML = createMatchContentRow(kind, null, 0);
      if (kind === "prompt" || kind === "choice") {
        wrap.insertAdjacentHTML(
          "beforeend",
          createMatchContentRow(kind, null, 1),
        );
      }
    }
  }

  function collectMatchItems(kind) {
    const wrap =
      kind === "choice"
        ? deps && deps.manuscriptMatchChoicesWrap
        : deps && deps.manuscriptMatchPromptsWrap;
    const label = kind === "choice" ? "Choice" : "Prompt";
    const rows = Array.from(
      (wrap && wrap.querySelectorAll('[data-match-row="' + kind + '"]')) || [],
    );
    if (!rows.length) {
      throw new Error("Tambahkan minimal 1 " + label.toLowerCase() + ".");
    }
    const seen = {};
    return rows.map(function (row, idx) {
      const id = String(
        (row.querySelector("[data-match-id]") || {}).value || "",
      ).trim();
      const html = String(
        (row.querySelector("[data-match-html]") || {}).value || "",
      ).trim();
      if (!id) {
        throw new Error(
          "ID " + label + " baris " + String(idx + 1) + " wajib diisi.",
        );
      }
      if (seen[id]) {
        throw new Error("ID " + label + " duplikat: " + id);
      }
      if (!html) {
        throw new Error("HTML " + label + " " + id + " wajib diisi.");
      }
      seen[id] = true;
      return { id: id, html: html };
    });
  }

  function isMatchingQuestionTypeActive() {
    const selectedType = String(
      (deps &&
        deps.manuscriptQuestionTypeUI &&
        deps.manuscriptQuestionTypeUI.value) ||
        currentManuscriptQuestionType ||
        (deps && typeof deps.getCurrentManuscriptQuestionType === "function"
          ? deps.getCurrentManuscriptQuestionType()
          : "") ||
        "",
    )
      .trim()
      .toLowerCase();
    return selectedType === "menjodohkan_drag_drop";
  }

  function renderMatchPairRows(selectedPairs) {
    if (!deps || !deps.manuscriptMatchPairsWrap) return;
    if (!isMatchingQuestionTypeActive()) {
      deps.manuscriptMatchPairsWrap.innerHTML = "";
      return;
    }
    const prompts = collectMatchItems("prompt");
    const choices = collectMatchItems("choice");
    const selectedMap = {};
    (Array.isArray(selectedPairs) ? selectedPairs : []).forEach(
      function (pair) {
        const promptID = String((pair && pair.prompt_id) || "").trim();
        const choiceID = String((pair && pair.choice_id) || "").trim();
        if (promptID && choiceID) selectedMap[promptID] = choiceID;
      },
    );
    deps.manuscriptMatchPairsWrap.innerHTML = prompts
      .map(function (prompt) {
        const options = ['<option value="">Pilih choice</option>'].concat(
          choices.map(function (choice) {
            const selected =
              selectedMap[prompt.id] === choice.id ? " selected" : "";
            return (
              '<option value="' +
              deps.escapeHtml(choice.id) +
              '"' +
              selected +
              ">" +
              deps.escapeHtml(choice.id) +
              "</option>"
            );
          }),
        );
        return (
          '<label class="mt" data-match-pair-row="1">Prompt <strong>' +
          deps.escapeHtml(prompt.id) +
          '</strong><select data-match-pair-prompt="' +
          deps.escapeHtml(prompt.id) +
          '">' +
          options.join("") +
          "</select></label>"
        );
      })
      .join("");
  }

  function collectMatchQuestionContent() {
    return {
      prompts: collectMatchItems("prompt"),
      choices: collectMatchItems("choice"),
      note_html: String(
        (deps &&
          deps.manuscriptMatchNoteHTML &&
          deps.manuscriptMatchNoteHTML.value) ||
          "",
      ).trim(),
    };
  }

  function collectSelectedMatchPairsFromUI() {
    const rows = Array.from(
      (deps &&
        deps.manuscriptMatchPairsWrap &&
        deps.manuscriptMatchPairsWrap.querySelectorAll(
          "[data-match-pair-row]",
        )) ||
        [],
    );
    return rows
      .map(function (row) {
        const select = row.querySelector("select");
        const promptID = String(
          (select && select.getAttribute("data-match-pair-prompt")) || "",
        ).trim();
        const choiceID = String((select && select.value) || "").trim();
        if (!promptID) return null;
        return {
          prompt_id: promptID,
          choice_id: choiceID,
        };
      })
      .filter(function (pair) {
        return pair && pair.prompt_id;
      });
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
    if (qType === "menjodohkan_drag_drop") {
      const content = collectMatchQuestionContent();
      renderMatchPairRows(collectSelectedMatchPairsFromUI());
      const rows = Array.from(
        (deps &&
          deps.manuscriptMatchPairsWrap &&
          deps.manuscriptMatchPairsWrap.querySelectorAll(
            "[data-match-pair-row]",
          )) ||
          [],
      );
      const usedChoice = {};
      const pairs = rows.map(function (row, idx) {
        const promptID = String(
          row.querySelector("select").getAttribute("data-match-pair-prompt") ||
            "",
        ).trim();
        const choiceID = String(
          (row.querySelector("select") || {}).value || "",
        ).trim();
        if (!choiceID) {
          throw new Error(
            "Pasangan prompt " + String(idx + 1) + " wajib dipilih.",
          );
        }
        if (usedChoice[choiceID]) {
          throw new Error("Choice dipakai lebih dari sekali: " + choiceID);
        }
        usedChoice[choiceID] = true;
        return { prompt_id: promptID, choice_id: choiceID };
      });
      if (pairs.length !== content.prompts.length) {
        throw new Error("Semua prompt wajib memiliki pasangan.");
      }
      return { mode: "exact", pairs: pairs };
    }
    if (qType === "short_answer") {
      const acceptedRaw = String(
        (deps &&
          deps.manuscriptShortAnswerAccepted &&
          deps.manuscriptShortAnswerAccepted.value) ||
          "",
      );
      const acceptedAnswers = acceptedRaw
        .split(/\r?\n/)
        .map(function (it) {
          return String(it || "").trim();
        })
        .filter(Boolean);
      if (!acceptedAnswers.length) {
        throw new Error("Minimal 1 jawaban benar wajib diisi.");
      }
      return {
        accepted_answers: acceptedAnswers,
        match_mode: "normalized_exact",
      };
    }
    throw new Error("Tipe soal belum valid.");
  }

  function collectShortAnswerQuestionContent() {
    return {
      placeholder: String(
        (deps &&
          deps.manuscriptShortAnswerPlaceholder &&
          deps.manuscriptShortAnswerPlaceholder.value) ||
          "",
      ).trim(),
      input_type: String(
        (deps &&
          deps.manuscriptShortAnswerInputType &&
          deps.manuscriptShortAnswerInputType.value) ||
          "textarea",
      )
        .trim()
        .toLowerCase(),
      max_length: Number(
        (deps &&
          deps.manuscriptShortAnswerMaxLength &&
          deps.manuscriptShortAnswerMaxLength.value) ||
          33,
      ),
    };
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
    if (deps.manuscriptKeyMatch) {
      deps.manuscriptKeyMatch.hidden =
        currentManuscriptQuestionType !== "menjodohkan_drag_drop";
    }
    if (deps.manuscriptKeyShortAnswer) {
      deps.manuscriptKeyShortAnswer.hidden =
        currentManuscriptQuestionType !== "short_answer";
    }
    if (currentManuscriptQuestionType === "benar_salah_pernyataan") {
      ensureTFStatementRows();
    } else if (currentManuscriptQuestionType === "menjodohkan_drag_drop") {
      ensureMatchRows("prompt");
      ensureMatchRows("choice");
      try {
        renderMatchPairRows(collectSelectedMatchPairsFromUI());
      } catch (_) {
        // Ignore incomplete matching builder state while form is initializing.
      }
    } else if (currentManuscriptQuestionType === "short_answer") {
      // Short answer uses dedicated panel.
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
    if (Array.isArray(out.pairs)) {
      out.pairs = out.pairs
        .map(function (it) {
          return {
            prompt_id: String((it && it.prompt_id) || "").trim(),
            choice_id: String((it && it.choice_id) || "").trim(),
          };
        })
        .sort(function (a, b) {
          return a.prompt_id.localeCompare(b.prompt_id);
        });
    }
    if (Array.isArray(out.accepted_answers)) {
      out.accepted_answers = out.accepted_answers
        .map(function (it) {
          return String(it || "").trim();
        })
        .filter(Boolean)
        .sort(function (a, b) {
          return a.localeCompare(b, undefined, { sensitivity: "base" });
        });
    }
    return out;
  }

  function normalizeQuestionContentForCompare(questionContentObj) {
    if (!questionContentObj || typeof questionContentObj !== "object")
      return {};
    if (
      currentManuscriptQuestionType === "short_answer" ||
      Object.prototype.hasOwnProperty.call(questionContentObj, "input_type") ||
      Object.prototype.hasOwnProperty.call(questionContentObj, "max_length") ||
      Object.prototype.hasOwnProperty.call(questionContentObj, "placeholder")
    ) {
      return {
        placeholder: String(questionContentObj.placeholder || "").trim(),
        input_type: String(questionContentObj.input_type || "textarea")
          .trim()
          .toLowerCase(),
        max_length: Number(questionContentObj.max_length || 33),
      };
    }
    function normalizeItems(items) {
      return (Array.isArray(items) ? items : [])
        .map(function (it) {
          return {
            id: String((it && it.id) || "").trim(),
            html: String((it && it.html) || "").trim(),
          };
        })
        .sort(function (a, b) {
          return a.id.localeCompare(b.id);
        });
    }
    return {
      prompts: normalizeItems(questionContentObj.prompts),
      choices: normalizeItems(questionContentObj.choices),
      note_html: String(questionContentObj.note_html || "").trim(),
    };
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
      stimulus_type: String((item && item.stimulus_type) || "single").trim(),
      stimulus_content: stableStringify(
        (item && item.stimulus_content) || null,
      ),
      stimulus_html: String((item && item.stimulus_html) || "").trim(),
      stem_html: String((item && item.stem_html) || "").trim(),
      explanation_html: String((item && item.explanation_html) || "").trim(),
      hint_html: String((item && item.hint_html) || "").trim(),
      question_content: stableStringify(
        normalizeQuestionContentForCompare(item && item.question_content),
      ),
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
      stimulus_type: String((data && data.stimulus_type) || "single").trim(),
      stimulus_content: stableStringify(
        (data && data.stimulus_content) || null,
      ),
      stimulus_html: String((data && data.stimulus_html) || "").trim(),
      stem_html: String((data && data.stem_html) || "").trim(),
      explanation_html: String((data && data.explanation_html) || "").trim(),
      hint_html: String((data && data.hint_html) || "").trim(),
      question_content: stableStringify(
        normalizeQuestionContentForCompare(data && data.question_content),
      ),
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
      a.stimulus_type === b.stimulus_type &&
      a.stimulus_content === b.stimulus_content &&
      a.stimulus_html === b.stimulus_html &&
      a.stem_html === b.stem_html &&
      a.explanation_html === b.explanation_html &&
      a.hint_html === b.hint_html &&
      a.question_content === b.question_content &&
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

  function renderMatchRowsFromData(kind, items) {
    const wrap =
      kind === "choice"
        ? deps && deps.manuscriptMatchChoicesWrap
        : deps && deps.manuscriptMatchPromptsWrap;
    if (!wrap) return;
    const list = Array.isArray(items) ? items : [];
    if (!list.length) {
      ensureMatchRows(kind);
      return;
    }
    wrap.innerHTML = list
      .map(function (it, idx) {
        return createMatchContentRow(kind, it || {}, idx);
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
    } else if (qType === "menjodohkan_drag_drop") {
      renderMatchPairRows(Array.isArray(key.pairs) ? key.pairs : []);
    } else if (qType === "short_answer") {
      if (deps && deps.manuscriptShortAnswerAccepted) {
        deps.manuscriptShortAnswerAccepted.value = Array.isArray(
          key.accepted_answers,
        )
          ? key.accepted_answers.join("\n")
          : "";
      }
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
      if (
        !deps.manuscriptSubjectSelect.value ||
        deps.manuscriptSubjectSelect.value === ""
      ) {
        deps.manuscriptSubjectSelect.value = String(subjectID);
        deps.manuscriptSubjectSelect.disabled = true;

        // Fill learning goal select for this subject
        if (typeof deps.fillLearningGoalSelect === "function") {
          deps.fillLearningGoalSelect(
            deps.manuscriptLearningGoalSelect,
            subjectID,
          );
        }

        // Set learning goal value
        const learningGoalID = Number(item.learning_goal_id || 0);
        if (learningGoalID > 0 && deps.manuscriptLearningGoalSelect) {
          deps.manuscriptLearningGoalSelect.value = String(learningGoalID);
        }

        // Fill question code select for this subject
        if (typeof deps.fillQuestionCodeSelect === "function") {
          deps.fillQuestionCodeSelect(
            deps.manuscriptQuestionCodeSelect,
            subjectID,
            true,
          );
        }

        // Set question code value
        const questionCodeID = Number(item.question_code_id || 0);
        if (deps.manuscriptQuestionCodeSelect) {
          deps.manuscriptQuestionCodeSelect.value =
            questionCodeID > 0 ? String(questionCodeID) : "";
          deps.manuscriptQuestionCodeSelect.disabled = false;
        }
      }
    }

    applyTypeUI(true);
    const stimulusType = String((item && item.stimulus_type) || "single")
      .trim()
      .toLowerCase();
    const stimulusContent =
      item && item.stimulus_content && typeof item.stimulus_content === "object"
        ? item.stimulus_content
        : null;
    if (deps.manuscriptStimulusType) {
      deps.manuscriptStimulusType.value =
        stimulusType === "multiteks" ? "multiteks" : "single";
    }
    if (stimulusType === "multiteks") {
      const tabs =
        stimulusContent && Array.isArray(stimulusContent.tabs)
          ? stimulusContent.tabs
          : [];
      setStimulusTabRows(tabs);
      setQuillHTMLValue(manuscriptStimulusQuill, "");
    } else {
      const body =
        stimulusContent && typeof stimulusContent.body === "string"
          ? stimulusContent.body
          : item.stimulus_html;
      setQuillHTMLValue(manuscriptStimulusQuill, body);
      if (deps.manuscriptStimulusTabsWrap) {
        deps.manuscriptStimulusTabsWrap.innerHTML = "";
      }
      ensureStimulusTabRows();
    }
    applyStimulusTypeUI();
    setQuillHTMLValue(manuscriptStemQuill, item.stem_html);
    setQuillHTMLValue(manuscriptExplanationQuill, item.explanation_html);
    setQuillHTMLValue(manuscriptHintQuill, item.hint_html);
    syncHiddenInputs();

    const keyObj = parseAnswerKeyObject(item.answer_key);
    const contentObj =
      item && item.question_content && typeof item.question_content === "object"
        ? item.question_content
        : {};
    if (currentManuscriptQuestionType === "benar_salah_pernyataan") {
      renderTFStatementsFromData(keyObj.statements);
    } else if (currentManuscriptQuestionType === "menjodohkan_drag_drop") {
      renderMatchRowsFromData("prompt", contentObj.prompts);
      renderMatchRowsFromData("choice", contentObj.choices);
      if (deps && deps.manuscriptMatchNoteHTML) {
        deps.manuscriptMatchNoteHTML.value = String(contentObj.note_html || "");
      }
    } else if (currentManuscriptQuestionType === "short_answer") {
      if (deps && deps.manuscriptShortAnswerPlaceholder) {
        deps.manuscriptShortAnswerPlaceholder.value = String(
          contentObj.placeholder || "",
        );
      }
      if (deps && deps.manuscriptShortAnswerInputType) {
        deps.manuscriptShortAnswerInputType.value = String(
          contentObj.input_type || "textarea",
        )
          .trim()
          .toLowerCase();
      }
      if (deps && deps.manuscriptShortAnswerMaxLength) {
        deps.manuscriptShortAnswerMaxLength.value = String(
          Number(contentObj.max_length || 33) || 33,
        );
      }
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
    const rawQuestionType = String(item.question_type || "")
      .trim()
      .toLowerCase();
    const stem = String(item.stem_html || "").trim();
    const explanation = String(item.explanation_html || "").trim();
    const hint = String(item.hint_html || "").trim();
    const options = Array.isArray(item.options) ? item.options : [];
    const questionContent =
      item && item.question_content && typeof item.question_content === "object"
        ? item.question_content
        : {};
    const statements = Array.isArray(keyObj && keyObj.statements)
      ? keyObj.statements
      : [];
    const questionType = (function () {
      if (rawQuestionType) return rawQuestionType;
      if (Array.isArray(keyObj && keyObj.correct)) return "multi_jawaban";
      if (typeof (keyObj && keyObj.correct) === "string") return "pg_tunggal";
      if (Array.isArray(keyObj && keyObj.statements)) {
        return "benar_salah_pernyataan";
      }
      if (Array.isArray(keyObj && keyObj.pairs)) {
        return "menjodohkan_drag_drop";
      }
      if (Array.isArray(keyObj && keyObj.accepted_answers)) {
        return "short_answer";
      }
      return "";
    })();
    const stimulusHTML = String(item.stimulus_html || "").trim()
      ? String(item.stimulus_html || "").trim()
      : '<div class="muted">(tanpa stimulus)</div>';
    const infoCode = deps.resolveManuscriptQuestionCode
      ? deps.resolveManuscriptQuestionCode(item)
      : "";
    const infoTypeRaw = deps.resolveManuscriptQuestionType
      ? deps.resolveManuscriptQuestionType(item)
      : questionType;
    const infoType = deps.shortQuestionType
      ? deps.shortQuestionType(infoTypeRaw)
      : infoTypeRaw;
    const infoGoal = deps.resolveManuscriptLearningGoal
      ? deps.resolveManuscriptLearningGoal(item)
      : "";
    const infoCodeHTML = infoCode
      ? deps.escapeHtml(String(infoCode))
      : '<span class="muted">-</span>';
    const infoTypeHTML = infoType
      ? deps.escapeHtml(String(infoType))
      : '<span class="muted">-</span>';
    const infoGoalHTML = infoGoal
      ? deps.escapeHtml(String(infoGoal))
      : '<span class="muted">-</span>';
    const optionsHTML = options.length
      ? "<ol>" +
        options
          .map(function (it) {
            const key = deps.escapeHtml(String((it && it.option_key) || ""));
            const html = String((it && it.option_html) || "");
            return "<li><strong>" + key + "</strong> " + html + "</li>";
          })
          .join("") +
        "</ol>"
      : '<div class="muted">Tidak ada opsi tersimpan.</div>';
    const statementsHTML = statements.length
      ? "<ol>" +
        statements
          .map(function (it) {
            const id = deps.escapeHtml(String((it && it.id) || "-"));
            const text = deps.escapeHtml(String((it && it.statement) || ""));
            return "<li><strong>" + id + "</strong> " + text + "</li>";
          })
          .join("") +
        "</ol>"
      : '<div class="muted">Tidak ada pernyataan tersimpan.</div>';
    const matchPrompts = Array.isArray(questionContent.prompts)
      ? questionContent.prompts
      : [];
    const matchChoices = Array.isArray(questionContent.choices)
      ? questionContent.choices
      : [];
    const matchingHTML =
      "<div><strong>Prompt</strong></div>" +
      (matchPrompts.length
        ? "<ol>" +
          matchPrompts
            .map(function (it) {
              return (
                "<li><strong>" +
                deps.escapeHtml(String(it.id || "")) +
                "</strong> " +
                String(it.html || "") +
                "</li>"
              );
            })
            .join("") +
          "</ol>"
        : '<div class="muted">Tidak ada prompt tersimpan.</div>') +
      '<div class="mt"><strong>Choice</strong></div>' +
      (matchChoices.length
        ? "<ol>" +
          matchChoices
            .map(function (it) {
              return (
                "<li><strong>" +
                deps.escapeHtml(String(it.id || "")) +
                "</strong> " +
                String(it.html || "") +
                "</li>"
              );
            })
            .join("") +
          "</ol>"
        : '<div class="muted">Tidak ada choice tersimpan.</div>') +
      (questionContent.note_html
        ? '<div class="mt"><strong>Catatan:</strong><div class="box mt">' +
          String(questionContent.note_html) +
          "</div></div>"
        : "");
    const shortAnswerContentHTML =
      '<div class="box">' +
      "<div><strong>Placeholder:</strong> " +
      deps.escapeHtml(String(questionContent.placeholder || "-")) +
      '</div><div class="mt"><strong>Input:</strong> ' +
      deps.escapeHtml(
        String(questionContent.input_type || "textarea").toLowerCase(),
      ) +
      '</div><div class="mt"><strong>Maksimal Karakter:</strong> ' +
      deps.escapeHtml(String(questionContent.max_length || 33)) +
      "</div></div>";
    const correctKeysFromOptions = options
      .filter(function (it) {
        return it && it.is_correct === true;
      })
      .map(function (it) {
        return String((it && it.option_key) || "").trim();
      })
      .filter(Boolean);
    const answerKeyHTML = (function () {
      if (questionType === "pg_tunggal") {
        const fromKey = String(keyObj.correct || "").trim();
        const correct = deps.escapeHtml(
          fromKey || String(correctKeysFromOptions[0] || "").trim(),
        );
        return correct
          ? '<div class="answer-key-value">' + correct + "</div>"
          : '<div class="muted">Kunci jawaban belum diisi.</div>';
      }
      if (questionType === "multi_jawaban") {
        const correctList = Array.isArray(keyObj.correct)
          ? keyObj.correct
              .map(function (it) {
                return String(it || "").trim();
              })
              .filter(Boolean)
          : [];
        const merged = correctList.length
          ? correctList
          : correctKeysFromOptions;
        return correctList.length
          ? '<div class="answer-key-value">' +
              deps.escapeHtml(merged.join(", ")) +
              "</div>"
          : '<div class="muted">Kunci jawaban belum diisi.</div>';
      }
      if (questionType === "benar_salah_pernyataan") {
        return statements.length
          ? "<ol>" +
              statements
                .map(function (it) {
                  const id = deps.escapeHtml(String((it && it.id) || "-"));
                  const keyLabel =
                    (it && it.correct) === true ? "Benar" : "Salah";
                  return (
                    "<li><strong>" +
                    id +
                    "</strong> " +
                    deps.escapeHtml(keyLabel) +
                    "</li>"
                  );
                })
                .join("") +
              "</ol>"
          : '<div class="muted">Kunci jawaban belum diisi.</div>';
      }
      if (questionType === "menjodohkan_drag_drop") {
        return Array.isArray(keyObj.pairs) && keyObj.pairs.length
          ? "<ol>" +
              keyObj.pairs
                .map(function (it) {
                  return (
                    "<li><strong>" +
                    deps.escapeHtml(String((it && it.prompt_id) || "-")) +
                    "</strong> -> " +
                    deps.escapeHtml(String((it && it.choice_id) || "-")) +
                    "</li>"
                  );
                })
                .join("") +
              "</ol>"
          : '<div class="muted">Kunci jawaban belum diisi.</div>';
      }
      if (questionType === "short_answer") {
        return Array.isArray(keyObj.accepted_answers) &&
          keyObj.accepted_answers.length
          ? "<ol>" +
              keyObj.accepted_answers
                .map(function (it) {
                  return "<li>" + deps.escapeHtml(String(it || "")) + "</li>";
                })
                .join("") +
              "</ol>"
          : '<div class="muted">Kunci jawaban belum diisi.</div>';
      }
      if (correctKeysFromOptions.length) {
        return (
          '<div class="answer-key-value">' +
          deps.escapeHtml(correctKeysFromOptions.join(", ")) +
          "</div>"
        );
      }
      return '<div class="muted">Kunci jawaban belum diisi.</div>';
    })();
    const optionSectionHTML =
      questionType === "menjodohkan_drag_drop"
        ? matchingHTML
        : questionType === "short_answer"
          ? shortAnswerContentHTML
          : statements.length
            ? statementsHTML
            : optionsHTML;
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
      '<div class="mt">' +
        "<div><strong>Kode Soal:</strong> " +
        infoCodeHTML +
        "</div>" +
        '<div class="mt"><strong>Tipe Soal:</strong> ' +
        infoTypeHTML +
        "</div>" +
        '<div class="mt"><strong>Tujuan Pembelajaran:</strong> ' +
        infoGoalHTML +
        "</div>" +
        "</div>",
      '<div class="mt"><strong>Stimulus:</strong><div class="mt">' +
        stimulusHTML +
        "</div></div>",
      '<div class="mt"><strong>Rumusan Butir Soal:</strong><div class="mt">' +
        (stem || '<span class="muted">(kosong)</span>') +
        "</div></div>",
      '<div class="mt"><strong>Opsi Jawaban:</strong><div class="mt">' +
        optionSectionHTML +
        "</div></div>",
      '<div class="mt"><strong>Kunci Jawaban:</strong><div class="mt">' +
        answerKeyHTML +
        "</div></div>",
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
    var questionContentPayload = null;
    try {
      optionsPayload = validateOptions(collectOptions());
      if (selectedType === "menjodohkan_drag_drop") {
        questionContentPayload = collectMatchQuestionContent();
      } else if (selectedType === "short_answer") {
        questionContentPayload = collectShortAnswerQuestionContent();
      }
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
      const stimulusPayload = buildStimulusPayload();
      const stimulusHTML = String(stimulusPayload.html || "").trim();
      const payload = {
        stimulus_type: stimulusPayload.type,
        stimulus_content: stimulusPayload.content,
        stimulus_html: stimulusHTML,
        stem_html: stemHTML.trim(),
        question_content: questionContentPayload,
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
        stimulus_type: stimulusPayload.type,
        stimulus_content: stimulusPayload.content,
        stimulus_html: stimulusHTML,
        stem_html: stemHTML,
        explanation_html: payload.explanation_html,
        hint_html: payload.hint_html,
        question_content: questionContentPayload,
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
        showFormMessage(
          "Tidak ada perubahan pada naskah untuk disimpan.",
          4000,
        );
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
      if (deps.manuscriptStimulusTabsWrap) {
        deps.manuscriptStimulusTabsWrap.innerHTML = "";
      }
      if (deps.manuscriptMatchPromptsWrap) {
        deps.manuscriptMatchPromptsWrap.innerHTML = "";
      }
      if (deps.manuscriptMatchChoicesWrap) {
        deps.manuscriptMatchChoicesWrap.innerHTML = "";
      }
      if (deps.manuscriptMatchPairsWrap) {
        deps.manuscriptMatchPairsWrap.innerHTML = "";
      }
      if (deps.manuscriptMatchNoteHTML) {
        deps.manuscriptMatchNoteHTML.value = "";
      }
      if (deps.manuscriptShortAnswerAccepted) {
        deps.manuscriptShortAnswerAccepted.value = "";
      }
      if (deps.manuscriptShortAnswerPlaceholder) {
        deps.manuscriptShortAnswerPlaceholder.value = "";
      }
      if (deps.manuscriptShortAnswerInputType) {
        deps.manuscriptShortAnswerInputType.value = "textarea";
      }
      if (deps.manuscriptShortAnswerMaxLength) {
        deps.manuscriptShortAnswerMaxLength.value = "33";
      }
      ensureOptionRows();
      ensureTFStatementRows();
      ensureMatchRows("prompt");
      ensureMatchRows("choice");
      renderMatchPairRows();
      ensureStimulusTabRows();
      applyStimulusTypeUI();
      applyTypeUI(true);
      clearEditMode();
      showFormMessage(
        isEditMode
          ? "Naskah soal berhasil diperbarui."
          : "Naskah soal berhasil disimpan.",
        4000,
      );
      setMsg(
        isEditMode
          ? "Naskah soal berhasil diperbarui."
          : "Naskah soal berhasil disimpan.",
      );
    } catch (err) {
      showFormMessage(
        (isEditMode
          ? "Simpan perubahan naskah gagal: "
          : "Simpan naskah gagal: ") + err.message,
        5000,
      );
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
    showFormMessage("", 0);
    if (typeof deps.syncManuscriptSubjectState === "function") {
      deps.syncManuscriptSubjectState();
    }
    resetEditors();
    if (deps.manuscriptStatementsWrap)
      deps.manuscriptStatementsWrap.innerHTML = "";
    if (deps.manuscriptOptionsWrap) deps.manuscriptOptionsWrap.innerHTML = "";
    if (deps.manuscriptMatchPromptsWrap)
      deps.manuscriptMatchPromptsWrap.innerHTML = "";
    if (deps.manuscriptMatchChoicesWrap)
      deps.manuscriptMatchChoicesWrap.innerHTML = "";
    if (deps.manuscriptMatchPairsWrap)
      deps.manuscriptMatchPairsWrap.innerHTML = "";
    if (deps.manuscriptMatchNoteHTML) deps.manuscriptMatchNoteHTML.value = "";
    if (deps.manuscriptShortAnswerAccepted)
      deps.manuscriptShortAnswerAccepted.value = "";
    if (deps.manuscriptShortAnswerPlaceholder)
      deps.manuscriptShortAnswerPlaceholder.value = "";
    if (deps.manuscriptShortAnswerInputType)
      deps.manuscriptShortAnswerInputType.value = "textarea";
    if (deps.manuscriptShortAnswerMaxLength)
      deps.manuscriptShortAnswerMaxLength.value = "33";
    ensureOptionRows();
    ensureTFStatementRows();
    ensureMatchRows("prompt");
    ensureMatchRows("choice");
    renderMatchPairRows();
    applyTypeUI(true);
  }

  function onQuestionSelectChange() {
    clearEditMode();
    showFormMessage("", 0);
    if (typeof deps.syncManuscriptSubjectState === "function") {
      deps.syncManuscriptSubjectState();
    }
    applyTypeUI(true);
  }

  function onSubjectSelectChange() {
    clearEditMode();
    showFormMessage("", 0);
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

  function onStimulusTypeChange() {
    applyStimulusTypeUI();
  }

  function onFormChangeOrInput(e) {
    const target = e.target;
    if (!target) return;
    if (
      target.name === "manuscript_mc_key" ||
      target.name === "manuscript_mr_key" ||
      target === (deps && deps.manuscriptStimulusType) ||
      target.hasAttribute("data-option-key") ||
      target.hasAttribute("data-option-html") ||
      target.hasAttribute("data-stimulus-tab-title") ||
      target.hasAttribute("data-stimulus-tab-body") ||
      target.hasAttribute("data-statement-id") ||
      target.hasAttribute("data-statement-text") ||
      target.hasAttribute("data-statement-correct") ||
      target.hasAttribute("data-match-id") ||
      target.hasAttribute("data-match-html") ||
      target.hasAttribute("data-match-pair-prompt") ||
      target === (deps && deps.manuscriptMatchNoteHTML) ||
      target === (deps && deps.manuscriptShortAnswerAccepted) ||
      target === (deps && deps.manuscriptShortAnswerPlaceholder) ||
      target === (deps && deps.manuscriptShortAnswerInputType) ||
      target === (deps && deps.manuscriptShortAnswerMaxLength)
    ) {
      if (
        target.hasAttribute("data-option-key") ||
        target.hasAttribute("data-option-html")
      ) {
        renderKeyChoices();
      }
      if (
        target === (deps && deps.manuscriptStimulusType) ||
        target.hasAttribute("data-stimulus-tab-title") ||
        target.hasAttribute("data-stimulus-tab-body")
      ) {
        syncHiddenInputs();
      }
      if (
        target.hasAttribute("data-match-id") ||
        target.hasAttribute("data-match-html")
      ) {
        try {
          if (isMatchingQuestionTypeActive()) {
            renderMatchPairRows();
          }
        } catch (_) {
          // Ignore incomplete matching rows while user is editing.
        }
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
    if (deps.manuscriptStimulusType) {
      deps.manuscriptStimulusType.addEventListener(
        "change",
        onStimulusTypeChange,
      );
    }
    if (deps.manuscriptForm) {
      deps.manuscriptForm.addEventListener("submit", onSubmitForm);
      deps.manuscriptForm.addEventListener("change", onFormChangeOrInput);
      deps.manuscriptForm.addEventListener("input", onFormChangeOrInput);
    }
    const optionButtons = [
      deps.manuscriptAddOptionBtn,
      deps.manuscriptAddOptionBtnBottom,
    ].filter(Boolean);
    if (optionButtons.length) {
      optionButtons.forEach(function (btn) {
        btn.addEventListener("click", function () {
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
    if (deps.manuscriptAddStimulusTabBtn) {
      deps.manuscriptAddStimulusTabBtn.addEventListener("click", function () {
        appendStimulusTabRow({});
      });
    }
    if (deps.manuscriptStimulusTabsWrap) {
      deps.manuscriptStimulusTabsWrap.addEventListener(
        "dragstart",
        function (e) {
          const handle =
            e.target && e.target.closest("[data-stimulus-tab-drag-handle]");
          if (!handle) return;
          const row = handle.closest("[data-stimulus-tab-row]");
          if (!row) return;
          manuscriptDraggingStimulusTabRow = row;
          row.classList.add("is-dragging");
          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", "stimulus-tab");
          }
        },
      );
      deps.manuscriptStimulusTabsWrap.addEventListener(
        "dragover",
        function (e) {
          const targetRow =
            e.target && e.target.closest("[data-stimulus-tab-row]");
          if (!manuscriptDraggingStimulusTabRow || !targetRow) return;
          e.preventDefault();
          clearStimulusTabDropTargets();
          if (targetRow !== manuscriptDraggingStimulusTabRow) {
            targetRow.classList.add("is-drop-target");
          }
          if (e.dataTransfer) {
            e.dataTransfer.dropEffect = "move";
          }
        },
      );
      deps.manuscriptStimulusTabsWrap.addEventListener("drop", function (e) {
        const targetRow =
          e.target && e.target.closest("[data-stimulus-tab-row]");
        if (!manuscriptDraggingStimulusTabRow || !targetRow) return;
        e.preventDefault();
        clearStimulusTabDropTargets();
        if (manuscriptDraggingStimulusTabRow === targetRow) return;
        moveStimulusTabRowBefore(manuscriptDraggingStimulusTabRow, targetRow);
      });
      deps.manuscriptStimulusTabsWrap.addEventListener(
        "dragleave",
        function (e) {
          const targetRow =
            e.target && e.target.closest("[data-stimulus-tab-row]");
          if (!targetRow) return;
          targetRow.classList.remove("is-drop-target");
        },
      );
      deps.manuscriptStimulusTabsWrap.addEventListener("dragend", function () {
        clearStimulusTabDropTargets();
        if (manuscriptDraggingStimulusTabRow) {
          manuscriptDraggingStimulusTabRow.classList.remove("is-dragging");
        }
        manuscriptDraggingStimulusTabRow = null;
      });
      deps.manuscriptStimulusTabsWrap.addEventListener("click", function (e) {
        const target = e.target;
        const upBtn = target && target.closest("button[data-stimulus-tab-up]");
        if (upBtn) {
          const row = upBtn.closest("[data-stimulus-tab-row]");
          const prev = row && row.previousElementSibling;
          if (row && prev) {
            deps.manuscriptStimulusTabsWrap.insertBefore(row, prev);
            syncStimulusTabState();
          }
          return;
        }
        const downBtn =
          target && target.closest("button[data-stimulus-tab-down]");
        if (downBtn) {
          const row = downBtn.closest("[data-stimulus-tab-row]");
          const next = row && row.nextElementSibling;
          if (row && next) {
            deps.manuscriptStimulusTabsWrap.insertBefore(next, row);
            syncStimulusTabState();
          }
          return;
        }
        const btn =
          target && target.closest("button[data-stimulus-tab-remove]");
        if (!btn) return;
        const row = btn.closest("[data-stimulus-tab-row]");
        if (row) row.remove();
        ensureStimulusTabRows();
        syncStimulusTabState();
      });
    }
    const statementButtons = [
      deps.manuscriptAddStatementBtn,
      deps.manuscriptAddStatementBtnBottom,
    ].filter(Boolean);
    if (statementButtons.length) {
      statementButtons.forEach(function (btn) {
        btn.addEventListener("click", function () {
          if (!deps.manuscriptStatementsWrap) return;
          const idx =
            deps.manuscriptStatementsWrap.querySelectorAll(
              "[data-statement-row]",
            ).length || 0;
          deps.manuscriptStatementsWrap.insertAdjacentHTML(
            "beforeend",
            createTFStatementRow(
              { id: "S" + String(idx + 1), statement: "", correct: true },
              idx,
            ),
          );
          syncAnswerKeyPreview();
        });
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
    if (deps.manuscriptAddMatchPromptBtn) {
      deps.manuscriptAddMatchPromptBtn.addEventListener("click", function () {
        if (!deps.manuscriptMatchPromptsWrap) return;
        const idx =
          deps.manuscriptMatchPromptsWrap.querySelectorAll(
            '[data-match-row="prompt"]',
          ).length || 0;
        deps.manuscriptMatchPromptsWrap.insertAdjacentHTML(
          "beforeend",
          createMatchContentRow("prompt", null, idx),
        );
        if (isMatchingQuestionTypeActive()) {
          renderMatchPairRows();
        }
        syncAnswerKeyPreview();
      });
    }
    if (deps.manuscriptAddMatchChoiceBtn) {
      deps.manuscriptAddMatchChoiceBtn.addEventListener("click", function () {
        if (!deps.manuscriptMatchChoicesWrap) return;
        const idx =
          deps.manuscriptMatchChoicesWrap.querySelectorAll(
            '[data-match-row="choice"]',
          ).length || 0;
        deps.manuscriptMatchChoicesWrap.insertAdjacentHTML(
          "beforeend",
          createMatchContentRow("choice", null, idx),
        );
        if (isMatchingQuestionTypeActive()) {
          renderMatchPairRows();
        }
        syncAnswerKeyPreview();
      });
    }
    if (deps.manuscriptSyncMatchPairsBtn) {
      deps.manuscriptSyncMatchPairsBtn.addEventListener("click", function () {
        if (isMatchingQuestionTypeActive()) {
          renderMatchPairRows();
        }
        syncAnswerKeyPreview();
      });
    }
    if (deps.manuscriptMatchPromptsWrap) {
      deps.manuscriptMatchPromptsWrap.addEventListener("click", function (e) {
        const btn =
          e.target && e.target.closest('button[data-match-remove="prompt"]');
        if (!btn) return;
        const row = btn.closest('[data-match-row="prompt"]');
        if (row) row.remove();
        ensureMatchRows("prompt");
        if (isMatchingQuestionTypeActive()) {
          renderMatchPairRows();
        }
        syncAnswerKeyPreview();
      });
    }
    if (deps.manuscriptMatchChoicesWrap) {
      deps.manuscriptMatchChoicesWrap.addEventListener("click", function (e) {
        const btn =
          e.target && e.target.closest('button[data-match-remove="choice"]');
        if (!btn) return;
        const row = btn.closest('[data-match-row="choice"]');
        if (row) row.remove();
        ensureMatchRows("choice");
        if (isMatchingQuestionTypeActive()) {
          renderMatchPairRows();
        }
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
    ensureStimulusTabRows();
    applyStimulusTypeUI();
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
