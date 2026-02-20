# OpenCode Docker (Devshell Image)

This folder contains a Dockerfile for building a **devshell-style** image that ships this fork of OpenCode.

Design goals:

- Base image: `node:24-bookworm-slim`
- Bun: pinned to `1.3.9`
- Includes the repo source and `node_modules` (large, but convenient for interactive use)
- Builds and embeds a local UI build at `/opt/opencode/ui`
- Builds a compiled `opencode` binary and installs it to `/usr/local/bin/opencode`
- Defaults to an interactive shell (`bash`)

## Build

Run from the repo root:

```bash
docker build -f docker/Dockerfile -t opencode:devshell .
```

Notes:

- The build runs `bun install`, builds the UI (`packages/app`), then builds the CLI (`packages/opencode`).
- This image is currently intended for **linux/amd64**.

## Run (Interactive Shell)

This image defaults to `bash`.

Recommended: use a named volume for persistence:

```bash
docker run -it --rm \
  -p 4096:4096 \
  -v opencode:/data/opencode \
  opencode:devshell
```

### Persistent data (XDG paths)

The image sets XDG directories to live under `/data/opencode`:

- `XDG_DATA_HOME=/data/opencode/data`
- `XDG_CONFIG_HOME=/data/opencode/config`
- `XDG_CACHE_HOME=/data/opencode/cache`
- `XDG_STATE_HOME=/data/opencode/state`

If you use a bind-mount instead of a named volume, make sure the mounted directory is writable by the container user.

## Start the web server

The image includes a helper script `opencode-web`:

```bash
opencode-web
```

That expands to:

```bash
opencode web --hostname 0.0.0.0 --port 4096 --ui-dir /opt/opencode/ui
```

Then open:

- `http://localhost:4096`

## Local smoke test (with timeouts)

If you found the "start server then curl" flow easy to hang, use the bundled script:

```bash
bash docker/smoke-test.sh
```

If port `4096` is already in use on your host:

```bash
PORT=4097 bash docker/smoke-test.sh
```

It logs each step and uses `timeout` so failures are bounded.

If your user is not in the `docker` group, run it with sudo:

```bash
DOCKER="sudo docker" bash docker/smoke-test.sh
```

## Optional authentication

To require a password, set `OPENCODE_SERVER_PASSWORD`:

```bash
docker run -it --rm \
  -p 4096:4096 \
  -v opencode:/data/opencode \
  -e OPENCODE_SERVER_PASSWORD=secret \
  opencode:devshell
```

## Useful commands

```bash
opencode --version
opencode web --help
```

## Publish / Update (GHCR)

This repo’s intended registry is GitHub Container Registry (GHCR):

- `ghcr.io/<your-gh-user-or-org>/opencode`

The tag policy used here is:

- `latest` for the current default-branch build
- `sha-<shortsha>` for traceability

### One-time: authenticate to GHCR

Create a GitHub Personal Access Token (PAT) with `write:packages` (and typically `read:packages`).

Then:

```bash
export GHCR_OWNER="<your-gh-user-or-org>"
export IMAGE="ghcr.io/${GHCR_OWNER}/opencode"

echo "$GITHUB_TOKEN" | docker login ghcr.io -u "$GHCR_OWNER" --password-stdin
```

### Publish from your local machine

From the repo root:

```bash
export GHCR_OWNER="<your-gh-user-or-org>"
export IMAGE="ghcr.io/${GHCR_OWNER}/opencode"
export SHA="$(git rev-parse --short HEAD)"

docker build -f docker/Dockerfile -t "${IMAGE}:latest" -t "${IMAGE}:sha-${SHA}" .
docker push "${IMAGE}:latest"
docker push "${IMAGE}:sha-${SHA}"
```

### Publish with Buildx (recommended)

Buildx is useful when you want a consistent build environment and `--push` in one step.
This image is currently intended for `linux/amd64`.

```bash
export GHCR_OWNER="<your-gh-user-or-org>"
export IMAGE="ghcr.io/${GHCR_OWNER}/opencode"
export SHA="$(git rev-parse --short HEAD)"

docker buildx create --use 2>/dev/null || true
docker buildx build \
  --platform linux/amd64 \
  -f docker/Dockerfile \
  -t "${IMAGE}:latest" \
  -t "${IMAGE}:sha-${SHA}" \
  --push \
  .
```

### Updating the remote image

To update:

1. Commit your changes.
2. Re-run one of the publish flows above.

`latest` will move forward, and a new `sha-...` tag will be added for that build.
