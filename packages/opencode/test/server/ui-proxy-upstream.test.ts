import { afterAll, describe, expect, test } from "bun:test"
import path from "path"
import { Log } from "../../src/util/log"
import { Instance } from "../../src/project/instance"
import { Flag } from "../../src/flag/flag"
import { Server } from "../../src/server/server"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

const projectRoot = path.join(__dirname, "../..")

// Seed Instance cache without running InstanceBootstrap (which triggers file scanning/ripgrep).
await Instance.provide({
  directory: projectRoot,
  init: async () => {},
  fn: async () => {},
})

afterAll(async () => {
  await Instance.disposeAll()
})

function headers() {
  const result: Record<string, string> = {
    "x-opencode-directory": projectRoot,
  }

  const password = Flag.OPENCODE_SERVER_PASSWORD
  if (!password) return result

  const username = Flag.OPENCODE_SERVER_USERNAME ?? "opencode"
  result.authorization = "Basic " + Buffer.from(username + ":" + password).toString("base64")
  return result
}

function configure(input: { uiDir?: string; uiUrl?: string }) {
  Server.configureUI({
    uiDir: input.uiDir,
    uiUrl: input.uiUrl,
  })
}

function patchFetch() {
  const original = globalThis.fetch
  const calls: {
    count: number
    url?: URL
    host?: string
  } = { count: 0 }

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.count++

    const url = typeof input === "string" ? new URL(input) : input instanceof URL ? input : new URL(input.url)
    calls.url = url

    const host = (() => {
      const headers = init?.headers
      if (headers instanceof Headers) return headers.get("host") ?? headers.get("Host") ?? undefined
      if (Array.isArray(headers)) {
        const found = headers.find((h) => h[0].toLowerCase() === "host")
        return found?.[1]
      }
      if (headers && typeof headers === "object") {
        const value = (headers as Record<string, string | undefined>).host ?? (headers as any).Host
        if (typeof value === "string") return value
      }
      if (input instanceof Request) return input.headers.get("host") ?? input.headers.get("Host") ?? undefined
      return undefined
    })()
    calls.host = host

    return new Response("ok", {
      status: 200,
      headers: { "Content-Type": "text/html" },
    })
  }) as unknown as typeof fetch

  return {
    calls,
    restore() {
      globalThis.fetch = original
    },
  }
}

describe("UI proxy upstream", () => {
  test("default behavior proxies to https://app.opencode.ai/", async () => {
    configure({ uiDir: undefined, uiUrl: undefined })

    const fetch = patchFetch()
    try {
      const app = Server.App()
      const response = await app.request("/", {
        method: "GET",
        headers: headers(),
      })

      expect(response.status).toBe(200)
      expect(fetch.calls.url?.href).toBe("https://app.opencode.ai/")
      expect(fetch.calls.host).toBe("app.opencode.ai")
    } finally {
      fetch.restore()
      configure({ uiDir: undefined, uiUrl: undefined })
    }
  })

  test("when configured with a custom upstream, it proxies to that upstream and sets Host", async () => {
    configure({ uiDir: undefined, uiUrl: "https://ui.example.com" })

    const fetch = patchFetch()
    try {
      const app = Server.App()
      const response = await app.request("/", {
        method: "GET",
        headers: headers(),
      })

      expect(response.status).toBe(200)
      expect(fetch.calls.url?.href).toBe("https://ui.example.com/")
      expect(fetch.calls.host).toBe("ui.example.com")
    } finally {
      fetch.restore()
      configure({ uiDir: undefined, uiUrl: undefined })
    }
  })

  test("when upstream includes a port, Host header includes port", async () => {
    configure({ uiDir: undefined, uiUrl: "https://ui.example.com:4443" })

    const fetch = patchFetch()
    try {
      const app = Server.App()
      const response = await app.request("/", {
        method: "GET",
        headers: headers(),
      })

      expect(response.status).toBe(200)
      expect(fetch.calls.url?.href).toBe("https://ui.example.com:4443/")
      expect(fetch.calls.host).toBe("ui.example.com:4443")
    } finally {
      fetch.restore()
      configure({ uiDir: undefined, uiUrl: undefined })
    }
  })

  test("when uiDir is set, the proxy is not invoked", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "index.html"), "<html>hello</html>")
      },
    })
    configure({ uiDir: tmp.path })

    const fetch = patchFetch()
    try {
      const app = Server.App()
      const response = await app.request("/", {
        method: "GET",
        headers: headers(),
      })

      expect(response.status).toBe(200)
      expect(await response.text()).toBe("<html>hello</html>")
      expect(fetch.calls.count).toBe(0)
    } finally {
      fetch.restore()
      configure({ uiDir: undefined, uiUrl: undefined })
    }
  })
})
