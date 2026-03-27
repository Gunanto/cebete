(function () {
  var deps = null;
  var currentRole = "";
  var currentQuery = "";
  var currentLimit = 50;
  var currentOffset = 0;
  var lastLoadedCount = 0;
  var usersByID = {};
  var schoolsCache = [];
  var classCacheBySchool = {};
  var filterDebounceTimer = null;

  function setDeps(opts) {
    deps = opts || {};
  }

  function pretty(el, data) {
    if (el) el.textContent = JSON.stringify(data, null, 2);
  }

  function toNullableNumber(input) {
    const n = Number(input || 0);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  }

  function isStudentRole(role) {
    return (
      String(role || "")
        .trim()
        .toLowerCase() === "siswa"
    );
  }

  function isProktorRole(role) {
    return (
      String(role || "")
        .trim()
        .toLowerCase() === "proktor"
    );
  }

  function schoolLabel(it) {
    const name = String((it && it.name) || "").trim();
    const code = String((it && it.code) || "").trim();
    if (!name) return "-";
    return code ? name + " (" + code + ")" : name;
  }

  function classLabel(it) {
    const name = String((it && it.name) || "").trim();
    const grade = String((it && it.grade_level) || "").trim();
    if (!name) return "-";
    return grade ? grade + " - " + name : name;
  }

  function resetClassSelect(selectEl, placeholder) {
    if (!selectEl) return;
    selectEl.innerHTML = "";
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = placeholder || "Pilih Sekolah Dulu";
    selectEl.appendChild(opt);
    selectEl.disabled = true;
  }

  function fillSchoolSelect(selectEl, selectedID) {
    if (!selectEl) return;
    const selected = Number(selectedID || 0);
    selectEl.innerHTML = "";
    const emptyOpt = document.createElement("option");
    emptyOpt.value = "";
    emptyOpt.textContent = "Tanpa Sekolah";
    selectEl.appendChild(emptyOpt);
    schoolsCache.forEach(function (it) {
      const opt = document.createElement("option");
      opt.value = String(it.id);
      opt.textContent = schoolLabel(it);
      if (selected > 0 && Number(it.id) === selected) opt.selected = true;
      selectEl.appendChild(opt);
    });
  }

  function fillManagedSchoolSelect(selectEl, selectedIDs) {
    if (!selectEl) return;
    const selected = Array.isArray(selectedIDs)
      ? selectedIDs.map(function (it) {
          return String(it);
        })
      : [];
    selectEl.innerHTML = "";
    schoolsCache.forEach(function (it) {
      const opt = document.createElement("option");
      opt.value = String(it.id);
      opt.textContent = schoolLabel(it);
      if (selected.indexOf(String(it.id)) >= 0) opt.selected = true;
      selectEl.appendChild(opt);
    });
  }

  function getMultiSelectValues(selectEl) {
    if (!selectEl || !selectEl.options) return [];
    return Array.from(selectEl.options)
      .filter(function (opt) {
        return opt.selected && String(opt.value || "").trim() !== "";
      })
      .map(function (opt) {
        return Number(opt.value);
      })
      .filter(function (n) {
        return Number.isFinite(n) && n > 0;
      });
  }

  function schoolCodeByID(schoolID) {
    const sid = Number(schoolID || 0);
    if (sid <= 0) return "";
    const found = schoolsCache.find(function (it) {
      return Number((it && it.id) || 0) === sid;
    });
    if (!found) return "";
    return String((found && found.code) || "").trim();
  }

  function syncSchoolCodeDisplay(formEl) {
    if (!formEl || !formEl.elements) return;
    const schoolEl = formEl.elements.namedItem("school_id");
    const codeEl = formEl.elements.namedItem("school_code_display");
    if (!schoolEl || !codeEl) return;
    codeEl.value = schoolCodeByID(schoolEl.value);
  }

  function fillClassSelect(selectEl, classes, selectedID) {
    if (!selectEl) return;
    const selected = Number(selectedID || 0);
    selectEl.innerHTML = "";
    const emptyOpt = document.createElement("option");
    emptyOpt.value = "";
    emptyOpt.textContent = "Tanpa Kelas";
    selectEl.appendChild(emptyOpt);
    (classes || []).forEach(function (it) {
      const opt = document.createElement("option");
      opt.value = String(it.id);
      opt.textContent = classLabel(it);
      if (selected > 0 && Number(it.id) === selected) opt.selected = true;
      selectEl.appendChild(opt);
    });
    selectEl.disabled = false;
  }

  function applyUserFormRoleRequirements(formEl) {
    if (!formEl) return;
    const roleEl = formEl.elements.namedItem("role");
    const schoolEl = formEl.elements.namedItem("school_id");
    const classEl = formEl.elements.namedItem("class_id");
    const participantNoEl = formEl.elements.namedItem("participant_no");
    const nisnEl = formEl.elements.namedItem("nisn");
    const managedSchoolsEl = formEl.elements.namedItem("managed_school_ids");
    if (!roleEl || !schoolEl || !classEl) return;

    const mustHaveClass = isStudentRole(roleEl.value);
    schoolEl.required = mustHaveClass;
    classEl.required = mustHaveClass;
    if (participantNoEl) participantNoEl.required = mustHaveClass;
    if (nisnEl) nisnEl.required = mustHaveClass;
    if (managedSchoolsEl)
      managedSchoolsEl.required = isProktorRole(roleEl.value);

    const schoolLabel = schoolEl.closest("label");
    const classLabel = classEl.closest("label");
    const participantNoLabel = participantNoEl
      ? participantNoEl.closest("label")
      : null;
    const nisnLabel = nisnEl ? nisnEl.closest("label") : null;
    const schoolCodeEl = formEl.elements.namedItem("school_code_display");
    const schoolCodeLabel = schoolCodeEl ? schoolCodeEl.closest("label") : null;
    const managedSchoolsLabel = managedSchoolsEl
      ? managedSchoolsEl.closest("label")
      : null;
    if (schoolLabel) {
      schoolLabel.dataset.requiredRole = mustHaveClass ? "siswa" : "";
    }
    if (classLabel) {
      classLabel.dataset.requiredRole = mustHaveClass ? "siswa" : "";
    }
    if (participantNoLabel) {
      participantNoLabel.dataset.requiredRole = mustHaveClass ? "siswa" : "";
    }
    if (nisnLabel) {
      nisnLabel.dataset.requiredRole = mustHaveClass ? "siswa" : "";
    }
    if (schoolCodeLabel) {
      schoolCodeLabel.dataset.requiredRole = mustHaveClass ? "siswa" : "";
    }
    if (managedSchoolsLabel) {
      managedSchoolsLabel.hidden = !isProktorRole(roleEl.value);
      managedSchoolsLabel.dataset.requiredRole = isProktorRole(roleEl.value)
        ? "proktor"
        : "";
    }
  }

  function pickFirstClassIfAny(selectEl) {
    if (!selectEl || selectEl.disabled) return;
    if (selectEl.value) return;
    const firstClassOption = Array.from(selectEl.options || []).find(
      function (opt) {
        return String(opt.value || "").trim() !== "";
      },
    );
    if (firstClassOption) {
      selectEl.value = String(firstClassOption.value);
    }
  }

  async function loadSchoolsForUserForms() {
    const out = await deps.api("/api/v1/admin/schools?all=1", "GET");
    schoolsCache = Array.isArray(out) ? out : [];
  }

  async function loadClassesBySchool(schoolID) {
    const sid = Number(schoolID || 0);
    if (sid <= 0) return [];
    if (Array.isArray(classCacheBySchool[String(sid)])) {
      return classCacheBySchool[String(sid)];
    }
    const out = await deps.api(
      "/api/v1/admin/classes?all=1&school_id=" +
        encodeURIComponent(String(sid)),
      "GET",
    );
    const items = Array.isArray(out) ? out : [];
    classCacheBySchool[String(sid)] = items;
    return items;
  }

  function parseDownloadFilename(disposition, fallback) {
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
    return fallback;
  }

  async function exportUsersExcelFile() {
    const params = new URLSearchParams();
    if (currentRole) params.set("role", currentRole);
    if (currentQuery) params.set("q", currentQuery);
    const qs = params.toString() ? "?" + params.toString() : "";
    const res = await fetch("/api/v1/admin/users/export" + qs, {
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
    const filename = parseDownloadFilename(
      res.headers.get("Content-Disposition"),
      "daftar_pengguna.xlsx",
    );
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }

  async function downloadImportTemplateExcel() {
    const res = await fetch("/api/v1/admin/users/import-template", {
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
    const filename = parseDownloadFilename(
      res.headers.get("Content-Disposition"),
      "template_import_pengguna.xlsx",
    );
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }

  async function loadUsers() {
    const params = new URLSearchParams();
    params.set("limit", String(currentLimit));
    params.set("offset", String(currentOffset));
    if (currentRole) params.set("role", currentRole);
    if (currentQuery) params.set("q", currentQuery);
    const out = await deps.api(
      "/api/v1/admin/users?" + params.toString(),
      "GET",
    );
    pretty(deps.regOut, out);
    const items = Array.isArray(out.items) ? out.items : [];
    lastLoadedCount = items.length;
    deps.text(
      deps.regSummary,
      "Peran: " +
        (out.role || "semua") +
        " | Pencarian: " +
        (out.q || "-") +
        " | Data dimuat: " +
        String(items.length),
    );
    if (deps.pageInfo) {
      const start = items.length ? currentOffset + 1 : currentOffset;
      const end = currentOffset + items.length;
      deps.text(deps.pageInfo, "Baris " + String(start) + " - " + String(end));
    }
    if (deps.prevPageBtn) deps.prevPageBtn.disabled = currentOffset <= 0;
    if (deps.nextPageBtn)
      deps.nextPageBtn.disabled = items.length < currentLimit;
    if (!deps.regBody) return;
    if (!items.length) {
      deps.regBody.innerHTML =
        '<tr><td colspan="11" class="muted">Tidak ada data pengguna.</td></tr>';
      return;
    }
    deps.regBody.innerHTML = "";
    Object.keys(usersByID).forEach(function (k) {
      delete usersByID[k];
    });
    items.forEach(function (it) {
      usersByID[String(it.id || "")] = it;
      const tr = document.createElement("tr");
      const detailBtn =
        '<button class="icon-only-btn" type="button" data-action="detail" data-id="' +
        deps.escapeHtml(String(it.id || "")) +
        '" title="Lihat detil" aria-label="Lihat detil">' +
        '<svg viewBox="0 0 24 24" focusable="false"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.5"/></svg></button>';
      const editBtn =
        '<button class="icon-only-btn" type="button" data-action="edit" data-id="' +
        deps.escapeHtml(String(it.id || "")) +
        '" title="Ubah pengguna" aria-label="Ubah pengguna">' +
        '<svg viewBox="0 0 24 24" focusable="false"><path d="M4 20h4l10-10-4-4L4 16v4z"/><path d="M12 6l4 4"/></svg></button>';
      const disableBtn =
        '<button class="icon-only-btn danger" type="button" data-action="deactivate" data-id="' +
        deps.escapeHtml(String(it.id || "")) +
        '" title="Hapus pengguna" aria-label="Hapus pengguna">' +
        '<svg viewBox="0 0 24 24" focusable="false"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg></button>';
      const actionIcons = deps.isAdmin()
        ? '<span class="action-icons">' +
          detailBtn +
          editBtn +
          disableBtn +
          "</span>"
        : '<span class="action-icons">' + detailBtn + "</span>";
      tr.innerHTML = [
        "<td>" + deps.escapeHtml(String(it.id || "")) + "</td>",
        "<td>" + deps.escapeHtml(it.username || "") + "</td>",
        "<td>" + deps.escapeHtml(it.full_name || "") + "</td>",
        "<td>" + deps.escapeHtml(it.role || "") + "</td>",
        "<td>" + deps.escapeHtml(it.school_name || "-") + "</td>",
        "<td>" + deps.escapeHtml(it.school_city || "-") + "</td>",
        "<td>" + deps.escapeHtml(it.participant_no || "-") + "</td>",
        "<td>" + deps.escapeHtml(it.email || "") + "</td>",
        "<td>" + deps.escapeHtml(it.account_status || "") + "</td>",
        "<td>" + deps.escapeHtml(deps.fmtDate(it.created_at)) + "</td>",
        "<td>" + actionIcons + "</td>",
      ].join("");
      deps.regBody.appendChild(tr);
    });
  }

  function bindHandlers() {
    if (!deps) return;

    if (deps.regFilterForm) {
      const triggerFilterSubmit = function () {
        if (typeof deps.regFilterForm.requestSubmit === "function") {
          deps.regFilterForm.requestSubmit();
          return;
        }
        deps.regFilterForm.dispatchEvent(
          new Event("submit", { cancelable: true, bubbles: true }),
        );
      };

      deps.regFilterForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(deps.regFilterForm);
        currentRole = String(fd.get("role") || "").trim();
        currentQuery = String(fd.get("q") || "").trim();
        currentLimit = Number(fd.get("limit") || 50);
        currentOffset = 0;
        const done = deps.beginBusy(
          deps.regFilterForm,
          deps.message,
          "Memuat daftar pengguna...",
        );
        try {
          await loadUsers();
          deps.setMsg("Daftar pengguna berhasil dimuat.");
        } catch (err) {
          deps.setMsg("Gagal memuat pengguna: " + err.message);
        } finally {
          done();
        }
      });

      const roleInput = deps.regFilterForm.elements.namedItem("role");
      if (roleInput) {
        roleInput.addEventListener("change", function () {
          currentOffset = 0;
          triggerFilterSubmit();
        });
      }

      const qInput = deps.regFilterForm.elements.namedItem("q");
      if (qInput) {
        qInput.addEventListener("input", function () {
          if (filterDebounceTimer) window.clearTimeout(filterDebounceTimer);
          filterDebounceTimer = window.setTimeout(function () {
            currentOffset = 0;
            triggerFilterSubmit();
          }, 350);
        });
      }
    }

    if (deps.prevPageBtn) {
      deps.prevPageBtn.addEventListener("click", async function () {
        if (currentOffset <= 0) return;
        currentOffset = Math.max(0, currentOffset - currentLimit);
        const done = deps.beginBusy(
          deps.prevPageBtn,
          deps.message,
          "Memuat halaman sebelumnya...",
        );
        try {
          await loadUsers();
          deps.setMsg("Halaman sebelumnya dimuat.");
        } catch (err) {
          deps.setMsg("Gagal pindah halaman: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (deps.nextPageBtn) {
      deps.nextPageBtn.addEventListener("click", async function () {
        if (lastLoadedCount < currentLimit) return;
        currentOffset += currentLimit;
        const done = deps.beginBusy(
          deps.nextPageBtn,
          deps.message,
          "Memuat halaman berikutnya...",
        );
        try {
          await loadUsers();
          deps.setMsg("Halaman berikutnya dimuat.");
        } catch (err) {
          currentOffset = Math.max(0, currentOffset - currentLimit);
          deps.setMsg("Gagal pindah halaman: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (deps.addUserBtn) {
      deps.addUserBtn.hidden = !deps.isAdmin();
      deps.addUserBtn.addEventListener("click", function () {
        if (!deps.isAdmin()) return;
        if (deps.userCreateForm) {
          deps.userCreateForm.reset();
          applyUserFormRoleRequirements(deps.userCreateForm);
          fillSchoolSelect(deps.userCreateForm.elements.namedItem("school_id"));
          fillManagedSchoolSelect(
            deps.userCreateForm.elements.namedItem("managed_school_ids"),
            [],
          );
          syncSchoolCodeDisplay(deps.userCreateForm);
          resetClassSelect(
            deps.userCreateForm.elements.namedItem("class_id"),
            "Pilih Sekolah Dulu",
          );
        }
        if (
          deps.userCreateDialog &&
          typeof deps.userCreateDialog.showModal === "function"
        ) {
          deps.userCreateDialog.showModal();
        }
      });
    }

    if (deps.exportUsersBtn) {
      deps.exportUsersBtn.hidden = !deps.isAdmin();
      deps.exportUsersBtn.addEventListener("click", async function () {
        if (!deps.isAdmin()) return;
        const done = deps.beginBusy(
          deps.exportUsersBtn,
          deps.message,
          "Menyiapkan file Excel pengguna...",
        );
        try {
          await exportUsersExcelFile();
          deps.setMsg("Ekspor pengguna selesai.");
        } catch (err) {
          deps.setMsg("Gagal ekspor pengguna: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (deps.importUsersBtn) {
      deps.importUsersBtn.hidden = !deps.isAdmin();
      deps.importUsersBtn.addEventListener("click", function () {
        if (!deps.isAdmin()) return;
        if (deps.userImportForm) deps.userImportForm.reset();
        if (deps.userImportOut) deps.userImportOut.textContent = "";
        if (
          deps.userImportDialog &&
          typeof deps.userImportDialog.showModal === "function"
        ) {
          deps.userImportDialog.showModal();
        }
      });
    }

    if (deps.userImportTemplateBtn) {
      deps.userImportTemplateBtn.hidden = !deps.isAdmin();
      deps.userImportTemplateBtn.addEventListener("click", async function () {
        if (!deps.isAdmin()) return;
        const done = deps.beginBusy(
          deps.userImportTemplateBtn,
          deps.message,
          "Menyiapkan template import pengguna...",
        );
        try {
          await downloadImportTemplateExcel();
          deps.setMsg("Template import berhasil diunduh.");
        } catch (err) {
          deps.setMsg("Gagal mengunduh template import: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (deps.userImportCancelBtn) {
      deps.userImportCancelBtn.addEventListener("click", function () {
        if (
          deps.userImportDialog &&
          typeof deps.userImportDialog.close === "function"
        ) {
          deps.userImportDialog.close();
        }
      });
    }

    if (deps.userImportErrorCloseBtn) {
      deps.userImportErrorCloseBtn.addEventListener("click", function () {
        if (
          deps.userImportErrorDialog &&
          typeof deps.userImportErrorDialog.close === "function"
        ) {
          deps.userImportErrorDialog.close();
        }
      });
    }

    if (deps.userCreateCancelBtn) {
      deps.userCreateCancelBtn.addEventListener("click", function () {
        if (
          deps.userCreateDialog &&
          typeof deps.userCreateDialog.close === "function"
        ) {
          deps.userCreateDialog.close();
        }
      });
    }

    if (deps.userUpdateCancelBtn) {
      deps.userUpdateCancelBtn.addEventListener("click", function () {
        if (
          deps.userUpdateDialog &&
          typeof deps.userUpdateDialog.close === "function"
        ) {
          deps.userUpdateDialog.close();
        }
      });
    }

    if (deps.userDeleteCancelBtn) {
      deps.userDeleteCancelBtn.addEventListener("click", function () {
        if (
          deps.userDeleteDialog &&
          typeof deps.userDeleteDialog.close === "function"
        ) {
          deps.userDeleteDialog.close();
        }
      });
    }

    if (deps.regBody) {
      deps.regBody.addEventListener("click", function (e) {
        const btn =
          e.target && e.target.closest("button[data-action][data-id]");
        if (!btn) return;
        const action = String(btn.getAttribute("data-action") || "");
        const id = String(btn.getAttribute("data-id") || "");
        const userItem = usersByID[id];
        if (!userItem) return;

        if (action === "detail") {
          if (deps.userDetailOut)
            deps.userDetailOut.textContent = JSON.stringify(userItem, null, 2);
          if (
            deps.userDetailDialog &&
            typeof deps.userDetailDialog.showModal === "function"
          ) {
            deps.userDetailDialog.showModal();
          }
          return;
        }

        if (!deps.isAdmin()) return;

        if (action === "edit") {
          if (deps.userUpdateForm) {
            deps.userUpdateForm.elements.namedItem("id").value = String(
              userItem.id || "",
            );
            deps.userUpdateForm.elements.namedItem("full_name").value = String(
              userItem.full_name || "",
            );
            deps.userUpdateForm.elements.namedItem("email").value = String(
              userItem.email || "",
            );
            deps.userUpdateForm.elements.namedItem("participant_no").value =
              String(userItem.participant_no || "");
            deps.userUpdateForm.elements.namedItem("nisn").value = String(
              userItem.nisn || "",
            );
            deps.userUpdateForm.elements.namedItem("role").value = String(
              userItem.role || "siswa",
            );
            applyUserFormRoleRequirements(deps.userUpdateForm);
            deps.userUpdateForm.elements.namedItem("password").value = "";
            fillSchoolSelect(
              deps.userUpdateForm.elements.namedItem("school_id"),
              userItem.school_id,
            );
            fillManagedSchoolSelect(
              deps.userUpdateForm.elements.namedItem("managed_school_ids"),
              userItem.managed_school_ids || [],
            );
            syncSchoolCodeDisplay(deps.userUpdateForm);
            const schoolID = Number(userItem.school_id || 0);
            const classID = Number(userItem.class_id || 0);
            const classSelect =
              deps.userUpdateForm.elements.namedItem("class_id");
            if (schoolID > 0) {
              loadClassesBySchool(schoolID)
                .then(function (classes) {
                  fillClassSelect(classSelect, classes, classID);
                })
                .catch(function () {
                  resetClassSelect(classSelect, "Gagal memuat kelas");
                });
            } else {
              resetClassSelect(classSelect, "Pilih Sekolah Dulu");
            }
          }
          if (
            deps.userUpdateDialog &&
            typeof deps.userUpdateDialog.showModal === "function"
          ) {
            deps.userUpdateDialog.showModal();
          }
          return;
        }

        if (action === "deactivate") {
          if (deps.userDeleteForm)
            deps.userDeleteForm.elements.namedItem("id").value = String(
              userItem.id || "",
            );
          if (deps.userDeleteLabel) {
            deps.userDeleteLabel.textContent =
              "Yakin hapus pengguna " +
              String(userItem.full_name || userItem.username || "") +
              " (ID " +
              String(userItem.id || "") +
              ")?";
          }
          if (
            deps.userDeleteDialog &&
            typeof deps.userDeleteDialog.showModal === "function"
          ) {
            deps.userDeleteDialog.showModal();
          }
        }
      });
    }

    if (deps.isAdmin() && deps.userCreateForm) {
      const createSchoolSelect =
        deps.userCreateForm.elements.namedItem("school_id");
      const createClassSelect =
        deps.userCreateForm.elements.namedItem("class_id");
      const createRoleSelect = deps.userCreateForm.elements.namedItem("role");
      if (createRoleSelect) {
        createRoleSelect.addEventListener("change", function () {
          applyUserFormRoleRequirements(deps.userCreateForm);
        });
      }
      if (createSchoolSelect && createClassSelect) {
        createSchoolSelect.addEventListener("change", function () {
          syncSchoolCodeDisplay(deps.userCreateForm);
          const sid = Number(createSchoolSelect.value || 0);
          if (sid <= 0) {
            resetClassSelect(createClassSelect, "Pilih Sekolah Dulu");
            return;
          }
          loadClassesBySchool(sid)
            .then(function (classes) {
              fillClassSelect(createClassSelect, classes);
              pickFirstClassIfAny(createClassSelect);
            })
            .catch(function () {
              resetClassSelect(createClassSelect, "Gagal memuat kelas");
            });
        });
      }

      deps.userCreateForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(deps.userCreateForm);
        const done = deps.beginBusy(
          deps.userCreateForm,
          deps.message,
          "Menyimpan pengguna...",
        );
        try {
          const schoolID = toNullableNumber(fd.get("school_id"));
          const classID = toNullableNumber(fd.get("class_id"));
          const managedSchoolIDs = getMultiSelectValues(
            deps.userCreateForm.elements.namedItem("managed_school_ids"),
          );
          const role = String(fd.get("role") || "")
            .trim()
            .toLowerCase();
          const participantNo = String(fd.get("participant_no") || "").trim();
          const nisn = String(fd.get("nisn") || "").trim();
          const schoolCode = schoolCodeByID(schoolID);
          if (isStudentRole(role) && (schoolID === null || classID === null)) {
            deps.setMsg("Untuk role siswa, sekolah dan kelas wajib dipilih.");
            return;
          }
          if (isStudentRole(role) && (!participantNo || !nisn)) {
            deps.setMsg(
              "Untuk role siswa, nomor peserta dan NISN wajib diisi.",
            );
            return;
          }
          if (isStudentRole(role) && !schoolCode) {
            deps.setMsg(
              "NPSN sekolah belum terisi. Lengkapi NPSN di menu Data Master > Sekolah.",
            );
            return;
          }
          if (schoolID !== null && classID === null) {
            deps.setMsg("Jika memilih sekolah, kelas wajib dipilih.");
            return;
          }
          if (isProktorRole(role) && !managedSchoolIDs.length) {
            deps.setMsg(
              "Untuk role proktor, pilih minimal satu sekolah kelolaan.",
            );
            return;
          }
          const out = await deps.api("/api/v1/admin/users", "POST", {
            username: String(fd.get("username") || "").trim(),
            full_name: String(fd.get("full_name") || "").trim(),
            email: String(fd.get("email") || "").trim(),
            role: String(fd.get("role") || "").trim(),
            password: String(fd.get("password") || ""),
            participant_no: participantNo,
            nisn: nisn,
            school_id: schoolID,
            class_id: classID,
            managed_school_ids: managedSchoolIDs,
          });
          pretty(deps.regOut, out);
          deps.setMsg("Pengguna berhasil dibuat.");
          deps.userCreateForm.reset();
          if (
            deps.userCreateDialog &&
            typeof deps.userCreateDialog.close === "function"
          ) {
            deps.userCreateDialog.close();
          }
          await loadUsers();
          await deps.loadDashboardStats();
        } catch (err) {
          deps.setMsg("Gagal membuat pengguna: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (deps.isAdmin() && deps.userUpdateForm) {
      const updateSchoolSelect =
        deps.userUpdateForm.elements.namedItem("school_id");
      const updateClassSelect =
        deps.userUpdateForm.elements.namedItem("class_id");
      const updateRoleSelect = deps.userUpdateForm.elements.namedItem("role");
      if (updateRoleSelect) {
        updateRoleSelect.addEventListener("change", function () {
          applyUserFormRoleRequirements(deps.userUpdateForm);
        });
      }
      if (updateSchoolSelect && updateClassSelect) {
        updateSchoolSelect.addEventListener("change", function () {
          syncSchoolCodeDisplay(deps.userUpdateForm);
          const sid = Number(updateSchoolSelect.value || 0);
          if (sid <= 0) {
            resetClassSelect(updateClassSelect, "Pilih Sekolah Dulu");
            return;
          }
          loadClassesBySchool(sid)
            .then(function (classes) {
              fillClassSelect(updateClassSelect, classes);
              pickFirstClassIfAny(updateClassSelect);
            })
            .catch(function () {
              resetClassSelect(updateClassSelect, "Gagal memuat kelas");
            });
        });
      }

      deps.userUpdateForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(deps.userUpdateForm);
        const id = Number(fd.get("id") || 0);
        const done = deps.beginBusy(
          deps.userUpdateForm,
          deps.message,
          "Memperbarui pengguna...",
        );
        try {
          const schoolID = toNullableNumber(fd.get("school_id"));
          const classID = toNullableNumber(fd.get("class_id"));
          const managedSchoolIDs = getMultiSelectValues(
            deps.userUpdateForm.elements.namedItem("managed_school_ids"),
          );
          const role = String(fd.get("role") || "")
            .trim()
            .toLowerCase();
          const participantNo = String(fd.get("participant_no") || "").trim();
          const nisn = String(fd.get("nisn") || "").trim();
          const schoolCode = schoolCodeByID(schoolID);
          if (isStudentRole(role) && (schoolID === null || classID === null)) {
            deps.setMsg("Untuk role siswa, sekolah dan kelas wajib dipilih.");
            return;
          }
          if (isStudentRole(role) && (!participantNo || !nisn)) {
            deps.setMsg(
              "Untuk role siswa, nomor peserta dan NISN wajib diisi.",
            );
            return;
          }
          if (isStudentRole(role) && !schoolCode) {
            deps.setMsg(
              "NPSN sekolah belum terisi. Lengkapi NPSN di menu Data Master > Sekolah.",
            );
            return;
          }
          if (schoolID !== null && classID === null) {
            deps.setMsg("Jika memilih sekolah, kelas wajib dipilih.");
            return;
          }
          if (isProktorRole(role) && !managedSchoolIDs.length) {
            deps.setMsg(
              "Untuk role proktor, pilih minimal satu sekolah kelolaan.",
            );
            return;
          }
          const out = await deps.api("/api/v1/admin/users/" + id, "PUT", {
            full_name: String(fd.get("full_name") || "").trim(),
            email: String(fd.get("email") || "").trim(),
            role: String(fd.get("role") || "").trim(),
            password: String(fd.get("password") || ""),
            participant_no: participantNo,
            nisn: nisn,
            school_id: schoolID === null ? 0 : schoolID,
            class_id: classID === null ? 0 : classID,
            managed_school_ids: managedSchoolIDs,
          });
          pretty(deps.regOut, out);
          deps.setMsg("Pengguna berhasil diperbarui.");
          if (
            deps.userUpdateDialog &&
            typeof deps.userUpdateDialog.close === "function"
          ) {
            deps.userUpdateDialog.close();
          }
          await loadUsers();
          await deps.loadDashboardStats();
        } catch (err) {
          deps.setMsg("Gagal memperbarui pengguna: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (deps.isAdmin() && deps.userDeleteForm) {
      deps.userDeleteForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(deps.userDeleteForm);
        const id = Number(fd.get("id") || 0);
        const done = deps.beginBusy(
          deps.userDeleteForm,
          deps.message,
          "Menghapus pengguna...",
        );
        try {
          const out = await deps.api("/api/v1/admin/users/" + id, "DELETE", {});
          pretty(deps.regOut, out);
          deps.setMsg("Pengguna berhasil dihapus.");
          deps.userDeleteForm.reset();
          if (
            deps.userDeleteDialog &&
            typeof deps.userDeleteDialog.close === "function"
          ) {
            deps.userDeleteDialog.close();
          }
          await loadUsers();
          await deps.loadDashboardStats();
        } catch (err) {
          deps.setMsg("Gagal menghapus pengguna: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (deps.isAdmin() && deps.userImportForm) {
      deps.userImportForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fd = new FormData(deps.userImportForm);
        const file = fd.get("file");
        if (!file || !file.name) {
          deps.setMsg("File Excel wajib dipilih.");
          return;
        }
        const done = deps.beginBusy(
          deps.userImportForm,
          deps.message,
          "Mengimpor data pengguna dari Excel...",
        );
        try {
          const out = await deps.apiMultipart(
            "/api/v1/admin/users/import",
            "POST",
            fd,
          );
          pretty(deps.userImportOut, out);
          pretty(deps.regOut, out);
          const report =
            out && out.report && typeof out.report === "object"
              ? out.report
              : {};
          const failed = Number(report.failed_rows || 0);
          const errors = Array.isArray(report.errors) ? report.errors : [];
          const infos = Array.isArray(report.infos) ? report.infos : [];

          if (failed > 0) {
            const details = errors.length
              ? errors
                  .map(function (it) {
                    const row = Number(it.row || 0);
                    const userLabel = String(it.username || "").trim();
                    const errMsg = String(it.error || "error tidak diketahui");
                    if (userLabel) {
                      return (
                        "Baris " +
                        String(row) +
                        " | username: " +
                        userLabel +
                        " | " +
                        errMsg
                      );
                    }
                    return "Baris " + String(row) + " | " + errMsg;
                  })
                  .join("\n")
              : "Ada baris gagal, tetapi detail tidak tersedia.";
            if (deps.userImportErrorOut)
              deps.userImportErrorOut.textContent = details;
            if (
              deps.userImportErrorDialog &&
              typeof deps.userImportErrorDialog.showModal === "function"
            ) {
              deps.userImportErrorDialog.showModal();
            }
          } else {
            deps.userImportForm.reset();
            if (
              deps.userImportDialog &&
              typeof deps.userImportDialog.close === "function"
            ) {
              deps.userImportDialog.close();
            }
          }

          if (infos.length > 0) {
            const infoLines = infos
              .map(function (it) {
                const row = Number(it.row || 0);
                const userLabel = String(it.username || "").trim();
                const infoMsg = String(it.info || "").trim();
                if (userLabel) {
                  return (
                    "Baris " +
                    String(row) +
                    " | username: " +
                    userLabel +
                    " | info: " +
                    infoMsg
                  );
                }
                return "Baris " + String(row) + " | info: " + infoMsg;
              })
              .join("\n");
            if (deps.userImportOut) {
              const prev = String(deps.userImportOut.textContent || "").trim();
              deps.userImportOut.textContent = prev
                ? prev + "\n\nINFO:\n" + infoLines
                : "INFO:\n" + infoLines;
            }
          }

          deps.setMsg(
            "Impor selesai. Berhasil: " +
              String(report.success_rows || 0) +
              ", gagal: " +
              String(report.failed_rows || 0) +
              ", info: " +
              String(infos.length) +
              ".",
          );
          await loadUsers();
          await deps.loadDashboardStats();
        } catch (err) {
          if (deps.userImportErrorOut) {
            deps.userImportErrorOut.textContent =
              "Impor gagal:\n" + String(err.message || "Request failed");
          }
          if (
            deps.userImportErrorDialog &&
            typeof deps.userImportErrorDialog.showModal === "function"
          ) {
            deps.userImportErrorDialog.showModal();
          }
          deps.setMsg("Gagal impor pengguna: " + err.message);
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

  function setInitialFilterFromForm() {
    if (!deps || !deps.regFilterForm) return;
    const fd = new FormData(deps.regFilterForm);
    currentRole = String(fd.get("role") || "").trim();
    currentQuery = String(fd.get("q") || "").trim();
    currentLimit = Number(fd.get("limit") || 50);
  }

  function getSchoolsCache() {
    return Array.isArray(schoolsCache) ? schoolsCache : [];
  }

  window.AdminUsers = {
    init: init,
    loadUsers: loadUsers,
    loadSchoolsForUserForms: loadSchoolsForUserForms,
    loadClassesBySchool: loadClassesBySchool,
    applyUserFormRoleRequirements: applyUserFormRoleRequirements,
    fillSchoolSelect: fillSchoolSelect,
    resetClassSelect: resetClassSelect,
    syncSchoolCodeDisplay: syncSchoolCodeDisplay,
    setInitialFilterFromForm: setInitialFilterFromForm,
    getSchoolsCache: getSchoolsCache,
  };
})();
