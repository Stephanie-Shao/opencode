// @ts-nocheck — turndown 和 turndown-plugin-gfm 无类型声明，跳过类型检查
import TurndownService from "turndown"
import { gfm } from "turndown-plugin-gfm"

let instance: InstanceType<typeof TurndownService> | null = null

function getTurndown() {
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
