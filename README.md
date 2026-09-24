# Mossdesk

**A calm place for your thoughts.**

Mossdesk is a local-first notes app designed to feel hand-crafted, not generated.  
All data stays on the user’s device. Nothing is sent to any server.

---

## Design decisions

| Aspect            | Choice                                      | Why |
|-------------------|---------------------------------------------|-----|
| Name              | Mossdesk                                    | Quiet, grounded, specific |
| Tagline           | A calm place for your thoughts              | Human, not marketing-speak |
| Colors            | Warm linen `#F4F1EC` + muted sage `#5C7A6B` | Calm, restrained, no neon or “AI purple” |
| Typography        | Fraunces (display) + Source Sans 3 (body)   | Distinctive pairing, readable, human |
| Layout            | Asymmetric split (narrow list + editor)     | Avoids generic 3-column feature grids |
| Data              | Browser localStorage only                   | Maximum privacy, zero network dependency |

### Color tokens

```
--bg:            #F4F1EC
--surface:       #FFFBF7
--text:          #2A2825
--text-muted:    #6B6560
--accent:        #5C7A6B
--accent-hover:  #4A6557
--border:        #E5E0D8
```

---

## Privacy & security

- **No accounts.** No login, no email collection.
- **No servers.** Notes never leave the browser.
- **No tracking.** No analytics, no third-party scripts (except Google Fonts for typography).
- **Export anytime.** JSON download of all notes.
- **Delete anytime.** Clear all data with one confirmation.
- **No secrets in code.** Nothing sensitive is hardcoded.

This follows the local-first ideal: the device is the source of truth.

---

## How to run

1. Open `index.html` in any modern browser, or
2. Serve the folder with any static server:

```bash
# Example
npx serve .
# or
python -m http.server 8080
```

Then visit the URL shown.

---

## Features

- Create, edit, and delete notes
- Live search across titles and content
- Auto-save (debounced)
- Export all notes as JSON
- Clear all data
- Keyboard shortcut: `⌘N` / `Ctrl+N` for new note
- Responsive (mobile sidebar)
- Human empty states

---

## File structure

```
mossdesk/
├── index.html      # Landing page
├── app.html        # The notes application
├── css/
│   └── styles.css  # All design tokens and styles
├── js/
│   └── app.js      # Local-first logic (localStorage)
└── README.md
```

---

## What makes this “human-crafted”

- Unique name and calm visual identity
- No generic AI layout patterns
- Intentional spacing and soft contrast
- Copy written for this specific product
- Privacy treated as architecture, not a feature checkbox
- Every project following the same skill should look different from this one

---

Made with the **human-crafted-web** skill.  
Your data stays with you.
