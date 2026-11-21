import { afterEach, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { historyField } from "@codemirror/commands"
import { EditorState } from "@codemirror/state"
import { EditorView, keymap } from "@codemirror/view"
import {
  linkMark,
  liveExtensions,
  setFocused,
  setTitle,
  softBreaks,
  tables,
  titleHidden,
} from "../src/dashboard/client/components/live-markdown"

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

/** The soft breaks `state` joins: where each is, and the text it covers. */
function joined(state: EditorState): { from: number; to: number; text: string }[] {
  const out: { from: number; to: number; text: string }[] = []
  state.field(softBreaks).between(0, state.doc.length, (from, to) => {
    out.push({ from, to, text: state.doc.sliceString(from, to) })
  })
  return out
}

test("a state joins a paragraph's soft line breaks, not its hard breaks or code", () => {
  const doc = "a\nb\n\n- c\n  d\n\n> e\n> f\n\ng  \nh\n\n```\nx\ny\n```"
  const all = [
    { from: 1, to: 2, text: "\n" },
    { from: 8, to: 11, text: "\n  " },
    { from: 17, to: 20, text: "\n> " },
  ]
  expect(joined(stateOf(doc, true))).toEqual(all)
  // An editable document reads the same until the editor has the focus.
  expect(joined(stateOf(doc, false))).toEqual(all)
})

test("an editable state with the focus keeps the line breaks of the paragraph the selection is in", () => {
  const doc = "a\nb\n\n- c\n  d\n\n> e\n> f"
  const focused = stateOf(doc, false).update({ effects: setFocused.of(true) }).state
  // The selection is at 0: the first paragraph shows as written.
  expect(joined(focused).map((j) => j.from)).toEqual([8, 17])
  const inList = focused.update({ selection: { anchor: 10 } }).state
  expect(joined(inList).map((j) => j.from)).toEqual([1, 17])
  // Without the focus every paragraph flows again; a read-only state has no focus to follow.
  expect(joined(inList.update({ effects: setFocused.of(false) }).state).map((j) => j.from)).toEqual([1, 8, 17])
  expect(joined(stateOf(doc, true).update({ effects: setFocused.of(true) }).state).map((j) => j.from)).toEqual([
    1, 8, 17,
  ])
})

test("a read-only link is an anchor to its target in a new tab; an editable one is a span", () => {
  expect(linkMark("https://x", true).spec).toEqual({
    tagName: "a",
    class: "cm-lp-link",
    attributes: { href: "https://x", target: "_blank", rel: "noopener noreferrer" },
  })
  expect(linkMark("https://x", false).spec).toEqual({ class: "cm-lp-link", attributes: { "data-href": "https://x" } })
})

/** The ranges `state` hides as a restated title. */
function hiddenTitle(state: EditorState): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = []
  state.field(titleHidden).between(0, state.doc.length, (from, to) => {
    out.push({ from, to })
  })
  return out
}

test("a first h1 restating the page's title is hidden: always read-only, off its line while editing", () => {
  page()
  const doc = "# Spec: Add the acme importer\n\nBody"
  const of = (readOnly: boolean, title: string | null) =>
    EditorState.create({ doc, extensions: liveExtensions({ name: "spec.md", separator: "\n", readOnly, title }) })
  expect(hiddenTitle(of(true, "Add the acme importer"))).toEqual([{ from: 0, to: 29 }])
  expect(hiddenTitle(of(true, "Something else"))).toEqual([])
  expect(hiddenTitle(of(true, null))).toEqual([])
  // A title given later, as a page passes it.
  expect(hiddenTitle(of(true, null).update({ effects: setTitle.of("Add the acme importer") }).state)).toEqual([
    { from: 0, to: 29 },
  ])
  // Editing: hidden unfocused or with the selection off line 1; shown with the focus on line 1.
  const editing = of(false, "Add the acme importer")
  expect(hiddenTitle(editing)).toEqual([{ from: 0, to: 29 }])
  const onLine1 = editing.update({ effects: setFocused.of(true) }).state
  expect(hiddenTitle(onLine1)).toEqual([])
  expect(hiddenTitle(onLine1.update({ selection: { anchor: doc.length } }).state)).toEqual([{ from: 0, to: 29 }])
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
