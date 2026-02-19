# Markdown File Renderer + Persistent Inline Comments (Plugin-Friendly) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan.

**Goal:** Render `.md` files as formatted Markdown in the web UI _without_ losing the existing persistent inline comment workflow (comments are stored, re-shown on reopen/reload, and can be sent to prompt context), while keeping core OpenCode changes minimal and pushing customization into a build-time frontend plugin.

**Architecture:** Introduce a small, additive “file renderer” extension point in the frontend (`@opencode-ai/ui` + `@opencode-ai/app`) so the file viewer can choose a renderer by path/mime. Provide a Markdown renderer as an external package that plugs into this extension point and preserves the existing comment model by mapping UI interactions to `SelectedLineRange`.

**Tech Stack:** SolidJS (`packages/app`, `packages/ui`), existing comment model (`packages/app/src/context/comments.tsx`), existing file viewer (`packages/app/src/pages/session/file-tabs.tsx`), Markdown parsing (plugin-owned; Unified/remark/rehype to preserve source positions), sanitization (DOMPurify).

---

## Background / Current State

### What renders today

- File viewer: `packages/app/src/pages/session/file-tabs.tsx`
  - Text files are rendered via `useCodeComponent()` (default `@opencode-ai/ui/code`).
  - Images/SVG/binary have special cases; everything else goes through the code viewer.
  - Inline comments are implemented here, stored via `packages/app/src/context/comments.tsx`, and sent to prompt context via `packages/app/src/context/prompt`.

### Why Markdown looks like code

- The app never chooses `@opencode-ai/ui/markdown` for file content; it always chooses code.

### How inline comments work today

- The selection model is line-based: `SelectedLineRange` (`{ start: number, end: number }`).
- The code viewer (`@opencode-ai/ui/code`) supports `enableLineSelection` and emits:
  - `onLineSelected(range | null)`
  - `onLineSelectionEnd(range | null)`
- Comment bubbles are positioned by locating a DOM marker for a line:
  - `file-tabs.tsx` reaches into the `diffs-container` shadow root and queries `[data-line="N"]`.
  - This is tightly coupled to the `@pierre/diffs` implementation.

### Existing Markdown infrastructure (not used for file viewer)

- `packages/ui/src/components/markdown.tsx` renders sanitized HTML from a parser in `packages/ui/src/context/marked.tsx`.

## Requirements

1. `.md` files render as real Markdown in the file viewer tab.
2. Persistent inline comment workflow remains:

- user selects a range in the file view
- adds a comment
- comment is stored and re-shown when the file is revisited (and after reload)
- comment can be added to prompt context as a file selection

3. Minimal changes to upstream OpenCode core; changes should be additive and forward-compatible.
4. Markdown behavior is owned by a build-time plugin package (import + register); OpenCode does not need a runtime plugin loader for the UI.
5. Markdown selection UX should feel like the current file comment flow:
   - user selects content in the viewer
   - the existing OpenCode comment editor UI is used
   - the stored selection remains line-based (`SelectedLineRange`).

## Non-Goals

- Runtime-loading UI plugins from `opencode.json` / `.opencode/plugins`.
- A perfect WYSIWYG "comment on rendered text range" model across all Markdown edge cases.
- Replacing existing code viewer/diff viewer.
- Supporting unsanitized raw HTML in markdown.

## Proposed Design

### 1) Add a small file-renderer extension point

Add a new UI-level context in `@opencode-ai/ui`:

- `FileRendererProvider`
- `useFileRenderer()` returns a resolver that chooses a renderer based on file metadata

Core types (conceptual):

```ts
export type FileMeta = {
  path: string
  mimeType?: string
}

export type FileRenderProps = {
  meta: FileMeta
  content: string
  cacheKey?: string
  class?: string
  classList?: Record<string, boolean>

  // selection / comments (same model as code viewer)
  enableLineSelection?: boolean
  selectedLines?: SelectedLineRange | null
  commentedLines?: SelectedLineRange[]
  onLineSelected?: (range: SelectedLineRange | null) => void
  onLineSelectionEnd?: (range: SelectedLineRange | null) => void

  // optional lifecycle
  onRendered?: () => void
}

export type FileRenderer = {
  id: string
  match(meta: FileMeta): boolean
  component: ValidComponent<FileRenderProps>
}
```

Provider API:

- Accept a list of `FileRenderer` entries.
- Resolve the first matching renderer (later entries win or first wins; pick and document one).
- Ship a default “code renderer” that adapts the existing `@opencode-ai/ui/code` component to `FileRenderProps`.

Why this is minimal/forward-compatible:

- Additive context; existing code paths can keep using `useCodeComponent()` until migrated.
- No backend changes.
- No change to persisted comment data shape.

