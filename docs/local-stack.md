# Local Build + Local Deploy (CLI + Web UI)

This repo contains two different "web" experiences:

1. The OpenCode backend server (API) in `packages/opencode`
2. The OpenCode web UI app in `packages/app`

Today, `opencode web` starts a local backend server and then serves the UI by proxying `https://app.opencode.ai` for non-API routes. That is convenient for end users, but it means **local changes to `packages/app` won't show up** when you use `opencode web`.

To run the entire stack locally (including your modified UI), run the backend and UI separately.

## 1) Build and install the CLI globally

On a clean machine, you can install your forked CLI binary globally like this.

```bash
git clone git@github.com:jermainewang/opencode.git
cd opencode
git checkout dev

bun install

cd packages/opencode
bun run build -- --single

# Install the built binary into PATH (system-wide)
sudo install -m 0755 dist/opencode-*/bin/opencode /usr/local/bin/opencode

opencode --version
```

Notes:

- `bun run build -- --single` builds only the current platform/arch.
- The wrapper script in `packages/opencode/bin/opencode` is intended for npm-style installs with platform-specific packages; for local deploys you can install the binary directly.

## 2) Local dev: backend + Vite dev UI (recommended)

Use the helper script:

```bash
cd /path/to/opencode
bun install

./script/dev-web-isolated.sh
```

This starts:

- Backend API (default): `http://127.0.0.1:5096`
- Web UI (default): `http://localhost:5444`

It also uses an isolated XDG root under `./.opencode-dev/` so local state does not collide with a stable install.

### Remote server / public IP

If you run on a remote machine and access the UI from your laptop, set the public host and bind addresses:

```bash
OPENCODE_DEV_PUBLIC_HOST=52.10.222.139 \
OPENCODE_DEV_SERVER_BIND_HOST=0.0.0.0 \
OPENCODE_DEV_UI_BIND_HOST=0.0.0.0 \
./script/dev-web-isolated.sh
```

Make sure your security group allows inbound traffic to the chosen UI/API ports.

## 3) Local deploy: backend + built static UI (production-like)

If you want to deploy without Vite running, you can build the UI and host it with any static server.

### Step A: Start the backend

```bash
opencode serve --hostname 0.0.0.0 --port 4096 --cors http://localhost:8080
```

### Step B: Build the UI

```bash
cd /path/to/opencode
bun install

cd packages/app

# Build the UI assets
bunx vite build
```

This produces a `dist/` folder under `packages/app`.

### Step C: Serve the UI

Example using a simple static server:

```bash
cd /path/to/opencode/packages/app

# Any static server works; pick one you already have.
python3 -m http.server 8080 --directory dist
```

Now open `http://localhost:8080`.

Notes:

- In this deployment mode, the UI and backend are on different origins, so CORS must allow the UI origin.
- The UI still supports connecting to servers via the "See Servers" flow; ensure the server URL you add is reachable from your browser.

## 4) Why `opencode web` doesn’t show local UI changes

The backend has a catch-all route that proxies UI requests to `https://app.opencode.ai`.

This is why you can run OpenCode "as a web app" without installing/building the frontend locally, but it also means local UI modifications require one of:

- running `packages/app` via Vite (Section 2)
- serving a built UI yourself (Section 3)

## 5) Future: a true fully-local `opencode web --local-ui`

We did not find an existing flag or config option that makes `opencode web` serve a local UI build.

If desired, add a mode such as:

- `opencode web --ui-dir /path/to/packages/app/dist`

so `opencode web` can serve local static assets instead of proxying `app.opencode.ai`.
