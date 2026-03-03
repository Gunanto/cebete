(function () {
  var deps = null;
  var attendanceStudentsAll = [];
  var attendanceExamMetaByID = {};

  function setDeps(opts) {
    deps = opts || {};
  }

  function setExamMetaByID(items) {
    attendanceExamMetaByID = {};
    (items || []).forEach(function (it) {
      const id = Number((it && it.id) || 0);
      if (id <= 0) return;
      attendanceExamMetaByID[String(id)] = it;
    });
  }

  function setAttendanceMeta(value) {
    if (!deps || !deps.attendanceMeta) return;
    deps.text(deps.attendanceMeta, value);
    deps.attendanceMeta.classList.remove("muted");
  }

  function getTodayInputDateValue() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return String(y) + "-" + m + "-" + day;
  }

  function dayNameIDFromDate(raw) {
    const d = raw ? new Date(raw) : new Date();
    if (Number.isNaN(d.getTime())) return "";
    const names = [
      "Minggu",
      "Senin",
      "Selasa",
      "Rabu",
      "Kamis",
      "Jumat",
      "Sabtu",
    ];
    return names[d.getDay()] || "";
  }

  function formatAttendanceDate(raw) {
    if (!raw) return "-";
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return String(raw);
    return d.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  }

  function resolveAcademicYearLabel(rawDate) {
    const d = rawDate ? new Date(rawDate) : new Date();
    if (Number.isNaN(d.getTime())) return "";
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    if (month >= 7) {
      return String(year) + "/" + String(year + 1);
    }
    return String(year - 1) + "/" + String(year);
  }

  async function loadAttendanceAssignments(examID) {
    if (!deps || !deps.attendancePages) return;
    const id = Number(examID || 0);
    if (id <= 0) {
      attendanceStudentsAll = [];
      deps.attendancePages.innerHTML =
        '<div class="muted">Pilih ujian terlebih dahulu.</div>';
      setAttendanceMeta("Pilih ujian lalu klik Muat Daftar Hadir.");
      return;
    }
    const items = await deps.api(
      "/api/v1/admin/exams/" + id + "/assignments",
      "GET",
    );
    attendanceStudentsAll = (Array.isArray(items) ? items : []).filter(
      function (it) {
        return String((it && it.role) || "").toLowerCase() === "siswa";
      },
    );
    fillAttendanceSchoolOptions(attendanceStudentsAll);
    fillAttendanceClassOptions(attendanceStudentsAll);
    renderAttendanceSheets();
  }

  function fillAttendanceSchoolOptions(students) {
    if (!deps || !deps.attendanceSchoolSelect) return;
    const selected = String(deps.attendanceSchoolSelect.value || "");
    const mapByID = {};
    (students || []).forEach(function (it) {
      const schoolID = Number((it && it.school_id) || 0);
      if (schoolID <= 0) return;
      if (mapByID[String(schoolID)]) return;
      mapByID[String(schoolID)] = {
        id: schoolID,
        name: String((it && it.school_name) || "").trim() || "-",
      };
    });
    deps.attendanceSchoolSelect.innerHTML =
      '<option value="">Semua sekolah</option>';
    Object.keys(mapByID)
      .sort(function (a, b) {
        return mapByID[a].name.localeCompare(mapByID[b].name, "id");
      })
      .forEach(function (k) {
        const o = document.createElement("option");
        o.value = String(mapByID[k].id);
        o.textContent = mapByID[k].name;
        deps.attendanceSchoolSelect.appendChild(o);
      });
    if (
      selected &&
      deps.attendanceSchoolSelect.querySelector(
        'option[value="' + CSS.escape(selected) + '"]',
      )
    ) {
      deps.attendanceSchoolSelect.value = selected;
    }
  }

  function fillAttendanceClassOptions(students) {
    if (!deps || !deps.attendanceClassSelect) return;
    const selected = String(deps.attendanceClassSelect.value || "");
    const selectedSchoolID = Number(
      (deps.attendanceSchoolSelect && deps.attendanceSchoolSelect.value) || 0,
    );
    const mapByID = {};
    (students || []).forEach(function (it) {
      const classID = Number((it && it.class_id) || 0);
      if (classID <= 0) return;
      const schoolID = Number((it && it.school_id) || 0);
      if (selectedSchoolID > 0 && schoolID !== selectedSchoolID) return;
      if (mapByID[String(classID)]) return;
      mapByID[String(classID)] = {
        id: classID,
        name: String((it && it.class_name) || "").trim() || "-",
      };
    });
    deps.attendanceClassSelect.innerHTML =
      '<option value="">Semua kelas</option>';
    Object.keys(mapByID)
      .sort(function (a, b) {
        return mapByID[a].name.localeCompare(mapByID[b].name, "id");
      })
      .forEach(function (k) {
        const o = document.createElement("option");
        o.value = String(mapByID[k].id);
        o.textContent = mapByID[k].name;
        deps.attendanceClassSelect.appendChild(o);
      });
    if (
      selected &&
      deps.attendanceClassSelect.querySelector(
        'option[value="' + CSS.escape(selected) + '"]',
      )
    ) {
      deps.attendanceClassSelect.value = selected;
    }
  }

  function getFilteredAttendanceStudents() {
    const selectedSchoolID = Number(
      (deps.attendanceSchoolSelect && deps.attendanceSchoolSelect.value) || 0,
    );
    const selectedClassID = Number(
      (deps.attendanceClassSelect && deps.attendanceClassSelect.value) || 0,
    );
    const onlyActive =
      !deps.attendanceOnlyActiveInput ||
      !!deps.attendanceOnlyActiveInput.checked;
    return attendanceStudentsAll.filter(function (it) {
      if (onlyActive && !Boolean(it && it.user_active)) return false;
      const schoolID = Number((it && it.school_id) || 0);
      if (selectedSchoolID > 0 && schoolID !== selectedSchoolID) return false;
      const classID = Number((it && it.class_id) || 0);
      if (selectedClassID > 0 && classID !== selectedClassID) return false;
      return true;
    });
  }

  function renderAttendanceSheetPage(payload, pageNo, totalPages) {
    const page = document.createElement("section");
    page.className = "attendance-sheet-page";
    const rows = Array.isArray(payload.students) ? payload.students : [];
    const isCompact = rows.length > 36;
    if (isCompact) page.classList.add("attendance-sheet-page-compact");
    const examID = Number(payload.examID || 0);
    const examMeta = attendanceExamMetaByID[String(examID)] || {};
    const examLabel =
      String((examMeta && examMeta.subject_name) || "").trim() ||
      String((examMeta && examMeta.title) || "").trim() ||
      String(payload.examLabel || "").trim() ||
      "-";
    const dayLabel = String(
      (deps.attendanceDayInput && deps.attendanceDayInput.value) ||
        dayNameIDFromDate(
          (deps.attendanceDateInput && deps.attendanceDateInput.value) ||
            Date.now(),
        ) ||
        "-",
    ).trim();
    const dateLabel = formatAttendanceDate(
      (deps.attendanceDateInput && deps.attendanceDateInput.value) ||
        Date.now(),
    );
    const timeLabel = String(
      (deps.attendanceTimeInput && deps.attendanceTimeInput.value) || "-",
    ).trim();
    const classLabel = String(payload.className || "-").trim() || "-";
    const schoolLabel = String(payload.schoolName || "-").trim() || "-";
    const bodyRowsHTML = rows
      .map(function (it, idx) {
        const no = idx + 1;
        const participantNo = it
          ? String((it.participant_no || "").trim() || "-")
          : "";
        const fullName = it ? String((it.full_name || "").trim() || "-") : "";
        return (
          "<tr>" +
          '<td class="col-no">' +
          deps.escapeHtml(String(no)) +
          "</td>" +
          '<td class="col-name">' +
          deps.escapeHtml(fullName) +
          "</td>" +
          '<td class="col-participant">' +
          deps.escapeHtml(participantNo) +
          "</td>" +
          '<td class="col-sign">' +
          deps.escapeHtml(String(no) + ".") +
          "</td>" +
          '<td class="col-note"></td>' +
          "</tr>"
        );
      })
      .join("");
    page.innerHTML = [
      '<div class="attendance-title">',
      "<h2>DAFTAR HADIR PESERTA ASESMEN</h2>",
      "<h3>TAHUN PELAJARAN " +
        deps.escapeHtml(
          resolveAcademicYearLabel(
            (deps.attendanceDateInput && deps.attendanceDateInput.value) ||
              Date.now(),
          ),
        ) +
        "</h3>",
      "</div>",
      '<table class="attendance-info-table">',
      '<tr><td>Sekolah</td><td>:</td><td><span class="attendance-dotted">' +
        deps.escapeHtml(schoolLabel) +
        '</span></td><td>Kelas</td><td>:</td><td><span class="attendance-dotted">' +
        deps.escapeHtml(classLabel) +
        "</span></td></tr>",
      '<tr><td>Hari</td><td>:</td><td><span class="attendance-dotted">' +
        deps.escapeHtml(dayLabel) +
        '</span></td><td>Mata Pelajaran</td><td>:</td><td><span class="attendance-dotted">' +
        deps.escapeHtml(examLabel) +
        "</span></td></tr>",
      '<tr><td>Tanggal</td><td>:</td><td><span class="attendance-dotted">' +
        deps.escapeHtml(dateLabel) +
        '</span></td><td>Waktu</td><td>:</td><td><span class="attendance-dotted">' +
        deps.escapeHtml(timeLabel) +
        "</span></td></tr>",
      "</table>",
      '<table class="attendance-list-table">',
      "<thead><tr><th>No</th><th>Nama Peserta</th><th>Nomor Peserta</th><th>Tanda Tangan</th><th>Keterangan</th></tr></thead>",
      "<tbody>",
      bodyRowsHTML,
      "</tbody></table>",
      '<table class="attendance-signatures">',
      "<tr><td>Proktor</td><td>Pengawas 1</td><td>Pengawas 2</td></tr>",
      '<tr><td class="sign-space"></td><td class="sign-space"></td><td class="sign-space"></td></tr>',
      "<tr><td>( ............................................ )</td><td>( ............................................ )</td><td>( ............................................ )</td></tr>",
      "<tr><td>NIP. ....................................</td><td>NIP. ....................................</td><td>NIP. ....................................</td></tr>",
      "</table>",
      '<p class="attendance-footnote">* Format satu halaman - ' +
        deps.escapeHtml(String(rows.length)) +
        " Peserta.</p>",
      '<div class="attendance-page-no">Halaman ' +
        deps.escapeHtml(String(pageNo + 1)) +
        " / " +
        deps.escapeHtml(String(totalPages)) +
        "</div>",
    ].join("");
    return page;
  }

  function renderAttendanceSheets() {
    if (!deps || !deps.attendancePages) return;
    const students = getFilteredAttendanceStudents()
      .slice()
      .sort(function (a, b) {
        const classA = String((a && a.class_name) || "").trim();
        const classB = String((b && b.class_name) || "").trim();
        const schoolA = String((a && a.school_name) || "").trim();
        const schoolB = String((b && b.school_name) || "").trim();
        if (schoolA !== schoolB) return schoolA.localeCompare(schoolB, "id");
        if (classA !== classB) return classA.localeCompare(classB, "id");
        return String((a && a.full_name) || "").localeCompare(
          String((b && b.full_name) || ""),
          "id",
        );
      });
    if (!students.length) {
      deps.attendancePages.innerHTML =
        '<div class="muted">Tidak ada peserta sesuai filter saat ini.</div>';
      setAttendanceMeta("Belum ada lembar hadir yang bisa dicetak.");
      return;
    }
    const grouped = {};
    students.forEach(function (it) {
      const schoolID = Number((it && it.school_id) || 0);
      const classID = Number((it && it.class_id) || 0);
      const schoolName = String((it && it.school_name) || "").trim() || "-";
      const className = String((it && it.class_name) || "").trim() || "-";
      const key =
        String(schoolID) +
        "::" +
        String(classID) +
        "::" +
        schoolName +
        "::" +
        className;
      if (!grouped[key]) {
        grouped[key] = {
          schoolName: schoolName,
          className: className,
          students: [],
        };
      }
      grouped[key].students.push(it);
    });
    const pagesData = [];
    Object.keys(grouped)
      .sort(function (a, b) {
        const ga = grouped[a];
        const gb = grouped[b];
        if (ga.schoolName !== gb.schoolName) {
          return ga.schoolName.localeCompare(gb.schoolName, "id");
        }
        return ga.className.localeCompare(gb.className, "id");
      })
      .forEach(function (k) {
        const group = grouped[k];
        pagesData.push({
          schoolName: group.schoolName,
          className: group.className,
          students: group.students,
          examID: Number(
            (deps.attendanceExamSelect && deps.attendanceExamSelect.value) || 0,
          ),
          examLabel:
            String(
              (deps.attendanceExamSelect &&
                deps.attendanceExamSelect.options &&
                deps.attendanceExamSelect.options[
                  deps.attendanceExamSelect.selectedIndex
                ] &&
                deps.attendanceExamSelect.options[
                  deps.attendanceExamSelect.selectedIndex
                ].textContent) ||
                "",
            ).trim() || "-",
        });
      });
    deps.attendancePages.innerHTML = "";
    pagesData.forEach(function (payload, idx) {
      deps.attendancePages.appendChild(
        renderAttendanceSheetPage(payload, idx, pagesData.length),
      );
    });
    const classCount = Object.keys(grouped).length;
    setAttendanceMeta(
      "Daftar hadir siap cetak: " +
        String(students.length) +
        " peserta, " +
        String(classCount) +
        " kelas, " +
        String(pagesData.length) +
        " halaman.",
    );
  }

  function bindHandlers() {
    if (!deps) return;

    if (
      deps.attendanceDateInput &&
      !String(deps.attendanceDateInput.value || "").trim()
    ) {
      deps.attendanceDateInput.value = getTodayInputDateValue();
    }
    if (
      deps.attendanceDayInput &&
      !String(deps.attendanceDayInput.value || "").trim()
    ) {
      deps.attendanceDayInput.value = dayNameIDFromDate(
        (deps.attendanceDateInput && deps.attendanceDateInput.value) ||
          Date.now(),
      );
    }

    if (deps.attendanceForm) {
      deps.attendanceForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const examID = Number(
          (deps.attendanceExamSelect && deps.attendanceExamSelect.value) || 0,
        );
        if (examID <= 0) {
          deps.setMsg("Pilih ujian terlebih dahulu.");
          return;
        }
        const done = deps.beginBusy(
          deps.attendanceForm,
          deps.msg,
          "Memuat daftar hadir...",
        );
        try {
          await loadAttendanceAssignments(examID);
          deps.setMsg("Daftar hadir berhasil dimuat.");
        } catch (err) {
          deps.setMsg("Gagal memuat daftar hadir: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (deps.attendanceSchoolSelect) {
      deps.attendanceSchoolSelect.addEventListener("change", function () {
        fillAttendanceClassOptions(attendanceStudentsAll);
        renderAttendanceSheets();
      });
    }
    if (deps.attendanceClassSelect) {
      deps.attendanceClassSelect.addEventListener("change", function () {
        renderAttendanceSheets();
      });
    }
    if (deps.attendanceOnlyActiveInput) {
      deps.attendanceOnlyActiveInput.addEventListener("change", function () {
        renderAttendanceSheets();
      });
    }
    if (deps.attendanceDateInput) {
      deps.attendanceDateInput.addEventListener("change", function () {
        if (deps.attendanceDayInput) {
          deps.attendanceDayInput.value = dayNameIDFromDate(
            deps.attendanceDateInput.value,
          );
        }
        renderAttendanceSheets();
      });
    }
    if (deps.attendanceDayInput) {
      deps.attendanceDayInput.addEventListener("input", function () {
        renderAttendanceSheets();
      });
    }
    if (deps.attendanceTimeInput) {
      deps.attendanceTimeInput.addEventListener("input", function () {
        renderAttendanceSheets();
      });
    }
    if (deps.attendancePrintBtn) {
      deps.attendancePrintBtn.addEventListener("click", function () {
        if (!deps.attendancePages) return;
        if (!deps.attendancePages.querySelector(".attendance-sheet-page")) {
          deps.setMsg("Belum ada daftar hadir untuk dicetak.");
          return;
        }
        window.print();
      });
    }
  }

  function init(opts) {
    setDeps(opts);
    bindHandlers();
  }

  window.ProktorAttendance = {
    init: init,
    setExamMetaByID: setExamMetaByID,
  };
})();
