/**
 * 行选择逻辑：从 DOM 选区映射到 LineRange
 *
 * 保持与 opencode 的 LineRange 接口兼容:
 *   { start: number, end: number }
 */
import type { LineRange } from "@opencode-ai/ui/context/file-renderer"

/**
 * 解析 data-sourcepos 属性值
 * 格式: "startLine:startCol-endLine:endCol"
 */
function parseSourcepos(value: string | undefined): {
  startLine: number
  startCol: number
  endLine: number
  endCol: number
} | undefined {
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

/**
 * 从 DOM 节点找到最近的包含 data-sourcepos 的叶子级祖先（跳过 ul/ol 容器），提取行号和列号
 */
function lineFromNode(node: Node | null): { start: number; end: number; startCol: number; endCol: number } | undefined {
  if (!node) return
  const el = node instanceof HTMLElement ? node : node.parentElement
  if (!el) return

  // 向上遍历，找最近的有 data-sourcepos 且非容器级的祖先
  let current: HTMLElement | null = el
  while (current) {
    if (current.dataset.sourcepos && !CONTAINER_TAGS.has(current.tagName)) {
      const pos = parseSourcepos(current.dataset.sourcepos)
      if (pos) return { start: pos.startLine, end: pos.endLine, startCol: pos.startCol, endCol: pos.endCol }
    }
    current = current.parentElement
  }
  return undefined
}

// 容器级标签：它们的 data-sourcepos 跨越整个列表，不适合作为列号计算的基准
const CONTAINER_TAGS = new Set(["UL", "OL"])

/**
 * 从文本节点找到最近的叶子级块祖先（data-sourcepos），
 * 计算文本在该块内的字符偏移，转换成 Markdown 源文件中的列号（1-based）。
 */
function colFromOffset(textNode: Node, offset: number): number {
  const el = textNode instanceof HTMLElement ? textNode : textNode.parentElement
  if (!el) return offset + 1

  // 找最近的有 data-sourcepos 的祖先，跳过容器级节点（ul/ol）
  let current: HTMLElement | null = el
  let block: HTMLElement | null = null
  while (current) {
    if (current.dataset.sourcepos && !CONTAINER_TAGS.has(current.tagName)) {
      block = current
      break
    }
    current = current.parentElement
  }

  if (!block) return offset + 1

  const pos = block.dataset.sourcepos?.match(/^(\d+):(\d+)-(\d+):(\d+)$/)
  if (!pos) return offset + 1
  const blockStartCol = parseInt(pos[2]!, 10)

  // 遍历块内所有文本节点，累计直到 textNode
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
  let chars = 0
  let node: Node | null = walker.nextNode()
  while (node) {
    if (node === textNode) {
      chars += offset
      break
    }
    chars += node.textContent?.length ?? 0
    node = walker.nextNode()
  }

  // blockStartCol 是 1-based
  return blockStartCol + chars
}

/**
 * 从浏览器选区计算 LineRange（含字符级列信息）
 * start/end 是块的起始行号（Markdown 源），startCol/endCol 是精确的字符级列号（1-based）
 */
export function rangeFromSelection(root: HTMLElement): LineRange & { startCol?: number; endCol?: number } | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  if (sel.isCollapsed) return null

  const range = sel.getRangeAt(0)
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null

  const startBlock = lineFromNode(range.startContainer)
  const endBlock = lineFromNode(range.endContainer)
  if (!startBlock && !endBlock) return null

  // 处理三连击：endContainer 可能在下一个块的 offset 0
  let effectiveEndBlock = endBlock
  if (endBlock && startBlock && endBlock.start !== startBlock.start && range.endOffset === 0) {
    effectiveEndBlock = startBlock
  }

  const blockA = startBlock?.start ?? effectiveEndBlock?.start
  const blockB = effectiveEndBlock?.end ?? startBlock?.end ?? blockA
  if (!blockA || !blockB) return null

  const startLine = Math.min(blockA, blockB)
  const endLine = Math.max(blockA, blockB)
  const result: LineRange & { startCol?: number; endCol?: number } = { start: startLine, end: endLine }

  // 精确列号：从文本节点偏移量计算
  if (startBlock) {
    result.startCol = colFromOffset(range.startContainer, range.startOffset)
  }
  if (effectiveEndBlock) {
    result.endCol = colFromOffset(range.endContainer, range.endOffset)
  }

  return result
}

/**
 * 获取选中的纯文本内容
 */
export function getSelectionText(): string {
  const sel = window.getSelection()
  return sel?.toString() ?? ""
}
