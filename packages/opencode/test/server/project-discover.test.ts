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

describe("GET /project/discover", () => {
  test("returns only top-level directories with .git (dir or file)", async () => {
    await using home = await tmpdir()
    await using root = await tmpdir({
      config: {
        "creative-fitting": {
          root: "{env:CF_ROOT}",
        },
      },
    })
    const prevHome = process.env.OPENCODE_TEST_HOME
    const prevRoot = process.env.CF_ROOT
    process.env.OPENCODE_TEST_HOME = home.path
    process.env.CF_ROOT = root.path
    try {
      const gitDir = path.join(root.path, "repo-dir")
      await fs.mkdir(path.join(gitDir, ".git"), { recursive: true })

      const gitFile = path.join(root.path, "repo-file")
      await fs.mkdir(gitFile, { recursive: true })
      await fs.writeFile(path.join(gitFile, ".git"), "gitdir: /tmp/fake\n")

      const nested = path.join(root.path, "outer", "inner")
      await fs.mkdir(path.join(nested, ".git"), { recursive: true })

      await Instance.provide({
        directory: root.path,
        init: async () => {},
        fn: async () => {},
      })

      const app = Server.App()
      const response = await app.request("/project/discover", {
        method: "GET",
        headers: headers(root.path),
      })

      expect(response.status).toBe(200)
      expect(response.headers.get("content-type") ?? "").toContain("application/json")
      const data = (await response.json()) as Array<{ name: string }>
      expect(data.map((p) => p.name).toSorted()).toEqual(["repo-dir", "repo-file"])
    } finally {
      process.env.OPENCODE_TEST_HOME = prevHome
      process.env.CF_ROOT = prevRoot
    }
  })
})
