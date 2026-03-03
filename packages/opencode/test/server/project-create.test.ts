import { afterAll, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Log } from "../../src/util/log"
import { Flag } from "../../src/flag/flag"
import { Instance } from "../../src/project/instance"
import { Server } from "../../src/server/server"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

afterAll(async () => {
  await Instance.disposeAll()
})

function headers(directory: string) {
  const result: Record<string, string> = {
    "x-opencode-directory": directory,
  }

  const password = Flag.OPENCODE_SERVER_PASSWORD
  if (!password) return result

  const username = Flag.OPENCODE_SERVER_USERNAME ?? "opencode"
  result.authorization = "Basic " + Buffer.from(username + ":" + password).toString("base64")
  return result
}

describe("POST /project/create", () => {
  test("creates a new directory under $HOME and initializes git when available", async () => {
    await using tmp = await tmpdir()
    const prevHome = process.env.OPENCODE_TEST_HOME
    process.env.OPENCODE_TEST_HOME = tmp.path
    try {
      await Instance.provide({ directory: tmp.path, fn: async () => {} })
      const app = Server.App()

      const response = await app.request("/project/create", {
        method: "POST",
        headers: { ...headers(tmp.path), "content-type": "application/json" },
        body: JSON.stringify({ name: "my-script" }),
      })

      expect(response.status).toBe(200)
      expect(response.headers.get("content-type") ?? "").toContain("application/json")
      const data = await response.json()
      expect(data.name).toBe("my-script")
      expect(data.path).toBe(path.join(tmp.path, "my-script"))
      const ok = await fs
        .stat(path.join(tmp.path, "my-script", ".git"))
        .then(() => true)
        .catch(() => false)
      expect(data.gitInitialized).toBe(ok)
    } finally {
      process.env.OPENCODE_TEST_HOME = prevHome
    }
  })

  test("rejects names that sanitize to dot directories", async () => {
    await using tmp = await tmpdir()
    const prevHome = process.env.OPENCODE_TEST_HOME
    process.env.OPENCODE_TEST_HOME = tmp.path
    try {
      await Instance.provide({ directory: tmp.path, fn: async () => {} })
      const app = Server.App()

      const response = await app.request("/project/create", {
        method: "POST",
        headers: { ...headers(tmp.path), "content-type": "application/json" },
        body: JSON.stringify({ name: "<..>" }),
      })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe("Invalid project name")
    } finally {
      process.env.OPENCODE_TEST_HOME = prevHome
    }
  })
})
