import { expect, test } from "bun:test"
import { markdownLanguage } from "@codemirror/lang-markdown"
import { Text } from "@codemirror/state"
import {
  activeLines,
  decorationPlan,
  type Plan,
  softBreaks,
  type Span,
  tableBlocks,
  taskToggle,
} from "../src/dashboard/client/lib/live-preview"

/** The plan of `source` with the lines `active` (from 1) active, within `ranges` when given. */
function plan(source: string, active: number[] = [], ranges?: Span[]): { doc: Text; plan: Plan } {
  const doc = Text.of(source.split("\n"))
  return { doc, plan: decorationPlan(doc, markdownLanguage.parser.parse(source), new Set(active), ranges) }
}

/** The text of each hidden range. */
const hidden = (doc: Text, p: Plan): string[] => p.hidden.map((h) => doc.sliceString(h.from, h.to))

/** The kind and text of each mark. */
const marks = (doc: Text, p: Plan): string[] => p.marks.map((m) => `${m.kind}:${doc.sliceString(m.from, m.to)}`)

/** The kind and line number of each line style. */
const lines = (doc: Text, p: Plan): string[] => p.lines.map((l) => `${l.kind}:${doc.lineAt(l.from).number}`)

test("an ATX heading's marks hide off its line and its line takes the level's style", () => {
  const { doc, plan: p } = plan("# Title #\n## Sub\n#### Low")
  expect(hidden(doc, p)).toEqual(["# ", " #", "## ", "#### "])
  expect(lines(doc, p)).toEqual(["h1:1", "h2:2", "h4:3"])
})

test("an active line shows its syntax and keeps its style", () => {
  const { doc, plan: p } = plan("# Title\n## Sub", [1])
  expect(hidden(doc, p)).toEqual(["## "])
  expect(lines(doc, p)).toEqual(["h1:1", "h2:2"])
})

test("strong, emphasis, strikethrough and inline code hide their markers and style their range", () => {
  const { doc, plan: p } = plan("**b** _e_ ~~s~~ `c`")
  expect(marks(doc, p)).toEqual(["strong:**b**", "em:_e_", "strike:~~s~~", "code:`c`"])
  expect(hidden(doc, p)).toEqual(["**", "**", "_", "_", "~~", "~~", "`", "`"])
  expect(plan("**b** _e_ ~~s~~ `c`", [1]).plan.hidden).toEqual([])
})

test("an element spanning lines shows its markers when any of its lines is active", () => {
  const { plan: p } = plan("**one\ntwo**", [2])
  expect(p.hidden).toEqual([])
  expect(p.marks.map((m) => m.kind)).toEqual(["strong"])
})

test("a link to an http, https or mailto target hides its brackets and URL and is styled with its href", () => {
  const { doc, plan: p } = plan('[text](https://example.com "Title") [mail](mailto:a@b.c)')
  expect(hidden(doc, p)).toEqual(["[", '](https://example.com "Title")', "[", "](mailto:a@b.c)"])
  expect(p.marks).toEqual([
    { from: 1, to: 5, kind: "link", href: "https://example.com" },
    { from: 37, to: 41, kind: "link", href: "mailto:a@b.c" },
  ])
})

test("a link to another target renders as plain text, and an active line shows the source", () => {
  const { doc, plan: p } = plan("[spec](spec.md)")
  expect(hidden(doc, p)).toEqual(["[", "](spec.md)"])
  expect(p.marks).toEqual([])
  expect(plan("[a](https://x.y)", [1]).plan.hidden).toEqual([])
})

test("a hidden range never holds a line break", () => {
  const { doc, plan: p } = plan('[text](https://x.y\n"Title")')
  expect(hidden(doc, p)).toEqual(["[", "](https://x.y", '"Title")'])
})

test("bullet markers become bullets off active lines; ordered numbers stay muted text", () => {
  const { doc, plan: p } = plan("- a\n* b\n+ c\n1. one", [2])
  expect(p.widgets).toEqual([
    { kind: "bullet", from: 0, to: 2 },
    { kind: "bullet", from: 8, to: 10 },
  ])
  expect(marks(doc, p)).toEqual(["number:1."])
})

