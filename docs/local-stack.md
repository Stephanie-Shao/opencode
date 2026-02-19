# Local Stack (Test + Production)

OpenCode has a backend API server (`packages/opencode`) and a web UI app (`packages/app`).

By default, `opencode web` serves the UI by proxying `https://app.opencode.ai`. For fully local deployments, use `opencode web --ui-dir` to serve a local UI build.

## Test mode (fast iteration)

Run backend + Vite dev UI:

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

## Production mode (single process + local UI assets)

1. Build the UI:

```bash
bun install
bun run --cwd packages/app build
```

2. Build the local `opencode` CLI binary (current platform):

```bash
bun run --cwd packages/opencode build --single
```

3. Run the locally built binary with local UI assets:

```bash
./packages/opencode/dist/opencode-*/bin/opencode web \
  --port 4096 \
  --hostname 0.0.0.0 \
  --ui-dir ./packages/app/dist
```

For network access, set auth:

```bash
OPENCODE_SERVER_PASSWORD=secret ./packages/opencode/dist/opencode-*/bin/opencode web \
  --hostname 0.0.0.0 \
  --port 4096 \
  --ui-dir ./packages/app/dist
```
