import { afterEach, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { undo } from "@codemirror/commands"
import { insertNewlineContinueMarkup } from "@codemirror/lang-markdown"
import { EditorState, type StateEffect } from "@codemirror/state"
import { EditorView, keymap } from "@codemirror/view"
import {
  applyMode,
  draftState,
  isCode,
  isEditing,
  modeEffect,
  runEditing,
  toCode,
} from "../src/dashboard/client/components/code-view"
import { codeBlockField, liveExtensions, tables, toLive } from "../src/dashboard/client/components/live-markdown"
import { DraftStore } from "../src/dashboard/client/drafts/draft-store"
import { type LineKind, lineEdits } from "../src/dashboard/client/lib/change-edit"

const CLIENT = join(import.meta.dirname, "..", "src", "dashboard", "client")
const realDocument = (globalThis as { document?: unknown }).document

/** A page with no nonce meta: `bun test` has no `document`, and the sets read the page's nonce through it. */
function page(): void {
  ;(globalThis as { document?: unknown }).document = { querySelector: () => null }
}

afterEach(() => {
  ;(globalThis as { document?: unknown }).document = realDocument
})

/** `state` after `effects`. */
const after = (state: EditorState, ...effects: (StateEffect<unknown> | null)[]): EditorState =>
  state.update({ effects: effects.filter((e) => e !== null) }).state

/** `state` with `insert` typed at its end, as one undo step. */
const typed = (state: EditorState, insert: string): EditorState =>
  state.update({ changes: { from: state.doc.length, insert }, userEvent: "input" }).state

/** Every key binding of `state`. */
const bindings = (state: EditorState) => state.facet(keymap).flat()

/** Undoes on `state` as a command would; the state after, or `null` when the command refused. */
function undone(state: EditorState): EditorState | null {
  let out: EditorState | null = null
  const ran = undo({ state, dispatch: (tr) => (out = tr.state) })
  return ran ? out : null
}

test("a draft opens reading: read-only, with no history key and no Markdown key", () => {
  page()
  const state = draftState("# Spec\n", "markdown", "spec.md")
  expect([isCode(state), isEditing(state), state.readOnly]).toEqual([true, false, true])
  expect(bindings(state).some((b) => b.key === "Mod-z")).toBe(false)
  expect(bindings(state).some((b) => b.run === insertNewlineContinueMarkup)).toBe(false)
  // Search and caret keys stay.
  expect(bindings(state).some((b) => b.key === "Mod-f")).toBe(true)
  const editing = after(state, modeEffect(state, true))
  expect([isEditing(editing), editing.readOnly]).toEqual([true, false])
  for (const key of ["Mod-z", "Mod-Shift-z", "Mod-b", "Mod-e"])
    expect([key, bindings(editing).some((b) => b.key === key)]).toEqual([key, true])
  expect(bindings(editing).some((b) => b.run === insertNewlineContinueMarkup)).toBe(true)
  // A YAML draft has no formatting keys.
  const yaml = after(draftState("a: 1\n", "yaml", "w.yaml"), null)
  const yamlEditing = after(yaml, modeEffect(yaml, true))
  expect(bindings(yamlEditing).some((b) => b.key === "Mod-b")).toBe(false)
})

test("the live set's reading half is read-only and not editable, with no key at all; its editing half edits", () => {
  page()
  const code = draftState("a\n", "markdown", "spec.md")
  const live = after(code, ...toLive(code, "spec.md", null))
  expect([isCode(live), isEditing(live), live.readOnly, live.facet(EditorView.editable)]).toEqual([
    false,
    false,
    true,
    false,
  ])
  expect(live.facet(keymap)).toEqual([])
  const editing = after(live, modeEffect(live, true))
  expect([editing.readOnly, editing.facet(EditorView.editable)]).toEqual([false, true])
  expect(bindings(editing).some((b) => b.run === insertNewlineContinueMarkup)).toBe(true)
  // A field's set starts editing; the read view's set is unchanged and has no mode.
  const field = EditorState.create({ doc: "x", extensions: liveExtensions({ name: "Task 1", separator: "\n" }) })
  expect(isEditing(field)).toBe(true)
  const read = EditorState.create({
    doc: "x",
    extensions: liveExtensions({ name: "a", separator: "\n", readOnly: true }),
  })
  expect(modeEffect(read, true)).toBeNull()
})

test("Live → Source → Live and Read → Edit → Read keep the text, the selection, the mode and the undo history", () => {
  page()
  const first = draftState("# Spec\n", "markdown", "spec.md")
  const edited = typed(after(first, modeEffect(first, true)), "More\n").update({ selection: { anchor: 3 } }).state
  const live = after(edited, ...toLive(edited, "spec.md", null))
  const source = after(live, ...toCode(live, "markdown", "spec.md"))
  const back = after(source, ...toLive(source, "spec.md", null))
  for (const s of [live, source, back]) {
    expect([s.sliceDoc(), s.selection.main.head, isEditing(s)]).toEqual(["# Spec\nMore\n", 3, true])
  }
  expect([isCode(source), isCode(back)]).toEqual([true, false])
  expect(undone(back)?.sliceDoc()).toBe("# Spec\n")
  // Read, then Edit again: the edit is still undoable.
  const read = after(back, modeEffect(back, false))
  expect(read.sliceDoc()).toBe("# Spec\nMore\n")
  expect(undone(read)).toBeNull()
  const again = after(read, modeEffect(read, true))
  expect(undone(again)?.sliceDoc()).toBe("# Spec\n")
})

test("a switch of mode alone redraws the tables and code blocks: drawn while reading, source on the cursor while editing", () => {
  page()
  const doc = "| a | b |\n|---|---|\n| 1 | 2 |\n\n```js\nx\n```\n"
  const code = draftState(doc, "markdown", "spec.md")
  const reading = after(code, ...toLive(code, "spec.md", null))
  expect([reading.field(tables).size, reading.field(codeBlockField).size]).toEqual([1, 1])
  // The cursor is on the table's first line: editing shows its source; the code block stays drawn.
  const editing = after(reading, modeEffect(reading, true))
  expect([editing.field(tables).size, editing.field(codeBlockField).size]).toEqual([0, 1])
  const onCode = editing.update({ selection: { anchor: doc.indexOf("x") } }).state
  expect([onCode.field(tables).size, onCode.field(codeBlockField).size]).toEqual([1, 0])
  const readAgain = after(onCode, modeEffect(onCode, false))
  expect([readAgain.field(tables).size, readAgain.field(codeBlockField).size]).toEqual([1, 1])
})

test("a replaced state takes the page's mode; runEditing undoes on a reading draft and leaves it reading", () => {
  page()
  const store = new DraftStore(draftState("a: 1\n", "yaml", "w.yaml"))
  applyMode(store, true)
  store.dispatch({ changes: { from: 0, to: 4, insert: "a: 2" } })
  applyMode(store, false)
  expect(store.state.readOnly).toBe(true)
  // The history commands refuse a read-only state.
  expect(undo({ state: store.state, dispatch: store.dispatch })).toBe(false)
  expect(runEditing(store, undo)).toBe(true)
  expect([store.state.sliceDoc(), isEditing(store.state)]).toEqual(["a: 1\n", false])
  // Discard, Reload or Restore: a new state in its first mode, then the page's.
  store.replace(draftState("b: 1\n", "yaml", "w.yaml"))
  expect(isEditing(store.state)).toBe(false)
  applyMode(store, true)
  expect(isEditing(store.state)).toBe(true)
})

test("each file view applies the page's mode on mount, on a change and on a new state, after toLive or toCode", () => {
  const live = readFileSync(join(CLIENT, "components", "live-markdown.tsx"), "utf-8")
  expect(live).toMatch(/toLive\(v\.state[^]*applyMode\(store, editing\)[^]*\[store, name, editing, generation\]/)
  const code = readFileSync(join(CLIENT, "components", "code-view.tsx"), "utf-8")
  expect(code).toContain("useEffect(() => applyMode(draft, editing), [draft, editing, generation])")
  // A switch of a mounted code view closes its search panel first.
  expect(code).toMatch(/if \(store\.view !== null\) closeSearchPanel\(store\.view\)/)
  // The task Undo and the canvas's history go through runEditing.
  expect(readFileSync(join(CLIENT, "pages", "change", "active.tsx"), "utf-8")).toContain("runEditing(yaml.store, undo)")
  expect(readFileSync(join(CLIENT, "components", "toolbar.tsx"), "utf-8")).toContain("runEditing(store, command)")
})

/** The lines after a line command's edits. */
function run(lines: string[], kind: LineKind): string[] {
  return lineEdits(lines, kind).map((e, i) => {
    const line = lines[i] as string
    return e === null ? line : line.slice(0, e.from) + e.insert + line.slice(e.to)
  })
}

test("Heading sets `## `, replacing any heading prefix, and removes it when every line has it", () => {
  expect(run(["Title", "# One", "### Three", "  ## Two"], "heading")).toEqual([
    "## Title",
    "## One",
    "## Three",
    "  ## Two",
  ])
  expect(run(["## a", "  ## b"], "heading")).toEqual(["a", "  b"])
  expect(run([""], "heading")).toEqual(["## "])
})

test("the lists replace any list marker by their own, number from 1, and remove theirs when every line has it", () => {
  expect(run(["a", "* b", "1. c", "- [ ] d", "  + e"], "bullet")).toEqual(["- a", "- b", "- c", "- d", "  - e"])
  expect(run(["- a", "  - b"], "bullet")).toEqual(["a", "  b"])
  // A task is not a bullet.
  expect(run(["- a", "- [ ] b"], "bullet")).toEqual(["- a", "- b"])
  expect(run(["a", "- b", "7. c"], "numbered")).toEqual(["1. a", "2. b", "3. c"])
  expect(run(["1. a", "5. b"], "numbered")).toEqual(["a", "b"])
  expect(run(["a", "- b", "- [x] c"], "task")).toEqual(["- [ ] a", "- [ ] b", "- [x] c"])
  expect(run(["- [ ] a", "- [x] b"], "task")).toEqual(["a", "b"])
  // Blank lines are left out, unless every line is blank.
  expect(run(["a", "", "b"], "numbered")).toEqual(["1. a", "", "2. b"])
  expect(run([""], "bullet")).toEqual(["- "])
})

test("editing tints the surface --muted, and the fills on it take --background", () => {
  const code = readFileSync(join(CLIENT, "components", "code-view.tsx"), "utf-8")
  expect(code).toContain('"&.cm-editing, &.cm-editing .cm-gutters": { backgroundColor: "var(--muted)" }')
  expect(code).toContain('"&.cm-editing .cm-activeLine": { backgroundColor: "var(--background)" }')
  const live = readFileSync(join(CLIENT, "components", "live-markdown.tsx"), "utf-8")
  expect(live).toContain('"&.cm-editing": { backgroundColor: "var(--muted)" }')
  expect(live).toContain('"&.cm-editing .cm-lp-copy:hover": { backgroundColor: "var(--background)" }')
})
