# Deployment Guide

OpenCode has:

- Backend HTTP API server: `packages/opencode`
- Web UI app: `packages/app`

When you run `opencode web`, the OpenCode server serves a browser UI and the API from the same origin.

## UI Hosting Options

You have three practical ways to host the UI in production.

### Option A: Proxy a hosted UI upstream (default)

By default, `opencode web` serves the UI by proxying requests to `https://app.opencode.ai`.

If you want to host the UI yourself (but still have OpenCode proxy it so the UI and API share one origin), set a custom UI upstream:

- CLI: `opencode web --ui-url https://ui.example.com`
- Config: `server.uiUrl` (see below)

Constraints (enforced at runtime):

- Must be `http://` or `https://`
- Must not include credentials, query string, hash, or path
- Format: `http(s)://host[:port]`

This mode is useful when:

- You want OpenCode to remain the single origin for browser traffic (no extra CORS setup)
- You deploy the UI separately (CDN, object storage, internal web host) and just point OpenCode at it

### Option B: Serve local UI assets from disk (`--ui-dir`)

Build the UI and serve it directly from the OpenCode server process.

1. Build the UI:

```bash
bun install
bun run --cwd packages/app build
```

2. Run OpenCode with the UI build output:

```bash
opencode web \
  --port 4096 \
  --hostname 0.0.0.0 \
  --ui-dir ./packages/app/dist
```

This mode is useful when:

- You want a single deployable service (no separate UI host)
- You want fully offline / air-gapped operation

### Option C: Separate UI origin (dev or custom deployments)

For local iteration (or custom deployments where the UI is hosted on a different origin and talks to the OpenCode server directly), run the backend and the UI separately and enable CORS.

Fast local dev (isolated ports + pre-wired CORS):

```bash
bun install
./script/dev-web-isolated.sh
```

Defaults:

- backend API: `http://127.0.0.1:5096`
- UI: `http://localhost:5444`

Remote server / public IP example:

```bash
OPENCODE_DEV_PUBLIC_HOST=52.10.222.139 \
OPENCODE_DEV_SERVER_BIND_HOST=0.0.0.0 \
OPENCODE_DEV_UI_BIND_HOST=0.0.0.0 \
./script/dev-web-isolated.sh
```

If you host the UI on a different origin in production, make sure your OpenCode server allows that UI origin via `--cors` or `server.cors`.

## Production Setup

### Building From Source

If you're deploying a locally built binary (current platform), you can build it from this repo:

```bash
bun install
bun run --cwd packages/opencode build --single
```

The resulting binary is under `packages/opencode/dist/opencode-*/bin/opencode`.

### Binding and Authentication

For anything beyond localhost access:

- Bind to the network: `--hostname 0.0.0.0`
- Set HTTP basic auth:

```bash
OPENCODE_SERVER_PASSWORD=secret opencode web --hostname 0.0.0.0 --port 4096
```

Username defaults to `opencode` (override with `OPENCODE_SERVER_USERNAME`).

### Reverse Proxy (TLS termination)

Common production layout:

- Reverse proxy (nginx/Caddy/Traefik) terminates TLS
- Reverse proxy forwards to OpenCode on a private interface (eg `127.0.0.1:4096`)

If you expose OpenCode on a network, keep `OPENCODE_SERVER_PASSWORD` enabled even behind a reverse proxy.

## Config Reference

You can set the following in `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "server": {
    "port": 4096,
    "hostname": "0.0.0.0",
    "cors": ["https://ui.example.com"],
    "uiUrl": "https://ui.example.com"
  }
}
```

Notes:

- `server.uiUrl` only affects `opencode web` (it controls the web UI upstream that OpenCode proxies).
- `server.cors` is only needed when your UI is on a different origin and connects directly to the OpenCode server.

## Network Proxies

If you are on a corporate proxy, ensure local connections to the OpenCode server bypass the proxy to avoid loops:

```bash
export NO_PROXY=localhost,127.0.0.1
```

## Verification Checklist

Local smoke:

```bash
OPENCODE_SERVER_PASSWORD=secret opencode web \
  --hostname 127.0.0.1 \
  --port 4096
```

- Open `http://localhost:4096` and verify the UI loads and sessions list renders.

Custom UI upstream smoke:

```bash
OPENCODE_SERVER_PASSWORD=secret opencode web \
  --hostname 127.0.0.1 \
  --port 4096 \
  --ui-url https://ui.example.com
```

- UI should load from the configured upstream; API calls should still hit the same origin.

Local UI assets smoke:

```bash
bun run --cwd packages/app build
OPENCODE_SERVER_PASSWORD=secret opencode web \
  --hostname 127.0.0.1 \
  --port 4096 \
  --ui-dir ./packages/app/dist
```

- UI should load without any upstream dependency.

Reverse proxy smoke (TLS termination):

- Reverse proxy forwards to `http://127.0.0.1:4096`.
- Verify HTTP basic auth prompts and UI works end-to-end over HTTPS.
