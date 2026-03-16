# Design: Markdown Inline Comments, Character-Level Highlight & Preview/Edit Mode

**Date**: 2026-03-13  
**Branch**: `feat/markdown-improvements-v2`  
**Status**: Implemented

---

## Background

The Markdown file renderer (`packages/markdown-file-renderer`) previously supported basic preview rendering and a global copy button. This document covers the design decisions behind four improvements shipped together:

1. Inline comment editing
2. Character-level text highlight
3. Preview / edit dual mode
4. Bug fixes (copy button, file tab activation, Ctrl+C, highlight range)

---

## 1. Inline Comment Editing

### Problem

After submitting a comment from a Markdown file, the comment was locked — the only option was to delete it. There was no way to fix a typo or update the wording without starting over.

### Design

**Data layer**

- Add `comments.update(file, id, newComment)` to `comments.tsx`: updates the comment text in the SolidJS store without changing the id or selection range.
- Add `prompt.context.updateComment(commentID, newComment)` to `prompt.tsx`: finds the corresponding context item and updates its `comment` field so the AI prompt stays in sync.

**UI layer**

- `LineComment` component gains an `onSave` prop (typed `string`, not `JSX.Element`, so the parent can read the current value).
- When the bubble is expanded, an edit icon appears in the top-right corner (positioned absolutely, `opacity: 0.7`, hover deepens to `--text-strong`).
- Clicking the icon switches the bubble body to an edit textarea pre-filled with the existing comment text.
- Keyboard: **Enter** submits, **Escape** cancels. Clicking the bubble `onClick` re-focuses the textarea.
- On save, `file-tabs.tsx` calls both `comments.update` and `prompt.context.updateComment`.

**CSS consideration**

The global rule `[data-component="line-comment"] [data-component="icon"] { color: var(--white) }` was narrowed to only apply inside `[data-slot="line-comment-button"]`, so the edit icon inherits `--text-base` instead of rendering invisibly white on the light popover background.

---

## 2. Character-Level Text Highlight

### Problem

The previous approach attached `data-line-selected` / `data-line-commented` attributes to block DOM nodes (`<p>`, `<li>`, etc.) and used CSS background-color. This gave block-level granularity at best — selecting three words inside a paragraph highlighted the entire paragraph.

Additionally, container elements (`<ul>`, `<ol>`, `<table>`) received `data-line-anchor`, causing highlights to span entire lists or tables rather than individual items.

### Design

**CSS Custom Highlight API**

Both highlight layers now use `CSS.highlights` + `Highlight` + `Range`, which operates at the text-node character level:

- `md-selected` — live drag selection: captured directly from `Selection.getRangeAt(0)` in `handleMouseUp` / `handleSelectionChange`. No coordinate math needed; the browser's own selection range is used as-is.
- `md-commented` — submitted comment range: reconstructed from `startCol`/`endCol` stored in `SelectedLineRange`. A `TreeWalker` over the block's text nodes translates the column offset into a precise `{ node, offset }` pair, which is used to call `Range.setStart` / `Range.setEnd`.

**Annotate plugin changes**

`render/annotate.ts` introduces a `containers` set (`ul`, `ol`, `table`, `thead`, `tbody`). These elements still receive `data-sourcepos` (needed for column offset calculation) but no longer receive `data-line-anchor`. Only leaf-level blocks (`li`, `p`, `h1`–`h6`, `pre`, `td`, `th`, `tr`, `blockquote`, `hr`) get `data-line-anchor`.

**Column precision**

`LineRange` and `SelectedLineRange` gain optional `startCol`/`endCol` fields. `rangeFromSelection` in `preview/selection.ts` computes these by:

1. Walking up from the text node's parent to find the nearest non-container ancestor with `data-sourcepos`.
2. Using a `TreeWalker` to count characters from the block start to the selection boundary.
3. Adding the block's `startCol` (from `data-sourcepos`) to get a 1-based absolute column number.

