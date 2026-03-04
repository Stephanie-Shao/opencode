# OpenCode Session Management Deep-Dive Doc Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Write an internal engineering doc that explains OpenCode's session management and multi-client routing model (REST + SSE + PTY WebSocket) with code references and sequence diagrams.

**Architecture:** Produce an architecture-first markdown doc in `docs/` anchored to the current `dev` branch code. Use static code reading only; explain the component graph (Instance, Bus, SSE transports, DB persistence, client reconciliation, PTY WebSocket) and then provide sequence diagrams for key flows.

**Tech Stack:** Bun, Hono (HTTP + SSE + WebSocket upgrade), Zod (schemas), Drizzle/SQLite (persistence), SolidJS store (web client), Node EventEmitter (GlobalBus).

---

### Task 1: Collect code anchors and confirm scope

**Files:**

- Read: `docs/event-mechanism.md`
- Read: `packages/opencode/src/bus/index.ts`
- Read: `packages/opencode/src/bus/bus-event.ts`
- Read: `packages/opencode/src/server/server.ts`
- Read: `packages/opencode/src/server/routes/global.ts`
- Read: `packages/opencode/src/session/session.sql.ts`
- Read: `packages/opencode/src/session/index.ts`
- Read: `packages/opencode/src/server/routes/session.ts`
- Read: `packages/opencode/src/pty/index.ts`
- Read: `packages/opencode/src/server/routes/pty.ts`
- Read: `packages/app/src/context/global-sync/bootstrap.ts`
- Read: `packages/app/src/context/global-sync/event-reducer.ts`

**Step 1: Identify “public contract” vs “internal details” sections**

- Note the stable API surface: OpenAPI (`/doc`), SDK types (generated `Event` union), REST endpoints used by clients.
- Note internal mechanisms: `Instance.state`, `Bus.publish/subscribe`, `GlobalBus.emit`, DB write sites that publish events.

**Step 2: Define the doc scope explicitly**

- In scope: sessions/messages/parts/events + PTY channel + multi-client behavior.
- Out of scope: permissions/questions/todos/compaction/revert/share (unless needed for core flow clarity).

---

### Task 2: Write the doc skeleton (architecture-first)

**Files:**

- Create: `docs/session-management.md`

**Step 1: Create headings**

- Overview + terminology
- Component model (Instance, Bus, GlobalBus, DB, transports)
- Event transport contracts (`/event`, `/global/event`, heartbeats)
- Persistence model (session/message/part tables + event emission sites)
- Client sync model (bootstrap + event reducer)
- PTY WebSocket channel
- Ordering/consistency and failure modes
- Gateway patterns (WS/gRPC on top of REST+SSE)

---

### Task 3: Add sequence diagrams for the critical flows

**Files:**

- Modify: `docs/session-management.md`

**Step 1: Session create/list + fanout**

- `POST /session` -> DB insert -> `session.created` / `session.updated` -> SSE -> client store update.

**Step 2: Prompt sync**

- `POST /session/:id/message` -> `SessionPrompt.prompt` -> DB writes -> `message.updated` / `message.part.updated` / `session.status` -> SSE to multiple clients.

**Step 3: Prompt async**

- `POST /session/:id/prompt_async` returns 204 immediately -> background prompt -> events arrive via SSE.

**Step 4: PTY connect**

- `GET /pty/:ptyID/connect` WS upgrade -> replay buffer -> raw bytes flow + `pty.*` SSE metadata.

---

### Task 4: Ordering, consistency, multi-client semantics

**Files:**

- Modify: `docs/session-management.md`

**Step 1: Document practical guarantees**

- Single-threaded runtime expectations; absence of explicit sequence numbers.
- “Refresh on `server.connected` / disposal” as a recovery strategy.

**Step 2: Document failure modes**

- SSE disconnects, missed events, proxy buffering; explain heartbeat.

---

### Task 5: Add a gateway appendix (WS/gRPC)

**Files:**

- Modify: `docs/session-management.md`

**Step 1: Map REST + SSE to WS**

- Translate SSE events to WS broadcast; optional ring buffer for resume.

**Step 2: Map REST + SSE to gRPC**

- Unary RPCs call REST endpoints; server-streaming RPC consumes SSE.
