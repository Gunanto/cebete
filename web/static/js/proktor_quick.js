(function () {
  var deps = null;

  function setDeps(opts) {
    deps = opts || {};
  }

  function init(opts) {
    setDeps(opts);
  }

  window.ProktorQuick = {
    init: init,
  };
})();
