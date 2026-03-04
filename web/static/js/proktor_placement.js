(function () {
  var deps = null;
  var placementUsers = [];
  var placementSchools = [];
  var placementClasses = [];

  function setDeps(opts) {
    deps = opts || {};
  }

  function resetAssignClassSelect(placeholder) {
    if (!deps || !deps.assignClassSelect) return;
    const textValue = String(placeholder || "Pilih kelas...");
    deps.assignClassSelect.innerHTML =
      '<option value="">' + deps.escapeHtml(textValue) + "</option>";
    deps.assignClassSelect.disabled = true;
  }

  function fillAssignSchoolSelect(selectedSchoolID) {
    if (!deps || !deps.assignSchoolSelect) return;
    deps.assignSchoolSelect.innerHTML =
      '<option value="">Pilih sekolah...</option>';
    placementSchools.forEach(function (it) {
      const o = document.createElement("option");
      const id = Number(it.id || 0);
      o.value = String(id);
      o.textContent = String(it.name || "-");
      if (selectedSchoolID > 0 && id === selectedSchoolID) o.selected = true;
      deps.assignSchoolSelect.appendChild(o);
    });
  }

  function fillAssignClassSelectBySchool(schoolID) {
    if (!deps || !deps.assignClassSelect) return;
    const sid = Number(schoolID || 0);
    deps.assignClassSelect.innerHTML =
      '<option value="">Pilih kelas...</option>';
    const items = placementClasses.filter(function (it) {
      return Number(it.school_id || 0) === sid;
    });
    if (!items.length) {
      resetAssignClassSelect("Tidak ada kelas di sekolah ini");
      return;
    }
    deps.assignClassSelect.disabled = false;
    items.forEach(function (it) {
      const o = document.createElement("option");
      o.value = String(it.id || "");
      o.textContent =
        String(it.grade_level || "") + " | " + String(it.name || "-");
      deps.assignClassSelect.appendChild(o);
    });
  }

  function resetPlacementClassSelect(placeholder) {
    if (!deps || !deps.placementClassSelect) return;
    const textValue = String(placeholder || "Pilih kelas...");
    deps.placementClassSelect.innerHTML =
      '<option value="">' + deps.escapeHtml(textValue) + "</option>";
    deps.placementClassSelect.disabled = true;
  }

  function fillPlacementSchoolSelect(selectedSchoolID) {
    if (!deps || !deps.placementSchoolSelect) return;
    deps.placementSchoolSelect.innerHTML =
      '<option value="">Pilih sekolah...</option>';
    placementSchools.forEach(function (it) {
      const o = document.createElement("option");
      const id = Number(it.id || 0);
      o.value = String(id);
      o.textContent = String(it.name || "-");
      if (selectedSchoolID > 0 && id === selectedSchoolID) o.selected = true;
      deps.placementSchoolSelect.appendChild(o);
    });
  }

  function fillPlacementClassSelectBySchool(schoolID, selectedClassID) {
    if (!deps || !deps.placementClassSelect) return;
    const sid = Number(schoolID || 0);
    deps.placementClassSelect.innerHTML =
      '<option value="">Pilih kelas...</option>';
    const items = placementClasses.filter(function (it) {
      return Number(it.school_id || 0) === sid;
    });
    if (!items.length) {
      resetPlacementClassSelect("Tidak ada kelas di sekolah ini");
      return;
    }
    deps.placementClassSelect.disabled = false;
    items.forEach(function (it) {
      const o = document.createElement("option");
      const classID = Number(it.id || 0);
      o.value = String(classID);
      o.textContent =
        String(it.grade_level || "") + " | " + String(it.name || "-");
      if (
        Number(selectedClassID || 0) > 0 &&
        classID === Number(selectedClassID || 0)
      ) {
        o.selected = true;
      }
      deps.placementClassSelect.appendChild(o);
    });
  }

  async function loadPlacementOptions() {
    if (!deps || typeof deps.api !== "function") return;
    const [guru, siswa, schools, classes] = await Promise.all([
      deps.api("/api/v1/admin/users?role=guru&limit=200&offset=0", "GET"),
      deps.api("/api/v1/admin/users?role=siswa&limit=500&offset=0", "GET"),
      deps.api("/api/v1/admin/schools?all=1", "GET"),
      deps.api("/api/v1/admin/classes?all=1", "GET"),
    ]);
    placementUsers = []
      .concat(Array.isArray(guru.items) ? guru.items : [])
      .concat(Array.isArray(siswa.items) ? siswa.items : []);
    placementSchools = Array.isArray(schools) ? schools : [];
    placementClasses = Array.isArray(classes) ? classes : [];

    if (deps.placementUserSelect) {
      deps.placementUserSelect.innerHTML =
        '<option value="">Pilih pengguna...</option>';
      placementUsers.forEach(function (it) {
        const o = document.createElement("option");
        const id = Number(it.id || 0);
        const schoolID = Number(it.school_id || 0);
        const classID = Number(it.class_id || 0);
        o.value = String(id);
        o.setAttribute("data-school-id", schoolID > 0 ? String(schoolID) : "");
        o.setAttribute("data-class-id", classID > 0 ? String(classID) : "");
        o.textContent =
          String(it.full_name || it.username || "User") +
          " (" +
          String(it.role || "-") +
          ")" +
          (it.class_name ? " | " + String(it.class_name) : "");
        deps.placementUserSelect.appendChild(o);
      });
    }
    fillPlacementSchoolSelect(0);
    resetPlacementClassSelect("Pilih sekolah dulu");
    fillAssignSchoolSelect(0);
    resetAssignClassSelect("Pilih sekolah dulu");
  }

  function bindHandlers() {
    if (!deps) return;

    if (deps.assignSchoolSelect) {
      deps.assignSchoolSelect.addEventListener("change", function () {
        fillAssignClassSelectBySchool(deps.assignSchoolSelect.value);
      });
    }

    if (deps.placementSchoolSelect) {
      deps.placementSchoolSelect.addEventListener("change", function () {
        fillPlacementClassSelectBySchool(deps.placementSchoolSelect.value, 0);
      });
    }

    if (deps.placementUserSelect) {
      deps.placementUserSelect.addEventListener("change", function () {
        const opt =
          deps.placementUserSelect.options[
            deps.placementUserSelect.selectedIndex
          ] || null;
        const schoolID = Number(
          (opt && opt.getAttribute("data-school-id")) || 0,
        );
        const classID = Number((opt && opt.getAttribute("data-class-id")) || 0);
        if (schoolID > 0) {
          fillPlacementSchoolSelect(schoolID);
          fillPlacementClassSelectBySchool(schoolID, classID);
          return;
        }
        fillPlacementSchoolSelect(0);
        resetPlacementClassSelect("Pilih sekolah dulu");
      });
    }

    if (deps.placementForm) {
      deps.placementForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const userID = Number(
          (deps.placementUserSelect && deps.placementUserSelect.value) || 0,
        );
        const schoolID = Number(
          (deps.placementSchoolSelect && deps.placementSchoolSelect.value) || 0,
        );
        const classID = Number(
          (deps.placementClassSelect && deps.placementClassSelect.value) || 0,
        );
        if (userID <= 0 || schoolID <= 0 || classID <= 0) {
          deps.setMsg("Pilih pengguna, sekolah, dan kelas terlebih dahulu.");
          return;
        }
        const done = deps.beginBusy(
          deps.placementForm,
          deps.msg,
          "Menyimpan penempatan kelas...",
        );
        try {
          const out = await deps.api(
            "/api/v1/admin/users/" + userID + "/class-placement",
            "PUT",
            { school_id: schoolID, class_id: classID },
          );
          const userLabel = String(
            (out && out.full_name) || (out && out.username) || userID,
          );
          const classLabel = String((out && out.class_name) || classID);
          deps.setMsg(
            "Penempatan berhasil: " + userLabel + " -> " + classLabel + ".",
          );
          await loadPlacementOptions();
        } catch (err) {
          deps.setMsg("Gagal menyimpan penempatan kelas: " + err.message);
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

  window.ProktorPlacement = {
    init: init,
    loadPlacementOptions: loadPlacementOptions,
    fillAssignClassSelectBySchool: fillAssignClassSelectBySchool,
  };
})();