### 2) Add a minimal "comment surface" interface (persistent bubble anchoring)

Persistent inline bubbles require that the app can, at any time, map a stored `SelectedLineRange` to an on-screen anchor element for positioning.

Today the app does this by reaching into `diffs-container` shadow DOM and querying `[data-line="N"]`. That works for code, but it prevents a markdown renderer from participating.

Add an optional interface that a renderer can implement by DOM convention and/or callbacks.

Recommended minimal contract (DOM convention, renderer-owned):

- A renderer that supports persistent inline comments MUST expose stable line anchors in light DOM:
  - Elements with `data-line-anchor="<lineNumber>"`.

Optional stronger contract (callback, renderer-owned):

```ts
export type CommentSurface = {
  anchor(range: SelectedLineRange): HTMLElement | undefined
}

export type FileRenderProps = {
  // ...existing props
  surfaceRef?: (surface: CommentSurface | null) => void
}
```

If present, `file-tabs.tsx` uses `surface.anchor(range)` instead of DOM querying.

Why offer both:

- DOM convention keeps the core interface tiny and avoids forcing all renderers to share types.
- `surfaceRef` lets renderers provide efficient anchor lookup (no repeated DOM scans).

### 3) Decouple comment anchoring from `diffs-container` shadowRoot

Today `file-tabs.tsx` assumes the rendered surface is a `diffs-container` (shadow DOM) and that line markers exist as `[data-line]`.

We need an abstraction so _any renderer_ (code, markdown, future PDF, etc.) can support comments.

Add an optional contract to `FileRenderProps` via DOM conventions:

- Renderers that support inline comments MUST place visible/hidden anchor elements in light DOM with:
  - `data-line-anchor="<line>"`

Then `file-tabs.tsx` positions comment bubbles by searching:

1. If a `surfaceRef` callback is provided and has a live surface, use `surface.anchor(range)`.
2. Else, if `diffs-container` shadowRoot exists, use the current `[data-line]` markers (backward compatible).
3. Else, query `wrap.querySelector([data-line-anchor="N"])`.
4. If no marker exists, fall back to the existing approximate estimate for large files.

This keeps the existing code viewer behavior unchanged while enabling plugin renderers.

### 4) Markdown renderer lives in an external build-time plugin package

Create an external package (in your fork or separately) that depends on `@opencode-ai/ui` and exports a `FileRenderer`:

- `id`: `markdown`
- `match`: `path.endsWith('.md')` or mime checks
- `component`: `MarkdownFileView`

Implementation responsibilities of `MarkdownFileView`:

1. Parse markdown to HTML with a pipeline that preserves source positions
2. Sanitize output (DOMPurify)
3. Render to the DOM
4. Provide stable line anchors (`data-line-anchor`) so persistent comment bubbles can position near the relevant content
5. Implement selection mapping so user interaction yields a `SelectedLineRange`
6. (Optional) Provide `surfaceRef` for efficient anchor lookup

### 5) Selection mapping strategy for Markdown (keep line-based model)

We keep `SelectedLineRange` as the persisted and prompt-context format to avoid broad changes.

For Markdown, we need to translate user interaction in rendered HTML into _source file_ line ranges.

Selected UX (keep current behavior):

- Users make a normal text selection in the rendered markdown (mouse drag / shift-selection).
- On selection end, the renderer converts that DOM selection into a `SelectedLineRange` and calls `onLineSelectionEnd(range)`.
- The host (`file-tabs.tsx`) continues to use the existing persistent inline bubble UI (`LineCommentEditor` / `LineCommentView`) and stores comments the same way as code files.

Recommended approach (plugin-owned):

- Use a Markdown pipeline that preserves source positions on rendered nodes, then annotate output nodes.
  - Example: Unified (`remark-parse` -> `remark-rehype` -> `rehype-stringify`) with:
    - a small rehype plugin that adds `data-sourcepos="startLine:startCol-endLine:endLine:endCol"` to block-level elements
    - and `data-line-anchor="startLine"` for anchoring.
  - Do not enable raw HTML parsing (`rehype-raw`) for `.md` files.
- During interaction (mousedown/mousemove/mouseup):
  - Find the closest ancestor element with `data-sourcepos`.
  - Derive a line number (prefer startLine/endLine depending on intent).
  - Emit `onLineSelected` while dragging and `onLineSelectionEnd` on mouseup.

Notes on mapping:

- Because the persisted format is line-based, we intentionally map to line ranges (not character offsets). This keeps storage and prompt context stable.
- For a DOM selection that spans multiple blocks, compute `start = min(startLine, endLine)` and `end = max(startLine, endLine)`.

