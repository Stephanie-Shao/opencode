import { Hono } from "hono"
import { describeRoute, validator } from "hono-openapi"
import { resolver } from "hono-openapi"
import { Instance } from "../../project/instance"
import { Project } from "../../project/project"
import { Global } from "@/global"
import z from "zod"
import { errors } from "../error"
import { lazy } from "../../util/lazy"
import { Filesystem } from "@/util/filesystem"
import { git } from "../../util/git"

export const ProjectRoutes = lazy(() =>
  new Hono()
    .post(
      "/create",
      describeRoute({
        summary: "Create project",
        description: "Create a new project directory under the user's home directory and initialize git.",
        operationId: "project.create",
        responses: {
          200: {
            description: "Project created",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    path: z.string(),
                    name: z.string(),
                    gitInitialized: z.boolean(),
                  }),
                ),
              },
            },
          },
          400: {
            description: "Bad request",
            content: {
              "application/json": {
                schema: resolver(
                  z.union([
                    z.object({ error: z.string() }),
                    z.object({
                      data: z.any(),
                      errors: z.array(z.record(z.string(), z.any())),
                      success: z.literal(false),
                    }),
                  ]),
                ),
              },
            },
          },
          403: {
            description: "Forbidden",
            content: {
              "application/json": {
                schema: resolver(z.object({ error: z.string() })),
              },
            },
          },
          409: {
            description: "Conflict",
            content: {
              "application/json": {
                schema: resolver(z.object({ error: z.string() })),
              },
            },
          },
        },
      }),
      validator(
        "json",
        z.object({
          name: z.string(),
        }),
      ),
      async (c) => {
        const input = c.req.valid("json")

        const name = input.name.trim()
        if (!name || name === "." || name === ".." || name.includes("/") || name.includes("\\")) {
          return c.json({ error: "Invalid project name" }, 400)
        }

        const sanitized = name.replace(/[<>:"\\|?*]/g, "").trim()
        if (!sanitized || sanitized === "." || sanitized === "..") {
          return c.json({ error: "Invalid project name" }, 400)
        }

        const nodePath = await import("node:path")
        const { mkdir } = await import("node:fs/promises")

        const root = Global.Path.home
        const resolved = nodePath.default.resolve(root, sanitized)
        if (!Filesystem.contains(root, resolved)) {
          return c.json({ error: "Access denied: path escapes home directory" }, 403)
        }

        const created = await mkdir(resolved).then(
          () => true,
          (e) => {
            if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "EEXIST") {
              return false
            }
            throw e
          },
        )

        if (!created) {
          return c.json({ error: "Project already exists" }, 409)
        }

        const result = await git(["init"], { cwd: resolved })
        return c.json({
          path: resolved,
          name: sanitized,
          gitInitialized: result.exitCode === 0,
        })
      },
    )
    .get(
      "/discover",
      describeRoute({
        summary: "Discover git projects",
        description: "List top-level directories in the user's home directory that have git initialized.",
        operationId: "project.discover",
        responses: {
          200: {
            description: "Discovered projects",
            content: {
              "application/json": {
                schema: resolver(
                  z
                    .object({
                      name: z.string(),
                      path: z.string(),
                      updatedAt: z.number(),
                    })
                    .array(),
                ),
              },
            },
          },
        },
      }),
      async (c) => {
        const { readdir, stat } = await import("node:fs/promises")
        const nodePath = await import("node:path")

        const root = Global.Path.home
        const entries = await readdir(root, { withFileTypes: true })
        const projects = (
          await Promise.all(
            entries
              .filter((e) => e.isDirectory())
              .map(async (e) => {
                const dir = nodePath.default.join(root, e.name)
                const gitPath = nodePath.default.join(dir, ".git")
                const ok = await stat(gitPath)
                  .then(() => true)
                  .catch(() => false)
                if (!ok) return

                const updatedAt = await stat(dir)
                  .then((s) => s.mtimeMs)
                  .catch(() => Date.now())
                return {
                  name: e.name,
                  path: dir,
                  updatedAt,
                }
              }),
          )
        )
          .filter((p): p is { name: string; path: string; updatedAt: number } => Boolean(p))
          .toSorted((a, b) => b.updatedAt - a.updatedAt)

        return c.json(projects)
      },
    )
    .get(
      "/",
      describeRoute({
        summary: "List all projects",
        description: "Get a list of projects that have been opened with OpenCode.",
        operationId: "project.list",
        responses: {
          200: {
            description: "List of projects",
            content: {
              "application/json": {
                schema: resolver(Project.Info.array()),
              },
            },
          },
        },
      }),
      async (c) => {
        const projects = await Project.list()
        return c.json(projects)
      },
    )
    .get(
      "/current",
      describeRoute({
        summary: "Get current project",
        description: "Retrieve the currently active project that OpenCode is working with.",
        operationId: "project.current",
        responses: {
          200: {
            description: "Current project information",
            content: {
              "application/json": {
                schema: resolver(Project.Info),
              },
            },
          },
        },
      }),
      async (c) => {
        return c.json(Instance.project)
      },
    )
    .patch(
      "/:projectID",
      describeRoute({
        summary: "Update project",
        description: "Update project properties such as name, icon, and commands.",
        operationId: "project.update",
        responses: {
          200: {
            description: "Updated project information",
            content: {
              "application/json": {
                schema: resolver(Project.Info),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator("param", z.object({ projectID: z.string() })),
      validator("json", Project.update.schema.omit({ projectID: true })),
      async (c) => {
        const projectID = c.req.valid("param").projectID
        const body = c.req.valid("json")
        const project = await Project.update({ ...body, projectID })
        return c.json(project)
      },
    ),
)
