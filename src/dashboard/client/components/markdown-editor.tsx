import { EditorSelection, type EditorState, Prec } from "@codemirror/state"
import { type Command, keymap } from "@codemirror/view"

import { linked, type Replace, wrapped } from "@/lib/change-edit"

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
const linkCommand: Command = (view) => {
  const state = view.state
  view.dispatch(
    state.changeByRange((range) => replaceAround(state, range.from, range.to, 0, linked)),
    { scrollIntoView: true, userEvent: "input" },
  )
  return true
}

const BOLD = wrapCommand("**")
const ITALIC = wrapCommand("_")
const CODE = wrapCommand("`")

/**
 * The formatting shortcuts of a Markdown draft, ahead of the default keymap: Mod-B, Mod-I, Mod-E and Mod-K; the key
 * event goes no further (Ctrl or Cmd and B in the source does not toggle the sidebar).
 */
export const formattingKeymap = Prec.highest(
  keymap.of(
    (
      [
        ["Mod-b", BOLD],
        ["Mod-i", ITALIC],
        ["Mod-e", CODE],
        ["Mod-k", linkCommand],
      ] as const
    ).map(([key, run]) => ({ key, run, preventDefault: true, stopPropagation: true })),
  ),
)
