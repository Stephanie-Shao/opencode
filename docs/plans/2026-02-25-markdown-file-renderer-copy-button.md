# Markdown File Renderer Copy Button Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a hover-revealed copy button to the markdown file renderer that copies the raw markdown source to clipboard.

**Architecture:** Implement a small overlay action button inside the markdown renderer root. The button uses the same `IconButton` + `Tooltip` styling patterns used in the app sidebar actions. Clicking copies `props.file.contents` via `navigator.clipboard.writeText`, shows a transient "Copied" state, and does not interfere with markdown selection-to-line mapping.

**Tech Stack:** SolidJS (`packages/markdown-file-renderer`), `@opencode-ai/ui` (`IconButton`, `Tooltip`), Web Clipboard API.

---

### Task 1: Locate/replicate sidebar-style copy action patterns

**Files:**

- Reference: `packages/app/src/pages/layout/sidebar-items.tsx`
- Reference: `packages/ui/src/components/icon-button.tsx`
- Reference: `packages/ui/src/components/tooltip.tsx`

**Step 1: Confirm desired look-and-feel**

- Use `IconButton` with `variant="ghost"`, `size="small"`, rounded button sizing consistent with sidebar actions.
- Wrap in `Tooltip` so the label appears on hover/focus.

**Step 2: Decide copy feedback pattern**

- Preferred: toggle icon `copy -> check` for ~2s.
- Tooltip/aria-label should also reflect copied state.

### Task 2: Add overlay copy button to markdown file renderer

**Files:**

- Modify: `packages/markdown-file-renderer/src/renderer.tsx`
- Modify: `packages/markdown-file-renderer/src/style.css`

**Step 1: Write minimal UI for action button**

- Import `IconButton` + `Tooltip` from `@opencode-ai/ui`.
- Add a container positioned within the renderer wrapper (top-right).

**Step 2: Implement clipboard write and copied state**

- On click: `navigator.clipboard.writeText(props.file.contents)`.
- If clipboard unavailable, no-op (or optionally show console error).
- Track state with `createSignal(false)` and reset after 2s.

**Step 3: Prevent selection handlers from triggering while clicking button**

- In `handleMouseDown`, ignore events whose target is within `[data-slot="markdown-file-copy"]`.

**Step 4: Ensure renderer root still works for comment anchoring**

- Keep existing `data-component="markdown" data-markdown-view="file"` root for CSS scoping.
- The overlay should not modify `innerHTML` behavior.

### Task 3: Add minimal smoke verification

**Files:**

- (Optional) Add: `packages/markdown-file-renderer/src/renderer.test.tsx` (only if test harness exists)

**Step 1: Manual test (local dev)**

Run:

```bash
./script/dev-web-isolated.sh
```

Steps:

1. Open a `.md` file in the file viewer.
2. Hover the markdown view; confirm a copy icon appears top-right.
3. Click; confirm clipboard contains raw markdown source (paste into a plain text field).
4. Drag-select text to create an inline comment; ensure selection-to-line mapping still works.

**Step 2: Build/test (best-effort)**

Run from `packages/app` (if available):

```bash
bun test
```

Expected: No failures related to markdown renderer.
