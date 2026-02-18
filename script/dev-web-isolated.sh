#!/usr/bin/env bash
set -euo pipefail

server_port="${OPENCODE_DEV_SERVER_PORT:-5096}"
ui_port="${OPENCODE_DEV_UI_PORT:-5444}"
server_host="${OPENCODE_DEV_SERVER_HOST:-127.0.0.1}"
ui_host="${OPENCODE_DEV_UI_HOST:-127.0.0.1}"

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is required (repo uses bun workspaces)" >&2
  echo "Install: https://bun.sh" >&2
  exit 1
fi

shim_mdast_to_markdown() {
  local root="$root_dir/node_modules/.bun"
  if [ ! -d "$root" ]; then
    return
  fi

  local did=""
  for dir in "$root"/mdast-util-to-markdown@*/node_modules/mdast-util-to-markdown; do
    if [ ! -d "$dir" ]; then
      continue
    fi

    if [ -f "$dir/index.js" ]; then
      continue
    fi

    cat >"$dir/index.js" <<'EOF'
// Dev shim for bun-installed mdast-util-to-markdown.
//
// Some bun installs have been observed to miss this package's entry file even
// though its package.json exports "./index.js".
//
// OpenCode's dev web server only needs remark/rehype for parsing markdown.
// The GFM to-markdown handlers are registered but not used at runtime.

export const defaultHandlers = new Proxy(
  {},
  {
    get(_target, prop) {
      return () => {
        throw new Error(`mdast-util-to-markdown shim: handler ${String(prop)} called`)
      }
    },
  },
)

export function toMarkdown() {
  throw new Error("mdast-util-to-markdown shim: toMarkdown called")
}
EOF
    did="1"
  done

  if [ -n "$did" ]; then
    echo "Applied dev shim: mdast-util-to-markdown/index.js" >&2
  fi
}

xdg_root="${OPENCODE_DEV_XDG_ROOT:-$root_dir/.opencode-dev}"

export XDG_DATA_HOME="${OPENCODE_DEV_XDG_DATA_HOME:-$xdg_root/data}"
export XDG_CACHE_HOME="${OPENCODE_DEV_XDG_CACHE_HOME:-$xdg_root/cache}"
export XDG_CONFIG_HOME="${OPENCODE_DEV_XDG_CONFIG_HOME:-$xdg_root/config}"
export XDG_STATE_HOME="${OPENCODE_DEV_XDG_STATE_HOME:-$xdg_root/state}"

mkdir -p \
  "$XDG_DATA_HOME/opencode/bin" \
  "$XDG_DATA_HOME/opencode/log" \
  "$XDG_CACHE_HOME/opencode" \
  "$XDG_CONFIG_HOME/opencode" \
  "$XDG_STATE_HOME/opencode"

shim_mdast_to_markdown

echo "Starting isolated opencode dev servers"
echo "- Backend: http://${server_host}:${server_port} (XDG_DATA_HOME=$XDG_DATA_HOME)"
echo "- UI:      http://${ui_host}:${ui_port}"
echo

server_pid=""

cleanup() {
  if [ -n "${server_pid}" ]; then
    kill "${server_pid}" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

(
  cd "$root_dir/packages/opencode"
  exec bun run --conditions=browser ./src/index.ts serve \
    --hostname "$server_host" \
    --port "$server_port" \
    --cors "http://${ui_host}:${ui_port}"
) &
server_pid="$!"

(
  cd "$root_dir/packages/app"
  export VITE_OPENCODE_SERVER_HOST="$server_host"
  export VITE_OPENCODE_SERVER_PORT="$server_port"
  exec bun dev -- --host "$ui_host" --port "$ui_port"
)
