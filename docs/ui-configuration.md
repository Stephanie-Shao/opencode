# UI configuration

Tune web behavior with simple config keys.

---

## Creative fitting

Creative-fitting related UI behavior is configured under the `creative-fitting` section.

- `creative-fitting.enabled` (boolean): when true, the Home screen and main layout open the creative-fitting "Open project" dialog instead of the legacy directory picker.
- `creative-fitting.root` (string, optional): root directory for creative-fitting projects. `GET /project/discover` and `POST /project/create` operate under this root.
  - Supports `~`, `~/...`, `$HOME`, `$HOME/...`
  - Must resolve to an absolute path; otherwise it falls back to `$HOME`
  - Defaults to `$HOME` when unset

Example:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "creative-fitting": {
    "enabled": true,
    "root": "~/workspace"
  }
}
```

---

## Proxy assets

Set `server.uiUrl` to have `opencode web` proxy web UI assets from your own hosted upstream.
This keeps the UI and API on the same origin, which usually means less CORS fuss.

Constraints (validated at runtime):

- `http://` or `https://` only
- no credentials (no `user:pass@`)
- no path, query string, or hash
- format: `http(s)://host[:port]`

```json
{
  "$schema": "https://opencode.ai/config.json",
  "server": {
    "uiUrl": "https://ui.example.com"
  }
}
```

---

## Reference related options

These keys are nearby if you are already shaping the interface behavior.
All of them are part of the same `opencode.json` config schema.

- `theme` (string): theme name to use for the interface
- `server.cors` (string[]): additional domains to allow for CORS

---

## Learn more

See the deployment guide for UI hosting patterns and tradeoffs.
Link: [docs/deployment-guide.md](./deployment-guide.md)
