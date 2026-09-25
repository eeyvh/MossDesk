/**
 * Mossdesk — local-first notes
 * Rich text, voice dictation, improved AI assistant.
 */

(function () {
  "use strict";

  var STORAGE_KEY = "mossdesk-notes-v2";
  var THEME_KEY = "mossdesk-theme";
  var AI_KEY = "mossdesk-ai-settings";

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
  var btnAi = $("#btn-ai");
  var aiPanel = $("#ai-panel");
  var aiOverlay = $("#ai-overlay");
  var aiClose = $("#ai-close");
  var aiMessages = $("#ai-messages");
  var aiInput = $("#ai-input");
  var aiSend = $("#ai-send");
  var aiMic = $("#ai-mic");
  var aiApiKey = $("#ai-api-key");
  var aiApiBase = $("#ai-api-base");
  var aiApiModel = $("#ai-api-model");
  var aiSaveSettings = $("#ai-save-settings");
  var aiSettingsStatus = $("#ai-settings-status");

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

  function getSpeechRecognition() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    var r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = navigator.language || "pt-BR";
    return r;
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
    if (!activeId) {
      createNote();
    }
    var html = text
      .split(/\n\n+/)
      .map(function (p) {
        return "<p>" + escapeHtml(p).replace(/\n/g, "<br>") + "</p>";
      })
      .join("");
    contentEl.focus();
    if (!stripHtml(contentEl.innerHTML)) {
      contentEl.innerHTML = html;
    } else {
      contentEl.innerHTML += html;
    }
    scheduleSave();
    persistCurrent();
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
        if (final) insertTextAtCursor(final.trim());
      };
      recognition.onerror = function () {
        stopDictation();
      };
      recognition.onend = function () {
        if (isListening) {
          try {
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

  function openAiPanel() {
    aiPanel.classList.add("open");
    aiPanel.setAttribute("aria-hidden", "false");
    aiOverlay.hidden = false;
    aiOverlay.classList.add("visible");
    if (!aiMessages.children.length) {
      appendAiMessage(
        "assistant",
        "Olá. Posso resumir, continuar, encurtar, expandir ou melhorar o que você está escrevendo. Use os atalhos acima ou digite uma pergunta. Sem chave de API, tudo roda neste dispositivo."
      );
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
      insertBtn.textContent = "Insert into note";
      insertBtn.addEventListener("click", function () {
        insertHtmlIntoNote(text);
        insertBtn.textContent = "Inserted";
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

  function looksPortuguese(text) {
    return /[áàâãéêíóôõúç]|\b(que|não|você|para|uma|com|está|são)\b/i.test(text || "");
  }

  function localAssistantReply(userText, action) {
    var ctx = getNoteContext();
    var body = ctx.body;
    var title = ctx.title;
    var words = body ? body.split(/\s+/).filter(Boolean).length : 0;
    var pt = looksPortuguese(body + " " + userText + " " + title);
    var lower = (userText || "").toLowerCase();
    var act = action || "";

    if (/summar/i.test(lower) || act === "summarize") {
      if (!body)
        return pt
          ? "A nota ainda está vazia. Escreva alguns parágrafos e peço um resumo."
          : "This note is still empty. Write a few paragraphs and I can summarize.";
      var sentences = body.match(/[^.!?]+[.!?]+/g) || [body];
      var pick = sentences
        .slice(0, 4)
        .map(function (s) {
          return s.trim();
        })
        .join(" ");
      return (
        (pt ? "Resumo das ideias principais:\n\n" : "Main ideas:\n\n") +
        pick +
        (sentences.length > 4 ? "…" : "") +
        (pt ? "\n\n(~" + words + " palavras)" : "\n\n(~" + words + " words)")
      );
    }

    if (act === "continue" || /continuar|continue writing|continue/i.test(lower)) {
      if (!body)
        return pt
          ? "Comece com uma ou duas frases. Depois posso sugerir a continuação."
          : "Start with a line or two. Then I can suggest a continuation.";
      var tail = body.slice(-220).trim();
      return pt
        ? "Sugestão de continuação (edite à vontade):\n\n…" +
            tail +
            "\n\nA partir daí, vale aprofundar o ponto central, dar um exemplo concreto e fechar com a próxima pergunta que você ainda precisa responder."
        : "Suggested continuation (edit freely):\n\n…" +
            tail +
            "\n\nFrom here, deepen the main point, add one concrete example, and end with the next question you still need to answer.";
    }

    if (act === "shorten" || /shorten|encurtar|resumir texto/i.test(lower)) {
      if (!body)
        return pt ? "Não há texto para encurtar ainda." : "There is no text to shorten yet.";
      var short = body
        .replace(/\s+/g, " ")
        .split(/(?<=[.!?])\s+/)
        .slice(0, Math.max(2, Math.ceil(words / 40)))
        .join(" ");
      return (
        (pt ? "Versão mais curta:\n\n" : "Shorter version:\n\n") +
        (short.length > 500 ? short.slice(0, 500) + "…" : short)
      );
    }

    if (act === "expand" || /expand|expandir|desenvolver/i.test(lower)) {
      if (!body)
        return pt
          ? "Escreva a ideia central primeiro; depois ajudo a expandir."
          : "Write the core idea first; then I can help expand it.";
      return pt
        ? "Para expandir este trecho:\n\n1. Explique o porquê (motivo ou contexto).\n2. Dê um exemplo real ou cenário.\n3. Mostre a consequência ou o próximo passo.\n\nVocê pode pedir: “expanda o segundo parágrafo” depois de marcar a parte."
        : "To expand this draft:\n\n1. Explain why it matters.\n2. Add a concrete example.\n3. Show the consequence or next step.\n\nYou can also ask to expand a specific paragraph.";
    }

    if (act === "improve" || /improve|melhorar|clarity|estrutura/i.test(lower)) {
      if (!body)
        return pt
          ? "Adicione texto primeiro. Depois sugiro clareza e estrutura."
          : "Add some text first. Then I can suggest clarity and structure.";
      return pt
        ? "Sugestões calmas para esta nota:\n\n• Comece com uma ideia clara na primeira frase.\n• Um parágrafo = um pensamento.\n• Prefira palavras concretas.\n• Termine com uma pergunta ou próximo passo.\n\nContagem aproximada: " +
            words +
            " palavras."
        : "Calm suggestions for this note:\n\n• Lead with one clear idea.\n• One paragraph, one thought.\n• Prefer concrete words.\n• End with a question or next step.\n\nApprox. word count: " +
            words +
            ".";
    }

    if (act === "outline" || /outline|estrutura|esqueleto|tópicos/i.test(lower)) {
      if (!body)
        return pt
          ? "Estrutura sugerida para começar:\n\n1. Ideia central\n2. Contexto\n3. Pontos principais\n4. Exemplo\n5. Conclusão ou próximos passos"
          : "Suggested outline to start:\n\n1. Core idea\n2. Context\n3. Key points\n4. Example\n5. Conclusion or next steps";
      return pt
        ? "Possível estrutura a partir do que você já escreveu:\n\n1. Abertura — o que está em jogo\n2. Desenvolvimento — argumentos ou fatos\n3. Exemplo ou evidência\n4. Tensão / dúvida restante\n5. Fechamento — o que fazer em seguida\n\nTítulo atual: “" +
            (title || "Sem título") +
            "”"
        : "Possible structure from what you already wrote:\n\n1. Opening — what’s at stake\n2. Development — arguments or facts\n3. Example or evidence\n4. Remaining tension / open question\n5. Close — what to do next\n\nCurrent title: “" +
            (title || "Untitled") +
            "”";
    }

    if (act === "questions" || /question|perguntas/i.test(lower)) {
      return pt
        ? "Perguntas úteis para continuar:\n\n• O que a pessoa leitora deve lembrar?\n• O que estou assumindo que pode estar errado?\n• Qual exemplo tornaria isso concreto?\n• Qual é o próximo passo claro?"
        : "Useful questions to keep writing:\n\n• What should the reader remember?\n• What am I assuming that might be wrong?\n• What example would make this concrete?\n• What is the clear next step?";
    }

    if (act === "research" || /research|pesquis|topic|conceito/i.test(lower)) {
      var topic = title || body.slice(0, 80) || (pt ? "seu tema" : "your topic");
      return pt
        ? "Para pesquisar “" +
            topic +
            "” sem perder privacidade:\n\n1. Anote 2–3 perguntas que ainda restam.\n2. Busque fontes primárias (docs, papers, sites oficiais).\n3. Cole na nota só os fatos que precisa.\n\nEste assistente local não navega na web — assim suas anotações ficam no dispositivo."
        : "To research “" +
            topic +
            "” while staying private:\n\n1. Note 2–3 remaining questions.\n2. Look up primary sources.\n3. Paste only the facts you need back into the note.\n\nThis local assistant does not browse the web — so your writing stays on-device.";
    }

    if (!body) {
      return pt
        ? "Sua nota está vazia. Use o microfone na barra de ferramentas ou escreva algumas linhas. Depois peça resumo, continuação ou estrutura."
        : "Your note is empty. Use the microphone in the toolbar or write a few lines. Then ask for a summary, continuation, or outline.";
    }

    return pt
      ? "Li a nota “" +
          (title || "Sem título") +
          "” (~" +
          words +
          " palavras).\n\nVocê pode pedir: resumir, continuar, encurtar, expandir, melhorar, estrutura ou perguntas. Também dá para digitar uma dúvida específica."
      : "I looked at “" +
          (title || "Untitled") +
          "” (~" +
          words +
          " words).\n\nYou can ask me to summarize, continue, shorten, expand, improve, outline, or list questions — or type a specific question.";
  }

  function buildApiMessages(userText) {
    var ctx = getNoteContext();
    var excerpt = (ctx.body || "").slice(0, 3000);
    return [
      {
        role: "system",
        content:
          "You are a calm writing assistant inside Mossdesk, a local-first notes app. Help with clarity, structure, research framing, and drafting. Be concise. Match the user's language (Portuguese or English). When rewriting, return text ready to paste into a note.",
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
          throw new Error("API error " + res.status + ": " + t.slice(0, 200));
        });
      }
      return res.json().then(function (data) {
        var content =
          data &&
          data.choices &&
          data.choices[0] &&
          data.choices[0].message &&
          data.choices[0].message.content;
        return content || "No response from model.";
      });
    });
  }

  function handleAiSend(text, action) {
    if (aiBusy) return;
    var msg = (text || (aiInput && aiInput.value) || "").trim();
    if (!msg && !action) return;

    var display = msg;
    if (!display && action) {
      var labels = {
        summarize: "Summarize",
        continue: "Continue writing",
        shorten: "Shorten",
        expand: "Expand",
        improve: "Improve",
        outline: "Outline",
        questions: "Questions",
        research: "Research tips",
      };
      display = labels[action] || action;
    }

    appendAiMessage("user", display);
    if (aiInput) aiInput.value = "";

    var thinking = appendAiMessage("assistant", "…", { noInsert: true });
    setAiBusy(true);

    var promptForApi = msg || display;

    callRemoteAi(promptForApi)
      .then(function (remote) {
        thinking.remove();
        if (remote) {
          appendAiMessage("assistant", remote);
        } else {
          appendAiMessage("assistant", localAssistantReply(promptForApi, action));
        }
      })
      .catch(function (err) {
        thinking.remove();
        appendAiMessage(
          "assistant",
          "Não foi possível usar a API (" +
            (err.message || "erro") +
            "). Usando modo local:\n\n" +
            localAssistantReply(promptForApi, action)
        );
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
    r.lang = navigator.language || "pt-BR";
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
            ? "Saved. Remote AI is enabled for this browser only."
            : "Saved. Running in local mode (no API key).";
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
