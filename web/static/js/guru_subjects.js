(function () {
  var deps = null;
  var subjectsCache = [];
  var educationLevelsCache = [];
  var isBound = false;

  function setDeps(opts) {
    deps = opts || {};
  }

  function getCache() {
    return Array.isArray(subjectsCache) ? subjectsCache : [];
  }

  function label(it) {
    const level = String((it && it.education_level) || "").trim();
    const stype = String((it && it.subject_type) || "").trim();
    const name = String((it && it.name) || "").trim();
    return [level, stype, name].filter(Boolean).join(" | ");
  }

  function setDeleteLabel(value) {
    if (!deps || !deps.subjectDeleteLabel) return;
    if (typeof deps.text === "function") deps.text(deps.subjectDeleteLabel, value);
    else deps.subjectDeleteLabel.textContent = value;
  }

  async function loadEducationLevelsForSubjectForm() {
    if (!deps || typeof deps.api !== "function") return [];
    try {
      const out = await deps.api("/api/v1/levels", "GET");
      educationLevelsCache = Array.isArray(out) ? out : [];
    } catch (_) {
      educationLevelsCache = [];
    }
    return educationLevelsCache;
  }

  function fillEducationLevelSelect(selectedValue) {
    if (!deps || !deps.subjectLevelSelect) return;
    const selected = String(selectedValue || "").trim();
    deps.subjectLevelSelect.innerHTML = '<option value="">Pilih Jenjang</option>';
    educationLevelsCache.forEach(function (it) {
      const name = String((it && it.name) || "").trim();
      if (!name) return;
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      if (selected && selected === name) opt.selected = true;
      deps.subjectLevelSelect.appendChild(opt);
    });
    if (
      selected &&
      !Array.from(deps.subjectLevelSelect.options).some(function (o) {
        return o.value === selected;
      })
    ) {
      const legacy = document.createElement("option");
      legacy.value = selected;
      legacy.textContent = selected + " (legacy)";
      legacy.selected = true;
      deps.subjectLevelSelect.appendChild(legacy);
    }
  }

  function fillSelect(selectEl, withAllOption) {
    if (!selectEl) return;
    const current = String(selectEl.value || "");
    selectEl.innerHTML = "";
    if (withAllOption) {
      const allOpt = document.createElement("option");
      allOpt.value = "";
      allOpt.textContent = "Semua Mapel";
      selectEl.appendChild(allOpt);
    }
    getCache().forEach(function (it) {
      const opt = document.createElement("option");
      opt.value = String(it.id || "");
      opt.textContent = label(it);
      if (current && current === String(it.id || "")) opt.selected = true;
      selectEl.appendChild(opt);
    });
    if (!selectEl.value && selectEl.options.length > 0) {
      selectEl.selectedIndex = 0;
    }
  }

  function findByID(subjectID) {
    return getCache().find(function (it) {
      return Number((it && it.id) || 0) === Number(subjectID || 0);
    });
  }

  function openSubjectDialog(editItem) {
    if (!deps || !deps.subjectDialogForm || !deps.subjectDialog) return;
    deps.subjectDialogForm.reset();
    const idEl = deps.subjectDialogForm.elements.namedItem("id");
    const typeEl = deps.subjectDialogForm.elements.namedItem("subject_type");
    const nameEl = deps.subjectDialogForm.elements.namedItem("name");
    if (idEl) idEl.value = editItem ? String(editItem.id || "") : "";
    fillEducationLevelSelect(editItem ? String(editItem.education_level || "") : "");
    if (typeEl) typeEl.value = editItem ? String(editItem.subject_type || "") : "";
    if (nameEl) nameEl.value = editItem ? String(editItem.name || "") : "";
    if (deps.subjectDialogTitle) {
      deps.subjectDialogTitle.textContent = editItem ? "Ubah Mapel" : "Tambah Mapel";
    }
    if (typeof deps.subjectDialog.showModal === "function") {
      deps.subjectDialog.showModal();
    }
  }

  function openSubjectDeleteDialog(item) {
    if (!deps || !deps.subjectDeleteDialog || !deps.subjectDeleteForm) return;
    const idEl = deps.subjectDeleteForm.elements.namedItem("id");
    if (idEl) idEl.value = String((item && item.id) || "");
    setDeleteLabel("Mapel '" + String((item && item.name) || "") + "' akan dihapus.");
    if (typeof deps.subjectDeleteDialog.showModal === "function") {
      deps.subjectDeleteDialog.showModal();
    }
  }

  function renderTableRows(subjectItems) {
    if (!deps || !deps.subjectsBody) return;
    if (!subjectItems.length) {
      deps.subjectsBody.innerHTML =
        '<tr><td colspan="5" class="muted">Tidak ada data mapel.</td></tr>';
      return;
    }
    deps.subjectsBody.innerHTML = "";
    subjectItems.forEach(function (it) {
      const actionHTML = deps.canManageSubjects
        ? '<span class="action-icons">' +
          '<button class="icon-only-btn" type="button" data-action="edit-subject" data-id="' +
          deps.escapeHtml(String(it.id || "")) +
          '" title="Ubah" aria-label="Ubah">' +
          '<svg viewBox="0 0 24 24" focusable="false"><path d="M3 17.25V21h3.75L17.8 9.95l-3.75-3.75L3 17.25z"/><path d="M14.05 6.2l3.75 3.75"/></svg>' +
          "</button>" +
          '<button class="icon-only-btn danger" type="button" data-action="delete-subject" data-id="' +
          deps.escapeHtml(String(it.id || "")) +
          '" title="Hapus" aria-label="Hapus">' +
          '<svg viewBox="0 0 24 24" focusable="false"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>' +
          "</button>" +
          "</span>"
        : "-";
      const tr = document.createElement("tr");
      tr.innerHTML = [
        "<td>" + deps.escapeHtml(String(it.id || "")) + "</td>",
        "<td>" + deps.escapeHtml(String(it.education_level || "")) + "</td>",
        "<td>" + deps.escapeHtml(String(it.subject_type || "")) + "</td>",
        "<td>" + deps.escapeHtml(String(it.name || "")) + "</td>",
        "<td>" + actionHTML + "</td>",
      ].join("");
      deps.subjectsBody.appendChild(tr);
    });
  }

  async function loadSubjects() {
    if (!deps || typeof deps.api !== "function") return [];
    const items = await deps.api("/api/v1/subjects", "GET");
    const subjectItems = Array.isArray(items) ? items : [];
    subjectsCache = subjectItems;
    if (deps.subjectsPanel && !deps.subjectsPanel.hidden && deps.activateGuruMenu) {
      deps.activateGuruMenu("subjects");
    }
    const levels = {};
    subjectItems.forEach(function (it) {
      const lvl = String(it.education_level || "").trim();
      if (lvl) levels[lvl] = true;
    });

    if (deps.statSubjects) deps.statSubjects.textContent = String(subjectItems.length);
    if (deps.statLevels) deps.statLevels.textContent = String(Object.keys(levels).length);
    if (typeof deps.refreshStats === "function") deps.refreshStats();
    renderTableRows(subjectItems);
    if (typeof deps.onSubjectsUpdated === "function") {
      deps.onSubjectsUpdated(subjectItems);
    }
    return subjectItems;
  }

  function bindEvents() {
    if (!deps || isBound) return;
    isBound = true;

    if (deps.subjectRefreshBtn) {
      deps.subjectRefreshBtn.addEventListener("click", async function () {
        const done = deps.beginBusy(
          deps.subjectRefreshBtn,
          deps.msg,
          "Memuat ulang mapel...",
        );
        try {
          await loadSubjects();
          deps.setMsg("Data mapel berhasil dimuat ulang.");
        } catch (err) {
          deps.setMsg("Gagal memuat mapel: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (deps.subjectAddBtn) {
      deps.subjectAddBtn.hidden = !deps.canManageSubjects;
      if (deps.canManageSubjects) {
        deps.subjectAddBtn.addEventListener("click", function () {
          openSubjectDialog(null);
        });
      }
    }

    if (deps.subjectsBody && deps.canManageSubjects) {
      deps.subjectsBody.addEventListener("click", function (e) {
        const btn = e.target && e.target.closest("button[data-action][data-id]");
        if (!btn) return;
        const id = Number(btn.getAttribute("data-id") || 0);
        const action = String(btn.getAttribute("data-action") || "");
        if (!id) return;
        const item = findByID(id);
        if (!item) return;
        if (action === "edit-subject") {
          openSubjectDialog(item);
        } else if (action === "delete-subject") {
          openSubjectDeleteDialog(item);
        }
      });
    }

    if (deps.subjectCancelBtn) {
      deps.subjectCancelBtn.addEventListener("click", function () {
        if (deps.subjectDialog && typeof deps.subjectDialog.close === "function") {
          deps.subjectDialog.close();
        }
      });
    }

    if (deps.subjectDeleteCancelBtn) {
      deps.subjectDeleteCancelBtn.addEventListener("click", function () {
        if (
          deps.subjectDeleteDialog &&
          typeof deps.subjectDeleteDialog.close === "function"
        ) {
          deps.subjectDeleteDialog.close();
        }
      });
    }

    if (deps.subjectDialogForm && deps.canManageSubjects) {
      deps.subjectDialogForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(deps.subjectDialogForm);
        const id = Number(fd.get("id") || 0);
        const payload = {
          education_level: String(fd.get("education_level") || "").trim(),
          subject_type: String(fd.get("subject_type") || "").trim(),
          name: String(fd.get("name") || "").trim(),
        };
        const done = deps.beginBusy(
          deps.subjectDialogForm,
          deps.msg,
          "Menyimpan mapel...",
        );
        try {
          if (id > 0) {
            await deps.api("/api/v1/subjects/" + id, "PUT", payload);
            deps.setMsg("Mapel berhasil diperbarui.");
          } else {
            await deps.api("/api/v1/subjects", "POST", payload);
            deps.setMsg("Mapel berhasil ditambahkan.");
          }
          if (deps.subjectDialog && typeof deps.subjectDialog.close === "function") {
            deps.subjectDialog.close();
          }
          await loadSubjects();
        } catch (err) {
          deps.setMsg("Simpan mapel gagal: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (deps.subjectDeleteForm && deps.canManageSubjects) {
      deps.subjectDeleteForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(deps.subjectDeleteForm);
        const id = Number(fd.get("id") || 0);
        if (!id) return;
        const done = deps.beginBusy(
          deps.subjectDeleteForm,
          deps.msg,
          "Menghapus mapel...",
        );
        try {
          await deps.api("/api/v1/subjects/" + id, "DELETE");
          if (
            deps.subjectDeleteDialog &&
            typeof deps.subjectDeleteDialog.close === "function"
          ) {
            deps.subjectDeleteDialog.close();
          }
          await loadSubjects();
          deps.setMsg("Mapel berhasil dihapus.");
        } catch (err) {
          deps.setMsg("Hapus mapel gagal: " + err.message);
        } finally {
          done();
        }
      });
    }
  }

  function init(opts) {
    setDeps(opts);
    bindEvents();
    fillEducationLevelSelect("");
  }

  window.GuruSubjects = {
    init: init,
    getCache: getCache,
    label: label,
    fillSelect: fillSelect,
    findByID: findByID,
    loadSubjects: loadSubjects,
    loadEducationLevels: loadEducationLevelsForSubjectForm,
    fillEducationLevelSelect: fillEducationLevelSelect,
  };
})();
