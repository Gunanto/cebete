(function () {
  function init(deps) {
    const manuscriptImportBtn = document.getElementById(
      "guru-manuscript-import-btn",
    );
    const manuscriptImportDialog = document.getElementById(
      "guru-manuscript-import-dialog",
    );
    const manuscriptImportForm = document.getElementById(
      "guru-manuscript-import-form",
    );
    const manuscriptImportSubjectSelect = document.getElementById(
      "guru-manuscript-import-subject-select",
    );
    const manuscriptImportFileInput = document.getElementById(
      "guru-manuscript-import-file",
    );
    const manuscriptImportOutput = document.getElementById(
      "guru-manuscript-import-output",
    );
    const manuscriptImportCancelBtn = document.getElementById(
      "guru-manuscript-import-cancel-btn",
    );
    const manuscriptsPanel = document.getElementById("guru-manuscripts-panel");
    const manuscriptQuestionSelect = document.getElementById(
      "guru-manuscript-question-select",
    );

    if (manuscriptImportBtn) {
      manuscriptImportBtn.addEventListener("click", function () {
        if (deps.fillSubjectSelect) {
          deps.fillSubjectSelect(manuscriptImportSubjectSelect, false);
        }
        if (manuscriptImportForm) manuscriptImportForm.reset();
        if (manuscriptImportOutput) {
          manuscriptImportOutput.textContent =
            "Format didukung: (1) TYPE/Stimulus/Q/Opsi/Kunci + opsional KodeTP, atau (2) CSV header Mapel,Kode Soal,Kode TP,Nama Kode,stimulus,soal,opsi,kunci jawaban,Penjelasan. Mapel akan dipaksa ke pilihan dialog.";
        }
        if (
          manuscriptImportDialog &&
          typeof manuscriptImportDialog.showModal === "function"
        ) {
          manuscriptImportDialog.showModal();
        }
      });
    }

    if (manuscriptImportCancelBtn) {
      manuscriptImportCancelBtn.addEventListener("click", function () {
        if (
          manuscriptImportDialog &&
          typeof manuscriptImportDialog.close === "function"
        ) {
          manuscriptImportDialog.close();
        }
      });
    }

    if (manuscriptImportForm) {
      manuscriptImportForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const fallbackSubjectID = Number(
          (manuscriptImportSubjectSelect &&
            manuscriptImportSubjectSelect.value) ||
            0,
        );
        if (fallbackSubjectID <= 0) {
          deps.setMsg("Mapel wajib dipilih sebelum import soal.");
          return;
        }
        const file =
          manuscriptImportFileInput &&
          manuscriptImportFileInput.files &&
          manuscriptImportFileInput.files[0];
        if (!file) {
          deps.setMsg("Pilih file CSV/TXT untuk import soal.");
          return;
        }
        const done = deps.beginBusy(
          manuscriptImportForm,
          deps.msg,
          "Mengimpor soal dari CSV Word...",
        );
        try {
          const rawText = await file.text();
          const parsedImport = deps.parseImportContent(rawText);
          const importItems = Array.isArray(parsedImport.items)
            ? parsedImport.items
            : [];
          if (!importItems.length) {
            throw new Error("File tidak berisi blok soal yang valid.");
          }
          const report = {
            total_blocks: importItems.length,
            success_blocks: 0,
            failed_blocks: 0,
            deduped_blocks: 0,
            errors: [],
            imported_question_ids: [],
          };
          const defaultLearningGoalBySubject = {};
          await deps.loadQuestionCodes(fallbackSubjectID || 0);
          for (let i = 0; i < importItems.length; i += 1) {
            const blockNo = i + 1;
            try {
              const parsed =
                parsedImport.mode === "tabular"
                  ? deps.parseImportQuestionRow(importItems[i], blockNo)
                  : deps.parseImportQuestionBlock(importItems[i], blockNo);
              const subjectID = fallbackSubjectID;
              if (!defaultLearningGoalBySubject[subjectID]) {
                const resolved = deps.resolveDefaultLearningGoalID(subjectID);
                if (resolved <= 0) {
                  const sub = deps.findSubjectByID(subjectID);
                  const label = sub
                    ? String(sub.name || "")
                    : "#" + String(subjectID);
                  throw new Error(
                    "Blok " +
                      String(blockNo) +
                      ': tujuan pembelajaran mapel "' +
                      label +
                      '" belum tersedia.',
                  );
                }
                defaultLearningGoalBySubject[subjectID] = resolved;
              }
              let learningGoalID = defaultLearningGoalBySubject[subjectID];
              if (parsed.learning_goal_code) {
                const resolvedByCode = Number(
                  (typeof deps.resolveLearningGoalIDByCode === "function"
                    ? deps.resolveLearningGoalIDByCode(
                        subjectID,
                        parsed.learning_goal_code,
                      )
                    : 0) || 0,
                );
                if (resolvedByCode <= 0) {
                  throw new Error(
                    "Blok " +
                      String(blockNo) +
                      ': KodeTP "' +
                      String(parsed.learning_goal_code || "") +
                      '" tidak ditemukan untuk mapel terpilih.',
                  );
                }
                learningGoalID = resolvedByCode;
              }
              let stimulusHTML = "";
              const questionCodeID = await deps.ensureQuestionCodeForImport(
                subjectID,
                parsed.question_code_code,
                parsed.question_code_name,
              );
              if (parsed.stimulus_text) {
                const safeStimulus = deps.escapeHtml(parsed.stimulus_text);
                stimulusHTML = "<p>" + safeStimulus + "</p>";
              }
              const blueprint = await deps.api("/api/v1/questions", "POST", {
                subject_id: subjectID,
                learning_goal_id: learningGoalID,
                question_code_id: questionCodeID,
                question_type: parsed.question_type,
                title: parsed.title,
                indicator: parsed.indicator,
                material: parsed.material,
                objective: parsed.objective,
                cognitive_level: parsed.cognitive_level,
              });
              let qid = Number((blueprint && blueprint.id) || 0);
              if (qid <= 0) {
                throw new Error("gagal membuat soal.");
              }
              const versionResp = await deps.api(
                "/api/v1/questions/" + qid + "/versions",
                "POST",
                {
                  dedup: true,
                  stimulus_html: stimulusHTML,
                  stem_html: parsed.stem_html,
                  explanation_html: parsed.explanation_html || "",
                  answer_key: parsed.answer_key,
                  options: parsed.options,
                },
              );
              if (versionResp && versionResp.deduped) {
                report.deduped_blocks += 1;
                const existingID = Number(
                  versionResp.question_id ||
                    versionResp.existing_question_id ||
                    0,
                );
                if (existingID > 0) {
                  qid = existingID;
                }
              }
              report.success_blocks += 1;
              report.imported_question_ids.push(qid);
            } catch (err) {
              report.failed_blocks += 1;
              report.errors.push({
                block: blockNo,
                error: String((err && err.message) || "error tidak diketahui"),
              });
            }
          }
          if (manuscriptImportOutput) {
            manuscriptImportOutput.textContent = JSON.stringify(
              report,
              null,
              2,
            );
          }
          await Promise.all([deps.loadBlueprints(fallbackSubjectID || 0)]);
          if (
            manuscriptImportDialog &&
            typeof manuscriptImportDialog.close === "function"
          ) {
            manuscriptImportDialog.close();
          }
          if (manuscriptImportForm) manuscriptImportForm.reset();
          const importedQuestionIDs = Array.from(
            new Set(
              (Array.isArray(report.imported_question_ids)
                ? report.imported_question_ids
                : []
              )
                .map(function (v) {
                  return Number(v || 0);
                })
                .filter(function (v) {
                  return v > 0;
                }),
            ),
          );
          if (importedQuestionIDs.length) {
            const batches = await Promise.all(
              importedQuestionIDs.map(function (qid) {
                return deps.api(
                  "/api/v1/questions/" + qid + "/versions",
                  "GET",
                );
              }),
            );
            const mergedVersions = batches
              .reduce(function (acc, items) {
                if (Array.isArray(items)) return acc.concat(items);
                return acc;
              }, [])
              .sort(function (a, b) {
                const ta = new Date(
                  a && a.created_at ? a.created_at : 0,
                ).getTime();
                const tb = new Date(
                  b && b.created_at ? b.created_at : 0,
                ).getTime();
                if (tb !== ta) return tb - ta;
                const qa = Number((a && a.question_id) || 0);
                const qb = Number((b && b.question_id) || 0);
                if (qb !== qa) return qb - qa;
                return (
                  Number((b && b.version_no) || 0) -
                  Number((a && a.version_no) || 0)
                );
              });
            deps.renderManuscripts(mergedVersions);
            if (manuscriptsPanel) {
              deps.activateGuruMenu("manuscripts");
            }
            if (manuscriptQuestionSelect) {
              manuscriptQuestionSelect.value = String(
                Number(importedQuestionIDs[0] || 0) || "",
              );
            }
          }
          const maxErrorPreview = 8;
          const errorPreview = report.errors.slice(0, maxErrorPreview);
          const errorDetail = report.errors.length
            ? " Penyebab gagal: " +
              errorPreview
                .map(function (it) {
                  return (
                    "blok " +
                    String((it && it.block) || "-") +
                    " (" +
                    String((it && it.error) || "error") +
                    ")"
                  );
                })
                .join("; ") +
              (report.errors.length > maxErrorPreview
                ? "; dan " +
                  String(report.errors.length - maxErrorPreview) +
                  " error lainnya"
                : "")
            : "";
          deps.setMsg(
            "Import soal selesai. Berhasil: " +
              String(report.success_blocks) +
              ", dedup: " +
              String(report.deduped_blocks) +
              ", gagal: " +
              String(report.failed_blocks) +
              "." +
              errorDetail,
          );
        } catch (err) {
          if (manuscriptImportOutput) {
            manuscriptImportOutput.textContent =
              "Import gagal:\n" +
              String((err && err.message) || "Request failed");
          }
          deps.setMsg("Import soal gagal: " + err.message);
        } finally {
          done();
        }
      });
    }
  }

  window.ManuscriptImport = { init: init };
})();
