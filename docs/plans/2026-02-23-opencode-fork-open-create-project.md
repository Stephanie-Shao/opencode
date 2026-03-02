# OpenCode Fork Changes: Open/Create Project

Goal: Modify the OpenCode web UI command "Open project" to "Open/Create Project" such that:

- The dialog accepts a user-entered path even if it does not already exist in the directory suggestions.
- If the path does not exist, the backend creates it (mkdir -p semantics) and then opens the project.

This document is meant to stay in the OpenCode fork repo.

---

## Current State (code pointers)

UI:

- The directory picker dialog is `packages/app/src/components/dialog-select-directory.tsx`.
- The command is wired in `packages/app/src/pages/layout.tsx` (`chooseProject` -> `DialogSelectDirectory`).
- The label is localized under `command.project.open` (see `packages/app/src/i18n/en.ts`).

Backend:

- File routes are in `packages/opencode/src/server/routes/file.ts`.

---

## UI Changes

1. Rename the command label

- Change `command.project.open` string from "Open project" to "Open/Create project".
- Minimal locale updates:
  - Update English and Simplified Chinese at least (`en.ts`, `zh.ts`).
  - Strongly recommended: also update Traditional Chinese (`zht.ts`) since it is already shipped.
  - Other locales can remain unchanged in the first pass.

Files:

- Modify: `packages/app/src/i18n/en.ts`
- Modify: `packages/app/src/i18n/zh.ts`
- Optionally modify: `packages/app/src/i18n/zht.ts` (recommended)

2. Allow freeform paths in the directory dialog

Today, `DialogSelectDirectory` only resolves a selection from the list results.
To support create-on-open, the dialog should be able to accept the current input value.

Proposed UX behavior:

- If the filter input is non-empty, show a top row like "Use path: <value>".
- Pressing Enter selects that path.
- If the path exists, behavior matches current open.
- If the path is missing, the UI calls the backend to create it, then opens it.

Files:

- Modify: `packages/app/src/components/dialog-select-directory.tsx`
- Modify: `packages/app/src/pages/layout.tsx` (to pass a title like "Open/Create project" if desired)

---

## Backend Changes

Add a directory-create API with mkdirp semantics.

Suggested route:

- `POST /file/directory`
  - body: `{ path: string }`
  - behavior:
    - if path exists and is a directory: OK
    - if path does not exist: create recursively
    - if path exists and is a file: error

Files:

- Modify: `packages/opencode/src/server/routes/file.ts`

Implementation notes:

- Prefer using existing filesystem utilities in `packages/opencode/src/util/filesystem` if available.
- Avoid shelling out; use Bun/Node fs APIs.
- Return the normalized absolute path.

Security / safety:

- For single-tenant Daytona sandboxes, risk is lower but still consider restricting creation to a safe root (e.g. workspace directory) to prevent surprising writes.

SDK:

- If this route becomes part of OpenAPI, regenerate the JS SDK per repo instructions: `./packages/sdk/js/script/build.ts`.

---

## Suggested Tests

UI E2E (Playwright):

- Add a test that opens the project dialog, enters a new directory path, confirms the directory is created, and project opens.

Files:

- Add/Modify: `packages/app/e2e/**`

Backend:

- Add a route-level test (if existing test harness exists) that calls the mkdir endpoint and verifies filesystem state.
