import { afterEach, expect, mock, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { Config } from "../../src/config/config"
import { Global } from "../../src/global"

let seen: unknown

mock.module("../../src/server/server", () => ({
  Server: {
    listen: (opts: unknown) => {
      seen = opts
      throw new Error("STOP_WEB")
    },
  },
}))

afterEach(async () => {
  seen = undefined
  Config.global.reset()
  await fs.rm(path.join(Global.Path.config, "opencode.json"), { force: true }).catch(() => {})
})

test("web uses server.uiUrl from config when --ui-url is not set", async () => {
  process.env.OPENCODE_SERVER_PASSWORD = "test"
  Config.global.reset()
  await Bun.write(
    path.join(Global.Path.config, "opencode.json"),
    JSON.stringify({
      $schema: "https://opencode.ai/config.json",
      server: {
        uiUrl: "https://ui.example.com",
      },
    }),
  )

  const { WebCommand } = await import("../../src/cli/cmd/web")

  await expect(
    WebCommand.handler!({
      port: 0,
      hostname: "127.0.0.1",
      mdns: false,
      "mdns-domain": "opencode.local",
      cors: [],
    } as any),
  ).rejects.toThrow("STOP_WEB")

  expect(seen).toMatchObject({
    uiUrl: "https://ui.example.com",
  })
})

test("--ui-url flag wins over server.uiUrl from config", async () => {
  process.env.OPENCODE_SERVER_PASSWORD = "test"
  Config.global.reset()
  await Bun.write(
    path.join(Global.Path.config, "opencode.json"),
    JSON.stringify({
      $schema: "https://opencode.ai/config.json",
      server: {
        uiUrl: "https://ui.example.com",
      },
    }),
  )

  const { WebCommand } = await import("../../src/cli/cmd/web")

  await expect(
    WebCommand.handler!({
      port: 0,
      hostname: "127.0.0.1",
      mdns: false,
      "mdns-domain": "opencode.local",
      cors: [],
      "ui-url": "https://flag.example.com",
    } as any),
  ).rejects.toThrow("STOP_WEB")

  expect(seen).toMatchObject({
    uiUrl: "https://flag.example.com",
  })
})
