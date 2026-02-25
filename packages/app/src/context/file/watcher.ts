import type { FileNode } from "@opencode-ai/sdk/v2"

type WatcherEvent =
  | {
      type: "file.watcher.updated"
      properties: {
        file: string
        event: "add" | "change" | "unlink"
      }
    }
  | {
      file: string
      event: "add" | "change" | "unlink"
    }

type WatcherOps = {
  normalize: (input: string) => string
  hasFile: (path: string) => boolean
  isOpen?: (path: string) => boolean
  loadFile: (path: string) => void
  node: (path: string) => FileNode | undefined
  isDirLoaded: (path: string) => boolean
  refreshDir: (path: string) => void
}

export function invalidateFromWatcher(event: WatcherEvent, ops: WatcherOps) {
  // Support both old format { type, properties } and new format { file, event }
  let rawPath: string | undefined
  let kind: string | undefined

  if ("type" in event && event.type === "file.watcher.updated" && "properties" in event) {
    // Old format
    const props = event.properties
    rawPath = typeof props?.file === "string" ? props.file : undefined
    kind = typeof props?.event === "string" ? props.event : undefined
  } else if ("file" in event && "event" in event) {
    // New format (flat structure)
    rawPath = typeof event.file === "string" ? event.file : undefined
    kind = typeof event.event === "string" ? event.event : undefined
  }

  if (!rawPath) return
  if (!kind) return

  const path = ops.normalize(rawPath)
  if (!path) return
  if (path.startsWith(".git/")) return

  if (ops.hasFile(path) || ops.isOpen?.(path)) {
    ops.loadFile(path)
  }

  if (kind === "change") {
    const dir = (() => {
      if (path === "") return ""
      const node = ops.node(path)
      if (node?.type !== "directory") return
      return path
    })()
    if (dir === undefined) return
    if (!ops.isDirLoaded(dir)) return
    ops.refreshDir(dir)
    return
  }
  if (kind !== "add" && kind !== "unlink") return

  const parent = path.split("/").slice(0, -1).join("/")
  if (!ops.isDirLoaded(parent)) return

  ops.refreshDir(parent)
}
