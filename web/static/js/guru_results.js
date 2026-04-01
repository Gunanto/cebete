(function () {
  var deps = null;
  var resultsAssignmentsCount = 0;
  var latestResultsMatrix = null;
  var examsCache = [];
  var examQuestionsCache = {};
  var latestItemAnalysis = null;
  var latestItemAnalysisByID = {};
  var latestItemAnalysisExamID = 0;
  var currentUserCache = null;
  var latestItemAnalysisIdentity = null;
  var latestLearningGoalResult = null;
  var latestLearningGoalByKey = {};
  var latestLearningGoalExamID = 0;
  var latestLearningGoalIdentity = null;
  var latestLearningGoalStudentView = null;
  var latestLearningGoalStudentSchool = {};
  var latestLearningGoalStudentResult = {};
  var examSchoolInfoCache = {};
  var examAssignmentsCache = {};

  function setDeps(opts) {
    deps = opts || {};
  }

  function showDialog(dialog) {
    if (!dialog) return;
    if (dialog.hidden) dialog.hidden = false;
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) {
        dialog.showModal();
      }
      return;
    }
    if (typeof dialog.show === "function") {
      if (!dialog.open) {
        dialog.show();
      }
      return;
    }
    dialog.setAttribute("open", "open");
  }

  function activateResultsMenu() {
    const fn =
      (deps && typeof deps.activateMenu === "function" && deps.activateMenu) ||
      (deps &&
        typeof deps.activateGuruMenu === "function" &&
        deps.activateGuruMenu);
    if (typeof fn === "function") fn("results");
  }

  function setResultsSummary(value) {
    if (!deps || !deps.resultsSummary) return;
    deps.text(deps.resultsSummary, value);
    deps.resultsSummary.classList.remove("muted");
  }

  function setResultsExtra(value) {
    if (!deps || !deps.resultsExtra) return;
    deps.text(deps.resultsExtra, value);
    deps.resultsExtra.classList.remove("muted");
  }

  function setResultsExtraHTML(value) {
    if (!deps || !deps.resultsExtra) return;
    deps.resultsExtra.innerHTML = String(value || "");
    deps.resultsExtra.classList.remove("muted");
  }

  function setItemAnalysisSubtitle(value) {
    if (!deps || !deps.itemAnalysisSubtitle) return;
    deps.text(deps.itemAnalysisSubtitle, value);
  }

  function setItemAnalysisSummaryHTML(value) {
    if (!deps || !deps.itemAnalysisSummary) return;
    deps.itemAnalysisSummary.innerHTML = String(value || "");
  }

  function setItemAnalysisBodyHTML(value) {
    if (!deps || !deps.itemAnalysisBody) return;
    deps.itemAnalysisBody.innerHTML = String(value || "");
  }

  function setItemAnalysisDetailHTML(value, muted) {
    if (!deps || !deps.itemAnalysisDetail) return;
    deps.itemAnalysisDetail.innerHTML = String(value || "");
    if (muted) {
      deps.itemAnalysisDetail.classList.add("muted");
      return;
    }
    deps.itemAnalysisDetail.classList.remove("muted");
  }

  function setItemAnalysisIdentityHTML(value) {
    if (!deps || !deps.itemAnalysisIdentity) return;
    deps.itemAnalysisIdentity.innerHTML = String(value || "");
  }

  function setLearningGoalSubtitle(value) {
    if (!deps || !deps.learningGoalSubtitle) return;
    deps.text(deps.learningGoalSubtitle, value);
  }

  function setLearningGoalSummaryHTML(value) {
    if (!deps || !deps.learningGoalSummary) return;
    deps.learningGoalSummary.innerHTML = String(value || "");
  }

  function setLearningGoalBodyHTML(value) {
    if (!deps || !deps.learningGoalBody) return;
    deps.learningGoalBody.innerHTML = String(value || "");
  }

  function setLearningGoalDetailHTML(value, muted) {
    if (!deps || !deps.learningGoalDetail) return;
    deps.learningGoalDetail.innerHTML = String(value || "");
    if (muted) {
      deps.learningGoalDetail.classList.add("muted");
      return;
    }
    deps.learningGoalDetail.classList.remove("muted");
  }

  function setLearningGoalIdentityHTML(value) {
    if (!deps || !deps.learningGoalIdentity) return;
    deps.learningGoalIdentity.innerHTML = String(value || "");
  }

  function setLearningGoalKKTP(value) {
    if (!deps || !deps.learningGoalKKTP) return;
    deps.learningGoalKKTP.textContent = String(value || "70.00%");
  }

  function setLearningGoalStudentSubtitle(value) {
    if (!deps || !deps.learningGoalStudentSubtitle) return;
    deps.text(deps.learningGoalStudentSubtitle, value);
  }

  function setLearningGoalStudentSummaryHTML(value) {
    if (!deps || !deps.learningGoalStudentSummary) return;
    deps.learningGoalStudentSummary.innerHTML = String(value || "");
  }

  function setLearningGoalStudentBodyHTML(value) {
    if (!deps || !deps.learningGoalStudentBody) return;
    deps.learningGoalStudentBody.innerHTML = String(value || "");
  }

  function setLearningGoalStudentDetailHTML(value, muted) {
    if (!deps || !deps.learningGoalStudentDetail) return;
    deps.learningGoalStudentDetail.innerHTML = String(value || "");
    if (muted) {
      deps.learningGoalStudentDetail.classList.add("muted");
      return;
    }
    deps.learningGoalStudentDetail.classList.remove("muted");
  }

  function setLearningGoalStudentIdentityHTML(value) {
    if (!deps || !deps.learningGoalStudentIdentity) return;
    deps.learningGoalStudentIdentity.innerHTML = String(value || "");
  }

  function setLearningGoalStudentKKTP(value) {
    if (!deps || !deps.learningGoalStudentKKTP) return;
    deps.learningGoalStudentKKTP.textContent = String(value || "70.00%");
  }

  function fillSelectOptions(selectEl, options, current, defaultLabel) {
    if (!selectEl) return;
    selectEl.innerHTML =
      '<option value="">' +
      deps.escapeHtml(defaultLabel || "Semua") +
      "</option>";
    Object.keys(options || {})
      .sort(function (a, b) {
        return String(options[a]).localeCompare(String(options[b]));
      })
      .forEach(function (raw) {
        const opt = document.createElement("option");
        opt.value = raw;
        opt.textContent = options[raw];
        if (current && current === raw) opt.selected = true;
        selectEl.appendChild(opt);
      });
  }

  function questionTypeLabel(raw) {
    const t = String(raw || "")
      .trim()
      .toLowerCase();
    if (!t) return "-";
    const key = t.replace(/[\s_-]+/g, "");
    if (
      key === "multiplechoice" ||
      key === "pilihanganda" ||
      key === "pg" ||
      key === "mc" ||
      key === "pgtunggal"
    ) {
      return "MC";
    }
    if (
      key === "multipleresponse" ||
      key === "multiresponse" ||
      key === "multijawaban" ||
      key === "multijawab" ||
      key === "mr" ||
      key === "multijawaban"
    ) {
      return "MR";
    }
    if (
      key === "truefalse" ||
      key === "benarsalah" ||
      key === "tf" ||
      key === "benarsalahpernyataan"
    ) {
      return "TF";
    }
    if (key === "shortanswer" || key === "isiansingkat" || key === "sa") {
      return "SA";
    }
    return "-";
  }

  function stripHtmlToText(raw) {
    const html = String(raw || "");
    if (!html) return "";
    const div = document.createElement("div");
    div.innerHTML = html;
    return String(div.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function difficultyLabel(p) {
    if (p >= 0.7) return "Mudah";
    if (p >= 0.3) return "Sedang";
    return "Sukar";
  }

  function discriminationLabel(d) {
    if (d >= 0.4) return "Sangat Baik";
    if (d >= 0.3) return "Baik";
    if (d >= 0.2) return "Cukup";
    if (d >= 0.1) return "Rendah";
    return "Sangat Rendah";
  }

  function validityLabel(d) {
    return d >= 0.3 ? "Valid" : "Tidak Valid";
  }

  function statusLabel(difficulty, discrimination) {
    if (discrimination < 0.1) return "Dibuang";
    if (difficulty < 0.2 || difficulty > 0.85 || discrimination < 0.3) {
      return "Perlu Revisi";
    }
    return "Diterima";
  }

  function buildStatCard(title, value, cls) {
    return [
      '<div class="analysis-stat-card ' + (cls || "") + '">',
      '<div class="analysis-stat-title">' + deps.escapeHtml(title) + "</div>",
      '<div class="analysis-stat-value">' + deps.escapeHtml(value) + "</div>",
      "</div>",
    ].join("");
  }

  function csvEscape(value) {
    const s = String(value == null ? "" : value);
    if (!/[",\n]/.test(s)) return s;
    return '"' + s.replaceAll('"', '""') + '"';
  }

  function findExamByID(examID) {
    const list = Array.isArray(examsCache) ? examsCache : [];
    for (let i = 0; i < list.length; i += 1) {
      const it = list[i];
      if (Number((it && it.id) || 0) === Number(examID)) return it;
    }
    return null;
  }

  function getExamSelectInfo(examID) {
    if (!deps || !deps.resultsExamSelect) return null;
    const options = Array.from(deps.resultsExamSelect.options || []);
    const target = options.find(function (opt) {
      return String(opt.value || "") === String(examID || "");
    });
    if (!target) return null;
    const text = String(target.textContent || "");
    const match = text.match(/^#\d+\s*-\s*(.*)\s+\((.*)\)\s*$/);
    if (!match) return null;
    return {
      title: match[1] ? match[1].trim() : "",
      code: match[2] ? match[2].trim() : "",
    };
  }

  async function ensureExamSchoolInfo(examID) {
    const key = String(examID || 0);
    if (examSchoolInfoCache[key]) return examSchoolInfoCache[key];
    if (!deps || typeof deps.api !== "function")
      return { name: "", city: "", address: "" };
    try {
      const rows = await deps.api(
        "/api/v1/admin/exams/" + Number(examID) + "/assignments",
        "GET",
      );
      const list = Array.isArray(rows) ? rows : [];
      let name = "";
      let city = "";
      let address = "";
      for (let i = 0; i < list.length; i += 1) {
        const it = list[i] || {};
        if (!name) {
          const rawName = String(it.school_name || "").trim();
          if (rawName) name = rawName;
        }
        if (!city) {
          const rawCity = String(it.school_city || "").trim();
          if (rawCity) city = rawCity;
        }
        if (!address) {
          const rawAddress = String(it.school_address || "").trim();
          if (rawAddress) address = rawAddress;
        }
        if (name && city && address) break;
      }
      const info = {
        name: name || "",
        city: city || "",
        address: address || "",
      };
      examSchoolInfoCache[key] = info;
      return info;
    } catch (_) {
      const info = { name: "", city: "", address: "" };
      examSchoolInfoCache[key] = info;
      return info;
    }
  }

  async function ensureAttemptStudentSchoolInfo(attemptID) {
    const key = String(attemptID || 0);
    if (latestLearningGoalStudentSchool[key]) {
      return latestLearningGoalStudentSchool[key];
    }
    if (!deps || typeof deps.api !== "function" || !attemptID) {
      return { schoolName: "", schoolCity: "" };
    }
    try {
      const out = await deps.api(
        "/api/v1/attempts/" + Number(attemptID) + "/student-school",
        "GET",
      );
      const info = {
        schoolName: String((out && out.school_name) || "").trim(),
        schoolCity: String((out && out.school_city) || "").trim(),
      };
      latestLearningGoalStudentSchool[key] = info;
      return info;
    } catch (_) {
      const info = { schoolName: "", schoolCity: "" };
      latestLearningGoalStudentSchool[key] = info;
      return info;
    }
  }

  async function ensureAttemptLearningGoalResultLoaded(attemptID) {
    const key = String(attemptID || 0);
    if (Object.prototype.hasOwnProperty.call(latestLearningGoalStudentResult, key)) {
      return latestLearningGoalStudentResult[key];
    }
    if (!deps || typeof deps.api !== "function" || !attemptID) {
      return null;
    }
    const out = await deps.api(
      "/api/v1/attempts/" + Number(attemptID) + "/learning-goal-result",
      "GET",
    );
    latestLearningGoalStudentResult[key] = out || null;
    return latestLearningGoalStudentResult[key];
  }

  async function ensureExamClassNames(examID, fallbackRows) {
    const key = String(examID || 0);
    if (examAssignmentsCache[key]) return examAssignmentsCache[key];
    const fallback = Array.isArray(fallbackRows)
      ? fallbackRows
          .map(function (row) {
            return String((row && row.class_name) || "").trim();
          })
          .filter(function (name) {
            return name;
          })
      : [];
    if (!deps || typeof deps.api !== "function") {
      examAssignmentsCache[key] = fallback;
      return fallback;
    }
    try {
      const rows = await deps.api(
        "/api/v1/admin/exams/" + Number(examID) + "/assignments",
        "GET",
      );
      const list = Array.isArray(rows) ? rows : [];
      const names = [];
      list.forEach(function (it) {
        const raw = String((it && it.class_name) || "").trim();
        if (raw && names.indexOf(raw) === -1) names.push(raw);
      });
      if (!names.length && fallback.length) {
        examAssignmentsCache[key] = fallback;
        return fallback;
      }
      examAssignmentsCache[key] = names;
      return names;
    } catch (_) {
      examAssignmentsCache[key] = fallback;
      return fallback;
    }
  }

  async function ensureCurrentUser() {
    if (currentUserCache) return currentUserCache;
    if (!deps || typeof deps.meOrNull !== "function") return null;
    try {
      currentUserCache = await deps.meOrNull();
    } catch (_) {
      currentUserCache = null;
    }
    return currentUserCache;
  }

  function fmtDuration(minutes) {
    const mins = Number(minutes || 0);
    if (!mins || mins <= 0) return "-";
    return String(mins) + " Menit";
  }

  function fmtDateOnly(raw) {
    if (!raw) return "-";
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  function maxEndedAt(rows) {
    let maxTs = null;
    rows.forEach(function (row) {
      const raw = row && row.ended_at;
      if (!raw) return;
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return;
      if (!maxTs || d.getTime() > maxTs.getTime()) {
        maxTs = d;
      }
    });
    return maxTs;
  }

  function renderIdentityHTML(identity, title) {
    if (!identity) return "";
    return [
      '<div class="analysis-identity-title">' +
        deps.escapeHtml(title || "ANALISIS BUTIR SOAL") +
        "</div>",
      '<div class="analysis-identity-grid">',
      '<table class="analysis-identity-table">',
      "<tr><td>Nama Sekolah</td><td>: " +
        deps.escapeHtml(identity.schoolName || "-") +
        "</td></tr>",
      "<tr><td>Nama Ujian</td><td>: " +
        deps.escapeHtml(identity.examTitle || "-") +
        "</td></tr>",
      "<tr><td>Kode Soal</td><td>: " +
        deps.escapeHtml(identity.examCode || "-") +
        "</td></tr>",
      "<tr><td>Mata Pelajaran</td><td>: " +
        deps.escapeHtml(identity.subjectName || "-") +
        "</td></tr>",
      "</table>",
      '<table class="analysis-identity-table">',
      "<tr><td>Pelaksanaan (Mulai)</td><td>: " +
        deps.escapeHtml(identity.startedAt || "-") +
        "</td></tr>",
      "<tr><td>Diakhiri oleh Peserta</td><td>: " +
        deps.escapeHtml(identity.endedAt || "-") +
        "</td></tr>",
      "<tr><td>Lama Pengerjaan</td><td>: " +
        deps.escapeHtml(identity.duration || "-") +
        "</td></tr>",
      "<tr><td>Nama Guru</td><td>: " +
        deps.escapeHtml(identity.teacherName || "-") +
        "</td></tr>",
      "</table>",
      "</div>",
    ].join("");
  }

  async function ensureExamQuestions(examID) {
    const key = String(examID || 0);
    if (examQuestionsCache[key]) return examQuestionsCache[key];
    if (!deps || typeof deps.api !== "function") return [];
    const list = await deps.api(
      "/api/v1/admin/exams/" + Number(examID) + "/questions",
      "GET",
    );
    const items = Array.isArray(list) ? list : [];
    examQuestionsCache[key] = items;
    return items;
  }

  function buildAnswerDistribution(rows, questionIndex) {
    const counts = {};
    const correctCounts = {};
    rows.forEach(function (row) {
      const answers = Array.isArray(row.answers) ? row.answers : [];
      const states = Array.isArray(row.answer_states) ? row.answer_states : [];
      const raw = String(answers[questionIndex] || "").trim();
      const label = raw ? raw : "Kosong";
      counts[label] = (counts[label] || 0) + 1;
      if (String(states[questionIndex] || "").toLowerCase() === "correct") {
        correctCounts[label] = (correctCounts[label] || 0) + 1;
      }
    });
    const items = Object.keys(counts).map(function (label) {
      return {
        label: label,
        count: counts[label],
        isCorrect: (correctCounts[label] || 0) > 0,
      };
    });
    items.sort(function (a, b) {
      if (b.count !== a.count) return b.count - a.count;
      return String(a.label).localeCompare(String(b.label));
    });
    return items;
  }

  function calcDiscrimination(rows, questionIndex) {
    if (!rows.length) return 0;
    const sorted = rows.slice().sort(function (a, b) {
      return (
        Number((b && b.skor_total) || 0) - Number((a && a.skor_total) || 0)
      );
    });
    const groupSize = Math.max(1, Math.round(sorted.length * 0.27));
    const topGroup = sorted.slice(0, groupSize);
    const bottomGroup = sorted.slice(sorted.length - groupSize);
    function countCorrect(list) {
      return list.reduce(function (acc, row) {
        const states = Array.isArray(row.answer_states)
          ? row.answer_states
          : [];
        if (String(states[questionIndex] || "").toLowerCase() === "correct") {
          return acc + 1;
        }
        return acc;
      }, 0);
    }
    const pHigh = groupSize > 0 ? countCorrect(topGroup) / groupSize : 0;
    const pLow = groupSize > 0 ? countCorrect(bottomGroup) / groupSize : 0;
    return pHigh - pLow;
  }

  function buildItemAnalysis(matrix, questions) {
    const rows = Array.isArray(matrix && matrix.rows) ? matrix.rows : [];
    const questionNos = Array.isArray(matrix && matrix.question_nos)
      ? matrix.question_nos
      : [];
    const questionBySeq = {};
    (Array.isArray(questions) ? questions : []).forEach(function (q) {
      const seq = Number(q && q.seq_no);
      if (seq > 0) questionBySeq[seq] = q;
    });
    const items = questionNos.map(function (seqNo, idx) {
      const q = questionBySeq[seqNo] || {};
      const correctCount = rows.reduce(function (acc, row) {
        const states = Array.isArray(row.answer_states)
          ? row.answer_states
          : [];
        if (String(states[idx] || "").toLowerCase() === "correct") {
          return acc + 1;
        }
        return acc;
      }, 0);
      const wrongCount = rows.reduce(function (acc, row) {
        const states = Array.isArray(row.answer_states)
          ? row.answer_states
          : [];
        if (String(states[idx] || "").toLowerCase() === "wrong") {
          return acc + 1;
        }
        return acc;
      }, 0);
      const totalCount = rows.length;
      const difficulty = totalCount > 0 ? correctCount / totalCount : 0;
      const discrimination = calcDiscrimination(rows, idx);
      const validity = validityLabel(discrimination);
      const validityCoefficient = discrimination;
      const status = statusLabel(difficulty, discrimination);
      return {
        id: String((q && q.question_id) || seqNo || idx + 1),
        no: seqNo || idx + 1,
        type: questionTypeLabel(q && q.question_type),
        rawType: String((q && q.question_type) || ""),
        question: stripHtmlToText(
          String((q && (q.stem_preview || q.question_title)) || "-"),
        ),
        difficulty: difficulty,
        discrimination: discrimination,
        validity: validity,
        validityCoefficient: validityCoefficient,
        correctCount: correctCount,
        wrongCount: wrongCount,
        totalCount: totalCount,
        status: status,
        distractors: buildAnswerDistribution(rows, idx),
      };
    });
    return items;
  }

  function renderItemAnalysisSummary(items) {
    const total = items.length;
    const accepted = items.filter(function (it) {
      return it.status === "Diterima";
    }).length;
    const discarded = items.filter(function (it) {
      return it.status === "Dibuang";
    }).length;
    const revision = items.filter(function (it) {
      return it.status === "Perlu Revisi";
    }).length;
    return [
      buildStatCard("Total Butir", String(total), "total"),
      buildStatCard("Diterima", String(accepted), "accepted"),
      buildStatCard("Perlu Revisi", String(revision), "revision"),
      buildStatCard("Dibuang", String(discarded), "discarded"),
    ].join("");
  }

  function renderItemAnalysisRows(items) {
    if (!items.length) {
      return '<tr><td colspan="9" class="muted">Belum ada data analisis.</td></tr>';
    }
    return items
      .map(function (it) {
        const difficultyPct = (it.difficulty * 100).toFixed(2) + "%";
        const discriminationPct = (it.discrimination * 100).toFixed(2) + "%";
        const validityCoef = Number(it.validityCoefficient || 0).toFixed(3);
        const validityRowClass =
          String(it.validity || "").trim() === "Valid"
            ? "analysis-row-valid"
            : "analysis-row-invalid";
        return [
          '<tr class="analysis-row ' +
            validityRowClass +
            '" data-item-id="' +
            deps.escapeHtml(String(it.id)) +
            '">',
          "<td>" + deps.escapeHtml(String(it.no)) + "</td>",
          "<td>" + deps.escapeHtml(String(it.type)) + "</td>",
          '<td class="analysis-question">' +
            deps.escapeHtml(String(it.question || "-")) +
            "</td>",
          "<td>" +
            deps.escapeHtml(difficultyPct) +
            " (" +
            deps.escapeHtml(difficultyLabel(it.difficulty)) +
            ")</td>",
          "<td>" +
            deps.escapeHtml(discriminationPct) +
            " (" +
            deps.escapeHtml(discriminationLabel(it.discrimination)) +
            ")</td>",
          "<td>" +
            deps.escapeHtml(String(it.validity)) +
            " (" +
            deps.escapeHtml(validityCoef) +
            ")</td>",
          "<td>" + deps.escapeHtml(String(it.correctCount)) + "</td>",
          "<td>" + deps.escapeHtml(String(it.wrongCount)) + "</td>",
          '<td><span class="analysis-status analysis-status-' +
            (it.status === "Diterima"
              ? "accepted"
              : it.status === "Dibuang"
                ? "discarded"
                : "revision") +
            '">' +
            deps.escapeHtml(String(it.status)) +
            "</span></td>",
          "</tr>",
        ].join("");
      })
      .join("");
  }

  function renderItemDetail(item) {
    if (!item) {
      return '<div class="muted">Pilih salah satu baris untuk melihat detail.</div>';
    }
    const total = item.totalCount || 0;
    const distractors = Array.isArray(item.distractors) ? item.distractors : [];
    const rows = distractors.map(function (d) {
      const pct = total > 0 ? ((d.count / total) * 100).toFixed(2) : "0.00";
      return [
        '<div class="analysis-distractor">',
        '<div class="analysis-distractor-head">',
        '<span class="analysis-distractor-label">' +
          deps.escapeHtml(String(d.label)) +
          "</span>",
        '<span class="analysis-distractor-count">' +
          deps.escapeHtml(String(d.count)) +
          " (" +
          deps.escapeHtml(pct) +
          "%)</span>",
        d.isCorrect
          ? '<span class="analysis-distractor-correct">Kunci</span>'
          : "",
        "</div>",
        '<div class="analysis-distractor-bar">',
        '<span style="width:' + pct + '%"></span>',
        "</div>",
        "</div>",
      ].join("");
    });
    return [
      '<div class="analysis-detail-header">',
      "<h4>Detail Butir #" + deps.escapeHtml(String(item.no)) + "</h4>",
      '<div class="analysis-detail-text">' +
        deps.escapeHtml(String(item.question || "-")) +
        "</div>",
      "</div>",
      '<div class="analysis-detail-meta">',
      "<div>Tipe: <strong>" +
        deps.escapeHtml(String(item.type)) +
        "</strong></div>",
      "<div>Kesukaran: <strong>" +
        deps.escapeHtml(difficultyLabel(item.difficulty)) +
        "</strong></div>",
      "<div>Daya Pembeda: <strong>" +
        deps.escapeHtml(discriminationLabel(item.discrimination)) +
        "</strong></div>",
      "<div>Validitas: <strong>" +
        deps.escapeHtml(String(item.validity)) +
        " (" +
        deps.escapeHtml(Number(item.validityCoefficient || 0).toFixed(3)) +
        ")" +
        "</strong></div>",
      "</div>",
      '<div class="analysis-distractors">',
      rows.join(""),
      "</div>",
    ].join("");
  }

  function percentText(value) {
    return Number(value || 0).toFixed(2) + "%";
  }

  function learningGoalStatusLabel(achieved) {
    return achieved ? "Tercapai" : "Belum Tercapai";
  }

  function learningGoalStatusClass(achieved) {
    return achieved ? "accepted" : "revision";
  }

  function renderLearningGoalSummary(data) {
    const result = data || {};
    const items = Array.isArray(result.items) ? result.items : [];
    const totalStudents = Number(result.total_students || 0);
    const achievedStudentRates = items.length
      ? items.reduce(function (acc, it) {
          const total = Number(it.student_count || 0);
          if (!total) return acc;
          return acc + (Number(it.achieved_student_count || 0) / total) * 100;
        }, 0) / items.length
      : 0;
    return [
      buildStatCard("KKTP", percentText(result.kktp || 0), "is-primary"),
      buildStatCard("Total TP", String(result.total_goals || 0), ""),
      buildStatCard("TP Tercapai", String(result.achieved_goals || 0), ""),
      buildStatCard(
        "TP Belum Tercapai",
        String(result.unachieved_goals || 0),
        "",
      ),
      buildStatCard("Peserta/Attempt", String(totalStudents), ""),
      buildStatCard(
        "Rerata Siswa Tercapai",
        percentText(achievedStudentRates),
        "",
      ),
    ].join("");
  }

  function renderLearningGoalRows(items) {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) {
      return '<tr><td colspan="7" class="muted">Belum ada data ketercapaian TP.</td></tr>';
    }
    return list
      .map(function (it, idx) {
        const key =
          String(
            it.learning_goal_id != null ? it.learning_goal_id : "none-" + idx,
          ) +
          "::" +
          String(it.learning_goal_text || "");
        return [
          '<tr class="analysis-row ' +
            (it.achieved ? "analysis-row-valid" : "analysis-row-invalid") +
            '" data-goal-key="' +
            deps.escapeHtml(key) +
            '">',
          "<td>" +
            deps.escapeHtml(String(it.learning_goal_text || "Tanpa TP")) +
            "</td>",
          "<td>" +
            deps.escapeHtml(String(it.learning_goal_materi || "-")) +
            "</td>",
          "<td>" + deps.escapeHtml(String(it.question_count || 0)) + "</td>",
          "<td>" +
            deps.escapeHtml(Number(it.total_weight || 0).toFixed(2)) +
            "</td>",
          "<td>" +
            deps.escapeHtml(percentText(it.average_percent || 0)) +
            "</td>",
          "<td>" +
            deps.escapeHtml(
              String(it.achieved_student_count || 0) +
                "/" +
                String(it.student_count || 0),
            ) +
            "</td>",
          '<td><span class="analysis-status analysis-status-' +
            learningGoalStatusClass(!!it.achieved) +
            '">' +
            deps.escapeHtml(learningGoalStatusLabel(!!it.achieved)) +
            "</span></td>",
          "</tr>",
        ].join("");
      })
      .join("");
  }

  function renderLearningGoalDetail(item, kktp) {
    if (!item) {
      return '<div class="muted">Pilih salah satu baris untuk melihat detail ketercapaian per peserta.</div>';
    }
    const students = Array.isArray(item.students) ? item.students : [];
    const studentRows = students.length
      ? [
          '<div class="analysis-table-wrap mt"><table class="bs-table analysis-table">',
          "<thead><tr><th>Peserta</th><th>Kelas</th><th>Attempt</th><th>Bobot Dicapai</th><th>Total Bobot</th><th>Persentase</th><th>Status</th></tr></thead>",
          "<tbody>",
          students
            .map(function (student) {
              return [
                "<tr>",
                "<td>" +
                  deps.escapeHtml(String(student.full_name || "-")) +
                  "</td>",
                "<td>" +
                  deps.escapeHtml(String(student.class_name || "-")) +
                  "</td>",
                "<td>" +
                  deps.escapeHtml(String(student.attempt_ke || 0)) +
                  "</td>",
                "<td>" +
                  deps.escapeHtml(
                    Number(student.earned_weight || 0).toFixed(2),
                  ) +
                  "</td>",
                "<td>" +
                  deps.escapeHtml(
                    Number(student.total_weight || 0).toFixed(2),
                  ) +
                  "</td>",
                "<td>" +
                  deps.escapeHtml(percentText(student.percent || 0)) +
                  "</td>",
                '<td><span class="analysis-status analysis-status-' +
                  learningGoalStatusClass(!!student.achieved) +
                  '">' +
                  deps.escapeHtml(learningGoalStatusLabel(!!student.achieved)) +
                  "</span></td>",
                "</tr>",
              ].join("");
            })
            .join(""),
          "</tbody></table></div>",
        ].join("")
      : '<div class="muted">Belum ada peserta pada TP ini.</div>';
    return [
      '<div class="analysis-detail-header">',
      "<h4>" +
        deps.escapeHtml(String(item.learning_goal_text || "Tanpa TP")) +
        "</h4>",
      '<div class="analysis-detail-text">' +
        "Materi: " +
        deps.escapeHtml(String(item.learning_goal_materi || "-")) +
        "</div>",
      "</div>",
      '<div class="analysis-detail-meta">',
      "<div>Jumlah Butir: <strong>" +
        deps.escapeHtml(String(item.question_count || 0)) +
        "</strong></div>",
      "<div>Total Bobot: <strong>" +
        deps.escapeHtml(Number(item.total_weight || 0).toFixed(2)) +
        "</strong></div>",
      "<div>Rata-rata Capaian: <strong>" +
        deps.escapeHtml(percentText(item.average_percent || 0)) +
        "</strong></div>",
      "<div>KKTP: <strong>" +
        deps.escapeHtml(percentText(kktp || 0)) +
        "</strong></div>",
      "<div>Siswa Tercapai: <strong>" +
        deps.escapeHtml(
          String(item.achieved_student_count || 0) +
            "/" +
            String(item.student_count || 0),
        ) +
        "</strong></div>",
      "<div>Status TP: <strong>" +
        deps.escapeHtml(learningGoalStatusLabel(!!item.achieved)) +
        "</strong></div>",
      "</div>",
      studentRows,
    ].join("");
  }

  function getResultsCount() {
    return Number(resultsAssignmentsCount || 0);
  }

  function fillResultsExamSelect() {
    if (!deps || !deps.resultsExamSelect) return;
    const current = String(deps.resultsExamSelect.value || "");
    deps.resultsExamSelect.innerHTML =
      '<option value="">Pilih ujian...</option>';
    (Array.isArray(examsCache) ? examsCache : []).forEach(function (it) {
      const examID = Number((it && it.id) || 0);
      if (examID <= 0) return;
      const o = document.createElement("option");
      o.value = String(examID);
      o.textContent =
        "#" +
        String(examID) +
        " - " +
        String((it && it.title) || "") +
        " (" +
        String((it && it.code) || "") +
        ")";
      if (current && current === o.value) o.selected = true;
      deps.resultsExamSelect.appendChild(o);
    });
  }

  function setExams(list) {
    examsCache = Array.isArray(list) ? list : [];
    fillResultsExamSelect();
  }

  function getActiveAttemptFilter() {
    if (!deps || !deps.resultsAttemptFilter) return "";
    return String(deps.resultsAttemptFilter.value || "").trim();
  }

  function getActiveClassFilter() {
    if (!deps || !deps.resultsClassFilter) return "";
    return String(deps.resultsClassFilter.value || "").trim();
  }

  function hasActiveResultsFilters() {
    return Boolean(getActiveAttemptFilter() || getActiveClassFilter());
  }

  function filterResultsRows(rows) {
    const attemptFilter = getActiveAttemptFilter();
    const classFilter = getActiveClassFilter();
    if (!attemptFilter && !classFilter) return rows;
    return (Array.isArray(rows) ? rows : []).filter(function (row) {
      if (attemptFilter) {
        const attempt = Number((row && row.attempt_ke) || 0);
        if (attempt !== Number(attemptFilter || 0)) return false;
      }
      if (classFilter) {
        const name = String((row && row.class_name) || "").trim();
        if (name !== classFilter) return false;
      }
      return true;
    });
  }

  function renderResultsRows(rows, questionNos, totalWeight) {
    if (!deps || !deps.resultsAssignmentBody) return;
    const list = Array.isArray(rows) ? rows : [];
    const questions = Array.isArray(questionNos) ? questionNos : [];
    if (!list.length) {
      deps.resultsAssignmentBody.innerHTML =
        '<tr><td colspan="' +
        String(9 + questions.length) +
        '" class="muted">Tidak ada data sesuai filter yang dipilih.</td></tr>';
      return;
    }
    deps.resultsAssignmentBody.innerHTML = "";
    list.forEach(function (it) {
      const answers = Array.isArray(it.answers) ? it.answers : [];
      const answerStates = Array.isArray(it.answer_states)
        ? it.answer_states
        : [];
      const scoreValue = Number(it.skor_total || 0);
      const nilai =
        totalWeight > 0
          ? ((scoreValue / totalWeight) * 100).toFixed(2)
          : "0.00";
      const answerCells = questions.map(function (_, idx) {
        const state = String(answerStates[idx] || "")
          .trim()
          .toLowerCase();
        const cls =
          state === "correct"
            ? "result-cell-correct"
            : state === "wrong"
              ? "result-cell-wrong"
              : "";
        return (
          '<td class="' +
          cls +
          '">' +
          deps.escapeHtml(String(answers[idx] || "")) +
          "</td>"
        );
      });
      const participantCell = deps.learningGoalStudentDialog
        ? '<td><button class="btn btn-secondary btn-inline" type="button" data-attempt-open-learning-goal="' +
          deps.escapeHtml(String(it.attempt_id || 0)) +
          '">' +
          deps.escapeHtml(String(it.full_name || "-")) +
          "</button></td>"
        : "<td>" + deps.escapeHtml(String(it.full_name || "-")) + "</td>";
      const tr = document.createElement("tr");
      tr.innerHTML = [
        participantCell,
        "<td>" + deps.escapeHtml(String(it.school_name || "-")) + "</td>",
        "<td>" + deps.escapeHtml(String(it.class_name || "-")) + "</td>",
        "<td>" + deps.escapeHtml(String(it.attempt_ke || 0)) + "</td>",
        "<td>" + deps.escapeHtml(String(scoreValue)) + "</td>",
        "<td>" + deps.escapeHtml(String(nilai)) + "</td>",
        "<td>" + deps.escapeHtml(deps.fmtDate(it.started_at)) + "</td>",
        "<td>" + deps.escapeHtml(deps.fmtDate(it.ended_at)) + "</td>",
        '<td><button class="btn btn-secondary btn-inline" type="button" data-attempt-delete="' +
          deps.escapeHtml(String(it.attempt_id || 0)) +
          '">Hapus</button></td>',
      ]
        .concat(answerCells)
        .join("");
      deps.resultsAssignmentBody.appendChild(tr);
    });
  }

  function resultsFilterLabel() {
    const parts = [];
    const attemptFilter = getActiveAttemptFilter();
    const classFilter = getActiveClassFilter();
    if (attemptFilter) parts.push("Attempt " + attemptFilter);
    if (classFilter) parts.push("Kelas " + classFilter);
    if (!parts.length) return "";
    return "Filter: " + parts.join(", ");
  }

  function updateAttemptFilterOptions(rows) {
    if (!deps || !deps.resultsAttemptFilter) return;
    const current = String(deps.resultsAttemptFilter.value || "");
    const attempts = {};
    (Array.isArray(rows) ? rows : []).forEach(function (it) {
      const val = Number((it && it.attempt_ke) || 0);
      if (val > 0) attempts[val] = true;
    });
    const list = Object.keys(attempts)
      .map(function (raw) {
        return Number(raw);
      })
      .filter(function (n) {
        return !Number.isNaN(n);
      })
      .sort(function (a, b) {
        return a - b;
      });
    deps.resultsAttemptFilter.innerHTML =
      '<option value="">Semua attempt</option>';
    list.forEach(function (val) {
      const opt = document.createElement("option");
      opt.value = String(val);
      opt.textContent = "Attempt " + String(val);
      if (current && current === opt.value) opt.selected = true;
      deps.resultsAttemptFilter.appendChild(opt);
    });
    if (current && !deps.resultsAttemptFilter.value) {
      deps.resultsAttemptFilter.value = "";
    }
  }

  function updateClassFilterOptions(classNames) {
    if (!deps || !deps.resultsClassFilter) return;
    const current = String(deps.resultsClassFilter.value || "");
    const list = (Array.isArray(classNames) ? classNames : [])
      .map(function (raw) {
        return String(raw || "").trim();
      })
      .filter(function (name) {
        return name;
      })
      .filter(function (name, idx, arr) {
        return arr.indexOf(name) === idx;
      })
      .sort(function (a, b) {
        return a.localeCompare(b);
      });
    deps.resultsClassFilter.innerHTML = '<option value="">Semua kelas</option>';
    list.forEach(function (name) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      if (current && current === opt.value) opt.selected = true;
      deps.resultsClassFilter.appendChild(opt);
    });
    if (current && !deps.resultsClassFilter.value) {
      deps.resultsClassFilter.value = "";
    }
  }

  async function refreshResultsFilters(examID, rows) {
    updateAttemptFilterOptions(rows);
    if (!deps || !deps.resultsClassFilter) return;
    const classNames = await ensureExamClassNames(examID, rows);
    updateClassFilterOptions(classNames);
  }

  function applyResultsFilters() {
    const matrix = latestResultsMatrix;
    if (!matrix) return;
    const rows = Array.isArray(matrix && matrix.rows) ? matrix.rows : [];
    const questionNos = Array.isArray(matrix && matrix.question_nos)
      ? matrix.question_nos
      : [];
    let totalWeight = Number((matrix && matrix.total_weight) || 0);
    if (totalWeight <= 0 && questionNos.length > 0) {
      totalWeight = questionNos.length;
    }
    const filtered = filterResultsRows(rows);
    renderResultsRows(filtered, questionNos, totalWeight);
    const total = rows.length;
    const label = resultsFilterLabel();
    setResultsSummary(
      "Exam #" +
        String((matrix && matrix.exam_id) || "-") +
        " | Attempt tampil: " +
        String(filtered.length) +
        " dari " +
        String(total) +
        " | Jumlah soal: " +
        String(questionNos.length) +
        (label ? " | " + label : ""),
    );
    if (!filtered.length && total > 0) {
      setResultsExtra("Tidak ada data sesuai filter yang dipilih.");
      return;
    }
    if (hasActiveResultsFilters()) {
      setResultsExtra(
        "Filter diterapkan. Gunakan Muat Laporan/Statistik/Grafik atau Download Excel.",
      );
      return;
    }
    setResultsExtra(
      "Hasil ujian dimuat. Gunakan Muat Laporan/Statistik/Grafik atau Download Excel.",
    );
  }

  function buildResultsScoreChartHTML(rows, totalMaxScore) {
    const list = (Array.isArray(rows) ? rows : [])
      .slice()
      .sort(function (a, b) {
        return (
          Number((a && a.skor_total) || 0) - Number((b && b.skor_total) || 0)
        );
      });
    if (!list.length) {
      return '<span class="muted">Belum ada data grafik.</span>';
    }
    const labels = list.map(function (r) {
      return (
        String((r && r.full_name) || "-") +
        " (" +
        String((r && r.attempt_ke) || 0) +
        ")"
      );
    });
    const nilaiList = list.map(function (r) {
      const score = Number((r && r.skor_total) || 0);
      if (totalMaxScore <= 0) return 0;
      return (score / totalMaxScore) * 100;
    });
    const maxScore = 100;
    const ticks = 5;
    const chartWidth = Math.max(560, labels.length * 66);
    const chartHeight = 340;
    const margin = { left: 54, right: 18, top: 16, bottom: 116 };
    const innerW = chartWidth - margin.left - margin.right;
    const innerH = chartHeight - margin.top - margin.bottom;
    const barW = Math.max(
      12,
      Math.floor(innerW / Math.max(1, labels.length * 1.7)),
    );
    const step = innerW / Math.max(1, labels.length);
    const elements = [];

    for (let i = 0; i <= ticks; i += 1) {
      const yVal = (maxScore / ticks) * i;
      const y = margin.top + innerH - (yVal / maxScore) * innerH;
      elements.push(
        '<line x1="' +
          margin.left +
          '" y1="' +
          y.toFixed(2) +
          '" x2="' +
          (margin.left + innerW) +
          '" y2="' +
          y.toFixed(2) +
          '" stroke="#d8e0ef" stroke-width="1" />',
      );
      elements.push(
        '<text x="' +
          (margin.left - 8) +
          '" y="' +
          (y + 4).toFixed(2) +
          '" text-anchor="end" font-size="11" fill="#6f7f99">' +
          Math.round(yVal) +
          "</text>",
      );
    }

    labels.forEach(function (label, idx) {
      const nilai = Number(nilaiList[idx] || 0);
      const barH = (nilai / maxScore) * innerH;
      const x = margin.left + step * idx + (step - barW) / 2;
      const y = margin.top + innerH - barH;
      elements.push(
        '<rect x="' +
          x.toFixed(2) +
          '" y="' +
          y.toFixed(2) +
          '" width="' +
          barW +
          '" height="' +
          Math.max(1, barH).toFixed(2) +
          '" rx="4" ry="4" fill="#3f53db"></rect>',
      );
      elements.push(
        '<text x="' +
          (x + barW / 2).toFixed(2) +
          '" y="' +
          (y - 6).toFixed(2) +
          '" text-anchor="middle" font-size="11" fill="#1e2d4a">' +
          String(nilai.toFixed(2)) +
          "</text>",
      );
      elements.push(
        '<text x="' +
          (x + barW / 2).toFixed(2) +
          '" y="' +
          (margin.top + innerH + 14).toFixed(2) +
          '" text-anchor="end" transform="rotate(-35 ' +
          (x + barW / 2).toFixed(2) +
          " " +
          (margin.top + innerH + 14).toFixed(2) +
          ')" font-size="11" fill="#4a5f83">' +
          deps.escapeHtml(label) +
          "</text>",
      );
    });

    return [
      '<div class="guru-results-chart-wrap">',
      '<svg viewBox="0 0 ' +
        chartWidth +
        " " +
        chartHeight +
        '" class="guru-results-chart-svg" role="img" aria-label="Grafik nilai peserta">',
      '<line x1="' +
        margin.left +
        '" y1="' +
        (margin.top + innerH) +
        '" x2="' +
        (margin.left + innerW) +
        '" y2="' +
        (margin.top + innerH) +
        '" stroke="#778ba8" stroke-width="1.5" />',
      '<line x1="' +
        margin.left +
        '" y1="' +
        margin.top +
        '" x2="' +
        margin.left +
        '" y2="' +
        (margin.top + innerH) +
        '" stroke="#778ba8" stroke-width="1.5" />',
      elements.join(""),
      '<text x="' +
        (margin.left + innerW / 2).toFixed(2) +
        '" y="' +
        (chartHeight - 10) +
        '" text-anchor="middle" font-size="12" fill="#223b63">Sumbu X: Nama Peserta</text>',
      '<text x="14" y="' +
        (margin.top + innerH / 2).toFixed(2) +
        '" text-anchor="middle" transform="rotate(-90 14 ' +
        (margin.top + innerH / 2).toFixed(2) +
        ')" font-size="12" fill="#223b63">Sumbu Y: Nilai</text>',
      "</svg>",
      "</div>",
    ].join("");
  }

  function summarizeAttemptResult(mode) {
    const data = latestResultsMatrix;
    const rows = Array.isArray(data && data.rows) ? data.rows : [];
    const filteredRows = filterResultsRows(rows);
    const totalQuestions = Array.isArray(data && data.question_nos)
      ? data.question_nos.length
      : 0;
    let totalWeight = Number((data && data.total_weight) || 0);
    if (totalWeight <= 0 && totalQuestions > 0) {
      totalWeight = totalQuestions;
    }
    if (!data || !rows.length) {
      setResultsExtra("Muat hasil ujian peserta terlebih dahulu.");
      return;
    }
    if (!filteredRows.length) {
      setResultsExtra("Tidak ada data sesuai filter yang dipilih.");
      return;
    }
    const totalAttempts = filteredRows.length;
    const totalScore = filteredRows.reduce(function (acc, it) {
      return acc + Number((it && it.skor_total) || 0);
    }, 0);
    const avgScore =
      totalAttempts > 0 ? (totalScore / totalAttempts).toFixed(2) : "0.00";
    function fmtScale100(score) {
      const raw = Number(score || 0);
      if (totalWeight <= 0) return "0.00";
      return ((raw / totalWeight) * 100).toFixed(2);
    }
    if (mode === "report") {
      setResultsExtra(
        "Laporan: exam #" +
          String((data && data.exam_id) || "-") +
          ", peserta/attempt " +
          String(totalAttempts) +
          ", jumlah soal " +
          String(totalQuestions) +
          ", rerata skor " +
          String(avgScore) +
          ".",
      );
      return;
    }
    if (mode === "stats") {
      let maxScore = 0;
      let minScore = 0;
      if (filteredRows.length > 0) {
        maxScore = Number(filteredRows[0].skor_total || 0);
        minScore = Number(filteredRows[0].skor_total || 0);
        filteredRows.forEach(function (r) {
          const s = Number((r && r.skor_total) || 0);
          maxScore = Math.max(maxScore, s);
          minScore = Math.min(minScore, s);
        });
      }
      setResultsExtra(
        "Statistik: total attempt " +
          String(totalAttempts) +
          ", rerata skor " +
          String(avgScore) +
          " (" +
          fmtScale100(avgScore) +
          "/100)" +
          ", skor tertinggi " +
          String(maxScore) +
          " (" +
          fmtScale100(maxScore) +
          "/100)" +
          ", skor terendah " +
          String(minScore) +
          " (" +
          fmtScale100(minScore) +
          "/100)" +
          ".",
      );
      return;
    }
    setResultsExtraHTML(buildResultsScoreChartHTML(filteredRows, totalWeight));
  }

  function renderResultsChart() {
    const data = latestResultsMatrix;
    const rows = Array.isArray(data && data.rows) ? data.rows : [];
    const filteredRows = filterResultsRows(rows);
    const totalQuestions = Array.isArray(data && data.question_nos)
      ? data.question_nos.length
      : 0;
    let totalWeight = Number((data && data.total_weight) || 0);
    if (totalWeight <= 0 && totalQuestions > 0) {
      totalWeight = totalQuestions;
    }
    if (!rows.length) {
      setResultsExtra("Muat hasil ujian peserta terlebih dahulu.");
      deps.setMsg(
        "Grafik belum bisa ditampilkan: data hasil ujian belum dimuat.",
      );
      return;
    }
    if (!filteredRows.length) {
      setResultsExtra("Tidak ada data sesuai filter yang dipilih.");
      deps.setMsg("Grafik belum bisa ditampilkan: filter tidak memiliki data.");
      return;
    }
    setResultsExtraHTML(buildResultsScoreChartHTML(filteredRows, totalWeight));
    deps.setMsg("Grafik skor peserta berhasil ditampilkan.");
  }

  async function loadExamAssignments(examID) {
    if (!deps || !deps.resultsAssignmentBody) return;
    if (!examID || examID <= 0) {
      resultsAssignmentsCount = 0;
      latestItemAnalysis = null;
      latestItemAnalysisByID = {};
      latestItemAnalysisExamID = 0;
      latestItemAnalysisIdentity = null;
      latestLearningGoalResult = null;
      latestLearningGoalByKey = {};
      latestLearningGoalExamID = 0;
      latestLearningGoalIdentity = null;
      latestLearningGoalStudentView = null;
      latestLearningGoalStudentResult = {};
      if (deps && typeof deps.refreshStats === "function") {
        deps.refreshStats();
      }
      latestResultsMatrix = null;
      if (deps.resultsPanel && !deps.resultsPanel.hidden) activateResultsMenu();
      if (deps.resultsMatrixHead) {
        deps.resultsMatrixHead.innerHTML =
          "<th>Nama</th><th>Sekolah</th><th>Kelas</th><th>Attempt Ke-</th><th>Skor Total</th><th>Nilai</th><th>Start Ujian</th><th>End Ujian</th><th>Aksi</th>";
      }
      updateAttemptFilterOptions([]);
      updateClassFilterOptions([]);
      deps.resultsAssignmentBody.innerHTML =
        '<tr><td colspan="9" class="muted">Pilih ujian lalu muat hasil ujian peserta.</td></tr>';
      setResultsSummary("Belum ada data hasil ujian.");
      return;
    }
    const matrix = await deps.api(
      "/api/v1/admin/exams/" + Number(examID) + "/results",
      "GET",
    );
    latestResultsMatrix = matrix || null;
    latestItemAnalysis = null;
    latestItemAnalysisByID = {};
    latestItemAnalysisExamID = Number(examID || 0);
    latestItemAnalysisIdentity = null;
    latestLearningGoalResult = null;
    latestLearningGoalByKey = {};
    latestLearningGoalExamID = Number(examID || 0);
    latestLearningGoalIdentity = null;
    latestLearningGoalStudentView = null;
    latestLearningGoalStudentResult = {};
    const rows = Array.isArray(matrix && matrix.rows) ? matrix.rows : [];
    const questionNos = Array.isArray(matrix && matrix.question_nos)
      ? matrix.question_nos
      : [];
    resultsAssignmentsCount = rows.length;
    if (deps && typeof deps.refreshStats === "function") {
      deps.refreshStats();
    }
    if (deps.resultsPanel && !deps.resultsPanel.hidden) activateResultsMenu();
    if (deps.resultsMatrixHead) {
      const fixed = [
        "<th>Nama</th>",
        "<th>Sekolah</th>",
        "<th>Kelas</th>",
        "<th>Attempt Ke-</th>",
        "<th>Skor Total</th>",
        "<th>Nilai</th>",
        "<th>Start Ujian</th>",
        "<th>End Ujian</th>",
        "<th>Aksi</th>",
      ];
      const dyn = questionNos.map(function (no) {
        return "<th>" + deps.escapeHtml(String(no)) + "</th>";
      });
      deps.resultsMatrixHead.innerHTML = fixed.concat(dyn).join("");
    }
    await refreshResultsFilters(examID, rows);
    if (!rows.length) {
      deps.resultsAssignmentBody.innerHTML =
        '<tr><td colspan="' +
        String(9 + questionNos.length) +
        '" class="muted">Belum ada peserta yang mengikuti ujian ini.</td></tr>';
      setResultsSummary("Belum ada data hasil ujian.");
      setResultsExtra("Belum ada data untuk laporan/statistik/grafik.");
      return;
    }
    applyResultsFilters();
  }

  async function openItemAnalysisDialog() {
    if (!deps || !deps.itemAnalysisDialog) return;
    const matrix = latestResultsMatrix;
    const rows = Array.isArray(matrix && matrix.rows) ? matrix.rows : [];
    const filteredRows = filterResultsRows(rows);
    const questionNos = Array.isArray(matrix && matrix.question_nos)
      ? matrix.question_nos
      : [];
    const examID = Number(
      (matrix && matrix.exam_id) || latestItemAnalysisExamID || 0,
    );
    if (!matrix || !rows.length || !questionNos.length || examID <= 0) {
      setItemAnalysisSubtitle("Belum ada data hasil ujian.");
      setItemAnalysisSummaryHTML("");
      setItemAnalysisIdentityHTML("");
      setItemAnalysisBodyHTML(
        '<tr><td colspan="9" class="muted">Muat hasil ujian peserta terlebih dahulu.</td></tr>',
      );
      setItemAnalysisDetailHTML(
        "Tidak ada data untuk dianalisis. Pilih ujian lalu muat hasil ujian.",
        true,
      );
      deps.itemAnalysisDialog.showModal();
      return;
    }
    if (!filteredRows.length) {
      setItemAnalysisSubtitle("Tidak ada data sesuai filter yang dipilih.");
      setItemAnalysisSummaryHTML("");
      setItemAnalysisIdentityHTML("");
      setItemAnalysisBodyHTML(
        '<tr><td colspan="9" class="muted">Tidak ada data sesuai filter.</td></tr>',
      );
      setItemAnalysisDetailHTML(
        "Ubah filter Attempt/Kelas untuk melihat analisis.",
        true,
      );
      deps.itemAnalysisDialog.showModal();
      return;
    }
    const questions = await ensureExamQuestions(examID);
    const items = buildItemAnalysis(
      Object.assign({}, matrix, { rows: filteredRows }),
      questions,
    );
    latestItemAnalysis = items;
    latestItemAnalysisByID = {};
    items.forEach(function (it) {
      latestItemAnalysisByID[String(it.id)] = it;
    });
    let exam = findExamByID(examID);
    if (!exam && deps && typeof deps.refreshExams === "function") {
      try {
        await deps.refreshExams();
        exam = findExamByID(examID);
      } catch (_) {
        exam = exam || null;
      }
    }
    const examSafe = exam || {};
    const user = await ensureCurrentUser();
    let startAtValue = "";
    if (examSafe && examSafe.start_at) {
      startAtValue = deps.fmtDate(examSafe.start_at);
    } else if (filteredRows.length) {
      const first = filteredRows.slice().sort(function (a, b) {
        return new Date(a.started_at) - new Date(b.started_at);
      })[0];
      startAtValue = deps.fmtDate(first && first.started_at);
    }
    const maxEnd = maxEndedAt(filteredRows);
    const fallback = getExamSelectInfo(examID) || {};
    const schoolInfo = await ensureExamSchoolInfo(examID);
    const schoolName = schoolInfo.name || "";
    const schoolPlace = schoolInfo.city || "";
    const signatureRawDate =
      maxEnd ||
      (examSafe && examSafe.end_at) ||
      (examSafe && examSafe.start_at);
    const identity = {
      schoolName: schoolName || "",
      schoolPlace: schoolPlace || "",
      examTitle: String((examSafe && examSafe.title) || fallback.title || ""),
      examCode: String((examSafe && examSafe.code) || fallback.code || ""),
      subjectName: String((examSafe && examSafe.subject_name) || ""),
      startedAt: startAtValue || "-",
      endedAt: maxEnd ? deps.fmtDate(maxEnd) : "-",
      duration: fmtDuration(examSafe && examSafe.duration_minutes),
      teacherName: user && user.full_name ? user.full_name : "",
      signatureDate: fmtDateOnly(signatureRawDate),
    };
    latestItemAnalysisIdentity = identity;
    setItemAnalysisIdentityHTML(renderIdentityHTML(identity));
    setItemAnalysisSubtitle(
      "Exam #" +
        String(examID) +
        " | Peserta: " +
        String(filteredRows.length) +
        " | Jumlah soal: " +
        String(questionNos.length),
    );
    setItemAnalysisSummaryHTML(renderItemAnalysisSummary(items));
    setItemAnalysisBodyHTML(renderItemAnalysisRows(items));
    setItemAnalysisDetailHTML(
      "Klik salah satu baris untuk melihat detail butir.",
      true,
    );
    const types = {};
    items.forEach(function (it) {
      const raw = String(it.rawType || "").trim();
      if (!raw) return;
      types[raw] = questionTypeLabel(raw);
    });
    if (deps.itemAnalysisFilter) {
      fillSelectOptions(
        deps.itemAnalysisFilter,
        types,
        String(deps.itemAnalysisFilter.value || ""),
        "Semua Tipe",
      );
    }
    if (deps.itemAnalysisFilterTypeHead) {
      fillSelectOptions(
        deps.itemAnalysisFilterTypeHead,
        types,
        String(deps.itemAnalysisFilterTypeHead.value || ""),
        "Semua",
      );
    }
    deps.itemAnalysisDialog.showModal();
  }

  function getFilteredItemAnalysis() {
    const items = Array.isArray(latestItemAnalysis) ? latestItemAnalysis : [];
    if (!deps) return items;
    const filterRaw = String(
      (deps.itemAnalysisFilter && deps.itemAnalysisFilter.value) || "",
    ).trim();
    const filterNo = String(
      (deps.itemAnalysisFilterNo && deps.itemAnalysisFilterNo.value) || "",
    ).trim();
    const filterTypeHead = String(
      (deps.itemAnalysisFilterTypeHead &&
        deps.itemAnalysisFilterTypeHead.value) ||
        "",
    ).trim();
    const filterQuestion = String(
      (deps.itemAnalysisFilterQuestion &&
        deps.itemAnalysisFilterQuestion.value) ||
        "",
    )
      .trim()
      .toLowerCase();
    const filterValidity = String(
      (deps.itemAnalysisFilterValidity &&
        deps.itemAnalysisFilterValidity.value) ||
        "",
    ).trim();
    const filterStatus = String(
      (deps.itemAnalysisFilterStatus && deps.itemAnalysisFilterStatus.value) ||
        "",
    ).trim();
    if (
      !filterRaw &&
      !filterNo &&
      !filterTypeHead &&
      !filterQuestion &&
      !filterValidity &&
      !filterStatus
    ) {
      return items;
    }
    return items.filter(function (it) {
      if (filterRaw && String(it.rawType || "").trim() !== filterRaw) {
        return false;
      }
      if (
        filterTypeHead &&
        String(it.rawType || "").trim() !== filterTypeHead
      ) {
        return false;
      }
      if (
        filterNo &&
        String(it.no || "")
          .trim()
          .indexOf(filterNo) === -1
      ) {
        return false;
      }
      if (
        filterQuestion &&
        String(it.question || "")
          .trim()
          .toLowerCase()
          .indexOf(filterQuestion) === -1
      ) {
        return false;
      }
      if (
        filterValidity &&
        String(it.validity || "").trim() !== filterValidity
      ) {
        return false;
      }
      if (filterStatus && String(it.status || "").trim() !== filterStatus) {
        return false;
      }
      return true;
    });
  }

  function filterItemAnalysis() {
    if (!deps || !deps.itemAnalysisFilter) return;
    const filtered = getFilteredItemAnalysis();
    setItemAnalysisBodyHTML(renderItemAnalysisRows(filtered));
    setItemAnalysisDetailHTML(
      "Klik salah satu baris untuk melihat detail butir.",
      true,
    );
  }

  function exportItemAnalysis() {
    const items = getFilteredItemAnalysis();
    if (!items.length) {
      deps.setMsg("Tidak ada data analisis untuk diexport.");
      return;
    }
    const identity = latestItemAnalysisIdentity || {};
    const identityRows = [
      ["Nama Sekolah", identity.schoolName || "-"],
      ["Nama Ujian", identity.examTitle || "-"],
      ["Kode Soal", identity.examCode || "-"],
      ["Mata Pelajaran", identity.subjectName || "-"],
      ["Pelaksanaan (Mulai)", identity.startedAt || "-"],
      ["Diakhiri oleh Peserta", identity.endedAt || "-"],
      ["Lama Pengerjaan", identity.duration || "-"],
      ["Nama Guru", identity.teacherName || "-"],
    ];
    const header = [
      "No",
      "Tipe",
      "Rumusan Butir Soal",
      "Kesukaran",
      "Daya Pembeda",
      "Validitas",
      "Benar",
      "Salah",
      "Total",
      "Status",
    ];
    const rows = items.map(function (it) {
      const difficultyPct = (it.difficulty * 100).toFixed(2) + "%";
      const discriminationPct = (it.discrimination * 100).toFixed(2) + "%";
      return [
        it.no,
        it.type,
        it.question,
        difficultyPct + " (" + difficultyLabel(it.difficulty) + ")",
        discriminationPct + " (" + discriminationLabel(it.discrimination) + ")",
        it.validity +
          " (" +
          Number(it.validityCoefficient || 0).toFixed(3) +
          ")",
        it.correctCount,
        it.wrongCount,
        it.totalCount,
        it.status,
      ];
    });
    const lines = identityRows
      .concat([[]])
      .concat([header])
      .concat(rows)
      .concat([[]])
      .concat([
        [
          (function () {
            const place = String(identity.schoolPlace || "-").trim() || "-";
            const date = String(identity.signatureDate || "-").trim() || "-";
            if (place === "-" && date === "-") return "-";
            return place + ", " + date;
          })(),
        ],
      ])
      .concat([[]])
      .concat([[String(identity.teacherName || "-")]])
      .map(function (row) {
        return row.map(csvEscape).join(",");
      })
      .join("\n");
    const blob = new Blob([lines], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const examID = Number(latestItemAnalysisExamID || 0);
    a.href = url;
    a.download =
      "analisis_butir_soal" + (examID ? "_exam_" + examID : "") + ".csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    deps.setMsg("Export analisis butir berhasil.");
  }

  function printItemAnalysis() {
    const items = getFilteredItemAnalysis();
    if (!items.length) {
      deps.setMsg("Tidak ada data analisis untuk dicetak.");
      return;
    }
    const identityHTML = renderIdentityHTML(latestItemAnalysisIdentity);
    const rowsHTML = items
      .map(function (it) {
        const difficultyPct = (it.difficulty * 100).toFixed(2) + "%";
        const discriminationPct = (it.discrimination * 100).toFixed(2) + "%";
        const validityCoef = Number(it.validityCoefficient || 0).toFixed(3);
        return [
          "<tr>",
          "<td>" + deps.escapeHtml(String(it.no)) + "</td>",
          "<td>" + deps.escapeHtml(String(it.type)) + "</td>",
          "<td>" + deps.escapeHtml(String(it.question || "-")) + "</td>",
          "<td>" +
            deps.escapeHtml(difficultyPct) +
            " (" +
            deps.escapeHtml(difficultyLabel(it.difficulty)) +
            ")</td>",
          "<td>" +
            deps.escapeHtml(discriminationPct) +
            " (" +
            deps.escapeHtml(discriminationLabel(it.discrimination)) +
            ")</td>",
          "<td>" +
            deps.escapeHtml(String(it.validity)) +
            " (" +
            deps.escapeHtml(validityCoef) +
            ")</td>",
          "<td>" + deps.escapeHtml(String(it.correctCount)) + "</td>",
          "<td>" + deps.escapeHtml(String(it.wrongCount)) + "</td>",
          "<td>" + deps.escapeHtml(String(it.status)) + "</td>",
          "</tr>",
        ].join("");
      })
      .join("");
    const html = [
      "<!doctype html>",
      '<html lang="id"><head><meta charset="utf-8" />',
      "<title>Analisis Butir Soal</title>",
      "<style>",
      "body{font-family:Arial, sans-serif; color:#111827; padding:24px;}",
      ".analysis-identity-title{font-weight:800;letter-spacing:.02em;margin-bottom:8px;}",
      ".analysis-identity-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px 20px;margin-bottom:16px;}",
      ".analysis-identity-table{width:100%;border-collapse:collapse;font-size:13px;margin:0;}",
      ".analysis-identity-table td{padding:3px 0;vertical-align:top;}",
      ".analysis-identity-table td:first-child{width:180px;color:#4b5563;font-weight:600;}",
      "table{width:100%;border-collapse:collapse;font-size:12px;}",
      "th,td{border:1px solid #e5e7eb;padding:6px 8px;vertical-align:top;}",
      "th{background:#f3f4f6;text-align:left;}",
      "</style></head><body>",
      identityHTML || "<h2>ANALISIS BUTIR SOAL</h2>",
      "<table>",
      "<thead><tr>",
      "<th>No</th><th>Tipe</th><th>Rumusan Butir Soal</th><th>Kesukaran</th><th>Daya Pembeda</th><th>Validitas</th><th>Benar</th><th>Salah</th><th>Status</th>",
      "</tr></thead><tbody>",
      rowsHTML,
      "</tbody></table>",
      "</body></html>",
    ].join("");
    const win = window.open("", "_blank");
    if (!win) {
      deps.setMsg("Gagal membuka jendela print.");
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  }

  async function buildLearningGoalIdentity(examID, rows) {
    let exam = findExamByID(examID);
    if (!exam && deps && typeof deps.refreshExams === "function") {
      try {
        await deps.refreshExams();
        exam = findExamByID(examID);
      } catch (_) {
        exam = exam || null;
      }
    }
    const examSafe = exam || {};
    const filteredRows = Array.isArray(rows) ? rows : [];
    const fallback = getExamSelectInfo(examID) || {};
    const user = await ensureCurrentUser();
    let startAtValue = "";
    if (examSafe && examSafe.start_at) {
      startAtValue = deps.fmtDate(examSafe.start_at);
    } else if (filteredRows.length) {
      const first = filteredRows.slice().sort(function (a, b) {
        return new Date(a.started_at) - new Date(b.started_at);
      })[0];
      startAtValue = deps.fmtDate(first && first.started_at);
    }
    const maxEnd = maxEndedAt(filteredRows);
    const schoolInfo = await ensureExamSchoolInfo(examID);
    const signatureRawDate =
      maxEnd ||
      (examSafe && examSafe.end_at) ||
      (examSafe && examSafe.start_at);
    return {
      schoolName: schoolInfo.name || "",
      schoolPlace: schoolInfo.city || "",
      examTitle: String((examSafe && examSafe.title) || fallback.title || ""),
      examCode: String((examSafe && examSafe.code) || fallback.code || ""),
      subjectName: String((examSafe && examSafe.subject_name) || ""),
      startedAt: startAtValue || "-",
      endedAt: maxEnd ? deps.fmtDate(maxEnd) : "-",
      duration: fmtDuration(examSafe && examSafe.duration_minutes),
      teacherName: user && user.full_name ? user.full_name : "",
      signatureDate: fmtDateOnly(signatureRawDate),
    };
  }

  async function ensureLearningGoalResultLoaded(examID, filteredRows) {
    const targetExamID = Number(examID || 0);
    if (targetExamID <= 0) {
      return { result: null, identity: null, items: [] };
    }
    const rows = Array.isArray(filteredRows) ? filteredRows : [];
    const attemptFilter = getActiveAttemptFilter();
    const classFilter = getActiveClassFilter();
    const sameExam = Number(latestLearningGoalExamID || 0) === targetExamID;
    const sameAttempt =
      String(
        (latestLearningGoalResult && latestLearningGoalResult.attempt_filter) ||
          "",
      ) === String(attemptFilter || "");
    const sameClass =
      String(
        (latestLearningGoalResult && latestLearningGoalResult.class_filter) ||
          "",
      ) === String(classFilter || "");
    if (latestLearningGoalResult && sameExam && sameAttempt && sameClass) {
      return {
        result: latestLearningGoalResult,
        identity: latestLearningGoalIdentity,
        items: Array.isArray(latestLearningGoalResult.items)
          ? latestLearningGoalResult.items
          : [],
      };
    }
    const params = new URLSearchParams();
    if (attemptFilter) params.set("attempt", attemptFilter);
    if (classFilter) params.set("class", classFilter);
    const query = params.toString();
    const result = await deps.api(
      "/api/v1/admin/exams/" +
        targetExamID +
        "/learning-goal-results" +
        (query ? "?" + query : ""),
      "GET",
    );
    latestLearningGoalResult = result || null;
    latestLearningGoalExamID = targetExamID;
    latestLearningGoalByKey = {};
    const items = Array.isArray(result && result.items) ? result.items : [];
    items.forEach(function (it, idx) {
      const key =
        String(
          it.learning_goal_id != null ? it.learning_goal_id : "none-" + idx,
        ) +
        "::" +
        String(it.learning_goal_text || "");
      latestLearningGoalByKey[key] = it;
    });
    latestLearningGoalIdentity = await buildLearningGoalIdentity(
      targetExamID,
      rows,
    );
    return {
      result: latestLearningGoalResult,
      identity: latestLearningGoalIdentity,
      items: items,
    };
  }

  function buildLearningGoalStudentAnalysis(items, attemptID) {
    const targetAttemptID = Number(attemptID || 0);
    if (targetAttemptID <= 0) return null;
    const source = Array.isArray(items) ? items : [];
    const rows = [];
    let participant = null;
    source.forEach(function (item, idx) {
      const students = Array.isArray(item && item.students)
        ? item.students
        : [];
      const student = students.find(function (it) {
        return Number((it && it.attempt_id) || 0) === targetAttemptID;
      });
      if (!student) return;
      if (!participant) {
        participant = {
          userID: Number((student && student.user_id) || 0),
          fullName: String((student && student.full_name) || "-"),
          className: String((student && student.class_name) || "-"),
          attemptID: targetAttemptID,
          attemptKe: Number((student && student.attempt_ke) || 0),
        };
      }
      rows.push({
        key:
          String(
            item.learning_goal_id != null
              ? item.learning_goal_id
              : "none-" + idx,
          ) +
          "::" +
          String(item.learning_goal_text || ""),
        learning_goal_id: item.learning_goal_id,
        learning_goal_text: String(item.learning_goal_text || "Tanpa TP"),
        learning_goal_materi: String(item.learning_goal_materi || "-"),
        earned_weight: Number((student && student.earned_weight) || 0),
        total_weight: Number((student && student.total_weight) || 0),
        percent: Number((student && student.percent) || 0),
        achieved: !!(student && student.achieved),
      });
    });
    if (!participant) return null;
    rows.sort(function (a, b) {
      return a.learning_goal_text.localeCompare(b.learning_goal_text);
    });
    const achievedCount = rows.filter(function (it) {
      return it.achieved;
    }).length;
    const avgPercent = rows.length
      ? rows.reduce(function (acc, it) {
          return acc + Number(it.percent || 0);
        }, 0) / rows.length
      : 0;
    const totalEarned = rows.reduce(function (acc, it) {
      return acc + Number(it.earned_weight || 0);
    }, 0);
    const totalWeight = rows.reduce(function (acc, it) {
      return acc + Number(it.total_weight || 0);
    }, 0);
    return {
      participant: participant,
      items: rows,
      totalGoals: rows.length,
      achievedGoals: achievedCount,
      unachievedGoals: rows.length - achievedCount,
      averagePercent: avgPercent,
      totalEarnedWeight: totalEarned,
      totalWeight: totalWeight,
    };
  }

  function buildLearningGoalStudentAnalysisFromAttempt(result, row) {
    if (!result || !row) return null;
    const source = Array.isArray(result.items) ? result.items : [];
    const rows = source
      .map(function (item, idx) {
        return {
          key:
            String(
              item.learning_goal_id != null
                ? item.learning_goal_id
                : "none-" + idx,
            ) +
            "::" +
            String(item.learning_goal_text || ""),
          learning_goal_id: item.learning_goal_id,
          learning_goal_text: String(item.learning_goal_text || "Tanpa TP"),
          learning_goal_materi: String(item.learning_goal_materi || "-"),
          earned_weight: Number((item && item.earned_weight) || 0),
          total_weight: Number((item && item.total_weight) || 0),
          percent: Number((item && item.percent) || 0),
          achieved: !!(item && item.achieved),
        };
      })
      .sort(function (a, b) {
        return a.learning_goal_text.localeCompare(b.learning_goal_text);
      });
    const achievedCount = rows.filter(function (it) {
      return it.achieved;
    }).length;
    const avgPercent = rows.length
      ? rows.reduce(function (acc, it) {
          return acc + Number(it.percent || 0);
        }, 0) / rows.length
      : 0;
    const totalEarned = rows.reduce(function (acc, it) {
      return acc + Number(it.earned_weight || 0);
    }, 0);
    const totalWeight = rows.reduce(function (acc, it) {
      return acc + Number(it.total_weight || 0);
    }, 0);
    return {
      participant: {
        userID: Number((row && row.user_id) || 0),
        fullName: String((row && row.full_name) || "-"),
        className: String((row && row.class_name) || "-"),
        attemptID: Number((row && row.attempt_id) || 0),
        attemptKe: Number((row && row.attempt_ke) || 0),
      },
      items: rows,
      totalGoals: rows.length,
      achievedGoals: achievedCount,
      unachievedGoals: rows.length - achievedCount,
      averagePercent: avgPercent,
      totalEarnedWeight: totalEarned,
      totalWeight: totalWeight,
    };
  }

  function canLoadAttemptLearningGoalDetail(row) {
    if (!row) return false;
    return !!(row && row.submitted_at);
  }

  function renderLearningGoalStudentSummary(view) {
    const current = view || {};
    return [
      buildStatCard(
        "Peserta",
        String((current.participant && current.participant.fullName) || "-"),
        "is-primary",
      ),
      buildStatCard("Total TP", String(current.totalGoals || 0), ""),
      buildStatCard("TP Tercapai", String(current.achievedGoals || 0), ""),
      buildStatCard(
        "TP Belum Tercapai",
        String(current.unachievedGoals || 0),
        "",
      ),
      buildStatCard(
        "Rata-rata Capaian",
        percentText(current.averagePercent || 0),
        "",
      ),
      buildStatCard(
        "Bobot Dicapai",
        Number(current.totalEarnedWeight || 0).toFixed(2) +
          "/" +
          Number(current.totalWeight || 0).toFixed(2),
        "",
      ),
    ].join("");
  }

  function renderLearningGoalStudentRows(items) {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) {
      return '<tr><td colspan="6" class="muted">Belum ada data ketercapaian TP untuk peserta ini.</td></tr>';
    }
    return list
      .map(function (it) {
        return [
          '<tr class="analysis-row ' +
            (it.achieved ? "analysis-row-valid" : "analysis-row-invalid") +
            '">',
          "<td>" +
            deps.escapeHtml(String(it.learning_goal_text || "Tanpa TP")) +
            "</td>",
          "<td>" +
            deps.escapeHtml(String(it.learning_goal_materi || "-")) +
            "</td>",
          "<td>" +
            deps.escapeHtml(Number(it.earned_weight || 0).toFixed(2)) +
            "</td>",
          "<td>" +
            deps.escapeHtml(Number(it.total_weight || 0).toFixed(2)) +
            "</td>",
          "<td>" + deps.escapeHtml(percentText(it.percent || 0)) + "</td>",
          '<td><span class="analysis-status analysis-status-' +
            learningGoalStatusClass(!!it.achieved) +
            '">' +
            deps.escapeHtml(learningGoalStatusLabel(!!it.achieved)) +
            "</span></td>",
          "</tr>",
        ].join("");
      })
      .join("");
  }

  function renderLearningGoalStudentDetail(view, kktp) {
    if (!view || !view.participant) {
      return "Detail ketercapaian TP per peserta akan tampil di sini.";
    }
    const participant = view.participant || {};
    return [
      '<div class="analysis-detail-header">',
      "<h4>" + deps.escapeHtml(String(participant.fullName || "-")) + "</h4>",
      '<div class="analysis-detail-text">' +
        "Kelas: " +
        deps.escapeHtml(String(participant.className || "-")) +
        " | Attempt: " +
        deps.escapeHtml(String(participant.attemptKe || 0)) +
        " | Attempt ID: " +
        deps.escapeHtml(String(participant.attemptID || 0)) +
        "</div>",
      "</div>",
      '<div class="analysis-detail-meta">',
      "<div>KKTP: <strong>" +
        deps.escapeHtml(percentText(kktp || 0)) +
        "</strong></div>",
      "<div>TP Tercapai: <strong>" +
        deps.escapeHtml(
          String(view.achievedGoals || 0) + "/" + String(view.totalGoals || 0),
        ) +
        "</strong></div>",
      "<div>Rata-rata Capaian: <strong>" +
        deps.escapeHtml(percentText(view.averagePercent || 0)) +
        "</strong></div>",
      "<div>Total Bobot Dicapai: <strong>" +
        deps.escapeHtml(
          Number(view.totalEarnedWeight || 0).toFixed(2) +
            "/" +
            Number(view.totalWeight || 0).toFixed(2),
        ) +
        "</strong></div>",
      "</div>",
    ].join("");
  }

  async function openLearningGoalStudentDialog(attemptID) {
    if (!deps || !deps.learningGoalStudentDialog) return;
    const matrix = latestResultsMatrix;
    const rows = Array.isArray(matrix && matrix.rows) ? matrix.rows : [];
    const filteredRows = filterResultsRows(rows);
    const examID = Number(
      (matrix && matrix.exam_id) || latestLearningGoalExamID || 0,
    );
    const targetAttemptID = Number(attemptID || 0);
    const attemptRow =
      filteredRows.find(function (it) {
        return Number((it && it.attempt_id) || 0) === targetAttemptID;
      }) ||
      rows.find(function (it) {
        return Number((it && it.attempt_id) || 0) === targetAttemptID;
      }) ||
      null;
    if (!matrix || !rows.length || examID <= 0 || targetAttemptID <= 0) {
      setLearningGoalStudentSubtitle("Belum ada data hasil ujian.");
      setLearningGoalStudentKKTP("70.00%");
      setLearningGoalStudentSummaryHTML("");
      setLearningGoalStudentIdentityHTML("");
      setLearningGoalStudentBodyHTML(
        '<tr><td colspan="6" class="muted">Muat hasil ujian peserta terlebih dahulu.</td></tr>',
      );
      setLearningGoalStudentDetailHTML(
        "Tidak ada data untuk dianalisis. Pilih ujian lalu muat hasil ujian.",
        true,
      );
      showDialog(deps.learningGoalStudentDialog);
      return;
    }
    let detailResult = null;
    if (canLoadAttemptLearningGoalDetail(attemptRow)) {
      try {
        detailResult = await ensureAttemptLearningGoalResultLoaded(
          targetAttemptID,
        );
      } catch (_) {
        detailResult = null;
      }
    }
    let identityBase =
      latestLearningGoalIdentity && Number(latestLearningGoalExamID || 0) === examID
        ? latestLearningGoalIdentity
        : null;
    if (!identityBase) {
      identityBase = await buildLearningGoalIdentity(examID, filteredRows);
      latestLearningGoalIdentity = identityBase;
    }
    let view = buildLearningGoalStudentAnalysisFromAttempt(
      detailResult,
      attemptRow,
    );
    let kktp = detailResult && detailResult.kktp;
    if (!view) {
      const payload = await ensureLearningGoalResultLoaded(examID, filteredRows);
      const result = payload.result || {};
      const items = Array.isArray(payload.items) ? payload.items : [];
      identityBase = payload.identity || identityBase || {};
      view = buildLearningGoalStudentAnalysis(items, targetAttemptID);
      kktp = result && result.kktp;
    }
    if (!view) {
      setLearningGoalStudentSubtitle("Data peserta tidak ditemukan.");
      setLearningGoalStudentKKTP(percentText(kktp));
      setLearningGoalStudentSummaryHTML("");
      setLearningGoalStudentIdentityHTML(
        renderIdentityHTML(identityBase, "ANALISIS TP PER PESERTA"),
      );
      setLearningGoalStudentBodyHTML(
        '<tr><td colspan="6" class="muted">Data ketercapaian TP untuk peserta ini tidak ditemukan pada filter aktif.</td></tr>',
      );
      setLearningGoalStudentDetailHTML(
        "Coba ubah filter Attempt/Kelas atau muat ulang hasil ujian.",
        true,
      );
      showDialog(deps.learningGoalStudentDialog);
      return;
    }
    latestLearningGoalStudentView = view;
    const participant = view.participant || {};
    const schoolInfo = await ensureAttemptStudentSchoolInfo(targetAttemptID);
    const studentIdentity = Object.assign({}, identityBase, {
      schoolName: schoolInfo.schoolName || identityBase.schoolName || "",
      schoolPlace: schoolInfo.schoolCity || identityBase.schoolPlace || "",
      examTitle:
        String(identityBase.examTitle || "-") +
        " | " +
        String(participant.fullName || "-"),
      startedAt: deps.fmtDate((attemptRow || {}).started_at),
      endedAt: deps.fmtDate((attemptRow || {}).ended_at),
    });
    setLearningGoalStudentIdentityHTML(
      renderIdentityHTML(studentIdentity, "ANALISIS TP PER PESERTA"),
    );
    setLearningGoalStudentKKTP(percentText(kktp));
    setLearningGoalStudentSubtitle(
      "Peserta: " +
        String(participant.fullName || "-") +
        " | Kelas: " +
        String(participant.className || "-") +
        " | Attempt: " +
        String(participant.attemptKe || 0) +
        (resultsFilterLabel() ? " | " + resultsFilterLabel() : ""),
    );
    setLearningGoalStudentSummaryHTML(renderLearningGoalStudentSummary(view));
    setLearningGoalStudentBodyHTML(renderLearningGoalStudentRows(view.items));
    setLearningGoalStudentDetailHTML(
      renderLearningGoalStudentDetail(view, kktp),
      false,
    );
    showDialog(deps.learningGoalStudentDialog);
  }

  async function openLearningGoalDialog() {
    if (!deps || !deps.learningGoalDialog) return;
    const matrix = latestResultsMatrix;
    const rows = Array.isArray(matrix && matrix.rows) ? matrix.rows : [];
    const filteredRows = filterResultsRows(rows);
    const examID = Number(
      (matrix && matrix.exam_id) || latestLearningGoalExamID || 0,
    );
    if (!matrix || !rows.length || examID <= 0) {
      setLearningGoalSubtitle("Belum ada data hasil ujian.");
      setLearningGoalKKTP("70.00%");
      setLearningGoalSummaryHTML("");
      setLearningGoalIdentityHTML("");
      setLearningGoalBodyHTML(
        '<tr><td colspan="7" class="muted">Muat hasil ujian peserta terlebih dahulu.</td></tr>',
      );
      setLearningGoalDetailHTML(
        "Tidak ada data untuk dianalisis. Pilih ujian lalu muat hasil ujian.",
        true,
      );
      deps.learningGoalDialog.showModal();
      return;
    }
    if (!filteredRows.length) {
      setLearningGoalSubtitle("Tidak ada data sesuai filter yang dipilih.");
      setLearningGoalSummaryHTML("");
      setLearningGoalIdentityHTML("");
      setLearningGoalBodyHTML(
        '<tr><td colspan="7" class="muted">Tidak ada data sesuai filter.</td></tr>',
      );
      setLearningGoalDetailHTML(
        "Ubah filter Attempt/Kelas untuk melihat analisis ketercapaian TP.",
        true,
      );
      deps.learningGoalDialog.showModal();
      return;
    }

    const payload = await ensureLearningGoalResultLoaded(examID, filteredRows);
    const result = payload.result || {};
    const items = Array.isArray(payload.items) ? payload.items : [];
    latestLearningGoalIdentity = payload.identity || null;
    setLearningGoalIdentityHTML(
      renderIdentityHTML(
        latestLearningGoalIdentity,
        "ANALISIS KETERCAPAIAN TUJUAN PEMBELAJARAN",
      ),
    );
    setLearningGoalKKTP(percentText(result && result.kktp));
    setLearningGoalSubtitle(
      "Exam #" +
        String(examID) +
        " | Peserta/Attempt: " +
        String((result && result.total_students) || 0) +
        " | TP: " +
        String((result && result.total_goals) || 0) +
        (resultsFilterLabel() ? " | " + resultsFilterLabel() : ""),
    );
    setLearningGoalSummaryHTML(renderLearningGoalSummary(result));
    setLearningGoalBodyHTML(renderLearningGoalRows(items));
    setLearningGoalDetailHTML(
      "Klik salah satu baris untuk melihat detail ketercapaian per peserta.",
      true,
    );
    deps.learningGoalDialog.showModal();
  }

  function exportLearningGoalAnalysis() {
    const result = latestLearningGoalResult || {};
    const items = Array.isArray(result.items) ? result.items : [];
    if (!items.length) {
      deps.setMsg("Tidak ada data ketercapaian TP untuk diexport.");
      return;
    }
    const identity = latestLearningGoalIdentity || {};
    const identityRows = [
      ["Nama Sekolah", identity.schoolName || "-"],
      ["Nama Ujian", identity.examTitle || "-"],
      ["Kode Soal", identity.examCode || "-"],
      ["Mata Pelajaran", identity.subjectName || "-"],
      ["Pelaksanaan (Mulai)", identity.startedAt || "-"],
      ["Diakhiri oleh Peserta", identity.endedAt || "-"],
      ["Lama Pengerjaan", identity.duration || "-"],
      ["Nama Guru", identity.teacherName || "-"],
      ["KKTP", percentText(result.kktp || 0)],
    ];
    const lines = identityRows
      .concat([[]])
      .concat([
        [
          "TP",
          "Materi",
          "Jumlah Butir",
          "Total Bobot",
          "Rata-rata Capaian",
          "Siswa Tercapai",
          "Status",
        ],
      ])
      .concat(
        items.map(function (it) {
          return [
            it.learning_goal_text || "Tanpa TP",
            it.learning_goal_materi || "-",
            it.question_count || 0,
            Number(it.total_weight || 0).toFixed(2),
            percentText(it.average_percent || 0),
            String(it.achieved_student_count || 0) +
              "/" +
              String(it.student_count || 0),
            learningGoalStatusLabel(!!it.achieved),
          ];
        }),
      )
      .concat([[]], [["DETAIL PESERTA PER TP"]])
      .concat(
        items.flatMap(function (it) {
          const head = [
            [it.learning_goal_text || "Tanpa TP"],
            [
              "Peserta",
              "Kelas",
              "Attempt",
              "Bobot Dicapai",
              "Total Bobot",
              "Persentase",
              "Status",
            ],
          ];
          const students = (Array.isArray(it.students) ? it.students : []).map(
            function (student) {
              return [
                student.full_name || "-",
                student.class_name || "-",
                student.attempt_ke || 0,
                Number(student.earned_weight || 0).toFixed(2),
                Number(student.total_weight || 0).toFixed(2),
                percentText(student.percent || 0),
                learningGoalStatusLabel(!!student.achieved),
              ];
            },
          );
          return head.concat(students, [[]]);
        }),
      )
      .map(function (row) {
        return row.map(csvEscape).join(",");
      })
      .join("\n");
    const blob = new Blob([lines], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const examID = Number(latestLearningGoalExamID || 0);
    a.href = url;
    a.download =
      "analisis_ketercapaian_tp" + (examID ? "_exam_" + examID : "") + ".csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    deps.setMsg("Export analisis ketercapaian TP berhasil.");
  }

  function printLearningGoalAnalysis() {
    const result = latestLearningGoalResult || {};
    const items = Array.isArray(result.items) ? result.items : [];
    if (!items.length) {
      deps.setMsg("Tidak ada data ketercapaian TP untuk dicetak.");
      return;
    }
    const identityHTML = renderIdentityHTML(
      latestLearningGoalIdentity,
      "ANALISIS KETERCAPAIAN TUJUAN PEMBELAJARAN",
    );
    const rowsHTML = items
      .map(function (it) {
        return [
          "<tr>",
          "<td>" +
            deps.escapeHtml(String(it.learning_goal_text || "Tanpa TP")) +
            "</td>",
          "<td>" +
            deps.escapeHtml(String(it.learning_goal_materi || "-")) +
            "</td>",
          "<td>" + deps.escapeHtml(String(it.question_count || 0)) + "</td>",
          "<td>" +
            deps.escapeHtml(Number(it.total_weight || 0).toFixed(2)) +
            "</td>",
          "<td>" +
            deps.escapeHtml(percentText(it.average_percent || 0)) +
            "</td>",
          "<td>" +
            deps.escapeHtml(
              String(it.achieved_student_count || 0) +
                "/" +
                String(it.student_count || 0),
            ) +
            "</td>",
          "<td>" +
            deps.escapeHtml(learningGoalStatusLabel(!!it.achieved)) +
            "</td>",
          "</tr>",
        ].join("");
      })
      .join("");
    const html = [
      "<!doctype html>",
      '<html lang="id"><head><meta charset="utf-8" />',
      "<title>Analisis Ketercapaian TP</title>",
      "<style>",
      "body{font-family:Arial, sans-serif; color:#111827; padding:24px;}",
      ".analysis-identity-title{font-weight:800;letter-spacing:.02em;margin-bottom:8px;}",
      ".analysis-identity-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px 20px;margin-bottom:16px;}",
      ".analysis-identity-table{width:100%;border-collapse:collapse;font-size:13px;margin:0;}",
      ".analysis-identity-table td{padding:3px 0;vertical-align:top;}",
      ".analysis-identity-table td:first-child{width:180px;color:#4b5563;font-weight:600;}",
      "table{width:100%;border-collapse:collapse;font-size:12px;}",
      "th,td{border:1px solid #e5e7eb;padding:6px 8px;vertical-align:top;}",
      "th{background:#f3f4f6;text-align:left;}",
      "</style></head><body>",
      identityHTML,
      "<p><strong>KKTP:</strong> " +
        deps.escapeHtml(percentText(result.kktp || 0)) +
        "</p>",
      "<table>",
      "<thead><tr><th>TP</th><th>Materi</th><th>Jumlah Butir</th><th>Total Bobot</th><th>Rata-rata Capaian</th><th>Siswa Tercapai</th><th>Status</th></tr></thead>",
      "<tbody>",
      rowsHTML,
      "</tbody></table>",
      "</body></html>",
    ].join("");
    const win = window.open("", "_blank");
    if (!win) {
      deps.setMsg("Gagal membuka jendela print.");
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  }

  function bindItemAnalysisRowClick() {
    if (!deps || !deps.itemAnalysisBody) return;
    deps.itemAnalysisBody.addEventListener("click", function (e) {
      const target = e.target;
      if (!target) return;
      const row = target.closest(".analysis-row");
      if (!row) return;
      const itemID = row.getAttribute("data-item-id");
      if (!itemID || !latestItemAnalysisByID[itemID]) return;
      const current = deps.itemAnalysisBody.querySelector(
        ".analysis-row-active",
      );
      if (current) current.classList.remove("analysis-row-active");
      row.classList.add("analysis-row-active");
      setItemAnalysisDetailHTML(
        renderItemDetail(latestItemAnalysisByID[itemID]),
        false,
      );
    });
  }

  function bindLearningGoalRowClick() {
    if (!deps || !deps.learningGoalBody) return;
    deps.learningGoalBody.addEventListener("click", function (e) {
      const target = e.target;
      if (!target) return;
      const row = target.closest(".analysis-row");
      if (!row) return;
      const key = row.getAttribute("data-goal-key");
      if (!key || !latestLearningGoalByKey[key]) return;
      const current = deps.learningGoalBody.querySelector(
        ".analysis-row-active",
      );
      if (current) current.classList.remove("analysis-row-active");
      row.classList.add("analysis-row-active");
      setLearningGoalDetailHTML(
        renderLearningGoalDetail(
          latestLearningGoalByKey[key],
          latestLearningGoalResult && latestLearningGoalResult.kktp,
        ),
        false,
      );
    });
  }

  function parseDownloadFilenameLite(disposition, fallback) {
    const src = String(disposition || "");
    const utfMatch = src.match(/filename\\*=UTF-8''([^;]+)/i);
    if (utfMatch && utfMatch[1]) {
      try {
        return decodeURIComponent(utfMatch[1]);
      } catch (_) {
        return utfMatch[1];
      }
    }
    const basicMatch = src.match(/filename=\"?([^\";]+)\"?/i);
    if (basicMatch && basicMatch[1]) return basicMatch[1];
    return fallback;
  }

  function selectExam(examID, autoLoad) {
    if (deps && deps.resultsExamSelect) {
      deps.resultsExamSelect.value = examID > 0 ? String(examID) : "";
    }
    if (autoLoad) {
      return loadExamAssignments(examID);
    }
  }

  function bindHandlers() {
    if (!deps) return;

    if (deps.resultsRefreshBtn) {
      deps.resultsRefreshBtn.addEventListener("click", async function () {
        const done = deps.beginBusy(
          deps.resultsRefreshBtn,
          deps.msg,
          "Memuat daftar ujian...",
        );
        try {
          if (typeof deps.refreshExams === "function") {
            await deps.refreshExams();
          }
          deps.setMsg("Daftar ujian berhasil dimuat.");
        } catch (err) {
          deps.setMsg("Gagal memuat daftar ujian: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (deps.resultsAssignmentForm) {
      deps.resultsAssignmentForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(deps.resultsAssignmentForm);
        const examID = Number(fd.get("exam_id") || 0);
        if (examID <= 0) {
          deps.setMsg("Pilih ujian terlebih dahulu.");
          return;
        }
        const done = deps.beginBusy(
          deps.resultsAssignmentForm,
          deps.msg,
          "Memuat hasil ujian peserta...",
        );
        try {
          await loadExamAssignments(examID);
          deps.setMsg("Hasil ujian peserta berhasil dimuat.");
        } catch (err) {
          deps.setMsg("Gagal memuat hasil ujian peserta: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (deps.resultsAssignmentBody) {
      deps.resultsAssignmentBody.addEventListener("click", async function (e) {
        const viewBtn =
          e.target &&
          e.target.closest("button[data-attempt-open-learning-goal]");
        if (viewBtn) {
          const attemptID = Number(
            viewBtn.getAttribute("data-attempt-open-learning-goal") || 0,
          );
          if (attemptID > 0) {
            try {
              await openLearningGoalStudentDialog(attemptID);
            } catch (err) {
              deps.setMsg(
                "Gagal menyiapkan analisis TP per peserta: " + err.message,
              );
            }
          }
          return;
        }
        const btn = e.target && e.target.closest("button[data-attempt-delete]");
        if (!btn) return;
        const attemptID = Number(btn.getAttribute("data-attempt-delete") || 0);
        const examID = Number(
          (deps.resultsExamSelect && deps.resultsExamSelect.value) ||
            (latestResultsMatrix && latestResultsMatrix.exam_id) ||
            0,
        );
        if (examID <= 0 || attemptID <= 0) return;
        if (!window.confirm("Hapus attempt ini?")) return;
        const done = deps.beginBusy(
          btn,
          deps.msg,
          "Menghapus attempt ujian...",
        );
        try {
          await deps.api(
            "/api/v1/admin/exams/" + examID + "/attempts/" + attemptID,
            "DELETE",
            {},
          );
          await loadExamAssignments(examID);
          deps.setMsg("Attempt berhasil dihapus dari hasil ujian.");
        } catch (err) {
          deps.setMsg("Gagal menghapus attempt: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (deps.resultsExamSelect) {
      deps.resultsExamSelect.addEventListener("change", async function () {
        const examID = Number(deps.resultsExamSelect.value || 0);
        if (examID <= 0) {
          await loadExamAssignments(0);
          deps.setMsg("Pilih ujian terlebih dahulu.");
          return;
        }
        const done = deps.beginBusy(
          deps.resultsExamSelect,
          deps.msg,
          "Memuat hasil ujian peserta...",
        );
        try {
          await loadExamAssignments(examID);
          deps.setMsg("Hasil ujian peserta berhasil dimuat.");
        } catch (err) {
          deps.setMsg("Gagal memuat hasil ujian peserta: " + err.message);
        } finally {
          done();
        }
      });
    }
    if (deps.resultsAttemptFilter) {
      deps.resultsAttemptFilter.addEventListener("change", function () {
        applyResultsFilters();
      });
    }
    if (deps.resultsClassFilter) {
      deps.resultsClassFilter.addEventListener("change", function () {
        applyResultsFilters();
      });
    }

    if (deps.resultsExportBtn) {
      deps.resultsExportBtn.addEventListener("click", async function () {
        const examID = Number(
          (deps.resultsExamSelect && deps.resultsExamSelect.value) || 0,
        );
        if (examID <= 0) {
          deps.setMsg("Pilih ujian terlebih dahulu.");
          return;
        }
        const done = deps.beginBusy(
          deps.resultsExportBtn,
          deps.msg,
          "Menyiapkan file Excel...",
        );
        try {
          const res = await fetch(
            "/api/v1/admin/exams/" + examID + "/results/export",
            { method: "GET", credentials: "include" },
          );
          if (!res.ok) {
            const textBody = await res.text().catch(function () {
              return "";
            });
            throw new Error(textBody || "gagal mengunduh excel");
          }
          const blob = await res.blob();
          const filename = parseDownloadFilenameLite(
            res.headers.get("content-disposition"),
            "hasil_ujian.xlsx",
          );
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
          deps.setMsg("Excel hasil ujian berhasil diunduh.");
        } catch (err) {
          deps.setMsg("Gagal mengunduh Excel: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (deps.resultsReportBtn) {
      deps.resultsReportBtn.addEventListener("click", function () {
        summarizeAttemptResult("report");
      });
    }
    if (deps.resultsStatsBtn) {
      deps.resultsStatsBtn.addEventListener("click", function () {
        summarizeAttemptResult("stats");
      });
    }
    if (deps.resultsChartBtn) {
      deps.resultsChartBtn.addEventListener("click", function () {
        renderResultsChart();
      });
    }

    if (deps.itemAnalysisBtn) {
      deps.itemAnalysisBtn.addEventListener("click", async function () {
        try {
          await openItemAnalysisDialog();
        } catch (err) {
          deps.setMsg("Gagal menyiapkan analisis butir: " + err.message);
        }
      });
    }
    if (deps.learningGoalBtn) {
      deps.learningGoalBtn.addEventListener("click", async function () {
        try {
          await openLearningGoalDialog();
        } catch (err) {
          deps.setMsg(
            "Gagal menyiapkan analisis ketercapaian TP: " + err.message,
          );
        }
      });
    }
    if (deps.itemAnalysisExportBtn) {
      deps.itemAnalysisExportBtn.addEventListener("click", function () {
        exportItemAnalysis();
      });
    }
    if (deps.itemAnalysisPrintBtn) {
      deps.itemAnalysisPrintBtn.addEventListener("click", function () {
        printItemAnalysis();
      });
    }
    if (deps.learningGoalExportBtn) {
      deps.learningGoalExportBtn.addEventListener("click", function () {
        exportLearningGoalAnalysis();
      });
    }
    if (deps.learningGoalPrintBtn) {
      deps.learningGoalPrintBtn.addEventListener("click", function () {
        printLearningGoalAnalysis();
      });
    }
    if (deps.itemAnalysisFilter) {
      deps.itemAnalysisFilter.addEventListener("change", function () {
        filterItemAnalysis();
      });
    }
    [
      deps.itemAnalysisFilterNo,
      deps.itemAnalysisFilterTypeHead,
      deps.itemAnalysisFilterQuestion,
      deps.itemAnalysisFilterValidity,
      deps.itemAnalysisFilterStatus,
    ].forEach(function (el) {
      if (!el) return;
      el.addEventListener(
        el.tagName === "SELECT" ? "change" : "input",
        function () {
          filterItemAnalysis();
        },
      );
    });
    bindItemAnalysisRowClick();
    bindLearningGoalRowClick();
  }

  function init(opts) {
    setDeps(opts);
    bindHandlers();
  }

  window.GuruResults = {
    init: init,
    setExams: setExams,
    selectExam: selectExam,
    getResultsCount: getResultsCount,
    loadExamAssignments: loadExamAssignments,
  };
})();
