/**
 * Rehype 插件：给块级元素注入 data-sourcepos 和 data-line-anchor 属性
 * 用于行选择映射和评论锚点定位
 */

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

// 所有需要记录 data-sourcepos 的块级元素
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

// 容器级元素：记录 data-sourcepos 用于列号计算，但不作为行锚点（不打 data-line-anchor）
// 避免高亮整个列表/表格而非单个条目
const containers = new Set(["ul", "ol", "table", "thead", "tbody"])

export function annotate() {
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
          // 容器级节点不打 data-line-anchor，避免高亮覆盖整个列表/表格
          if (!containers.has(node.tagName)) {
            node.properties["data-line-anchor"] = String(startLine)
          }
        }
      }

      const children = (node as { children?: unknown[] }).children
      if (!children) return
      for (const child of children) walk(child)
    }

    walk(tree)
  }
}
