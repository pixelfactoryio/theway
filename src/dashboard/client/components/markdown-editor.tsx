import { EditorSelection, type EditorState, Prec } from "@codemirror/state"
import { type Command, keymap } from "@codemirror/view"

import { type LineKind, lineEdits, linked, type Replace, wrapped } from "@/lib/change-edit"

/** A Replace computed on the text around the selection, then placed in the document. */
function replaceAround(
  state: EditorState,
  from: number,
  to: number,
  margin: number,
  f: (text: string, from: number, to: number) => Replace,
) {
  const start = Math.max(0, from - margin)
  const end = Math.min(state.doc.length, to + margin)
  const r = f(state.doc.sliceString(start, end), from - start, to - start)
  return {
    changes: { from: r.from + start, to: r.to + start, insert: r.insert },
    range: EditorSelection.range(r.anchor + start, r.head + start),
  }
}

/** Bold, Italic or Code: wraps each selection in `marker`, or unwraps it. */
const wrapCommand =
  (marker: string): Command =>
  (view) => {
    const state = view.state
    view.dispatch(
      state.changeByRange((range) =>
        replaceAround(state, range.from, range.to, marker.length, (t, f, e) => wrapped(t, f, e, marker)),
      ),
      { scrollIntoView: true, userEvent: "input" },
    )
    return true
  }

/** Link: `[text](https://)` around each selection, the link text selected. */
export const linkCommand: Command = (view) => {
  const state = view.state
  view.dispatch(
    state.changeByRange((range) => replaceAround(state, range.from, range.to, 0, linked)),
    { scrollIntoView: true, userEvent: "input" },
  )
  return true
}

export const boldCommand = wrapCommand("**")
export const italicCommand = wrapCommand("_")
export const codeCommand = wrapCommand("`")

/**
 * Heading, Bulleted list, Numbered list or Task list (`lineEdits`) on every line the selection touches; a selection that
 * ends at a line's start leaves that line out. A cursor at a line's new marker stands after it.
 */
export const lineCommand =
  (kind: LineKind): Command =>
  (view) => {
    const state = view.state
    const numbers = new Set<number>()
    for (const r of state.selection.ranges) {
      const first = state.doc.lineAt(r.from).number
      const end = state.doc.lineAt(r.to)
      const last = !r.empty && r.to === end.from && end.number > first ? end.number - 1 : end.number
      for (let n = first; n <= last; n++) numbers.add(n)
    }
    const lines = [...numbers].sort((a, b) => a - b).map((n) => state.doc.line(n))
    const changes = lineEdits(
      lines.map((l) => l.text),
      kind,
    ).flatMap((e, i) => {
      const line = lines[i]
      return e === null || line === undefined
        ? []
        : [{ from: line.from + e.from, to: line.from + e.to, insert: e.insert }]
    })
    if (changes.length === 0) return true
    const set = state.changes(changes)
    view.dispatch({ changes: set, selection: state.selection.map(set, 1), scrollIntoView: true, userEvent: "input" })
    return true
  }

/**
 * The formatting shortcuts of a Markdown draft, ahead of the default keymap: Mod-B, Mod-I, Mod-E and Mod-K; the key
 * event goes no further (Ctrl or Cmd and B in the source does not toggle the sidebar).
 */
export const formattingKeymap = Prec.highest(
  keymap.of(
    (
      [
        ["Mod-b", boldCommand],
        ["Mod-i", italicCommand],
        ["Mod-e", codeCommand],
        ["Mod-k", linkCommand],
      ] as const
    ).map(([key, run]) => ({ key, run, preventDefault: true, stopPropagation: true })),
  ),
)
