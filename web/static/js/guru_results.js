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
  var examSchoolNameCache = {};

  function setDeps(opts) {
    deps = opts || {};
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

  async function ensureExamSchoolName(examID) {
    const key = String(examID || 0);
    if (examSchoolNameCache[key]) return examSchoolNameCache[key];
    if (!deps || typeof deps.api !== "function") return "";
    try {
      const rows = await deps.api(
        "/api/v1/admin/exams/" + Number(examID) + "/assignments",
        "GET",
      );
      const list = Array.isArray(rows) ? rows : [];
      let name = "";
      for (let i = 0; i < list.length; i += 1) {
        const it = list[i];
        const raw = String((it && it.school_name) || "").trim();
        if (raw) {
          name = raw;
          break;
        }
      }
      examSchoolNameCache[key] = name || "";
      return name || "";
    } catch (_) {
      examSchoolNameCache[key] = "";
      return "";
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

  function renderIdentityHTML(identity) {
    if (!identity) return "";
    return [
      '<div class="analysis-identity-title">ANALISIS BUTIR SOAL</div>',
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
        return [
          '<tr class="analysis-row" data-item-id="' +
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
          "<td>" + deps.escapeHtml(String(it.validity)) + "</td>",
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
        "</strong></div>",
      "</div>",
      '<div class="analysis-distractors">',
      rows.join(""),
      "</div>",
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
    const totalAttempts = rows.length;
    const totalScore = rows.reduce(function (acc, it) {
      return acc + Number((it && it.skor_total) || 0);
    }, 0);
    const avgScore =
      totalAttempts > 0 ? (totalScore / totalAttempts).toFixed(2) : "0.00";
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
      if (rows.length > 0) {
        maxScore = Number(rows[0].skor_total || 0);
        minScore = Number(rows[0].skor_total || 0);
        rows.forEach(function (r) {
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
          ", skor tertinggi " +
          String(maxScore) +
          ", skor terendah " +
          String(minScore) +
          ".",
      );
      return;
    }
    setResultsExtraHTML(buildResultsScoreChartHTML(rows, totalWeight));
  }

  function renderResultsChart() {
    const data = latestResultsMatrix;
    const rows = Array.isArray(data && data.rows) ? data.rows : [];
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
    setResultsExtraHTML(buildResultsScoreChartHTML(rows, totalWeight));
    deps.setMsg("Grafik skor peserta berhasil ditampilkan.");
  }

  async function loadExamAssignments(examID) {
    if (!deps || !deps.resultsAssignmentBody) return;
    if (!examID || examID <= 0) {
      resultsAssignmentsCount = 0;
      latestItemAnalysis = null;
      latestItemAnalysisByID = {};
      latestItemAnalysisExamID = 0;
      if (deps && typeof deps.refreshStats === "function") {
        deps.refreshStats();
      }
      latestResultsMatrix = null;
      if (deps.resultsPanel && !deps.resultsPanel.hidden) activateResultsMenu();
      if (deps.resultsMatrixHead) {
        deps.resultsMatrixHead.innerHTML =
          "<th>Nama</th><th>Kelas</th><th>Attempt Ke-</th><th>Skor Total</th><th>Nilai</th><th>Start Ujian</th><th>End Ujian</th><th>Aksi</th>";
      }
      deps.resultsAssignmentBody.innerHTML =
        '<tr><td colspan="8" class="muted">Pilih ujian lalu muat hasil ujian peserta.</td></tr>';
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
    const rows = Array.isArray(matrix && matrix.rows) ? matrix.rows : [];
    const questionNos = Array.isArray(matrix && matrix.question_nos)
      ? matrix.question_nos
      : [];
    let totalWeight = Number((matrix && matrix.total_weight) || 0);
    if (totalWeight <= 0 && questionNos.length > 0) {
      totalWeight = questionNos.length;
    }
    resultsAssignmentsCount = rows.length;
    if (deps && typeof deps.refreshStats === "function") {
      deps.refreshStats();
    }
    if (deps.resultsPanel && !deps.resultsPanel.hidden) activateResultsMenu();
    if (deps.resultsMatrixHead) {
      const fixed = [
        "<th>Nama</th>",
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
    if (!rows.length) {
      deps.resultsAssignmentBody.innerHTML =
        '<tr><td colspan="' +
        String(8 + questionNos.length) +
        '" class="muted">Belum ada peserta yang mengikuti ujian ini.</td></tr>';
      setResultsSummary("Belum ada data hasil ujian.");
      setResultsExtra("Belum ada data untuk laporan/statistik/grafik.");
      return;
    }
    deps.resultsAssignmentBody.innerHTML = "";
    rows.forEach(function (it) {
      const answers = Array.isArray(it.answers) ? it.answers : [];
      const answerStates = Array.isArray(it.answer_states)
        ? it.answer_states
        : [];
      const scoreValue = Number(it.skor_total || 0);
      const nilai =
        totalWeight > 0
          ? ((scoreValue / totalWeight) * 100).toFixed(2)
          : "0.00";
      const answerCells = questionNos.map(function (_, idx) {
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
      const tr = document.createElement("tr");
      tr.innerHTML = [
        "<td>" + deps.escapeHtml(String(it.full_name || "-")) + "</td>",
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
    setResultsSummary(
      "Exam #" +
        String((matrix && matrix.exam_id) || examID) +
        " | Attempt tercatat: " +
        String(rows.length) +
        " | Jumlah soal: " +
        String(questionNos.length),
    );
    setResultsExtra(
      "Hasil ujian dimuat. Gunakan Muat Laporan/Statistik/Grafik atau Download Excel.",
    );
  }

  async function openItemAnalysisDialog() {
    if (!deps || !deps.itemAnalysisDialog) return;
    const matrix = latestResultsMatrix;
    const rows = Array.isArray(matrix && matrix.rows) ? matrix.rows : [];
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
    const questions = await ensureExamQuestions(examID);
    const items = buildItemAnalysis(matrix, questions);
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
    } else if (rows.length) {
      const first = rows.slice().sort(function (a, b) {
        return new Date(a.started_at) - new Date(b.started_at);
      })[0];
      startAtValue = deps.fmtDate(first && first.started_at);
    }
    const maxEnd = maxEndedAt(rows);
    const fallback = getExamSelectInfo(examID) || {};
    const schoolName = await ensureExamSchoolName(examID);
    const identity = {
      schoolName: schoolName || "",
      examTitle: String((examSafe && examSafe.title) || fallback.title || ""),
      examCode: String((examSafe && examSafe.code) || fallback.code || ""),
      subjectName: String((examSafe && examSafe.subject_name) || ""),
      startedAt: startAtValue || "-",
      endedAt: maxEnd ? deps.fmtDate(maxEnd) : "-",
      duration: fmtDuration(examSafe && examSafe.duration_minutes),
      teacherName: user && user.full_name ? user.full_name : "",
    };
    latestItemAnalysisIdentity = identity;
    setItemAnalysisIdentityHTML(renderIdentityHTML(identity));
    setItemAnalysisSubtitle(
      "Exam #" +
        String(examID) +
        " | Peserta: " +
        String(rows.length) +
        " | Jumlah soal: " +
        String(questionNos.length),
    );
    setItemAnalysisSummaryHTML(renderItemAnalysisSummary(items));
    setItemAnalysisBodyHTML(renderItemAnalysisRows(items));
    setItemAnalysisDetailHTML(
      "Klik salah satu baris untuk melihat detail butir.",
      true,
    );
    if (deps.itemAnalysisFilter) {
      const current = String(deps.itemAnalysisFilter.value || "");
      const types = {};
      items.forEach(function (it) {
        const raw = String(it.rawType || "").trim();
        if (!raw) return;
        types[raw] = questionTypeLabel(raw);
      });
      deps.itemAnalysisFilter.innerHTML =
        '<option value="">Semua Tipe</option>';
      Object.keys(types)
        .sort(function (a, b) {
          return String(types[a]).localeCompare(String(types[b]));
        })
        .forEach(function (raw) {
          const opt = document.createElement("option");
          opt.value = raw;
          opt.textContent = types[raw];
          if (current && current === raw) opt.selected = true;
          deps.itemAnalysisFilter.appendChild(opt);
        });
    }
    deps.itemAnalysisDialog.showModal();
  }

  function getFilteredItemAnalysis() {
    const items = Array.isArray(latestItemAnalysis) ? latestItemAnalysis : [];
    if (!deps || !deps.itemAnalysisFilter) return items;
    const filterRaw = String(deps.itemAnalysisFilter.value || "").trim();
    if (!filterRaw) return items;
    return items.filter(function (it) {
      return String(it.rawType || "").trim() === filterRaw;
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
        it.validity,
        it.correctCount,
        it.wrongCount,
        it.totalCount,
        it.status,
      ];
    });
    const lines = [header]
      .concat(rows)
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
          "<td>" + deps.escapeHtml(String(it.validity)) + "</td>",
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
      ".analysis-identity-table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px;}",
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
    if (deps.itemAnalysisFilter) {
      deps.itemAnalysisFilter.addEventListener("change", function () {
        filterItemAnalysis();
      });
    }
    bindItemAnalysisRowClick();
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
