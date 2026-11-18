import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { markdownLanguage } from "@codemirror/lang-markdown"
import {
  CODE_BLOCK_STYLES,
  CODE_LANGUAGES,
  codeLabel,
  codeLanguage,
  codeTokens,
} from "../src/dashboard/client/lib/code-languages"

const name = (info: string): string | null => codeLanguage(info)?.name ?? null

test("a fence's info string picks a language of the list by name or alias, any case", () => {
  expect(name("go")).toBe("Go")
  expect(name("golang")).toBe("Go")
  expect(name("TS")).toBe("TypeScript")
  expect(name("tsx")).toBe("TSX")
  expect(name("js")).toBe("JavaScript")
  expect(name("jsx")).toBe("JSX")
  expect(name("json")).toBe("JSON")
  expect(name("yml")).toBe("YAML")
  expect(name("bash")).toBe("Shell")
  expect(name("sh")).toBe("Shell")
  expect(name("diff")).toBe("Diff")
  expect(name("patch")).toBe("Diff")
})

test("an info string with more than the language still finds it; an unknown or empty one finds none", () => {
  expect(name("go title=main.go")).toBe("Go")
  expect(name("ruby")).toBeNull()
  expect(name("text")).toBeNull()
  expect(name("")).toBeNull()
  expect(name("   ")).toBeNull()
})

test("a code block's label is its info string's first word, as written", () => {
  expect(codeLabel("go title=x")).toBe("go")
  expect(codeLabel(" TS ")).toBe("TS")
  expect(codeLabel("")).toBe("")
})

/** The classes of each run of `code`, with the run's text, its plain runs left out. */
const coloured = (code: string, info: string): string[] =>
  codeTokens(code, info)
    .flat()
    .filter((r) => r.classes !== "")
    .map((r) => `${r.classes}:${r.text}`)

test("Go is coloured: keywords, types, functions, numbers, booleans and comments", () => {
  const runs = coloured("// c\nfunc Spend(b *T) bool {\n\treturn b.n < 1 || true\n}\n", "go")
  expect(runs).toContain("code-comment:// c")
  expect(runs).toContain("code-keyword:func")
  expect(runs).toContain("code-type:T")
  expect(runs).toContain("code-function:Spend")
  expect(runs).toContain("code-type:bool")
  expect(runs).toContain("code-keyword:return")
  expect(runs).toContain("code-constant:1")
  expect(runs).toContain("code-constant:true")
})

test("YAML keys, strings and numbers; JSON properties; a diff's lines", () => {
  expect(coloured('a: "x"\nb: [1]', "yaml")).toEqual(["code-property:a", 'code-string:"x"', "code-property:b"])
  expect(coloured('{"k": 1}', "json")).toEqual(['code-property:"k"', "code-constant:1"])
  expect(coloured("@@ -1 +1 @@\n-a\n+b", "diff")).toEqual([
    "code-function:@@ -1 +1 @@",
    "code-keyword:-a",
    "code-property:+b",
  ])
})

test("code keeps every character and line, a final line break dropped; an unknown language is plain", () => {
  const code = "if x {\n\n  y()\n}\n"
  const lines = codeTokens(code, "go").map((runs) => runs.map((r) => r.text).join(""))
  expect(lines).toEqual(["if x {", "", "  y()", "}"])
  expect(codeTokens("a\n\nb", "ruby")).toEqual([[{ text: "a", classes: "" }], [], [{ text: "b", classes: "" }]])
})

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
