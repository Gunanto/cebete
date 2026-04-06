(function () {
  const core = window.AppCore || {};
  const api = core.api;
  const meOrNull = core.meOrNull;
  const text = core.text;
  const html = core.html;
  const escapeHtml = core.escapeHtml;

  async function initPesertaPage() {
    const root = document.querySelector('[data-page="peserta_content"]');
    if (!root) return;

    const user = await meOrNull();
    if (!user) {
      window.location.href = "/login";
      return;
    }
    if (String((user && user.role) || "").toLowerCase() !== "siswa") {
      window.location.href = "/";
      return;
    }

    const msg = document.getElementById("peserta-message");
    const pageTitle = document.getElementById("peserta-page-title");
    const pageDesc = document.getElementById("peserta-page-desc");
    const sidebar = document.getElementById("peserta-sidebar");
    const sidebarToggle = document.getElementById("peserta-sidebar-toggle");
    const sidebarBackdrop = document.getElementById("peserta-sidebar-backdrop");
    const avatar = document.getElementById("peserta-avatar");
    const userName = document.getElementById("peserta-user-name");
    const userClass = document.getElementById("peserta-user-class");
    const profileName = document.getElementById("peserta-profile-name");
    const profileParticipantNo = document.getElementById(
      "peserta-profile-participant-no",
    );
    const profileNISN = document.getElementById("peserta-profile-nisn");
    const profileClassName = document.getElementById(
      "peserta-profile-class-name",
    );
    const profileSchoolName = document.getElementById(
      "peserta-profile-school-name",
    );
    const examsBody = document.getElementById("peserta-exams-body");
    const resultForm = document.getElementById("peserta-result-form");
    const resultExamSelect = document.getElementById(
      "peserta-result-exam-select",
    );
    const resultBody = document.getElementById("peserta-result-body");
    const resultDialog = document.getElementById("peserta-result-dialog");
    const resultDialogTitle = document.getElementById(
      "peserta-result-dialog-title",
    );
    const resultDialogSummary = document.getElementById(
      "peserta-result-dialog-summary",
    );
    const resultDialogExamTitle = document.getElementById(
      "peserta-result-dialog-exam-title",
    );
    const resultDialogSchoolName = document.getElementById(
      "peserta-result-dialog-school-name",
    );
    const resultDialogSubject = document.getElementById(
      "peserta-result-dialog-subject",
    );
    const resultDialogStatus = document.getElementById(
      "peserta-result-dialog-status",
    );
    const resultDialogExamScore = document.getElementById(
      "peserta-result-dialog-exam-score",
    );
    const resultDialogClassAverage = document.getElementById(
      "peserta-result-dialog-class-average",
    );
    const resultDialogItems = document.getElementById(
      "peserta-result-dialog-items",
    );
    const resultDialogLearningGoal = document.getElementById(
      "peserta-result-dialog-learning-goal",
    );
    const resultDialogExportBtn = document.getElementById(
      "peserta-result-dialog-export-btn",
    );
    const menuButtons = Array.from(
      document.querySelectorAll("[data-peserta-menu]"),
    );
    const panels = {
      dashboard: document.getElementById("peserta-dashboard-panel"),
      exams: document.getElementById("peserta-exams-panel"),
      results: document.getElementById("peserta-results-panel"),
      profile: document.getElementById("peserta-profile-panel"),
    };

    function setSidebarOpen(open) {
      if (!sidebar || !sidebarToggle || !sidebarBackdrop) return;
      document.body.classList.toggle("sidebar-open", open);
      sidebarToggle.setAttribute("aria-expanded", open ? "true" : "false");
      sidebarBackdrop.hidden = !open;
    }

    function setActiveMenu(menu) {
      menuButtons.forEach(function (btn) {
        btn.classList.toggle(
          "active",
          String(btn.dataset.pesertaMenu || "") === menu,
        );
      });
      Object.keys(panels).forEach(function (key) {
        if (panels[key]) panels[key].hidden = key !== menu;
      });
      const activeBtn = menuButtons.find(function (btn) {
        return String(btn.dataset.pesertaMenu || "") === menu;
      });
      if (activeBtn) {
        if (pageTitle) pageTitle.textContent = activeBtn.dataset.title || "";
        if (pageDesc) pageDesc.textContent = activeBtn.dataset.desc || "";
      }
      if (window.innerWidth <= 900) setSidebarOpen(false);
    }

    function setCell(el, value) {
      if (!el) return;
      const raw = String(value || "").trim();
      el.textContent = raw || "-";
    }

    function fmtShortDate(raw) {
      if (!raw) return "-";
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return "-";
      return d.toLocaleString("id-ID");
    }

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
      if (!resultDialogItems) return;
      if (!out || out.score_only) {
        resultDialogItems.classList.add("muted");
        html(
          resultDialogItems,
          "Detail jawaban tidak ditampilkan sesuai pengaturan ujian.",
        );
        return;
      }
      const items = Array.isArray(out.items) ? out.items : [];
      if (!items.length) {
        resultDialogItems.classList.add("muted");
        html(resultDialogItems, "Detail jawaban belum tersedia.");
        return;
      }
      resultDialogItems.classList.remove("muted");
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
        resultDialogItems,
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

    function renderLearningGoalItems(out) {
      if (!resultDialogLearningGoal) return;
      if (!out) {
        resultDialogLearningGoal.classList.add("muted");
        html(
          resultDialogLearningGoal,
          "Analisis tujuan pembelajaran belum tersedia.",
        );
        return;
      }
      const items = Array.isArray(out.items) ? out.items : [];
      if (!items.length) {
        resultDialogLearningGoal.classList.add("muted");
        html(
          resultDialogLearningGoal,
          "Analisis tujuan pembelajaran belum tersedia untuk attempt ini.",
        );
        return;
      }
      resultDialogLearningGoal.classList.remove("muted");
      const achievedCount = items.filter(function (it) {
        return !!(it && it.achieved);
      }).length;
      const averagePercent = items.length
        ? items.reduce(function (acc, it) {
            return acc + Number((it && it.percent) || 0);
          }, 0) / items.length
        : 0;
      const rows = items
        .map(function (it, idx) {
          const statusClass = it && it.achieved ? "accepted" : "revision";
          const statusLabel = it && it.achieved ? "Tercapai" : "Belum Tercapai";
          return [
            "<tr>",
            "<td>" + escapeHtml(String(idx + 1)) + "</td>",
            "<td>" +
              escapeHtml(String(it.learning_goal_text || "Tanpa TP")) +
              "</td>",
            "<td>" +
              escapeHtml(String(it.learning_goal_materi || "-")) +
              "</td>",
            "<td>" +
              escapeHtml(Number((it && it.earned_weight) || 0).toFixed(2)) +
              "</td>",
            "<td>" +
              escapeHtml(Number((it && it.total_weight) || 0).toFixed(2)) +
              "</td>",
            "<td>" +
              escapeHtml(Number((it && it.percent) || 0).toFixed(2) + "%") +
              "</td>",
            '<td><span class="analysis-status analysis-status-' +
              escapeHtml(statusClass) +
              '">' +
              escapeHtml(statusLabel) +
              "</span></td>",
            "</tr>",
          ].join("");
        })
        .join("");
      html(
        resultDialogLearningGoal,
        '<div class="result-learning-goal-head"><strong>Analisis Ketercapaian Tujuan Pembelajaran</strong><div class="muted mt">KKTP: ' +
          escapeHtml(Number(out.kktp || 0).toFixed(2) + "%") +
          " | TP Tercapai: " +
          escapeHtml(String(achievedCount)) +
          "/" +
          escapeHtml(String(items.length)) +
          " | Rata-rata: " +
          escapeHtml(Number(averagePercent || 0).toFixed(2) + "%") +
          "</div></div>" +
          '<div class="table-wrap mt"><table class="bs-table"><thead><tr>' +
          "<th>No</th>" +
          "<th>Tujuan Pembelajaran</th>" +
          "<th>Materi</th>" +
          "<th>Bobot Dicapai</th>" +
          "<th>Bobot Soal</th>" +
          "<th>Persentase</th>" +
          "<th>Status</th>" +
          "</tr></thead><tbody>" +
          rows +
          "</tbody></table></div>",
      );
    }

    const resultCache = new Map();
    const learningGoalResultCache = new Map();

    async function showResultDialog(attemptID, subjectLabel) {
      if (!resultDialog || !attemptID) return;
      if (resultDialogTitle) resultDialogTitle.textContent = "Hasil Ujian";
      if (resultDialogSummary) {
        resultDialogSummary.hidden = true;
        text(resultDialogSummary, "");
      }
      if (resultDialogExamTitle) resultDialogExamTitle.textContent = "-";
      if (resultDialogSchoolName) resultDialogSchoolName.textContent = "-";
      if (resultDialogSubject)
        resultDialogSubject.textContent = subjectLabel || "-";
      if (resultDialogStatus) resultDialogStatus.textContent = "-";
      if (resultDialogExamScore) resultDialogExamScore.textContent = "0.00";
      if (resultDialogClassAverage)
        resultDialogClassAverage.textContent = "0.00";
      if (resultDialogItems) {
        resultDialogItems.classList.add("muted");
        text(resultDialogItems, "Memuat detail jawaban...");
      }
      if (resultDialogLearningGoal) {
        resultDialogLearningGoal.classList.add("muted");
        text(
          resultDialogLearningGoal,
          "Memuat analisis tujuan pembelajaran...",
        );
      }
      if (typeof resultDialog.showModal === "function") {
        resultDialog.showModal();
      } else {
        resultDialog.setAttribute("open", "true");
      }
      try {
        let out = resultCache.get(attemptID);
        if (!out) {
          out = await api("/api/v1/attempts/" + attemptID + "/result", "GET");
          resultCache.set(attemptID, out);
        }
        const s = out && out.summary;
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
        const examCode = String((s && s.exam_code) || "").trim();
        const examTitleDisplay = examCode
          ? examCode + " | " + (examTitle || "-")
          : examTitle || "-";
        if (resultDialogTitle) {
          resultDialogTitle.textContent = examTitle
            ? "Hasil " + examTitle
            : "Hasil Ujian";
        }
        if (resultDialogSummary) resultDialogSummary.hidden = true;
        if (resultDialogExamTitle)
          resultDialogExamTitle.textContent = examTitleDisplay;
        if (resultDialogSchoolName)
          resultDialogSchoolName.textContent = String(
            (s && s.school_name) || "-",
          );
        if (resultDialogSubject)
          resultDialogSubject.textContent = subjectLabel || "-";
        if (resultDialogStatus)
          resultDialogStatus.textContent = String((s && s.status) || "-");
        if (resultDialogExamScore)
          resultDialogExamScore.textContent = scoreLabel;
        if (resultDialogClassAverage)
          resultDialogClassAverage.textContent = Number(
            (s && s.class_average_score) || 0,
          ).toLocaleString("id-ID", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
        renderResultItems(out);
      } catch (err) {
        if (resultDialogSummary)
          text(resultDialogSummary, "Gagal memuat hasil: " + err.message);
        if (resultDialogItems) {
          resultDialogItems.classList.add("muted");
          text(resultDialogItems, "Gagal memuat detail jawaban.");
        }
        return;
      }
      try {
        let learningGoalOut = learningGoalResultCache.get(attemptID);
        if (!learningGoalOut) {
          learningGoalOut = await api(
            "/api/v1/attempts/" + attemptID + "/learning-goal-result",
            "GET",
          );
          learningGoalResultCache.set(attemptID, learningGoalOut);
        }
        renderLearningGoalItems(learningGoalOut);
      } catch (_) {
        if (resultDialogLearningGoal) {
          resultDialogLearningGoal.classList.add("muted");
          text(
            resultDialogLearningGoal,
            "Analisis tujuan pembelajaran tidak tersedia untuk attempt ini.",
          );
        }
      }
    }

    function sanitizeFilenamePart(value) {
      return String(value || "")
        .replace(/[\\/:*?"<>|]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function exportResultDialogPDF() {
      if (!resultDialog) return;
      const title = String(
        resultDialogTitle && resultDialogTitle.textContent,
      ).trim();
      const school = String(
        (resultDialogSchoolName && resultDialogSchoolName.textContent) || "",
      ).trim();
      const examName = String(
        (resultDialogExamTitle && resultDialogExamTitle.textContent) || "",
      ).trim();
      const userIDPart = currentUserID ? String(currentUserID) : "";
      const userNamePart = currentUserName || "-";
      const datePart = new Date().toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
      const filename = [userIDPart, userNamePart, school, examName, datePart]
        .filter(function (v) {
          return String(v || "").trim();
        })
        .map(sanitizeFilenamePart)
        .join(" ")
        .trim();
      const docTitle = filename ? filename + ".pdf" : "hasil_ujian.pdf";
      const metaRows = [
        [
          "Nama Ujian",
          resultDialogExamTitle && resultDialogExamTitle.textContent,
        ],
        [
          "Nama Sekolah",
          resultDialogSchoolName && resultDialogSchoolName.textContent,
        ],
        ["Mapel", resultDialogSubject && resultDialogSubject.textContent],
        ["Status", resultDialogStatus && resultDialogStatus.textContent],
        [
          "Nilai Akhir (Skala 100)",
          resultDialogExamScore && resultDialogExamScore.textContent,
        ],
        [
          "Nilai Rata-rata Kelas",
          resultDialogClassAverage && resultDialogClassAverage.textContent,
        ],
      ];
      const metaTable = [
        "<table>",
        "<tbody>",
        metaRows
          .map(function (row) {
            return (
              "<tr><td>" +
              escapeHtml(String(row[0] || "")) +
              "</td><td>: " +
              escapeHtml(String(row[1] || "-").trim() || "-") +
              "</td></tr>"
            );
          })
          .join(""),
        "</tbody>",
        "</table>",
      ].join("");
      const itemsHTML = resultDialogItems
        ? String(resultDialogItems.innerHTML || "")
        : "";
      const learningGoalHTML = resultDialogLearningGoal
        ? String(resultDialogLearningGoal.innerHTML || "")
        : "";
      const htmlDoc = [
        '<!doctype html><html><head><meta charset="utf-8"/>',
        "<title>" + escapeHtml(docTitle) + "</title>",
        "<style>",
        "body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;padding:24px;}",
        "h1{font-size:20px;margin:0 0 12px;}",
        "table{width:100%;border-collapse:collapse;font-size:12px;}",
        "td,th{border:1px solid #e5e7eb;padding:6px 8px;vertical-align:top;}",
        "th{background:#f3f4f6;text-align:left;}",
        ".table-wrap{margin-top:12px;}",
        ".muted{color:#64748b;}",
        ".analysis-status{display:inline-flex;align-items:center;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700;}",
        ".analysis-status-accepted{background:#dcfce7;color:#166534;}",
        ".analysis-status-revision{background:#fef3c7;color:#92400e;}",
        "</style></head><body>",
        "<h1>" + escapeHtml(title || "Hasil Ujian") + "</h1>",
        metaTable,
        '<div class="table-wrap">',
        itemsHTML || '<div class="muted">Detail jawaban tidak tersedia.</div>',
        "</div>",
        '<div class="table-wrap">',
        learningGoalHTML ||
          '<div class="muted">Analisis tujuan pembelajaran tidak tersedia.</div>',
        "</div>",
        "</body></html>",
      ].join("");
      const win = window.open("", "_blank");
      if (!win) return;
      win.document.open();
      win.document.write(htmlDoc);
      win.document.close();
      win.document.title = docTitle;
      win.focus();
      win.print();
    }

    menuButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        const target = String(btn.dataset.pesertaMenu || "");
        if (target) setActiveMenu(target);
      });
    });
    const jumpButtons = Array.from(
      document.querySelectorAll("[data-peserta-jump]"),
    );
    jumpButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        const target = String(btn.dataset.pesertaJump || "");
        if (target) setActiveMenu(target);
      });
    });
    if (sidebarToggle) {
      sidebarToggle.addEventListener("click", function () {
        setSidebarOpen(!document.body.classList.contains("sidebar-open"));
      });
    }
    if (sidebarBackdrop) {
      sidebarBackdrop.addEventListener("click", function () {
        setSidebarOpen(false);
      });
    }
    window.addEventListener("resize", function () {
      if (window.innerWidth > 900) setSidebarOpen(false);
    });

    let currentUserID = 0;
    let currentUserName = "";
    try {
      const profile = await api("/api/v1/auth/me/student-profile", "GET");
      const fullName = profile && profile.full_name;
      const me = await meOrNull().catch(function () {
        return null;
      });
      currentUserID = Number((me && me.id) || 0);
      currentUserName = String(fullName || "").trim();
      setCell(profileName, fullName);
      setCell(profileParticipantNo, profile && profile.participant_no);
      setCell(profileNISN, profile && profile.nisn);
      setCell(profileClassName, profile && profile.class_name);
      setCell(profileSchoolName, profile && profile.school_name);
      if (userName) setCell(userName, fullName);
      if (userClass)
        setCell(
          userClass,
          profile && profile.class_name ? "Kelas " + profile.class_name : "-",
        );
      if (avatar && fullName) {
        avatar.textContent =
          String(fullName || "P")
            .trim()
            .charAt(0) || "P";
      }
      if (msg) {
        text(
          msg,
          "Selamat datang, " +
            String((fullName && String(fullName).trim()) || "Peserta") +
            ".",
        );
      }
    } catch (err) {
      if (msg) text(msg, "Gagal memuat profil peserta: " + err.message);
    }

    if (examsBody) {
      try {
        const list = await api("/api/v1/exams/published", "GET");
        const items = Array.isArray(list) ? list : [];
        if (!items.length) {
          examsBody.innerHTML =
            '<div class="peserta-exam-empty muted">Belum ada ujian aktif yang bisa diikuti.</div>';
        } else {
          examsBody.innerHTML = "";
          items.forEach(function (it) {
            const card = document.createElement("article");
            card.className = "peserta-exam-card";
            card.innerHTML = [
              '<div class="peserta-exam-grid">',
              '<div class="peserta-exam-row"><div class="peserta-exam-label">Kode</div><div class="peserta-exam-value">' +
                escapeHtml(String(it.code || "-")) +
                "</div></div>",
              '<div class="peserta-exam-row"><div class="peserta-exam-label">Nama Ujian</div><div class="peserta-exam-value">' +
                escapeHtml(String(it.title || "-")) +
                "</div></div>",
              '<div class="peserta-exam-row"><div class="peserta-exam-label">Mapel</div><div class="peserta-exam-value">' +
                escapeHtml(String(it.subject_name || "-")) +
                "</div></div>",
              '<div class="peserta-exam-row"><div class="peserta-exam-label">Token Ujian</div><div class="peserta-exam-value">' +
                escapeHtml(String(it.token || "-")) +
                "</div></div>",
              '<div class="peserta-exam-row"><div class="peserta-exam-label">Expired Token At</div><div class="peserta-exam-value">' +
                escapeHtml(fmtShortDate(it.token_expires_at)) +
                "</div></div>",
              "</div>",
              '<div class="peserta-exam-actions"><a class="btn btn-secondary btn-inline" href="/ujian">Buka Ujian</a></div>',
            ].join("");
            examsBody.appendChild(card);
          });
        }
      } catch (err) {
        const msgText = String(
          (err && err.message) || "Gagal memuat daftar ujian aktif.",
        ).trim();
        examsBody.innerHTML =
          '<div class="peserta-exam-empty muted">' +
          escapeHtml(msgText || "Gagal memuat daftar ujian aktif.") +
          "</div>";
      }
    }

    const examMeta = {};

    if (resultExamSelect) {
      try {
        const list = await api("/api/v1/exams/me", "GET");
        const items = Array.isArray(list) ? list : [];
        if (!items.length) {
          resultExamSelect.innerHTML =
            '<option value="">Belum ada ujian yang diikuti.</option>';
        } else {
          resultExamSelect.innerHTML =
            '<option value="">Pilih ujian...</option>';
          items.forEach(function (it) {
            const id = Number(it.id || 0);
            if (id > 0) {
              examMeta[id] = {
                title: String(it.title || "").trim(),
                subject: String(it.subject_name || "").trim(),
              };
            }
            const opt = document.createElement("option");
            opt.value = String(id || 0);
            opt.textContent = String(it.title || "-");
            resultExamSelect.appendChild(opt);
          });
        }
      } catch (_) {
        resultExamSelect.innerHTML =
          '<option value="">Gagal memuat daftar ujian.</option>';
      }
    }

    async function loadResultTable() {
      if (!resultBody) return;
      const examID = Number((resultExamSelect && resultExamSelect.value) || 0);
      if (!examID || examID <= 0) {
        resultBody.innerHTML =
          '<tr><td colspan="5" class="muted">Pilih ujian untuk melihat daftar nilai.</td></tr>';
        return;
      }
      resultBody.innerHTML =
        '<tr><td colspan="5" class="muted">Memuat daftar nilai...</td></tr>';
      try {
        const out = await api(
          "/api/v1/exams/" + examID + "/attempts/me",
          "GET",
        );
        const attempts = Array.isArray(out && out.attempts) ? out.attempts : [];
        const totalWeight = Number((out && out.total_weight) || 0);
        const totalQuestions = Number((out && out.total_questions) || 0);
        const subjectLabel =
          (examMeta[examID] && examMeta[examID].subject) || "-";
        if (!attempts.length) {
          resultBody.innerHTML =
            '<tr><td colspan="5" class="muted">Belum ada attempt untuk ujian ini.</td></tr>';
          return;
        }
        resultBody.innerHTML = "";
        attempts.forEach(function (it) {
          const scoreValue = normalizeScore(
            it.score,
            totalWeight,
            totalQuestions,
          );
          const scoreLabel = Number.isFinite(scoreValue)
            ? scoreValue.toLocaleString("id-ID", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })
            : "0.00";
          const timeLabel = it.submitted_at
            ? fmtShortDate(it.submitted_at)
            : fmtShortDate(it.started_at);
          const tr = document.createElement("tr");
          tr.innerHTML = [
            "<td>Attempt " + escapeHtml(String(it.attempt_no || 0)) + "</td>",
            "<td>" + escapeHtml(String(subjectLabel || "-")) + "</td>",
            "<td>" + escapeHtml(String(scoreLabel)) + "</td>",
            "<td>" + escapeHtml(String(timeLabel || "-")) + "</td>",
            '<td><button class="btn btn-secondary btn-inline" type="button" data-result-attempt="' +
              escapeHtml(String(it.attempt_id || 0)) +
              '" data-result-subject="' +
              escapeHtml(String(subjectLabel || "-")) +
              '">Lihat</button></td>',
          ].join("");
          resultBody.appendChild(tr);
        });
      } catch (err) {
        resultBody.innerHTML =
          '<tr><td colspan="5" class="muted">Gagal memuat daftar nilai.</td></tr>';
      }
    }

    if (resultExamSelect) {
      resultExamSelect.addEventListener("change", function () {
        loadResultTable();
      });
    }

    if (resultForm) {
      resultForm.addEventListener("submit", function (e) {
        e.preventDefault();
        loadResultTable();
      });
    }

    if (resultBody) {
      resultBody.addEventListener("click", function (e) {
        const target = e.target;
        const btn =
          target && target.closest && target.closest("[data-result-attempt]");
        if (!btn) return;
        const attemptID = Number(btn.getAttribute("data-result-attempt") || 0);
        const subjectLabel = String(
          btn.getAttribute("data-result-subject") || "-",
        );
        if (attemptID > 0) showResultDialog(attemptID, subjectLabel);
      });
    }
    if (resultDialogExportBtn) {
      resultDialogExportBtn.addEventListener("click", function () {
        exportResultDialogPDF();
      });
    }

    setActiveMenu("dashboard");
  }

  window.AppPages = window.AppPages || {};
  window.AppPages.initPesertaPage = initPesertaPage;
})();
