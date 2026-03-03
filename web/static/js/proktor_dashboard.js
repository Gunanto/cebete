(function () {
  var deps = null;

  function setDeps(opts) {
    deps = opts || {};
  }

  async function loadProktorStatsAndPending() {
    const results = await Promise.all([
      deps.api("/api/v1/admin/dashboard/stats", "GET"),
      deps.loadPendingRegistrations(),
    ]);
    const stats = results[0] || {};
    const totalUsers =
      Number(stats.admin_count || 0) +
      Number(stats.proktor_count || 0) +
      Number(stats.guru_count || 0) +
      Number(stats.siswa_count || 0);
    if (deps.statUsers) deps.statUsers.textContent = String(totalUsers);
    if (deps.statSchools)
      deps.statSchools.textContent = String(stats.school_count || 0);
  }

  function init(opts) {
    setDeps(opts);
  }

  window.ProktorDashboard = {
    init: init,
    loadProktorStatsAndPending: loadProktorStatsAndPending,
  };
})();
