import { Chunk } from "@codemirror/merge"
import { type EditorState, RangeSet, StateEffect, StateField, type Text } from "@codemirror/state"
import { EditorView, gutter, GutterMarker } from "@codemirror/view"

/** Gives a draft the text of its file as last loaded or saved, which its changed lines are counted against. */
export const setBase = StateEffect.define<string>()

/** The file's text as last loaded or saved (`setBase`), and the chunks the document differs from it by. */
type Changes = { base: Text | null; chunks: readonly Chunk[] }

const changes = StateField.define<Changes>({
  create: () => ({ base: null, chunks: [] }),
  update(value, tr) {
    let base = value.base
    for (const e of tr.effects) if (e.is(setBase)) base = tr.state.toText(e.value)
    if (base === null) return { base, chunks: [] }
    if (base !== value.base) return { base, chunks: Chunk.build(base, tr.state.doc) }
    if (!tr.docChanged) return value
    return { base, chunks: Chunk.updateB(value.chunks, base, tr.state.doc, tr.changes) }
  },
})

/** The base the draft is compared with, `null` before `setBase`. */
export function baseOf(state: EditorState): Text | null {
  return state.field(changes, false)?.base ?? null
}

/**
 * The lines of the draft that differ from its file: each chunk counts its larger side, in lines, so a changed line
 * counts once and a deleted line counts too.
 */
export function changedLineCount(state: EditorState): number {
  const value = state.field(changes, false)
  if (value === undefined || value.base === null) return 0
  const { base, chunks } = value
  const linesIn = (doc: Text, from: number, to: number): number =>
    to <= from ? 0 : doc.lineAt(Math.max(from, to - 1)).number - doc.lineAt(from).number + 1
  return chunks.reduce((n, c) => n + Math.max(linesIn(base, c.fromA, c.toA), linesIn(state.doc, c.fromB, c.toB)), 0)
}

/** A changed line's mark: a 2px bar in the gutter between the line numbers and the text. */
class ChangedMark extends GutterMarker {
  readonly deleted: boolean
  constructor(deleted: boolean) {
    super()
    this.deleted = deleted
    this.elementClass = deleted ? "cm-changed cm-changed-deleted" : "cm-changed"
  }
  override eq(other: GutterMarker): boolean {
    return other instanceof ChangedMark && other.deleted === this.deleted
  }
}

const CHANGED = new ChangedMark(false)
const DELETED = new ChangedMark(true)

function marks(state: EditorState): RangeSet<GutterMarker> {
  const value = state.field(changes, false)
  if (value === undefined || value.base === null) return RangeSet.empty
  const doc = state.doc
  const out: { from: number; mark: GutterMarker }[] = []
  for (const c of value.chunks) {
    if (c.toB <= c.fromB) {
      out.push({ from: doc.lineAt(Math.min(c.fromB, doc.length)).from, mark: DELETED })
      continue
    }
    const last = doc.lineAt(Math.max(c.fromB, c.toB - 1)).number
    for (let n = doc.lineAt(c.fromB).number; n <= last; n++) out.push({ from: doc.line(n).from, mark: CHANGED })
  }
  // One mark a line, in order: a deletion on a line already marked as changed adds nothing.
  const seen = new Set<number>()
  const ranges = out
    .sort((a, b) => a.from - b.from)
    .filter((m) => !seen.has(m.from) && seen.add(m.from))
    .map((m) => m.mark.range(m.from))
  return RangeSet.of(ranges)
}

const THEME = EditorView.baseTheme({
  ".cm-changed-gutter": { width: "6px" },
  ".cm-changed-gutter .cm-gutterElement.cm-changed": {
    backgroundImage: "linear-gradient(var(--info), var(--info))",
    backgroundSize: "2px 100%",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "1px 0",
  },
  ".cm-changed-gutter .cm-gutterElement.cm-changed-deleted": {
    backgroundImage: "linear-gradient(var(--destructive), var(--destructive))",
    backgroundSize: "6px 2px",
    backgroundPosition: "0 0",
  },
})

/**
 * The changed lines of an editable draft, after Zed's and VS Code's gutter: a bar beside each line that differs from
 * the file, a tick where lines were deleted. Nothing shows until the page gives the base with `setBase`.
 */
export const changedLines = [
  changes,
  gutter({ class: "cm-changed-gutter", markers: (view) => marks(view.state) }),
  THEME,
]
