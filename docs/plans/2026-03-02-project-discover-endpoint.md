# Project Git Discovery Endpoint Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the web UI's N+1 `.git` probing with a single server endpoint that lists top-level git-initialized project folders.

**Architecture:** Add `GET /project/discover` on the server to scan only immediate children of `Instance.directory` and return those with a `.git` entry (directory or file). Update the new open-project dialog to call this endpoint and render the returned list.

**Tech Stack:** Hono + hono-openapi (server routes), Bun test, SolidJS (web app), generated OpenAPI + JS SDK.

---

### Task 1: Add failing server test (RED)

**Files:**

- Create: `packages/opencode/test/server/project-discover.test.ts`

**Step 1: Write the failing test**

```ts
import { afterAll, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Log } from "../../src/util/log"
import { Instance } from "../../src/project/instance"
import { Server } from "../../src/server/server"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

afterAll(async () => {
  await Instance.disposeAll()
})

describe("GET /project/discover", () => {
  test("returns only top-level directories with .git (dir or file)", async () => {
    await using tmp = await tmpdir()

    const gitDir = path.join(tmp.path, "repo-dir")
    await fs.mkdir(path.join(gitDir, ".git"), { recursive: true })

    const gitFile = path.join(tmp.path, "repo-file")
    await fs.mkdir(gitFile, { recursive: true })
    await fs.writeFile(path.join(gitFile, ".git"), "gitdir: /tmp/fake\n")

    const nested = path.join(tmp.path, "outer", "inner")
    await fs.mkdir(path.join(nested, ".git"), { recursive: true })

    await Instance.provide({ directory: tmp.path, init: async () => {}, fn: async () => {} })

    const app = Server.App()
    const response = await app.request("/project/discover", {
      method: "GET",
      headers: {
        "x-opencode-directory": tmp.path,
      },
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.map((p: any) => p.name).toSorted()).toEqual(["repo-dir", "repo-file"])
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bun test test/server/project-discover.test.ts`

Expected: FAIL (endpoint missing / 404 or schema mismatch).

---

### Task 2: Implement `GET /project/discover` (GREEN)

**Files:**

- Modify: `packages/opencode/src/server/routes/project.ts`

**Step 1: Add new route**

- Route: `GET /project/discover`
- Behavior:
  - `readdir(Instance.directory, { withFileTypes: true })`
  - only immediate child directories
  - include only those where `<child>/.git` exists (directory or file)
  - return `{ name, path, updatedAt }[]` sorted by `updatedAt` desc

**Step 2: Run test to verify it passes**

Run: `bun test test/server/project-discover.test.ts`

Expected: PASS.

---

### Task 3: Wire the web UI to the new endpoint

**Files:**

- Modify: `packages/app/src/components/dialog-open-project.tsx`

**Step 1: Replace N+1 `.git` probing**

- Replace the per-folder `.git` checks with one call to the generated SDK method for `project.discover`.
- Keep the UI sorting and existing empty/error states.

**Step 2: Typecheck**

Run: `bun run typecheck` (in `packages/app`).

---

### Task 4: Regenerate SDK/OpenAPI

**Files:**

- Auto-generated: `packages/sdk/openapi.json`, `packages/sdk/js/src/v2/gen/*`

**Steps:**

Run: `bun ./script/generate.ts`

Expected: generated types include a `project.discover` method.

---

### Task 5: Verification

Run:

- `bun run typecheck` in `packages/opencode`
- `bun run typecheck` in `packages/app`
