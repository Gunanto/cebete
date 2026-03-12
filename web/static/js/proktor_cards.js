(function () {
  var deps = null;
  var cardsStudentsAll = [];
  var cardsPhotoByUserID = {};

  function setDeps(opts) {
    deps = opts || {};
  }

  function setCardsMeta(value) {
    if (!deps || !deps.cardsMeta) return;
    deps.text(deps.cardsMeta, value);
    deps.cardsMeta.classList.remove("muted");
  }

  function formatClassLabel(raw) {
    const name = String(raw || "").trim();
    if (!name) return "Tak Ada Kelas";
    const lower = name.toLowerCase();
    if (lower.startsWith("kelas ")) return name;
    return "Kelas " + name;
  }

  function renderExamCardsPage(items) {
    const page = document.createElement("div");
    page.className = "proktor-cards-page";
    for (let i = 0; i < 10; i += 1) {
      const current = items[i];
      const card = document.createElement("article");
      card.className = "proktor-card";
      if (!current) {
        card.classList.add("is-empty");
        card.innerHTML = '<div class="proktor-card-empty">Slot Kartu</div>';
        page.appendChild(card);
        continue;
      }
      const schoolName = String((current.school_name || "").trim() || "-");
      const className = String((current.class_name || "").trim() || "");
      const participantNo = String(
        (current.participant_no || "").trim() || "-",
      );
      const fullName = String((current.full_name || "").trim() || "-");
      const username = String((current.username || "").trim() || "-");
      const email = String((current.email || "").trim() || "-");
      const status = String((current.status || "").trim() || "active");
      const userID = Number(current.user_id || 0);
      const photoSrc = String(
        cardsPhotoByUserID[String(userID)] || current.photo_data_url || "",
      ).trim();
      const photoAlt = "Foto " + fullName;
      card.innerHTML = [
        '<div class="proktor-card-head">',
        "<h4>Kartu Peserta Ujian</h4>",
        "<p>" + deps.escapeHtml(schoolName) + "</p>",
        "</div>",
        '<div class="proktor-card-body">',
        '<div class="proktor-card-photo">' +
          (photoSrc
            ? '<img src="' +
              deps.escapeHtml(photoSrc) +
              '" alt="' +
              deps.escapeHtml(photoAlt) +
              '" />'
            : "FOTO<br>2x3") +
          "</div>",
        '<table class="proktor-card-table">',
        "<tr><td>No. Peserta</td><td>:</td><td>" +
          deps.escapeHtml(participantNo) +
          "</td></tr>",
        "<tr><td>Nama</td><td>:</td><td>" +
          deps.escapeHtml(fullName) +
          "</td></tr>",
        "<tr><td>Kelas</td><td>:</td><td>" +
          deps.escapeHtml(formatClassLabel(className)) +
          "</td></tr>",
        "<tr><td>Username</td><td>:</td><td>" +
          deps.escapeHtml(username) +
          "</td></tr>",
        "<tr><td>Email</td><td>:</td><td>" +
          deps.escapeHtml(email) +
          "</td></tr>",
        "</table>",
        "</div>",
        '<div class="proktor-card-photo-actions">',
        '<button class="btn btn-secondary proktor-card-photo-btn" type="button" data-photo-pick="' +
          deps.escapeHtml(String(userID)) +
          '">Pilih Foto</button>',
        '<button class="btn btn-secondary proktor-card-photo-btn" type="button" data-photo-clear="' +
          deps.escapeHtml(String(userID)) +
          '"' +
          (photoSrc ? "" : " disabled") +
          ">Hapus</button>",
        '<input type="file" accept="image/*" data-photo-input="' +
          deps.escapeHtml(String(userID)) +
          '" hidden />',
        "</div>",
        '<div class="proktor-card-foot">',
        "<span>Dibuat: " +
          deps.escapeHtml(deps.fmtDate(new Date().toISOString())) +
          "</span>",
        '<span class="proktor-card-badge">' +
          deps.escapeHtml(status) +
          "</span>",
        "</div>",
      ].join("");
      page.appendChild(card);
    }
    return page;
  }

  async function loadExamCards(examID) {
    if (!deps || !deps.cardsPages) return;
    const id = Number(examID || 0);
    if (id <= 0) {
      deps.cardsPages.innerHTML =
        '<div class="muted">Pilih ujian terlebih dahulu.</div>';
      cardsStudentsAll = [];
      return;
    }
    const items = await deps.api(
      "/api/v1/admin/exams/" + id + "/assignments",
      "GET",
    );
    cardsStudentsAll = (Array.isArray(items) ? items : []).filter(
      function (it) {
        return String((it && it.role) || "").toLowerCase() === "siswa";
      },
    );
    cardsPhotoByUserID = {};
    cardsStudentsAll.forEach(function (it) {
      const userID = Number((it && it.user_id) || 0);
      const photoDataURL = String((it && it.photo_data_url) || "").trim();
      if (userID > 0 && photoDataURL) {
        cardsPhotoByUserID[String(userID)] = photoDataURL;
      }
    });
    fillCardsSchoolOptions(cardsStudentsAll);
    fillCardsClassOptions(cardsStudentsAll);
    renderFilteredExamCards();
  }

  function fillCardsSchoolOptions(students) {
    if (!deps || !deps.cardsSchoolSelect) return;
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
    const currentValue = String(deps.cardsSchoolSelect.value || "");
    deps.cardsSchoolSelect.innerHTML =
      '<option value="">Semua sekolah</option>';
    Object.keys(mapByID)
      .sort(function (a, b) {
        return mapByID[a].name.localeCompare(mapByID[b].name, "id");
      })
      .forEach(function (k) {
        const o = document.createElement("option");
        o.value = String(mapByID[k].id);
        o.textContent = mapByID[k].name;
        deps.cardsSchoolSelect.appendChild(o);
      });
    if (
      currentValue &&
      deps.cardsSchoolSelect.querySelector(
        'option[value="' + CSS.escape(currentValue) + '"]',
      )
    ) {
      deps.cardsSchoolSelect.value = currentValue;
    }
  }

  function fillCardsClassOptions(students) {
    if (!deps || !deps.cardsClassSelect) return;
    const selectedSchoolID = Number(
      (deps.cardsSchoolSelect && deps.cardsSchoolSelect.value) || 0,
    );
    const currentValue = String(deps.cardsClassSelect.value || "");
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
    deps.cardsClassSelect.innerHTML = '<option value="">Semua kelas</option>';
    Object.keys(mapByID)
      .sort(function (a, b) {
        return mapByID[a].name.localeCompare(mapByID[b].name, "id");
      })
      .forEach(function (k) {
        const o = document.createElement("option");
        o.value = String(mapByID[k].id);
        o.textContent = mapByID[k].name;
        deps.cardsClassSelect.appendChild(o);
      });
    if (
      currentValue &&
      deps.cardsClassSelect.querySelector(
        'option[value="' + CSS.escape(currentValue) + '"]',
      )
    ) {
      deps.cardsClassSelect.value = currentValue;
    }
  }

  function getFilteredCardsStudents() {
    const selectedSchoolID = Number(
      (deps.cardsSchoolSelect && deps.cardsSchoolSelect.value) || 0,
    );
    const selectedClassID = Number(
      (deps.cardsClassSelect && deps.cardsClassSelect.value) || 0,
    );
    const onlyActive =
      !deps.cardsOnlyActiveInput || !!deps.cardsOnlyActiveInput.checked;
    return cardsStudentsAll.filter(function (it) {
      if (onlyActive && !Boolean(it && it.user_active)) return false;
      const schoolID = Number((it && it.school_id) || 0);
      if (selectedSchoolID > 0 && schoolID !== selectedSchoolID) return false;
      const classID = Number((it && it.class_id) || 0);
      if (selectedClassID > 0 && classID !== selectedClassID) return false;
      return true;
    });
  }

  function compareCardStudents(a, b) {
    const schoolA = String((a && a.school_name) || "").trim();
    const schoolB = String((b && b.school_name) || "").trim();
    const schoolCmp = schoolA.localeCompare(schoolB, "id");
    if (schoolCmp !== 0) return schoolCmp;

    const classA = String((a && a.class_name) || "").trim();
    const classB = String((b && b.class_name) || "").trim();
    const classCmp = classA.localeCompare(classB, "id");
    if (classCmp !== 0) return classCmp;

    const participantA = String((a && a.participant_no) || "").trim();
    const participantB = String((b && b.participant_no) || "").trim();
    const participantCmp = participantA.localeCompare(participantB, "id", {
      numeric: true,
    });
    if (participantCmp !== 0) return participantCmp;

    const fullNameA = String((a && a.full_name) || "").trim();
    const fullNameB = String((b && b.full_name) || "").trim();
    const fullNameCmp = fullNameA.localeCompare(fullNameB, "id");
    if (fullNameCmp !== 0) return fullNameCmp;

    return String((a && a.username) || "").localeCompare(
      String((b && b.username) || ""),
      "id",
    );
  }

  function buildCardsPages(students) {
    const groups = new Map();
    (Array.isArray(students) ? students : [])
      .slice()
      .sort(compareCardStudents)
      .forEach(function (it) {
        const schoolID = Number((it && it.school_id) || 0);
        const classID = Number((it && it.class_id) || 0);
        const schoolName = String((it && it.school_name) || "").trim();
        const className = String((it && it.class_name) || "").trim();
        const key =
          String(schoolID) +
          "::" +
          String(classID) +
          "::" +
          schoolName.toLowerCase() +
          "::" +
          className.toLowerCase();
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(it);
      });

    const pages = [];
    groups.forEach(function (groupItems) {
      for (let i = 0; i < groupItems.length; i += 10) {
        pages.push(groupItems.slice(i, i + 10));
      }
    });
    return pages;
  }

  function renderFilteredExamCards() {
    if (!deps || !deps.cardsPages) return;
    const students = getFilteredCardsStudents();
    if (!students.length) {
      deps.cardsPages.innerHTML =
        '<div class="muted">Tidak ada data kartu sesuai filter saat ini.</div>';
      setCardsMeta("Belum ada kartu yang bisa dicetak dari filter ini.");
      return;
    }
    deps.cardsPages.innerHTML = "";
    buildCardsPages(students).forEach(function (pageItems) {
      deps.cardsPages.appendChild(renderExamCardsPage(pageItems));
    });
    setCardsMeta(
      "Total kartu siap cetak: " +
        String(students.length) +
        " peserta (siswa) sesuai filter, dikelompokkan per kelas.",
    );
  }

  function bindHandlers() {
    if (!deps) return;

    if (deps.cardsPages) {
      deps.cardsPages.addEventListener("click", function (e) {
        const pickBtn = e.target && e.target.closest("button[data-photo-pick]");
        if (pickBtn) {
          const userID = String(pickBtn.getAttribute("data-photo-pick") || "");
          if (!userID) return;
          const input = deps.cardsPages.querySelector(
            'input[data-photo-input="' + CSS.escape(userID) + '"]',
          );
          if (input) input.click();
          return;
        }
        const clearBtn =
          e.target && e.target.closest("button[data-photo-clear]");
        if (clearBtn) {
          const userID = String(
            clearBtn.getAttribute("data-photo-clear") || "",
          );
          if (!userID) return;
          (async function () {
            try {
              await deps.api(
                "/api/v1/admin/users/" + encodeURIComponent(userID) + "/photo",
                "DELETE",
                {},
              );
              delete cardsPhotoByUserID[userID];
              deps.setMsg("Foto peserta dihapus.");
              renderFilteredExamCards();
            } catch (err) {
              deps.setMsg("Gagal hapus foto: " + err.message);
            }
          })();
        }
      });

      deps.cardsPages.addEventListener("change", function (e) {
        const input = e.target && e.target.closest("input[data-photo-input]");
        if (!input) return;
        const userID = String(input.getAttribute("data-photo-input") || "");
        if (!userID) return;
        const file = input.files && input.files[0];
        if (!file) return;
        if (!String(file.type || "").startsWith("image/")) {
          deps.setMsg("File foto harus berupa gambar.");
          input.value = "";
          return;
        }
        if (Number(file.size || 0) > 2 * 1024 * 1024) {
          deps.setMsg("Ukuran foto maksimal 2MB.");
          input.value = "";
          return;
        }
        (async function () {
          const form = new FormData();
          form.append("file", file);
          try {
            const out = await deps.apiMultipart(
              "/api/v1/admin/users/" + encodeURIComponent(userID) + "/photo",
              "POST",
              form,
            );
            cardsPhotoByUserID[userID] = String(
              (out && out.photo_data_url) || "",
            ).trim();
            deps.setMsg("Foto peserta berhasil disimpan.");
            renderFilteredExamCards();
          } catch (err) {
            deps.setMsg("Upload foto gagal: " + err.message);
          } finally {
            input.value = "";
          }
        })();
      });
    }

    if (deps.cardsForm) {
      deps.cardsForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const examID = Number(
          (deps.cardsExamSelect && deps.cardsExamSelect.value) || 0,
        );
        if (examID <= 0) {
          deps.setMsg("Pilih ujian terlebih dahulu.");
          return;
        }
        const done = deps.beginBusy(
          deps.cardsForm,
          deps.msg,
          "Memuat kartu ujian...",
        );
        try {
          await loadExamCards(examID);
          deps.setMsg("Kartu ujian berhasil dimuat.");
        } catch (err) {
          deps.setMsg("Gagal memuat kartu ujian: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (deps.cardsSchoolSelect) {
      deps.cardsSchoolSelect.addEventListener("change", function () {
        fillCardsClassOptions(cardsStudentsAll);
        renderFilteredExamCards();
      });
    }
    if (deps.cardsClassSelect) {
      deps.cardsClassSelect.addEventListener("change", function () {
        renderFilteredExamCards();
      });
    }
    if (deps.cardsOnlyActiveInput) {
      deps.cardsOnlyActiveInput.addEventListener("change", function () {
        renderFilteredExamCards();
      });
    }

    if (deps.cardsPrintBtn) {
      deps.cardsPrintBtn.addEventListener("click", function () {
        if (!deps.cardsPages) return;
        if (!deps.cardsPages.querySelector(".proktor-card:not(.is-empty)")) {
          deps.setMsg("Belum ada kartu untuk dicetak.");
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

  window.ProktorCards = {
    init: init,
    loadExamCards: loadExamCards,
  };
})();