`selectionFromLines` in `context/file/types.ts` forwards `startCol - 1` (0-based) and `endCol` into `FileSelection.startChar`/`endChar`, so the AI prompt context receives character-precise ranges.

---

## 3. Preview / Edit Dual Mode

### Problem

The Markdown renderer was preview-only. There was no way to edit file content directly in the rendered view.

### Design

**Mode prop**

`FileRenderProps` gains `mode?: "preview" | "edit"` (default `"preview"`). The renderer itself holds no mode state; switching is controlled externally and is intended to be bound to the agent mode in a future PR.

**Edit mode**

When `mode === "edit"`, the content `<div>` becomes `contentEditable`. A debounced `input` listener (300 ms) serializes the DOM back to Markdown via [Turndown](https://github.com/mixmark-io/turndown) (`domToMarkdown` in `editor/serializer.ts`) and stores it in an `internalMarkdown` signal.

Switching back to preview re-renders from `internalMarkdown`, so edits are preserved.

**Turndown configuration**

- `headingStyle: "atx"` — `#` prefixes, not underline style
- `codeBlockStyle: "fenced"` — triple-backtick fences
- `bulletListMarker: "-"`
- GFM plugin enabled (tables, strikethrough)

Turndown has no TypeScript declarations available via symlinked `node_modules`, so `editor/serializer.ts` uses `// @ts-nocheck` to bypass type checking for that file only.

**Selection / highlight in edit mode**

When `mode === "edit"`, `onLineSelectionEnd` is not fired and both highlight layers are cleared. This avoids confusion between edit-mode cursor position and comment selection.

---

## 4. Bug Fixes

### Copy button check icon invisible after mouse-leave

The toolbar button container had `opacity: 0` by default, restored to 0 on `mouseleave`. After clicking copy and moving the mouse away, the check icon became invisible before the 2-second timer elapsed.

**Fix**: When `copied()` is true, set `data-copied="true"` on the container div. A CSS rule `[data-slot="markdown-file-copy"][data-copied="true"]` forces `opacity: 1`.

### New file tab not activating after file-tree click

Clicking a file in the file tree called `tabs().open(next)`, which correctly set `store.sessionTabs[session].active = next`. However, the `Tabs value={activeTab()}` prop updated before Kobalte's internal collection had registered the new `Trigger`. Kobalte then fell back to the first tab and fired `onChange("故事大纲")`, which called `openTab` again and overwrote `active` with the first tab.

**Fix**: A `suppressOnChange` boolean flag in `session-side-panel.tsx`. When `openTab` detects the tab is new (not yet in `tabs().all()`), it sets the flag before calling `tabs().open()` and schedules `requestAnimationFrame(() => { suppressOnChange = false })`. The `handleTabChange` wrapper passed to `Tabs onChange` returns early while the flag is set, blocking the spurious callback.

### Ctrl+C broken in Markdown preview

Dragging to select text triggered `onLineSelectionEnd`, which rendered `LineCommentEditor`. The editor's `onMount` called `requestAnimationFrame(focus)`, moving focus to the textarea and destroying the browser's text selection before the user could press Ctrl+C.

**Fix**: Pass `autofocus={false}` to `LineCommentEditor` when it is shown as a result of text selection (i.e., not opened via an explicit user click on a comment bubble). The comment box appears but does not steal focus; clicking it focuses the textarea normally.

### Comment bubble auto-expanding after submit

After `addCommentToContext`, the `comments.add()` call internally invoked `setFocus({ file, id })`. A `createEffect` in `file-tabs.tsx` watched `comments.focus()` and called `setNote("openedComment", id)`, causing the newly created bubble to expand and obscure the document.

**Fix**: After `setNote("commenting", null)` in `onSubmit`, schedule `requestAnimationFrame(() => setNote("openedComment", null))`. This runs after the focus effect has expanded the bubble, immediately collapsing it.

---

## Testing

All changes were validated through a multi-round Engineer ↔ Experimenter loop using Playwright MCP against a running `opencode-drama` instance (localhost:5444). Logs are in `UI-test/log/round-005` through `round-010`.
