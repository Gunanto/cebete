(function () {
  var deps = null;
  var versionsCache = [];
  var allItems = [];
  var page = 1;
  var pageSize = 15;
  var selectedKeys = new Set();

  function setMsg(message) {
    if (deps && typeof deps.setManuscriptMsg === "function") {
      deps.setManuscriptMsg(message);
    }
  }

  function manuscriptRowKey(item) {
    var qid = Number((item && item.question_id) || 0);
    var ver = Number((item && item.version_no) || 0);
    return String(qid) + ":" + String(ver);
  }

  function updateBulkState(items) {
    if (!deps) return;
    var rows = Array.isArray(items) ? items : [];
    var selectable = rows.filter(function (it) {
      return !!it;
    });
    var selectableCount = selectable.length;
    var selectedCount = selectable.filter(function (it) {
      return selectedKeys.has(manuscriptRowKey(it));
    }).length;
    if (deps.bulkDeleteBtn) {
      deps.bulkDeleteBtn.disabled = selectedCount === 0;
    }
    if (deps.deleteAllBtn) {
      deps.deleteAllBtn.disabled = selectableCount === 0;
    }
    if (!deps.selectAll) return;
    if (selectableCount === 0) {
      deps.selectAll.checked = false;
      deps.selectAll.indeterminate = false;
      deps.selectAll.disabled = true;
      return;
    }
    deps.selectAll.disabled = false;
    deps.selectAll.checked =
      selectedCount > 0 && selectedCount === selectableCount;
    deps.selectAll.indeterminate =
      selectedCount > 0 && selectedCount < selectableCount;
  }

  function pruneSelections(items) {
    var rows = Array.isArray(items) ? items : [];
    var valid = new Set(
      rows.map(function (it) {
        return manuscriptRowKey(it);
      }),
    );
    Array.from(selectedKeys).forEach(function (key) {
      if (!valid.has(key)) selectedKeys.delete(key);
    });
  }

  function renderRows(items) {
    if (!deps || !deps.body) return;
    if (!Array.isArray(items) || items.length === 0) {
      deps.body.innerHTML =
        '<tr><td colspan="8" class="muted">Belum ada data versi naskah.</td></tr>';
      updateBulkState([]);
      return;
    }
    deps.body.innerHTML = "";
    items.forEach(function (it) {
      var key = manuscriptRowKey(it);
      var tr = document.createElement("tr");
      tr.innerHTML = [
        '<td><input type="checkbox" data-manuscript-select="' +
          deps.escapeHtml(key) +
          '"' +
          (selectedKeys.has(key) ? " checked" : "") +
          " /></td>",
        "<td>" + deps.escapeHtml(deps.resolveQuestionCode(it) || "-") + "</td>",
        "<td>" + deps.escapeHtml(deps.resolveLearningGoal(it) || "-") + "</td>",
        "<td>" +
          deps.escapeHtml(deps.previewText(it.stimulus_html, 70)) +
          "</td>",
        "<td>" + deps.escapeHtml(deps.previewText(it.stem_html, 90)) + "</td>",
        "<td>" +
          deps.escapeHtml(
            deps.shortQuestionType(deps.resolveQuestionType(it)),
          ) +
          "</td>",
        "<td>" + deps.escapeHtml(deps.fmtDate(it.created_at)) + "</td>",
      ].join("");
      var tdAction = document.createElement("td");
      var actionWrap = document.createElement("span");
      actionWrap.className = "action-icons";
      var qid = Number((it && it.question_id) || 0);
      var ver = Number((it && it.version_no) || 0);
      var iconMap = {
        "preview-manuscript":
          '<svg viewBox="0 0 24 24" focusable="false"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>',
        "edit-manuscript":
          '<svg viewBox="0 0 24 24" focusable="false"><path d="M3 17.25V21h3.75L17.8 9.95l-3.75-3.75L3 17.25z"/><path d="M14.05 6.2l3.75 3.75"/></svg>',
        "delete-manuscript":
          '<svg viewBox="0 0 24 24" focusable="false"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>',
      };
      [
        { action: "preview-manuscript", title: "Lihat", danger: false },
        { action: "edit-manuscript", title: "Ubah", danger: false },
        { action: "delete-manuscript", title: "Hapus", danger: true },
      ].forEach(function (cfg) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = cfg.danger ? "icon-only-btn danger" : "icon-only-btn";
        btn.setAttribute("data-action", cfg.action);
        btn.setAttribute("data-question-id", String(qid));
        btn.setAttribute("data-version-no", String(ver));
        btn.setAttribute("title", cfg.title);
        btn.setAttribute("aria-label", cfg.title);
        btn.innerHTML = iconMap[cfg.action] || "";
        actionWrap.appendChild(btn);
      });
      tdAction.appendChild(actionWrap);
      tr.appendChild(tdAction);
      deps.body.appendChild(tr);
    });
    updateBulkState(items);
  }

  function updatePaginationInfo(totalRows, pageRows) {
    if (!deps || !deps.pageInfo) return;
    if (totalRows <= 0 || pageRows <= 0) {
      deps.pageInfo.textContent = "Baris 0 - 0";
      return;
    }
    var from = (page - 1) * pageSize + 1;
    var to = from + pageRows - 1;
    deps.pageInfo.textContent =
      "Baris " +
      String(from) +
      " - " +
      String(to) +
      " dari " +
      String(totalRows);
  }

  function render(items) {
    allItems = Array.isArray(items) ? items.slice() : [];
    if (deps && typeof deps.refreshStats === "function") {
      deps.refreshStats();
    }
    if (deps && deps.panel && !deps.panel.hidden) {
      if (typeof deps.activateMenu === "function") {
        deps.activateMenu("manuscripts");
      }
    }
    versionsCache = allItems.slice();
    var total = allItems.length;
    var totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
    if (page > totalPages) page = totalPages;
    if (page < 1) page = 1;
    var start = (page - 1) * pageSize;
    var pageRows = allItems.slice(start, start + pageSize);
    pruneSelections(allItems);
    renderRows(pageRows);
    updatePaginationInfo(total, pageRows.length);
    if (deps && deps.prevBtn) deps.prevBtn.disabled = page <= 1;
    if (deps && deps.nextBtn) deps.nextBtn.disabled = page >= totalPages;
  }

  function getCount() {
    return Array.isArray(allItems) ? allItems.length : 0;
  }

  function getSelectedItems() {
    var rows = Array.isArray(allItems) ? allItems : [];
    return rows
      .filter(function (it) {
        return selectedKeys.has(manuscriptRowKey(it));
      })
      .map(function (it) {
        return {
          question_id: Number((it && it.question_id) || 0),
          version_no: Number((it && it.version_no) || 0),
        };
      })
      .filter(function (it) {
        return it.question_id > 0 && it.version_no > 0;
      });
  }

  function getAllItems() {
    var rows = Array.isArray(allItems) ? allItems : [];
    return rows
      .map(function (it) {
        return {
          question_id: Number((it && it.question_id) || 0),
          version_no: Number((it && it.version_no) || 0),
        };
      })
      .filter(function (it) {
        return it.question_id > 0 && it.version_no > 0;
      });
  }

  function getQuestionCount() {
    if (!Array.isArray(allItems) || !allItems.length) return 0;
    var ids = new Set();
    allItems.forEach(function (it) {
      var id = Number((it && it.question_id) || 0);
      if (id > 0) ids.add(id);
    });
    return ids.size;
  }

  function setPage(nextPage) {
    var p = Number(nextPage || 1);
    if (!isFinite(p) || p <= 0) p = 1;
    page = p;
    render(allItems);
  }

  async function reloadByCurrentScope(fallbackQuestionID) {
    var questionIDs = Array.from(
      new Set(
        (Array.isArray(versionsCache) ? versionsCache : [])
          .map(function (it) {
            return Number((it && it.question_id) || 0);
          })
          .filter(function (v) {
            return v > 0;
          }),
      ),
    );
    if (!questionIDs.length) {
      var qid = Number(
        fallbackQuestionID ||
          (deps.questionSelect && deps.questionSelect.value) ||
          0,
      );
      if (qid <= 0) {
        render([]);
        return;
      }
      var one = await deps.api("/api/v1/questions/" + qid + "/versions", "GET");
      render(Array.isArray(one) ? one : []);
      return;
    }
    var settled = await Promise.allSettled(
      questionIDs.map(function (qid) {
        return deps.api("/api/v1/questions/" + qid + "/versions", "GET");
      }),
    );
    var merged = settled
      .map(function (it) {
        return it && it.status === "fulfilled" ? it.value : [];
      })
      .reduce(function (acc, rows) {
        if (Array.isArray(rows)) return acc.concat(rows);
        return acc;
      }, [])
      .sort(function (a, b) {
        var ta = new Date(a && a.created_at ? a.created_at : 0).getTime();
        var tb = new Date(b && b.created_at ? b.created_at : 0).getTime();
        if (tb !== ta) return tb - ta;
        var qa = Number((a && a.question_id) || 0);
        var qb = Number((b && b.question_id) || 0);
        if (qb !== qa) return qb - qa;
        return (
          Number((b && b.version_no) || 0) - Number((a && a.version_no) || 0)
        );
      });
    render(merged);
  }

  async function findItemByKey(questionID, versionNo) {
    var qid = Number(questionID || 0);
    var ver = Number(versionNo || 0);
    if (qid <= 0 || ver <= 0) return null;
    var fromCache = (Array.isArray(versionsCache) ? versionsCache : []).find(
      function (it) {
        return (
          Number((it && it.question_id) || 0) === qid &&
          Number((it && it.version_no) || 0) === ver
        );
      },
    );
    if (fromCache) return fromCache;
    var rows = await deps.api("/api/v1/questions/" + qid + "/versions", "GET");
    var list = Array.isArray(rows) ? rows : [];
    var found = list.find(function (it) {
      return Number((it && it.version_no) || 0) === ver;
    });
    if (found) {
      versionsCache = Array.isArray(versionsCache)
        ? versionsCache.concat([found])
        : [found];
      return found;
    }
    return null;
  }

  async function runRowAction(btn, action, questionID, versionNo) {
    var item = null;
    try {
      item = await findItemByKey(questionID, versionNo);
    } catch (err) {
      setMsg(
        "Gagal memuat data naskah Question " +
          String(questionID) +
          " versi " +
          String(versionNo) +
          ": " +
          String((err && err.message) || "request error"),
      );
      return;
    }
    if (!item) {
      setMsg(
        "Data naskah untuk Question " +
          String(questionID) +
          " versi " +
          String(versionNo) +
          " tidak ditemukan.",
      );
      return;
    }

    if (action === "preview-manuscript") {
      await deps.previewManuscriptVersion(item);
      return;
    }
    if (action === "edit-manuscript") {
      var doneEdit = deps.beginBusy(
        btn,
        deps.msg,
        "Memuat naskah ke editor...",
      );
      try {
        await deps.beginManuscriptEdit(item);
        setMsg(
          "Mode edit aktif untuk Question " +
            String(questionID) +
            " versi " +
            String(versionNo) +
            ".",
        );
      } catch (err) {
        setMsg("Gagal memuat naskah untuk edit: " + err.message);
      } finally {
        doneEdit();
      }
      return;
    }
    if (action === "delete-manuscript") {
      var ok = window.confirm(
        "Hapus naskah versi " +
          String(versionNo) +
          " untuk Question " +
          String(questionID) +
          "?",
      );
      if (!ok) return;
      var done = deps.beginBusy(btn, deps.msg, "Menghapus naskah...");
      try {
        await deps.api(
          "/api/v1/questions/" + questionID + "/versions/" + versionNo,
          "DELETE",
        );
        if (typeof deps.onDeletedEditingVersion === "function") {
          deps.onDeletedEditingVersion(questionID, versionNo);
        }
        await reloadByCurrentScope(questionID);
        setMsg("Naskah berhasil dihapus.");
      } catch (err) {
        setMsg("Hapus naskah gagal: " + err.message);
      } finally {
        done();
      }
      return;
    }
  }

  function init(opts) {
    deps = opts || {};
    pageSize = deps.initialPageSize || pageSize;

    if (deps.body) {
      deps.body.addEventListener("click", async function (e) {
        var btn =
          e.target &&
          e.target.closest(
            "button[data-action][data-question-id][data-version-no]",
          );
        if (!btn) return;
        var action = String(btn.getAttribute("data-action") || "").trim();
        if (
          action !== "preview-manuscript" &&
          action !== "edit-manuscript" &&
          action !== "delete-manuscript"
        ) {
          return;
        }
        var questionID = Number(btn.getAttribute("data-question-id") || 0);
        var versionNo = Number(btn.getAttribute("data-version-no") || 0);
        if (questionID <= 0 || versionNo <= 0) {
          setMsg("Aksi tidak valid: question/version tidak ditemukan.");
          return;
        }
        e.preventDefault();
        await runRowAction(btn, action, questionID, versionNo);
      });

      deps.body.addEventListener("change", function (e) {
        var input = e.target;
        if (!input || input.type !== "checkbox") return;
        var key = String(input.getAttribute("data-manuscript-select") || "");
        if (!key) return;
        if (input.checked) {
          selectedKeys.add(key);
        } else {
          selectedKeys.delete(key);
        }
        updateBulkState(Array.isArray(allItems) ? allItems : []);
      });
    }

    if (deps.selectAll) {
      deps.selectAll.addEventListener("change", function () {
        var checked = !!deps.selectAll.checked;
        var rows = Array.isArray(allItems) ? allItems : [];
        rows.forEach(function (it) {
          var key = manuscriptRowKey(it);
          if (checked) {
            selectedKeys.add(key);
          } else {
            selectedKeys.delete(key);
          }
        });
        renderRows(
          allItems.slice(
            (page - 1) * pageSize,
            (page - 1) * pageSize + pageSize,
          ),
        );
      });
    }

    if (deps.bulkDeleteBtn) {
      deps.bulkDeleteBtn.addEventListener("click", async function () {
        var rows = Array.isArray(allItems) ? allItems : [];
        var targets = rows.filter(function (it) {
          return selectedKeys.has(manuscriptRowKey(it));
        });
        if (!targets.length) return;
        var ok = window.confirm(
          "Hapus " + String(targets.length) + " naskah terpilih?",
        );
        if (!ok) return;
        var done = deps.beginBusy(
          deps.bulkDeleteBtn,
          deps.msg,
          "Menghapus naskah terpilih...",
        );
        try {
          for (var i = 0; i < targets.length; i += 1) {
            var it = targets[i];
            await deps.api(
              "/api/v1/questions/" +
                String(it.question_id) +
                "/versions/" +
                String(it.version_no),
              "DELETE",
            );
            selectedKeys.delete(manuscriptRowKey(it));
          }
          await reloadByCurrentScope(
            Number((deps.questionSelect && deps.questionSelect.value) || 0),
          );
          setMsg("Naskah terpilih berhasil dihapus.");
        } catch (err) {
          setMsg("Hapus naskah terpilih gagal: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (deps.deleteAllBtn) {
      deps.deleteAllBtn.addEventListener("click", async function () {
        var rows = Array.isArray(allItems) ? allItems : [];
        if (!rows.length) return;
        var ok = window.confirm(
          "Hapus semua naskah pada tabel ini? (" +
            String(rows.length) +
            " naskah)",
        );
        if (!ok) return;
        var done = deps.beginBusy(
          deps.deleteAllBtn,
          deps.msg,
          "Menghapus semua naskah...",
        );
        try {
          for (var i = 0; i < rows.length; i += 1) {
            var it = rows[i];
            await deps.api(
              "/api/v1/questions/" +
                String(it.question_id) +
                "/versions/" +
                String(it.version_no),
              "DELETE",
            );
            selectedKeys.delete(manuscriptRowKey(it));
          }
          await reloadByCurrentScope(
            Number((deps.questionSelect && deps.questionSelect.value) || 0),
          );
          selectedKeys.clear();
          setMsg("Semua naskah berhasil dihapus.");
        } catch (err) {
          setMsg("Hapus semua naskah gagal: " + err.message);
        } finally {
          done();
        }
      });
    }

    if (deps.pageSizeSelect) {
      deps.pageSizeSelect.addEventListener("change", function () {
        pageSize = Math.max(1, Number(deps.pageSizeSelect.value) || 15);
        page = 1;
        render(allItems);
      });
    }

    if (deps.prevBtn) {
      deps.prevBtn.addEventListener("click", function () {
        page = Math.max(1, page - 1);
        render(allItems);
      });
    }

    if (deps.nextBtn) {
      deps.nextBtn.addEventListener("click", function () {
        page += 1;
        render(allItems);
      });
    }
  }

  window.ManuscriptTable = {
    init: init,
    render: render,
    reloadByCurrentScope: reloadByCurrentScope,
    findItemByKey: findItemByKey,
    getCount: getCount,
    getQuestionCount: getQuestionCount,
    setPage: setPage,
    getSelectedItems: getSelectedItems,
    getAllItems: getAllItems,
  };
})();
