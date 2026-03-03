(function () {
  var cache = [];
  var selectedIDs = new Set();
  var visibleRows = [];
  var deps = null;

  function setDeps(opts) {
    deps = opts || {};
  }

  function getSubjectsCache() {
    return typeof deps.getSubjectsCache === "function"
      ? deps.getSubjectsCache()
      : [];
  }

  function questionCodeLabel(it) {
    if (!it) return "-";
    const code = String((it && (it.code || it.question_code)) || "").trim();
    const name = String((it && (it.name || it.question_code_name)) || "").trim();
    if (code && name) return code + " - " + name;
    if (code || name) return code || name;
    const id = Number((it && (it.question_code_id || it.id)) || 0);
    if (id > 0) {
      const cached = findQuestionCodeByID(id);
      if (cached && cached !== it) {
        const cachedCode = String(
          (cached &&
            (cached.code ||
              cached.question_code ||
              cached.question_code_code)) ||
            "",
        ).trim();
        const cachedName = String(
          (cached && (cached.name || cached.question_code_name)) || "",
        ).trim();
        if (cachedCode && cachedName) return cachedCode + " - " + cachedName;
        if (cachedCode || cachedName) return cachedCode || cachedName;
      }
    }
    return "-";
  }

  function findQuestionCodeByID(id) {
    return (Array.isArray(cache) ? cache : []).find(function (it) {
      return Number((it && it.id) || 0) === Number(id || 0);
    });
  }

  function resetQuestionCodeFormMode() {
    const questionCodeForm = document.getElementById("guru-question-code-form");
    const questionCodeCancelBtn = document.getElementById(
      "guru-question-code-cancel-btn",
    );
    if (!questionCodeForm) return;
    const idField = questionCodeForm.elements.namedItem("id");
    if (idField) idField.value = "";
    const submitBtn = document.getElementById("guru-question-code-submit-btn");
    if (submitBtn) submitBtn.textContent = "Simpan Kode Soal";
    if (questionCodeCancelBtn) questionCodeCancelBtn.hidden = true;
  }

  function fillQuestionCodeSubjectSelect(selectedID) {
    const questionCodeSubjectSelect = document.getElementById(
      "guru-question-code-subject-select",
    );
    if (!questionCodeSubjectSelect) return;
    const selected = Number(selectedID || 0);
    questionCodeSubjectSelect.innerHTML = '<option value="">Pilih mapel</option>';
    const subjects = getSubjectsCache();
    subjects.forEach(function (it) {
      const id = Number((it && it.id) || 0);
      if (id <= 0) return;
      const opt = document.createElement("option");
      opt.value = String(id);
      opt.textContent = deps.subjectLabel
        ? deps.subjectLabel(it)
        : String((it && it.name) || "");
      if (selected > 0 && selected === id) opt.selected = true;
      questionCodeSubjectSelect.appendChild(opt);
    });
  }

  function fillQuestionCodeSelect(selectEl, subjectID, includeEmpty) {
    if (!selectEl) return;
    const current = String(selectEl.value || "");
    const sid = Number(subjectID || 0);
    const list = (Array.isArray(cache) ? cache : [])
      .filter(function (it) {
        const rowSubjectID = Number((it && it.subject_id) || 0);
        return sid <= 0 || rowSubjectID === sid;
      })
      .sort(function (a, b) {
        return String((a && a.code) || "").localeCompare(
          String((b && b.code) || ""),
          "id",
        );
      });
    selectEl.innerHTML = "";
    if (includeEmpty !== false) {
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "Tanpa kode soal";
      selectEl.appendChild(empty);
    }
    list.forEach(function (it) {
      const opt = document.createElement("option");
      opt.value = String(it.id || "");
      opt.textContent = questionCodeLabel(it);
      if (current && current === String(it.id || "")) opt.selected = true;
      selectEl.appendChild(opt);
    });
  }

  function updateQuestionCodeBulkState(items) {
    const questionCodeBulkDeleteBtn = document.getElementById(
      "guru-question-code-bulk-delete-btn",
    );
    const questionCodeSelectAll = document.getElementById(
      "guru-question-code-select-all",
    );
    if (!questionCodeBulkDeleteBtn || !questionCodeSelectAll) return;
    const rows = Array.isArray(items) ? items : [];
    const selectable = rows.filter(function (it) {
      return Number((it && it.id) || 0) > 0;
    });
    const selectableCount = selectable.length;
    const selectedCount = selectable.filter(function (it) {
      return selectedIDs.has(String(it.id || ""));
    }).length;
    questionCodeBulkDeleteBtn.disabled = selectedCount === 0;
    if (selectableCount === 0) {
      questionCodeSelectAll.checked = false;
      questionCodeSelectAll.indeterminate = false;
      questionCodeSelectAll.disabled = true;
      return;
    }
    questionCodeSelectAll.disabled = false;
    questionCodeSelectAll.checked =
      selectedCount > 0 && selectedCount === selectableCount;
    questionCodeSelectAll.indeterminate =
      selectedCount > 0 && selectedCount < selectableCount;
  }

  function renderQuestionCodes(items) {
    const questionCodeBody = document.getElementById("guru-question-code-body");
    if (!questionCodeBody) return;
    if (!Array.isArray(items) || !items.length) {
      questionCodeBody.innerHTML =
        '<tr><td colspan="6" class="muted">Belum ada data kode soal.</td></tr>';
      visibleRows = [];
      updateQuestionCodeBulkState([]);
      return;
    }
    questionCodeBody.innerHTML = "";
    visibleRows = items.slice();
    const valid = new Set(
      visibleRows.map(function (it) {
        return String((it && it.id) || "");
      }),
    );
    Array.from(selectedIDs).forEach(function (id) {
      if (!valid.has(id)) selectedIDs.delete(id);
    });
    items.forEach(function (it) {
      const id = Number((it && it.id) || 0);
      const isSelected = selectedIDs.has(String(id));
      const subject = getSubjectsCache().find(function (row) {
        return Number((row && row.id) || 0) === Number(it.subject_id || 0);
      });
      const tr = document.createElement("tr");
      tr.innerHTML = [
        '<td><input type="checkbox" data-question-code-select="' +
          (deps.escapeHtml ? deps.escapeHtml(String(id || "")) : String(id || "")) +
          '"' +
          (id > 0 ? "" : ' disabled aria-disabled="true"') +
          (isSelected ? " checked" : "") +
          " /></td>",
        "<td>" +
          (deps.escapeHtml ? deps.escapeHtml(String(it.id || "")) : String(it.id || "")) +
          "</td>",
        "<td>" +
          (deps.escapeHtml
            ? deps.escapeHtml(
                deps.subjectLabel ? deps.subjectLabel(subject || {}) : "",
              )
            : "") +
          "</td>",
        "<td>" +
          (deps.escapeHtml ? deps.escapeHtml(String(it.code || "")) : String(it.code || "")) +
          "</td>",
        "<td>" +
          (deps.escapeHtml ? deps.escapeHtml(String(it.name || "-")) : String(it.name || "-")) +
          "</td>",
        '<td><span class="action-icons">' +
          '<button class="icon-only-btn" type="button" data-question-code-action="edit" data-id="' +
          (deps.escapeHtml ? deps.escapeHtml(String(it.id || "")) : String(it.id || "")) +
          '" title="Ubah" aria-label="Ubah">' +
          '<svg viewBox="0 0 24 24" focusable="false"><path d="M3 17.25V21h3.75L17.8 9.95l-3.75-3.75L3 17.25z"/><path d="M14.05 6.2l3.75 3.75"/></svg>' +
          "</button>" +
          '<button class="icon-only-btn danger" type="button" data-question-code-action="delete" data-id="' +
          (deps.escapeHtml ? deps.escapeHtml(String(it.id || "")) : String(it.id || "")) +
          '" title="Hapus" aria-label="Hapus">' +
          '<svg viewBox="0 0 24 24" focusable="false"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>' +
          "</button>" +
          "</span></td>",
      ].join("");
      questionCodeBody.appendChild(tr);
    });
    updateQuestionCodeBulkState(items);
  }

  async function loadQuestionCodes(subjectID) {
    const items = await deps.api("/api/v1/question-codes", "GET");
    cache = Array.isArray(items) ? items : [];
    const sid = Number(subjectID || 0);
    const rows =
      sid > 0
        ? cache.filter(function (it) {
            return Number((it && it.subject_id) || 0) === sid;
          })
        : cache;
    renderQuestionCodes(rows);
    if (deps.manuscriptQuestionCodeSelect) {
      fillQuestionCodeSelect(
        deps.manuscriptQuestionCodeSelect,
        deps.getManuscriptTargetSubjectID
          ? deps.getManuscriptTargetSubjectID()
          : 0,
        true,
      );
    }
    if (deps.fillExamQuestionCodeSelectByExam) {
      deps.fillExamQuestionCodeSelectByExam(
        Number(
          (deps.examQuestionCodeRuleExamIDInput &&
            deps.examQuestionCodeRuleExamIDInput.value) ||
            (deps.questionExamIDInput && deps.questionExamIDInput.value) ||
            0,
        ),
      );
    }
    return cache;
  }

  function getSelectedSubjectID() {
    const questionCodeSubjectSelect = document.getElementById(
      "guru-question-code-subject-select",
    );
    return Number(
      (questionCodeSubjectSelect && questionCodeSubjectSelect.value) || 0,
    );
  }

  function init(opts) {
    setDeps(opts);
    const questionCodeForm = document.getElementById("guru-question-code-form");
    const questionCodeRefreshBtn = document.getElementById(
      "guru-question-code-refresh-btn",
    );
    const questionCodeBulkDeleteBtn = document.getElementById(
      "guru-question-code-bulk-delete-btn",
    );
    const questionCodeSelectAll = document.getElementById(
      "guru-question-code-select-all",
    );
    const questionCodeCancelBtn = document.getElementById(
      "guru-question-code-cancel-btn",
    );
    const questionCodeBody = document.getElementById(
      "guru-question-code-body",
    );
    const questionCodeSubjectSelect = document.getElementById(
      "guru-question-code-subject-select",
    );

    if (questionCodeSubjectSelect) {
      questionCodeSubjectSelect.addEventListener("change", async function () {
        const subjectID = Number(questionCodeSubjectSelect.value || 0);
        const done = deps.beginBusy(
          questionCodeSubjectSelect,
          deps.msg,
          "Memuat kode soal...",
        );
        try {
          await loadQuestionCodes(subjectID);
          deps.setMsg("Kode soal berhasil dimuat.");
        } catch (err) {
          deps.setMsg("Gagal memuat kode soal: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (questionCodeRefreshBtn) {
      questionCodeRefreshBtn.addEventListener("click", async function () {
        const subjectID = getSelectedSubjectID();
        const done = deps.beginBusy(
          questionCodeRefreshBtn,
          deps.msg,
          "Memuat kode soal...",
        );
        try {
          await loadQuestionCodes(subjectID);
          deps.setMsg("Kode soal berhasil dimuat.");
        } catch (err) {
          deps.setMsg("Gagal memuat kode soal: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (questionCodeCancelBtn) {
      questionCodeCancelBtn.addEventListener("click", function () {
        if (questionCodeForm) questionCodeForm.reset();
        resetQuestionCodeFormMode();
        deps.setMsg("Mode edit kode soal dibatalkan.");
      });
    }

    if (questionCodeForm) {
      questionCodeForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(questionCodeForm);
        const id = Number(
          fd.get("id") || Number(questionCodeForm.dataset.editingId || 0) || 0,
        );
        const subjectID = Number(fd.get("subject_id") || 0);
        const payload = {
          subject_id: subjectID,
          code: String(fd.get("code") || "").trim(),
          name: String(fd.get("name") || "").trim(),
        };
        const done = deps.beginBusy(
          questionCodeForm,
          deps.msg,
          id > 0
            ? "Menyimpan perubahan kode soal..."
            : "Menyimpan kode soal...",
        );
        try {
          if (id > 0) {
            await deps.api("/api/v1/question-codes/" + id, "PUT", payload);
          } else {
            await deps.api("/api/v1/question-codes", "POST", payload);
          }
          await loadQuestionCodes(subjectID);
          if (deps.loadBlueprints) {
            await deps.loadBlueprints(
              Number(
                (deps.blueprintFilterSubjectSelect &&
                  deps.blueprintFilterSubjectSelect.value) ||
                  0,
              ),
            );
          }
          questionCodeForm.reset();
          questionCodeForm.dataset.editingId = "";
          resetQuestionCodeFormMode();
          deps.setMsg(
            id > 0
              ? "Kode soal berhasil diperbarui."
              : "Kode soal berhasil disimpan.",
          );
        } catch (err) {
          deps.setMsg(
            (id > 0
              ? "Simpan perubahan kode soal gagal: "
              : "Simpan kode soal gagal: ") + err.message,
          );
        } finally {
          done();
        }
      });
    }

    if (questionCodeBody) {
      questionCodeBody.addEventListener("click", async function (e) {
        const btn =
          e.target &&
          e.target.closest("button[data-question-code-action][data-id]");
        if (!btn) return;
        const id = Number(btn.getAttribute("data-id") || 0);
        if (id <= 0) return;
        const action = String(
          btn.getAttribute("data-question-code-action") || "",
        );
        const item = findQuestionCodeByID(id);
        if (!item) {
          deps.setMsg("Data kode soal tidak ditemukan.");
          return;
        }
        if (action === "edit") {
          if (!questionCodeForm) return;
          const idField = questionCodeForm.elements.namedItem("id");
          const subjectField =
            questionCodeForm.elements.namedItem("subject_id");
          const codeField = questionCodeForm.elements.namedItem("code");
          const nameField = questionCodeForm.elements.namedItem("name");
          if (idField) idField.value = String(id);
          if (subjectField) subjectField.value = String(item.subject_id || "");
          if (codeField) codeField.value = String(item.code || "");
          if (nameField) nameField.value = String(item.name || "");
          questionCodeForm.dataset.editingId = String(id);
          const submitBtn = document.getElementById(
            "guru-question-code-submit-btn",
          );
          if (submitBtn) submitBtn.textContent = "Simpan Perubahan Kode";
          if (questionCodeCancelBtn) questionCodeCancelBtn.hidden = false;
          return;
        }
        if (action === "delete") {
          if (
            !window.confirm("Hapus kode soal " + String(item.code || "") + "?")
          ) {
            return;
          }
          const done = deps.beginBusy(btn, deps.msg, "Menghapus kode soal...");
          try {
            await deps.api("/api/v1/question-codes/" + id, "DELETE", {});
            await loadQuestionCodes(getSelectedSubjectID());
            if (deps.loadBlueprints) {
              await deps.loadBlueprints(
                Number(
                  (deps.blueprintFilterSubjectSelect &&
                    deps.blueprintFilterSubjectSelect.value) ||
                    0,
                ),
              );
            }
            deps.setMsg("Kode soal berhasil dihapus.");
          } catch (err) {
            deps.setMsg("Gagal menghapus kode soal: " + err.message);
          } finally {
            done();
          }
        }
      });

      questionCodeBody.addEventListener("change", function (e) {
        const input = e.target;
        if (!input || input.type !== "checkbox") return;
        const id = String(input.getAttribute("data-question-code-select") || "");
        if (!id) return;
        if (input.checked) {
          selectedIDs.add(id);
        } else {
          selectedIDs.delete(id);
        }
        updateQuestionCodeBulkState(visibleRows);
      });
    }

    if (questionCodeSelectAll) {
      questionCodeSelectAll.addEventListener("change", function () {
        const checked = !!questionCodeSelectAll.checked;
        const rows = Array.isArray(visibleRows) ? visibleRows : [];
        rows.forEach(function (it) {
          const id = String((it && it.id) || "");
          if (!id) return;
          if (checked) {
            selectedIDs.add(id);
          } else {
            selectedIDs.delete(id);
          }
        });
        renderQuestionCodes(visibleRows);
      });
    }

    if (questionCodeBulkDeleteBtn) {
      questionCodeBulkDeleteBtn.addEventListener("click", async function () {
        const rows = Array.isArray(visibleRows) ? visibleRows : [];
        const targets = rows.filter(function (it) {
          return selectedIDs.has(String((it && it.id) || ""));
        });
        if (!targets.length) return;
        const ok = window.confirm(
          "Hapus " + String(targets.length) + " kode soal terpilih?",
        );
        if (!ok) return;
        const done = deps.beginBusy(
          questionCodeBulkDeleteBtn,
          deps.msg,
          "Menghapus kode soal terpilih...",
        );
        try {
          for (let i = 0; i < targets.length; i += 1) {
            const it = targets[i];
            const id = Number((it && it.id) || 0);
            if (id <= 0) continue;
            await deps.api("/api/v1/question-codes/" + id, "DELETE", {});
            selectedIDs.delete(String(id));
          }
          await loadQuestionCodes(getSelectedSubjectID());
          if (deps.loadBlueprints) {
            await deps.loadBlueprints(
              Number(
                (deps.blueprintFilterSubjectSelect &&
                  deps.blueprintFilterSubjectSelect.value) ||
                  0,
              ),
            );
          }
          deps.setMsg("Kode soal terpilih berhasil dihapus.");
        } catch (err) {
          deps.setMsg("Hapus kode soal terpilih gagal: " + err.message);
        } finally {
          done();
        }
      });
    }
  }

  window.QuestionCodes = {
    init: init,
    load: loadQuestionCodes,
    label: questionCodeLabel,
    findByID: findQuestionCodeByID,
    fillSelect: fillQuestionCodeSelect,
    getCache: function () {
      return cache;
    },
    addToCache: function (item) {
      if (item) cache.push(item);
    },
    fillSubjectSelect: fillQuestionCodeSubjectSelect,
    getSelectedSubjectID: getSelectedSubjectID,
  };
})();
