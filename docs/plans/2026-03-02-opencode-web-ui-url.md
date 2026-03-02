# opencode web --ui-url Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `--ui-url` flag to `opencode web` and wire it through `Server.listen` to `Server.configureUI` while preserving key-presence semantics.

**Architecture:** The CLI passes `uiUrl` to `Server.listen` only when the flag is present. `Server.listen` detects key presence (not truthiness) and forwards `{ uiUrl }` to `Server.configureUI`, preserving the existing `uiDir` behavior.

**Tech Stack:** Bun, TypeScript, yargs, internal `Server`.

---

### Task 1: Add `--ui-url` to `opencode web` CLI

**Files:**

- Modify: `packages/opencode/src/cli/cmd/web.ts`

**Step 1: Add a yargs option**

- Add `ui-url` as a `string` option with a clear description.

**Step 2: Preserve key-presence semantics when calling `Server.listen`**

- Only include `uiUrl` in the `listen` options object when the user actually provided `--ui-url`.
- Treat an explicitly provided `--ui-url` with an empty/undefined value as a request to clear.

### Task 2: Wire `uiUrl` through `Server.listen` to `Server.configureUI`

**Files:**

- Modify: `packages/opencode/src/server/server.ts`

**Step 1: Extend `Server.listen` option type**

- Add `uiUrl?: string`.

**Step 2: Forward only when key is present**

- If the caller provided the `uiUrl` key, call `Server.configureUI({ uiUrl: opts.uiUrl })`.
- Keep existing `uiDir` behavior intact.

### Task 3: Verify

**Step 1: Run targeted tests**
Run: `cd packages/opencode && bun test test/server/ui-proxy-upstream.test.ts`
Expected: PASS.

### Task 4: Commit

**Step 1: Create commit**

- Stage only the relevant changes and commit.

**Step 2: Show commit**
Run: `git show --oneline --stat -1`
