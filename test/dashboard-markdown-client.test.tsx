import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { MarkdownView } from "../src/dashboard/client/components/markdown"

/** The task boxes of a rendered Markdown text: each one's item line and whether it can be ticked. */
function boxes(text: string): { line: string; enabled: boolean }[] {
  const html = renderToStaticMarkup(<MarkdownView text={text} onToggle={() => {}} />)
  return [...html.matchAll(/<li [^>]*data-line="(\d+)"><span ([^>]*)role="checkbox"/g)].map(([, line, attrs]) => ({
    line: line ?? "",
    enabled: !(attrs ?? "").includes("data-disabled"),
  }))
}

test("every box of a tight or a loose task list can be ticked and gives its item's line", () => {
  expect(boxes("- [ ] a\n- [x] b\n")).toEqual([
    { line: "1", enabled: true },
    { line: "2", enabled: true },
  ])
  expect(boxes("- [ ] a\n\n- [x] b\n")).toEqual([
    { line: "1", enabled: true },
    { line: "3", enabled: true },
  ])
})

test("a loose task item's box is taken out of its paragraph", () => {
  const html = renderToStaticMarkup(<MarkdownView text={"- [ ] a\n\n- [x] b\n"} onToggle={() => {}} />)
  expect(html).not.toMatch(/<p[^>]*>\s*<(input|span)/)
  expect(html).toContain('<p data-line="1"> a</p>')
})

test("a fenced block is a coloured code block with its language label; plain code keeps its text", () => {
  const html = renderToStaticMarkup(<MarkdownView text={"x\n\n```go\nreturn 1\n```\n\n```\na < b\n```\n"} />)
  expect(html).toContain(
    '<div class="doc-code" data-line="3"><span class="doc-code-label" aria-hidden="true">go</span>',
  )
  expect(html).toContain('<span class="code-keyword">return</span> <span class="code-constant">1</span>')
  expect(html).toContain('<pre role="group" tabindex="0" aria-label="Code"><code>a &lt; b</code></pre>')
})

test("a heading renders one level down and keeps its Markdown level, which sets its size", () => {
  const html = renderToStaticMarkup(<MarkdownView text={"# One\n\n## Two\n"} />)
  expect(html).toContain('<h2 data-line="1" data-level="1">One</h2>')
  expect(html).toContain('<h3 data-line="3" data-level="2">Two</h3>')
})

test("a table sits in a focusable scrolling wrapper that breaks out to the wider room", () => {
  const html = renderToStaticMarkup(<MarkdownView text={"| a | b |\n|---|--:|\n| 1 | 2 |\n"} />)
  expect(html).toMatch(
    /^<div class="[^"]*doc-prose[^"]*"><div class="doc-table" data-line="1" role="group" tabindex="0" aria-label="Table"><table>/,
  )
})
