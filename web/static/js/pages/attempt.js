(function () {
  const core = window.AppCore || {};
  const api = core.api;
  const meOrNull = core.meOrNull;
  const text = core.text;
  const html = core.html;
  const escapeHtml = core.escapeHtml;
  const beginBusy = core.beginBusy;

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

  function readSelectedFromPayload(payload) {
    if (!payload || typeof payload !== "object") return [];
    const v = payload.selected;
    if (typeof v === "string") return v ? [v] : [];
    if (Array.isArray(v)) {
      return v.filter(function (x) {
        return typeof x === "string" && x.trim() !== "";
      });
    }
    return [];
  }

  function normalizeAttemptStemHTML(stemHTML) {
    let stem = String(stemHTML || "");
    stem = stem.replace(/^\s*<p>\s*draft naskah soal:\s*/i, "<p>");
    stem = stem.replace(/^\s*draft naskah soal:\s*/i, "");
    return stem;
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

  function readChoiceComparisonContent(q) {
    const content = parseJSONLoose(q && q.question_content, {});
    const layout = String((content && content.layout) || "")
      .trim()
      .toLowerCase();
    return {
      active: layout === "comparison",
      leftLabel: String((content && content.left_label) || "").trim(),
      rightLabel: String((content && content.right_label) || "").trim(),
      options:
        content && Array.isArray(content.options) ? content.options : [],
    };
  }

  function readMatchingContent(q) {
    const content = parseJSONLoose(q && q.question_content, {});
    return {
      prompts:
        content && Array.isArray(content.prompts) ? content.prompts : [],
      choices:
        content && Array.isArray(content.choices) ? content.choices : [],
      note_html: String((content && content.note_html) || "").trim(),
    };
  }

  function readShortAnswerContent(q) {
    const content = parseJSONLoose(q && q.question_content, {});
    return {
      placeholder: String((content && content.placeholder) || "").trim(),
      input_type: String((content && content.input_type) || "textarea")
        .trim()
        .toLowerCase(),
      max_length: Number((content && content.max_length) || 33) || 33,
    };
  }

  function readMatchingSelectionMap(payload) {
    const out = {};
    const pairs = Array.isArray(payload && payload.pairs)
      ? payload.pairs
      : [];
    pairs.forEach(function (pair) {
      if (!pair || typeof pair !== "object") return;
      const promptID = String(pair.prompt_id || "").trim();
      const choiceID = String(pair.choice_id || "").trim();
      if (!promptID || !choiceID) return;
      out[promptID] = choiceID;
    });
    return out;
  }

  function buildMatchingChoiceLookup(content) {
    const out = {};
    (Array.isArray(content && content.choices) ? content.choices : []).forEach(
      function (choice) {
        const choiceID = String((choice && choice.id) || "").trim();
        if (!choiceID) return;
        out[choiceID] = choice;
      },
    );
    return out;
  }

  function findMatchingPromptIDByChoice(selectionMap, choiceID) {
    const targetChoiceID = String(choiceID || "").trim();
    const promptIDs = Object.keys(selectionMap || {});
    for (let i = 0; i < promptIDs.length; i += 1) {
      const promptID = promptIDs[i];
      if (String(selectionMap[promptID] || "").trim() === targetChoiceID) {
        return promptID;
      }
    }
    return "";
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
      const answers = Array.isArray(payload && payload.answers)
        ? payload.answers
        : [];
      const answered = new Set();
      answers.forEach(function (a) {
        if (!a || typeof a !== "object") return;
        const id = String(a.id || "").trim();
        if (!id || !expected.has(id) || typeof a.value !== "boolean") return;
        answered.add(id);
      });
      return answered.size === expected.size;
    }
    if (qType === "menjodohkan_drag_drop") {
      const content = readMatchingContent(questionLike);
      if (!Array.isArray(content.prompts) || content.prompts.length === 0) {
        return false;
      }
      const expected = new Set(
        content.prompts
          .map(function (it) {
            return String((it && it.id) || "").trim();
          })
          .filter(Boolean),
      );
      const pairs = Array.isArray(payload && payload.pairs)
        ? payload.pairs
        : [];
      const answered = new Set();
      pairs.forEach(function (pair) {
        if (!pair || typeof pair !== "object") return;
        const promptID = String(pair.prompt_id || "").trim();
        const choiceID = String(pair.choice_id || "").trim();
        if (!promptID || !choiceID || !expected.has(promptID)) return;
        answered.add(promptID);
      });
      return answered.size === expected.size;
    }
    if (qType === "short_answer") {
      return typeof payload.text === "string" && payload.text.trim() !== "";
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
    if (v === "menjodohkan_drag_drop") return "Menjodohkan Drag-Drop";
    if (v === "short_answer") return "Short Answer";
    return v || "-";
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
    let currentPageNo = 1;
    let totalQuestions = 1;
    let totalPages = 1;
    let currentPage = null;
    let pageList = null;
    let remainInterval = null;
    let attemptEditable = true;
    let timeoutAutoSubmitFired = false;
    let submitInProgress = false;
    let attemptMathReady = false;
    let eventMessageTimer = null;
    let flushingEvents = false;
    const questionState = {};
    const questionToPage = {};
    const pendingEvents = [];
    const eventLastAt = {};
    const eventMinIntervalMs = {
      tab_blur: 5000,
      reconnect: 5000,
      fullscreen_exit: 5000,
      rapid_refresh: 15000,
    };
    const fontStorageKey = "cbtlms_attempt_font_size";

    const remainingLabel = document.getElementById("remaining-label");
    const message = document.getElementById("attempt-message");
    const attemptPageTitle = document.getElementById("attempt-page-title");
    const questionTitle = document.getElementById("question-title");
    const stimulusBox = document.getElementById("stimulus-box");
    const itemsBox = document.getElementById("question-items-box");
    const prevBtn = document.getElementById("prev-btn");
    const nextBtn = document.getElementById("next-btn");
    const submitBtn = document.getElementById("submit-btn");
    const actionsBar = document.querySelector(".actions");
    const daftarSoalBtn = document.getElementById("daftar-soal-btn");
    const daftarSoalPanel = document.getElementById("daftar-soal-panel");
    const daftarSoalBody = document.getElementById("daftar-soal-body");
    const fontSmallBtn = document.getElementById("font-small-btn");
    const fontMediumBtn = document.getElementById("font-medium-btn");
    const fontLargeBtn = document.getElementById("font-large-btn");
    const eventMessage = document.getElementById("attempt-event-message");
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
      [
        [fontSmallBtn, "small"],
        [fontMediumBtn, "medium"],
        [fontLargeBtn, "large"],
      ].forEach(function (item) {
        const btn = item[0];
        const btnValue = item[1];
        if (!btn) return;
        const active = value === btnValue;
        btn.classList.toggle("active", active);
        btn.setAttribute("aria-pressed", active ? "true" : "false");
      });
      try {
        window.localStorage.setItem(fontStorageKey, value);
      } catch (_) {}
    }

    function loadSavedFontSize() {
      try {
        return window.localStorage.getItem(fontStorageKey) || "medium";
      } catch (_) {
        return "medium";
      }
    }

    function notifyEvent(msg) {
      text(eventMessage, msg);
      if (eventMessageTimer) clearTimeout(eventMessageTimer);
      eventMessageTimer = setTimeout(function () {
        text(eventMessage, "");
      }, 2500);
    }

    function canSendEvent(eventType) {
      const now = Date.now();
      const minInterval = eventMinIntervalMs[eventType] || 5000;
      const last = eventLastAt[eventType] || 0;
      if (now - last < minInterval) return false;
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

    function closeQuestionList() {
      if (!daftarSoalPanel || !daftarSoalBtn) return;
      daftarSoalPanel.hidden = true;
      daftarSoalBtn.setAttribute("aria-expanded", "false");
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
        btn.classList.toggle("current", questionToPage[no] === currentPageNo);
        btn.classList.toggle("answered", !!state.answered);
        btn.classList.toggle("doubt", !!state.doubt);
      });
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
      const examTitleParts = [
        String(sum.exam_code || "").trim(),
        String(sum.title || "").trim(),
        String(sum.subject_name || "").trim(),
      ].filter(Boolean);
      text(
        attemptPageTitle,
        examTitleParts.join(" | ") || "Ujian #" + String(attemptID),
      );
      totalQuestions = Number(sum.total_questions || 1);
      totalPages = Number(sum.total_pages || totalQuestions || 1);
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
        if (remain <= 0 && attemptEditable) triggerTimeoutAutoSubmit();
      }, 1000);
      return sum;
    }

    async function loadPageList() {
      pageList = await api("/api/v1/attempts/" + attemptID + "/pages", "GET");
      totalPages = Number(pageList.total_pages || totalPages || 1);
      totalQuestions = Number(pageList.total_questions || totalQuestions || 1);
      (pageList.pages || []).forEach(function (page) {
        (page.question_nos || []).forEach(function (no) {
          questionToPage[Number(no || 0)] = Number(page.page_no || 0);
        });
      });
      ensureQuestionList();
      renderQuestionListState();
      return pageList;
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
      itemsBox
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

    function showAttemptFinishDialog() {
      const msgText =
        'Ujian telah selesai, silakan mengakhiri dengan klik "Tutup" atau "Lihat Hasil Ujian".';
      if (attemptFinishContent) attemptFinishContent.textContent = msgText;
      if (
        attemptFinishDialog &&
        typeof attemptFinishDialog.showModal === "function"
      ) {
        attemptFinishDialog.showModal();
        return;
      }
      window.alert(msgText);
    }

    async function closeExamAndLogout() {
      try {
        await api("/api/v1/auth/logout", "POST");
      } catch (_) {}
      window.location.href = "/login";
    }

    function syncSubmitVisibility() {
      if (!attemptEditable) {
        submitBtn.hidden = true;
        if (actionsBar) actionsBar.classList.remove("with-submit");
        return;
      }
      const isLast = currentPageNo === totalPages;
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
          questionState[no] = {
            answered: isAnswered(q),
            doubt: !!(q && q.is_doubt),
          };
          if (!questionState[no].answered) unanswered.push(no);
        }),
      );
      unanswered.sort(function (a, b) {
        return a - b;
      });
      return unanswered;
    }

    function getCurrentQuestionRangeText() {
      if (!currentPage || !Array.isArray(currentPage.question_nos)) return "-";
      const nos = currentPage.question_nos || [];
      if (!nos.length) return "-";
      if (nos.length === 1) return String(nos[0]);
      return String(nos[0]) + "-" + String(nos[nos.length - 1]);
    }

    function syncOptionRowSelection(container) {
      container.querySelectorAll("label.option-row").forEach(function (row) {
        const input = row.querySelector('input[name="option"]:checked');
        row.classList.toggle("is-selected", !!input);
      });
    }

    function renderMatchingAttemptUI(container, content, selectionMap, activePromptID) {
      const prompts = Array.isArray(content && content.prompts)
        ? content.prompts
        : [];
      const choices = Array.isArray(content && content.choices)
        ? content.choices
        : [];
      const choiceLookup = buildMatchingChoiceLookup(content);
      const activeID = String(activePromptID || "").trim();
      const assignedChoices = new Set(
        Object.keys(selectionMap || {})
          .map(function (promptID) {
            return String(selectionMap[promptID] || "").trim();
          })
          .filter(Boolean),
      );
      const rows = prompts.map(function (prompt) {
        const promptID = String((prompt && prompt.id) || "").trim();
        const promptHTML = String((prompt && prompt.html) || "").trim();
        const choiceID = String(
          (selectionMap && selectionMap[promptID]) || "",
        ).trim();
        const choice = choiceLookup[choiceID] || null;
        const slotClass = [
          "matching-dropzone",
          activeID === promptID ? "is-active" : "",
          choiceID ? "is-filled" : "is-empty",
        ]
          .join(" ")
          .trim();
        return (
          '<div class="panel mt matching-row">' +
          '<div class="matching-prompt">' +
          (promptHTML || '<span class="muted">Prompt kosong.</span>') +
          "</div>" +
          '<div class="matching-answer-label">Jawaban</div>' +
          '<button type="button" class="' +
          slotClass +
          '" data-match-slot="1" data-match-prompt-id="' +
          escapeHtml(promptID) +
          '" data-match-choice-id="' +
          escapeHtml(choiceID) +
          '">' +
          (choice
            ? '<span class="matching-slot-chip">' +
              String((choice && choice.html) || "") +
              "</span>"
            : '<span class="matching-slot-placeholder">Tarik choice ke sini atau klik prompt lalu klik choice.</span>') +
          "</button>" +
          '<div class="matching-row-actions">' +
          '<button type="button" class="btn btn-secondary btn-inline" data-match-clear-prompt="' +
          escapeHtml(promptID) +
          '"' +
          (choiceID ? "" : " disabled") +
          ">Kosongkan</button>" +
          "</div>" +
          "</div>"
        );
      });
      const choiceBank =
        '<div class="mt"><strong>Bank Jawaban</strong><div class="matching-bank mt">' +
        choices
          .map(function (choice) {
            const choiceID = String((choice && choice.id) || "").trim();
            const ownerPromptID = findMatchingPromptIDByChoice(
              selectionMap,
              choiceID,
            );
            const chipClass = [
              "matching-choice-chip",
              assignedChoices.has(choiceID) ? "is-used" : "",
              ownerPromptID ? "is-assigned" : "",
            ]
              .join(" ")
              .trim();
            return (
              '<button type="button" class="' +
              chipClass +
              '" draggable="true" data-match-bank-choice="' +
              escapeHtml(choiceID) +
              '">' +
              '<span class="matching-choice-html">' +
              String((choice && choice.html) || "") +
              "</span>" +
              (ownerPromptID
                ? '<span class="matching-choice-state">Dipakai ' +
                  escapeHtml(ownerPromptID) +
                  "</span>"
                : "") +
              "</button>"
            );
          })
          .join("") +
        "</div></div>";
      const noteSection = content.note_html
        ? '<div class="mt"><strong>Catatan</strong><div class="box mt">' +
          content.note_html +
          "</div></div>"
        : "";
      html(container, rows.join("") + choiceBank + noteSection);
      if (activeID) {
        container.setAttribute("data-match-active-prompt", activeID);
      } else {
        container.removeAttribute("data-match-active-prompt");
      }
    }

    function readMatchingSelectionsFromUI(container) {
      const out = {};
      container.querySelectorAll("[data-match-slot]").forEach(function (slot) {
        const promptID = String(
          slot.getAttribute("data-match-prompt-id") || "",
        ).trim();
        const choiceID = String(
          slot.getAttribute("data-match-choice-id") || "",
        ).trim();
        if (!promptID || !choiceID) return;
        out[promptID] = choiceID;
      });
      return out;
    }

    function setMatchingSelection(card, promptID, choiceID) {
      const targetPromptID = String(promptID || "").trim();
      const targetChoiceID = String(choiceID || "").trim();
      const q = getQuestionFromCard(card);
      const container = card.querySelector(".attempt-question-options");
      if (!q || !container || !targetPromptID) return false;
      const content = readMatchingContent(q);
      const validPromptIDs = new Set(
        (Array.isArray(content.prompts) ? content.prompts : [])
          .map(function (prompt) {
            return String((prompt && prompt.id) || "").trim();
          })
          .filter(Boolean),
      );
      if (!validPromptIDs.has(targetPromptID)) return false;
      const validChoiceIDs = new Set(
        (Array.isArray(content.choices) ? content.choices : [])
          .map(function (choice) {
            return String((choice && choice.id) || "").trim();
          })
          .filter(Boolean),
      );
      if (targetChoiceID && !validChoiceIDs.has(targetChoiceID)) return false;
      const selectionMap = readMatchingSelectionsFromUI(container);
      Object.keys(selectionMap).forEach(function (existingPromptID) {
        if (selectionMap[existingPromptID] !== targetChoiceID) return;
        delete selectionMap[existingPromptID];
      });
      if (targetChoiceID) {
        selectionMap[targetPromptID] = targetChoiceID;
      } else {
        delete selectionMap[targetPromptID];
      }
      renderMatchingAttemptUI(container, content, selectionMap, targetPromptID);
      return true;
    }

    function renderOptionsInto(container, q) {
      const payload = parseJSONLoose(q.answer_payload, {});
      const qType = String(q.question_type || "").toLowerCase();
      const selected = new Set(readSelectedFromPayload(payload));

      if (qType === "benar_salah_pernyataan") {
        const statements = readTFStatements(q);
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
          return (
            "<tr>" +
            '<td class="bs-statement">' +
            escapeHtml(String(label)) +
            "</td>" +
            '<td class="bs-choice"><input type="radio" name="bs_' +
            escapeHtml(id) +
            '" value="true" ' +
            (existing[id] === true ? "checked" : "") +
            "></td>" +
            '<td class="bs-choice"><input type="radio" name="bs_' +
            escapeHtml(id) +
            '" value="false" ' +
            (existing[id] === false ? "checked" : "") +
            "></td>" +
            "</tr>"
          );
        });
        html(
          container,
          '<table class="bs-table"><thead><tr><th>Pernyataan</th><th>Benar</th><th>Salah</th></tr></thead><tbody>' +
            rows.join("") +
            "</tbody></table>",
        );
        return;
      }

      if (qType === "menjodohkan_drag_drop") {
        const content = readMatchingContent(q);
        const selectionMap = readMatchingSelectionMap(payload);
        const firstEmptyPrompt = content.prompts.find(function (prompt) {
          const promptID = String((prompt && prompt.id) || "").trim();
          return promptID && !selectionMap[promptID];
        });
        renderMatchingAttemptUI(
          container,
          content,
          selectionMap,
          (firstEmptyPrompt && firstEmptyPrompt.id) ||
            String((content.prompts[0] && content.prompts[0].id) || "").trim(),
        );
        return;
      }

      if (qType === "short_answer") {
        const content = readShortAnswerContent(q);
        const value =
          typeof payload.text === "string" ? String(payload.text) : "";
        const maxLength = Math.min(
          33,
          Math.max(1, Number(content.max_length) || 33),
        );
        const placeholder = content.placeholder || "Ketik jawaban singkat";
        const helperText =
          "Jawaban singkat. Maksimal " + String(maxLength) + " karakter.";
        if (content.input_type === "text") {
          html(
            container,
            '<label class="short-answer-wrap"><div class="muted">' +
              escapeHtml(helperText) +
              '</div><input type="text" class="short-answer-input mt" maxlength="' +
              escapeHtml(String(maxLength)) +
              '" placeholder="' +
              escapeHtml(placeholder) +
              '" value="' +
              escapeHtml(value) +
              '"></label>',
          );
          return;
        }
        html(
          container,
          '<label class="short-answer-wrap"><div class="muted">' +
            escapeHtml(helperText) +
            '</div><textarea class="short-answer-input mt" rows="3" maxlength="' +
            escapeHtml(String(maxLength)) +
            '" placeholder="' +
            escapeHtml(placeholder) +
            '">' +
            escapeHtml(value) +
            "</textarea></label>",
        );
        return;
      }

      const comparison = readChoiceComparisonContent(q);
      const multiple = qType === "multi_jawaban";
      const inputType = multiple ? "checkbox" : "radio";
      const rows = (q.options || []).map(function (opt) {
        const isChecked = selected.has(opt.option_key);
        const comparisonRow = comparison.active
          ? (comparison.options || []).find(function (it) {
              return (
                String((it && it.option_key) || "").trim().toUpperCase() ===
                String((opt && opt.option_key) || "").trim().toUpperCase()
              );
            }) || null
          : null;
        const optionContent = comparison.active
          ? [
              '<div class="option-comparison-content">',
              '<div class="option-comparison-table">',
              '<div class="option-comparison-head">' +
                escapeHtml(comparison.leftLabel || "Kolom Kiri") +
                "</div>",
              '<div class="option-comparison-head">' +
                escapeHtml(comparison.rightLabel || "Kolom Kanan") +
                "</div>",
              '<div class="option-comparison-cell">' +
                String((comparisonRow && comparisonRow.left_html) || "") +
                "</div>",
              '<div class="option-comparison-cell">' +
                String((comparisonRow && comparisonRow.right_html) || "") +
                "</div></div></div>",
            ].join("")
          : "<div>" + opt.option_html + "</div>";
        return (
          '<label class="option-row' +
          (isChecked ? " is-selected" : "") +
          (comparison.active ? " option-row-comparison" : "") +
          '">' +
          '<input type="' +
          inputType +
          '" name="option" value="' +
          escapeHtml(opt.option_key) +
          '" ' +
          (isChecked ? "checked" : "") +
          ">" +
          optionContent +
          "</label>"
        );
      });
      html(container, rows.join(""));
      syncOptionRowSelection(container);
    }

    function renderQuestionCard(q) {
      return [
        '<section class="attempt-question-card panel mt" data-question-id="' +
          escapeHtml(String(q.question_id || 0)) +
          '" data-question-no="' +
          escapeHtml(String(q.seq_no || 0)) +
          '">',
        '<div class="attempt-question-card-head">',
        '<strong>Soal nomor ' +
          escapeHtml(String(q.seq_no || 0)) +
          "</strong>",
        '<span class="muted">' +
          escapeHtml(questionTypeLabel(q.question_type)) +
          "</span>",
        "</div>",
        '<div class="attempt-question-stem mt">' +
          (normalizeAttemptStemHTML(q.stem_html) ||
            '<p class="muted">Soal tidak tersedia.</p>') +
          "</div>",
        '<div class="attempt-question-options mt"></div>',
        '<label class="doubt-toggle doubt-pill mt"><input class="item-doubt-checkbox" type="checkbox" ' +
          (q.is_doubt ? "checked" : "") +
          "> Ragu-ragu</label>",
        "</section>",
      ].join("");
    }

    function getQuestionFromCard(card) {
      if (!card || !currentPage || !Array.isArray(currentPage.items)) return null;
      const questionID = Number(card.getAttribute("data-question-id") || 0);
      return (
        currentPage.items.find(function (item) {
          return Number(item.question_id || 0) === questionID;
        }) || null
      );
    }

    function renderPage(page) {
      currentPage = page;
      currentPageNo = Number(page.page_no || 1);
      const stimulusHTML = String(page.stimulus_html || "").trim();
      if (stimulusBox) stimulusBox.hidden = stimulusHTML === "";
      html(stimulusBox, stimulusHTML);
      html(
        itemsBox,
        (page.items || []).map(function (item) {
          return renderQuestionCard(item);
        }).join(""),
      );
      itemsBox.querySelectorAll(".attempt-question-card").forEach(function (card) {
        const q = getQuestionFromCard(card);
        const container = card.querySelector(".attempt-question-options");
        if (!q || !container) return;
        renderOptionsInto(container, q);
      });
      (page.items || []).forEach(function (q) {
        questionState[Number(q.seq_no || 0)] = {
          answered: isAnswered(q),
          doubt: !!q.is_doubt,
        };
      });
      text(
        questionTitle,
        "Halaman " +
          String(currentPageNo) +
          " dari " +
          String(totalPages) +
          " | Soal " +
          getCurrentQuestionRangeText() +
          " dari " +
          String(totalQuestions),
      );
      syncSubmitVisibility();
      renderQuestionListState();
      renderAttemptMath();
    }

    async function loadPage(pageNo) {
      const page = await api(
        "/api/v1/attempts/" + attemptID + "/pages/" + pageNo,
        "GET",
      );
      renderPage(page);
      if (!attemptEditable) {
        applyAttemptReadonlyState("final");
        return;
      }
      text(message, "");
    }

    function collectPayload(q, card) {
      const container = card.querySelector(".attempt-question-options");
      const qType = String(q.question_type || "").toLowerCase();
      if (qType === "benar_salah_pernyataan") {
        const statements = readTFStatements(q);
        const answers = [];
        statements.forEach(function (s, idx) {
          const id = String((s && s.id) || "S" + (idx + 1));
          const selected = container.querySelector(
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
      if (qType === "menjodohkan_drag_drop") {
        const pairs = Array.from(container.querySelectorAll("[data-match-slot]"))
          .map(function (el) {
            const promptID = String(
              el.getAttribute("data-match-prompt-id") || "",
            ).trim();
            const choiceID = String(
              el.getAttribute("data-match-choice-id") || "",
            ).trim();
            if (!promptID || !choiceID) return null;
            return { prompt_id: promptID, choice_id: choiceID };
          })
          .filter(Boolean);
        return { pairs: pairs };
      }
      if (qType === "short_answer") {
        const input = container.querySelector(".short-answer-input");
        return { text: String((input && input.value) || "") };
      }
      const selected = Array.from(
        container.querySelectorAll('input[name="option"]:checked'),
      )
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
      if (!attemptEditable || !currentPage || !Array.isArray(currentPage.items)) return;
      const cards = itemsBox.querySelectorAll(".attempt-question-card");
      const payloads = [];
      cards.forEach(function (card) {
        const q = getQuestionFromCard(card);
        if (!q) return;
        const payload = collectPayload(q, card);
        const doubtCheckbox = card.querySelector(".item-doubt-checkbox");
        payloads.push({
          questionID: q.question_id,
          answerPayload: payload,
          isDoubt: !!(doubtCheckbox && doubtCheckbox.checked),
          seqNo: Number(q.seq_no || 0),
          questionType: String(q.question_type || "").toLowerCase(),
          question: q,
        });
      });
      for (let i = 0; i < payloads.length; i += 1) {
        const item = payloads[i];
        await api(
          "/api/v1/attempts/" + attemptID + "/answers/" + item.questionID,
          "PUT",
          {
            answer_payload: item.answerPayload,
            is_doubt: item.isDoubt,
          },
        );
        questionState[item.seqNo] = {
          answered: isAnsweredPayload(
            item.questionType,
            item.answerPayload,
            item.question,
          ),
          doubt: item.isDoubt,
        };
      }
      renderQuestionListState();
    }

    function renderMathInContainer(el) {
      if (!attemptMathReady || !el || !window.katex) return;
      el.querySelectorAll(".ql-formula").forEach(function (node) {
        const latex = String(node.getAttribute("data-value") || "").trim();
        if (!latex) return;
        try {
          window.katex.render(latex, node, {
            throwOnError: false,
            displayMode: false,
          });
        } catch (_) {}
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
      } catch (_) {}
    }

    function containerHasMathML(el) {
      return !!(el && el.querySelector("math"));
    }

    function containerHasLatexDelimiters(el) {
      const value = String((el && el.textContent) || "");
      return (
        value.indexOf("$$") !== -1 ||
        value.indexOf("\\(") !== -1 ||
        value.indexOf("\\)") !== -1 ||
        value.indexOf("\\[") !== -1 ||
        value.indexOf("\\]") !== -1 ||
        value.indexOf("$") !== -1
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
        return true;
      }
      window.MathJax = window.MathJax || {
        tex: { inlineMath: [["$", "$"], ["\\(", "\\)"]] },
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
      return true;
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
        return true;
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
        } catch (_) {}
      }
      return true;
    }

    async function renderAttemptMath() {
      const targets = [stimulusBox, itemsBox];
      targets.forEach(function (el) {
        renderMathInContainer(el);
        renderLatexDelimiters(el);
      });
      const hasMath = targets.some(function (el) {
        return containerHasMathML(el) || (!window.katex && containerHasLatexDelimiters(el));
      });
      if (!hasMath) return;
      try {
        const ready = await ensureAttemptMathJaxReady();
        if (ready && window.MathJax && window.MathJax.typesetPromise) {
          await window.MathJax.typesetPromise(targets);
        }
      } catch (_) {}
    }

    if (infoSoalBtn) {
      infoSoalBtn.addEventListener("click", function () {
        const range = getCurrentQuestionRangeText();
        const remainText = String(
          (remainingLabel && remainingLabel.textContent) || "-",
        ).trim();
        const currentItems = Array.isArray(currentPage && currentPage.items)
          ? currentPage.items
          : [];
        const types = currentItems
          .map(function (item) {
            return questionTypeLabel(item.question_type);
          })
          .join(", ");
        const unanswered = currentItems.some(function (item) {
          const state = questionState[Number(item.seq_no || 0)] || {};
          return !state.answered;
        })
          ? "Masih ada soal belum terjawab"
          : "Semua soal di halaman ini sudah terjawab";
        const infoHTML = [
          '<div class="attempt-info-grid">',
          '<article class="attempt-info-item"><div class="attempt-info-k">Halaman</div><div class="attempt-info-v">' +
            escapeHtml(String(currentPageNo)) +
            " / " +
            escapeHtml(String(totalPages)) +
            "</div></article>",
          '<article class="attempt-info-item"><div class="attempt-info-k">Nomor Soal</div><div class="attempt-info-v">' +
            escapeHtml(range) +
            "</div></article>",
          '<article class="attempt-info-item"><div class="attempt-info-k">Tipe Soal</div><div class="attempt-info-v">' +
            escapeHtml(types || "-") +
            "</div></article>",
          '<article class="attempt-info-item"><div class="attempt-info-k">Status Jawaban</div><div class="attempt-info-v">' +
            escapeHtml(unanswered) +
            "</div></article>",
          '<article class="attempt-info-item"><div class="attempt-info-k">Sisa Waktu</div><div class="attempt-info-v">' +
            escapeHtml(remainText) +
            "</div></article>",
          "</div>",
          '<div class="attempt-info-note"><strong>Panduan:</strong> klik <em>Daftar Soal</em> untuk lompat nomor; jika satu stimulus memuat beberapa soal, seluruh jawaban di halaman ini tersimpan bersama.</div>',
        ].join("");
        if (infoSoalContent) html(infoSoalContent, infoHTML);
        if (infoSoalDialog && typeof infoSoalDialog.showModal === "function") {
          infoSoalDialog.showModal();
          return;
        }
        text(message, "Halaman " + currentPageNo + "/" + totalPages + ".");
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
        const targetPageNo = Number(questionToPage[targetNo] || 0);
        if (!targetNo || !targetPageNo || targetPageNo === currentPageNo) return;
        const done = beginBusy(
          btn,
          message,
          "Memuat halaman untuk soal nomor " + targetNo + "...",
        );
        try {
          if (attemptEditable) await saveCurrent();
          await loadPage(targetPageNo);
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

    [fontSmallBtn, fontMediumBtn, fontLargeBtn].forEach(function (btn, idx) {
      if (!btn) return;
      btn.addEventListener("click", function () {
        applyFontSize(["small", "medium", "large"][idx]);
      });
    });

    prevBtn.addEventListener("click", async function () {
      if (!attemptEditable || currentPageNo <= 1) return;
      const done = beginBusy(this, message, "Memuat halaman sebelumnya...");
      try {
        await saveCurrent();
        await loadPage(currentPageNo - 1);
      } catch (err) {
        if (String(err.message || "").includes("attempt is not editable")) {
          applyAttemptReadonlyState("submitted");
          return;
        }
        text(message, "Gagal pindah halaman: " + err.message);
      } finally {
        done();
      }
    });

    nextBtn.addEventListener("click", async function () {
      if (!attemptEditable || currentPageNo >= totalPages) return;
      const done = beginBusy(this, message, "Memuat halaman berikutnya...");
      try {
        await saveCurrent();
        await loadPage(currentPageNo + 1);
      } catch (err) {
        if (String(err.message || "").includes("attempt is not editable")) {
          applyAttemptReadonlyState("submitted");
          return;
        }
        text(message, "Gagal pindah halaman: " + err.message);
      } finally {
        done();
      }
    });

    submitBtn.addEventListener("click", async function () {
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

    itemsBox.addEventListener("change", async function (e) {
      if (!attemptEditable) return;
      const container = e.target.closest(".attempt-question-options");
      if (container) syncOptionRowSelection(container);
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

    itemsBox.addEventListener("click", function (e) {
      if (!attemptEditable) return;
      const card = e.target.closest(".attempt-question-card");
      if (!card) return;
      const clearBtn = e.target.closest("[data-match-clear-prompt]");
      if (clearBtn) {
        e.preventDefault();
        if (
          setMatchingSelection(
            card,
            clearBtn.getAttribute("data-match-clear-prompt"),
            "",
          )
        ) {
          itemsBox.dispatchEvent(new Event("change", { bubbles: true }));
        }
        return;
      }
      const slot = e.target.closest("[data-match-slot]");
      if (slot) {
        e.preventDefault();
        const promptID = String(
          slot.getAttribute("data-match-prompt-id") || "",
        ).trim();
        const q = getQuestionFromCard(card);
        const container = card.querySelector(".attempt-question-options");
        if (!promptID || !q || !container) return;
        renderMatchingAttemptUI(
          container,
          readMatchingContent(q),
          readMatchingSelectionsFromUI(container),
          promptID,
        );
        return;
      }
      const chip = e.target.closest("[data-match-bank-choice]");
      if (chip) {
        e.preventDefault();
        const container = card.querySelector(".attempt-question-options");
        const choiceID = String(
          chip.getAttribute("data-match-bank-choice") || "",
        ).trim();
        const activePromptID = String(
          (container && container.getAttribute("data-match-active-prompt")) || "",
        ).trim();
        if (!choiceID || !activePromptID) return;
        if (setMatchingSelection(card, activePromptID, choiceID)) {
          itemsBox.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
    });

    itemsBox.addEventListener("dragstart", function (e) {
      const chip = e.target.closest("[data-match-bank-choice]");
      if (!chip || !attemptEditable || !e.dataTransfer) return;
      const choiceID = String(
        chip.getAttribute("data-match-bank-choice") || "",
      ).trim();
      if (!choiceID) return;
      e.dataTransfer.setData("text/plain", choiceID);
      e.dataTransfer.effectAllowed = "move";
    });

    itemsBox.addEventListener("dragover", function (e) {
      const slot = e.target.closest("[data-match-slot]");
      if (!slot || !attemptEditable) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    });

    itemsBox.addEventListener("drop", function (e) {
      const slot = e.target.closest("[data-match-slot]");
      const card = e.target.closest(".attempt-question-card");
      if (!slot || !card || !attemptEditable) return;
      e.preventDefault();
      const promptID = String(
        slot.getAttribute("data-match-prompt-id") || "",
      ).trim();
      const choiceID = e.dataTransfer
        ? String(e.dataTransfer.getData("text/plain") || "").trim()
        : "";
      if (!promptID || !choiceID) return;
      if (setMatchingSelection(card, promptID, choiceID)) {
        itemsBox.dispatchEvent(new Event("change", { bubbles: true }));
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
      await loadPageList();
      syncSubmitVisibility();
      await loadPage(1);
      if (!attemptEditable) {
        applyAttemptReadonlyState(summary.status);
      }
    } catch (err) {
      text(message, "Gagal memuat attempt: " + err.message);
    }
  }

  window.AppPages = window.AppPages || {};
  window.AppPages.initAttemptPage = initAttemptPage;
})();
