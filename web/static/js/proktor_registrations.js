(function () {
  var deps = null;
  var selectedIDs = new Set();

  function setDeps(opts) {
    deps = opts || {};
  }

  function resetSelection() {
    selectedIDs = new Set();
    syncSelectionUI();
  }

  function getSelectedIDs() {
    return Array.from(selectedIDs).filter(function (id) {
      return Number(id) > 0;
    });
  }

  function syncSelectionUI() {
    if (deps && deps.regBody) {
      var checkboxes = deps.regBody.querySelectorAll(
        'input[type="checkbox"][data-registration-select]',
      );
      checkboxes.forEach(function (input) {
        var id = Number(input.getAttribute("data-registration-select") || 0);
        input.checked = selectedIDs.has(id);
      });
      if (deps.regSelectAll) {
        deps.regSelectAll.checked =
          checkboxes.length > 0 && getSelectedIDs().length === checkboxes.length;
        deps.regSelectAll.indeterminate =
          getSelectedIDs().length > 0 &&
          getSelectedIDs().length < checkboxes.length;
      }
    }
    if (deps && deps.regBulkApproveBtn) {
      deps.regBulkApproveBtn.disabled = getSelectedIDs().length === 0;
    }
  }

  function summarizeBulkApprove(result) {
    if (!result) return "Pendaftaran terpilih berhasil diproses.";
    var approved = Number(result.approved_count || 0);
    var failed = Number(result.failed_count || 0);
    if (failed <= 0) {
      return approved + " pendaftaran berhasil disetujui.";
    }
    var failures = Array.isArray(result.failures) ? result.failures : [];
    var sample = failures
      .slice(0, 3)
      .map(function (it) {
        return "#" + String(it.id || "-") + ": " + String(it.error || "gagal");
      })
      .join("; ");
    return (
      approved +
      " disetujui, " +
      failed +
      " gagal." +
      (sample ? " " + sample : "")
    );
  }

  async function approveSelected(btn) {
    if (!deps || typeof deps.api !== "function") return;
    var ids = getSelectedIDs();
    if (!ids.length) {
      deps.setMsg("Pilih minimal satu pendaftaran.");
      return;
    }
    if (
      !window.confirm(
        "Setujui " + ids.length + " pendaftaran yang dipilih sekaligus?",
      )
    ) {
      return;
    }
    var done = deps.beginBusy(
      btn,
      deps.msg,
      "Menyetujui pendaftaran terpilih...",
    );
    try {
      var out = await deps.api(
        "/api/v1/admin/registrations/approve-bulk",
        "POST",
        {
          registration_ids: ids,
        },
      );
      deps.setMsg(summarizeBulkApprove(out));
      await loadPendingRegistrations();
    } catch (err) {
      deps.setMsg("Gagal memproses bulk approval: " + err.message);
    } finally {
      done();
    }
  }

  async function loadPendingRegistrations() {
    if (!deps || typeof deps.api !== "function") return [];
    const out = await deps.api(
      "/api/v1/admin/registrations?status=pending&limit=200&offset=0",
      "GET",
    );
    const items = Array.isArray(out.items) ? out.items : [];
    if (deps.statPending) deps.statPending.textContent = String(items.length);
    if (!deps.regBody) return items;
    resetSelection();
    if (!items.length) {
      deps.regBody.innerHTML =
        '<tr><td colspan="9" class="muted">Tidak ada pendaftaran pending.</td></tr>';
      return items;
    }
    deps.regBody.innerHTML = "";
    items.forEach(function (it) {
      const payload = (() => {
        try {
          return JSON.parse(String(it.form_payload || "{}"));
        } catch (_) {
          return {};
        }
      })();
      const schoolName =
        it.school_name ||
        payload.school_name ||
        it.institution_name ||
        payload.institution_name;
      const npsn = it.npsn || payload.npsn;
      const kabupaten = it.kabupaten || payload.kabupaten;
      const provinsi = it.provinsi || payload.provinsi;
      const kecamatan = it.kecamatan || payload.kecamatan;
      const alamat = it.alamat || payload.alamat;
      const schoolEmail = it.school_email || payload.school_email;
      const jenjang = it.jenjang || payload.jenjang;
      const statusSekolah = it.status_sekolah || payload.status_sekolah;
      const className = it.class_name || payload.class_name;
      const detailLines = [
        "Sekolah: " + String(schoolName || "-"),
        "NPSN: " + String(npsn || "-"),
        "Jenjang: " + String(jenjang || "-"),
        "Status Sekolah: " + String(statusSekolah || "-"),
        "Kabupaten: " + String(kabupaten || "-"),
        "Kecamatan: " + String(kecamatan || "-"),
        "Provinsi: " + String(provinsi || "-"),
        "Alamat: " + String(alamat || "-"),
        "Email Sekolah: " + String(schoolEmail || "-"),
        "Kelas: " + String(className || "-"),
      ];
      const detailPayload = encodeURIComponent(detailLines.join("\n"));
      const tr = document.createElement("tr");
      tr.innerHTML = [
        '<td><input type="checkbox" data-registration-select="' +
          deps.escapeHtml(String(it.id || "")) +
          '" aria-label="Pilih pendaftaran ' +
          deps.escapeHtml(String(it.full_name || it.id || "")) +
          '"></td>',
        "<td>" + deps.escapeHtml(String(it.id || "")) + "</td>",
        "<td>" + deps.escapeHtml(String(it.full_name || "")) + "</td>",
        "<td>" + deps.escapeHtml(String(it.email || "")) + "</td>",
        "<td>" + deps.escapeHtml(String(it.role_requested || "")) + "</td>",
        "<td>" + deps.escapeHtml(String(schoolName || "-")) + "</td>",
        "<td>" + deps.escapeHtml(String(kabupaten || "-")) + "</td>",
        "<td>" + deps.escapeHtml(deps.fmtDate(it.created_at)) + "</td>",
        '<td><span class="action-icons">' +
          '<button class="icon-only-btn" type="button" data-action="detail" data-detail="' +
          detailPayload +
          '" title="Lihat Detail" aria-label="Lihat Detail">' +
          '<svg viewBox="0 0 24 24" focusable="false"><path d="M12 7v5m0 4h.01M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z"/></svg>' +
          "</button>" +
          '<button class="icon-only-btn" type="button" data-action="approve" data-id="' +
          deps.escapeHtml(String(it.id || "")) +
          '" title="Setujui" aria-label="Setujui">' +
          '<svg viewBox="0 0 24 24" focusable="false"><path d="M5 13l4 4L19 7"/></svg>' +
          "</button>" +
          '<button class="icon-only-btn danger" type="button" data-action="reject" data-id="' +
          deps.escapeHtml(String(it.id || "")) +
          '" title="Tolak" aria-label="Tolak">' +
          '<svg viewBox="0 0 24 24" focusable="false"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
          "</button>" +
          "</span></td>",
      ].join("");
      deps.regBody.appendChild(tr);
    });
    syncSelectionUI();
    return items;
  }

  function bindHandlers() {
    if (!deps) return;

    if (deps.regRefreshBtn) {
      deps.regRefreshBtn.addEventListener("click", async function () {
        const done = deps.beginBusy(
          deps.regRefreshBtn,
          deps.msg,
          "Memuat pendaftaran pending...",
        );
        try {
          await loadPendingRegistrations();
          deps.setMsg("Data pendaftaran pending berhasil dimuat.");
        } catch (err) {
          deps.setMsg("Gagal memuat pendaftaran pending: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (deps.regSelectAll) {
      deps.regSelectAll.addEventListener("change", function () {
        if (!deps.regBody) return;
        var checked = !!deps.regSelectAll.checked;
        var checkboxes = deps.regBody.querySelectorAll(
          'input[type="checkbox"][data-registration-select]',
        );
        selectedIDs = new Set();
        checkboxes.forEach(function (input) {
          var id = Number(input.getAttribute("data-registration-select") || 0);
          if (checked && id > 0) selectedIDs.add(id);
        });
        syncSelectionUI();
      });
    }

    if (deps.regBulkApproveBtn) {
      deps.regBulkApproveBtn.addEventListener("click", function () {
        approveSelected(deps.regBulkApproveBtn);
      });
    }

    if (deps.regBody) {
      deps.regBody.addEventListener("change", function (e) {
        var input = e.target;
        if (
          !input ||
          input.type !== "checkbox" ||
          !input.hasAttribute("data-registration-select")
        ) {
          return;
        }
        var id = Number(input.getAttribute("data-registration-select") || 0);
        if (!id) return;
        if (input.checked) {
          selectedIDs.add(id);
        } else {
          selectedIDs.delete(id);
        }
        syncSelectionUI();
      });

      deps.regBody.addEventListener("click", async function (e) {
        const btn = e.target && e.target.closest("button[data-action]");
        if (!btn) return;
        const action = String(btn.getAttribute("data-action") || "");
        if (action === "detail") {
          const raw = String(btn.getAttribute("data-detail") || "").trim();
          let detail = raw;
          try {
            detail = decodeURIComponent(raw);
          } catch (_) {
            // ignore
          }
          window.alert(detail || "Tidak ada detail pendaftaran.");
          return;
        }
        const id = Number(btn.getAttribute("data-id") || 0);
        if (!id) return;

        const done = deps.beginBusy(btn, deps.msg, "Memproses pendaftaran...");
        try {
          if (action === "approve") {
            await deps.api(
              "/api/v1/admin/registrations/" + id + "/approve",
              "POST",
              {},
            );
            deps.setMsg("Pendaftaran berhasil disetujui.");
          } else if (action === "reject") {
            const note = window.prompt("Alasan penolakan (opsional):", "");
            if (note === null) return;
            await deps.api(
              "/api/v1/admin/registrations/" + id + "/reject",
              "POST",
              {
                note: String(note || "").trim(),
              },
            );
            deps.setMsg("Pendaftaran berhasil ditolak.");
          }
          await loadPendingRegistrations();
        } catch (err) {
          deps.setMsg("Gagal memproses pendaftaran: " + err.message);
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

  window.ProktorRegistrations = {
    init: init,
    loadPendingRegistrations: loadPendingRegistrations,
  };
})();
