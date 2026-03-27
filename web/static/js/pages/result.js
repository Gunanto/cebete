(function () {
  const core = window.AppCore || {};
  const api = core.api;
  const meOrNull = core.meOrNull;
  const text = core.text;
  const html = core.html;
  const escapeHtml = core.escapeHtml;

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

  window.AppPages = window.AppPages || {};
  window.AppPages.initResultPage = initResultPage;
})();
