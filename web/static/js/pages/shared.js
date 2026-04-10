(function () {
  const core = window.AppCore || {};
  const apiMultipart = core.apiMultipart;

  async function loadScriptOnce(id, src) {
    const exists = document.getElementById(id);
    if (exists) return;
    await new Promise(function (resolve, reject) {
      const s = document.createElement("script");
      s.id = id;
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = function () {
        reject(new Error("Gagal memuat script: " + src));
      };
      document.head.appendChild(s);
    });
  }

  function loadStyleOnce(id, href) {
    if (document.getElementById(id)) return;
    const l = document.createElement("link");
    l.id = id;
    l.rel = "stylesheet";
    l.href = href;
    document.head.appendChild(l);
  }

  async function ensureKatexReady() {
    loadStyleOnce(
      "katex-css",
      "https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/katex.min.css",
    );
    if (window.katex) return;
    await loadScriptOnce(
      "katex-js",
      "https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/katex.min.js",
    );
  }

  async function ensureQuillReady() {
    loadStyleOnce(
      "quill-snow-css",
      "https://cdn.jsdelivr.net/npm/quill@1.3.7/dist/quill.snow.css",
    );
    await ensureKatexReady();
    if (!window.Quill) {
      await loadScriptOnce(
        "quill-js",
        "https://cdn.jsdelivr.net/npm/quill@1.3.7/dist/quill.min.js",
      );
    }
    if (!window.__cbtQuillImageResizeRegistered) {
      try {
        await loadScriptOnce(
          "quill-image-resize-js",
          "https://cdn.jsdelivr.net/npm/quill-image-resize-module@3.0.0/image-resize.min.js",
        );
        const alreadyRegistered =
          window.Quill &&
          window.Quill.imports &&
          window.Quill.imports["modules/imageResize"];
        if (alreadyRegistered) {
          window.__cbtQuillImageResizeRegistered = true;
        } else if (window.Quill && window.ImageResize) {
          window.Quill.register("modules/imageResize", window.ImageResize);
          window.__cbtQuillImageResizeRegistered = true;
        }
      } catch (_) {
        window.__cbtQuillImageResizeRegistered = false;
      }
    }
  }

  const QUESTION_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

  function formatImageMaxLabel(bytes) {
    const size = Number(bytes) || 0;
    if (size <= 0) return "2MB";
    if (size < 1024 * 1024) {
      return Math.max(1, Math.round(size / 1024)) + "KB";
    }
    return (size / (1024 * 1024)).toFixed(1).replace(/\.0$/, "") + "MB";
  }

  function dataURLImageSizeBytes(dataURL) {
    const raw = String(dataURL || "").trim();
    if (!/^data:image\//i.test(raw)) return 0;
    const marker = ";base64,";
    const idx = raw.indexOf(marker);
    if (idx <= 0) return 0;
    const base64 = raw.slice(idx + marker.length).replace(/\s+/g, "");
    if (!base64) return 0;
    const padding = (base64.match(/=+$/) || [""])[0].length;
    return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
  }

  function fileToDataURL(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        const base64 = String(reader.result || "");
        if (!base64) {
          reject(new Error("gambar tidak valid"));
          return;
        }
        resolve(base64);
      };
      reader.onerror = function () {
        reject(new Error("gagal membaca gambar"));
      };
      reader.readAsDataURL(file);
    });
  }

  async function uploadQuestionImageFile(file, maxBytes, maxLabel) {
    if (!file) throw new Error("file gambar tidak ditemukan");
    if (file.size > maxBytes) {
      throw new Error("ukuran gambar maksimal " + maxLabel);
    }
    const form = new FormData();
    form.append("file", file);
    return await apiMultipart("/api/v1/media/question-images", "POST", form);
  }

  function createQuillEditor(hostEl, placeholder, options) {
    if (!hostEl || !window.Quill) return null;
    const imageMaxBytes = Math.max(
      1,
      Number((options && options.imageMaxBytes) || QUESTION_IMAGE_MAX_BYTES) ||
        QUESTION_IMAGE_MAX_BYTES,
    );
    const imageMaxLabel = formatImageMaxLabel(imageMaxBytes);
    const originalConsoleLog = console.log;
    const filteredConsoleLog = function () {
      if (
        arguments.length > 0 &&
        String(arguments[0] || "") === "this.options.modules"
      ) {
        return;
      }
      return originalConsoleLog.apply(console, arguments);
    };
    let quill = null;

    async function insertImageFile(file) {
      if (!file || !quill) return;
      const range = quill.getSelection(true);
      const index = range ? range.index : quill.getLength();
      try {
        const uploaded = await uploadQuestionImageFile(
          file,
          imageMaxBytes,
          imageMaxLabel,
        );
        const imageURL = uploaded && uploaded.url;
        if (!imageURL) throw new Error("url kosong");
        quill.insertEmbed(index, "image", imageURL, "user");
        quill.setSelection(index + 1, 0, "silent");
      } catch (err) {
        const msg = (err && err.message) || "Upload gambar gagal.";
        if (file.size > imageMaxBytes) {
          window.alert("ukuran gambar maksimal " + imageMaxLabel);
          return;
        }
        try {
          const base64 = await fileToDataURL(file);
          quill.insertEmbed(index, "image", base64, "user");
          quill.setSelection(index + 1, 0, "silent");
          window.alert(msg + " Gambar disisipkan lokal.");
        } catch (_) {
          window.alert(msg);
        }
      }
    }

    try {
      if (typeof originalConsoleLog === "function") {
        console.log = filteredConsoleLog;
      }
      quill = new window.Quill(hostEl, {
        theme: "snow",
        placeholder: placeholder || "",
        modules: {
          toolbar: {
            container: [
              [{ header: [false, 2, 3] }],
              ["bold", "italic", "underline"],
              [{ color: [] }, { background: [] }],
              [{ script: "sub" }, { script: "super" }],
              [{ align: [] }],
              [{ list: "ordered" }, { list: "bullet" }],
              ["link", "image", "formula"],
              ["clean"],
            ],
            handlers: {
              image: function () {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = "image/*";
                input.onchange = function () {
                  const file = input.files ? input.files[0] : null;
                  if (!file) return;
                  insertImageFile(file);
                };
                input.click();
              },
            },
          },
          imageResize: {
            modules: ["Resize", "DisplaySize", "Toolbar"],
          },
        },
      });
    } finally {
      if (typeof originalConsoleLog === "function") {
        console.log = originalConsoleLog;
      }
    }
    const fontSize = String((options && options.defaultFontSize) || "").trim();
    if (fontSize && quill.root && quill.root.style) {
      quill.root.style.fontSize = fontSize;
    }
    if (quill && quill.root) {
      quill.root.addEventListener("paste", function (e) {
        const items =
          e &&
          e.clipboardData &&
          e.clipboardData.items &&
          e.clipboardData.items.length
            ? Array.from(e.clipboardData.items)
            : [];
        const imageFiles = items
          .map(function (it) {
            if (!it || String(it.kind || "").toLowerCase() !== "file") {
              return null;
            }
            if (!/^image\//i.test(String(it.type || ""))) return null;
            return it.getAsFile ? it.getAsFile() : null;
          })
          .filter(Boolean);
        if (!imageFiles.length) return;
        e.preventDefault();
        imageFiles.forEach(function (file) {
          insertImageFile(file);
        });
      });
      quill.root.addEventListener("drop", function (e) {
        const files =
          e && e.dataTransfer && e.dataTransfer.files
            ? Array.from(e.dataTransfer.files)
            : [];
        const imageFiles = files.filter(function (file) {
          return file && /^image\//i.test(String(file.type || ""));
        });
        if (!imageFiles.length) return;
        e.preventDefault();
        imageFiles.forEach(function (file) {
          insertImageFile(file);
        });
      });
      let suppressOversizeGuard = false;
      quill.on("text-change", function (delta, _old, source) {
        if (suppressOversizeGuard || source !== "user") return;
        if (!delta || !Array.isArray(delta.ops)) return;
        let index = 0;
        const oversize = [];
        delta.ops.forEach(function (op) {
          if (op && typeof op.retain === "number") {
            index += op.retain;
            return;
          }
          if (op && typeof op.insert === "string") {
            index += op.insert.length;
            return;
          }
          if (
            op &&
            op.insert &&
            typeof op.insert === "object" &&
            typeof op.insert.image === "string"
          ) {
            const src = String(op.insert.image || "");
            if (/^data:image\//i.test(src)) {
              const bytes = dataURLImageSizeBytes(src);
              if (bytes > imageMaxBytes) {
                oversize.push(index);
              }
            }
            index += 1;
          }
        });
        if (!oversize.length) return;
        suppressOversizeGuard = true;
        for (let i = oversize.length - 1; i >= 0; i -= 1) {
          quill.deleteText(oversize[i], 1, "silent");
        }
        suppressOversizeGuard = false;
        window.alert("ukuran gambar maksimal " + imageMaxLabel);
      });
    }
    return quill;
  }

  function getQuillHTML(quill) {
    if (!quill || !quill.root) return "";
    return String(quill.root.innerHTML || "").trim();
  }

  function cleanStemPreview(raw) {
    const text = String(raw || "").trim();
    if (!text) return "";
    const plain = toPlainText(text);
    if (!plain) return "";
    return plain.replace(/^draft naskah soal:\s*/i, "").trim();
  }

  function toPlainText(html) {
    const raw = String(html || "").trim();
    if (!raw) return "";
    const container = document.createElement("div");
    container.innerHTML = raw;
    return String(container.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function previewText(html, maxLen) {
    const text = toPlainText(html);
    if (!text) return "-";
    const limit = Math.max(20, Number(maxLen) || 80);
    if (text.length <= limit) return text;
    return text.slice(0, limit - 1).trim() + "…";
  }

  function shortQuestionType(rawType) {
    const t = String(rawType || "")
      .trim()
      .toLowerCase();
    if (t === "pg_tunggal") return "MC";
    if (t === "multi_jawaban") return "MR";
    if (t === "benar_salah_pernyataan") return "TF";
    if (t === "menjodohkan_drag_drop") return "MATCH";
    if (t === "short_answer") return "SA";
    return t ? t.toUpperCase() : "-";
  }

  window.AppPagesShared = window.AppPagesShared || {};
  window.AppPagesShared.shortQuestionType = shortQuestionType;
  window.AppPagesShared.cleanStemPreview = cleanStemPreview;
  window.AppPagesShared.createQuillEditor = createQuillEditor;
  window.AppPagesShared.getQuillHTML = getQuillHTML;
  window.AppPagesShared.ensureQuillReady = ensureQuillReady;
  window.AppPagesShared.previewText = previewText;
})();
