# Frontend File Renderers (Developer Guide)

This document explains how OpenCode's web UI renders files in the session file viewer, and how to add new renderers (Markdown, PDFs, diagrams, etc.) while preserving the inline comment workflow.

## Goal

- Let the file viewer choose a renderer based on file metadata (path/mime)
- Keep the existing comment model (`SelectedLineRange`) and UI (persistent inline bubbles)
- Allow renderer implementations to live in separate workspace packages ("frontend plugins")

## Concepts

### Renderer

A renderer is a Solid component plus a matcher:

- `match(meta)` decides whether the renderer can handle the file.
- `component(props)` renders the file.

Renderers are registered with `FileRendererProvider`.

### Comment Anchoring

OpenCode stores comments as a line range:

```ts
type SelectedLineRange = { start: number; end: number }
```

To display persistent comment bubbles, the file viewer needs to map a stored range to an on-screen anchor element.

There are two supported mechanisms:

1. `surfaceRef` (preferred)

- A renderer can provide a `CommentSurface`:

```ts
type CommentSurface = {
  anchor(range: SelectedLineRange): HTMLElement | undefined
}
```

2. DOM anchors (fallback)

- Renderers may emit elements with `data-line-anchor="<line>"`.
- The host will position bubbles at the closest anchor for `max(start, end)`.

## Contract

### FileRendererProvider

Defined in `packages/ui/src/context/file-renderer.tsx`.

Key types (simplified):

```ts
type FileMeta = { path: string; mimeType?: string }

type FileRenderProps = {
  meta: FileMeta
  file: { name: string; contents: string; cacheKey?: string }

  enableLineSelection?: boolean
  selectedLines?: SelectedLineRange | null
  commentedLines?: SelectedLineRange[]
  onLineSelected?: (range: SelectedLineRange | null) => void
  onLineSelectionEnd?: (range: SelectedLineRange | null) => void

  onRendered?: () => void
  surfaceRef?: (surface: CommentSurface | null) => void
}

type FileRenderer = {
  id: string
  match(meta: FileMeta): boolean
  component: Component<FileRenderProps>
}
```

Resolution rule:

- The first `match(meta) === true` wins.
- A default "code" renderer matches everything and is appended automatically.

### Required behaviors for comment support

If your renderer wants to support persistent inline comments, it must:

- Emit stable anchors for ranges (either via `surfaceRef` or `data-line-anchor`).
- Emit line selection events (`onLineSelected` and `onLineSelectionEnd`).

If your renderer does not support comments, it may omit selection handling; the file viewer will still render the file but commenting UX will not work.

## Example: Markdown Renderer (innerHTML)

See: `packages/markdown-file-renderer/src/renderer.tsx`

Highlights:

- Parses markdown to HTML (Unified remark/rehype) and sanitizes.
- Annotates block-level elements with:
  - `data-sourcepos` for mapping DOM selection back to source lines
  - `data-line-anchor` for positioning
- Implements selection by reading `window.getSelection()` and converting to a line range.
- Provides a `surfaceRef` implementation that indexes anchors for faster lookups.

Styling:

- Ship renderer-scoped CSS in the plugin package and scope by attribute on the root.
- Example in the markdown renderer:
  - root has `data-markdown-view="file"`
  - styles live in `packages/markdown-file-renderer/src/style.css`

## How the file viewer consumes renderers

The file viewer is `packages/app/src/pages/session/file-tabs.tsx`.

It:

- resolves a renderer with `useFileRenderer().resolve({ path, mimeType })`
- renders it with `<Dynamic component={...} ... />`
- positions comment bubbles using (in order):
  1. `surface.anchor(range)`
  2. legacy code-viewer shadow DOM markers
  3. `[data-line-anchor]` in light DOM

## Local dev

For local UI/plugin changes, do not use `opencode web` (it proxies the hosted app).

Use the helper script:

- `script/dev-web-isolated.sh`

It runs backend + Vite UI with separate XDG dirs and configurable public/bind hosts.
