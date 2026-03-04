# Configurable Web UI Proxy Upstream Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow `opencode web` (and other server modes) to proxy UI assets from a configurable upstream (instead of the hard-coded `https://app.opencode.ai`), and refresh deployment docs with multiple UI hosting options.

**Architecture:** The opencode HTTP server already has a UI catch-all route in `packages/opencode/src/server/server.ts` that either serves local static assets from `--ui-dir` or proxies requests to `https://app.opencode.ai`. This change adds a configurable `uiUrl` (CLI + config) that overrides the proxy upstream and updates docs by renaming `docs/local-stack.md` to `docs/deployment-guide.md` with production-ready hosting patterns.

**Tech Stack:** Bun, Hono (`hono/proxy`, `hono/cors`), yargs CLI, zod config schema, Bun test runner (`bun:test`).

---

### Task 1: Write failing tests for configurable UI upstream

**Files:**

- Create: `packages/opencode/test/server/ui-proxy-upstream.test.ts`
- Modify (likely): `packages/opencode/src/server/server.ts` (to make UI proxy config testable without a real external request)

**Step 1: Write the failing test**

Create `packages/opencode/test/server/ui-proxy-upstream.test.ts` that:

- Patches `globalThis.fetch` to capture the requested URL + `Host` header and return a dummy `Response`.
- Calls the server’s Hono app handler for a non-API route (example: `GET /`) so it hits the UI catch-all.
- Asserts:
  - default behavior proxies to `https://app.opencode.ai/` (or whatever default remains)
  - when configured with a custom upstream (e.g. `https://ui.example.com`), it proxies to `https://ui.example.com/`
  - when configured with an upstream that includes a port (e.g. `https://ui.example.com:8443`), `Host` header matches `ui.example.com:8443`
  - when `uiDir` is set, the proxy is not invoked (fetch not called)

Skeleton (illustrative, adjust to match final API):

```ts
import { describe, expect, test } from "bun:test"
import { Server } from "../../src/server/server"

describe("web UI proxy upstream", () => {
  test("defaults to app.opencode.ai", async () => {
    const orig = globalThis.fetch
    let called: { url: string; host?: string } | undefined
    globalThis.fetch = async (input, init) => {
      called = {
        url: typeof input === "string" ? input : input.url,
        host: (init?.headers as any)?.host ?? (init?.headers as any)?.Host,
      }
      return new Response("ok", { status: 200 })
    }
    try {
      // Ensure default config
      // (Plan: add Server.configureUI({ uiUrl: undefined, uiDir: undefined }))
      const app = Server.App()
      const res = await app.request("/")
      expect(res.status).toBe(200)
      expect(called?.url).toBe("https://app.opencode.ai/")
      expect(called?.host).toBe("app.opencode.ai")
    } finally {
      globalThis.fetch = orig
    }
  })
})
```

**Step 2: Run the test to verify it fails**

Run (from package dir): `bun test test/server/ui-proxy-upstream.test.ts`

Expected: FAIL because there is no way to configure UI upstream yet (and/or assertions don’t match).

**Step 3: Commit (optional but recommended)**

`git add packages/opencode/test/server/ui-proxy-upstream.test.ts && git commit -m "test: cover configurable web UI proxy upstream"`

---

### Task 2: Add configurable UI proxy upstream plumbing in the server

**Files:**

- Modify: `packages/opencode/src/server/server.ts`

**Step 1: Implement minimal configuration state**

In `packages/opencode/src/server/server.ts`:

- Add a module-level `_uiUrl: string | undefined` (similar to `_uiDir`).
- In the UI catch-all (`.all("/*", ...)`), compute the upstream base URL:
  - if `_uiUrl` is set: use that
  - else: use the existing default (`https://app.opencode.ai`)
- When calling `proxy(upstream + reqPath, ...)`, set the upstream `host` header to `new URL(upstream).host` (include port if present).
- Keep applying CSP to the returned response.

**Step 2: Make it testable**

To avoid tests needing a real Bun server listener:

- Add an exported config setter that only mutates the in-module values used by `Server.App()`.
  - Example: `Server.configureUI({ uiDir, uiUrl })` (name bikeshed).
  - The tests call this setter and reset it in `finally`.

Avoid expanding scope: do not refactor the whole server; keep changes localized to UI proxy path.

**Step 3: Re-run tests**

Run: `bun test test/server/ui-proxy-upstream.test.ts`

Expected: PASS.

**Step 4: Commit**

`git add packages/opencode/src/server/server.ts && git commit -m "feat: allow configuring web UI proxy upstream"`

---

### Task 3: Expose configuration via CLI (`opencode web --ui-url`)

**Files:**

- Modify: `packages/opencode/src/cli/cmd/web.ts`
- Modify: `packages/opencode/src/server/server.ts` (extend `Server.listen` opts type)

**Step 1: Add CLI option**

