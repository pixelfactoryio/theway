import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { markdownLanguage } from "@codemirror/lang-markdown"
import { CODE_BLOCK_STYLES, CODE_LANGUAGES } from "../src/dashboard/client/lib/code-languages"

test("the editors' styles are scoped to the code languages, never to Markdown itself", () => {
  const markdown = markdownLanguage.parser.parse("").type
  expect(CODE_BLOCK_STYLES.length).toBeGreaterThan(0)
  for (const style of CODE_BLOCK_STYLES) expect(style.scope?.(markdown)).toBe(false)
  for (const d of CODE_LANGUAGES) {
    const top = d.support?.language.parser.parse("").type
    expect([d.name, CODE_BLOCK_STYLES.filter((s) => top !== undefined && s.scope?.(top) === true).length]).toEqual([
      d.name,
      1,
    ])
  }
})

test("the reading widths and the code colours are tokens of the stylesheet, light and dark", () => {
  const css = readFileSync(
    join(import.meta.dirname, "..", "src", "dashboard", "client", "styles", "globals.css"),
    "utf-8",
  )
  expect(css).toContain("--read-width: 44.25rem;")
  expect(css).toContain("--read-wide: 64rem;")
  for (const token of ["--code-function", "--code-type", "--code-surface"])
    expect([token, css.split(`${token}: `).length - 1]).toEqual([token, 3])
  for (const c of ["keyword", "string", "constant", "function", "type", "property", "comment"])
    expect(css).toContain(`.code-${c} {\n  color: var(--code-${c});`)
})
