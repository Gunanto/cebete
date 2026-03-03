(function () {
  var deps = null;

  function setDeps(opts) {
    deps = opts || {};
  }

  function setTokenResult(value) {
    if (!deps || !deps.tokenResult) return;
    deps.text(deps.tokenResult, value);
    deps.tokenResult.classList.remove("muted");
  }

  function bindHandlers() {
    if (!deps || !deps.tokenForm) return;
    deps.tokenForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      const examID = Number(
        (deps.tokenExamSelect && deps.tokenExamSelect.value) || 0,
      );
      const ttlMinutes = Number(
        (deps.tokenTTLInput && deps.tokenTTLInput.value) || 120,
      );
      if (examID <= 0) {
        deps.setMsg("Pilih ujian terlebih dahulu.");
        return;
      }
      const done = deps.beginBusy(
        deps.tokenForm,
        deps.msg,
        "Membuat token ujian...",
      );
      try {
        const out = await deps.api(
          "/api/v1/admin/exams/" + examID + "/token",
          "POST",
          { ttl_minutes: ttlMinutes },
        );
        const expiresAt = out && out.expires_at ? deps.fmtDate(out.expires_at) : "-";
        setTokenResult(
          "Token: " +
            String((out && out.token) || "-") +
            " | Berlaku sampai: " +
            expiresAt,
        );
        deps.setMsg("Token ujian berhasil dibuat.");
      } catch (err) {
        deps.setMsg("Gagal membuat token ujian: " + err.message);
      } finally {
        done();
      }
    });
  }

  function init(opts) {
    setDeps(opts);
    bindHandlers();
  }

  window.ProktorToken = {
    init: init,
  };
})();
