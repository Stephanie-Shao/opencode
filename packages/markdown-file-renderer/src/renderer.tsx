import DOMPurify from "dompurify"
import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import remarkRehype from "remark-rehype"
import rehypeStringify from "rehype-stringify"
import { createEffect, createMemo, createResource, createSignal, onCleanup } from "solid-js"
import type {
  CommentSurface,
  FileRenderer,
  FileRenderProps,
  LineRange,
} from "@opencode-ai/ui/context/file-renderer"

type Pos = {
  start?: { line?: number; column?: number }
  end?: { line?: number; column?: number }
}

type HastElement = {
  type: "element"
  tagName: string
  properties?: Record<string, unknown>
  position?: Pos
  children?: unknown[]
}

function isElement(node: unknown): node is HastElement {
  if (!node || typeof node !== "object") return false
  if ((node as { type?: unknown }).type !== "element") return false
  return typeof (node as { tagName?: unknown }).tagName === "string"
}

const blocks = new Set([
  "p",
  "pre",
  "blockquote",
  "hr",
  "ul",
  "ol",
  "li",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
])

function annotate() {
  return (tree: unknown) => {
    const walk = (node: unknown) => {
      if (!node || typeof node !== "object") return

      if (isElement(node) && blocks.has(node.tagName)) {
        const pos = node.position
        const startLine = pos?.start?.line
        const startCol = pos?.start?.column
        const endLine = pos?.end?.line
        const endCol = pos?.end?.column
        if (startLine && startCol && endLine && endCol) {
          if (!node.properties) node.properties = {}
          node.properties["data-sourcepos"] = `${startLine}:${startCol}-${endLine}:${endCol}`
          node.properties["data-line-anchor"] = String(startLine)
        }
      }

      const children = (node as { children?: unknown[] }).children
      if (!children) return
      for (const child of children) walk(child)
    }

    walk(tree)
  }
}

const config = {
  USE_PROFILES: { html: true, mathMl: true },
  SANITIZE_NAMED_PROPS: true,
  FORBID_TAGS: ["style"],
  FORBID_CONTENTS: ["style", "script"],
}

function sanitize(html: string) {
  if (!DOMPurify.isSupported) return ""
  return DOMPurify.sanitize(html, config)
}

function parseSourcepos(value: string | undefined) {
  if (!value) return
  const m = value.match(/^(\d+):(\d+)-(\d+):(\d+)$/)
  if (!m) return
  return {
    startLine: parseInt(m[1]!, 10),
    startCol: parseInt(m[2]!, 10),
    endLine: parseInt(m[3]!, 10),
    endCol: parseInt(m[4]!, 10),
  }
}

function lineFromNode(node: Node | null) {
  if (!node) return
  const el = node instanceof HTMLElement ? node : node.parentElement
  if (!el) return
  const host = el.closest("[data-sourcepos]")
  if (!(host instanceof HTMLElement)) return
  const pos = parseSourcepos(host.dataset.sourcepos)
  if (!pos) return
  return { start: pos.startLine, end: pos.endLine }
}

function rangeForRoot(root: HTMLDivElement) {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  if (sel.isCollapsed) return null

  const range = sel.getRangeAt(0)
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null

  const start = lineFromNode(range.startContainer)
  const end = lineFromNode(range.endContainer)
  if (!start && !end) return null

  const a = start?.start ?? end?.start
  const b = end?.end ?? start?.end ?? a
  if (!a || !b) return null

  return {
    start: Math.min(a, b),
    end: Math.max(a, b),
  } satisfies LineRange
}

export function MarkdownFileView(props: FileRenderProps) {
  const source = createMemo(() => props.file.contents)

  const [html] = createResource(
    () => props.file.cacheKey ?? source(),
    async () => {
      const out = String(
        await unified()
          .use(remarkParse)
          .use(remarkGfm)
          .use(remarkRehype, { allowDangerousHtml: false })
          .use(annotate)
          .use(rehypeStringify, { allowDangerousHtml: false })
          .process(source()),
      )
      return sanitize(out)
    },
  )

  const [root, setRoot] = createSignal<HTMLDivElement>()
  let down = false
  let current: LineRange | null = null
  let anchors: Array<{ line: number; el: HTMLElement }> = []

  const surface: CommentSurface = {
    anchor(range) {
      const line = Math.max(range.start, range.end)
      let lo = 0
      let hi = anchors.length - 1
      let hit: HTMLElement | undefined
      while (lo <= hi) {
        const mid = (lo + hi) >> 1
        const item = anchors[mid]
        if (!item) break
        if (item.line === line) return item.el
        if (item.line < line) {
          hit = item.el
          lo = mid + 1
          continue
        }
        hi = mid - 1
      }
      return hit
    },
  }

  const indexAnchors = () => {
    const el = root()
    if (!el) return

    anchors = Array.from(el.querySelectorAll("[data-line-anchor]"))
      .map((el) => {
        if (!(el instanceof HTMLElement)) return
        const line = parseInt(el.dataset.lineAnchor ?? "", 10)
        if (Number.isNaN(line)) return
        return { line, el }
      })
      .filter((x): x is { line: number; el: HTMLElement } => !!x)
      .sort((a, b) => a.line - b.line)
  }

  const emitSelected = (range: LineRange | null) => {
    if (range?.start === current?.start && range?.end === current?.end) return
    current = range
    props.onLineSelected?.(range)
  }

  const handleMouseDown = (event: MouseEvent) => {
    const el = root()
    if (!el) return
    if (!(event.target instanceof Node)) return
    down = el.contains(event.target)
  }

  const handleMouseUp = () => {
    if (!down) return
    down = false
    const el = root()
    if (!el) return
    const range = rangeForRoot(el)
    emitSelected(range)
    props.onLineSelectionEnd?.(range)
  }

  const handleSelectionChange = () => {
    if (down) return
    const el = root()
    if (!el) return
    emitSelected(rangeForRoot(el))
  }

  onCleanup(() => props.surfaceRef?.(null))

  createEffect(() => {
    const next = html()
    const el = root()
    if (!el) return
    if (!next) {
      el.innerHTML = ""
      indexAnchors()
      props.onRendered?.()
      return
    }
    el.innerHTML = next
    indexAnchors()
    props.onRendered?.()
  })

  createEffect(() => {
    if (typeof window === "undefined") return
    window.addEventListener("selectionchange", handleSelectionChange)
    window.addEventListener("mousedown", handleMouseDown)
    window.addEventListener("mouseup", handleMouseUp)
    onCleanup(() => {
      window.removeEventListener("selectionchange", handleSelectionChange)
      window.removeEventListener("mousedown", handleMouseDown)
      window.removeEventListener("mouseup", handleMouseUp)
    })
  })

  onCleanup(() => {
    current = null
  })

  return (
    <div
      ref={(el) => {
        setRoot(el)
        props.surfaceRef?.(surface)
      }}
      data-component="markdown"
      classList={{
        ...(props.classList ?? {}),
        [props.class ?? ""]: !!props.class,
      }}
    />
  )
}

export const markdownRenderer: FileRenderer = {
  id: "markdown",
  match(meta) {
    const ext = meta.path.split(".").pop()?.toLowerCase()
    return ext === "md" || ext === "mdx" || ext === "markdown"
  },
  component: MarkdownFileView,
}