test("a task item becomes a checkbox with its state, label and box position; a done task's text is muted", () => {
  const source = "- [ ] write it\n- [x] ship it"
  const { doc, plan: p } = plan(source)
  expect(p.widgets).toEqual([
    { kind: "checkbox", from: 0, to: 6, checked: false, toggle: 3, label: "To do: write it" },
    { kind: "checkbox", from: 15, to: 21, checked: true, toggle: 18, label: "Done: ship it" },
  ])
  expect(marks(doc, p)).toEqual(["done: ship it"])
  expect(plan(source, [1]).plan.widgets.map((w) => w.from)).toEqual([15])
})

test("toggling a task box changes the one character between its brackets", () => {
  const doc = Text.of(["- [ ] a", "- [x] b", "- [X] c", "x"])
  expect(taskToggle(doc, 3)).toEqual({ from: 3, to: 4, insert: "x" })
  expect(taskToggle(doc, 11)).toEqual({ from: 11, to: 12, insert: " " })
  expect(taskToggle(doc, 19)).toEqual({ from: 19, to: 20, insert: " " })
  expect(taskToggle(doc, 2)).toBeNull()
  expect(taskToggle(doc, 0)).toBeNull()
})

test("a blockquote hides its marks off active lines and styles every line", () => {
  const { doc, plan: p } = plan("> one\n> two", [2])
  expect(hidden(doc, p)).toEqual(["> "])
  expect(lines(doc, p)).toEqual(["quote:1", "quote:2"])
})

test("a thematic break becomes a rule off its line", () => {
  const { plan: p } = plan("a\n\n---\n\nb")
  expect(p.widgets).toEqual([{ kind: "hr", from: 3, to: 6 }])
  expect(plan("a\n\n---\n\nb", [3]).plan.widgets).toEqual([])
})

test("a fenced code block styles its lines, keeps its fences visible and renders nothing inside", () => {
  const { doc, plan: p } = plan("```ts\n**not bold**\n```")
  expect(lines(doc, p)).toEqual(["code:1", "code:2", "code:3", "code-start:1", "code-end:3", "fence:1", "fence:3"])
  expect(p.hidden).toEqual([])
  expect(marks(doc, p)).toEqual(["label:ts"])
})

test("a fence's info string is its label off its line, and shows as written on it", () => {
  const { doc, plan: p } = plan("```go title=x\na\n```")
  expect(marks(doc, p)).toEqual(["label:go title=x"])
  expect(plan("```go\na\n```", [1]).plan.marks).toEqual([])
  expect(plan("```\na\n```").plan.marks).toEqual([])
})

test("an indented code block's first and last lines start and end its block", () => {
  const { doc, plan: p } = plan("a\n\n    one\n    two\n\nb")
  expect(lines(doc, p)).toEqual(["code:3", "code:4", "code-start:3", "code-end:4", "blank:2", "blank:5"])
})

test("a blank line between blocks is styled as one, active or not, but a blank line of code is code", () => {
  const source = "a\n\n  \n# H\n\n```\nx\n\ny\n```"
  for (const active of [[], [2, 8]]) {
    const { doc, plan: p } = plan(source, active)
    expect(lines(doc, p).filter((l) => l.startsWith("blank:"))).toEqual(["blank:2", "blank:3", "blank:5"])
    expect(lines(doc, p)).toContain("code:8")
  }
})

test("a table inside fenced code is not drawn", () => {
  const source = "```md\n| a | b |\n|---|---|\n| 1 | 2 |\n```"
  const doc = Text.of(source.split("\n"))
  expect(tableBlocks(doc, markdownLanguage.parser.parse(source), new Set())).toEqual([])
})

test("tables and raw HTML stay as source", () => {
  const { doc, plan: p } = plan("| **a** | b |\n|---|---|\n| 1 | 2 |\n\n<div>**x**</div>")
  expect(lines(doc, p)).toEqual(["table:1", "table:2", "table:3", "blank:4"])
  expect(p.hidden).toEqual([])
  expect(p.marks).toEqual([])
  expect(p.widgets).toEqual([])
})

test("only the given ranges are decorated", () => {
  const { doc, plan: p } = plan("# One\n\n# Two", [], [{ from: 7, to: 12 }])
  expect(lines(doc, p)).toEqual(["h1:3"])
  expect(hidden(doc, p)).toEqual(["# "])
})

