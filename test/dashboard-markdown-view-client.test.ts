import { afterEach, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { historyField } from "@codemirror/commands"
import { EditorState } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { liveExtensions, tables } from "../src/dashboard/client/components/live-markdown"

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

test("the read-only set is read-only, not editable and keeps no history", () => {
  const state = stateOf("# Title\n", true)
  expect(state.readOnly).toBe(true)
  expect(state.facet(EditorView.editable)).toBe(false)
  expect(state.field(historyField, false)).toBeUndefined()
})

test("a read-only state draws a table on the selection's line; an editable one shows its source", () => {
  expect(stateOf(TABLE, true).field(tables).size).toBe(1)
  expect(stateOf(TABLE, false).field(tables).size).toBe(0)
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
