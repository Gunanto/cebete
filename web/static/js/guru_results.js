(function () {
  var deps = null;
  var resultsAssignmentsCount = 0;
  var latestResultsMatrix = null;
  var examsCache = [];

  function setDeps(opts) {
    deps = opts || {};
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

  function getResultsCount() {
    return Number(resultsAssignmentsCount || 0);
  }

  function fillResultsExamSelect() {
    if (!deps || !deps.resultsExamSelect) return;
    const current = String(deps.resultsExamSelect.value || "");
    deps.resultsExamSelect.innerHTML = '<option value="">Pilih ujian...</option>';
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

  function buildResultsScoreChartHTML(rows, totalQuestions) {
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
      if (totalQuestions <= 0) return 0;
      return (score / totalQuestions) * 100;
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
    setResultsExtraHTML(buildResultsScoreChartHTML(rows, totalQuestions));
  }

  function renderResultsChart() {
    const data = latestResultsMatrix;
    const rows = Array.isArray(data && data.rows) ? data.rows : [];
    const totalQuestions = Array.isArray(data && data.question_nos)
      ? data.question_nos.length
      : 0;
    if (!rows.length) {
      setResultsExtra("Muat hasil ujian peserta terlebih dahulu.");
      deps.setMsg("Grafik belum bisa ditampilkan: data hasil ujian belum dimuat.");
      return;
    }
    setResultsExtraHTML(buildResultsScoreChartHTML(rows, totalQuestions));
    deps.setMsg("Grafik skor peserta berhasil ditampilkan.");
  }

  async function loadExamAssignments(examID) {
    if (!deps || !deps.resultsAssignmentBody) return;
    if (!examID || examID <= 0) {
      resultsAssignmentsCount = 0;
      if (deps && typeof deps.refreshStats === "function") {
        deps.refreshStats();
      }
      latestResultsMatrix = null;
      if (deps.resultsPanel && !deps.resultsPanel.hidden) {
        deps.activateGuruMenu("results");
      }
      if (deps.resultsMatrixHead) {
        deps.resultsMatrixHead.innerHTML =
          "<th>Nama</th><th>Attempt Ke-</th><th>Skor Total</th><th>Nilai</th><th>Start Ujian</th><th>End Ujian</th>";
      }
      deps.resultsAssignmentBody.innerHTML =
        '<tr><td colspan="6" class="muted">Pilih ujian lalu muat hasil ujian peserta.</td></tr>';
      setResultsSummary("Belum ada data hasil ujian.");
      return;
    }
    const matrix = await deps.api(
      "/api/v1/admin/exams/" + Number(examID) + "/results",
      "GET",
    );
    latestResultsMatrix = matrix || null;
    const rows = Array.isArray(matrix && matrix.rows) ? matrix.rows : [];
    const questionNos = Array.isArray(matrix && matrix.question_nos)
      ? matrix.question_nos
      : [];
    resultsAssignmentsCount = rows.length;
    if (deps && typeof deps.refreshStats === "function") {
      deps.refreshStats();
    }
    if (deps.resultsPanel && !deps.resultsPanel.hidden) {
      deps.activateGuruMenu("results");
    }
    if (deps.resultsMatrixHead) {
      const fixed = [
        "<th>Nama</th>",
        "<th>Attempt Ke-</th>",
        "<th>Skor Total</th>",
        "<th>Nilai</th>",
        "<th>Start Ujian</th>",
        "<th>End Ujian</th>",
      ];
      const dyn = questionNos.map(function (no) {
        return "<th>" + deps.escapeHtml(String(no)) + "</th>";
      });
      deps.resultsMatrixHead.innerHTML = fixed.concat(dyn).join("");
    }
    if (!rows.length) {
      deps.resultsAssignmentBody.innerHTML =
        '<tr><td colspan="' +
        String(6 + questionNos.length) +
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
      const totalQuestions = questionNos.length;
      const scoreValue = Number(it.skor_total || 0);
      const nilai =
        totalQuestions > 0
          ? ((scoreValue / totalQuestions) * 100).toFixed(2)
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
        "<td>" + deps.escapeHtml(String(it.attempt_ke || 0)) + "</td>",
        "<td>" + deps.escapeHtml(String(scoreValue)) + "</td>",
        "<td>" + deps.escapeHtml(String(nilai)) + "</td>",
        "<td>" + deps.escapeHtml(deps.fmtDate(it.started_at)) + "</td>",
        "<td>" + deps.escapeHtml(deps.fmtDate(it.ended_at)) + "</td>",
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
