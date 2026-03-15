(function () {
  var deps = null;

  function setDeps(opts) {
    deps = opts || {};
  }

  async function loadMasterReadonly() {
    if (!deps || typeof deps.api !== "function") return;
    const results = await Promise.all([
      deps.api("/api/v1/levels?all=1", "GET"),
      deps.api("/api/v1/admin/schools?all=1", "GET"),
      deps.api("/api/v1/admin/classes?all=1", "GET"),
    ]);
    const levels = results[0];
    const schools = results[1];
    const classes = results[2];
    const levelItems = Array.isArray(levels) ? levels : [];
    const schoolItems = Array.isArray(schools) ? schools : [];
    const classItems = Array.isArray(classes) ? classes : [];
    const schoolByID = {};
    schoolItems.forEach(function (it) {
      schoolByID[String(it.id || "")] = it;
    });

    if (deps.levelsBody) {
      if (!levelItems.length) {
        deps.levelsBody.innerHTML =
          '<tr><td colspan="3" class="muted">Tidak ada data jenjang.</td></tr>';
      } else {
        deps.levelsBody.innerHTML = "";
        levelItems.forEach(function (it) {
          const tr = document.createElement("tr");
          tr.innerHTML = [
            "<td>" + deps.escapeHtml(String(it.id || "")) + "</td>",
            "<td>" + deps.escapeHtml(String(it.name || "")) + "</td>",
            "<td>" + (it.is_active ? "aktif" : "nonaktif") + "</td>",
          ].join("");
          deps.levelsBody.appendChild(tr);
        });
      }
    }

    if (deps.schoolsBody) {
      if (!schoolItems.length) {
        deps.schoolsBody.innerHTML =
          '<tr><td colspan="10" class="muted">Tidak ada data sekolah.</td></tr>';
      } else {
        deps.schoolsBody.innerHTML = "";
        schoolItems.forEach(function (it) {
          const tr = document.createElement("tr");
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
          ].join("");
          deps.schoolsBody.appendChild(tr);
        });
      }
    }

    if (deps.classesBody) {
      if (!classItems.length) {
        deps.classesBody.innerHTML =
          '<tr><td colspan="5" class="muted">Tidak ada data kelas.</td></tr>';
      } else {
        deps.classesBody.innerHTML = "";
        classItems.forEach(function (it) {
          const school = schoolByID[String(it.school_id || "")] || {};
          const schoolText = deps.localSchoolLabel(school);
          const tr = document.createElement("tr");
          tr.innerHTML = [
            "<td>" + deps.escapeHtml(String(it.id || "")) + "</td>",
            "<td>" + deps.escapeHtml(String(schoolText || "-")) + "</td>",
            "<td>" + deps.escapeHtml(String(it.grade_level || "")) + "</td>",
            "<td>" + deps.escapeHtml(String(it.name || "")) + "</td>",
            "<td>" + deps.escapeHtml(String(it.student_count || 0)) + "</td>",
          ].join("");
          deps.classesBody.appendChild(tr);
        });
      }
    }
  }

  function bindHandlers() {
    if (!deps) return;
    if (deps.masterRefreshBtn) {
      deps.masterRefreshBtn.addEventListener("click", async function () {
        const done = deps.beginBusy(
          deps.masterRefreshBtn,
          deps.msg,
          "Memuat data master proktor...",
        );
        try {
          await loadMasterReadonly();
          await deps.loadPlacementOptions();
          deps.setMsg("Data master proktor berhasil dimuat.");
        } catch (err) {
          deps.setMsg("Gagal memuat data master proktor: " + err.message);
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

  window.ProktorMaster = {
    init: init,
    loadMasterReadonly: loadMasterReadonly,
  };
})();
