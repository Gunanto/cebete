(function () {
  var deps = null;
  var masterSummaryState = {
    levelsByID: {},
    schoolsByID: {},
    classesByID: {},
    selectedSchoolID: 0,
  };

  function setDeps(opts) {
    deps = opts || {};
  }

  function setMasterMsg(msg) {
    if (deps.masterMessage) deps.masterMessage.textContent = msg;
    else deps.setMsg(msg);
  }

  function fillSchoolSelectRequired(selectEl, selectedID) {
    if (!selectEl) return;
    const selected = Number(selectedID || 0);
    selectEl.innerHTML = "";
    const emptyOpt = document.createElement("option");
    emptyOpt.value = "";
    emptyOpt.textContent = "Pilih Sekolah";
    selectEl.appendChild(emptyOpt);
    const schools = deps.getSchoolsCache ? deps.getSchoolsCache() : [];
    schools.forEach(function (it) {
      const opt = document.createElement("option");
      opt.value = String(it.id);
      opt.textContent = deps.schoolLabel(it);
      if (selected > 0 && Number(it.id) === selected) opt.selected = true;
      selectEl.appendChild(opt);
    });
  }

  async function loadEducationLevels(showAll) {
    const qs = showAll ? "?all=1" : "";
    const out = await deps.api("/api/v1/levels" + qs, "GET");
    return Array.isArray(out) ? out : [];
  }

  function renderMasterSummaryTable(levels, schools, classes) {
    const canEditMaster = deps.isAdmin();
    const levelItems = Array.isArray(levels) ? levels : [];
    const schoolItems = Array.isArray(schools) ? schools : [];
    const classItems = Array.isArray(classes) ? classes : [];
    masterSummaryState.levelsByID = {};
    masterSummaryState.schoolsByID = {};
    masterSummaryState.classesByID = {};
    levelItems.forEach(function (it) {
      masterSummaryState.levelsByID[String(it.id || "")] = it;
    });
    schoolItems.forEach(function (it) {
      masterSummaryState.schoolsByID[String(it.id || "")] = it;
    });
    classItems.forEach(function (it) {
      masterSummaryState.classesByID[String(it.id || "")] = it;
    });
    if (deps.levelTableBody) {
      if (!levelItems.length) {
        deps.levelTableBody.innerHTML =
          '<tr><td colspan="4" class="muted">Belum ada data jenjang.</td></tr>';
      } else {
        deps.levelTableBody.innerHTML = "";
        levelItems.forEach(function (it) {
          const tr = document.createElement("tr");
          tr.innerHTML = [
            "<td>" + deps.escapeHtml(String(it.id || "")) + "</td>",
            "<td>" + deps.escapeHtml(String(it.name || "")) + "</td>",
            "<td>" + (it.is_active ? "aktif" : "nonaktif") + "</td>",
            "<td>" +
              (canEditMaster
                ? '<span class="action-icons">' +
                  '<button class="icon-only-btn" type="button" data-master-entity="level" data-master-action="edit" data-id="' +
                  deps.escapeHtml(String(it.id || "")) +
                  '" title="Ubah jenjang" aria-label="Ubah jenjang"><svg viewBox="0 0 24 24" focusable="false"><path d="M4 20h4l10-10-4-4L4 16v4z"/><path d="M12 6l4 4"/></svg></button>' +
                  '<button class="icon-only-btn danger" type="button" data-master-entity="level" data-master-action="delete" data-id="' +
                  deps.escapeHtml(String(it.id || "")) +
                  '" title="Hapus jenjang" aria-label="Hapus jenjang"><svg viewBox="0 0 24 24" focusable="false"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg></button>' +
                  "</span>"
                : "-") +
              "</td>",
          ].join("");
          deps.levelTableBody.appendChild(tr);
        });
      }
    }
    if (deps.schoolTableBody) {
      if (!schoolItems.length) {
        deps.schoolTableBody.innerHTML =
          '<tr><td colspan="11" class="muted">Belum ada data sekolah.</td></tr>';
        renderSchoolStatsPlaceholder(
          "Klik baris sekolah untuk melihat jumlah pengguna.",
        );
      } else {
        deps.schoolTableBody.innerHTML = "";
        schoolItems.forEach(function (it) {
          const tr = document.createElement("tr");
          const schoolID = Number(it.id || 0);
          tr.setAttribute("data-school-id", String(schoolID));
          if (schoolID > 0 && schoolID === masterSummaryState.selectedSchoolID) {
            tr.classList.add("is-selected");
          }
          tr.innerHTML = [
            "<td>" + deps.escapeHtml(String(it.id || "")) + "</td>",
            "<td>" + deps.escapeHtml(String(it.name || "")) + "</td>",
            "<td>" + deps.escapeHtml(String(it.code || "-")) + "</td>",
            "<td>" + deps.escapeHtml(String(it.city || "-")) + "</td>",
            "<td>" + deps.escapeHtml(String(it.province || "-")) + "</td>",
            "<td>" + deps.escapeHtml(String(it.kecamatan || "-")) + "</td>",
            "<td>" + deps.escapeHtml(String(it.jenjang || "-")) + "</td>",
            "<td>" +
              deps.escapeHtml(String(it.status_sekolah || "-")) +
              "</td>",
            "<td>" + deps.escapeHtml(String(it.school_email || "-")) + "</td>",
            "<td>" + deps.escapeHtml(String(it.address || "-")) + "</td>",
            "<td>" +
              (canEditMaster
                ? '<span class="action-icons">' +
                  '<button class="icon-only-btn" type="button" data-master-entity="school" data-master-action="edit" data-id="' +
                  deps.escapeHtml(String(it.id || "")) +
                  '" title="Ubah sekolah" aria-label="Ubah sekolah"><svg viewBox="0 0 24 24" focusable="false"><path d="M4 20h4l10-10-4-4L4 16v4z"/><path d="M12 6l4 4"/></svg></button>' +
                  '<button class="icon-only-btn danger" type="button" data-master-entity="school" data-master-action="delete" data-id="' +
                  deps.escapeHtml(String(it.id || "")) +
                  '" title="Hapus sekolah" aria-label="Hapus sekolah"><svg viewBox="0 0 24 24" focusable="false"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg></button>' +
                  "</span>"
                : "-") +
              "</td>",
          ].join("");
          deps.schoolTableBody.appendChild(tr);
        });
      }
    }
    if (deps.classTableBody) {
      if (!classItems.length) {
        deps.classTableBody.innerHTML =
          '<tr><td colspan="6" class="muted">Belum ada data kelas.</td></tr>';
      } else {
        deps.classTableBody.innerHTML = "";
        classItems.forEach(function (it) {
          const school =
            masterSummaryState.schoolsByID[String(it.school_id)] || {};
          const tr = document.createElement("tr");
          tr.innerHTML = [
            "<td>" + deps.escapeHtml(String(it.id || "")) + "</td>",
            "<td>" + deps.escapeHtml(deps.schoolLabel(school)) + "</td>",
            "<td>" + deps.escapeHtml(String(it.grade_level || "")) + "</td>",
            "<td>" + deps.escapeHtml(String(it.name || "")) + "</td>",
            "<td>" + deps.escapeHtml(String(it.student_count || 0)) + "</td>",
            "<td>" +
              (canEditMaster
                ? '<span class="action-icons">' +
                  '<button class="icon-only-btn" type="button" data-master-entity="class" data-master-action="edit" data-id="' +
                  deps.escapeHtml(String(it.id || "")) +
                  '" title="Ubah kelas" aria-label="Ubah kelas"><svg viewBox="0 0 24 24" focusable="false"><path d="M4 20h4l10-10-4-4L4 16v4z"/><path d="M12 6l4 4"/></svg></button>' +
                  '<button class="icon-only-btn danger" type="button" data-master-entity="class" data-master-action="delete" data-id="' +
                  deps.escapeHtml(String(it.id || "")) +
                  '" title="Hapus kelas" aria-label="Hapus kelas"><svg viewBox="0 0 24 24" focusable="false"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg></button>' +
                  "</span>"
                : "-") +
              "</td>",
          ].join("");
          deps.classTableBody.appendChild(tr);
        });
      }
    }
  }

  async function loadMasterSummaryTable() {
    const levelsPromise = loadEducationLevels(deps.isAdmin());
    const schoolsPromise = deps.api("/api/v1/admin/schools?all=1", "GET");
    const classesPromise = deps.api("/api/v1/admin/classes?all=1", "GET");
    const all = await Promise.all([
      levelsPromise,
      schoolsPromise,
      classesPromise,
    ]);
    const levels = Array.isArray(all[0]) ? all[0] : [];
    const schools = Array.isArray(all[1]) ? all[1] : [];
    const classes = Array.isArray(all[2]) ? all[2] : [];
    renderMasterSummaryTable(levels, schools, classes);
    if (masterSummaryState.selectedSchoolID > 0) {
      if (masterSummaryState.schoolsByID[String(masterSummaryState.selectedSchoolID)]) {
        try {
          await loadSchoolUserStats(masterSummaryState.selectedSchoolID);
        } catch (_) {
          // Message already rendered in the stats panel.
        }
      } else {
        masterSummaryState.selectedSchoolID = 0;
        renderSchoolStatsPlaceholder(
          "Klik baris sekolah untuk melihat jumlah pengguna.",
        );
      }
    }
    return { levels: levels, schools: schools, classes: classes };
  }

  function renderSchoolStatsPlaceholder(message) {
    if (deps.schoolStatsPanel) deps.schoolStatsPanel.hidden = false;
    if (deps.schoolStatsTitle) {
      deps.schoolStatsTitle.textContent = "Informasi Pengguna Sekolah";
    }
    if (deps.schoolStatsBody) {
      deps.schoolStatsBody.innerHTML =
        '<div class="muted">' +
        deps.escapeHtml(String(message || "")) +
        "</div>";
    }
  }

  function renderSchoolStats(stats) {
    if (!deps.schoolStatsPanel || !deps.schoolStatsBody) return;
    const schoolName = String((stats && stats.school_name) || "").trim() || "-";
    if (deps.schoolStatsTitle) {
      deps.schoolStatsTitle.textContent = "Informasi Pengguna " + schoolName;
    }
    deps.schoolStatsPanel.hidden = false;
    deps.schoolStatsBody.innerHTML = [
      ["Admin", Number((stats && stats.admin_count) || 0)],
      ["Proktor", Number((stats && stats.proktor_count) || 0)],
      ["Guru", Number((stats && stats.guru_count) || 0)],
      ["Siswa", Number((stats && stats.siswa_count) || 0)],
    ]
      .map(function (item) {
        return (
          '<div class="admin-school-stats-row">' +
          '<div class="admin-school-stats-label">' +
          deps.escapeHtml(item[0]) +
          "</div>" +
          '<div class="admin-school-stats-value">' +
          deps.escapeHtml(String(item[1])) +
          "</div>" +
          "</div>"
        );
      })
      .join("");
  }

  async function loadSchoolUserStats(schoolID) {
    const id = Number(schoolID || 0);
    if (id <= 0) {
      masterSummaryState.selectedSchoolID = 0;
      renderSchoolStatsPlaceholder(
        "Klik baris sekolah untuk melihat jumlah pengguna.",
      );
      return null;
    }
    masterSummaryState.selectedSchoolID = id;
    renderSchoolStatsPlaceholder("Memuat jumlah pengguna sekolah...");
    const out = await deps.api("/api/v1/admin/schools/" + id + "/user-stats", "GET");
    renderSchoolStats(out || {});
    if (deps.schoolTableBody) {
      Array.prototype.forEach.call(
        deps.schoolTableBody.querySelectorAll("tr[data-school-id]"),
        function (row) {
          row.classList.toggle(
            "is-selected",
            Number(row.getAttribute("data-school-id") || 0) === id,
          );
        },
      );
    }
    return out;
  }

  function openLevelDialog(editItem) {
    if (!deps.levelDialogForm || !deps.levelDialog) return;
    deps.levelDialogForm.reset();
    deps.levelDialogForm.elements.namedItem("id").value = editItem
      ? String(editItem.id || "")
      : "";
    deps.levelDialogForm.elements.namedItem("name").value = editItem
      ? String(editItem.name || "")
      : "";
    if (deps.levelDialogTitle) {
      deps.levelDialogTitle.textContent = editItem
        ? "Ubah Jenjang"
        : "Tambah Jenjang";
    }
    if (typeof deps.levelDialog.showModal === "function")
      deps.levelDialog.showModal();
  }

  function openSchoolDialog(editItem) {
    if (!deps.schoolDialogForm || !deps.schoolDialog) return;
    deps.schoolDialogForm.reset();
    deps.schoolDialogForm.elements.namedItem("id").value = editItem
      ? String(editItem.id || "")
      : "";
    deps.schoolDialogForm.elements.namedItem("name").value = editItem
      ? String(editItem.name || "")
      : "";
    deps.schoolDialogForm.elements.namedItem("code").value = editItem
      ? String(editItem.code || "")
      : "";
    deps.schoolDialogForm.elements.namedItem("city").value = editItem
      ? String(editItem.city || "")
      : "";
    deps.schoolDialogForm.elements.namedItem("province").value = editItem
      ? String(editItem.province || "")
      : "";
    if (deps.schoolDialogForm.elements.namedItem("kecamatan")) {
      deps.schoolDialogForm.elements.namedItem("kecamatan").value = editItem
        ? String(editItem.kecamatan || "")
        : "";
    }
    if (deps.schoolDialogForm.elements.namedItem("jenjang")) {
      deps.schoolDialogForm.elements.namedItem("jenjang").value = editItem
        ? String(editItem.jenjang || "")
        : "";
    }
    if (deps.schoolDialogForm.elements.namedItem("status_sekolah")) {
      deps.schoolDialogForm.elements.namedItem("status_sekolah").value =
        editItem ? String(editItem.status_sekolah || "") : "";
    }
    if (deps.schoolDialogForm.elements.namedItem("school_email")) {
      deps.schoolDialogForm.elements.namedItem("school_email").value = editItem
        ? String(editItem.school_email || "")
        : "";
    }
    deps.schoolDialogForm.elements.namedItem("address").value = editItem
      ? String(editItem.address || "")
      : "";
    if (deps.schoolDialogTitle) {
      deps.schoolDialogTitle.textContent = editItem
        ? "Ubah Sekolah"
        : "Tambah Sekolah";
    }
    if (typeof deps.schoolDialog.showModal === "function")
      deps.schoolDialog.showModal();
  }

  function openClassDialog(editItem) {
    if (!deps.classDialogForm || !deps.classDialog) return;
    deps.classDialogForm.reset();
    const schoolSelect = deps.classDialogForm.elements.namedItem("school_id");
    fillSchoolSelectRequired(schoolSelect, editItem ? editItem.school_id : 0);
    deps.classDialogForm.elements.namedItem("id").value = editItem
      ? String(editItem.id || "")
      : "";
    deps.classDialogForm.elements.namedItem("grade_level").value = editItem
      ? String(editItem.grade_level || "")
      : "";
    deps.classDialogForm.elements.namedItem("name").value = editItem
      ? String(editItem.name || "")
      : "";
    if (deps.classDialogTitle) {
      deps.classDialogTitle.textContent = editItem
        ? "Ubah Kelas"
        : "Tambah Kelas";
    }
    if (typeof deps.classDialog.showModal === "function")
      deps.classDialog.showModal();
  }

  function openDeleteDialog(entity, id, label) {
    if (!deps.masterDeleteForm || !deps.masterDeleteDialog) return;
    deps.masterDeleteForm.reset();
    deps.masterDeleteForm.elements.namedItem("entity").value = entity;
    deps.masterDeleteForm.elements.namedItem("id").value = String(id);
    if (deps.masterDeleteLabel) deps.masterDeleteLabel.textContent = label;
    if (typeof deps.masterDeleteDialog.showModal === "function")
      deps.masterDeleteDialog.showModal();
  }

  async function downloadClassImportTemplateCSV() {
    const res = await fetch("/api/v1/admin/imports/classes/template", {
      method: "GET",
      credentials: "include",
    });
    if (!res.ok) {
      const errJSON = await res.json().catch(function () {
        return {};
      });
      const msg = deps.extractAPIError(
        errJSON,
        res.statusText || "Request failed",
      );
      throw new Error(msg);
    }
    const blob = await res.blob();
    const filename = (function () {
      const disposition = res.headers.get("Content-Disposition");
      const src = String(disposition || "");
      const utfMatch = src.match(/filename\*=UTF-8''([^;]+)/i);
      if (utfMatch && utfMatch[1]) {
        try {
          return decodeURIComponent(utfMatch[1]);
        } catch (_) {
          return utfMatch[1];
        }
      }
      const basicMatch = src.match(/filename="?([^";]+)"?/i);
      if (basicMatch && basicMatch[1]) return basicMatch[1];
      return "template_import_kelas.csv";
    })();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }

  function bindHandlers() {
    if (!deps) return;

    if (deps.classImportTemplateBtn) {
      deps.classImportTemplateBtn.addEventListener("click", async function () {
        const done = deps.beginBusy(
          deps.classImportTemplateBtn,
          deps.message,
          "Menyiapkan template import kelas...",
        );
        try {
          await downloadClassImportTemplateCSV();
          deps.setMsg("Template import kelas berhasil diunduh.");
        } catch (err) {
          deps.setMsg("Gagal mengunduh template kelas: " + err.message);
        } finally {
          done();
        }
      });
    }
    if (deps.classImportBtn && deps.isAdmin()) {
      deps.classImportBtn.addEventListener("click", function () {
        if (
          deps.classImportDialog &&
          typeof deps.classImportDialog.showModal === "function"
        ) {
          if (deps.classImportForm) deps.classImportForm.reset();
          deps.classImportDialog.showModal();
        }
      });
    }
    if (deps.classImportCancelBtn) {
      deps.classImportCancelBtn.addEventListener("click", function () {
        if (
          deps.classImportDialog &&
          typeof deps.classImportDialog.close === "function"
        ) {
          deps.classImportDialog.close();
        }
      });
    }
    if (deps.classImportForm) {
      deps.classImportForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(deps.classImportForm);
        const file = fd.get("file");
        if (!file || !file.name) {
          deps.setMsg("File CSV kelas wajib dipilih.");
          return;
        }
        const done = deps.beginBusy(
          deps.classImportForm,
          deps.message,
          "Mengimpor data kelas CSV...",
        );
        try {
          const out = await deps.apiMultipart(
            "/api/v1/admin/imports/classes",
            "POST",
            fd,
          );
          if (deps.masterOut)
            deps.masterOut.textContent = JSON.stringify(out, null, 2);
          const report =
            out && out.report && typeof out.report === "object"
              ? out.report
              : {};
          const failed = Number(report.failed_rows || 0);
          const success = Number(report.success_rows || 0);
          const created = Number(report.created_rows || 0);
          const updated = Number(report.updated_rows || 0);
          if (failed > 0) {
            const errors = Array.isArray(report.errors) ? report.errors : [];
            const details = errors.length
              ? errors
                  .slice(0, 10)
                  .map(function (it) {
                    const row = Number(it.row || 0);
                    const schoolName = String(it.school_name || "").trim();
                    const className = String(it.class_name || "").trim();
                    const errMsg = String(it.error || "error tidak diketahui");
                    const label =
                      schoolName && className
                        ? schoolName + " / " + className
                        : className || schoolName;
                    if (label) {
                      return (
                        "Baris " + String(row) + " | " + label + " | " + errMsg
                      );
                    }
                    return "Baris " + String(row) + " | " + errMsg;
                  })
                  .join("\n")
              : "Ada baris gagal, tetapi detail tidak tersedia.";
            window.alert(
              "Import kelas memiliki kesalahan.\n\n" +
                details +
                (errors.length > 10
                  ? "\n\nDan " + String(errors.length - 10) + " error lainnya."
                  : ""),
            );
            deps.setMsg(
              "Import kelas selesai dengan peringatan. Berhasil: " +
                String(success) +
                ", dibuat: " +
                String(created) +
                ", diperbarui: " +
                String(updated) +
                ", gagal: " +
                String(failed) +
                ".",
            );
          } else {
            deps.setMsg(
              "Import kelas berhasil. Total diimport: " +
                String(success) +
                " (dibuat: " +
                String(created) +
                ", diperbarui: " +
                String(updated) +
                ").",
            );
            deps.classImportForm.reset();
            if (
              deps.classImportDialog &&
              typeof deps.classImportDialog.close === "function"
            ) {
              deps.classImportDialog.close();
            }
          }
          await loadMasterSummaryTable();
        } catch (err) {
          window.alert("Gagal import kelas: " + String(err.message || ""));
          deps.setMsg("Gagal impor kelas CSV: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (deps.levelAddBtn && deps.isAdmin()) {
      deps.levelAddBtn.addEventListener("click", function () {
        openLevelDialog(null);
      });
    }
    if (deps.schoolAddBtn && deps.isAdmin()) {
      deps.schoolAddBtn.addEventListener("click", function () {
        openSchoolDialog(null);
      });
    }
    if (deps.classAddBtn && deps.isAdmin()) {
      deps.classAddBtn.addEventListener("click", function () {
        openClassDialog(null);
      });
    }

    if (deps.levelDialogCancelBtn) {
      deps.levelDialogCancelBtn.addEventListener("click", function () {
        if (deps.levelDialog && typeof deps.levelDialog.close === "function") {
          deps.levelDialog.close();
        }
      });
    }
    if (deps.schoolDialogCancelBtn) {
      deps.schoolDialogCancelBtn.addEventListener("click", function () {
        if (
          deps.schoolDialog &&
          typeof deps.schoolDialog.close === "function"
        ) {
          deps.schoolDialog.close();
        }
      });
    }
    if (deps.classDialogCancelBtn) {
      deps.classDialogCancelBtn.addEventListener("click", function () {
        if (deps.classDialog && typeof deps.classDialog.close === "function") {
          deps.classDialog.close();
        }
      });
    }
    if (deps.masterDeleteCancelBtn) {
      deps.masterDeleteCancelBtn.addEventListener("click", function () {
        if (
          deps.masterDeleteDialog &&
          typeof deps.masterDeleteDialog.close === "function"
        ) {
          deps.masterDeleteDialog.close();
        }
      });
    }

    if (deps.masterRefreshBtn) {
      deps.masterRefreshBtn.addEventListener("click", async function () {
        const done = deps.beginBusy(
          deps.masterRefreshBtn,
          deps.message,
          "Memuat ulang data master...",
        );
        try {
          await loadMasterSummaryTable();
          setMasterMsg("Data master berhasil dimuat.");
        } catch (err) {
          setMasterMsg("Gagal memuat data master: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (deps.levelTableBody) {
      deps.levelTableBody.addEventListener("click", function (e) {
        const btn =
          e.target &&
          e.target.closest(
            "button[data-master-entity][data-master-action][data-id]",
          );
        if (!btn || !deps.isAdmin()) return;
        const id = Number(btn.getAttribute("data-id") || 0);
        const action = String(btn.getAttribute("data-master-action") || "");
        const item = masterSummaryState.levelsByID[String(id)];
        if (!id || !item) return;
        if (action === "edit") {
          openLevelDialog(item);
        } else if (action === "delete") {
          openDeleteDialog(
            "level",
            id,
            "Hapus jenjang " + String(item.name || "") + "?",
          );
        }
      });
    }

    if (deps.schoolTableBody) {
      deps.schoolTableBody.addEventListener("click", function (e) {
        const btn =
          e.target &&
          e.target.closest(
            "button[data-master-entity][data-master-action][data-id]",
          );
        if (btn) {
          if (!deps.isAdmin()) return;
          const id = Number(btn.getAttribute("data-id") || 0);
          const action = String(btn.getAttribute("data-master-action") || "");
          const item = masterSummaryState.schoolsByID[String(id)];
          if (!id || !item) return;
          if (action === "edit") {
            openSchoolDialog(item);
          } else if (action === "delete") {
            openDeleteDialog(
              "school",
              id,
              "Hapus sekolah " + String(item.name || "") + "?",
            );
          }
          return;
        }

        const row = e.target && e.target.closest("tr[data-school-id]");
        if (!row) return;
        const id = Number(row.getAttribute("data-school-id") || 0);
        if (id <= 0) return;
        loadSchoolUserStats(id).catch(function (err) {
          renderSchoolStatsPlaceholder(
            "Gagal memuat jumlah pengguna sekolah: " + err.message,
          );
          setMasterMsg("Gagal memuat statistik sekolah: " + err.message);
        });
      });
    }

    if (deps.schoolStatsPanel && !deps.schoolStatsPanel.hidden) {
      renderSchoolStatsPlaceholder(
        "Klik baris sekolah untuk melihat jumlah pengguna.",
      );
    } else if (deps.schoolStatsPanel) {
      deps.schoolStatsPanel.hidden = false;
      renderSchoolStatsPlaceholder(
        "Klik baris sekolah untuk melihat jumlah pengguna.",
      );
    }

    if (deps.classTableBody) {
      deps.classTableBody.addEventListener("click", function (e) {
        const btn =
          e.target &&
          e.target.closest(
            "button[data-master-entity][data-master-action][data-id]",
          );
        if (!btn || !deps.isAdmin()) return;
        const id = Number(btn.getAttribute("data-id") || 0);
        const action = String(btn.getAttribute("data-master-action") || "");
        const item = masterSummaryState.classesByID[String(id)];
        if (!id || !item) return;
        if (action === "edit") {
          openClassDialog(item);
        } else if (action === "delete") {
          openDeleteDialog(
            "class",
            id,
            "Hapus kelas " + String(item.name || "") + "?",
          );
        }
      });
    }

    if (deps.isAdmin() && deps.levelDialogForm) {
      deps.levelDialogForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(deps.levelDialogForm);
        const id = Number(fd.get("id") || 0);
        const name = String(fd.get("name") || "").trim();
        const done = deps.beginBusy(
          deps.levelDialogForm,
          deps.message,
          "Menyimpan jenjang...",
        );
        try {
          if (id > 0) {
            await deps.api("/api/v1/admin/levels/" + id, "PUT", { name: name });
            setMasterMsg("Jenjang berhasil diperbarui.");
          } else {
            await deps.api("/api/v1/admin/levels", "POST", { name: name });
            setMasterMsg("Jenjang berhasil ditambahkan.");
          }
          if (
            deps.levelDialog &&
            typeof deps.levelDialog.close === "function"
          ) {
            deps.levelDialog.close();
          }
          await loadMasterSummaryTable();
        } catch (err) {
          setMasterMsg("Simpan jenjang gagal: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (deps.isAdmin() && deps.schoolDialogForm) {
      deps.schoolDialogForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(deps.schoolDialogForm);
        const id = Number(fd.get("id") || 0);
        const payload = {
          name: String(fd.get("name") || "").trim(),
          code: String(fd.get("code") || "").trim(),
          city: String(fd.get("city") || "").trim(),
          province: String(fd.get("province") || "").trim(),
          kecamatan: String(fd.get("kecamatan") || "").trim(),
          jenjang: String(fd.get("jenjang") || "").trim(),
          status_sekolah: String(fd.get("status_sekolah") || "").trim(),
          school_email: String(fd.get("school_email") || "").trim(),
          address: String(fd.get("address") || "").trim(),
        };
        const done = deps.beginBusy(
          deps.schoolDialogForm,
          deps.message,
          "Menyimpan sekolah...",
        );
        try {
          if (id > 0) {
            await deps.api("/api/v1/admin/schools/" + id, "PUT", payload);
            setMasterMsg("Sekolah berhasil diperbarui.");
          } else {
            await deps.api("/api/v1/admin/schools", "POST", payload);
            setMasterMsg("Sekolah berhasil ditambahkan.");
          }
          if (
            deps.schoolDialog &&
            typeof deps.schoolDialog.close === "function"
          ) {
            deps.schoolDialog.close();
          }
          await loadMasterSummaryTable();
          await deps.loadDashboardStats();
          await deps.loadSchoolsForUserForms();
        } catch (err) {
          setMasterMsg("Simpan sekolah gagal: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (deps.isAdmin() && deps.classDialogForm) {
      deps.classDialogForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(deps.classDialogForm);
        const id = Number(fd.get("id") || 0);
        const payload = {
          school_id: Number(fd.get("school_id") || 0),
          grade_level: String(fd.get("grade_level") || "").trim(),
          name: String(fd.get("name") || "").trim(),
        };
        const done = deps.beginBusy(
          deps.classDialogForm,
          deps.message,
          "Menyimpan kelas...",
        );
        try {
          if (id > 0) {
            await deps.api("/api/v1/admin/classes/" + id, "PUT", payload);
            setMasterMsg("Kelas berhasil diperbarui.");
          } else {
            await deps.api("/api/v1/admin/classes", "POST", payload);
            setMasterMsg("Kelas berhasil ditambahkan.");
          }
          if (
            deps.classDialog &&
            typeof deps.classDialog.close === "function"
          ) {
            deps.classDialog.close();
          }
          await loadMasterSummaryTable();
        } catch (err) {
          setMasterMsg("Simpan kelas gagal: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (deps.isAdmin() && deps.masterDeleteForm) {
      deps.masterDeleteForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(deps.masterDeleteForm);
        const entity = String(fd.get("entity") || "");
        const id = Number(fd.get("id") || 0);
        if (!entity || !id) return;
        const done = deps.beginBusy(
          deps.masterDeleteForm,
          deps.message,
          "Menghapus data...",
        );
        try {
          if (entity === "level") {
            await deps.api("/api/v1/admin/levels/" + id, "DELETE", {});
            setMasterMsg("Jenjang berhasil dihapus.");
          } else if (entity === "school") {
            await deps.api("/api/v1/admin/schools/" + id, "DELETE", {});
            setMasterMsg("Sekolah berhasil dihapus.");
          } else if (entity === "class") {
            await deps.api("/api/v1/admin/classes/" + id, "DELETE", {});
            setMasterMsg("Kelas berhasil dihapus.");
          }
          if (
            deps.masterDeleteDialog &&
            typeof deps.masterDeleteDialog.close === "function"
          ) {
            deps.masterDeleteDialog.close();
          }
          await loadMasterSummaryTable();
          await deps.loadDashboardStats();
          await deps.loadSchoolsForUserForms();
          await deps.loadUsers();
        } catch (err) {
          setMasterMsg("Hapus data gagal: " + err.message);
        } finally {
          done();
        }
      });
    }
  }

  function init(opts) {
    setDeps(opts);
    bindHandlers();
  }

  window.AdminMaster = {
    init: init,
    loadMasterSummaryTable: loadMasterSummaryTable,
  };
})();