In `packages/opencode/src/cli/cmd/web.ts`, add a yargs option:

- Flag name: `--ui-url`
- Description: “proxy web UI assets from an alternate upstream (instead of app.opencode.ai)”

Parse it similarly to `ui-dir` and pass it to `Server.listen({ ...opts, uiDir, uiUrl })`.

**Step 2: Wire into server**

In `packages/opencode/src/server/server.ts`, extend the `listen(opts)` signature to accept `uiUrl?: string` and store it (alongside `_uiDir`).

**Step 3: Add/extend tests**

Update `packages/opencode/test/server/ui-proxy-upstream.test.ts` to verify that calling the setter OR calling a helper used by `listen` produces identical behavior.

**Step 4: Commit**

`git add packages/opencode/src/cli/cmd/web.ts packages/opencode/src/server/server.ts packages/opencode/test/server/ui-proxy-upstream.test.ts && git commit -m "feat: add --ui-url for web UI proxy upstream"`

---

### Task 4: Expose configuration via `opencode.json` (production-friendly)

**Files:**

- Modify: `packages/opencode/src/config/config.ts`
- Modify: `packages/opencode/src/cli/cmd/web.ts`

**Step 1: Extend config schema**

In `packages/opencode/src/config/config.ts`, extend `Config.Server` schema to include:

- `uiUrl: z.string().optional().describe("Proxy web UI assets from this upstream URL")`

Keep it under `server` so it’s available from managed config locations (e.g. `/etc/opencode/opencode.json`).

**Step 2: Read config when CLI flag not provided**

In `packages/opencode/src/cli/cmd/web.ts`:

- Fetch config once (using the existing config loading flow) and apply precedence:
  - if `--ui-url` is present in `process.argv`: use CLI value
  - else if `config.server.uiUrl` is set: use it
  - else: undefined (fall back to `https://app.opencode.ai`)

Rationale: production deployments often prefer config over long command lines.

**Step 3: Tests**

Add a small unit test in `packages/opencode/test/config/config.test.ts` (or a new focused test) ensuring `server.uiUrl` is accepted by the schema and shows up in `Config.get()`.

**Step 4: Commit**

`git add packages/opencode/src/config/config.ts packages/opencode/src/cli/cmd/web.ts packages/opencode/test && git commit -m "feat: support server.uiUrl config for web UI proxy upstream"`

---

### Task 5: Rename and rewrite deployment docs

**Files:**

- Delete: `docs/local-stack.md`
- Create: `docs/deployment-guide.md`
- Modify (optional): `docker/README.md` (to reference the new guide)

**Step 1: Create `docs/deployment-guide.md`**

Content should cover (keep it production-focused, but include dev):

- What runs where:
  - backend API server: `packages/opencode`
  - web UI app: `packages/app`
- UI hosting options (with trade-offs):
  1. Default UI proxy (opencode server proxies upstream UI)
     - default upstream: `https://app.opencode.ai`
     - customize via `--ui-url` and/or `server.uiUrl`
  2. Local UI assets served by opencode (`--ui-dir ./packages/app/dist`)
  3. Separate UI dev server (Vite) + backend server with `--cors` (for local iteration)
- Production deployment recipes:
  - “single process” opencode + local UI assets (recommended for self-host)
  - opencode behind reverse proxy (nginx/Caddy/Traefik): TLS termination + basic auth via `OPENCODE_SERVER_PASSWORD`
  - hardened defaults: bind host, password, CORS notes, and why `NO_PROXY` matters in corp networks

Include concrete commands (copy/paste), including the existing `./script/dev-web-isolated.sh` workflow.

**Step 2: Remove the old doc**

Delete `docs/local-stack.md` and ensure no other docs reference it (currently none).

**Step 3: Commit**

`git add docs/deployment-guide.md && git rm docs/local-stack.md && git commit -m "docs: add deployment guide with UI hosting options"`

---

### Task 6: Manual verification checklist (production scenario)

**Files:**

- None (runbook)

**Step 1: Local smoke**

- Start opencode web pointing to a known-good upstream:
  - `OPENCODE_SERVER_PASSWORD=secret opencode web --hostname 127.0.0.1 --port 4096 --ui-url https://<your-ui-host>`
- Open `http://localhost:4096` and verify:
  - UI loads (index + assets)
  - API calls succeed (sessions list loads)
  - SSE stays connected (no rapid disconnect)

**Step 2: Reverse proxy smoke**

- Put nginx/Caddy in front, terminate TLS, forward to `http://127.0.0.1:4096`.
- Verify basic auth prompt (from opencode) works end-to-end.

**Step 3: Regression sanity**

- Run without `--ui-url` and verify it still loads via the default upstream.
- Run with `--ui-dir` and verify no upstream fetch occurs.

---

### Test Commands (do not run from repo root)

- `cd packages/opencode && bun test`
