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

  async function uploadQuestionImageFile(file) {
    if (!file) throw new Error("file gambar tidak ditemukan");
    if (file.size > QUESTION_IMAGE_MAX_BYTES) {
      throw new Error("ukuran gambar maksimal 2MB");
    }
    const form = new FormData();
    form.append("file", file);
    return await apiMultipart("/api/v1/media/question-images", "POST", form);
  }

  function createQuillEditor(hostEl, placeholder, options) {
    if (!hostEl || !window.Quill) return null;
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
                input.onchange = async function () {
                  const file = input.files ? input.files[0] : null;
                  if (!file || !quill) return;
                  const range = quill.getSelection(true);
                  const index = range ? range.index : quill.getLength();
                  try {
                    const uploaded = await uploadQuestionImageFile(file);
                    const imageURL = uploaded && uploaded.url;
                    if (imageURL) {
                      quill.insertEmbed(index, "image", imageURL, "user");
                      quill.setSelection(index + 1, 0, "silent");
                      return;
                    }
                    throw new Error("url kosong");
                  } catch (err) {
                    const msg = (err && err.message) || "Upload gambar gagal.";
                    try {
                      const base64 = await fileToDataURL(file);
                      quill.insertEmbed(index, "image", base64, "user");
                      quill.setSelection(index + 1, 0, "silent");
                      alert(msg + " Gambar disisipkan lokal.");
                    } catch (_) {
                      alert(msg);
                    }
                  }
                }.bind(this);
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
