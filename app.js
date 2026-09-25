/**
 * Mossdesk — iOS Notes-inspired shell + Lichen
 */
(function () {
  "use strict";

  var STORAGE_KEY = "mossdesk-notes-v2";
  var THEME_KEY = "mossdesk-theme";
  var AI_KEY = "mossdesk-ai-settings";
  var LANG_KEY = "mossdesk-lichen-lang";
  var SPEAK_KEY = "mossdesk-speak-lang";
  var WRITE_KEY = "mossdesk-write-lang";

  var notes = [];
  var activeId = null;
  var searchQuery = "";
  var recognition = null;
  var isListening = false;
  var aiListening = false;
  var aiBusy = false;

  var $ = function (s) {
    return document.querySelector(s);
  };

  var homeView = $("#home-view");
  var editorView = $("#editor-view");
  var homeEmpty = $("#home-empty");
  var homeList = $("#home-list");
  var searchInput = $("#search-input");
  var titleInput = $("#note-title");
  var contentEl = $("#note-content");
  var metaEl = $("#editor-meta");
  var btnWrite = $("#btn-write");
  var btnBack = $("#btn-back");
  var btnDelete = $("#btn-delete");
  var btnAi = $("#btn-ai");
  var btnAiHome = $("#btn-ai-home");
  var fontSelect = $("#font-select");
  var colorPicker = $("#color-picker");
  var btnBold = $("#btn-bold");
  var btnItalic = $("#btn-italic");
  var btnMic = $("#btn-mic");
  var micLabel = $("#mic-label");
  var speakLangEl = $("#dictation-speak-lang");
  var writeLangEl = $("#dictation-write-lang");
  var aiPanel = $("#ai-panel");
  var aiOverlay = $("#ai-overlay");
  var aiClose = $("#ai-close");
  var aiMessages = $("#ai-messages");
  var aiInput = $("#ai-input");
  var aiSend = $("#ai-send");
  var aiMic = $("#ai-mic");
  var lichenLangEl = $("#lichen-lang");
  var aiApiKey = $("#ai-api-key");
  var aiApiBase = $("#ai-api-base");
  var aiApiModel = $("#ai-api-model");
  var aiSaveSettings = $("#ai-save-settings");
  var aiSettingsStatus = $("#ai-settings-status");

  var SPEECH_TO_CODE = { "pt-BR": "pt", "en-US": "en", "es-ES": "es", "de-DE": "de", "fr-FR": "fr" };

  var CHIP_LABELS = {
    pt: { summarize: "Resumir", continue: "Continuar", shorten: "Encurtar", expand: "Expandir", improve: "Melhorar", outline: "Estrutura", questions: "Perguntas", research: "Pesquisar" },
    en: { summarize: "Summarize", continue: "Continue", shorten: "Shorten", expand: "Expand", improve: "Improve", outline: "Outline", questions: "Questions", research: "Research" },
    es: { summarize: "Resumir", continue: "Continuar", shorten: "Acortar", expand: "Expandir", improve: "Mejorar", outline: "Esquema", questions: "Preguntas", research: "Investigar" },
    de: { summarize: "Zusammenfassen", continue: "Weiter", shorten: "Kürzen", expand: "Erweitern", improve: "Verbessern", outline: "Gliederung", questions: "Fragen", research: "Recherchieren" },
    fr: { summarize: "Résumer", continue: "Continuer", shorten: "Raccourcir", expand: "Développer", improve: "Améliorer", outline: "Plan", questions: "Questions", research: "Rechercher" },
  };

  function getLichenLang() {
    return localStorage.getItem(LANG_KEY) || "pt";
  }
  function setLichenLang(l) {
    localStorage.setItem(LANG_KEY, l);
  }
  function getSpeakLang() {
    return localStorage.getItem(SPEAK_KEY) || "pt-BR";
  }
  function getWriteLang() {
    return localStorage.getItem(WRITE_KEY) || "pt";
  }

  function loadNotes() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var p = JSON.parse(raw);
        if (Array.isArray(p)) return p;
      }
      var v1 = localStorage.getItem("mossdesk-notes-v1");
      if (v1) {
        var old = JSON.parse(v1);
        if (Array.isArray(old))
          return old.map(function (n) {
            return Object.assign({}, n, {
              content: n.content ? "<p>" + escapeHtml(String(n.content)).replace(/\n/g, "<br>") + "</p>" : "",
            });
          });
      }
      return [];
    } catch (e) {
      return [];
    }
  }

  function saveNotes() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    } catch (e) {}
  }

  function loadAiSettings() {
    try {
      var raw = localStorage.getItem(AI_KEY);
      if (!raw) return { key: "", base: "https://api.openai.com/v1", model: "gpt-4o-mini" };
      return Object.assign({ key: "", base: "https://api.openai.com/v1", model: "gpt-4o-mini" }, JSON.parse(raw));
    } catch (e) {
      return { key: "", base: "https://api.openai.com/v1", model: "gpt-4o-mini" };
    }
  }

  function saveAiSettings(s) {
    localStorage.setItem(AI_KEY, JSON.stringify(s));
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function formatDate(ts) {
    var d = new Date(ts);
    var now = new Date();
    if (d.toDateString() === now.toDateString())
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
  }

  function stripHtml(html) {
    var div = document.createElement("div");
    div.innerHTML = html || "";
    return (div.textContent || "").replace(/\s+/g, " ").trim();
  }

  function previewText(html, max) {
    max = max || 80;
    var c = stripHtml(html);
    if (!c) return "Nota vazia";
    return c.length > max ? c.slice(0, max) + "…" : c;
  }

  function escapeHtml(str) {
    var d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  function getFiltered() {
    if (!searchQuery.trim()) return notes;
    var q = searchQuery.toLowerCase();
    return notes.filter(function (n) {
      return (n.title || "").toLowerCase().includes(q) || stripHtml(n.content).toLowerCase().includes(q);
    });
  }

  /* ---------- Views ---------- */
  function showHome() {
    persistCurrent();
    activeId = null;
    if (editorView) {
      editorView.classList.remove("is-visible");
      setTimeout(function () {
        editorView.hidden = true;
      }, 280);
    }
    if (homeView) {
      homeView.hidden = false;
      requestAnimationFrame(function () {
        homeView.classList.add("is-visible");
      });
    }
    renderHome();
  }

  function showEditor(id) {
    activeId = id;
    if (homeView) {
      homeView.classList.remove("is-visible");
      setTimeout(function () {
        homeView.hidden = true;
      }, 200);
    }
    if (editorView) {
      editorView.hidden = false;
      requestAnimationFrame(function () {
        editorView.classList.add("is-visible");
      });
    }
    renderEditor();
    setTimeout(function () {
      if (titleInput && !titleInput.value) titleInput.focus();
      else if (contentEl) contentEl.focus();
    }, 320);
  }

  function renderHome() {
    var filtered = getFiltered();
    var sorted = filtered.slice().sort(function (a, b) {
      return b.updatedAt - a.updatedAt;
    });

    if (sorted.length === 0) {
      if (homeEmpty) homeEmpty.hidden = false;
      if (homeList) {
        homeList.hidden = true;
        homeList.innerHTML = "";
      }
      return;
    }

    if (homeEmpty) homeEmpty.hidden = true;
    if (homeList) {
      homeList.hidden = false;
      homeList.innerHTML = sorted
        .map(function (n) {
          return (
            '<button type="button" class="home-note" data-id="' +
            n.id +
            '">' +
            '<div class="home-note-title">' +
            escapeHtml(n.title || "Sem título") +
            "</div>" +
            '<div class="home-note-preview">' +
            escapeHtml(previewText(n.content)) +
            "</div>" +
            '<div class="home-note-date">' +
            formatDate(n.updatedAt) +
            "</div></button>"
          );
        })
        .join("");

      homeList.querySelectorAll(".home-note").forEach(function (el) {
        el.addEventListener("click", function () {
          showEditor(el.dataset.id);
        });
      });
    }
  }

  function renderEditor() {
    var note = notes.find(function (n) {
      return n.id === activeId;
    });
    if (!note) {
      showHome();
      return;
    }
    if (btnDelete) btnDelete.disabled = false;
    titleInput.value = note.title || "";
    contentEl.innerHTML = note.content || "";
    if (metaEl) metaEl.textContent = formatDate(note.updatedAt);
  }

  function createNote() {
    persistCurrent();
    var note = {
      id: uid(),
      title: "",
      content: "",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    notes.unshift(note);
    saveNotes();
    showEditor(note.id);
  }

  function persistCurrent() {
    if (!activeId) return;
    var note = notes.find(function (n) {
      return n.id === activeId;
    });
    if (!note || !titleInput || !contentEl) return;
    var t = titleInput.value;
    var c = contentEl.innerHTML;
    if (note.title !== t || note.content !== c) {
      note.title = t;
      note.content = c;
      note.updatedAt = Date.now();
      saveNotes();
      if (metaEl) metaEl.textContent = formatDate(note.updatedAt);
    }
  }

  function deleteNote() {
    if (!activeId) return;
    var note = notes.find(function (n) {
      return n.id === activeId;
    });
    if (!note) return;
    if (!confirm('Apagar "' + (note.title || "Sem título") + '"?')) return;
    notes = notes.filter(function (n) {
      return n.id !== activeId;
    });
    activeId = null;
    saveNotes();
    showHome();
  }

  var saveTimer;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persistCurrent, 400);
  }

  function exec(cmd, value) {
    document.execCommand(cmd, false, value);
    contentEl.focus();
    scheduleSave();
  }

  function translateText(text, from, to) {
    if (!text || from === to) return Promise.resolve(text);
    var url =
      "https://api.mymemory.translated.net/get?q=" +
      encodeURIComponent(text.slice(0, 450)) +
      "&langpair=" +
      encodeURIComponent(from + "|" + to);
    return fetch(url)
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        return (data && data.responseData && data.responseData.translatedText) || text;
      })
      .catch(function () {
        return text;
      });
  }

  function insertTextAtCursor(text) {
    contentEl.focus();
    var sel = window.getSelection();
    if (!sel.rangeCount) {
      contentEl.appendChild(document.createTextNode(text + " "));
      scheduleSave();
      return;
    }
    var range = sel.getRangeAt(0);
    range.deleteContents();
    var node = document.createTextNode(text + " ");
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    scheduleSave();
  }

  function insertHtmlIntoNote(text) {
    if (!activeId) createNote();
    var html = text
      .split(/\n\n+/)
      .map(function (p) {
        return "<p>" + escapeHtml(p).replace(/\n/g, "<br>") + "</p>";
      })
      .join("");
    contentEl.focus();
    if (!stripHtml(contentEl.innerHTML)) contentEl.innerHTML = html;
    else contentEl.innerHTML += html;
    scheduleSave();
    persistCurrent();
  }

  function toggleDictation() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert("Reconhecimento de voz não suportado. Use Chrome ou Edge.");
      return;
    }
    if (!recognition) {
      recognition = new SR();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = function (event) {
        var final = "";
        for (var i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) final += event.results[i][0].transcript;
        }
        if (!final) return;
        var spoken = final.trim();
        var from = SPEECH_TO_CODE[getSpeakLang()] || "pt";
        var to = getWriteLang();
        if (from === to) insertTextAtCursor(spoken);
        else {
          if (micLabel) micLabel.textContent = "…";
          translateText(spoken, from, to).then(function (t) {
            insertTextAtCursor(t);
            if (micLabel) micLabel.textContent = isListening ? "Ouvindo…" : "Ditar";
          });
        }
      };
      recognition.onerror = function () {
        stopDictation();
      };
      recognition.onend = function () {
        if (isListening) {
          try {
            recognition.lang = getSpeakLang();
            recognition.start();
          } catch (e) {
            stopDictation();
          }
        }
      };
    }
    if (isListening) stopDictation();
    else {
      try {
        recognition.lang = getSpeakLang();
        recognition.start();
        isListening = true;
        btnMic.classList.add("listening");
        if (micLabel) micLabel.textContent = "Ouvindo…";
      } catch (e) {}
    }
  }

  function stopDictation() {
    isListening = false;
    try {
      if (recognition) recognition.stop();
    } catch (e) {}
    if (btnMic) btnMic.classList.remove("listening");
    if (micLabel) micLabel.textContent = "Ditar";
  }

  function updateChipLabels() {
    var labels = CHIP_LABELS[getLichenLang()] || CHIP_LABELS.pt;
    document.querySelectorAll(".ai-chip").forEach(function (chip) {
      if (labels[chip.dataset.action]) chip.textContent = labels[chip.dataset.action];
    });
  }

  function welcomeMessage() {
    var map = {
      pt: "Olá, eu sou o Lichen. Posso resumir, continuar ou melhorar sua nota.",
      en: "Hi, I’m Lichen. I can summarize, continue, or improve your note.",
      es: "Hola, soy Lichen. Puedo resumir, continuar o mejorar tu nota.",
      de: "Hallo, ich bin Lichen. Ich kann zusammenfassen, fortsetzen oder verbessern.",
      fr: "Bonjour, je suis Lichen. Je peux résumer, continuer ou améliorer votre note.",
    };
    return map[getLichenLang()] || map.pt;
  }

  function openAiPanel() {
    aiPanel.classList.add("open");
    aiPanel.setAttribute("aria-hidden", "false");
    aiOverlay.hidden = false;
    aiOverlay.classList.add("visible");
    if (!aiMessages.children.length) appendAiMessage("assistant", welcomeMessage());
  }

  function closeAiPanel() {
    aiPanel.classList.remove("open");
    aiPanel.setAttribute("aria-hidden", "true");
    aiOverlay.classList.remove("visible");
    setTimeout(function () {
      aiOverlay.hidden = true;
    }, 250);
  }

  function appendAiMessage(role, text, opts) {
    opts = opts || {};
    var wrap = document.createElement("div");
    wrap.className = "ai-msg-wrap ai-msg-wrap--" + role;
    var div = document.createElement("div");
    div.className = "ai-msg ai-msg--" + role;
    div.textContent = text;
    wrap.appendChild(div);
    if (role === "assistant" && text && !opts.noInsert) {
      var actions = document.createElement("div");
      actions.className = "ai-msg-actions";
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ai-insert-btn";
      btn.textContent = "Inserir na nota";
      btn.addEventListener("click", function () {
        insertHtmlIntoNote(text);
        btn.textContent = "✓";
        btn.disabled = true;
      });
      actions.appendChild(btn);
      wrap.appendChild(actions);
    }
    aiMessages.appendChild(wrap);
    aiMessages.scrollTop = aiMessages.scrollHeight;
    return wrap;
  }

  function getNoteContext() {
    var note = notes.find(function (n) {
      return n.id === activeId;
    });
    if (!note) return { title: "", body: "" };
    return { title: note.title || "", body: stripHtml(note.content) };
  }

  function localAssistantReply(userText, action) {
    var lang = getLichenLang();
    var ctx = getNoteContext();
    var body = ctx.body;
    var words = body ? body.split(/\s+/).filter(Boolean).length : 0;
    var lower = (userText || "").toLowerCase();
    var act = action || "";
    var empty = {
      pt: "A nota ainda está vazia.",
      en: "The note is still empty.",
      es: "La nota aún está vacía.",
      de: "Die Notiz ist noch leer.",
      fr: "La note est encore vide.",
    };

    if (act === "summarize" || /summar|resum/i.test(lower)) {
      if (!body) return empty[lang] || empty.pt;
      var s = (body.match(/[^.!?]+[.!?]+/g) || [body]).slice(0, 4).join(" ");
      return (lang === "pt" ? "Resumo:\n\n" : "Summary:\n\n") + s;
    }
    if (act === "continue" || /contin/i.test(lower)) {
      if (!body) return empty[lang] || empty.pt;
      return (lang === "pt" ? "Continuação:\n\n…" : "Continuation:\n\n…") + body.slice(-180);
    }
    if (act === "shorten" || /short|encurt|acort|kürz|raccour/i.test(lower)) {
      if (!body) return empty[lang] || empty.pt;
      return body.replace(/\s+/g, " ").slice(0, Math.min(body.length, 280));
    }
    if (act === "expand" || /expand|erweit|développ/i.test(lower)) {
      return lang === "pt"
        ? "Para expandir: explique o porquê, dê um exemplo e mostre o próximo passo."
        : "To expand: explain why, add an example, and show the next step.";
    }
    if (act === "improve" || /improv|melhor|mejor|verbess|amélior/i.test(lower)) {
      return lang === "pt"
        ? "Sugestões: ideia clara no início; um parágrafo por pensamento; feche com próximo passo. (~" +
            words +
            " palavras)"
        : "Lead with one idea; one thought per paragraph; end with a next step. (~" + words + " words)";
    }
    if (act === "outline" || /outline|estrut|esquema|glieder|plan/i.test(lower)) {
      return lang === "pt"
        ? "1. Ideia central\n2. Contexto\n3. Pontos\n4. Exemplo\n5. Próximos passos"
        : "1. Core idea\n2. Context\n3. Points\n4. Example\n5. Next steps";
    }
    if (act === "questions" || /question|pergunt/i.test(lower)) {
      return lang === "pt"
        ? "• O que deve ser lembrado?\n• O que estou assumindo?\n• Qual exemplo torna isso concreto?"
        : "• What should be remembered?\n• What am I assuming?\n• What example makes this concrete?";
    }
    if (act === "research" || /research|pesquis|investig|recherch/i.test(lower)) {
      return lang === "pt"
        ? "Anote 2–3 perguntas, busque fontes primárias e cole só o essencial na nota."
        : "Note 2–3 questions, find primary sources, paste only what you need.";
    }
    if (!body) return empty[lang] || empty.pt;
    return lang === "pt"
      ? "Li “" + (ctx.title || "Sem título") + "” (~" + words + " palavras). Peça resumir, continuar ou melhorar."
      : "Read “" + (ctx.title || "Untitled") + "” (~" + words + " words). Ask to summarize, continue, or improve.";
  }

  function callRemoteAi(userText) {
    var settings = loadAiSettings();
    if (!settings.key) return Promise.resolve(null);
    var base = (settings.base || "https://api.openai.com/v1").replace(/\/$/, "");
    var ctx = getNoteContext();
    var langNames = { pt: "Portuguese", en: "English", es: "Spanish", de: "German", fr: "French" };
    return fetch(base + "/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + settings.key,
      },
      body: JSON.stringify({
        model: settings.model || "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are Lichen in Mossdesk. Reply in " + (langNames[getLichenLang()] || "Portuguese") + ". Be concise.",
          },
          {
            role: "user",
            content:
              "Title: " +
              (ctx.title || "") +
              "\nNote: " +
              (ctx.body || "").slice(0, 3000) +
              "\n\n" +
              userText,
          },
        ],
        temperature: 0.6,
      }),
    }).then(function (res) {
      if (!res.ok) throw new Error("API");
      return res.json().then(function (data) {
        return data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      });
    });
  }

  function handleAiSend(text, action) {
    if (aiBusy) return;
    var msg = (text || (aiInput && aiInput.value) || "").trim();
    if (!msg && !action) return;
    var labels = CHIP_LABELS[getLichenLang()] || CHIP_LABELS.pt;
    var display = msg || (action && labels[action]) || action;
    appendAiMessage("user", display);
    if (aiInput) aiInput.value = "";
    var thinking = appendAiMessage("assistant", "…", { noInsert: true });
    aiBusy = true;
    if (aiSend) aiSend.disabled = true;
    var prompt = msg || display;
    callRemoteAi(prompt)
      .then(function (remote) {
        thinking.remove();
        appendAiMessage("assistant", remote || localAssistantReply(prompt, action));
      })
      .catch(function () {
        thinking.remove();
        appendAiMessage("assistant", localAssistantReply(prompt, action));
      })
      .then(function () {
        aiBusy = false;
        if (aiSend) aiSend.disabled = false;
      });
  }

  function toggleAiMic() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    if (aiListening) {
      aiListening = false;
      aiMic.classList.remove("listening");
      return;
    }
    var r = new SR();
    r.lang = getSpeakLang();
    r.onresult = function (e) {
      aiInput.value = (aiInput.value + " " + e.results[0][0].transcript).trim();
    };
    r.onend = r.onerror = function () {
      aiListening = false;
      aiMic.classList.remove("listening");
    };
    aiListening = true;
    aiMic.classList.add("listening");
    try {
      r.start();
    } catch (e) {
      aiListening = false;
    }
  }

  function initTheme() {
    var s = localStorage.getItem(THEME_KEY);
    if (s === "dark" || s === "light") document.documentElement.setAttribute("data-theme", s);
  }

  function toggleTheme() {
    var current = document.documentElement.getAttribute("data-theme");
    var systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var next =
      current === "dark" ? "light" : current === "light" ? "dark" : systemDark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem(THEME_KEY, next);
  }

  function bindEvents() {
    if (btnWrite) btnWrite.addEventListener("click", createNote);
    if (btnBack) btnBack.addEventListener("click", showHome);
    if (btnDelete) btnDelete.addEventListener("click", deleteNote);

    if (searchInput)
      searchInput.addEventListener("input", function (e) {
        searchQuery = e.target.value;
        renderHome();
      });

    if (titleInput) {
      titleInput.addEventListener("input", scheduleSave);
      titleInput.addEventListener("blur", persistCurrent);
    }
    if (contentEl) {
      contentEl.addEventListener("input", scheduleSave);
      contentEl.addEventListener("blur", persistCurrent);
    }

    if (fontSelect)
      fontSelect.addEventListener("change", function () {
        document.execCommand("fontName", false, fontSelect.value);
        contentEl.focus();
        scheduleSave();
      });
    if (colorPicker)
      colorPicker.addEventListener("input", function () {
        document.execCommand("foreColor", false, colorPicker.value);
        contentEl.focus();
        scheduleSave();
      });
    if (btnBold)
      btnBold.addEventListener("click", function () {
        exec("bold");
      });
    if (btnItalic)
      btnItalic.addEventListener("click", function () {
        exec("italic");
      });
    if (btnMic) btnMic.addEventListener("click", toggleDictation);

    if (speakLangEl)
      speakLangEl.addEventListener("change", function () {
        localStorage.setItem(SPEAK_KEY, speakLangEl.value);
      });
    if (writeLangEl)
      writeLangEl.addEventListener("change", function () {
        localStorage.setItem(WRITE_KEY, writeLangEl.value);
      });

    if (lichenLangEl)
      lichenLangEl.addEventListener("change", function () {
        setLichenLang(lichenLangEl.value);
        updateChipLabels();
      });

    if (btnAi) btnAi.addEventListener("click", openAiPanel);
    if (btnAiHome) btnAiHome.addEventListener("click", openAiPanel);
    if (aiClose) aiClose.addEventListener("click", closeAiPanel);
    if (aiOverlay) aiOverlay.addEventListener("click", closeAiPanel);
    if (aiSend)
      aiSend.addEventListener("click", function () {
        handleAiSend();
      });
    if (aiInput)
      aiInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          handleAiSend();
        }
      });
    if (aiMic) aiMic.addEventListener("click", toggleAiMic);

    document.querySelectorAll(".ai-chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        handleAiSend("", chip.dataset.action);
      });
    });

    if (aiSaveSettings)
      aiSaveSettings.addEventListener("click", function () {
        saveAiSettings({
          key: (aiApiKey && aiApiKey.value.trim()) || "",
          base: (aiApiBase && aiApiBase.value.trim()) || "https://api.openai.com/v1",
          model: (aiApiModel && aiApiModel.value.trim()) || "gpt-4o-mini",
        });
        if (aiSettingsStatus) aiSettingsStatus.textContent = "Salvo.";
      });

    document.querySelectorAll("[data-theme-toggle]").forEach(function (btn) {
      btn.addEventListener("click", toggleTheme);
    });

    document.addEventListener("keydown", function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        createNote();
      }
    });
  }

  function init() {
    initTheme();
    var s = loadAiSettings();
    if (aiApiKey) aiApiKey.value = s.key || "";
    if (aiApiBase) aiApiBase.value = s.base || "https://api.openai.com/v1";
    if (aiApiModel) aiApiModel.value = s.model || "gpt-4o-mini";
    if (lichenLangEl) lichenLangEl.value = getLichenLang();
    if (speakLangEl) speakLangEl.value = getSpeakLang();
    if (writeLangEl) writeLangEl.value = getWriteLang();
    updateChipLabels();

    notes = loadNotes();
    bindEvents();

    if (homeView) {
      homeView.hidden = false;
      homeView.classList.add("is-visible");
    }
    if (editorView) {
      editorView.hidden = true;
      editorView.classList.remove("is-visible");
    }
    renderHome();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
