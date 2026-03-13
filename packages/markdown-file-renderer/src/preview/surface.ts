/**
 * CommentSurface 实现
 * 提供 anchor(range) 方法：根据 LineRange 定位到 DOM 元素
 * 用于评论气泡的垂直定位
 */
import type { CommentSurface, LineRange } from "@opencode-ai/ui/context/file-renderer"

type AnchorEntry = {
  line: number
  el: HTMLElement
}

/**
 * 索引容器内所有 [data-line-anchor] 元素
 * 返回按行号排序的数组
 */
export function indexAnchors(root: HTMLElement): AnchorEntry[] {
  return Array.from(root.querySelectorAll("[data-line-anchor]"))
    .map((el) => {
      if (!(el instanceof HTMLElement)) return
      const line = parseInt(el.dataset.lineAnchor ?? "", 10)
      if (Number.isNaN(line)) return
      return { line, el }
    })
    .filter((x): x is AnchorEntry => !!x)
    .sort((a, b) => a.line - b.line)
}

/**
 * 创建 CommentSurface 实例
 */
export function createSurface(anchors: AnchorEntry[]): CommentSurface {
  return {
    anchor(range: LineRange): HTMLElement | undefined {
      const line = Math.max(range.start, range.end)

      // 二分查找：找到 line <= targetLine 的最近锚点
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
        } else {
          hi = mid - 1
        }
      }

      return hit
    },
  }
}