Line anchors:

- When rendering, add `data-line-anchor` to block-level elements (e.g. headings, paragraphs, list items, code fences) using the start line from `data-sourcepos`.
- When positioning a comment for a given `{ start, end }`, choose `line = max(start, end)` and find:
  - an anchor with `data-line-anchor` equal to `line`, or
  - the closest previous anchor with `data-line-anchor <= line`.

This yields stable, human-friendly comment placement (“near the paragraph that contains the selected line”).

### 6) App integration (minimal changes)

In the forked `@opencode-ai/app`:

- Wrap the app in `FileRendererProvider` and register:
  - default code renderer
  - markdown plugin renderer
- Update `packages/app/src/pages/session/file-tabs.tsx`:
  - replace direct usage of `useCodeComponent()` with `useFileRenderer()` (or keep `useCodeComponent()` only as the default renderer)
  - render the resolved renderer component for text content
  - adjust comment positioning to support both old shadowRoot markers and the new surface/anchor mechanism

## Porting Baseline From `script_agent_frontend`

The `script_agent_frontend` repo is a useful baseline for the interaction feel (selection-based UI layered above Markdown), but it is not sufficient for persistent inline bubbles as-is.

### What to reuse

- The layering strategy:
  - markdown preview renders content
  - overlay layer handles selection UI and popovers
- The ergonomics:
  - detect selection inside a specific container
  - position UI near `Range.getBoundingClientRect()`
  - prevent mouse events from clearing selection

### What must change for OpenCode-style persistence

1. **Line numbers must correspond to source file lines**
   - `script_agent_frontend` counts `\n` in rendered text nodes (TreeWalker). This does not reliably match source Markdown line numbers.
   - For persistent comments, store `{start,end}` derived from AST source positions.

2. **Renderer must emit stable anchors for stored comments**
   - On reopen/reload, there is no DOM selection. Bubble placement must come from `data-line-anchor` or `surfaceRef`.

3. **Selection mapping must use `data-sourcepos` (or equivalent)**
   - Use a markdown AST pipeline to annotate rendered DOM with source positions.
   - Use those positions to compute `SelectedLineRange`.

### Porting to SolidJS

- Re-implement the selection listener as a Solid component (inside `MarkdownFileView`) that drives `onLineSelected` / `onLineSelectionEnd`.
- Do not re-create a parallel comment editor UI if you want minimal changes: rely on OpenCode's existing `LineCommentEditor` / `LineCommentView` for persistence and prompt integration.

## Data Flow (End-to-End)

1. File content is loaded via `FileProvider` (`packages/app/src/context/file.tsx`).
2. File tab renders:

- image/svg/binary: existing special cases
- text: `renderer = resolve({ path, mimeType })`

3. Renderer component:

- displays content
- emits `onLineSelected` / `onLineSelectionEnd`

4. `file-tabs.tsx`:

- stores the current selection in `FileViewCache` (`file.setSelectedLines`)
- shows `LineCommentEditor` popover
- on submit: stores in `CommentsProvider` and calls `prompt.context.add({ type: 'file', path, selection, comment, ... })`

5. Comment list is rendered and positioned by anchors exposed by the renderer.

## Security Considerations

- Markdown output must be sanitized (DOMPurify) before injecting `innerHTML`.
- External links must include `rel="noopener noreferrer"`.
- If allowing raw HTML in Markdown, ensure sanitization config is strict enough.

## Performance Considerations

- Parsing Markdown on every keystroke is not required (files are static), but switching tabs should be fast.
- Cache by `cacheKey` (existing pattern: `packages/ui/src/components/markdown.tsx` caches up to 200 entries).
- Avoid scanning the entire DOM for anchors repeatedly; build a small index of anchors when rendering completes.

## Testing Strategy

Unit (plugin package):

- Given markdown with headings/paragraphs, ensure `data-sourcepos` or equivalent is present.
- Ensure selection mapping picks correct line numbers for clicks/drag.

Unit (`@opencode-ai/app`):

- `file-tabs` comment positioning:
  - works with code viewer (shadowRoot markers)
  - works with markdown renderer (`data-line-anchor` markers)

E2E (optional but ideal):

- Open a `.md` file
- Select a block / drag-select
- Add a comment
- Verify comment bubble appears and “Add to prompt context” includes the expected file + line range.

## Rollout / Migration

- Land core extension point first (no behavior change):
  - default renderer resolves to existing code component
- Add markdown plugin renderer and register it in the fork
- Iterate on selection heuristics until it feels good

## Open Questions

1. Should `.mdx` be treated as Markdown or code?
2. Should the markdown renderer support fenced code block copy buttons (nice-to-have; can reuse existing UI behavior)?
