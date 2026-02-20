#!/usr/bin/env bash
set -euo pipefail

docker_cmd=${DOCKER:-docker}
image=${IMAGE:-opencode:devshell}
name=${NAME:-opencode-web-test}
port=${PORT:-4096}
run_timeout=${RUN_TIMEOUT:-300}
help_timeout=${HELP_TIMEOUT:-300}
ready_timeout=${READY_TIMEOUT:-120}
curl_max_time=${CURL_MAX_TIME:-2}
pulla=${PULL:-never}

if ! command -v timeout >/dev/null 2>&1; then
  echo "error: 'timeout' is required (coreutils)" >&2
  exit 1
fi

log() {
  printf '[smoke %s] %s\n' "$(date -Is)" "$*" >&2
}

cleanup() {
  ${docker_cmd} rm -f "${name}" >/dev/null 2>&1 || true
}

trap cleanup EXIT

log "Image: ${image}"
log "Docker: ${docker_cmd}"
log "Note: first container start can take a couple minutes (large image)"

log "Version check"
timeout "${run_timeout}s" ${docker_cmd} run --rm --pull="${pulla}" "${image}" opencode --version

log "Help check"
timeout "${help_timeout}s" ${docker_cmd} run --rm --pull="${pulla}" "${image}" opencode web --help >/dev/null

log "Start server container"
${docker_cmd} rm -f "${name}" >/dev/null 2>&1 || true
if ! cid=$(${docker_cmd} run -d --rm --name "${name}" \
  -p "${port}:4096" \
  -v opencode:/data/opencode \
  --pull="${pulla}" \
  "${image}" opencode-web 2>&1); then
  log "Failed to start server container"
  echo "${cid}" >&2
  if echo "${cid}" | grep -qi 'address already in use'; then
    log "Host port ${port} is already in use; try: PORT=4097 bash docker/smoke-test.sh"
  fi
  exit 1
fi

log "Server container id: ${cid}"
log "Host URL: http://127.0.0.1:${port}/"

log "Wait for HTTP readiness"
deadline=$((SECONDS + ready_timeout))
code=""
while [ "${SECONDS}" -lt "${deadline}" ]; do
  code=$(curl -s -o /dev/null --max-time "${curl_max_time}" -w '%{http_code}' "http://127.0.0.1:${port}/" || true)
  if [ "${code}" = "200" ] || [ "${code}" = "302" ] || [ "${code}" = "304" ]; then
    break
  fi
  log "Not ready yet (HTTP=${code:-none}); waiting..."
  sleep 1
done

if [ "${code}" != "200" ] && [ "${code}" != "302" ] && [ "${code}" != "304" ]; then
  log "Server did not become ready (last HTTP=${code:-none})"
  ${docker_cmd} logs --tail 200 "${name}" || true
  exit 1
fi

log "HTTP ready: ${code}"
${docker_cmd} logs --tail 20 "${name}" || true

log "OK"
