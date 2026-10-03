# Backup: Name Tracker Extension Prompt

Saved 2026-10-03 as a backup. The project direction changed to a wiki generator instead.

Open questions that were never answered:
1. Should hovering an underlined term show a quick read-only preview, or should only Cmd+click open the note?
2. Link to the "hivemind" reading site, to confirm story detection works there.

---

```
Build a browser extension (Firefox first, Chrome second) for tracking character
names and other terms (items, places, skills, etc.) while reading light novels
on websites.

TECH
- Manifest V3 WebExtension, TypeScript, using WXT so one codebase builds for
  both Firefox and Chrome.
- All data in browser.storage.local. Include JSON export/import for backup.
- Must work on any site. Primary test site: https://novels-reader.pages.dev/
  (path-based URLs like /cote, /rezero, /novel/4239; loads content dynamically).

DATA MODEL
- Story: title, editable general summary note, and the URL patterns that
  identify it.
- Entry: belongs to exactly one story. Primary name, list of aliases,
  category (Character, Item, Place, Skill, Organization, + custom),
  underline color, and an editable note.
- The same name can exist in different stories as completely separate entries.
  Lookups always happen only within the current story.

STORY DETECTION
- Auto-detect the current story from the URL path (e.g. /cote → one story,
  /novel/4239 → another), falling back to page title.
- If unknown or wrong, let me pick/create the story from the toolbar popup
  and remember that URL pattern.
- Watch for in-page navigation (SPA route changes) and re-detect.

CREATING ENTRIES
- Highlight text → right-click (two-finger tap on Mac trackpad) → context menu:
  - "Add note" → opens a small inline editor pre-filled with the selected
    text, where I set category, color, and the note.
  - "Add as alias of…" → pick an existing entry in the current story; the
    selected text becomes another alias of that entry.
- Aliases can also be added/removed/edited from the entry's editor.

VIEWING / EDITING
- On every page of a detected story, automatically underline all occurrences
  of saved names and aliases (whole-word, case-insensitive) in the entry's
  color.
- Cmd+click (Ctrl+click on Windows) on an underlined term opens a small popup
  with the note; I can edit it right there.
- Re-scan when new text loads (MutationObserver) without slowing down the page.

COLORS
- Each category has a default underline color I can change.
- Each entry can override with its own color.

SIDEBAR
- Shows the current story's general summary (editable) and a searchable,
  filterable list of all its entries, with edit/delete.

OUT OF SCOPE FOR V1
- PDF, EPUB, cloud sync, mobile, spoiler/chapter tracking.

Start by proposing the file structure and data model, then build in this
order: storage + data model → story detection → page highlighting →
right-click create/alias flow → Cmd+click popup editor → sidebar →
export/import.
```
