# Task 2 UI URL Validation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Harden `Server.configureUI` `uiUrl` validation and adjust tests to preserve field presence semantics.

**Architecture:** Tighten parsing/validation in `Server.configureUI` by using `new URL()` and rejecting unsafe/unsupported URL components (scheme, auth, query, hash, path). Normalize upstream storage to `{ base, host }` where `base` is `url.origin` (no trailing slash). Update test helper to only pass keys that are explicitly provided to preserve “field presence” semantics.

**Tech Stack:** TypeScript, Bun test runner, Node/Bun `URL`.

---

### Task 1: Add a failing negative test for invalid `uiUrl`

**Files:**

- Modify: `packages/opencode/test/server/ui-proxy-upstream.test.ts`
- Test: `packages/opencode/test/server/ui-proxy-upstream.test.ts`

**Step 1: Write the failing test**

```ts
it("rejects invalid uiUrl at configuration time", async () => {
  await expect(configure({ uiUrl: "ftp://example.com" })).rejects.toThrow()
})
```

**Step 2: Run test to verify it fails**

Run: `cd packages/opencode && bun test test/server/ui-proxy-upstream.test.ts`
Expected: FAIL (configuration currently accepts the invalid scheme).

### Task 2: Harden `Server.configureUI` validation and upstream normalization

**Files:**

- Modify: `packages/opencode/src/server/server.ts`
- Test: `packages/opencode/test/server/ui-proxy-upstream.test.ts`

**Step 1: Implement URL validation rules**

Implement these checks after parsing `uiUrl`:

- Allow only `http:` and `https:`
- Reject `url.username` or `url.password`
- Reject `url.search` or `url.hash`
- Reject non-root path (`url.pathname !== "/"`)

**Step 2: Normalize upstream storage**

Store upstream as:

```ts
{ base: url.origin, host: url.host }
```

where `base` has no trailing slash.

**Step 3: Run test to verify it passes**

Run: `cd packages/opencode && bun test test/server/ui-proxy-upstream.test.ts`
Expected: PASS for the negative test added in Task 1.

### Task 3: Fix test helper `configure(...)` to preserve field presence semantics

**Files:**

- Modify: `packages/opencode/test/server/ui-proxy-upstream.test.ts`
- Test: `packages/opencode/test/server/ui-proxy-upstream.test.ts`

**Step 1: Update helper to only include keys that were passed**

For example:

```ts
function configure(input: { uiUrl?: string; host?: string } = {}) {
  const value: Record<string, unknown> = {}
  if ("uiUrl" in input) value.uiUrl = input.uiUrl
  if ("host" in input) value.host = input.host
  return server.configureUI(value as any)
}
```

**Step 2: Run test to verify helper change does not break existing expectations**

Run: `cd packages/opencode && bun test test/server/ui-proxy-upstream.test.ts`
Expected: PASS.

### Task 4: Commit and verify

**Step 1: Run focused test**

Run: `cd packages/opencode && bun test test/server/ui-proxy-upstream.test.ts`
Expected: PASS.

**Step 2: Commit**

Run:

```bash
git add packages/opencode/src/server/server.ts packages/opencode/test/server/ui-proxy-upstream.test.ts
git commit -m "fix(server): harden uiUrl validation and upstream config"
```

**Step 3: Report the commit summary**

Run: `git show --oneline --stat -1`
