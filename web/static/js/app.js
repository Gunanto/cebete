(function () {
  const core = window.AppCore || {};
  const pages = window.AppPages || {};
  const api = core.api;
  const apiMultipart = core.apiMultipart;
  const downloadCSV = core.downloadCSV;
  const extractAPIError = core.extractAPIError;
  const meOrNull = core.meOrNull;
  const text = core.text;
  const html = core.html;
  const escapeHtml = core.escapeHtml;
  const beginBusy = core.beginBusy;
  const enhanceButtonIcons = core.enhanceButtonIcons;

  function shortQuestionTypeLabel(qType) {
    const v = String(qType || "")
      .toLowerCase()
      .trim();
    if (v === "pg_tunggal") return "MC";
    if (v === "multi_jawaban") return "MR";
    if (v === "benar_salah_pernyataan") return "TF";
    if (v === "menjodohkan_drag_drop") return "MATCH";
    if (v === "short_answer") return "SA";
    return "-";
  }

  async function initTopbarAuth() {
    const userLabel = document.getElementById("nav-user");
    const logoutBtn = document.getElementById("nav-logout");
    if (!userLabel || !logoutBtn) return;

    const user = await meOrNull();
    if (!user) {
      text(userLabel, "");
      logoutBtn.hidden = true;
      return;
    }

    const label =
      (user.full_name || user.username || "User") +
      " (" +
      String(user.role || "user") +
      ")";
    text(userLabel, label);
    logoutBtn.hidden = false;

    logoutBtn.addEventListener("click", async function () {
      const done = beginBusy(logoutBtn, null, "");
      try {
        await api("/api/v1/auth/logout", "POST");
      } catch (_) {
        // Ignore API error and still force local redirect.
      } finally {
        done();
      }
      window.location.href = "/login";
    });
  }

  function readSelectedFromPayload(payload) {
    if (!payload || typeof payload !== "object") return [];
    const v = payload.selected;
    if (typeof v === "string") return v ? [v] : [];
    if (Array.isArray(v))
      return v.filter(function (x) {
        return typeof x === "string" && x.trim() !== "";
      });
    return [];
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
    let currentNo = 1;
    let totalQuestions = 1;
    let currentQuestion = null;
    let remainInterval = null;
    let attemptEditable = true;
    let timeoutAutoSubmitFired = false;
    let submitInProgress = false;

    const remainingLabel = document.getElementById("remaining-label");
    const message = document.getElementById("attempt-message");
    const attemptPageTitle = document.getElementById("attempt-page-title");
    const questionTitle = document.getElementById("question-title");
    const stimulusBox = document.getElementById("stimulus-box");
    const stemBox = document.getElementById("stem-box");
    const optionsBox = document.getElementById("options-box");
    const doubtCheckbox = document.getElementById("doubt-checkbox");
    const prevBtn = document.getElementById("prev-btn");
    const nextBtn = document.getElementById("next-btn");
    const submitBtn = document.getElementById("submit-btn");
    const actionsBar = document.querySelector(".actions");
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
    const daftarSoalBtn = document.getElementById("daftar-soal-btn");
    const daftarSoalPanel = document.getElementById("daftar-soal-panel");
    const daftarSoalBody = document.getElementById("daftar-soal-body");
    const fontSmallBtn = document.getElementById("font-small-btn");
    const fontMediumBtn = document.getElementById("font-medium-btn");
    const fontLargeBtn = document.getElementById("font-large-btn");
    const eventMessage = document.getElementById("attempt-event-message");
    const questionState = {};
    let eventMessageTimer = null;
    const eventLastAt = {};
    const eventMinIntervalMs = {
      tab_blur: 5000,
      reconnect: 5000,
      fullscreen_exit: 5000,
      rapid_refresh: 15000,
    };
    const pendingEvents = [];
    let flushingEvents = false;
    const fontStorageKey = "cbtlms_attempt_font_size";
    let attemptMathReady = false;

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
      if (fontSmallBtn) {
        const active = value === "small";
        fontSmallBtn.classList.toggle("active", active);
        fontSmallBtn.setAttribute("aria-pressed", active ? "true" : "false");
      }
      if (fontMediumBtn) {
        const active = value === "medium";
        fontMediumBtn.classList.toggle("active", active);
        fontMediumBtn.setAttribute("aria-pressed", active ? "true" : "false");
      }
      if (fontLargeBtn) {
        const active = value === "large";
        fontLargeBtn.classList.toggle("active", active);
        fontLargeBtn.setAttribute("aria-pressed", active ? "true" : "false");
      }
      try {
        window.localStorage.setItem(fontStorageKey, value);
      } catch (_) {
        // Ignore if storage is unavailable.
      }
    }

    function loadSavedFontSize() {
      try {
        const saved = window.localStorage.getItem(fontStorageKey);
        if (saved) return saved;
      } catch (_) {
        // Ignore if storage is unavailable.
      }
      return "medium";
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
        if (expected.size === 0) return false;
        const answers = Array.isArray(payload && payload.answers)
          ? payload.answers
          : [];
        const answered = new Set();
        answers.forEach(function (a) {
          if (!a || typeof a !== "object") return;
          const id = String(a.id || "").trim();
          if (!id || !expected.has(id)) return;
          if (typeof a.value !== "boolean") return;
          answered.add(id);
        });
        return answered.size === expected.size;
      }
      if (qType === "menjodohkan_drag_drop") {
        const content = readMatchingContent(questionLike);
        if (!Array.isArray(content.prompts) || content.prompts.length === 0)
          return false;
        const expected = new Set(
          content.prompts
            .map(function (it) {
              return String((it && it.id) || "").trim();
            })
            .filter(Boolean),
        );
        if (expected.size === 0) return false;
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
        btn.classList.toggle("current", no === currentNo);
        btn.classList.toggle("answered", !!state.answered);
        btn.classList.toggle("doubt", !!state.doubt);
      });
    }

    function closeQuestionList() {
      if (!daftarSoalPanel || !daftarSoalBtn) return;
      daftarSoalPanel.hidden = true;
      daftarSoalBtn.setAttribute("aria-expanded", "false");
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
      const examTitle = examTitleParts.join(" | ");
      if (attemptPageTitle) {
        attemptPageTitle.textContent = examTitle
          ? examTitle
          : "Ujian #" + String(attemptID);
      }
      totalQuestions = Number(sum.total_questions || 1);
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
        if (remain <= 0 && attemptEditable) {
          triggerTimeoutAutoSubmit();
        }
      }, 1000);
      return sum;
    }

    function normalizeAttemptStemHTML(stemHTML) {
      let stem = String(stemHTML || "");
      stem = stem.replace(/^\s*<p>\s*draft naskah soal:\s*/i, "<p>");
      stem = stem.replace(/^\s*draft naskah soal:\s*/i, "");
      return stem;
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
      doubtCheckbox.disabled = true;
      optionsBox
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

    async function closeExamAndLogout() {
      try {
        await api("/api/v1/auth/logout", "POST");
      } catch (_) {
        // Ignore API error and still redirect to login.
      }
      window.location.href = "/login";
    }

    function showAttemptFinishDialog() {
      const msgText =
        'Ujian telah selesai, silakan mengakhiri dengan klik "Tutup" atau "Lihat Hasil Ujian".';
      if (attemptFinishContent) {
        attemptFinishContent.textContent = msgText;
      }
      if (
        attemptFinishDialog &&
        typeof attemptFinishDialog.showModal === "function"
      ) {
        attemptFinishDialog.showModal();
        return;
      }
      window.alert(msgText);
    }

    function syncSubmitVisibility() {
      if (!attemptEditable) {
        submitBtn.hidden = true;
        if (actionsBar) actionsBar.classList.remove("with-submit");
        return;
      }
      const isLast = currentNo === totalQuestions;
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
          const answered = isAnswered(q);
          questionState[no] = {
            answered: answered,
            doubt: !!(q && q.is_doubt),
          };
          if (!answered) unanswered.push(no);
        }),
      );

      unanswered.sort(function (a, b) {
        return a - b;
      });
      return unanswered;
    }

    function notifyEvent(msg) {
      text(eventMessage, msg);
      if (eventMessageTimer) {
        clearTimeout(eventMessageTimer);
      }
      eventMessageTimer = setTimeout(function () {
        text(eventMessage, "");
      }, 2500);
    }

    function canSendEvent(eventType) {
      const now = Date.now();
      const minInterval = eventMinIntervalMs[eventType] || 5000;
      const last = eventLastAt[eventType] || 0;
      if (now - last < minInterval) {
        return false;
      }
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
        // Non-blocking: anti-cheat logging should never break exam flow.
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

    function renderOptions(q) {
      const payload = parseJSONLoose(q.answer_payload, {});

      const selected = new Set(readSelectedFromPayload(payload));
      const qType = String(q.question_type || "").toLowerCase();

      if (qType === "benar_salah_pernyataan") {
        const statements = readTFStatements(q);
        if (!statements.length) {
          html(optionsBox, '<p class="muted">Pernyataan tidak tersedia.</p>');
          return;
        }

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
          const yesChecked = existing[id] === true ? "checked" : "";
          const noChecked = existing[id] === false ? "checked" : "";
          return (
            "<tr>" +
            '<td class="bs-statement">' +
            escapeHtml(String(label)) +
            "</td>" +
            '<td class="bs-choice">' +
            '<input type="radio" name="bs_' +
            escapeHtml(id) +
            '" value="true" ' +
            yesChecked +
            ">" +
            "</td>" +
            '<td class="bs-choice">' +
            '<input type="radio" name="bs_' +
            escapeHtml(id) +
            '" value="false" ' +
            noChecked +
            ">" +
            "</td>" +
            "</tr>"
          );
        });
        html(
          optionsBox,
          '<table class="bs-table"><thead><tr><th>Pernyataan</th><th>Benar</th><th>Salah</th></tr></thead><tbody>' +
            rows.join("") +
            "</tbody></table>",
        );
        return;
      }
      if (qType === "menjodohkan_drag_drop") {
        const content = readMatchingContent(q);
        if (!content.prompts.length || !content.choices.length) {
          html(
            optionsBox,
            '<p class="muted">Konten matching tidak tersedia.</p>',
          );
          return;
        }
        const selectionMap = readMatchingSelectionMap(payload);
        const firstEmptyPrompt = content.prompts.find(function (prompt) {
          const promptID = String((prompt && prompt.id) || "").trim();
          return promptID && !selectionMap[promptID];
        });
        renderMatchingAttemptUI(
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
            optionsBox,
            '<label class="short-answer-wrap">' +
              '<div class="muted">' +
              escapeHtml(helperText) +
              "</div>" +
              '<input type="text" id="short-answer-input" maxlength="' +
              escapeHtml(String(maxLength)) +
              '" placeholder="' +
              escapeHtml(placeholder) +
              '" value="' +
              escapeHtml(value) +
              '" class="mt" />' +
              "</label>",
          );
        } else {
          html(
            optionsBox,
            '<label class="short-answer-wrap">' +
              '<div class="muted">' +
              escapeHtml(helperText) +
              "</div>" +
              '<textarea id="short-answer-input" rows="3" maxlength="' +
              escapeHtml(String(maxLength)) +
              '" placeholder="' +
              escapeHtml(placeholder) +
              '" class="mt">' +
              escapeHtml(value) +
              "</textarea>" +
              "</label>",
          );
        }
        return;
      }

      const multiple = qType === "multi_jawaban";
      const inputType = multiple ? "checkbox" : "radio";
      const comparison = readChoiceComparisonContent(q);
      const rows = (q.options || []).map(function (opt) {
        const isChecked = selected.has(opt.option_key);
        const checked = isChecked ? "checked" : "";
        const labelClass =
          (isChecked ? "option-row is-selected" : "option-row") +
          (comparison.active ? " option-row-comparison" : "");
        const comparisonRow = comparison.active
          ? (comparison.options || []).find(function (it) {
              return (
                String((it && it.option_key) || "")
                  .trim()
                  .toUpperCase() ===
                String((opt && opt.option_key) || "")
                  .trim()
                  .toUpperCase()
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
                "</div>",
              "</div>",
              "</div>",
            ].join("")
          : "<div>" + opt.option_html + "</div>";
        return [
          '<label class="' + labelClass + '">',
          '<input type="' +
            inputType +
            '" name="option" value="' +
            escapeHtml(opt.option_key) +
            '" ' +
            checked +
            ">",
          optionContent,
          "</label>",
        ].join("");
      });
      html(optionsBox, rows.join(""));
    }

    function syncOptionRowSelection() {
      if (!optionsBox) return;
      const rows = optionsBox.querySelectorAll("label.option-row");
      rows.forEach(function (row) {
        const input = row.querySelector('input[name="option"]');
        const isChecked = !!(input && input.checked);
        row.classList.toggle("is-selected", isChecked);
      });
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

    function readMatchingSelectionsFromUI() {
      const out = {};
      optionsBox.querySelectorAll("[data-match-slot]").forEach(function (slot) {
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

    function buildMatchingChoiceLookup(content) {
      const out = {};
      (Array.isArray(content && content.choices)
        ? content.choices
        : []
      ).forEach(function (choice) {
        const choiceID = String((choice && choice.id) || "").trim();
        if (!choiceID) return;
        out[choiceID] = choice;
      });
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

    function renderMatchingAttemptUI(content, selectionMap, activePromptID) {
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
      html(optionsBox, rows.join("") + choiceBank + noteSection);
      if (activeID) {
        optionsBox.setAttribute("data-match-active-prompt", activeID);
      } else {
        optionsBox.removeAttribute("data-match-active-prompt");
      }
    }

    function setMatchingSelection(promptID, choiceID) {
      const targetPromptID = String(promptID || "").trim();
      const targetChoiceID = String(choiceID || "").trim();
      if (!targetPromptID || !currentQuestion) return false;
      const content = readMatchingContent(currentQuestion);
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
      const selectionMap = readMatchingSelectionsFromUI();
      Object.keys(selectionMap).forEach(function (existingPromptID) {
        if (selectionMap[existingPromptID] !== targetChoiceID) return;
        delete selectionMap[existingPromptID];
      });
      if (targetChoiceID) {
        selectionMap[targetPromptID] = targetChoiceID;
      } else {
        delete selectionMap[targetPromptID];
      }
      renderMatchingAttemptUI(content, selectionMap, targetPromptID);
      return true;
    }

    function renderMathInContainer(el) {
      if (!attemptMathReady || !el || !window.katex) return;
      const formulaNodes = el.querySelectorAll(".ql-formula");
      formulaNodes.forEach(function (node) {
        const latex = String(node.getAttribute("data-value") || "").trim();
        if (!latex) return;
        try {
          window.katex.render(latex, node, {
            throwOnError: false,
            displayMode: false,
          });
        } catch (_) {
          // Keep original content if formula fails to render.
        }
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
      } catch (_) {
        // Ignore auto-render errors to keep content visible.
      }
    }

    function containerHasMathML(el) {
      if (!el) return false;
      return el.querySelector("math") !== null;
    }

    function containerHasLatexDelimiters(el) {
      if (!el) return false;
      const text = String(el.textContent || "");
      return (
        text.indexOf("$$") !== -1 ||
        text.indexOf("\\(") !== -1 ||
        text.indexOf("\\)") !== -1 ||
        text.indexOf("\\[") !== -1 ||
        text.indexOf("\\]") !== -1 ||
        text.indexOf("$") !== -1
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
        return !!(window.MathJax && window.MathJax.typesetPromise);
      }
      window.MathJax = window.MathJax || {
        tex: {
          inlineMath: [
            ["$", "$"],
            ["\\(", "\\)"],
          ],
        },
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
      return !!(window.MathJax && window.MathJax.typesetPromise);
    }

    async function renderAttemptMath() {
      renderMathInContainer(stemBox);
      renderMathInContainer(stimulusBox);
      renderMathInContainer(optionsBox);
      renderLatexDelimiters(stemBox);
      renderLatexDelimiters(stimulusBox);
      renderLatexDelimiters(optionsBox);
      const hasMathML =
        containerHasMathML(stemBox) ||
        containerHasMathML(stimulusBox) ||
        containerHasMathML(optionsBox);
      const hasLatexDelimiters =
        containerHasLatexDelimiters(stemBox) ||
        containerHasLatexDelimiters(stimulusBox) ||
        containerHasLatexDelimiters(optionsBox);
      if (hasMathML || (!window.katex && hasLatexDelimiters)) {
        try {
          const ready = await ensureAttemptMathJaxReady();
          if (ready && window.MathJax && window.MathJax.typesetPromise) {
            await window.MathJax.typesetPromise([
              stemBox,
              stimulusBox,
              optionsBox,
            ]);
          }
        } catch (_) {
          // Keep original MathML if MathJax fails to load.
        }
      }
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
        return !!window.katex;
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
        } catch (_) {
          // Auto-render is optional; KaTeX formula rendering can still work.
        }
      }
      return !!window.katex;
    }

    function collectPayload(q) {
      const qType = String(q.question_type || "").toLowerCase();
      if (qType === "benar_salah_pernyataan") {
        const statements = readTFStatements(q);
        const answers = [];

        statements.forEach(function (s, idx) {
          const id = String((s && s.id) || "S" + (idx + 1));
          const selected = document.querySelector(
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
        const pairs = Array.from(
          optionsBox.querySelectorAll("[data-match-slot]"),
        )
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
        const input = optionsBox.querySelector("#short-answer-input");
        return {
          text: String((input && input.value) || ""),
        };
      }

      const selectedNodes = optionsBox.querySelectorAll(
        'input[name="option"]:checked',
      );
      const selected = Array.from(selectedNodes)
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
      if (!attemptEditable) return;
      if (!currentQuestion) return;
      const payload = collectPayload(currentQuestion);
      await api(
        "/api/v1/attempts/" +
          attemptID +
          "/answers/" +
          currentQuestion.question_id,
        "PUT",
        {
          answer_payload: payload,
          is_doubt: !!doubtCheckbox.checked,
        },
      );
      questionState[currentNo] = {
        answered: isAnsweredPayload(
          String(currentQuestion.question_type || "").toLowerCase(),
          payload,
          currentQuestion,
        ),
        doubt: !!doubtCheckbox.checked,
      };
      renderQuestionListState();
    }

    async function loadQuestion(no) {
      const q = await api(
        "/api/v1/attempts/" + attemptID + "/questions/" + no,
        "GET",
      );
      currentQuestion = q;
      currentNo = no;
      questionState[no] = {
        answered: isAnswered(q),
        doubt: !!q.is_doubt,
      };
      syncSubmitVisibility();
      renderQuestionListState();
      text(questionTitle, "Soal nomor " + no + " dari " + totalQuestions);
      const stimulusHTML = String(q.stimulus_html || "").trim();
      html(
        stemBox,
        normalizeAttemptStemHTML(q.stem_html) ||
          '<p class="muted">Soal tidak tersedia.</p>',
      );
      if (stimulusBox) {
        stimulusBox.hidden = stimulusHTML === "";
      }
      html(stimulusBox, stimulusHTML);
      doubtCheckbox.checked = !!q.is_doubt;
      renderOptions(q);
      syncOptionRowSelection();
      renderAttemptMath();
      if (!attemptEditable) {
        applyAttemptReadonlyState("final");
        return;
      }
      text(message, "");
    }

    if (infoSoalBtn) {
      infoSoalBtn.addEventListener("click", function () {
        const qState = questionState[currentNo] || {};
        const currentType = questionTypeLabel(
          currentQuestion && currentQuestion.question_type,
        );
        const remainText = String(
          (remainingLabel && remainingLabel.textContent) || "-",
        ).trim();
        const infoHTML = [
          '<div class="attempt-info-grid">',
          '<article class="attempt-info-item">' +
            '<div class="attempt-info-k">Posisi Soal</div>' +
            '<div class="attempt-info-v">' +
            escapeHtml(String(currentNo)) +
            " / " +
            escapeHtml(String(totalQuestions)) +
            "</div>" +
            "</article>",
          '<article class="attempt-info-item">' +
            '<div class="attempt-info-k">Tipe Soal</div>' +
            '<div class="attempt-info-v">' +
            escapeHtml(currentType) +
            "</div>" +
            "</article>",
          '<article class="attempt-info-item">' +
            '<div class="attempt-info-k">Status Jawaban</div>' +
            '<div class="attempt-info-v">' +
            (qState.answered ? "Sudah terjawab" : "Belum terjawab") +
            "</div>" +
            "</article>",
          '<article class="attempt-info-item">' +
            '<div class="attempt-info-k">Status Ragu-ragu</div>' +
            '<div class="attempt-info-v">' +
            (qState.doubt ? "Ya" : "Tidak") +
            "</div>" +
            "</article>",
          '<article class="attempt-info-item">' +
            '<div class="attempt-info-k">Sisa Waktu</div>' +
            '<div class="attempt-info-v">' +
            escapeHtml(remainText) +
            "</div>" +
            "</article>",
          "</div>",
          '<div class="attempt-info-note"><strong>Panduan:</strong> klik <em>Daftar Soal</em> untuk lompat nomor, jawaban tersimpan otomatis.</div>',
        ].join("");
        if (infoSoalContent) {
          html(infoSoalContent, infoHTML);
        }
        if (infoSoalDialog && typeof infoSoalDialog.showModal === "function") {
          infoSoalDialog.showModal();
          return;
        }
        text(
          message,
          "Soal saat ini " +
            currentNo +
            "/" +
            totalQuestions +
            ". Tipe: " +
            currentType +
            ".",
        );
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
        if (!targetNo || targetNo === currentNo) return;
        const done = beginBusy(
          btn,
          message,
          "Memuat soal nomor " + targetNo + "...",
        );
        try {
          if (attemptEditable) {
            await saveCurrent();
          }
          await loadQuestion(targetNo);
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

    if (fontSmallBtn) {
      fontSmallBtn.addEventListener("click", function () {
        applyFontSize("small");
      });
    }
    if (fontMediumBtn) {
      fontMediumBtn.addEventListener("click", function () {
        applyFontSize("medium");
      });
    }
    if (fontLargeBtn) {
      fontLargeBtn.addEventListener("click", function () {
        applyFontSize("large");
      });
    }

    document
      .getElementById("prev-btn")
      .addEventListener("click", async function () {
        if (!attemptEditable) return;
        if (currentNo <= 1) return;
        const done = beginBusy(this, message, "Memuat soal sebelumnya...");
        try {
          await saveCurrent();
          await loadQuestion(currentNo - 1);
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

    document
      .getElementById("next-btn")
      .addEventListener("click", async function () {
        if (!attemptEditable) return;
        if (currentNo >= totalQuestions) return;
        const done = beginBusy(this, message, "Memuat soal berikutnya...");
        try {
          await saveCurrent();
          await loadQuestion(currentNo + 1);
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

    document
      .getElementById("submit-btn")
      .addEventListener("click", async function () {
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

    optionsBox.addEventListener("change", async function () {
      if (!attemptEditable) return;
      syncOptionRowSelection();
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

    optionsBox.addEventListener("click", function (e) {
      if (!attemptEditable) return;
      const clearBtn = e.target.closest("[data-match-clear-prompt]");
      if (clearBtn) {
        e.preventDefault();
        if (
          setMatchingSelection(
            clearBtn.getAttribute("data-match-clear-prompt"),
            "",
          )
        ) {
          optionsBox.dispatchEvent(new Event("change", { bubbles: true }));
        }
        return;
      }
      const slot = e.target.closest("[data-match-slot]");
      if (slot) {
        e.preventDefault();
        const promptID = String(
          slot.getAttribute("data-match-prompt-id") || "",
        ).trim();
        if (!promptID) return;
        renderMatchingAttemptUI(
          readMatchingContent(currentQuestion),
          readMatchingSelectionsFromUI(),
          promptID,
        );
        return;
      }
      const chip = e.target.closest("[data-match-bank-choice]");
      if (chip) {
        e.preventDefault();
        const choiceID = String(
          chip.getAttribute("data-match-bank-choice") || "",
        ).trim();
        const activePromptID = String(
          optionsBox.getAttribute("data-match-active-prompt") || "",
        ).trim();
        if (!choiceID || !activePromptID) return;
        if (setMatchingSelection(activePromptID, choiceID)) {
          optionsBox.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
    });

    optionsBox.addEventListener("dragstart", function (e) {
      const chip = e.target.closest("[data-match-bank-choice]");
      if (!chip || !attemptEditable) return;
      const choiceID = String(
        chip.getAttribute("data-match-bank-choice") || "",
      ).trim();
      if (!choiceID || !e.dataTransfer) return;
      e.dataTransfer.setData("text/plain", choiceID);
      e.dataTransfer.effectAllowed = "move";
    });

    optionsBox.addEventListener("dragover", function (e) {
      const slot = e.target.closest("[data-match-slot]");
      if (!slot || !attemptEditable) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    });

    optionsBox.addEventListener("drop", function (e) {
      const slot = e.target.closest("[data-match-slot]");
      if (!slot || !attemptEditable) return;
      e.preventDefault();
      const promptID = String(
        slot.getAttribute("data-match-prompt-id") || "",
      ).trim();
      const choiceID = e.dataTransfer
        ? String(e.dataTransfer.getData("text/plain") || "").trim()
        : "";
      if (!promptID || !choiceID) return;
      if (setMatchingSelection(promptID, choiceID)) {
        optionsBox.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });

    doubtCheckbox.addEventListener("change", async function () {
      if (!attemptEditable) return;
      text(message, "Menyimpan status ragu-ragu...");
      try {
        await saveCurrent();
        text(message, "Status ragu-ragu tersimpan.");
      } catch (err) {
        if (String(err.message || "").includes("attempt is not editable")) {
          applyAttemptReadonlyState("submitted");
          return;
        }
        text(message, "Simpan ragu-ragu gagal: " + err.message);
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
      syncSubmitVisibility();
      await loadQuestion(1);
      if (!attemptEditable) {
        applyAttemptReadonlyState(summary.status);
      }
    } catch (err) {
      text(message, "Gagal memuat attempt: " + err.message);
    }
  }

  async function initResultPage() {
    const root = document.getElementById("result-root");
    if (!root) return;

    const user = await meOrNull();
    if (!user) {
      window.location.href = "/login";
      return;
    }

    const attemptID = Number(root.getAttribute("data-attempt-id") || 0);
    const resultPageTitle = document.getElementById("result-page-title");
    const summaryBox = document.getElementById("result-summary");
    const examTitleCell = document.getElementById("result-exam-title");
    const examScoreCell = document.getElementById("result-exam-score");
    const resultItemsBox = document.getElementById("result-items");

    function normalizeScore(score, totalWeight, totalQuestions) {
      const raw = Number(score || 0);
      const weight = Number(totalWeight || 0);
      if (weight > 0) return (raw / weight) * 100;
      const total = Number(totalQuestions || 0);
      if (total > 0) return (raw / total) * 100;
      return raw;
    }

    function formatItemStatus(item) {
      if (!item) return "-";
      if (item.is_correct === true) return "Benar";
      if (item.is_correct === false) return "Salah";
      if (String(item.reason || "").toLowerCase() === "unanswered") {
        return "Tidak dijawab";
      }
      if (item.reason) return "Tidak dinilai";
      return "-";
    }

    function formatItemScore(raw) {
      const v = Number(raw || 0);
      if (!Number.isFinite(v)) return "0";
      return v.toLocaleString("id-ID", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      });
    }

    function formatItemList(list) {
      const items = Array.isArray(list) ? list : [];
      if (!items.length) return "-";
      const looksLikePairs = items.every(function (it) {
        return String(it || "").includes(":");
      });
      if (looksLikePairs) {
        return (
          '<div class="result-pair-list">' +
          items
            .map(function (it) {
              const text = String(it || "").trim();
              return (
                '<span class="result-pair-chip">' +
                escapeHtml(text.replace(":", " -> ")) +
                "</span>"
              );
            })
            .join("") +
          "</div>"
        );
      }
      return items
        .map(function (it) {
          return escapeHtml(String(it));
        })
        .join(", ");
    }

    function renderResultItems(out) {
      if (!resultItemsBox) return;
      if (!out || out.score_only) {
        resultItemsBox.classList.add("muted");
        html(
          resultItemsBox,
          "Detail jawaban tidak ditampilkan sesuai pengaturan ujian.",
        );
        return;
      }
      const items = Array.isArray(out.items) ? out.items : [];
      if (!items.length) {
        resultItemsBox.classList.add("muted");
        html(resultItemsBox, "Detail jawaban belum tersedia.");
        return;
      }
      resultItemsBox.classList.remove("muted");
      const questionHTML = function (it) {
        const parts = [];
        if (it && it.stimulus_html) {
          parts.push(
            '<div class="result-item-stimulus">' +
              String(it.stimulus_html) +
              "</div>",
          );
        }
        if (it && it.stem_html) {
          parts.push(
            '<div class="result-item-stem">' + String(it.stem_html) + "</div>",
          );
        }
        if (Array.isArray(it && it.options) && it.options.length) {
          const opts = it.options
            .map(function (opt) {
              return (
                "<li><strong>" +
                escapeHtml(String(opt.option_key || "")) +
                ".</strong> " +
                String(opt.option_html || "") +
                "</li>"
              );
            })
            .join("");
          parts.push('<ul class="result-item-options">' + opts + "</ul>");
        }
        if (it && it.explanation_html) {
          parts.push(
            '<div class="result-item-explanation"><strong>Penjelasan:</strong> ' +
              String(it.explanation_html) +
              "</div>",
          );
        }
        return parts.join("");
      };
      const rows = items
        .map(function (it, idx) {
          return [
            "<tr>",
            "<td>" + escapeHtml(String(idx + 1)) + "</td>",
            "<td>" + escapeHtml(String(it.question_id || "-")) + "</td>",
            "<td>" + escapeHtml(String(it.question_type || "-")) + "</td>",
            "<td>" + questionHTML(it) + "</td>",
            "<td>" + escapeHtml(formatItemStatus(it)) + "</td>",
            "<td>" + escapeHtml(formatItemScore(it.earned_score)) + "</td>",
            "<td>" + formatItemList(it.selected) + "</td>",
            "<td>" + formatItemList(it.correct) + "</td>",
            "</tr>",
          ].join("");
        })
        .join("");
      html(
        resultItemsBox,
        '<div class="table-wrap"><table class="bs-table"><thead><tr>' +
          "<th>No</th>" +
          "<th>ID Soal</th>" +
          "<th>Tipe</th>" +
          "<th>Soal</th>" +
          "<th>Status</th>" +
          "<th>Skor</th>" +
          "<th>Jawaban Anda</th>" +
          "<th>Kunci</th>" +
          "</tr></thead><tbody>" +
          rows +
          "</tbody></table></div>",
      );
    }

    try {
      const out = await api("/api/v1/attempts/" + attemptID + "/result", "GET");
      const s = out.summary;
      const normalizedScore = normalizeScore(
        s && s.score,
        s && s.total_weight,
        s && s.total_questions,
      );
      const scoreLabel = Number.isFinite(normalizedScore)
        ? normalizedScore.toLocaleString("id-ID", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
        : String(normalizedScore || 0);
      const examTitle = String((s && s.title) || "").trim();
      if (resultPageTitle) {
        resultPageTitle.textContent = examTitle
          ? "Hasil " + examTitle
          : "Hasil Ujian";
      }
      if (summaryBox) {
        html(
          summaryBox,
          "<strong>Status:</strong> " +
            escapeHtml(s.status) +
            " | <strong>Nilai Akhir:</strong> " +
            escapeHtml(String(scoreLabel)),
        );
      }
      if (examTitleCell) examTitleCell.textContent = examTitle || "-";
      if (examScoreCell) examScoreCell.textContent = scoreLabel;
      renderResultItems(out);
    } catch (err) {
      text(summaryBox, "Gagal memuat hasil: " + err.message);
      if (resultItemsBox) {
        resultItemsBox.classList.add("muted");
        text(resultItemsBox, "Gagal memuat detail jawaban.");
      }
    }
  }

  function initHomePage() {
    const root = document.querySelector('[data-page="home_content"]');
    if (!root) return;

    const modal = document.getElementById("home-ai-modal");
    const openBtn = document.getElementById("home-ai-open");
    const fabBtn = document.getElementById("home-ai-fab");
    const closeBtn = document.getElementById("home-ai-close");
    const sendBtn = document.getElementById("home-ai-send");
    const input = document.getElementById("home-ai-input");
    const messages = document.getElementById("home-ai-messages");
    let lastTrigger = null;

    if (!modal || !sendBtn || !input || !messages) return;

    function setOpen(open) {
      if (!open) {
        const active = document.activeElement;
        if (
          active &&
          modal.contains(active) &&
          typeof active.blur === "function"
        ) {
          active.blur();
        }
      }
      modal.classList.toggle("is-open", open);
      modal.setAttribute("aria-hidden", open ? "false" : "true");
      if (open) {
        input.focus();
      } else if (lastTrigger && typeof lastTrigger.focus === "function") {
        lastTrigger.focus();
      }
      if (openBtn)
        openBtn.setAttribute("aria-expanded", open ? "true" : "false");
    }

    function appendMessage(textValue, user) {
      const item = document.createElement("div");
      item.className =
        "home-ai-msg " + (user ? "home-ai-msg-user" : "home-ai-msg-bot");
      item.textContent = textValue;
      messages.appendChild(item);
      messages.scrollTop = messages.scrollHeight;
    }

    async function send() {
      const q = String(input.value || "").trim();
      if (!q) return;
      appendMessage(q, true);
      input.value = "";
      sendBtn.disabled = true;
      appendMessage("Sedang memproses...", false);
      const loadingEl = messages.lastElementChild;
      try {
        const res = await fetch("/api/v1/assistant", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q }),
        });
        const json = await res.json().catch(function () {
          return {};
        });
        if (loadingEl && loadingEl.parentNode)
          loadingEl.parentNode.removeChild(loadingEl);
        if (!res.ok || !json.ok || !json.data || !json.data.reply) {
          throw new Error(
            extractAPIError(json, res.statusText || "Request failed"),
          );
        }
        appendMessage(String(json.data.reply), false);
      } catch (err) {
        if (loadingEl && loadingEl.parentNode)
          loadingEl.parentNode.removeChild(loadingEl);
        appendMessage(
          "Asisten sedang tidak tersedia. Coba beberapa saat lagi.",
          false,
        );
      } finally {
        sendBtn.disabled = false;
      }
    }

    if (openBtn) {
      openBtn.addEventListener("click", function () {
        lastTrigger = openBtn;
        setOpen(!modal.classList.contains("is-open"));
      });
    }
    if (fabBtn) {
      fabBtn.addEventListener("click", function () {
        lastTrigger = fabBtn;
        setOpen(!modal.classList.contains("is-open"));
      });
    }
    if (closeBtn) {
      closeBtn.addEventListener("click", function () {
        setOpen(false);
      });
    }
    sendBtn.addEventListener("click", send);
    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        send();
      }
    });
  }

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
    const statResults = document.getElementById("guru-stat-results");
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
    const enrollPanel = document.getElementById("guru-enroll-panel");
    const resultsPanel = document.getElementById("guru-results-panel");
    const guidePanel = document.getElementById("guru-guide-panel");
    const menuButtons = root.querySelectorAll("[data-guru-menu]");
    const menuJumpButtons = root.querySelectorAll("[data-guru-jump]");
    const guruPageTitle = document.getElementById("guru-page-title");
    const guruPageDesc = document.getElementById("guru-page-desc");

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
    const enrollRefreshBtn = document.getElementById("guru-enroll-refresh-btn");
    const examAssignForm = document.getElementById("guru-exam-assign-form");
    const assignExamIDInput = document.getElementById("guru-assign-exam-id");
    const assignSchoolSelect = document.getElementById("guru-assign-school");
    const assignClassSelect = document.getElementById("guru-assign-class");
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
    const resultsAttemptFilter = document.getElementById(
      "guru-results-attempt-filter",
    );
    const resultsClassFilter = document.getElementById(
      "guru-results-class-filter",
    );
    const resultsAssignmentBody = document.getElementById(
      "guru-results-assignment-body",
    );
    const resultsMatrixHead = document.getElementById(
      "guru-results-matrix-head",
    );
    const resultsSummary = document.getElementById("guru-results-summary");
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

    const tabQuillByWrap = new WeakMap();
    let guruUniqueParticipantCount = 0;
    let guruCompletedExamCount = 0;

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
      if (statResults) {
        statResults.textContent = String(
          Number(guruUniqueParticipantCount || 0),
        );
      }
    }

    const setMsg = function (value) {
      text(msg, value);
    };
    const setManuscriptMsg = function (value) {
      const message = String(value || "");
      if (manuscriptMessage) text(manuscriptMessage, message);
      setMsg(message);
    };
    const fmtDate = function (raw) {
      if (!raw) return "-";
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return String(raw);
      return d.toLocaleString("id-ID");
    };

    function csvEscape(value) {
      const s = String(value == null ? "" : value);
      if (!/[",\n]/.test(s)) return s;
      return '"' + s.replaceAll('"', '""') + '"';
    }

    function decodeImportWordCSVLine(rawLine) {
      const line = String(rawLine == null ? "" : rawLine).trim();
      if (!line) return "";
      if (line.startsWith('"') && line.endsWith('"') && line.length >= 2) {
        return line.slice(1, -1).replaceAll('""', '"').trim();
      }
      return line.trim();
    }

    function normalizeImportHeaderKey(raw) {
      return String(raw || "")
        .replace(/^\uFEFF/, "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");
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
      if (QuestionCodes && typeof QuestionCodes.label === "function") {
        return QuestionCodes.label(it);
      }
      return "-";
    }

    function getSubjectsCache() {
      if (GuruSubjects && typeof GuruSubjects.getCache === "function") {
        return GuruSubjects.getCache();
      }
      return [];
    }

    function findQuestionCodeByID(id) {
      if (QuestionCodes && typeof QuestionCodes.findByID === "function") {
        return QuestionCodes.findByID(id);
      }
      return null;
    }

    function fillQuestionCodeSubjectSelect(selectedID) {
      if (
        QuestionCodes &&
        typeof QuestionCodes.fillSubjectSelect === "function"
      ) {
        QuestionCodes.fillSubjectSelect(selectedID);
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

    function initGuruBlueprintsModule() {
      if (!GuruBlueprints || typeof GuruBlueprints.init !== "function") return;
      GuruBlueprints.init({ blueprints: Blueprints });
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

    function findQuestionByID(id) {
      if (GuruBlueprints && typeof GuruBlueprints.findByID === "function") {
        return GuruBlueprints.findByID(id);
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

    function findLearningGoalByID(id) {
      if (LearningGoals && typeof LearningGoals.findByID === "function") {
        return LearningGoals.findByID(id);
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

    function resolveLearningGoalIDByCode(subjectID, codeRaw) {
      if (
        LearningGoals &&
        typeof LearningGoals.resolveLearningGoalIDByCode === "function"
      ) {
        return LearningGoals.resolveLearningGoalIDByCode(subjectID, codeRaw);
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
    }

    function fillLearningGoalSubjectSelect() {
      if (
        LearningGoals &&
        typeof LearningGoals.fillSubjectSelect === "function"
      ) {
        return LearningGoals.fillSubjectSelect();
      }
    }

    function initBlueprintsModule() {
      if (!Blueprints || typeof Blueprints.init !== "function") return;
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

    initBlueprintsModule();

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

    initGuruSubjectsModule();
    initGuruDashboardModule();
    initGuruManuscriptModule();
    initGuruBlueprintsModule();
    initGuruResultsModule();

    function initLearningGoalsModule() {
      if (!LearningGoals || typeof LearningGoals.init !== "function") return;
      LearningGoals.init({
        api: api,
        apiMultipart: apiMultipart,
        beginBusy: beginBusy,
        setMsg: setMsg,
        msg: msg,
        escapeHtml: escapeHtml,
        extractAPIError: extractAPIError,
        subjectLabel: subjectLabel,
        getSubjectsCache: function () {
          return getSubjectsCache();
        },
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

    initLearningGoalsModule();

    function fillExamQuestionCodeSelectByExam(examID) {
      if (
        GuruExams &&
        typeof GuruExams.fillExamQuestionCodeSelectByExam === "function"
      ) {
        return GuruExams.fillExamQuestionCodeSelectByExam(examID);
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
      if (GuruExams && typeof GuruExams.loadExamSubjectOptions === "function") {
        return GuruExams.loadExamSubjectOptions();
      }
    }

    async function loadGuruExamManageTable() {
      if (GuruExams && typeof GuruExams.loadExamManageTable === "function") {
        return GuruExams.loadExamManageTable();
      }
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
    }

    async function loadGuruExamAssignments(examID) {
      if (GuruExams && typeof GuruExams.loadExamAssignments === "function") {
        return GuruExams.loadExamAssignments(examID);
      }
    }

    async function loadGuruEnrollExamManageTable() {
      if (GuruEnroll && typeof GuruEnroll.loadExamManageTable === "function") {
        return GuruEnroll.loadExamManageTable();
      }
      return [];
    }

    async function loadGuruEnrollSchoolsAndClasses() {
      if (
        GuruEnroll &&
        typeof GuruEnroll.loadSchoolsAndClasses === "function"
      ) {
        return GuruEnroll.loadSchoolsAndClasses();
      }
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
        examAssignmentsLoadBtn: examAssignmentsLoadBtn,
        examAssignmentsBody: examAssignmentsBody,
      });
    }

    initGuruExamsModule();
    initGuruEnrollModule();

    function initQuestionCodesModule() {
      if (!QuestionCodes || typeof QuestionCodes.init !== "function") return;
      QuestionCodes.init({
        api: api,
        beginBusy: beginBusy,
        setMsg: setMsg,
        msg: msg,
        escapeHtml: escapeHtml,
        subjectLabel: subjectLabel,
        getSubjectsCache: function () {
          return getSubjectsCache();
        },
        getManuscriptTargetSubjectID: getManuscriptTargetSubjectID,
        manuscriptQuestionCodeSelect: manuscriptQuestionCodeSelect,
        fillExamQuestionCodeSelectByExam: fillExamQuestionCodeSelectByExam,
        examQuestionCodeRuleExamIDInput: examQuestionCodeRuleExamIDInput,
        questionExamIDInput: questionExamIDInput,
        loadBlueprints: loadBlueprints,
        blueprintFilterSubjectSelect: blueprintFilterSubject,
      });
    }

    initQuestionCodesModule();

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

    initManuscriptImportModule();
    initManuscriptTransferExportModule();

    function initManuscriptTransferExportModule() {
      function updateTransferSummary() {
        if (!manuscriptTransferSummary) return;
        const selectedCount =
          ManuscriptTable &&
          typeof ManuscriptTable.getSelectedItems === "function"
            ? ManuscriptTable.getSelectedItems().length
            : 0;
        const totalCount =
          ManuscriptTable && typeof ManuscriptTable.getAllItems === "function"
            ? ManuscriptTable.getAllItems().length
            : 0;
        const sourceMode = String(
          (manuscriptTransferSourceInput &&
            manuscriptTransferSourceInput.value) ||
            "selected",
        );
        if (sourceMode === "selected") {
          manuscriptTransferSummary.textContent =
            String(selectedCount) +
            " naskah terpilih siap ditransfer dari total " +
            String(totalCount) +
            ".";
          return;
        }
        manuscriptTransferSummary.textContent =
          String(totalCount) + " naskah pada tabel aktif siap ditransfer.";
      }

      async function loadTransferGuruOptions() {
        if (!manuscriptTransferUserInput) return;
        const role = String((user && user.role) || "").toLowerCase();
        manuscriptTransferUserInput.innerHTML =
          '<option value="">Pilih guru...</option>';
        manuscriptTransferUserInput.disabled = false;

        try {
          const out = await api(
            "/api/v1/admin/users?role=guru&limit=500&offset=0",
            "GET",
          );
          const rows = Array.isArray(out && out.items) ? out.items : [];
          rows.forEach(function (it) {
            const id = Number((it && it.id) || 0);
            if (id <= 0) return;
            const name = String((it && it.full_name) || "").trim();
            const username = String((it && it.username) || "").trim();
            const label =
              String(id) +
              " | " +
              (name || username || "Guru") +
              (username ? " (@" + username + ")" : "");
            const opt = document.createElement("option");
            opt.value = String(id);
            opt.textContent = label;
            manuscriptTransferUserInput.appendChild(opt);
          });
        } catch (err) {
          const fallbackID = String((user && user.id) || "");
          const fallbackName = String((user && user.full_name) || "");
          if (fallbackID) {
            const opt = document.createElement("option");
            opt.value = fallbackID;
            opt.textContent = fallbackName || "Guru";
            manuscriptTransferUserInput.appendChild(opt);
            manuscriptTransferUserInput.value = fallbackID;
            setManuscriptMsg(
              "Gagal memuat daftar guru. Menggunakan akun sendiri.",
            );
            return;
          }
          throw err;
        }
      }

      async function loadTransferSubjectOptions(ownerID) {
        if (!manuscriptTransferSubjectInput) return;
        let list = [];

        // If ownerID is specified, load subjects for that owner
        if (ownerID && Number(ownerID) > 0) {
          try {
            list = await api("/api/v1/subjects?owner_id=" + ownerID, "GET");
          } catch (err) {
            console.error("Failed to load subjects for owner:", err);
            list = [];
          }
        } else {
          // Otherwise use cached subjects (current user's subjects)
          list = getSubjectsCache();
          if (!Array.isArray(list) || list.length === 0) {
            await loadSubjects();
            list = getSubjectsCache();
          }
        }

        const current = String(
          (manuscriptTransferSubjectInput &&
            manuscriptTransferSubjectInput.value) ||
            "",
        );
        manuscriptTransferSubjectInput.innerHTML =
          '<option value="">Pilih mapel guru penerima...</option>';
        list.forEach(function (it) {
          const id = Number((it && it.id) || 0);
          if (id <= 0) return;
          const opt = document.createElement("option");
          opt.value = String(id);
          opt.textContent = subjectLabel(it) + " [ID " + String(id) + "]";
          manuscriptTransferSubjectInput.appendChild(opt);
        });
        if (current) manuscriptTransferSubjectInput.value = current;
      }

      // Add event listener to reload subjects when target guru changes
      if (manuscriptTransferUserInput) {
        try {
          manuscriptTransferUserInput.addEventListener(
            "change",
            async function () {
              const targetUserID = Number(
                manuscriptTransferUserInput.value || 0,
              );
              if (targetUserID > 0) {
                try {
                  await loadTransferSubjectOptions(targetUserID);
                } catch (err) {
                  console.error(
                    "Failed to load transfer subject options:",
                    err,
                  );
                  setManuscriptMsg(
                    "Gagal memuat mapel guru penerima: " + err.message,
                  );
                }
              } else {
                // Reset subject dropdown if no guru selected
                if (manuscriptTransferSubjectInput) {
                  manuscriptTransferSubjectInput.innerHTML =
                    '<option value="">Pilih guru dulu...</option>';
                }
              }
            },
          );
        } catch (err) {
          console.error(
            "Failed to attach event listener to manuscriptTransferUserInput:",
            err,
          );
        }
      }

      if (manuscriptExportBtn) {
        manuscriptExportBtn.addEventListener("click", async function () {
          const items = collectManuscriptItems(true);
          if (!items.length) {
            setManuscriptMsg("Tidak ada naskah yang bisa diekspor.");
            return;
          }
          const done = beginBusy(
            manuscriptExportBtn,
            msg,
            "Menyiapkan export naskah...",
          );
          try {
            await downloadCSV(
              "/api/v1/questions/export",
              { items: items },
              "naskah_soal.csv",
            );
            setManuscriptMsg("Export naskah berhasil dibuat.");
          } catch (err) {
            setManuscriptMsg("Export naskah gagal: " + err.message);
          } finally {
            done();
          }
        });
      }

      if (manuscriptTransferBtn) {
        manuscriptTransferBtn.addEventListener("click", async function () {
          if (manuscriptTransferForm) manuscriptTransferForm.reset();
          if (manuscriptTransferOutput)
            manuscriptTransferOutput.textContent = "";
          const selectedCount =
            ManuscriptTable &&
            typeof ManuscriptTable.getSelectedItems === "function"
              ? ManuscriptTable.getSelectedItems().length
              : 0;
          if (manuscriptTransferSourceInput) {
            manuscriptTransferSourceInput.value =
              selectedCount > 0 ? "selected" : "filtered";
          }
          updateTransferSummary();
          try {
            await loadTransferGuruOptions();
            await loadTransferSubjectOptions();
          } catch (err) {
            setManuscriptMsg("Gagal memuat opsi transfer: " + err.message);
          }
          // Don't auto-fill subject - let recipient choose their own subject_id
          // The subject_id from sender might be different from recipient's subject_id
          if (
            manuscriptTransferDialog &&
            typeof manuscriptTransferDialog.showModal === "function"
          ) {
            manuscriptTransferDialog.showModal();
          }
        });
      }

      if (manuscriptTransferCancelBtn) {
        manuscriptTransferCancelBtn.addEventListener("click", function () {
          if (
            manuscriptTransferDialog &&
            typeof manuscriptTransferDialog.close === "function"
          ) {
            manuscriptTransferDialog.close();
          }
        });
      }

      if (manuscriptTransferForm) {
        if (manuscriptTransferSourceInput) {
          manuscriptTransferSourceInput.addEventListener("change", function () {
            updateTransferSummary();
          });
        }
        manuscriptTransferForm.addEventListener("submit", async function (e) {
          e.preventDefault();
          const targetUserID = Number(
            (manuscriptTransferUserInput &&
              manuscriptTransferUserInput.value) ||
              0,
          );
          const targetSubjectID = Number(
            (manuscriptTransferSubjectInput &&
              manuscriptTransferSubjectInput.value) ||
              0,
          );
          if (targetUserID <= 0 || targetSubjectID <= 0) {
            setManuscriptMsg("Target guru dan mapel wajib diisi.");
            return;
          }
          const sourceMode = String(
            (manuscriptTransferSourceInput &&
              manuscriptTransferSourceInput.value) ||
              "selected",
          );
          const useSelected = sourceMode === "selected";
          const items = collectManuscriptItems(useSelected);
          if (!items.length) {
            if (useSelected) {
              setManuscriptMsg(
                "Belum ada naskah terpilih. Pilih baris dulu atau ubah sumber ke semua naskah tabel aktif.",
              );
            } else {
              setManuscriptMsg("Tidak ada naskah pada tabel aktif.");
            }
            return;
          }
          const done = beginBusy(
            manuscriptTransferForm,
            msg,
            "Mentransfer naskah...",
          );
          try {
            const report = await api("/api/v1/questions/transfer", "POST", {
              items: items,
              target_user_id: targetUserID,
              target_subject_id: targetSubjectID,
            });
            if (manuscriptTransferOutput) {
              manuscriptTransferOutput.textContent = JSON.stringify(
                report || {},
                null,
                2,
              );
            }
            await reloadManuscriptsByCurrentTableScope();
            setManuscriptMsg("Transfer naskah selesai.");
            if (
              manuscriptTransferDialog &&
              typeof manuscriptTransferDialog.close === "function"
            ) {
              manuscriptTransferDialog.close();
            }
          } catch (err) {
            setManuscriptMsg("Transfer naskah gagal: " + err.message);
          } finally {
            done();
          }
        });
      }
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

    async function loadScriptOnce(id, src) {
      const exists = document.getElementById(id);
      if (exists) return;
      await new Promise(function (resolve, reject) {
        const s = document.createElement("script");
        s.id = id;
        s.src = src;
        s.async = true;
        s.onload = resolve;
        s.onerror = function () {
          reject(new Error("Gagal memuat script: " + src));
        };
        document.head.appendChild(s);
      });
    }

    function loadStyleOnce(id, href) {
      if (document.getElementById(id)) return;
      const l = document.createElement("link");
      l.id = id;
      l.rel = "stylesheet";
      l.href = href;
      document.head.appendChild(l);
    }

    async function ensureKatexReady() {
      loadStyleOnce(
        "katex-css",
        "https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/katex.min.css",
      );
      if (window.katex) return;
      await loadScriptOnce(
        "katex-js",
        "https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/katex.min.js",
      );
    }

    async function ensureQuillReady() {
      loadStyleOnce(
        "quill-snow-css",
        "https://cdn.jsdelivr.net/npm/quill@1.3.7/dist/quill.snow.css",
      );
      await ensureKatexReady();
      if (!window.Quill) {
        await loadScriptOnce(
          "quill-js",
          "https://cdn.jsdelivr.net/npm/quill@1.3.7/dist/quill.min.js",
        );
      }
      if (!window.__cbtQuillImageResizeRegistered) {
        try {
          await loadScriptOnce(
            "quill-image-resize-js",
            "https://cdn.jsdelivr.net/npm/quill-image-resize-module@3.0.0/image-resize.min.js",
          );
          const alreadyRegistered =
            window.Quill &&
            window.Quill.imports &&
            window.Quill.imports["modules/imageResize"];
          if (alreadyRegistered) {
            window.__cbtQuillImageResizeRegistered = true;
          } else if (window.Quill && window.ImageResize) {
            window.Quill.register("modules/imageResize", window.ImageResize);
            window.__cbtQuillImageResizeRegistered = true;
          }
        } catch (_) {
          window.__cbtQuillImageResizeRegistered = false;
        }
      }
    }

    const QUESTION_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

    function fileToDataURL(file) {
      return new Promise(function (resolve, reject) {
        const reader = new FileReader();
        reader.onload = function () {
          const base64 = String(reader.result || "");
          if (!base64) {
            reject(new Error("gambar tidak valid"));
            return;
          }
          resolve(base64);
        };
        reader.onerror = function () {
          reject(new Error("gagal membaca gambar"));
        };
        reader.readAsDataURL(file);
      });
    }

    async function uploadQuestionImageFile(file) {
      if (!file) throw new Error("file gambar tidak ditemukan");
      if (file.size > QUESTION_IMAGE_MAX_BYTES) {
        throw new Error("ukuran gambar maksimal 2MB");
      }
      const form = new FormData();
      form.append("file", file);
      return await apiMultipart("/api/v1/media/question-images", "POST", form);
    }

    function createQuillEditor(hostEl, placeholder, options) {
      if (!hostEl || !window.Quill) return null;
      const originalConsoleLog = console.log;
      const filteredConsoleLog = function () {
        if (
          arguments.length > 0 &&
          String(arguments[0] || "") === "this.options.modules"
        ) {
          return;
        }
        return originalConsoleLog.apply(console, arguments);
      };
      let quill = null;
      try {
        if (typeof originalConsoleLog === "function") {
          console.log = filteredConsoleLog;
        }
        quill = new window.Quill(hostEl, {
          theme: "snow",
          placeholder: placeholder || "",
          modules: {
            toolbar: {
              container: [
                [{ header: [false, 2, 3] }],
                ["bold", "italic", "underline"],
                [{ script: "sub" }, { script: "super" }],
                [{ align: [] }],
                [{ list: "ordered" }, { list: "bullet" }],
                ["link", "image", "formula"],
                ["clean"],
              ],
              handlers: {
                image: function () {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = "image/*";
                  input.onchange = async function () {
                    const file = input.files && input.files[0];
                    if (!file) return;
                    const range = this.quill.getSelection(true);
                    const index = range ? range.index : this.quill.getLength();
                    try {
                      const uploaded = await uploadQuestionImageFile(file);
                      const imageURL = String(
                        (uploaded && uploaded.url) || "",
                      ).trim();
                      if (!imageURL) {
                        throw new Error("URL gambar tidak tersedia");
                      }
                      this.quill.insertEmbed(index, "image", imageURL, "user");
                      this.quill.setSelection(index + 1, 0, "silent");
                    } catch (err) {
                      const msg = String(
                        (err && err.message) || "gagal upload gambar",
                      ).trim();
                      if (/maksimal 2mb/i.test(msg)) {
                        window.alert(msg);
                        return;
                      }
                      try {
                        const base64 = await fileToDataURL(file);
                        this.quill.insertEmbed(index, "image", base64, "user");
                        this.quill.setSelection(index + 1, 0, "silent");
                        window.alert(
                          "Upload ke server gagal, gambar disimpan sebagai base64 sementara.",
                        );
                      } catch (_) {
                        window.alert("Gagal memproses gambar.");
                      }
                    }
                  }.bind(this);
                  input.click();
                },
              },
            },
            imageResize: {
              modules: ["Resize", "DisplaySize", "Toolbar"],
            },
          },
        });
      } finally {
        if (typeof originalConsoleLog === "function") {
          console.log = originalConsoleLog;
        }
      }
      const fontSize = String(
        (options && options.defaultFontSize) || "",
      ).trim();
      if (fontSize && quill.root && quill.root.style) {
        quill.root.style.fontSize = fontSize;
      }
      return quill;
    }

    function getQuillHTML(quill) {
      if (!quill || !quill.root) return "";
      return String(quill.root.innerHTML || "").trim();
    }

    function cleanStemPreview(raw) {
      const text = String(raw || "").trim();
      if (!text) return "";
      const plain = toPlainText(text);
      if (!plain) return "";
      return plain.replace(/^draft naskah soal:\s*/i, "").trim();
    }

    function toPlainText(html) {
      const raw = String(html || "").trim();
      if (!raw) return "";
      const container = document.createElement("div");
      container.innerHTML = raw;
      return String(container.textContent || "")
        .replace(/\s+/g, " ")
        .trim();
    }

    function previewText(html, maxLen) {
      const text = toPlainText(html);
      if (!text) return "-";
      const limit = Math.max(20, Number(maxLen) || 80);
      if (text.length <= limit) return text;
      return text.slice(0, limit - 1).trim() + "…";
    }

    function shortQuestionType(rawType) {
      const t = String(rawType || "")
        .trim()
        .toLowerCase();
      if (t === "pg_tunggal") return "MC";
      if (t === "multi_jawaban") return "MR";
      if (t === "benar_salah_pernyataan") return "TF";
      if (t === "menjodohkan_drag_drop") return "MATCH";
      if (t === "short_answer") return "SA";
      return t ? t.toUpperCase() : "-";
    }

    initManuscriptTableModule();

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
        enroll: {
          title: "Enroll Peserta",
          desc: "Enroll peserta ke ujian Anda per kelas.",
        },
        results: {
          title: "Hasil Ujian",
          desc: buildResultsDesc(),
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

    function initGuruDashboardModule() {
      if (!GuruDashboard || typeof GuruDashboard.init !== "function") return;
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
          enroll: enrollPanel,
          results: resultsPanel,
          subjects: subjectsPanel,
          guide: guidePanel,
        },
        getMenuInfo: getGuruMenuInfo,
        onMenuActivated: async function (key) {
          if (key === "exams") {
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
          if (key === "results") {
            try {
              await loadGuruResultExamOptions();
            } catch (_) {
              // error already surfaced by the module
            }
            return;
          }
          if (key === "enroll") {
            try {
              await Promise.all([
                loadGuruEnrollExamManageTable(),
                loadGuruEnrollSchoolsAndClasses(),
              ]);
            } catch (_) {
              // error already surfaced by the module
            }
          }
        },
      });
    }

    function activateGuruMenu(menu) {
      if (GuruDashboard && typeof GuruDashboard.activateMenu === "function") {
        return GuruDashboard.activateMenu(menu);
      }
      return "dashboard";
    }

    function initGuruManuscriptModule() {
      if (!GuruManuscript || typeof GuruManuscript.init !== "function") return;
      GuruManuscript.init({
        api: api,
        beginBusy: beginBusy,
        setMsg: setMsg,
        msg: msg,
        text: text,
        escapeHtml: escapeHtml,
        createQuillEditor: createQuillEditor,
        getQuillHTML: getQuillHTML,
        getCurrentManuscriptQuestionType: getCurrentManuscriptQuestionType,
        syncManuscriptSubjectState: syncManuscriptSubjectState,
        fillLearningGoalSelect: fillLearningGoalSelect,
        fillQuestionCodeSelect: fillQuestionCodeSelect,
        ensureQuestionForManuscriptSubmission:
          ensureQuestionForManuscriptSubmission,
        findQuestionByID: findQuestionByID,
        loadBlueprints: loadBlueprints,
        fillBlueprintSelect: fillBlueprintSelect,
        resolveManuscriptQuestionType: resolveManuscriptQuestionType,
        resolveManuscriptQuestionCode: resolveManuscriptQuestionCode,
        resolveManuscriptLearningGoal: resolveManuscriptLearningGoal,
        shortQuestionType: shortQuestionType,
        loadAllManuscriptVersionsFromBlueprints:
          loadAllManuscriptVersionsFromBlueprints,
        reloadManuscriptsByCurrentTableScope:
          reloadManuscriptsByCurrentTableScope,
        renderManuscripts: renderManuscripts,
        manuscriptForm: manuscriptForm,
        manuscriptQuestionSelect: manuscriptQuestionSelect,
        manuscriptQuestionCodeSelect: manuscriptQuestionCodeSelect,
        manuscriptSubjectSelect: manuscriptSubjectSelect,
        manuscriptLearningGoalSelect: manuscriptLearningGoalSelect,
        manuscriptQuestionTypeUI: manuscriptQuestionTypeUI,
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
        resultsAttemptFilter: resultsAttemptFilter,
        resultsClassFilter: resultsClassFilter,
        resultsAssignmentBody: resultsAssignmentBody,
        resultsMatrixHead: resultsMatrixHead,
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

    async function reloadManuscriptsByCurrentTableScope(fallbackQuestionID) {
      if (
        ManuscriptTable &&
        typeof ManuscriptTable.reloadByCurrentScope === "function"
      ) {
        return ManuscriptTable.reloadByCurrentScope(fallbackQuestionID);
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
      await Promise.all([
        loadEducationLevelsForGuruSubjectForm(),
        loadSubjects(),
        loadLearningGoals(),
        loadClassesForLearningGoal(),
        loadGuruExamSubjectOptions(),
        loadGuruExamManageTable(),
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
    }

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

  async function initAuthoringPage() {
    const root = document.querySelector('[data-page="authoring_content"]');
    if (!root) return;

    const user = await meOrNull();
    if (!user) {
      window.location.href = "/login";
      return;
    }
    if (!["admin", "proktor", "guru"].includes(String(user.role || ""))) {
      alert("Halaman authoring hanya untuk admin/proktor/guru");
      window.location.href = "/";
      return;
    }

    const message = document.getElementById("authoring-message");
    const versionOut = document.getElementById("version-output");
    const parallelOut = document.getElementById("parallel-output");
    const reviewOut = document.getElementById("review-output");
    const reviewTaskList = document.getElementById("review-task-list");
    const reviewCreateForm = document.getElementById("review-create-form");
    const reviewListForm = document.getElementById("review-list-form");
    const decisionForm = document.getElementById("review-decision-form");
    const decisionStatus = document.getElementById("review-decision-status");
    const decisionNoteInput = document.getElementById("review-note-input");
    const reviewHistoryForm = document.getElementById("review-history-form");

    function pretty(el, data) {
      if (el) el.textContent = JSON.stringify(data, null, 2);
    }
    function setMsg(msg) {
      text(message, msg);
    }

    const versionCreateForm = document.getElementById("version-create-form");
    if (versionCreateForm) {
      versionCreateForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(versionCreateForm);
        const done = beginBusy(
          versionCreateForm,
          message,
          "Menyimpan versi soal...",
        );
        try {
          const qid = Number(fd.get("question_id") || 0);
          const payload = {
            stem_html: String(fd.get("stem_html") || ""),
            explanation_html: String(fd.get("explanation_html") || ""),
            hint_html: String(fd.get("hint_html") || ""),
            answer_key: JSON.parse(String(fd.get("answer_key_raw") || "{}")),
          };
          const stimulusHTML = String(fd.get("stimulus_html") || "").trim();
          if (stimulusHTML) payload.stimulus_html = stimulusHTML;
          const durationRaw = String(fd.get("duration_seconds") || "").trim();
          if (durationRaw !== "")
            payload.duration_seconds = Number(durationRaw);
          const weightRaw = String(fd.get("weight") || "").trim();
          if (weightRaw !== "") payload.weight = Number(weightRaw);
          const changeNote = String(fd.get("change_note") || "").trim();
          if (changeNote) payload.change_note = changeNote;

          const out = await api(
            "/api/v1/questions/" + qid + "/versions",
            "POST",
            payload,
          );
          pretty(versionOut, out);
          setMsg("Versi soal berhasil disimpan.");
        } catch (err) {
          setMsg("Gagal simpan versi: " + err.message);
        } finally {
          done();
        }
      });
    }

    const versionFinalizeForm = document.getElementById(
      "version-finalize-form",
    );
    if (versionFinalizeForm) {
      versionFinalizeForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(versionFinalizeForm);
        const done = beginBusy(
          versionFinalizeForm,
          message,
          "Memfinalisasi versi soal...",
        );
        try {
          const qid = Number(fd.get("question_id") || 0);
          const ver = Number(fd.get("version_no") || 0);
          const out = await api(
            "/api/v1/questions/" + qid + "/versions/" + ver + "/finalize",
            "POST",
          );
          pretty(versionOut, out);
          setMsg("Versi berhasil difinalkan.");
        } catch (err) {
          setMsg("Gagal finalize versi: " + err.message);
        } finally {
          done();
        }
      });
    }

    const versionListForm = document.getElementById("version-list-form");
    if (versionListForm) {
      versionListForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(versionListForm);
        const done = beginBusy(
          versionListForm,
          message,
          "Memuat daftar versi soal...",
        );
        try {
          const qid = Number(fd.get("question_id") || 0);
          const out = await api(
            "/api/v1/questions/" + qid + "/versions",
            "GET",
          );
          pretty(versionOut, out);
          setMsg("List versi berhasil dimuat.");
        } catch (err) {
          setMsg("Gagal list versi: " + err.message);
        } finally {
          done();
        }
      });
    }

    const parallelCreateForm = document.getElementById("parallel-create-form");
    if (parallelCreateForm) {
      parallelCreateForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(parallelCreateForm);
        const done = beginBusy(
          parallelCreateForm,
          message,
          "Menambahkan parallel exam...",
        );
        try {
          const examID = Number(fd.get("exam_id") || 0);
          const out = await api(
            "/api/v1/exams/" + examID + "/parallels",
            "POST",
            {
              question_id: Number(fd.get("question_id") || 0),
              parallel_group: String(fd.get("parallel_group") || "default"),
              parallel_order: Number(fd.get("parallel_order") || 0),
              parallel_label: String(fd.get("parallel_label") || ""),
            },
          );
          pretty(parallelOut, out);
          setMsg("Parallel berhasil ditambahkan.");
        } catch (err) {
          setMsg("Gagal tambah parallel: " + err.message);
        } finally {
          done();
        }
      });
    }

    const parallelListForm = document.getElementById("parallel-list-form");
    if (parallelListForm) {
      parallelListForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(parallelListForm);
        const done = beginBusy(
          parallelListForm,
          message,
          "Memuat daftar parallel exam...",
        );
        try {
          const examID = Number(fd.get("exam_id") || 0);
          const group = String(fd.get("parallel_group") || "").trim();
          const qs = group
            ? "?parallel_group=" + encodeURIComponent(group)
            : "";
          const out = await api(
            "/api/v1/exams/" + examID + "/parallels" + qs,
            "GET",
          );
          pretty(parallelOut, out);
          setMsg("List parallel berhasil dimuat.");
        } catch (err) {
          setMsg("Gagal list parallel: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (AuthoringReviews && typeof AuthoringReviews.init === "function") {
      AuthoringReviews.init({
        api: api,
        beginBusy: beginBusy,
        setMsg: setMsg,
        message: message,
        pretty: pretty,
        escapeHtml: escapeHtml,
        reviewOut: reviewOut,
        reviewTaskList: reviewTaskList,
        reviewCreateForm: reviewCreateForm,
        reviewListForm: reviewListForm,
        decisionForm: decisionForm,
        decisionStatus: decisionStatus,
        decisionNoteInput: decisionNoteInput,
        reviewHistoryForm: reviewHistoryForm,
      });
    }
  }

  initTopbarAuth();
  if (pages.initLoginPage) pages.initLoginPage();
  initHomePage();
  if (pages.initSimulasiPage) pages.initSimulasiPage();
  if (pages.initAdminPage) pages.initAdminPage();
  if (pages.initProktorPage) pages.initProktorPage();
  if (pages.initGuruPage) pages.initGuruPage();
  initAuthoringPage();
  if (pages.initPesertaPage) pages.initPesertaPage();
  if (pages.initAttemptPage) pages.initAttemptPage();
  if (pages.initResultPage) pages.initResultPage();
})();
