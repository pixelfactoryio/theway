import { afterEach, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { historyField } from "@codemirror/commands"
import { EditorState } from "@codemirror/state"
import { EditorView, keymap } from "@codemirror/view"
import { linkMark, liveExtensions, softBreaks, tables } from "../src/dashboard/client/components/live-markdown"

const realDocument = (globalThis as { document?: unknown }).document

/** A page with no nonce meta: `bun test` has no `document`, and `liveExtensions` reads the page's nonce through it. */
function page(): void {
  ;(globalThis as { document?: unknown }).document = { querySelector: () => null }
}

afterEach(() => {
  ;(globalThis as { document?: unknown }).document = realDocument
})

/** A state of `doc` with the live set, read-only or editable, its selection at 0. */
function stateOf(doc: string, readOnly: boolean): EditorState {
  page()
  return EditorState.create({ doc, extensions: liveExtensions({ name: "spec.md", separator: "\n", readOnly }) })
}

const TABLE = "| a | b |\n|---|---|\n| 1 | 2 |"

test("the read-only set is read-only, not editable and keeps no history and no keys", () => {
  const state = stateOf("# Title\n", true)
  expect(state.readOnly).toBe(true)
  expect(state.facet(EditorView.editable)).toBe(false)
  expect(state.field(historyField, false)).toBeUndefined()
  expect(state.facet(keymap)).toEqual([])
  expect(stateOf("# Title\n", false).facet(keymap).length).toBeGreaterThan(0)
})

test("a read-only state draws a table on the selection's line; an editable one shows its source", () => {
  expect(stateOf(TABLE, true).field(tables).size).toBe(1)
  expect(stateOf(TABLE, false).field(tables).size).toBe(0)
})

test("a read-only state joins a paragraph's soft line breaks, not its hard breaks or code; an editable one has none", () => {
  const doc = "a\nb\n\n- c\n  d\n\n> e\n> f\n\ng  \nh\n\n```\nx\ny\n```"
  const joined: { from: number; to: number; text: string }[] = []
  stateOf(doc, true)
    .field(softBreaks)
    .between(0, doc.length, (from, to) => {
      joined.push({ from, to, text: doc.slice(from, to) })
    })
  expect(joined).toEqual([
    { from: 1, to: 2, text: "\n" },
    { from: 8, to: 11, text: "\n  " },
    { from: 17, to: 20, text: "\n> " },
  ])
  expect(stateOf(doc, false).field(softBreaks, false)).toBeUndefined()
})

test("a read-only link is an anchor to its target in a new tab; an editable one is a span", () => {
  expect(linkMark("https://x", true).spec).toEqual({
    tagName: "a",
    class: "cm-lp-link",
    attributes: { href: "https://x", target: "_blank", rel: "noopener noreferrer" },
  })
  expect(linkMark("https://x", false).spec).toEqual({ class: "cm-lp-link", attributes: { "data-href": "https://x" } })
})

test("the editable set is unchanged: editable, with history", () => {
  const state = stateOf("# Title\n", false)
  expect(state.readOnly).toBe(false)
  expect(state.facet(EditorView.editable)).toBe(true)
  expect(state.field(historyField, false)).toBeDefined()
})

test("the built stylesheet holds the document scale the live editor's theme reads from script", () => {
  const css = readFileSync(join(import.meta.dirname, "..", "src", "dashboard", "generated", "app.css.txt"), "utf-8")
  for (const level of ["h1", "h2", "h3"])
    for (const token of [`--text-doc-${level}:`, `--text-doc-${level}--line-height:`])
      expect([token, css.includes(token)]).toEqual([token, true])
})
