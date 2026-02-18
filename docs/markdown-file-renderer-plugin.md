# Markdown File Renderer Plugin (Local Dev)

This fork wires a build-time frontend plugin that renders Markdown files in the file viewer and keeps OpenCode's persistent inline comment bubbles working.

## Where the integration lives

- File renderer extension point: `packages/ui/src/context/file-renderer.tsx`
- Markdown renderer plugin package: `packages/markdown-file-renderer/`
- App registration: `packages/app/src/app.tsx`
- File viewer uses the renderer: `packages/app/src/pages/session/file-tabs.tsx`

## Run the web UI with the plugin

OpenCode's web UI needs the backend and the app dev server running separately.

Note: `opencode web` serves the hosted UI (it proxies `https://app.opencode.ai` from the backend), so it will not pick up local UI/plugin changes.

1. Install dependencies (repo root)

```bash
bun install
```

2. Start backend (API server)

```bash
cd packages/opencode
bun run --conditions=browser ./src/index.ts serve --port 4096
```

3. Start app dev server (web UI)

```bash
cd packages/app
bun dev -- --port 4444
```

4. Open

- `http://localhost:4444`

## Run without interrupting an existing stable server

If you already have a stable `opencode web --port 4096` running, do not reuse 4096.

This repo includes a helper script that starts an isolated backend+UI on different ports and uses separate XDG dirs so local state doesn't collide.

From repo root:

```bash
./script/dev-web-isolated.sh
```

Defaults:

- backend: `127.0.0.1:5096`
- UI: `127.0.0.1:5444`
- XDG dirs: `./.opencode-dev/*` (isolated local storage)

Override ports:

```bash
OPENCODE_DEV_SERVER_PORT=6096 OPENCODE_DEV_UI_PORT=6444 ./script/dev-web-isolated.sh
```

Override XDG root:

```bash
OPENCODE_DEV_XDG_ROOT="$HOME/opencode-dev-xdg" ./script/dev-web-isolated.sh
```

## Quick manual test

1. Open a `.md` file in the file viewer.
2. Confirm it renders as Markdown (not code).
3. Drag-select some text.
4. Add a comment via the inline comment editor.
5. Switch away and back (or reload) and confirm:
   - the comment bubble persists
   - bubble position is stable.

## Notes

- Markdown selection-to-lines mapping is based on AST source positions (via `data-sourcepos` emitted by the plugin), not by counting newlines in rendered DOM text.
- Raw HTML in markdown is not enabled in the plugin pipeline.
