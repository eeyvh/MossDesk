/**
 * Mossdesk — local-first notes
 * Lichen assistant: multi-language + cross-language dictation
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

  var $ = function (sel) {
    return document.querySelector(sel);
  };

  var notesListEl = $("#notes-list");
  var searchInput = $("#search-input");
  var titleInput = $("#note-title");
  var contentEl = $("#note-content");
  var editorEmpty = $("#editor-empty");
  var editorForm = $("#editor-form");
  var metaEl = $("#editor-meta");
  var btnNew = $("#btn-new");
  var btnDelete = $("#btn-delete");
  var btnExport = $("#btn-export");
  var btnClear = $("#btn-clear");
  var mobileMenuBtn = $("#mobile-menu-btn");
  var sidebar = $("#sidebar");
  var overlay = $("#sidebar-overlay");
  var fontSelect = $("#font-select");
  var colorPicker = $("#color-picker");
  var btnBold = $("#btn-bold");
  var btnItalic = $("#btn-italic");
  var btnMic = $("#btn-mic");
  var micLabel = $("#mic-label");
  var speakLangEl = $("#dictation-speak-lang");
  var writeLangEl = $("#dictation-write-lang");
  var btnAi = $("#btn-ai");
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

  var SPEECH_TO_CODE = {
    "pt-BR": "pt",
    "en-US": "en",
    "es-ES": "es",
    "de-DE": "de",
    "fr-FR": "fr",
  };

  var CHIP_LABELS = {
    pt: {
      summarize: "Resumir",
      continue: "Continuar",
      shorten: "Encurtar",
      expand: "Expandir",
      improve: "Melhorar",
      outline: "Estrutura",
      questions: "Perguntas",
      research: "Pesquisar",
    },
    en: {
      summarize: "Summarize",
      continue: "Continue",
      shorten: "Shorten",
      expand: "Expand",
      improve: "Improve",
      outline: "Outline",
      questions: "Questions",
      research: "Research",
    },
    es: {
      summarize: "Resumir",
      continue: "Continuar",
      shorten: "Acortar",
      expand: "Expandir",
      improve: "Mejorar",
      outline: "Esquema",
      questions: "Preguntas",
      research: "Investigar",
    },
    de: {
      summarize: "Zusammenfassen",
      continue: "Weiter",
      shorten: "Kürzen",
      expand: "Erweitern",
      improve: "Verbessern",
      outline: "Gliederung",
      questions: "Fragen",
      research: "Recherchieren",
    },
    fr: {
      summarize: "Résumer",
      continue: "Continuer",
      shorten: "Raccourcir",
      expand: "Développer",
      improve: "Améliorer",
      outline: "Plan",
      questions: "Questions",
      research: "Rechercher",
    },
  };

  function getLichenLang() {
    return localStorage.getItem(LANG_KEY) || "pt";
  }

  function setLichenLang(lang) {
    localStorage.setItem(LANG_KEY, lang);
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
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
      var v1 = localStorage.getItem("mossdesk-notes-v1");
      if (v1) {
        var old = JSON.parse(v1);
        if (Array.isArray(old)) {
          return old.map(function (n) {
            return Object.assign({}, n, {
              content: n.content
                ? "<p>" + escapeHtml(String(n.content)).replace(/\n/g, "<br>") + "</p>"
                : "",
            });
          });
        }
      }
      return [];
    } catch (e) {
      return [];
    }
  }

  function saveNotes() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    } catch (err) {
      console.warn("Could not save notes:", err.message);
    }
  }

  function loadAiSettings() {
    try {
      var raw = localStorage.getItem(AI_KEY);
      if (!raw) return { key: "", base: "https://api.openai.com/v1", model: "gpt-4o-mini" };
      return Object.assign(
        { key: "", base: "https://api.openai.com/v1", model: "gpt-4o-mini" },
        JSON.parse(raw)
      );
    } catch (e) {
      return { key: "", base: "https://api.openai.com/v1", model: "gpt-4o-mini" };
    }
  }

  function saveAiSettings(settings) {
    localStorage.setItem(AI_KEY, JSON.stringify(settings));
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function formatDate(ts) {
    var d = new Date(ts);
    var now = new Date();
    var sameDay =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    if (sameDay) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString([], {
      day: "numeric",
      month: "short",
      year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  }

  function stripHtml(html) {
    var div = document.createElement("div");
    div.innerHTML = html || "";
    return (div.textContent || "").replace(/\s+/g, " ").trim();
  }

  function previewText(html, max) {
    max = max || 60;
    var clean = stripHtml(html);
    if (!clean) return "Empty note";
    return clean.length > max ? clean.slice(0, max) + "…" : clean;
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function getFilteredNotes() {
    if (!searchQuery.trim()) return notes;
    var q = searchQuery.toLowerCase();
    return notes.filter(function (n) {
      return (
        (n.title || "").toLowerCase().includes(q) ||
        stripHtml(n.content).toLowerCase().includes(q)
      );
    });
  }

  function renderList() {
    var filtered = getFilteredNotes();
    if (filtered.length === 0) {
      notesListEl.innerHTML =
        '<div class="empty-list">' +
        (searchQuery
          ? "No notes match your search."
          : "No notes yet.<br>Create one when a thought arrives.") +
        "</div>";
      return;
    }
    var sorted = filtered.slice().sort(function (a, b) {
      return b.updatedAt - a.updatedAt;
    });
    notesListEl.innerHTML = sorted
      .map(function (n) {
        return (
          '<div class="note-item ' +
          (n.id === activeId ? "active" : "") +
          '" data-id="' +
          n.id +
          '" role="button" tabindex="0">' +
          '<div class="note-item-title">' +
          escapeHtml(n.title || "Untitled") +
          "</div>" +
          '<div class="note-item-preview">' +
          escapeHtml(previewText(n.content)) +
          "</div>" +
          '<div class="note-item-date">' +
          formatDate(n.updatedAt) +
          "</div></div>"
        );
      })
      .join("");

    notesListEl.querySelectorAll(".note-item").forEach(function (el) {
      el.addEventListener("click", function () {
        selectNote(el.dataset.id);
      });
      el.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectNote(el.dataset.id);
        }
      });
    });
  }

  function renderEditor() {
    var note = notes.find(function (n) {
      return n.id === activeId;
    });
    if (!note) {
      editorForm.hidden = true;
      editorEmpty.hidden = false;
      btnDelete.disabled = true;
      metaEl.textContent = "";
      return;
    }
    editorEmpty.hidden = true;
    editorForm.hidden = false;
    btnDelete.disabled = false;
    titleInput.value = note.title || "";
    contentEl.innerHTML = note.content || "";
    metaEl.textContent = "Updated " + formatDate(note.updatedAt);
  }

  function selectNote(id) {
    persistCurrent();
    activeId = id;
    renderList();
    renderEditor();
    closeMobileSidebar();
    titleInput.focus();
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
    activeId = note.id;
    saveNotes();
    renderList();
    renderEditor();
    titleInput.focus();
    closeMobileSidebar();
  }

  function persistCurrent() {
    if (!activeId) return;
    var note = notes.find(function (n) {
      return n.id === activeId;
    });
    if (!note) return;
    var newTitle = titleInput.value;
    var newContent = contentEl.innerHTML;
    if (note.title !== newTitle || note.content !== newContent) {
      note.title = newTitle;
      note.content = newContent;
      note.updatedAt = Date.now();
      saveNotes();
      renderList();
      metaEl.textContent = "Updated " + formatDate(note.updatedAt);
    }
  }

  function deleteNote() {
    if (!activeId) return;
    var note = notes.find(function (n) {
      return n.id === activeId;
    });
    if (!note) return;
    var label = note.title || "Untitled";
    if (!confirm('Delete "' + label + '"? This cannot be undone.')) return;
    notes = notes.filter(function (n) {
      return n.id !== activeId;
    });
    activeId = notes.length ? notes[0].id : null;
    saveNotes();
    renderList();
    renderEditor();
  }

  function exportNotes() {
    persistCurrent();
    var data = {
      exportedAt: new Date().toISOString(),
      app: "Mossdesk",
      notes: notes,
    };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "mossdesk-notes-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function clearAll() {
    if (notes.length === 0) return;
    if (!confirm("Delete all notes permanently? This cannot be undone. Consider exporting first."))
      return;
    notes = [];
    activeId = null;
    saveNotes();
    renderList();
    renderEditor();
  }

  function openMobileSidebar() {
    sidebar.classList.add("open");
    overlay.classList.add("visible");
  }
  function closeMobileSidebar() {
    sidebar.classList.remove("open");
    overlay.classList.remove("visible");
  }

  function exec(cmd, value) {
    document.execCommand(cmd, false, value);
    contentEl.focus();
    scheduleSave();
  }

  function applyFont(font) {
    document.execCommand("fontName", false, font);
    contentEl.focus();
    scheduleSave();
  }

  function applyColor(color) {
    document.execCommand("foreColor", false, color);
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
        if (data && data.responseData && data.responseData.translatedText) {
          return data.responseData.translatedText;
        }
        return text;
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

  function getSpeechRecognition() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    var r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = getSpeakLang();
    return r;
  }

  function toggleDictation() {
    if (!recognition) {
      recognition = getSpeechRecognition();
      if (!recognition) {
        alert("Speech recognition is not supported in this browser. Try Chrome or Edge.");
        return;
      }
      recognition.onresult = function (event) {
        var final = "";
        for (var i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) final += event.results[i][0].transcript;
        }
        if (!final) return;
        var spoken = final.trim();
        var from = SPEECH_TO_CODE[getSpeakLang()] || "en";
        var to = getWriteLang();
        if (from === to) {
          insertTextAtCursor(spoken);
        } else {
          if (micLabel) micLabel.textContent = "Translating…";
          translateText(spoken, from, to).then(function (translated) {
            insertTextAtCursor(translated);
            if (isListening && micLabel) micLabel.textContent = "Listening…";
            else if (micLabel) micLabel.textContent = "Dictate";
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
    else startDictation();
  }

  function startDictation() {
    try {
      recognition.lang = getSpeakLang();
      recognition.start();
      isListening = true;
      btnMic.classList.add("listening");
      if (micLabel) micLabel.textContent = "Listening…";
    } catch (e) {
      console.warn(e);
    }
  }

  function stopDictation() {
    isListening = false;
    try {
      if (recognition) recognition.stop();
    } catch (e) {}
    btnMic.classList.remove("listening");
    if (micLabel) micLabel.textContent = "Dictate";
  }

  function updateChipLabels() {
    var lang = getLichenLang();
    var labels = CHIP_LABELS[lang] || CHIP_LABELS.en;
    document.querySelectorAll(".ai-chip").forEach(function (chip) {
      var a = chip.dataset.action;
      if (labels[a]) chip.textContent = labels[a];
    });
  }

  function welcomeMessage() {
    var lang = getLichenLang();
    var map = {
      pt: "Olá, eu sou o Lichen — companheiro calmo do Mossdesk. Posso resumir, continuar, encurtar ou melhorar sua nota. Escolha o idioma acima. No editor, fale em um idioma e peça para escrever em outro.",
      en: "Hi, I’m Lichen — Mossdesk’s quiet companion. I can summarize, continue, shorten, or improve your note. Pick a language above. In the editor, speak in one language and write in another.",
      es: "Hola, soy Lichen — el compañero tranquilo de Mossdesk. Puedo resumir, continuar, acortar o mejorar tu nota. Elige el idioma arriba. En el editor, habla en un idioma y escribe en otro.",
      de: "Hallo, ich bin Lichen — der ruhige Begleiter von Mossdesk. Ich kann zusammenfassen, fortsetzen, kürzen oder verbessern. Sprache oben wählen. Im Editor: sprechen in einer Sprache, schreiben in einer anderen.",
      fr: "Bonjour, je suis Lichen — le compagnon calme de Mossdesk. Je peux résumer, continuer, raccourcir ou améliorer votre note. Choisissez la langue ci-dessus. Dans l’éditeur, parlez une langue et écrivez dans une autre.",
    };
    return map[lang] || map.en;
  }

  function openAiPanel() {
    aiPanel.classList.add("open");
    aiPanel.setAttribute("aria-hidden", "false");
    aiOverlay.hidden = false;
    aiOverlay.classList.add("visible");
    if (!aiMessages.children.length) {
      appendAiMessage("assistant", welcomeMessage());
    }
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
      var insertBtn = document.createElement("button");
      insertBtn.type = "button";
      insertBtn.className = "ai-insert-btn";
      var insertLabels = {
        pt: "Inserir na nota",
        en: "Insert into note",
        es: "Insertar en la nota",
        de: "In Notiz einfügen",
        fr: "Insérer dans la note",
      };
      insertBtn.textContent = insertLabels[getLichenLang()] || insertLabels.en;
      insertBtn.addEventListener("click", function () {
        insertHtmlIntoNote(text);
        insertBtn.textContent = "✓";
        insertBtn.disabled = true;
      });
      actions.appendChild(insertBtn);
      wrap.appendChild(actions);
    }
    aiMessages.appendChild(wrap);
    aiMessages.scrollTop = aiMessages.scrollHeight;
    return wrap;
  }

  function setAiBusy(busy) {
    aiBusy = busy;
    if (aiSend) aiSend.disabled = busy;
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
    var title = ctx.title;
    var words = body ? body.split(/\s+/).filter(Boolean).length : 0;
    var lower = (userText || "").toLowerCase();
    var act = action || "";

    function emptyMsg() {
      var m = {
        pt: "A nota ainda está vazia. Escreva ou dite algumas linhas.",
        en: "This note is still empty. Write or dictate a few lines.",
        es: "La nota aún está vacía. Escribe o dicta algunas líneas.",
        de: "Die Notiz ist noch leer. Schreiben oder diktieren Sie ein paar Zeilen.",
        fr: "La note est encore vide. Écrivez ou dictez quelques lignes.",
      };
      return m[lang] || m.en;
    }

    if (/summar/i.test(lower) || act === "summarize") {
      if (!body) return emptyMsg();
      var sentences = body.match(/[^.!?]+[.!?]+/g) || [body];
      var pick = sentences
        .slice(0, 4)
        .map(function (s) {
          return s.trim();
        })
        .join(" ");
      var heads = {
        pt: "Resumo:\n\n",
        en: "Summary:\n\n",
        es: "Resumen:\n\n",
        de: "Zusammenfassung:\n\n",
        fr: "Résumé :\n\n",
      };
      return (heads[lang] || heads.en) + pick + (sentences.length > 4 ? "…" : "");
    }

    if (act === "continue" || /continuar|continue|continuar|weiter|continuer/i.test(lower)) {
      if (!body) return emptyMsg();
      var tail = body.slice(-200).trim();
      var cont = {
        pt: "Sugestão de continuação:\n\n…" + tail + "\n\nAprofunde a ideia central, dê um exemplo e feche com um próximo passo.",
        en: "Suggested continuation:\n\n…" + tail + "\n\nDeepen the core idea, add one example, and close with a next step.",
        es: "Continuación sugerida:\n\n…" + tail + "\n\nProfundiza la idea, añade un ejemplo y cierra con un siguiente paso.",
        de: "Vorschlag zur Fortsetzung:\n\n…" + tail + "\n\nVertiefen Sie die Kernidee, nennen Sie ein Beispiel und schließen Sie mit dem nächsten Schritt.",
        fr: "Suite suggérée :\n\n…" + tail + "\n\nApprofondissez l’idée, ajoutez un exemple et terminez par la prochaine étape.",
      };
      return cont[lang] || cont.en;
    }

    if (act === "shorten" || /shorten|encurtar|acortar|kürzen|raccourcir/i.test(lower)) {
      if (!body) return emptyMsg();
      var short = body
        .replace(/\s+/g, " ")
        .split(/(?<=[.!?])\s+/)
        .slice(0, Math.max(2, Math.ceil(words / 40)))
        .join(" ");
      var sh = {
        pt: "Versão mais curta:\n\n",
        en: "Shorter version:\n\n",
        es: "Versión más corta:\n\n",
        de: "Kürzere Fassung:\n\n",
        fr: "Version plus courte :\n\n",
      };
      return (sh[lang] || sh.en) + (short.length > 500 ? short.slice(0, 500) + "…" : short);
    }

    if (act === "expand" || /expand|expandir|erweitern|développer/i.test(lower)) {
      if (!body) return emptyMsg();
      var ex = {
        pt: "Para expandir:\n\n1. Explique o porquê.\n2. Dê um exemplo concreto.\n3. Mostre a consequência ou próximo passo.",
        en: "To expand:\n\n1. Explain why it matters.\n2. Add a concrete example.\n3. Show the consequence or next step.",
        es: "Para expandir:\n\n1. Explica el porqué.\n2. Añade un ejemplo concreto.\n3. Muestra la consecuencia o el siguiente paso.",
        de: "Zum Erweitern:\n\n1. Erklären Sie das Warum.\n2. Nennen Sie ein konkretes Beispiel.\n3. Zeigen Sie die Folge oder den nächsten Schritt.",
        fr: "Pour développer :\n\n1. Expliquez le pourquoi.\n2. Ajoutez un exemple concret.\n3. Montrez la conséquence ou l’étape suivante.",
      };
      return ex[lang] || ex.en;
    }

    if (act === "improve" || /improve|melhorar|mejorar|verbessern|améliorer/i.test(lower)) {
      if (!body) return emptyMsg();
      var im = {
        pt: "Sugestões:\n\n• Uma ideia clara na primeira frase.\n• Um parágrafo = um pensamento.\n• Palavras concretas.\n• Feche com pergunta ou próximo passo.\n\n~" + words + " palavras.",
        en: "Suggestions:\n\n• One clear idea in the first sentence.\n• One paragraph, one thought.\n• Concrete words.\n• End with a question or next step.\n\n~" + words + " words.",
        es: "Sugerencias:\n\n• Una idea clara al inicio.\n• Un párrafo = un pensamiento.\n• Palabras concretas.\n• Cierra con pregunta o siguiente paso.\n\n~" + words + " palabras.",
        de: "Vorschläge:\n\n• Eine klare Idee im ersten Satz.\n• Ein Absatz = ein Gedanke.\n• Konkrete Wörter.\n• Schließen mit Frage oder nächstem Schritt.\n\n~" + words + " Wörter.",
        fr: "Suggestions :\n\n• Une idée claire dès la première phrase.\n• Un paragraphe = une pensée.\n• Des mots concrets.\n• Terminez par une question ou la suite.\n\n~" + words + " mots.",
      };
      return im[lang] || im.en;
    }

    if (act === "outline" || /outline|estrutura|esquema|gliederung|plan/i.test(lower)) {
      var ou = {
        pt: "Estrutura:\n\n1. Ideia central\n2. Contexto\n3. Pontos principais\n4. Exemplo\n5. Próximos passos",
        en: "Outline:\n\n1. Core idea\n2. Context\n3. Key points\n4. Example\n5. Next steps",
        es: "Esquema:\n\n1. Idea central\n2. Contexto\n3. Puntos clave\n4. Ejemplo\n5. Siguientes pasos",
        de: "Gliederung:\n\n1. Kernidee\n2. Kontext\n3. Hauptpunkte\n4. Beispiel\n5. Nächste Schritte",
        fr: "Plan :\n\n1. Idée centrale\n2. Contexte\n3. Points clés\n4. Exemple\n5. Prochaines étapes",
      };
      return ou[lang] || ou.en;
    }

    if (act === "questions" || /question|perguntas|preguntas|fragen/i.test(lower)) {
      var qu = {
        pt: "Perguntas úteis:\n\n• O que deve ser lembrado?\n• O que estou assumindo?\n• Qual exemplo torna isso concreto?\n• Qual o próximo passo?",
        en: "Useful questions:\n\n• What should be remembered?\n• What am I assuming?\n• What example makes this concrete?\n• What is the next step?",
        es: "Preguntas útiles:\n\n• ¿Qué debe recordarse?\n• ¿Qué estoy asumiendo?\n• ¿Qué ejemplo lo hace concreto?\n• ¿Cuál es el siguiente paso?",
        de: "Nützliche Fragen:\n\n• Was soll man behalten?\n• Was setze ich voraus?\n• Welches Beispiel macht es konkret?\n• Was ist der nächste Schritt?",
        fr: "Questions utiles :\n\n• Que faut-il retenir ?\n• Qu’est-ce que j’assume ?\n• Quel exemple rend cela concret ?\n• Quelle est la prochaine étape ?",
      };
      return qu[lang] || qu.en;
    }

    if (act === "research" || /research|pesquis|investig|recherch/i.test(lower)) {
      var topic = title || body.slice(0, 60) || "…";
      var re = {
        pt: "Para pesquisar “" + topic + "”:\n\n1. Liste 2–3 perguntas abertas.\n2. Busque fontes primárias.\n3. Cole na nota só o essencial.\n\nO Lichen local não navega na web.",
        en: "To research “" + topic + "”:\n\n1. List 2–3 open questions.\n2. Find primary sources.\n3. Paste only what you need.\n\nLocal Lichen does not browse the web.",
        es: "Para investigar “" + topic + "”:\n\n1. Lista 2–3 preguntas abiertas.\n2. Busca fuentes primarias.\n3. Pega solo lo esencial.\n\nLichen local no navega la web.",
        de: "Zur Recherche von “" + topic + "”:\n\n1. 2–3 offene Fragen notieren.\n2. Primärquellen suchen.\n3. Nur das Nötige einfügen.\n\nLokaler Lichen surft nicht im Web.",
        fr: "Pour rechercher « " + topic + " » :\n\n1. Notez 2–3 questions ouvertes.\n2. Cherchez des sources primaires.\n3. Collez seulement l’essentiel.\n\nLichen local ne parcourt pas le web.",
      };
      return re[lang] || re.en;
    }

    if (!body) return emptyMsg();

    var def = {
      pt: "Li “" + (title || "Sem título") + "” (~" + words + " palavras). Peça resumir, continuar, encurtar, expandir, melhorar, estrutura ou perguntas.",
      en: "I read “" + (title || "Untitled") + "” (~" + words + " words). Ask me to summarize, continue, shorten, expand, improve, outline, or list questions.",
      es: "Leí “" + (title || "Sin título") + "” (~" + words + " palabras). Pide resumir, continuar, acortar, expandir, mejorar, esquema o preguntas.",
      de: "Ich las “" + (title || "Ohne Titel") + "” (~" + words + " Wörter). Bitten Sie um Zusammenfassung, Fortsetzung, Kürzen, Erweitern, Verbessern, Gliederung oder Fragen.",
      fr: "J’ai lu « " + (title || "Sans titre") + " » (~" + words + " mots). Demandez un résumé, une suite, un raccourci, un développement, une amélioration, un plan ou des questions.",
    };
    return def[lang] || def.en;
  }

  function buildApiMessages(userText) {
    var ctx = getNoteContext();
    var excerpt = (ctx.body || "").slice(0, 3000);
    var langNames = { pt: "Portuguese", en: "English", es: "Spanish", de: "German", fr: "French" };
    var lang = getLichenLang();
    return [
      {
        role: "system",
        content:
          "You are Lichen, a calm writing companion inside Mossdesk. Always reply in " +
          (langNames[lang] || "English") +
          ". Be concise and helpful with notes, structure, and drafting.",
      },
      {
        role: "user",
        content:
          "Note title: " +
          (ctx.title || "(none)") +
          "\n\nNote excerpt:\n" +
          (excerpt || "(empty)") +
          "\n\nRequest:\n" +
          userText,
      },
    ];
  }

  function callRemoteAi(userText) {
    var settings = loadAiSettings();
    if (!settings.key) return Promise.resolve(null);
    var base = (settings.base || "https://api.openai.com/v1").replace(/\/$/, "");
    var model = settings.model || "gpt-4o-mini";
    return fetch(base + "/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + settings.key,
      },
      body: JSON.stringify({
        model: model,
        messages: buildApiMessages(userText),
        temperature: 0.6,
      }),
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (t) {
          throw new Error("API error " + res.status);
        });
      }
      return res.json().then(function (data) {
        return (
          data &&
          data.choices &&
          data.choices[0] &&
          data.choices[0].message &&
          data.choices[0].message.content
        ) || "No response.";
      });
    });
  }

  function handleAiSend(text, action) {
    if (aiBusy) return;
    var msg = (text || (aiInput && aiInput.value) || "").trim();
    if (!msg && !action) return;

    var labels = CHIP_LABELS[getLichenLang()] || CHIP_LABELS.en;
    var display = msg || (action && labels[action]) || action;
    appendAiMessage("user", display);
    if (aiInput) aiInput.value = "";

    var thinking = appendAiMessage("assistant", "…", { noInsert: true });
    setAiBusy(true);
    var promptForApi = msg || display;

    callRemoteAi(promptForApi)
      .then(function (remote) {
        thinking.remove();
        appendAiMessage("assistant", remote || localAssistantReply(promptForApi, action));
      })
      .catch(function () {
        thinking.remove();
        appendAiMessage("assistant", localAssistantReply(promptForApi, action));
      })
      .then(function () {
        setAiBusy(false);
      });
  }

  function toggleAiMic() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }
    if (aiListening) {
      aiListening = false;
      aiMic.classList.remove("listening");
      return;
    }
    var r = new SR();
    r.lang = getSpeakLang();
    r.interimResults = false;
    r.onresult = function (e) {
      var t = e.results[0][0].transcript;
      aiInput.value = (aiInput.value + " " + t).trim();
    };
    r.onend = function () {
      aiListening = false;
      aiMic.classList.remove("listening");
    };
    r.onerror = function () {
      aiListening = false;
      aiMic.classList.remove("listening");
    };
    aiListening = true;
    aiMic.classList.add("listening");
    try {
      r.start();
    } catch (e) {
      aiListening = false;
      aiMic.classList.remove("listening");
    }
  }

  function initTheme() {
    var stored = localStorage.getItem(THEME_KEY);
    if (stored === "dark" || stored === "light") {
      document.documentElement.setAttribute("data-theme", stored);
    }
  }

  function toggleTheme() {
    var current = document.documentElement.getAttribute("data-theme");
    var systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var next =
      current === "dark" ? "light" : current === "light" ? "dark" : systemDark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem(THEME_KEY, next);
  }

  function fillAiSettingsForm() {
    var s = loadAiSettings();
    if (aiApiKey) aiApiKey.value = s.key || "";
    if (aiApiBase) aiApiBase.value = s.base || "https://api.openai.com/v1";
    if (aiApiModel) aiApiModel.value = s.model || "gpt-4o-mini";
  }

  function fillLangControls() {
    if (lichenLangEl) lichenLangEl.value = getLichenLang();
    if (speakLangEl) speakLangEl.value = getSpeakLang();
    if (writeLangEl) writeLangEl.value = getWriteLang();
    updateChipLabels();
  }

  var saveTimer;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persistCurrent, 400);
  }

  function bindEvents() {
    btnNew.addEventListener("click", createNote);
    btnDelete.addEventListener("click", deleteNote);
    btnExport.addEventListener("click", exportNotes);
    btnClear.addEventListener("click", clearAll);

    searchInput.addEventListener("input", function (e) {
      searchQuery = e.target.value;
      renderList();
    });

    titleInput.addEventListener("input", scheduleSave);
    titleInput.addEventListener("blur", persistCurrent);
    contentEl.addEventListener("input", scheduleSave);
    contentEl.addEventListener("blur", persistCurrent);

    if (mobileMenuBtn) mobileMenuBtn.addEventListener("click", openMobileSidebar);
    if (overlay) overlay.addEventListener("click", closeMobileSidebar);

    document.addEventListener("keydown", function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        createNote();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        exec("bold");
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "i") {
        e.preventDefault();
        exec("italic");
      }
    });

    if (fontSelect)
      fontSelect.addEventListener("change", function () {
        applyFont(fontSelect.value);
      });
    if (colorPicker)
      colorPicker.addEventListener("input", function () {
        applyColor(colorPicker.value);
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
        if (recognition) recognition.lang = speakLangEl.value;
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

    if (aiSaveSettings) {
      aiSaveSettings.addEventListener("click", function () {
        var settings = {
          key: (aiApiKey && aiApiKey.value.trim()) || "",
          base: (aiApiBase && aiApiBase.value.trim()) || "https://api.openai.com/v1",
          model: (aiApiModel && aiApiModel.value.trim()) || "gpt-4o-mini",
        };
        saveAiSettings(settings);
        if (aiSettingsStatus) {
          aiSettingsStatus.textContent = settings.key
            ? "Saved. Remote AI enabled for this browser."
            : "Saved. Local Lichen mode.";
        }
      });
    }

    document.querySelectorAll("[data-theme-toggle]").forEach(function (btn) {
      btn.addEventListener("click", toggleTheme);
    });
  }

  function init() {
    initTheme();
    fillAiSettingsForm();
    fillLangControls();
    notes = loadNotes();
    if (notes.length > 0) activeId = notes[0].id;
    bindEvents();
    renderList();
    renderEditor();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
