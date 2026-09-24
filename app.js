/**
 * Mossdesk — local-first notes
 * Rich text, voice dictation, AI assistant panel.
 */

(function () {
  "use strict";

  const STORAGE_KEY = "mossdesk-notes-v2";
  const THEME_KEY = "mossdesk-theme";

  let notes = [];
  let activeId = null;
  let searchQuery = "";
  let recognition = null;
  let isListening = false;
  let aiListening = false;

  const $ = (sel) => document.querySelector(sel);
  const notesListEl = $("#notes-list");
  const searchInput = $("#search-input");
  const titleInput = $("#note-title");
  const contentEl = $("#note-content");
  const editorEmpty = $("#editor-empty");
  const editorForm = $("#editor-form");
  const metaEl = $("#editor-meta");
  const btnNew = $("#btn-new");
  const btnDelete = $("#btn-delete");
  const btnExport = $("#btn-export");
  const btnClear = $("#btn-clear");
  const mobileMenuBtn = $("#mobile-menu-btn");
  const sidebar = $("#sidebar");
  const overlay = $("#sidebar-overlay");
  const fontSelect = $("#font-select");
  const colorPicker = $("#color-picker");
  const btnBold = $("#btn-bold");
  const btnItalic = $("#btn-italic");
  const btnMic = $("#btn-mic");
  const micLabel = $("#mic-label");
  const btnAi = $("#btn-ai");
  const aiPanel = $("#ai-panel");
  const aiOverlay = $("#ai-overlay");
  const aiClose = $("#ai-close");
  const aiMessages = $("#ai-messages");
  const aiInput = $("#ai-input");
  const aiSend = $("#ai-send");
  const aiMic = $("#ai-mic");

  function loadNotes() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
      const v1 = localStorage.getItem("mossdesk-notes-v1");
      if (v1) {
        const old = JSON.parse(v1);
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
    r.lang = navigator.language || "en-US";
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
        "Hi. I can help with questions about your note, suggest structure, or explore the topic. Use the chips above or type below. Voice dictation works in the editor and here."
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

  function appendAiMessage(role, text) {
    var div = document.createElement("div");
    div.className = "ai-msg ai-msg--" + role;
    div.textContent = text;
    aiMessages.appendChild(div);
    aiMessages.scrollTop = aiMessages.scrollHeight;
  }

  function getNoteContext() {
    var note = notes.find(function (n) {
      return n.id === activeId;
    });
    if (!note) return { title: "", body: "" };
    return { title: note.title || "", body: stripHtml(note.content) };
  }

  function localAssistantReply(userText) {
    var ctx = getNoteContext();
    var lower = userText.toLowerCase();
    var words = ctx.body ? ctx.body.split(/\s+/).filter(Boolean).length : 0;

    if (/summar/i.test(lower)) {
      if (!ctx.body) return "This note is still empty. Write a few paragraphs and I can summarize the main ideas.";
      var sentences = ctx.body.match(/[^.!?]+[.!?]+/g) || [ctx.body];
      var pick = sentences
        .slice(0, 3)
        .map(function (s) {
          return s.trim();
        })
        .join(" ");
      return "Here’s a short take on what you wrote:\n\n" + pick + (sentences.length > 3 ? "…" : "");
    }
    if (/improve|clarity|structure|rewrite/i.test(lower)) {
      if (!ctx.body)
        return "Add some text first. Then I can suggest clearer structure, shorter sentences, or stronger openings.";
      return (
        "A few calm suggestions for this note:\n\n" +
        "• Lead with one clear idea in the first sentence.\n" +
        "• Break long paragraphs so each holds a single thought.\n" +
        "• Prefer concrete words over vague ones.\n" +
        "• End with a question or next step if it fits.\n\n" +
        "Word count right now: about " +
        words +
        "."
      );
    }
    if (/research|explain|topic|concept/i.test(lower)) {
      var topic = ctx.title || ctx.body.slice(0, 80) || "your topic";
      return (
        'To research “' +
        topic +
        '” while staying private:\n\n' +
        "1. Note 2–3 questions you still have.\n" +
        "2. Look up primary sources (docs, papers, official sites).\n" +
        "3. Paste only the facts you need back into this note.\n\n" +
        "I don’t browse the web from this page by default — that keeps your writing local. You can still use the chips to structure your thinking."
      );
    }
    if (/question/i.test(lower)) {
      return (
        "Useful questions to keep writing:\n\n" +
        "• What is the one thing the reader should remember?\n" +
        "• What am I assuming that might be wrong?\n" +
        "• What example would make this concrete?\n" +
        "• What should happen next?"
      );
    }
    if (!ctx.body) {
      return "Your note is empty. Try dictating with the microphone in the toolbar, or write a few lines. Then ask me to summarize, improve structure, or list open questions.";
    }
    return (
      'I looked at your current note (“' +
      (ctx.title || "Untitled") +
      '”, ~' +
      words +
      " words).\n\n" +
      "You can ask me to summarize, improve clarity, list open questions, or focus on a specific paragraph. " +
      "Voice dictation works in the editor (Dictate button) so you can speak and have text appear automatically."
    );
  }

  function handleAiSend(text) {
    var msg = (text || aiInput.value || "").trim();
    if (!msg) return;
    appendAiMessage("user", msg);
    aiInput.value = "";
    var reply = localAssistantReply(msg);
    setTimeout(function () {
      appendAiMessage("assistant", reply);
    }, 280);
  }

  function toggleAiMic() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }
    if (aiListening) {
      aiListening = false;
      try {
        if (recognition) recognition.stop();
      } catch (e) {}
      aiMic.classList.remove("listening");
      return;
    }
    var r = new SR();
    r.lang = navigator.language || "en-US";
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
        handleAiSend(chip.dataset.prompt);
      });
    });

    document.querySelectorAll("[data-theme-toggle]").forEach(function (btn) {
      btn.addEventListener("click", toggleTheme);
    });
  }

  function init() {
    initTheme();
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
