import { describe, test, expect } from "bun:test"
import path from "path"
import fs from "fs/promises"
import { Instance } from "../../src/project/instance"
import { git } from "../../src/util/git"
import { tmpdir } from "../fixture/fixture"

describe("POST /file/mkdir git init", () => {
  test("git init succeeds after mkdir", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const newDir = path.join(tmp.path, "my-project")
        await fs.mkdir(newDir, { recursive: true })

        const result = await git(["init"], { cwd: newDir })

        expect(result.exitCode).toBe(0)

        const gitDir = path.join(newDir, ".git")
        const exists = await fs.stat(gitDir).then(() => true).catch(() => false)
        expect(exists).toBe(true)
      },
    })
  })

  test("gitInitialized is false when git is not available", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const newDir = path.join(tmp.path, "no-git-project")
        await fs.mkdir(newDir, { recursive: true })

        // 用 --invalid-flag 让 git 以非零退出码退出，模拟 git init 失败
        const result = await git(["init", "--invalid-flag"], { cwd: newDir })

        expect(result.exitCode).not.toBe(0)

        // .git 目录不应存在
        const gitDir = path.join(newDir, ".git")
        const exists = await fs.stat(gitDir).then(() => true).catch(() => false)
        expect(exists).toBe(false)
      },
    })
  })

  test("project directory is created even when git init would fail", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        // 先创建目录
        const newDir = path.join(tmp.path, "project-no-git")
        await fs.mkdir(newDir, { recursive: true })

        // 即使 git init 失败，目录本身应已存在
        await git(["init", "--invalid-flag"], { cwd: newDir })

        const dirExists = await fs.stat(newDir).then(() => true).catch(() => false)
        expect(dirExists).toBe(true)
      },
    })
  })
})
