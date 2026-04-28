/** @jsxImportSource solid-js */
import DOMPurify from "dompurify"
import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import remarkRehype from "remark-rehype"
import rehypeStringify from "rehype-stringify"
import { createEffect, createMemo, createResource, createSignal, on, onCleanup } from "solid-js"
import "./style.css"
import type { FileRenderer, FileRenderProps, LineRange } from "@opencode-ai/ui/context/file-renderer"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { useI18n } from "@opencode-ai/ui/context/i18n"
import { annotate } from "./render/annotate"
import { rangeFromSelection } from "./preview/selection"
import { indexAnchors, createSurface } from "./preview/surface"
import { domToMarkdown } from "./editor/serializer"

// ─── DOMPurify ───

const purifyConfig = {
  USE_PROFILES: { html: true, mathMl: true },
  SANITIZE_NAMED_PROPS: true,
  FORBID_TAGS: ["style"],
  FORBID_CONTENTS: ["style", "script"],
}

function sanitize(html: string) {
  if (!DOMPurify.isSupported) return ""
  return DOMPurify.sanitize(html, purifyConfig)
}

// ─── Component ───

export function MarkdownFileView(props: FileRenderProps) {
  const i18n = useI18n()
  const source = createMemo(() => props.file.contents)

  // ─── Mode: preview | edit（由外部 props.mode 控制，默认 preview）───

  const mode = createMemo(() => props.mode ?? "preview")
  let prevMode: "preview" | "edit" = "preview"

  // ─── Copy ───

  const [copied, setCopied] = createSignal(false)
  let copyTimer: ReturnType<typeof setTimeout> | undefined

  const copyLabel = createMemo(() =>
    copied() ? i18n.t("ui.message.copied") : i18n.t("ui.message.copy"),
  )

  const handleCopy = () => {
    if (typeof navigator === "undefined") return
    if (!navigator.clipboard?.writeText) return
    void navigator.clipboard
      .writeText(source())
      .then(() => {
        setCopied(true)
        if (copyTimer) clearTimeout(copyTimer)
        copyTimer = setTimeout(() => setCopied(false), 2000)
      })
      .catch((err) => {
        console.error("[markdown-file-copy] copy failed", err)
      })
  }

  // ─── Markdown → HTML ───

  const [internalMarkdown, setInternalMarkdown] = createSignal(source())

  // 外部 source 变化时（文件保存）同步到 internalMarkdown
  createEffect(on(() => source(), (s) => setInternalMarkdown(s)))

  const [html] = createResource(
    () => props.file.cacheKey ?? internalMarkdown(),
    async (key) => {
      // key 可能是 cacheKey（字符串 hash）或 markdown 本身
      // 渲染当前的 internalMarkdown
      const out = String(
        await unified()
          .use(remarkParse)
          .use(remarkGfm)
          .use(remarkRehype, { allowDangerousHtml: false })
          .use(annotate)
          .use(rehypeStringify, { allowDangerousHtml: false })
          .process(internalMarkdown()),
      )
      return sanitize(out)
    },
  )

  // ─── DOM refs & state ───

  const [root, setRoot] = createSignal<HTMLDivElement>()
  let down = false
  let current: LineRange | null = null

  // ─── Render HTML → DOM ───

  createEffect(() => {
    const next = html()
    const el = root()
    const m = mode()
    if (!el) return

    // edit 模式下，保持用户正在编辑的 DOM，不覆盖
    if (m === "edit" && prevMode === "edit") {
      prevMode = m
      return
    }

    el.innerHTML = next ?? ""
    prevMode = m

    if (m === "preview") {
      const anchors = indexAnchors(el)
      props.surfaceRef?.(createSurface(anchors))
    } else {
      props.surfaceRef?.(null)
    }

    props.onRendered?.()
  })

  // edit → preview：把 contentEditable DOM 序列化回 Markdown，重新渲染
  createEffect(
    on(mode, (m, prev) => {
      if (prev === "edit" && m === "preview") {
        const el = root()
        if (!el) return
        const md = domToMarkdown(el)
        setInternalMarkdown(md)
      }
      // 切换到 edit 时清除选区状态
      if (m === "edit") {
        emitSelected(null)
        props.onLineSelectionEnd?.(null)
        clearSelectedHighlight()
        if (supportsHighlight) CSS.highlights.delete("md-commented")
      }
    }),
  )

  // edit 模式：监听 input，debounce 序列化
  createEffect(() => {
    const el = root()
    if (!el) return
    if (mode() !== "edit") return

    let debounceTimer: ReturnType<typeof setTimeout> | undefined

    const handleInput = () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        const md = domToMarkdown(el)
        setInternalMarkdown(md)
      }, 300)
    }

    el.addEventListener("input", handleInput)
    onCleanup(() => {
      el.removeEventListener("input", handleInput)
      if (debounceTimer) clearTimeout(debounceTimer)
    })
  })

  // ─── Highlight: CSS Custom Highlight API ───

  const supportsHighlight = typeof CSS !== "undefined" && "highlights" in CSS

  const clearSelectedHighlight = () => {
    if (supportsHighlight) CSS.highlights.delete("md-selected")
  }

  const applySelectedHighlight = () => {
    if (!supportsHighlight) return
    if (mode() !== "preview") return
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      CSS.highlights.delete("md-selected")
      return
    }
    const domRange = sel.getRangeAt(0)
    const el = root()
    if (!el || !el.contains(domRange.startContainer)) {
      CSS.highlights.delete("md-selected")
      return
    }
    CSS.highlights.set("md-selected", new Highlight(domRange))
  }

  const findAnchorNode = (el: HTMLElement, targetLine: number): HTMLElement | undefined => {
    const nodes = Array.from(el.querySelectorAll("[data-line-anchor]"))
      .map((n) => {
        if (!(n instanceof HTMLElement)) return undefined
        const line = parseInt(n.dataset.lineAnchor ?? "", 10)
        return Number.isNaN(line) ? undefined : { line, el: n }
      })
      .filter((x): x is { line: number; el: HTMLElement } => !!x)
      .sort((a, b) => a.line - b.line)

    const exact = nodes.find((n) => n.line === targetLine)
    if (exact) return exact.el

    let hit: HTMLElement | undefined
    for (const n of nodes) {
      if (n.line > targetLine) break
      hit = n.el
    }
    return hit
  }

  const nodeAtOffset = (block: HTMLElement, offset: number): { node: Text; offset: number } | undefined => {
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
    let remaining = offset
    let textNode = walker.nextNode() as Text | null
    while (textNode) {
      const len = textNode.length
      if (remaining <= len) return { node: textNode, offset: remaining }
      remaining -= len
      textNode = walker.nextNode() as Text | null
    }
    if (textNode === null) {
      const walker2 = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
      let last: Text | null = null
      let n = walker2.nextNode() as Text | null
      while (n) { last = n; n = walker2.nextNode() as Text | null }
      if (last) return { node: last, offset: last.length }
    }
    return undefined
  }

  const buildCommentRange = (
    el: HTMLElement,
    lineRange: LineRange & { startCol?: number; endCol?: number },
  ): Range | undefined => {
    const block = findAnchorNode(el, lineRange.start)
    if (!block) return undefined

    const range = document.createRange()

    if (lineRange.startCol !== undefined && lineRange.endCol !== undefined) {
      const sourcepos = block.dataset.sourcepos ?? ""
      const m = sourcepos.match(/^(\d+):(\d+)-/)
      const blockStartCol = m ? parseInt(m[2]!, 10) : 1

      const startOffset = Math.max(0, lineRange.startCol - blockStartCol)
      const endOffset = Math.max(startOffset, lineRange.endCol - blockStartCol)

      const startPos = nodeAtOffset(block, startOffset)
      const endPos = nodeAtOffset(block, endOffset)

      if (startPos && endPos) {
        range.setStart(startPos.node, startPos.offset)
        range.setEnd(endPos.node, endPos.offset)
        return range
      }
    }

    range.selectNodeContents(block)
    return range
  }

  const applyCommentedHighlights = () => {
    if (!supportsHighlight) return
    if (mode() !== "preview") return
    const el = root()
    if (!el) return

    const ranges = (props.commentedLines ?? [])
      .map((r) => buildCommentRange(el, r))
      .filter((r): r is Range => !!r)

    if (ranges.length > 0) {
      CSS.highlights.set("md-commented", new Highlight(...ranges))
    } else {
      CSS.highlights.delete("md-commented")
    }
  }

  createEffect(() => {
    html()
    props.commentedLines
    requestAnimationFrame(applyCommentedHighlights)
  })

  createEffect(() => {
    html()
    clearSelectedHighlight()
    if (supportsHighlight) CSS.highlights.delete("md-commented")
  })

  onCleanup(() => {
    clearSelectedHighlight()
    if (supportsHighlight) CSS.highlights.delete("md-commented")
  })

  onCleanup(() => props.surfaceRef?.(null))
  onCleanup(() => {
    if (copyTimer) clearTimeout(copyTimer)
  })

  // ─── Selection events (preview only) ───

  const emitSelected = (range: LineRange | null) => {
    if (range?.start === current?.start && range?.end === current?.end) return
    current = range
    props.onLineSelected?.(range)
  }

  const handleMouseDown = (event: MouseEvent) => {
    if (mode() !== "preview") return
    if (event.target instanceof Element && event.target.closest('[data-slot="markdown-file-toolbar"]')) {
      down = false
      return
    }
    const el = root()
    if (!el) return
    if (!(event.target instanceof Node)) return
    down = el.contains(event.target)
  }

  const handleMouseUp = () => {
    if (!down) return
    down = false
    if (mode() !== "preview") return
    const el = root()
    if (!el) return
    const range = rangeFromSelection(el)
    applySelectedHighlight()
    emitSelected(range)
    props.onLineSelectionEnd?.(range)
  }

  const handleSelectionChange = () => {
    if (!down) return
    if (mode() !== "preview") return
    const el = root()
    if (!el) return
    applySelectedHighlight()
    emitSelected(rangeFromSelection(el))
  }

  createEffect(() => {
    if (typeof window === "undefined") return
    document.addEventListener("selectionchange", handleSelectionChange)
    window.addEventListener("mousedown", handleMouseDown)
    window.addEventListener("mouseup", handleMouseUp)
    onCleanup(() => {
      document.removeEventListener("selectionchange", handleSelectionChange)
      window.removeEventListener("mousedown", handleMouseDown)
      window.removeEventListener("mouseup", handleMouseUp)
    })
  })

  onCleanup(() => {
    current = null
  })

  // ─── Render ───

  return (
    <div
      data-component="markdown"
      data-markdown-view="file"
      data-mode={mode()}
      classList={{
        ...(props.classList ?? {}),
        [props.class ?? ""]: !!props.class,
      }}
    >
      <div data-slot="markdown-file-toolbar">
        <div data-slot="markdown-file-copy" data-copied={copied() ? "true" : undefined}>
          <Tooltip value={copyLabel()} placement="left">
            <IconButton
              type="button"
              icon={copied() ? "check" : "copy"}
              variant="ghost"
              class="size-6 rounded-md"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={handleCopy}
              aria-label={copyLabel()}
            />
          </Tooltip>
        </div>
      </div>
      <div
        data-slot="markdown-content"
        contentEditable={mode() === "edit"}
        spellcheck={mode() === "edit"}
        ref={(el) => {
          setRoot(el)
        }}
      />
    </div>
  )
}

// ─── FileRenderer export ───

export const markdownRenderer: FileRenderer = {
  id: "markdown",
  match(meta) {
    const ext = meta.path.split(".").pop()?.toLowerCase()
    return ext === "md" || ext === "mdx" || ext === "markdown"
  },
  component: MarkdownFileView,
}
