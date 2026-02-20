# OpenCode Devshell Docker Image Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Debian-based Docker image (Node 24 + Bun 1.3.9) that ships this fork of OpenCode, includes the locally-built web UI, and defaults to an interactive shell.

**Architecture:** Single Dockerfile with a build step that installs dependencies, builds the UI (`packages/app`), compiles the OpenCode CLI into a native binary (`packages/opencode`), then assembles a devshell-style runtime image that still includes Node+Bun, the repo source, and `node_modules`.

**Tech Stack:** Docker, Debian (bookworm-slim), Node.js 24 image, Bun 1.3.9, Bun workspaces.

---

### Task 1: Add Docker build + runtime image

**Files:**

- Create: `docker/Dockerfile`
- Create: `docker/opencode-web`

**Step 1: Create the Dockerfile skeleton**

Create `docker/Dockerfile`:

- Base: `node:24-bookworm-slim`
- Install OS deps for a dev shell: `build-essential`, `python3`, `pkg-config`, `git`, `openssh-client`, `ca-certificates`, `curl`, `jq`, `unzip`, `xz-utils`, `zip`, `ripgrep`, `bash`.
- Install Bun pinned to `1.3.9` and ensure `bun`, `node`, `npm` work.
- Create non-root user `opencode` and directories: `/data/opencode`, `/opt/opencode/ui`, `/home/opencode/opencode`.
- Set `XDG_*` env vars to point under `/data/opencode/...`.
- Default `WORKDIR` to `/home/opencode`.
- `EXPOSE 4096`.
- Default `CMD` to a shell.

**Step 2: Copy repo + install deps**

In `docker/Dockerfile`:

- Copy the repo source into `/home/opencode/opencode`.
- Run `bun install` at repo root to install all workspace deps.

**Step 3: Build the UI and stage it**

In `docker/Dockerfile`:

- Run `bun run --cwd packages/app build`.
- Copy `packages/app/dist` to `/opt/opencode/ui`.

**Step 4: Build the OpenCode compiled binary and install it**

In `docker/Dockerfile`:

- Run `bun run --cwd packages/opencode build --single`.
- Copy the resulting binary into `/usr/local/bin/opencode`.

**Step 5: Add convenience launcher script**

Create `docker/opencode-web`:

- A small `sh` script that runs:
  `opencode web --hostname 0.0.0.0 --port 4096 --ui-dir /opt/opencode/ui` plus any passed args.
- Install it into `/usr/local/bin/opencode-web`.

**Step 6: Smoke-check during build**

In `docker/Dockerfile`:

- Run `opencode --version`.
- Run `opencode web --help`.

**Step 7: Ensure permissions**

In `docker/Dockerfile`:

- Ensure `/data/opencode` and `/home/opencode` are owned by `opencode:opencode`.
- Switch to `USER opencode` at the end.

### Task 2: Add build context ignore rules

**Files:**

- Create/Modify: `.dockerignore`

**Step 1: Add a root `.dockerignore`**

Add patterns to avoid sending huge/irrelevant files to the Docker daemon. At minimum ignore:

- `.git/`
- `**/dist/`
- `**/.opencode-dev/`
- local caches and logs
- host `node_modules/` (container should install its own)

### Task 3: Local verification commands

**Step 1: Build the image**

Run (from repo root):

```bash
docker build -f docker/Dockerfile -t opencode:devshell .
```

Expected: build succeeds; smoke-check steps run inside Docker build.

**Step 2: Run version check**

```bash
docker run --rm opencode:devshell opencode --version
```

Expected: prints the OpenCode version.

**Step 3: Start a dev shell**

```bash
docker run -it --rm \
  -p 4096:4096 \
  -v opencode:/data/opencode \
  opencode:devshell
```

Expected: drops into a shell.

**Step 4: Start the web server from inside the shell**

```bash
opencode-web
```

Expected: server listens on `0.0.0.0:4096` and serves UI assets from `/opt/opencode/ui`.

---

## Notes / Non-goals

- Multi-arch images are out of scope (amd64-only).
- The image is intentionally a “devshell”: it includes source and `node_modules` for convenience even though this increases image size.
- Authentication is optional; users can set `OPENCODE_SERVER_PASSWORD` at runtime.
