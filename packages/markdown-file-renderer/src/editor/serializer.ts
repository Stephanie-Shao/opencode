import TurndownService from "turndown"
// @ts-ignore — turndown-plugin-gfm 没有类型定义
import { gfm } from "turndown-plugin-gfm"

let instance: TurndownService | null = null

function getTurndown(): TurndownService {
  if (instance) return instance

  instance = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    fence: "```",
    emDelimiter: "*",
    strongDelimiter: "**",
    linkStyle: "inlined",
  })

  instance.use(gfm)

  return instance
}

/**
 * 将 DOM 元素内容序列化为 Markdown 字符串
 */
export function domToMarkdown(element: HTMLElement): string {
  const td = getTurndown()
  return td.turndown(element.innerHTML)
}