test("the active lines are the selection's lines while focused, none unfocused", () => {
  const doc = Text.of(["a", "b", "c", "d"])
  expect([...activeLines(doc, [{ from: 2, to: 4 }], true)]).toEqual([2, 3])
  expect([...activeLines(doc, [{ from: 0, to: 0 }], true)]).toEqual([1])
  expect([...activeLines(doc, [{ from: 2, to: 4 }], false)]).toEqual([])
})

test("a table's cells split where GFM splits them: on each pipe not escaped, in a code span too", () => {
  const source = "| a | `b|c` | d \\| e |\n|:--|:-:|--:|---|\n| x | | z |\nq | r"
  const doc = Text.of(source.split("\n"))
  const [block] = tableBlocks(doc, markdownLanguage.parser.parse(source), new Set())
  expect(block?.header).toEqual(["a", "`b", "c`", "d | e"])
  expect(block?.align).toEqual(["left", "center", "right", null])
  expect(block?.rows).toEqual([
    ["x", "", "z"],
    ["q", "r"],
  ])
})

test("a table no active line touches is drawn, over its whole lines, with its alignment", () => {
  const source = "Intro\n\n| H1 | H2 |\n|:---|---:|\n| a | b |\n| c |\n\nAfter"
  const doc = Text.of(source.split("\n"))
  const tree = markdownLanguage.parser.parse(source)
  const [block] = tableBlocks(doc, tree, new Set())
  expect(block).toEqual({
    from: doc.line(3).from,
    to: doc.line(6).to,
    header: ["H1", "H2"],
    align: ["left", "right"],
    rows: [["a", "b"], ["c"]],
  })
  // The cursor on any of its lines shows its source.
  expect(tableBlocks(doc, tree, new Set([5]))).toEqual([])
  expect(tableBlocks(doc, tree, new Set([1, 8]))).toHaveLength(1)
})

/** The line number, depth and hanging flag of each list item line. */
const items = (doc: Text, p: Plan): string[] =>
  p.items.map((i) => `${doc.lineAt(i.from).number}:${i.depth}${i.first ? ":first" : ""}`)

test("list item lines are indented by depth, the marker hanging on its line, the blanks before it hidden off active lines", () => {
  const source = "- top\n  - nested\n    more text\n1. one\n\n> - quoted"
  const { doc, plan: p } = plan(source)
  expect(items(doc, p)).toEqual(["1:1:first", "2:2:first", "3:2", "4:1:first", "6:1:first"])
  expect(hidden(doc, p)).toEqual(["  ", "    ", "> "])
  expect(hidden(doc, plan(source, [2]).plan)).toEqual(["    ", "> "])
})

/** The text each soft break of `source` covers, the paragraphs of the `active` lines left as written. */
function joins(source: string, active: number[] = []): string[] {
  const doc = Text.of(source.split("\n"))
  return softBreaks(doc, markdownLanguage.parser.parse(source), new Set(active)).map((b) =>
    doc.sliceString(b.from, b.to),
  )
}

test("a paragraph an active line touches keeps every line break; the others are joined", () => {
  const source = "a\nb\nc\n\nd\ne"
  expect(joins(source)).toEqual(["\n", "\n", "\n"])
  // Line 2 is in the first paragraph, on none of its ends.
  expect(joins(source, [2])).toEqual(["\n"])
  expect(joins(source, [6])).toEqual(["\n", "\n"])
  expect(joins(source, [4])).toEqual(["\n", "\n", "\n"])
})

test("a soft break covers the next line's indentation and quote marks, nested and lazy lines included", () => {
  expect(joins("> > a\n> > b\n> c")).toEqual(["\n> > ", "\n> "])
  expect(joins("- [ ] a task\n  that wraps")).toEqual(["\n  "])
})

test("a backslash or two trailing spaces keep their line break; a heading, a table and HTML are not joined", () => {
  expect(joins("a\\\nb  \nc")).toEqual([])
  expect(joins("# h\ntext\n\n| a |\n|---|\n| 1 |\n\n<div>\nx\n</div>")).toEqual([])
})
