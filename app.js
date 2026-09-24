/**
 * Mossdesk — local-first notes
 * All data stays in the browser. Nothing is sent anywhere.
 */

(function () {
  "use strict";

  const STORAGE_KEY = "mossdesk-notes-v1";

  // ---------- State ----------
  let notes = [];
  let activeId = null;
  let searchQuery = "";

  // ---------- DOM refs ----------
  const $ = (sel) => document.querySelector(sel);
  const notesListEl = $("#notes-list");
  const searchInput = $("#search-input");
  const titleInput = $("#note-title");
  const contentInput = $("#note-content");
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

  // ---------- Storage ----------
  function loadNotes() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed;
    } catch {
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

  // ---------- Helpers ----------
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function formatDate(ts) {
    const d = new Date(ts);
    const now = new Date();
    const sameDay =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();

    if (sameDay) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString([], {
      day: "numeric",
      month: "short",
      year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  }

  function previewText(text, max = 60) {
    if (!text) return "Empty note";
    const clean = text.replace(/\s+/g, " ").trim();
    return clean.length > max ? clean.slice(0, max) + "…" : clean;
  }

  function getFilteredNotes() {
    if (!searchQuery.trim()) return notes;
    const q = searchQuery.toLowerCase();
    return notes.filter(
      (n) =>
        (n.title || "").toLowerCase().includes(q) ||
        (n.content || "").toLowerCase().includes(q)
    );
  }

  // ---------- Render ----------
  function renderList() {
    const filtered = getFilteredNotes();

    if (filtered.length === 0) {
      notesListEl.innerHTML = `
        <div class="empty-list">
          ${
            searchQuery
              ? "No notes match your search."
              : "No notes yet.<br>Create one when a thought arrives."
          }
        </div>`;
      return;
    }

    // Sort by updatedAt descending
    const sorted = [...filtered].sort((a, b) => b.updatedAt - a.updatedAt);

    notesListEl.innerHTML = sorted
      .map(
        (n) => `
      <div class="note-item ${n.id === activeId ? "active" : ""}" data-id="${n.id}" role="button" tabindex="0">
        <div class="note-item-title">${escapeHtml(n.title || "Untitled")}</div>
        <div class="note-item-preview">${escapeHtml(previewText(n.content))}</div>
        <div class="note-item-date">${formatDate(n.updatedAt)}</div>
      </div>`
      )
      .join("");

    // Bind clicks
    notesListEl.querySelectorAll(".note-item").forEach((el) => {
      el.addEventListener("click", () => selectNote(el.dataset.id));
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectNote(el.dataset.id);
        }
      });
    });
  }

  function renderEditor() {
    const note = notes.find((n) => n.id === activeId);

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
    contentInput.value = note.content || "";
    metaEl.textContent = `Updated ${formatDate(note.updatedAt)}`;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ---------- Actions ----------
  function selectNote(id) {
    // Save current before switching
    persistCurrent();
    activeId = id;
    renderList();
    renderEditor();
    closeMobileSidebar();
    titleInput.focus();
  }

  function createNote() {
    persistCurrent();
    const note = {
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
    const note = notes.find((n) => n.id === activeId);
    if (!note) return;

    const newTitle = titleInput.value;
    const newContent = contentInput.value;

    if (note.title !== newTitle || note.content !== newContent) {
      note.title = newTitle;
      note.content = newContent;
      note.updatedAt = Date.now();
      saveNotes();
      renderList();
      metaEl.textContent = `Updated ${formatDate(note.updatedAt)}`;
    }
  }

  function deleteNote() {
    if (!activeId) return;
    const note = notes.find((n) => n.id === activeId);
    if (!note) return;

    const label = note.title || "Untitled";
    if (!confirm(`Delete “${label}”? This cannot be undone.`)) return;

    notes = notes.filter((n) => n.id !== activeId);
    activeId = notes.length ? notes[0].id : null;
    saveNotes();
    renderList();
    renderEditor();
  }

  function exportNotes() {
    persistCurrent();
    const data = {
      exportedAt: new Date().toISOString(),
      app: "Mossdesk",
      notes: notes,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mossdesk-notes-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function clearAll() {
    if (notes.length === 0) return;
    if (
      !confirm(
        "Delete all notes permanently? This cannot be undone. Consider exporting first."
      )
    )
      return;
    notes = [];
    activeId = null;
    saveNotes();
    renderList();
    renderEditor();
  }

  // ---------- Mobile sidebar ----------
  function openMobileSidebar() {
    sidebar.classList.add("open");
    overlay.classList.add("visible");
  }

  function closeMobileSidebar() {
    sidebar.classList.remove("open");
    overlay.classList.remove("visible");
  }

  // ---------- Events ----------
  function bindEvents() {
    btnNew.addEventListener("click", createNote);
    btnDelete.addEventListener("click", deleteNote);
    btnExport.addEventListener("click", exportNotes);
    btnClear.addEventListener("click", clearAll);

    searchInput.addEventListener("input", (e) => {
      searchQuery = e.target.value;
      renderList();
    });

    // Auto-save on input (debounced lightly)
    let saveTimer;
    const scheduleSave = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(persistCurrent, 400);
    };

    titleInput.addEventListener("input", scheduleSave);
    contentInput.addEventListener("input", scheduleSave);

    // Also save on blur
    titleInput.addEventListener("blur", persistCurrent);
    contentInput.addEventListener("blur", persistCurrent);

    // Mobile
    if (mobileMenuBtn) {
      mobileMenuBtn.addEventListener("click", openMobileSidebar);
    }
    if (overlay) {
      overlay.addEventListener("click", closeMobileSidebar);
    }

    // Keyboard: Ctrl/Cmd + N for new note
    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        createNote();
      }
    });
  }

  // ---------- Init ----------
  function init() {
    notes = loadNotes();
    if (notes.length > 0) {
      activeId = notes[0].id;
    }
    bindEvents();
    renderList();
    renderEditor();
  }

  // Start
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
  // ---------- Theme toggle ----------
  function initTheme() {
    const stored = localStorage.getItem("mossdesk-theme");
    if (stored === "dark" || stored === "light") {
      document.documentElement.setAttribute("data-theme", stored);
    }
    // else: let prefers-color-scheme handle it
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme");
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    let next;

    if (current === "dark") {
      next = "light";
    } else if (current === "light") {
      next = "dark";
    } else {
      // No explicit choice yet → opposite of system
      next = systemDark ? "light" : "dark";
    }

    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("mossdesk-theme", next);
  }

  // Call on load
  initTheme();

  // Bind toggle buttons (both landing and app)
  document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
    btn.addEventListener("click", toggleTheme);
  });})();
