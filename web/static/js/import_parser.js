(function () {
  function escapeHtml(input) {
    return String(input || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function decodeBase64Url(input) {
    const raw = String(input || "")
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const padded = raw + "===".slice((raw.length + 3) % 4);
    try {
      return window.atob(padded);
    } catch (_) {
      return "";
    }
  }

  function buildImportRichHTML(rawText) {
    const text = String(rawText || "").trim();
    if (!text) return "";
    const tokenPattern = /\[\[CBTIMG:([A-Za-z0-9_-]+)\]\]/g;
    const parts = [];
    let lastIndex = 0;
    let match = tokenPattern.exec(text);
    while (match) {
      const before = text.slice(lastIndex, match.index);
      if (before) {
        parts.push(escapeHtml(before).replace(/\r?\n/g, "<br>"));
      }
      const dataURL = decodeBase64Url(match[1]);
      if (dataURL && /^data:image\//i.test(dataURL)) {
        parts.push('<img src="' + escapeHtml(dataURL) + '" alt="gambar soal">');
      }
      lastIndex = tokenPattern.lastIndex;
      match = tokenPattern.exec(text);
    }
    const tail = text.slice(lastIndex);
    if (tail) {
      parts.push(escapeHtml(tail).replace(/\r?\n/g, "<br>"));
    }
    if (!parts.length) return "";
    return "<p>" + parts.join("") + "</p>";
  }

  function buildImportPlainText(rawText) {
    return String(rawText || "")
      .replace(/\[\[CBTIMG:[A-Za-z0-9_-]+\]\]/g, "[gambar]")
      .trim();
  }

  function parseImportTabularRows(rawText) {
    if (!rawText) return [];
    const rows = String(rawText || "")
      .split(/\r?\n/)
      .map(function (line) {
        return String(line || "").trim();
      })
      .filter(Boolean);
    if (!rows.length) return [];
    const header = rows[0].split(",").map(function (v) {
      return String(v || "")
        .trim()
        .toLowerCase();
    });
    const idx = function (name) {
      return header.indexOf(
        String(name || "")
          .trim()
          .toLowerCase(),
      );
    };
    const hasCoreHeader =
      idx("mapel") >= 0 ||
      idx("soal") >= 0 ||
      idx("opsi") >= 0 ||
      idx("kunci jawaban") >= 0;
    if (!hasCoreHeader) return [];
    const idxMapel = idx("mapel");
    const idxKode = idx("kode soal");
    const idxKodeTP = idx("kode tp");
    const idxNama = idx("nama kode");
    const idxStimulus = idx("stimulus");
    const idxSoal = idx("soal");
    const idxOpsi = idx("opsi");
    const idxKunci = idx("kunci jawaban");
    const idxPenjelasan = idx("penjelasan");
    const idxHint = idx("hint");
    const idxTujuan = idx("tujuan pembelajaran");
    const idxMateri = idx("materi");
    const idxKelas = idx("kelas");
    const idxSemester = idx("semester");
    const idxType = idx("tipe") >= 0 ? idx("tipe") : idx("type");
    return rows.slice(1).map(function (line) {
      const parts = splitImportValues(line);
      return {
        mapel: parts[idxMapel] || "",
        kode_soal: parts[idxKode] || "",
        kode_tp: parts[idxKodeTP] || "",
        nama_kode: parts[idxNama] || "",
        stimulus: parts[idxStimulus] || "",
        soal: parts[idxSoal] || "",
        opsi: parts[idxOpsi] || "",
        kunci: parts[idxKunci] || "",
        penjelasan: parts[idxPenjelasan] || "",
        hint: parts[idxHint] || "",
        tujuan_pembelajaran: parts[idxTujuan] || "",
        materi: parts[idxMateri] || "",
        kelas: parts[idxKelas] || "",
        semester: parts[idxSemester] || "",
        type: parts[idxType] || "",
      };
    });
  }

  function parseImportWordBlocks(rawText) {
    if (!rawText) return [];
    const lines = String(rawText || "")
      .split(/\r?\n/)
      .map(function (line) {
        return String(line || "").trim();
      });
    const blocks = [];
    let current = [];
    lines.forEach(function (line) {
      if (!line) {
        if (current.length) {
          blocks.push(current);
          current = [];
        }
        return;
      }
      if (/^TYPE\s*:/i.test(line) && current.length) {
        blocks.push(current);
        current = [line];
        return;
      }
      current.push(line);
    });
    if (current.length) blocks.push(current);
    return blocks;
  }

  function parseImportContent(rawText) {
    const tabularRows = parseImportTabularRows(rawText);
    if (tabularRows.length) return { mode: "tabular", items: tabularRows };
    return { mode: "block", items: parseImportWordBlocks(rawText) };
  }

  function splitImportValues(raw) {
    const out = [];
    let current = "";
    let inQuote = false;
    const text = String(raw || "");
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (ch === '"' && text[i - 1] !== "\\") {
        inQuote = !inQuote;
        continue;
      }
      if (ch === "," && !inQuote) {
        out.push(current.trim());
        current = "";
        continue;
      }
      current += ch;
    }
    if (current) out.push(current.trim());
    return out;
  }

  function normalizeImportMapelValue(raw) {
    return String(raw || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function resolveImportSubjectID(mapelFromFile, fallbackSubjectID, blockNo) {
    const fallbackID = Number(fallbackSubjectID || 0);
    const mapel = normalizeImportMapelValue(mapelFromFile);
    if (!mapel) {
      if (fallbackID > 0) return fallbackID;
      throw new Error(
        "Blok " +
          String(blockNo) +
          ": Mapel wajib ada di file per soal jika tidak memilih Mapel default.",
      );
    }
    const rows = Array.isArray(window.subjectsCache)
      ? window.subjectsCache
      : [];
    const labelFn =
      typeof window.subjectLabel === "function"
        ? window.subjectLabel
        : function (it) {
            return String((it && it.name) || "");
          };
    const exactByName = rows.filter(function (it) {
      return normalizeImportMapelValue(String((it && it.name) || "")) === mapel;
    });
    let matches = exactByName;
    if (!matches.length) {
      const exactByLabel = rows.filter(function (it) {
        return normalizeImportMapelValue(labelFn(it)) === mapel;
      });
      matches = exactByLabel;
    }
    if (!matches.length && mapel.indexOf("|") >= 0) {
      const parts = mapel
        .split("|")
        .map(function (v) {
          return normalizeImportMapelValue(v);
        })
        .filter(Boolean);
      const last = parts.length ? parts[parts.length - 1] : "";
      if (last) {
        matches = rows.filter(function (it) {
          return (
            normalizeImportMapelValue(String((it && it.name) || "")) === last
          );
        });
      }
    }
    if (!matches.length) {
      throw new Error(
        "Blok " +
          String(blockNo) +
          ': Mapel "' +
          String(mapelFromFile || "") +
          '" tidak ditemukan.',
      );
    }
    if (matches.length > 1) {
      const picked = matches.find(function (it) {
        return Number((it && it.id) || 0) === fallbackID;
      });
      if (picked) return Number((picked && picked.id) || 0);
      throw new Error(
        "Blok " +
          String(blockNo) +
          ': Mapel "' +
          String(mapelFromFile || "") +
          '" ambigu. Gunakan format \"Jenjang | Tipe | Nama\" atau pilih Mapel default.',
      );
    }
    return Number((matches[0] && matches[0].id) || 0);
  }

  function mapImportQuestionType(raw) {
    const t = String(raw || "")
      .trim()
      .toLowerCase();
    if (!t) return "";
    if (t === "pg" || t === "pg_tunggal" || t === "mc") return "pg_tunggal";
    if (t === "mr" || t === "multi") return "multi_jawaban";
    if (t === "tf" || t === "bs" || t === "benar_salah_pernyataan")
      return "benar_salah_pernyataan";
    if (
      t === "match" ||
      t === "matching" ||
      t === "menjodohkan_drag_drop" ||
      t === "menjodohkan_drag_and_drop"
    ) {
      return "menjodohkan_drag_drop";
    }
    if (t === "sa" || t === "short_answer" || t === "shortanswer") {
      return "short_answer";
    }
    return t;
  }

  function inferImportQuestionType(item) {
    const key = String(item && item.key_raw ? item.key_raw : "");
    const opts = Array.isArray(item && item.options) ? item.options : [];
    const statements = Array.isArray(item && item.statements)
      ? item.statements
      : [];
    const opsi = String(item && item.opsi_raw ? item.opsi_raw : "")
      .trim()
      .toLowerCase();
    if (key.indexOf("->") >= 0) return "menjodohkan_drag_drop";
    if (opsi.indexOf("prompts:") === 0 || opsi.indexOf("choices:") >= 0) {
      return "menjodohkan_drag_drop";
    }
    if (statements.length) return "benar_salah_pernyataan";
    if (
      opsi === "jawaban singkat" ||
      (!opts.length && key && key.indexOf(",") < 0)
    ) {
      return "short_answer";
    }
    if (key.indexOf(",") >= 0) return "multi_jawaban";
    if (opts.length) return "pg_tunggal";
    return "";
  }

  function splitAnswerTokens(raw, delimiterPattern) {
    return String(raw || "")
      .split(delimiterPattern)
      .map(function (v) {
        return String(v || "").trim();
      })
      .filter(Boolean);
  }

  function buildExplanationHTML(rawExplanation) {
    const text = String(rawExplanation || "").trim();
    if (!text) return "";
    const safe = escapeHtml(text).replace(/\r?\n/g, "<br>");
    return "<p>" + safe + "</p>";
  }

  function parseImportQuestionFromParts(item, blockNo) {
    item.question_type =
      mapImportQuestionType(item.type_raw) || inferImportQuestionType(item);
    if (!item.question_type) {
      throw new Error(
        "Blok " + String(blockNo) + ": TYPE harus MC/MR/TF/MATCH/SA.",
      );
    }
    if (!item.question) {
      throw new Error("Blok " + String(blockNo) + ": soal wajib diisi.");
    }
    if (!item.key_raw) {
      throw new Error(
        "Blok " + String(blockNo) + ": kunci jawaban wajib diisi.",
      );
    }

    let answerKey = {};
    let optionsPayload = [];
    let questionContent = {};
    if (item.question_type === "pg_tunggal") {
      optionsPayload = item.options
        .map(function (it) {
          return {
            option_key: String((it && it.option_key) || "")
              .trim()
              .toUpperCase(),
            option_html: buildImportRichHTML(
              String((it && it.option_html) || "").trim(),
            ),
          };
        })
        .filter(function (it) {
          return it.option_key && it.option_html;
        });
      if (optionsPayload.length < 2) {
        throw new Error(
          "Blok " + String(blockNo) + ": soal MC minimal 2 opsi.",
        );
      }
      const correct = String(item.key_raw || "")
        .split(",")[0]
        .trim()
        .toUpperCase();
      if (!correct) {
        throw new Error("Blok " + String(blockNo) + ": kunci MC tidak valid.");
      }
      answerKey = { correct: correct };
    } else if (item.question_type === "multi_jawaban") {
      optionsPayload = item.options
        .map(function (it) {
          return {
            option_key: String((it && it.option_key) || "")
              .trim()
              .toUpperCase(),
            option_html: buildImportRichHTML(
              String((it && it.option_html) || "").trim(),
            ),
          };
        })
        .filter(function (it) {
          return it.option_key && it.option_html;
        });
      if (optionsPayload.length < 2) {
        throw new Error(
          "Blok " + String(blockNo) + ": soal MR minimal 2 opsi.",
        );
      }
      const keys = String(item.key_raw || "")
        .split(",")
        .map(function (v) {
          return String(v || "")
            .trim()
            .toUpperCase();
        })
        .filter(Boolean);
      if (!keys.length) {
        throw new Error("Blok " + String(blockNo) + ": kunci MR tidak valid.");
      }
      answerKey = { correct: keys, mode: "exact" };
    } else if (item.question_type === "benar_salah_pernyataan") {
      const statements = item.statements
        .map(function (it) {
          return {
            id: String((it && it.id) || "")
              .trim()
              .toUpperCase(),
            statement: buildImportRichHTML(
              String((it && it.statement) || "").trim(),
            ),
          };
        })
        .filter(function (it) {
          return it.id && it.statement;
        });
      if (!statements.length) {
        throw new Error(
          "Blok " + String(blockNo) + ": soal TF butuh P1/P2/P3...",
        );
      }
      const keys = String(item.key_raw || "")
        .split(",")
        .map(function (v) {
          return String(v || "")
            .trim()
            .toUpperCase();
        })
        .filter(Boolean);
      if (keys.length !== statements.length) {
        throw new Error(
          "Blok " +
            String(blockNo) +
            ": jumlah Kunci TF harus sama dengan jumlah pernyataan.",
        );
      }
      answerKey = {
        statements: statements.map(function (st, idx) {
          const flag = keys[idx];
          if (flag !== "T" && flag !== "F") {
            throw new Error(
              "Blok " +
                String(blockNo) +
                ": nilai Kunci TF harus T/F (contoh: T, F, T).",
            );
          }
          return {
            id: st.id,
            statement: st.statement,
            correct: flag === "T",
          };
        }),
      };
    } else if (item.question_type === "menjodohkan_drag_drop") {
      const prompts = item.statements
        .map(function (it, idx) {
          return {
            id:
              String((it && it.id) || "")
                .trim()
                .toUpperCase() || "P" + String(idx + 1),
            html: buildImportRichHTML(
              String((it && it.statement) || "").trim(),
            ),
          };
        })
        .filter(function (it) {
          return it.id && it.html;
        });
      const choices = item.options
        .map(function (it, idx) {
          return {
            id:
              String((it && it.option_key) || "")
                .trim()
                .toUpperCase() || String.fromCharCode(65 + idx),
            html: buildImportRichHTML(
              String((it && it.option_html) || "").trim(),
            ),
          };
        })
        .filter(function (it) {
          return it.id && it.html;
        });
      if (!prompts.length || !choices.length) {
        throw new Error(
          "Blok " +
            String(blockNo) +
            ": soal MATCH butuh prompt P1/P2/... dan pilihan A/B/....",
        );
      }
      const pairs = splitAnswerTokens(item.key_raw, /[,|]/)
        .map(function (pair) {
          const tokens = String(pair || "").split("->");
          if (tokens.length !== 2) return null;
          const promptID = String(tokens[0] || "")
            .trim()
            .toUpperCase();
          const choiceID = String(tokens[1] || "")
            .trim()
            .toUpperCase();
          if (!promptID || !choiceID) return null;
          return { prompt_id: promptID, choice_id: choiceID };
        })
        .filter(Boolean);
      if (pairs.length !== prompts.length) {
        throw new Error(
          "Blok " +
            String(blockNo) +
            ": jumlah pasangan MATCH harus sama dengan jumlah prompt.",
        );
      }
      questionContent = { prompts: prompts, choices: choices };
      answerKey = { mode: "exact", pairs: pairs };
    } else if (item.question_type === "short_answer") {
      const acceptedAnswers = splitAnswerTokens(item.key_raw, /\|/);
      if (!acceptedAnswers.length) {
        throw new Error(
          "Blok " + String(blockNo) + ": kunci short answer tidak valid.",
        );
      }
      questionContent = {
        input_type: "textarea",
        max_length: 33,
      };
      answerKey = {
        accepted_answers: acceptedAnswers,
        match_mode: "normalized_exact",
      };
    }

    const stemHTML = buildImportRichHTML(item.question || "");
    const title = buildImportPlainText(item.question || "").slice(0, 180);
    return {
      question_type: item.question_type,
      title: title || "Import Soal",
      indicator: "Import Soal CSV Word",
      material: buildImportPlainText(item.stimulus || "") || "Import Soal",
      objective: "Import otomatis dari CSV Word",
      cognitive_level: "C2",
      stimulus_text: buildImportPlainText(item.stimulus || ""),
      stimulus_html: buildImportRichHTML(item.stimulus || ""),
      stem_html: stemHTML,
      explanation_html: buildImportRichHTML(item.explanation || ""),
      hint_html: buildImportRichHTML(item.hint || ""),
      question_content: questionContent,
      answer_key: answerKey,
      options: optionsPayload,
      mapel: String(item.mapel || "").trim(),
      question_code_code: String(item.question_code_code || "").trim(),
      question_code_name: String(item.question_code_name || "").trim(),
      learning_goal_code: String(item.learning_goal_code || "").trim(),
      learning_goal_text: String(item.learning_goal_text || "").trim(),
      learning_goal_materi: String(item.learning_goal_materi || "").trim(),
      learning_goal_kelas: String(item.learning_goal_kelas || "").trim(),
      learning_goal_semester: String(item.learning_goal_semester || "").trim(),
      hint: String(item.hint || "").trim(),
    };
  }

  function normalizeTextKey(raw) {
    return String(raw || "")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&#39;/gi, "'")
      .replace(/&quot;/gi, '"')
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function parseImportQuestionBlock(lines, blockNo) {
    const item = {
      type_raw: "",
      mapel: "",
      question_code_code: "",
      question_code_name: "",
      learning_goal_code: "",
      explanation: "",
      hint: "",
      question_type: "",
      stimulus: "",
      question: "",
      options: [],
      statements: [],
      key_raw: "",
    };
    let lastField = "";
    let lastOptionIdx = -1;
    let lastStatementIdx = -1;
    const appendContinuation = function (rawLine) {
      const extra = String(rawLine || "").trim();
      if (!extra) return;
      if (lastField === "stimulus") {
        item.stimulus = (item.stimulus ? item.stimulus + "\n" : "") + extra;
        return;
      }
      if (lastField === "question") {
        item.question = (item.question ? item.question + "\n" : "") + extra;
        return;
      }
      if (lastField === "explanation") {
        item.explanation =
          (item.explanation ? item.explanation + "\n" : "") + extra;
        return;
      }
      if (lastField === "hint") {
        item.hint = (item.hint ? item.hint + "\n" : "") + extra;
        return;
      }
      if (lastField === "option" && lastOptionIdx >= 0) {
        const opt = item.options[lastOptionIdx];
        if (opt) {
          opt.option_html =
            (opt.option_html ? opt.option_html + "\n" : "") + extra;
        }
        return;
      }
      if (lastField === "statement" && lastStatementIdx >= 0) {
        const st = item.statements[lastStatementIdx];
        if (st) {
          st.statement = (st.statement ? st.statement + "\n" : "") + extra;
        }
        return;
      }
      if (lastField === "kunci") {
        lastField = "explanation";
        item.explanation =
          (item.explanation ? item.explanation + "\n" : "") + extra;
      }
    };
    (Array.isArray(lines) ? lines : []).forEach(function (line) {
      const raw = String(line || "");
      const idx = raw.indexOf(":");
      if (idx < 0) {
        appendContinuation(raw);
        return;
      }
      const rawKey = raw.slice(0, idx).trim();
      const val = raw.slice(idx + 1).trim();
      if (!rawKey) return;
      const keyCompact = rawKey.replace(/[\s_]+/g, "").toUpperCase();
      const keyUpper = rawKey.trim().toUpperCase();
      const isHeaderKey =
        keyCompact === "TYPE" ||
        keyCompact === "MAPEL" ||
        keyCompact === "MATAPELAJARAN" ||
        keyCompact === "KODESOAL" ||
        keyCompact === "KODE" ||
        keyCompact === "KODETP" ||
        keyCompact === "NAMAKODE" ||
        keyCompact === "NAMAKODESOAL" ||
        keyCompact === "H" ||
        keyCompact === "HINT" ||
        keyCompact === "PENJELASAN" ||
        keyCompact === "EXPLANATION" ||
        keyCompact === "E" ||
        keyCompact === "S" ||
        keyCompact === "STIMULUS" ||
        keyCompact === "Q" ||
        keyCompact === "SOAL" ||
        keyCompact === "KUNCI" ||
        keyCompact === "KUNCIJAWABAN";
      if (lastField === "explanation" && !isHeaderKey) {
        appendContinuation(raw);
        return;
      }
      if (keyCompact === "TYPE") {
        item.type_raw = val;
        lastField = "type";
        return;
      }
      if (keyCompact === "MAPEL" || keyCompact === "MATAPELAJARAN") {
        item.mapel = val;
        lastField = "mapel";
        return;
      }
      if (keyCompact === "KODESOAL" || keyCompact === "KODE") {
        item.question_code_code = val;
        lastField = "kode";
        return;
      }
      if (keyCompact === "KODETP") {
        item.learning_goal_code = val;
        lastField = "kodetp";
        return;
      }
      if (keyCompact === "NAMAKODE" || keyCompact === "NAMAKODESOAL") {
        item.question_code_name = val;
        lastField = "nama";
        return;
      }
      if (keyCompact === "H" || keyCompact === "HINT") {
        item.hint = val;
        lastField = "hint";
        return;
      }
      if (
        keyCompact === "PENJELASAN" ||
        keyCompact === "EXPLANATION" ||
        keyCompact === "E"
      ) {
        item.explanation = val;
        lastField = "explanation";
        return;
      }
      if (keyCompact === "S" || keyCompact === "STIMULUS") {
        item.stimulus = val;
        lastField = "stimulus";
        return;
      }
      if (keyCompact === "Q" || keyCompact === "SOAL") {
        item.question = val;
        lastField = "question";
        return;
      }
      if (keyCompact === "KUNCI" || keyCompact === "KUNCIJAWABAN") {
        item.key_raw = val;
        lastField = "kunci";
        return;
      }
      if (/^[A-Z]$/.test(keyUpper)) {
        item.options.push({ option_key: keyUpper, option_html: val });
        lastField = "option";
        lastOptionIdx = item.options.length - 1;
        return;
      }
      if (/^P[0-9]+$/.test(keyUpper)) {
        item.statements.push({ id: keyUpper, statement: val });
        lastField = "statement";
        lastStatementIdx = item.statements.length - 1;
        return;
      }
      appendContinuation(raw);
    });
    return parseImportQuestionFromParts(item, blockNo);
  }

  function parseImportQuestionRow(record, blockNo) {
    const item = {
      type_raw: String((record && record.type) || "").trim(),
      mapel: String((record && record.mapel) || "").trim(),
      question_code_code: String((record && record.kode_soal) || "").trim(),
      question_code_name: String((record && record.nama_kode) || "").trim(),
      learning_goal_code: String((record && record.kode_tp) || "").trim(),
      explanation: String((record && record.penjelasan) || "").trim(),
      hint: String((record && record.hint) || "").trim(),
      learning_goal_text: String(
        (record && record.tujuan_pembelajaran) || "",
      ).trim(),
      learning_goal_materi: String((record && record.materi) || "").trim(),
      learning_goal_kelas: String((record && record.kelas) || "").trim(),
      learning_goal_semester: String((record && record.semester) || "").trim(),
      stimulus: String((record && record.stimulus) || "").trim(),
      question: String((record && record.soal) || "").trim(),
      key_raw: String((record && record.kunci) || "").trim(),
      opsi_raw: String((record && record.opsi) || "").trim(),
      options: [],
      statements: [],
    };
    const parts = splitImportValues(String((record && record.opsi) || ""));
    const keyTokens = String(item.key_raw || "")
      .split(",")
      .map(function (v) {
        return String(v || "")
          .trim()
          .toUpperCase();
      })
      .filter(Boolean);
    const inferredType =
      mapImportQuestionType(item.type_raw) || inferImportQuestionType(item);
    if (inferredType === "benar_salah_pernyataan") {
      item.statements = parts
        .map(function (line, idx) {
          const cleaned = String(line || "").trim();
          if (!cleaned) return null;
          const withId = cleaned.match(/^P?([0-9]+)[\.\):\-\s]+(.+)$/i);
          const statement = withId ? String(withId[2] || "").trim() : cleaned;
          const id = "P" + String(idx + 1);
          if (!statement) return null;
          return { id: id, statement: statement };
        })
        .filter(Boolean);
    } else if (inferredType === "menjodohkan_drag_drop") {
      const splitSection = function (label) {
        const pattern = new RegExp(label + "\\s*:\\s*", "i");
        const raw = String(item.opsi_raw || "");
        const chunks = raw.split("|");
        const found = chunks.find(function (chunk) {
          return pattern.test(chunk);
        });
        if (!found) return [];
        return found
          .replace(pattern, "")
          .split(";")
          .map(function (line) {
            return String(line || "").trim();
          })
          .filter(Boolean);
      };
      item.statements = splitSection("Prompts")
        .map(function (line, idx) {
          const m = line.match(/^([A-Z0-9]+)[\.\):\-\s]+(.+)$/i);
          const id = (
            m && m[1] ? String(m[1]) : "P" + String(idx + 1)
          ).toUpperCase();
          const statement = m && m[2] ? String(m[2] || "").trim() : line;
          if (!statement) return null;
          return { id: id, statement: statement };
        })
        .filter(Boolean);
      item.options = splitSection("Choices")
        .map(function (line, idx) {
          const m = line.match(/^([A-Z0-9]+)[\.\):\-\s]+(.+)$/i);
          const optionKey = (
            m && m[1] ? String(m[1]) : String.fromCharCode(65 + idx)
          ).toUpperCase();
          const optionText = m && m[2] ? String(m[2] || "").trim() : line;
          if (!optionText) return null;
          return { option_key: optionKey, option_html: optionText };
        })
        .filter(Boolean);
    } else if (inferredType === "short_answer") {
      item.options = [];
    } else {
      item.options = parts
        .map(function (line, idx) {
          const cleaned = String(line || "").trim();
          if (!cleaned) return null;
          const m = cleaned.match(/^([A-Z])[\.\):\-\s]+(.+)$/i);
          const optionKey = (
            m && m[1] ? m[1] : String.fromCharCode(65 + idx)
          ).toUpperCase();
          const optionText = m && m[2] ? String(m[2] || "").trim() : cleaned;
          if (!optionText) return null;
          return { option_key: optionKey, option_html: optionText };
        })
        .filter(Boolean);
    }
    if (!item.key_raw && keyTokens.length) {
      item.key_raw = keyTokens.join(",");
    }
    return parseImportQuestionFromParts(item, blockNo);
  }

  window.ImportParser = {
    parseImportContent: parseImportContent,
    parseImportQuestionRow: parseImportQuestionRow,
    parseImportQuestionBlock: parseImportQuestionBlock,
    resolveImportSubjectID: resolveImportSubjectID,
  };
})();
