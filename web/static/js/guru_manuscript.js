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
  var stimulusGroupCache = [];

  function setDeps(opts) {
    deps = opts || {};
  }

  function isChoiceQuestionType(type) {
    const qType = String(type || currentManuscriptQuestionType || "")
      .trim()
      .toLowerCase();
    return qType === "pg_tunggal" || qType === "multi_jawaban";
  }

  function getOptionLayoutValue() {
    if (!deps || !deps.manuscriptOptionLayout) return "standard";
    const raw = String(deps.manuscriptOptionLayout.value || "")
      .trim()
      .toLowerCase();
    return raw === "comparison" ? "comparison" : "standard";
  }

  function getDefaultComparisonLabel(side) {
    if (side === "right") return "Kolom Kanan";
    return "Kolom Kiri";
  }

  function readComparisonQuestionContent(questionContentObj) {
    const content =
      questionContentObj && typeof questionContentObj === "object"
        ? questionContentObj
        : {};
    const layout = String(content.layout || "")
      .trim()
      .toLowerCase();
    const rows = Array.isArray(content.options) ? content.options : [];
    return {
      active: layout === "comparison",
      leftLabel: String(content.left_label || "").trim(),
      rightLabel: String(content.right_label || "").trim(),
      options: rows
        .map(function (it) {
          return {
            option_key: String((it && it.option_key) || "")
              .trim()
              .toUpperCase(),
            left_html: String((it && it.left_html) || "").trim(),
            right_html: String((it && it.right_html) || "").trim(),
          };
        })
        .filter(function (it) {
          return it.option_key || it.left_html || it.right_html;
        }),
    };
  }

  function renderComparisonOptionHTML(optionLike, labels) {
    const opt = optionLike || {};
    const meta = labels || {};
    const leftLabel = String(meta.leftLabel || "").trim();
    const rightLabel = String(meta.rightLabel || "").trim();
    const leftHTML = String((opt && opt.left_html) || "").trim();
    const rightHTML = String((opt && opt.right_html) || "").trim();
    return [
      '<div class="option-comparison-content">',
      '<div class="option-comparison-table">',
      '<div class="option-comparison-head">' +
        deps.escapeHtml(leftLabel || getDefaultComparisonLabel("left")) +
        "</div>",
      '<div class="option-comparison-head">' +
        deps.escapeHtml(rightLabel || getDefaultComparisonLabel("right")) +
        "</div>",
      '<div class="option-comparison-cell">' +
        (leftHTML || '<span class="muted">-</span>') +
        "</div>",
      '<div class="option-comparison-cell">' +
        (rightHTML || '<span class="muted">-</span>') +
        "</div>",
      "</div>",
      "</div>",
    ].join("");
  }

  function syncOptionLayoutUI() {
    const isComparison =
      isChoiceQuestionType() && getOptionLayoutValue() === "comparison";
    if (deps && deps.manuscriptOptionComparisonFields) {
      deps.manuscriptOptionComparisonFields.hidden = !isComparison;
    }
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

  function getSelectedSubjectID() {
    return Number(
      (deps &&
        deps.manuscriptSubjectSelect &&
        deps.manuscriptSubjectSelect.value) ||
        0,
    );
  }

  function setStimulusGroupInfo(value) {
    if (!deps || !deps.manuscriptStimulusGroupInfo) return;
    deps.manuscriptStimulusGroupInfo.value = String(value || "").trim();
  }

  function setStimulusGroupStatus(value) {
    if (!deps || !deps.manuscriptStimulusGroupStatus) return;
    deps.manuscriptStimulusGroupStatus.textContent = String(value || "").trim();
  }

  function syncStimulusGroupQuickActions(groupID) {
    if (!deps || !deps.manuscriptStimulusGroupQuickActions) return;
    deps.manuscriptStimulusGroupQuickActions.hidden = Number(groupID || 0) <= 0;
  }

  function findStimulusGroupByID(id) {
    const target = Number(id || 0);
    if (target <= 0) return null;
    return stimulusGroupCache.find(function (it) {
      return Number((it && it.id) || 0) === target;
    });
  }

  function buildStimulusTextSnippet(rawHTML, fallback) {
    const source = String(rawHTML || fallback || "").trim();
    if (!source) return "";
    const holder = document.createElement("div");
    holder.innerHTML = source;
    const plain = String(holder.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!plain) return "";
    return plain.length > 60 ? plain.slice(0, 57) + "..." : plain;
  }

  function getStimulusGroupDisplayTitle(item) {
    const rawTitle = String((item && item.title) || "").trim();
    const normalizedTitle = rawTitle.toLowerCase();
    if (
      rawTitle &&
      normalizedTitle !== "pilih soal" &&
      normalizedTitle !== "stimulus" &&
      normalizedTitle !== "soal baru"
    ) {
      return rawTitle;
    }
    const content =
      item &&
      item.stimulus_content &&
      typeof item.stimulus_content === "object" &&
      typeof item.stimulus_content.body === "string"
        ? item.stimulus_content.body
        : "";
    const snippet = buildStimulusTextSnippet(
      item && item.stimulus_html,
      content,
    );
    return snippet || rawTitle || "Stimulus Group";
  }

  function getStimulusGroupLabel(item) {
    const title = getStimulusGroupDisplayTitle(item);
    const linked = Number((item && item.linked_questions) || 0);
    const groupID = Number((item && item.id) || 0);
    const suffix = linked > 0 ? String(linked) + " soal" : "belum dipakai";
    if (groupID > 0) {
      return "#" + String(groupID) + " - " + title + " (" + suffix + ")";
    }
    return title + " (" + suffix + ")";
  }

  function fillStimulusGroupSelect(selectedID) {
    if (!deps || !deps.manuscriptStimulusGroupSelect) return;
    const current = String(
      typeof selectedID !== "undefined"
        ? selectedID || ""
        : deps.manuscriptStimulusGroupSelect.value || "",
    );
    deps.manuscriptStimulusGroupSelect.innerHTML =
      '<option value="">Gunakan stimulus inline / tanpa stimulus group</option>';
    stimulusGroupCache.forEach(function (item) {
      const id = Number((item && item.id) || 0);
      if (id <= 0) return;
      const opt = document.createElement("option");
      opt.value = String(id);
      opt.textContent = getStimulusGroupLabel(item);
      if (current && current === String(id)) {
        opt.selected = true;
      }
      deps.manuscriptStimulusGroupSelect.appendChild(opt);
    });
  }

  function setStimulusEditorsDisabled(disabled) {
    const flag = !!disabled;
    if (
      manuscriptStimulusQuill &&
      typeof manuscriptStimulusQuill.enable === "function"
    ) {
      manuscriptStimulusQuill.enable(!flag);
    }
    if (deps && deps.manuscriptStimulusType) {
      deps.manuscriptStimulusType.disabled = flag;
    }
    if (deps && deps.manuscriptAddStimulusTabBtn) {
      deps.manuscriptAddStimulusTabBtn.disabled = flag;
    }
    if (deps && deps.manuscriptStimulusTabsWrap) {
      deps.manuscriptStimulusTabsWrap
        .querySelectorAll("input, textarea, button, select")
        .forEach(function (el) {
          if (el === deps.manuscriptStimulusGroupRefreshBtn) return;
          if (el === deps.manuscriptStimulusGroupCreateBtn) return;
          if (el === deps.manuscriptStimulusGroupClearBtn) return;
          el.disabled = flag;
        });
    }
  }

  function isStimulusGroupEditableInCurrentMode(groupID) {
    if (Number(groupID || 0) <= 0) return true;
    if (!deps || !deps.manuscriptEditingVersionNoInput) return false;
    return Number(deps.manuscriptEditingVersionNoInput.value || 0) > 0;
  }

  function refreshStimulusGroupEditorState(groupID, group) {
    const selected = Number(groupID || 0);
    if (selected <= 0) {
      setStimulusEditorsDisabled(false);
      setStimulusGroupInfo("Belum memilih stimulus group");
      setStimulusGroupStatus(
        "Editor stimulus masih aktif. Pilih stimulus group hanya jika stimulus ini akan dipakai bersama oleh beberapa soal.",
      );
      syncStimulusGroupQuickActions(0);
      return;
    }
    const selectedGroup = group || findStimulusGroupByID(selected);
    if (!selectedGroup) {
      setStimulusEditorsDisabled(false);
      setStimulusGroupInfo("Stimulus group tidak ditemukan di cache");
      setStimulusGroupStatus(
        "Editor stimulus tetap aktif karena stimulus group yang dipilih tidak ditemukan.",
      );
      syncStimulusGroupQuickActions(0);
      return;
    }
    const editable = isStimulusGroupEditableInCurrentMode(selected);
    setStimulusEditorsDisabled(!editable);
    setStimulusGroupInfo(getStimulusGroupLabel(selectedGroup));
    setStimulusGroupStatus(
      editable
        ? "Anda sedang mengedit stimulus group yang dipakai bersama. Perubahan stimulus akan ikut mengubah semua soal yang memakai group ini."
        : 'Stimulus mengikuti group yang dipilih. Editor stimulus di bawah dikunci; gunakan "Lepas Group" jika ingin kembali mengedit stimulus inline.',
    );
    syncStimulusGroupQuickActions(selected);
  }

  function applyStimulusGroupSelection(groupID) {
    const selected = Number(groupID || 0);
    if (deps && deps.manuscriptStimulusGroupSelect) {
      deps.manuscriptStimulusGroupSelect.value =
        selected > 0 ? String(selected) : "";
    }
    if (selected <= 0) {
      refreshStimulusGroupEditorState(0, null);
      return;
    }
    const group = findStimulusGroupByID(selected);
    if (!group) {
      refreshStimulusGroupEditorState(selected, null);
      return;
    }
    const stimulusType = String((group && group.stimulus_type) || "single")
      .trim()
      .toLowerCase();
    const stimulusContent =
      group &&
      group.stimulus_content &&
      typeof group.stimulus_content === "object"
        ? group.stimulus_content
        : null;
    if (deps && deps.manuscriptStimulusType) {
      deps.manuscriptStimulusType.value =
        stimulusType === "multiteks" ? "multiteks" : "single";
    }
    if (stimulusType === "multiteks") {
      setStimulusTabRows(
        stimulusContent && Array.isArray(stimulusContent.tabs)
          ? stimulusContent.tabs
          : [],
      );
      setQuillHTMLValue(manuscriptStimulusQuill, "");
    } else {
      const body =
        stimulusContent && typeof stimulusContent.body === "string"
          ? stimulusContent.body
          : String((group && group.stimulus_html) || "").trim();
      setQuillHTMLValue(manuscriptStimulusQuill, body);
      if (deps && deps.manuscriptStimulusTabsWrap) {
        deps.manuscriptStimulusTabsWrap.innerHTML = "";
      }
      ensureStimulusTabRows();
    }
    applyStimulusTypeUI();
    syncHiddenInputs();
    refreshStimulusGroupEditorState(selected, group);
  }

  async function loadStimulusGroups(selectedID) {
    if (!deps || typeof deps.api !== "function") return [];
    const subjectID = getSelectedSubjectID();
    if (subjectID <= 0) {
      stimulusGroupCache = [];
      fillStimulusGroupSelect("");
      applyStimulusGroupSelection(0);
      return [];
    }
    const items = await deps.api(
      "/api/v1/stimulus-groups?subject_id=" +
        encodeURIComponent(String(subjectID)),
      "GET",
    );
    stimulusGroupCache = Array.isArray(items) ? items.slice() : [];
    fillStimulusGroupSelect(selectedID);
    applyStimulusGroupSelection(selectedID || 0);
    return stimulusGroupCache;
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
    if (deps && deps.manuscriptOptionLayout) {
      deps.manuscriptOptionLayout.value = "standard";
    }
    if (deps && deps.manuscriptOptionLeftLabel) {
      deps.manuscriptOptionLeftLabel.value = "Ulasan Buku I";
    }
    if (deps && deps.manuscriptOptionRightLabel) {
      deps.manuscriptOptionRightLabel.value = "Ulasan Buku II";
    }
    if (deps && deps.manuscriptStimulusGroupSelect) {
      deps.manuscriptStimulusGroupSelect.value = "";
    }
    setStimulusEditorsDisabled(false);
    setStimulusGroupInfo("Belum memilih stimulus group");
    setStimulusGroupStatus(
      "Editor stimulus masih aktif. Pilih stimulus group hanya jika stimulus ini akan dipakai bersama oleh beberapa soal.",
    );
    syncStimulusGroupQuickActions(0);
    showFormMessage("", 0);
    ensureStimulusTabRows();
    applyStimulusTypeUI();
    applyTypeUI(false);
    syncOptionLayoutUI();
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
    const optionLayout = String((data && data.layout) || getOptionLayoutValue())
      .trim()
      .toLowerCase();
    const htmlValue = String((data && data.option_html) || "").trim();
    const leftHTML = String((data && data.left_html) || "").trim();
    const rightHTML = String((data && data.right_html) || "").trim();
    const editorHTML =
      optionLayout === "comparison"
        ? '<div class="option-comparison-editor-grid mt">' +
          '<div><label>Kolom Kiri</label><div class="quill-editor-shell mt"><div class="manuscript-option-left-editor"></div></div><input type="hidden" data-option-left-html value="' +
          deps.escapeHtml(leftHTML) +
          '" /></div>' +
          '<div><label>Kolom Kanan</label><div class="quill-editor-shell mt"><div class="manuscript-option-right-editor"></div></div><input type="hidden" data-option-right-html value="' +
          deps.escapeHtml(rightHTML) +
          '" /></div>' +
          "</div>"
        : '<label class="mt">Konten Opsi</label>' +
          '<div class="quill-editor-shell mt"><div class="manuscript-option-editor"></div></div>' +
          '<input type="hidden" data-option-html value="' +
          deps.escapeHtml(htmlValue) +
          '" />';
    return (
      '<div class="panel mt" data-option-row="1">' +
      '<label>Kode Opsi<input type="text" data-option-key value="' +
      deps.escapeHtml(key) +
      '" placeholder="A" maxlength="10" /></label>' +
      editorHTML +
      '<button type="button" class="btn btn-secondary btn-inline mt" data-option-remove="1">Hapus Opsi</button>' +
      "</div>"
    );
  }

  function bindOptionEditor(row) {
    if (!row || manuscriptOptionQuillByRow.has(row) || !window.Quill) return;
    if (!deps || typeof deps.createQuillEditor !== "function") return;
    const standardHost = row.querySelector(".manuscript-option-editor");
    const standardHidden = row.querySelector("[data-option-html]");
    const leftHost = row.querySelector(".manuscript-option-left-editor");
    const rightHost = row.querySelector(".manuscript-option-right-editor");
    const leftHidden = row.querySelector("[data-option-left-html]");
    const rightHidden = row.querySelector("[data-option-right-html]");
    const bindings = {};
    function bindSingle(host, hidden, placeholder, cacheKey) {
      if (!host || !hidden) return;
      const initialHTML = String(hidden.value || "").trim();
      const quill = deps.createQuillEditor(host, placeholder, {
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
      bindings[cacheKey] = quill;
    }
    bindSingle(standardHost, standardHidden, "Isi opsi jawaban...", "standard");
    bindSingle(leftHost, leftHidden, "Isi kolom kiri...", "left");
    bindSingle(rightHost, rightHidden, "Isi kolom kanan...", "right");
    if (Object.keys(bindings).length > 0) {
      manuscriptOptionQuillByRow.set(row, bindings);
    }
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
        createOptionRow({ option_key: "A" }, 0) +
        createOptionRow({ option_key: "B" }, 1);
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
      const leftInput = row.querySelector("[data-option-left-html]");
      const rightInput = row.querySelector("[data-option-right-html]");
      const key = String((keyInput && keyInput.value) || "").trim();
      if (getOptionLayoutValue() === "comparison") {
        const leftHTML = String((leftInput && leftInput.value) || "").trim();
        const rightHTML = String((rightInput && rightInput.value) || "").trim();
        return {
          option_key: key,
          left_html: leftHTML,
          right_html: rightHTML,
          option_html: renderComparisonOptionHTML(
            {
              left_html: leftHTML,
              right_html: rightHTML,
            },
            {
              leftLabel:
                deps && deps.manuscriptOptionLeftLabel
                  ? deps.manuscriptOptionLeftLabel.value
                  : "",
              rightLabel:
                deps && deps.manuscriptOptionRightLabel
                  ? deps.manuscriptOptionRightLabel.value
                  : "",
            },
          ),
        };
      }
      return {
        option_key: key,
        option_html: String((htmlInput && htmlInput.value) || "").trim(),
      };
    });
  }

  function readOptionRowsFromDOM() {
    const rows = Array.from(
      (deps &&
        deps.manuscriptOptionsWrap &&
        deps.manuscriptOptionsWrap.querySelectorAll("[data-option-row]")) ||
        [],
    );
    return rows.map(function (row) {
      const keyInput = row.querySelector("[data-option-key]");
      const htmlInput = row.querySelector("[data-option-html]");
      const leftInput = row.querySelector("[data-option-left-html]");
      const rightInput = row.querySelector("[data-option-right-html]");
      const standardHTML = String((htmlInput && htmlInput.value) || "").trim();
      return {
        option_key: String((keyInput && keyInput.value) || "").trim(),
        option_html: standardHTML,
        left_html:
          String((leftInput && leftInput.value) || "").trim() || standardHTML,
        right_html: String((rightInput && rightInput.value) || "").trim(),
      };
    });
  }

  function validateOptions(options) {
    const list = Array.isArray(options) ? options : [];
    const isChoiceType =
      currentManuscriptQuestionType === "pg_tunggal" ||
      currentManuscriptQuestionType === "multi_jawaban";
    const isComparison = getOptionLayoutValue() === "comparison";
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
      const leftHTML = String((it && it.left_html) || "").trim();
      const rightHTML = String((it && it.right_html) || "").trim();
      if (!key)
        throw new Error("Kode opsi baris " + String(idx + 1) + " wajib diisi.");
      if (seen[key]) throw new Error("Kode opsi duplikat: " + key);
      if (isComparison) {
        if (!leftHTML && !rightHTML) {
          throw new Error(
            "Minimal salah satu sisi tabel opsi " + key + " wajib diisi.",
          );
        }
      } else if (!body) {
        throw new Error("Konten opsi " + key + " wajib diisi.");
      }
      seen[key] = true;
    });
    return list.map(function (it) {
      const out = {
        option_key: String(it.option_key || "")
          .trim()
          .toUpperCase(),
        option_html: String(it.option_html || "").trim(),
      };
      if (isComparison) {
        out.left_html = String(it.left_html || "").trim();
        out.right_html = String(it.right_html || "").trim();
      }
      return out;
    });
  }

  function collectChoiceQuestionContent(options) {
    if (!isChoiceQuestionType()) return null;
    if (getOptionLayoutValue() !== "comparison") return null;
    return {
      layout: "comparison",
      left_label: String(
        (deps && deps.manuscriptOptionLeftLabel
          ? deps.manuscriptOptionLeftLabel.value
          : "") || getDefaultComparisonLabel("left"),
      ).trim(),
      right_label: String(
        (deps && deps.manuscriptOptionRightLabel
          ? deps.manuscriptOptionRightLabel.value
          : "") || getDefaultComparisonLabel("right"),
      ).trim(),
      options: (Array.isArray(options) ? options : []).map(function (it) {
        return {
          option_key: String((it && it.option_key) || "")
            .trim()
            .toUpperCase(),
          left_html: String((it && it.left_html) || "").trim(),
          right_html: String((it && it.right_html) || "").trim(),
        };
      }),
    };
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
      deps.manuscriptOptionsPanel.hidden = !isChoiceQuestionType(
        currentManuscriptQuestionType,
      );
    }
    syncOptionLayoutUI();
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
    refreshStimulusGroupEditorState(
      deps && deps.manuscriptStimulusGroupSelect
        ? Number(deps.manuscriptStimulusGroupSelect.value || 0)
        : 0,
      null,
    );
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
    refreshStimulusGroupEditorState(
      deps && deps.manuscriptStimulusGroupSelect
        ? Number(deps.manuscriptStimulusGroupSelect.value || 0)
        : 0,
      null,
    );
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
      String(questionContentObj.layout || "")
        .trim()
        .toLowerCase() === "comparison"
    ) {
      return {
        layout: "comparison",
        left_label: String(questionContentObj.left_label || "").trim(),
        right_label: String(questionContentObj.right_label || "").trim(),
        options: (Array.isArray(questionContentObj.options)
          ? questionContentObj.options
          : []
        )
          .map(function (it) {
            return {
              option_key: String((it && it.option_key) || "")
                .trim()
                .toUpperCase(),
              left_html: String((it && it.left_html) || "").trim(),
              right_html: String((it && it.right_html) || "").trim(),
            };
          })
          .sort(function (a, b) {
            return a.option_key.localeCompare(b.option_key);
          }),
      };
    }
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
        const out = {
          option_key: String((it && it.option_key) || "")
            .trim()
            .toUpperCase(),
          option_html: String((it && it.option_html) || "").trim(),
        };
        if (
          Object.prototype.hasOwnProperty.call(it || {}, "left_html") ||
          Object.prototype.hasOwnProperty.call(it || {}, "right_html")
        ) {
          out.left_html = String((it && it.left_html) || "").trim();
          out.right_html = String((it && it.right_html) || "").trim();
        }
        return out;
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
      stimulus_group_id: Number((item && item.stimulus_group_id) || 0),
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
      stimulus_group_id: Number((data && data.stimulus_group_id) || 0),
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
      a.stimulus_group_id === b.stimulus_group_id &&
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

  function renderOptionsFromData(options, questionContentObj) {
    if (!deps || !deps.manuscriptOptionsWrap) return;
    const list = Array.isArray(options) ? options : [];
    const comparison = readComparisonQuestionContent(questionContentObj);
    if (deps.manuscriptOptionLayout) {
      deps.manuscriptOptionLayout.value = comparison.active
        ? "comparison"
        : "standard";
    }
    if (deps.manuscriptOptionLeftLabel) {
      deps.manuscriptOptionLeftLabel.value =
        comparison.leftLabel || "Ulasan Buku I";
    }
    if (deps.manuscriptOptionRightLabel) {
      deps.manuscriptOptionRightLabel.value =
        comparison.rightLabel || "Ulasan Buku II";
    }
    syncOptionLayoutUI();
    if (!list.length) {
      ensureOptionRows();
      return;
    }
    deps.manuscriptOptionsWrap.innerHTML = list
      .map(function (it, idx) {
        if (comparison.active) {
          const found = comparison.options.find(function (row) {
            return (
              String((row && row.option_key) || "")
                .trim()
                .toUpperCase() ===
              String((it && it.option_key) || "")
                .trim()
                .toUpperCase()
            );
          });
          return createOptionRow(
            Object.assign({}, it || {}, found || {}, {
              layout: "comparison",
            }),
            idx,
          );
        }
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
    const stimulusGroupID = Number((item && item.stimulus_group_id) || 0);
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
    if (subjectID > 0) {
      loadStimulusGroups(stimulusGroupID > 0 ? stimulusGroupID : 0).catch(
        function () {
          setStimulusGroupInfo("Gagal memuat stimulus group");
          setStimulusGroupStatus(
            "Daftar stimulus group gagal dimuat. Editor stimulus tetap bisa dipakai secara inline.",
          );
        },
      );
    } else {
      applyStimulusGroupSelection(stimulusGroupID);
    }
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
      renderOptionsFromData(item.options, item.question_content);
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
    const comparison = readComparisonQuestionContent(questionContent);
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
      ? comparison.active
        ? '<div class="option-preview-list">' +
          options
            .map(function (it) {
              const key = String((it && it.option_key) || "")
                .trim()
                .toUpperCase();
              const row = comparison.options.find(function (entry) {
                return (
                  String((entry && entry.option_key) || "")
                    .trim()
                    .toUpperCase() === key
                );
              });
              const inputType =
                questionType === "multi_jawaban" ? "checkbox" : "radio";
              return (
                '<label class="option-row option-row-comparison">' +
                '<input type="' +
                inputType +
                '" disabled />' +
                renderComparisonOptionHTML(row || {}, {
                  leftLabel: comparison.leftLabel,
                  rightLabel: comparison.rightLabel,
                }) +
                "</label>"
              );
            })
            .join("") +
          "</div>"
        : "<ol>" +
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
    const selectedSubjectID = Number(fd.get("subject_id") || 0);
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
    const selectedStimulusGroupID = Number(
      (deps &&
        deps.manuscriptStimulusGroupSelect &&
        deps.manuscriptStimulusGroupSelect.value) ||
        0,
    );
    if (!selectedType) {
      setMsg("Tipe Soal wajib dipilih.");
      return;
    }
    const forceNewQuestionFromStimulus =
      !isEditMode &&
      selectedStimulusGroupID > 0 &&
      blueprintType &&
      selectedType !== blueprintType;
    if (
      blueprintType &&
      selectedType !== blueprintType &&
      !forceNewQuestionFromStimulus
    ) {
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
      if (isChoiceQuestionType(selectedType)) {
        questionContentPayload = collectChoiceQuestionContent(optionsPayload);
      }
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
        : forceNewQuestionFromStimulus
          ? 0
          : Number(fd.get("question_id") || 0);
      const selectedQuestionCodeID = Number(fd.get("question_code_id") || 0);
      const selectedLearningGoalID = Number(fd.get("learning_goal_id") || 0);
      var blueprintChanged = false;
      if (!isEditMode) {
        const ensureQuestionFn =
          typeof deps.ensureQuestionForManuscriptSubmission === "function"
            ? deps.ensureQuestionForManuscriptSubmission
            : typeof deps.ensureQuestionForSubmission === "function"
              ? deps.ensureQuestionForSubmission
              : null;
        if (!ensureQuestionFn) {
          throw new Error("Tidak bisa membuat soal baru.");
        }
        if (
          forceNewQuestionFromStimulus &&
          deps &&
          deps.manuscriptQuestionSelect
        ) {
          deps.manuscriptQuestionSelect.value = "";
        }
        questionID = await ensureQuestionFn({
          question_id: questionID,
          subject_id: selectedSubjectID,
          learning_goal_id: selectedLearningGoalID,
          question_code_id: selectedQuestionCodeID,
          question_type: selectedType,
          stem_html: stemHTML,
        });
        if (typeof deps.loadBlueprints === "function") {
          await deps.loadBlueprints(selectedSubjectID);
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
      if (isEditMode && selectedStimulusGroupID > 0) {
        const selectedGroup = findStimulusGroupByID(selectedStimulusGroupID);
        const nextTitle =
          buildStimulusTextSnippet(
            stimulusHTML,
            stimulusPayload.content && stimulusPayload.content.body,
          ) ||
          getStimulusGroupDisplayTitle(selectedGroup) ||
          "Stimulus Group";
        await deps.api(
          "/api/v1/stimulus-groups/" + selectedStimulusGroupID,
          "PUT",
          {
            subject_id: Number(fd.get("subject_id") || 0),
            title: nextTitle,
            stimulus_type: stimulusPayload.type,
            stimulus_content: stimulusPayload.content,
            stimulus_html: stimulusHTML,
          },
        );
        await loadStimulusGroups(selectedStimulusGroupID);
      }
      const payload = {
        stimulus_group_id:
          selectedStimulusGroupID > 0 ? selectedStimulusGroupID : null,
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
        stimulus_group_id:
          selectedStimulusGroupID > 0 ? selectedStimulusGroupID : null,
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
      if (typeof deps.loadBlueprints === "function") {
        await deps.loadBlueprints(selectedSubjectID);
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
      const nextDraftContext =
        !isEditMode && selectedStimulusGroupID > 0
          ? {
              subjectID: Number(fd.get("subject_id") || 0),
              learningGoalID: selectedLearningGoalID,
              questionCodeID: selectedQuestionCodeID,
              stimulusGroupID: selectedStimulusGroupID,
            }
          : null;
      if (nextDraftContext) {
        await primeDraftContext(nextDraftContext, "");
      } else {
        resetEditors();
        deps.manuscriptForm.reset();
        if (typeof deps.syncManuscriptSubjectState === "function") {
          deps.syncManuscriptSubjectState();
        }
        await loadStimulusGroups(0).catch(function () {
          setStimulusGroupInfo("Gagal memuat stimulus group");
          setStimulusGroupStatus(
            "Daftar stimulus group gagal dimuat. Editor stimulus tetap bisa dipakai secara inline.",
          );
        });
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
      }
      showFormMessage(
        isEditMode
          ? "Naskah soal berhasil diperbarui."
          : nextDraftContext
            ? "Naskah soal berhasil disimpan. Stimulus group tetap aktif; pilih tipe soal berikutnya dari panel stimulus."
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
      if (typeof deps.loadBlueprints === "function") {
        await deps.loadBlueprints(
          Number(
            (deps &&
              deps.manuscriptSubjectSelect &&
              deps.manuscriptSubjectSelect.value) ||
              0,
          ),
        );
      }
      const versions =
        typeof deps.loadAllManuscriptVersionsFromBlueprints === "function"
          ? await deps.loadAllManuscriptVersionsFromBlueprints()
          : [];
      if (Array.isArray(versions) && versions.length > 0) {
        if (typeof deps.renderManuscripts === "function") {
          deps.renderManuscripts(versions);
        }
      } else if (
        typeof deps.reloadManuscriptsByCurrentTableScope === "function"
      ) {
        await deps.reloadManuscriptsByCurrentTableScope(
          Number(
            (deps &&
              deps.manuscriptQuestionSelect &&
              deps.manuscriptQuestionSelect.value) ||
              0,
          ),
        );
      } else if (typeof deps.renderManuscripts === "function") {
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
    loadStimulusGroups(0).catch(function () {
      setStimulusGroupInfo("Gagal memuat stimulus group");
      setStimulusGroupStatus(
        "Daftar stimulus group gagal dimuat. Editor stimulus tetap bisa dipakai secara inline.",
      );
    });
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
    loadStimulusGroups(0).catch(function () {
      setStimulusGroupInfo("Gagal memuat stimulus group");
      setStimulusGroupStatus(
        "Daftar stimulus group gagal dimuat. Editor stimulus tetap bisa dipakai secara inline.",
      );
    });
  }

  function onQuestionTypeChange() {
    applyTypeUI(false);
  }

  function collectDraftContext() {
    return {
      subjectID: Number(
        (deps &&
          deps.manuscriptSubjectSelect &&
          deps.manuscriptSubjectSelect.value) ||
          0,
      ),
      learningGoalID: Number(
        (deps &&
          deps.manuscriptLearningGoalSelect &&
          deps.manuscriptLearningGoalSelect.value) ||
          0,
      ),
      questionCodeID: Number(
        (deps &&
          deps.manuscriptQuestionCodeSelect &&
          deps.manuscriptQuestionCodeSelect.value) ||
          0,
      ),
      stimulusGroupID: Number(
        (deps &&
          deps.manuscriptStimulusGroupSelect &&
          deps.manuscriptStimulusGroupSelect.value) ||
          0,
      ),
    };
  }

  async function primeDraftContext(contextData, questionType) {
    const ctx = contextData || {};
    const subjectID = Number(ctx.subjectID || 0);
    const learningGoalID = Number(ctx.learningGoalID || 0);
    const questionCodeID = Number(ctx.questionCodeID || 0);
    const stimulusGroupID = Number(ctx.stimulusGroupID || 0);
    const nextType = String(questionType || "")
      .trim()
      .toLowerCase();

    clearEditMode();
    if (deps && deps.manuscriptForm) {
      deps.manuscriptForm.reset();
    }
    resetEditors();
    if (deps && deps.manuscriptQuestionSelect) {
      deps.manuscriptQuestionSelect.value = "";
    }
    if (deps && deps.manuscriptSubjectSelect && subjectID > 0) {
      deps.manuscriptSubjectSelect.value = String(subjectID);
    }
    if (typeof deps.syncManuscriptSubjectState === "function") {
      deps.syncManuscriptSubjectState();
    }
    if (
      typeof deps.fillLearningGoalSelect === "function" &&
      deps.manuscriptLearningGoalSelect &&
      subjectID > 0
    ) {
      deps.fillLearningGoalSelect(deps.manuscriptLearningGoalSelect, subjectID);
    }
    if (deps && deps.manuscriptLearningGoalSelect) {
      deps.manuscriptLearningGoalSelect.value =
        learningGoalID > 0 ? String(learningGoalID) : "";
    }
    if (
      typeof deps.fillQuestionCodeSelect === "function" &&
      deps.manuscriptQuestionCodeSelect &&
      subjectID > 0
    ) {
      deps.fillQuestionCodeSelect(
        deps.manuscriptQuestionCodeSelect,
        subjectID,
        true,
      );
    }
    if (deps && deps.manuscriptQuestionCodeSelect) {
      deps.manuscriptQuestionCodeSelect.value =
        questionCodeID > 0 ? String(questionCodeID) : "";
    }
    if (deps && deps.manuscriptQuestionTypeUI) {
      deps.manuscriptQuestionTypeUI.value = nextType || "";
    }
    applyTypeUI(false);
    if (subjectID > 0) {
      await loadStimulusGroups(stimulusGroupID);
    } else {
      applyStimulusGroupSelection(stimulusGroupID);
    }
    if (
      deps &&
      deps.manuscriptStemEditor &&
      deps.manuscriptStemEditor.scrollIntoView
    ) {
      deps.manuscriptStemEditor.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
    if (
      manuscriptStemQuill &&
      typeof manuscriptStemQuill.focus === "function"
    ) {
      manuscriptStemQuill.focus();
    }
  }

  async function startDraftFromStimulusGroup(questionType) {
    const ctx = collectDraftContext();
    if (ctx.subjectID <= 0) {
      showFormMessage("Pilih mapel terlebih dahulu.", 3000);
      return;
    }
    if (ctx.learningGoalID <= 0) {
      showFormMessage(
        "Pilih tujuan pembelajaran terlebih dahulu sebelum menambah butir baru.",
        4000,
      );
      return;
    }
    if (ctx.stimulusGroupID <= 0) {
      showFormMessage("Pilih atau buat stimulus group terlebih dahulu.", 4000);
      return;
    }
    try {
      await primeDraftContext(ctx, questionType);
      showFormMessage(
        "Butir soal baru siap. Stimulus group tetap dipakai untuk soal ini.",
        3500,
      );
      setMsg("");
    } catch (err) {
      showFormMessage("Gagal menyiapkan butir soal baru: " + err.message, 5000);
    }
  }

  function rebuildOptionRowsForLayoutChange() {
    if (!deps || !deps.manuscriptOptionsWrap) return;
    const currentOptions = readOptionRowsFromDOM();
    const selectedMC = document.querySelector(
      'input[name="manuscript_mc_key"]:checked',
    );
    const selectedMR = Array.from(
      document.querySelectorAll('input[name="manuscript_mr_key"]:checked'),
    ).map(function (el) {
      return String(el.value || "")
        .trim()
        .toUpperCase();
    });
    const nextLayout = getOptionLayoutValue();
    deps.manuscriptOptionsWrap.innerHTML = (
      Array.isArray(currentOptions) ? currentOptions : []
    )
      .map(function (it, idx) {
        const nextItem = Object.assign({}, it || {});
        if (
          nextLayout === "standard" &&
          !String(nextItem.option_html || "").trim() &&
          (String(nextItem.left_html || "").trim() ||
            String(nextItem.right_html || "").trim())
        ) {
          nextItem.option_html = renderComparisonOptionHTML(nextItem, {
            leftLabel:
              deps && deps.manuscriptOptionLeftLabel
                ? deps.manuscriptOptionLeftLabel.value
                : "",
            rightLabel:
              deps && deps.manuscriptOptionRightLabel
                ? deps.manuscriptOptionRightLabel.value
                : "",
          });
        }
        return createOptionRow(nextItem, idx);
      })
      .join("");
    ensureOptionRows();
    renderKeyChoices();
    if (
      selectedMC &&
      deps.manuscriptKeyMCOptions &&
      deps.manuscriptKeyMCOptions.querySelector
    ) {
      const target = deps.manuscriptKeyMCOptions.querySelector(
        'input[name="manuscript_mc_key"][value="' +
          String(selectedMC.value || "")
            .trim()
            .toUpperCase() +
          '"]',
      );
      if (target) target.checked = true;
    }
    if (deps.manuscriptKeyMROptions) {
      deps.manuscriptKeyMROptions
        .querySelectorAll('input[name="manuscript_mr_key"]')
        .forEach(function (el) {
          el.checked = selectedMR.includes(
            String(el.value || "")
              .trim()
              .toUpperCase(),
          );
        });
    }
    syncAnswerKeyPreview();
  }

  function onOptionLayoutChange() {
    syncOptionLayoutUI();
    rebuildOptionRowsForLayoutChange();
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
      target === (deps && deps.manuscriptOptionLayout) ||
      target === (deps && deps.manuscriptOptionLeftLabel) ||
      target === (deps && deps.manuscriptOptionRightLabel) ||
      target.hasAttribute("data-option-key") ||
      target.hasAttribute("data-option-html") ||
      target.hasAttribute("data-option-left-html") ||
      target.hasAttribute("data-option-right-html") ||
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
        target.hasAttribute("data-option-html") ||
        target.hasAttribute("data-option-left-html") ||
        target.hasAttribute("data-option-right-html") ||
        target === (deps && deps.manuscriptOptionLeftLabel) ||
        target === (deps && deps.manuscriptOptionRightLabel)
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
    if (deps.manuscriptStimulusGroupSelect) {
      deps.manuscriptStimulusGroupSelect.addEventListener(
        "change",
        function () {
          applyStimulusGroupSelection(
            Number(deps.manuscriptStimulusGroupSelect.value || 0),
          );
        },
      );
    }
    if (deps.manuscriptStimulusGroupRefreshBtn) {
      deps.manuscriptStimulusGroupRefreshBtn.addEventListener(
        "click",
        async function () {
          const done = deps.beginBusy(
            deps.manuscriptStimulusGroupRefreshBtn,
            deps.msg,
            "Memuat stimulus group...",
          );
          try {
            await loadStimulusGroups(
              Number(
                (deps.manuscriptStimulusGroupSelect &&
                  deps.manuscriptStimulusGroupSelect.value) ||
                  0,
              ),
            );
            showFormMessage("Stimulus group berhasil dimuat.", 2500);
          } catch (err) {
            showFormMessage(
              "Gagal memuat stimulus group: " + err.message,
              4000,
            );
          } finally {
            setMsg("");
            done();
          }
        },
      );
    }
    if (deps.manuscriptStimulusGroupClearBtn) {
      deps.manuscriptStimulusGroupClearBtn.addEventListener(
        "click",
        function () {
          applyStimulusGroupSelection(0);
          syncHiddenInputs();
        },
      );
    }
    if (deps.manuscriptStimulusGroupCreateBtn) {
      deps.manuscriptStimulusGroupCreateBtn.addEventListener(
        "click",
        async function () {
          const subjectID = getSelectedSubjectID();
          if (subjectID <= 0) {
            showFormMessage("Pilih mapel terlebih dahulu.", 3000);
            return;
          }
          const stimulusPayload = buildStimulusPayload();
          if (!stimulusPayload.html || !String(stimulusPayload.html).trim()) {
            showFormMessage(
              "Isi stimulus terlebih dahulu sebelum disimpan menjadi group.",
              4000,
            );
            return;
          }
          const titleSeed = buildStimulusTextSnippet(
            stimulusPayload.html,
            stimulusPayload.content && stimulusPayload.content.body,
          );
          const done = deps.beginBusy(
            deps.manuscriptStimulusGroupCreateBtn,
            deps.msg,
            "Menyimpan stimulus group...",
          );
          try {
            const created = await deps.api("/api/v1/stimulus-groups", "POST", {
              subject_id: subjectID,
              title: titleSeed || "Stimulus Baru",
              stimulus_type: stimulusPayload.type,
              stimulus_content: stimulusPayload.content,
              stimulus_html: String(stimulusPayload.html || "").trim(),
            });
            await loadStimulusGroups(Number((created && created.id) || 0));
            showFormMessage("Stimulus berhasil disimpan menjadi group.", 4000);
          } catch (err) {
            showFormMessage(
              "Gagal menyimpan stimulus group: " + err.message,
              5000,
            );
          } finally {
            setMsg("");
            done();
          }
        },
      );
    }
    if (deps.manuscriptStimulusGroupQuickActions) {
      deps.manuscriptStimulusGroupQuickActions.addEventListener(
        "click",
        function (e) {
          const btn =
            e.target && e.target.closest("[data-stimulus-group-quick-type]");
          if (!btn) return;
          startDraftFromStimulusGroup(
            btn.getAttribute("data-stimulus-group-quick-type") || "",
          );
        },
      );
    }
    if (deps.manuscriptOptionLayout) {
      deps.manuscriptOptionLayout.addEventListener(
        "change",
        onOptionLayoutChange,
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
            createOptionRow({ option_key: "" }, idx),
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
    applyTypeUI(false);
    loadStimulusGroups(0).catch(function () {
      setStimulusGroupInfo("Pilih mapel untuk memuat stimulus group");
      setStimulusGroupStatus(
        "Pilih mapel terlebih dahulu. Selama belum ada stimulus group yang dipilih, editor stimulus inline tetap aktif.",
      );
    });
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
