declare module "turndown" {
  interface Options {
    headingStyle?: "setext" | "atx"
    hr?: string
    bulletListMarker?: "-" | "+" | "*"
    codeBlockStyle?: "indented" | "fenced"
    fence?: "```" | "~~~"
    emDelimiter?: "_" | "*"
    strongDelimiter?: "__" | "**"
    linkStyle?: "inlined" | "referenced"
  }
  class TurndownService {
    constructor(options?: Options)
    use(plugin: (service: TurndownService) => void): this
    turndown(input: string | HTMLElement): string
  }
  export = TurndownService
}

declare module "turndown-plugin-gfm" {
  import TurndownService from "turndown"
  export function gfm(service: TurndownService): void
  export function tables(service: TurndownService): void
  export function strikethrough(service: TurndownService): void
}
