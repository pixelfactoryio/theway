/** Editing a change on its page: row ids, Markdown checkboxes and formatting. Pure: no React, no DOM. */

/** The ids of `count` rows after a change of the draft that is not a list action: the first min(old, new) kept by position. */
export function keptIds(old: readonly string[], count: number, make: () => string): string[] {
  return Array.from({ length: count }, (_, i) => (i < old.length ? (old[i] as string) : make()))
}

/** A task row's accessible name: `Task N: <text>`, or `Task N, done: <text>`. */
export const taskName = (n: number, text: string, done: boolean): string => `Task ${n}${done ? ", done" : ""}: ${text}`

/** A description as one line: each run of line breaks turned into one space. */
export const oneLine = (text: string): string => text.replace(/[\r\n]+/g, " ")

/** The longest lead a task shows before its detail. */
const LEAD_MAX = 160

/**
 * A task's text cut for reading: its lead and the rest as its detail. The lead ends at the first ": " or "; " within its
 * first 160 characters, else at the end of its first sentence, else before the first " (" or ", " (whichever comes
 * first, the lead at least 12 characters); breaks inside backtick code spans do not count. A text with none is all
 * lead. Display only: the text itself is unchanged.
 */
export function splitTask(text: string): { lead: string; detail: string } {
  const flat = text.trim()
  /** The first index within the lead's reach where `test` holds outside a backtick code span. */
  const find = (test: (c: string, next: string) => boolean): number => {
    let code = false
    for (let i = 0; i < Math.min(flat.length - 1, LEAD_MAX + 1); i++) {
      const c = flat[i] as string
      if (c === "`") code = !code
      else if (!code && i > 0 && test(c, flat[i + 1] as string)) return i
    }
    return -1
  }
  const space = (n: string) => n === " " || n === "\n"
  const clause = find((c, n) => (c === ":" || c === ";") && space(n))
  if (clause !== -1) return { lead: flat.slice(0, clause), detail: flat.slice(clause + 1).trim() }
  const sentence = find((c, n) => (c === "." || c === "!" || c === "?") && space(n))
  if (sentence !== -1) return { lead: flat.slice(0, sentence + 1), detail: flat.slice(sentence + 1).trim() }
  const aside = find((c, n) => c === " " && n === "(")
  const comma = find((c, n) => c === "," && space(n))
  const at = [aside, comma].filter((i) => i >= 12).sort((a, b) => a - b)[0]
  if (at === aside && at !== undefined) return { lead: flat.slice(0, at), detail: flat.slice(at + 1) }
  if (at !== undefined) return { lead: flat.slice(0, at), detail: flat.slice(at + 1).trim() }
  return { lead: flat, detail: "" }
}

/** A selection's replacement: the range it replaces, the text put there, and the selection after. */
export type Replace = { from: number; to: number; insert: string; anchor: number; head: number }

/**
 * Bold, Italic or Code on the text `doc` selected from `from` to `to`: an empty selection gets the pair with the cursor
 * between; a selection already wrapped in `marker`, inside it or around it, loses the markers; any other is wrapped.
 */
export function wrapped(doc: string, from: number, to: number, marker: string): Replace {
  const m = marker.length
  const selected = doc.slice(from, to)
  if (from === to) return { from, to, insert: marker + marker, anchor: from + m, head: from + m }
  if (selected.length >= 2 * m && selected.startsWith(marker) && selected.endsWith(marker)) {
    const inner = selected.slice(m, -m)
    return { from, to, insert: inner, anchor: from, head: from + inner.length }
  }
  if (doc.slice(from - m, from) === marker && doc.slice(to, to + m) === marker) {
    return { from: from - m, to: to + m, insert: selected, anchor: from - m, head: to - m }
  }
  return { from, to, insert: marker + selected + marker, anchor: from + m, head: to + m }
}

/** Link on the text selected from `from` to `to`: `[text](https://)`, the link text selected; `[](https://)` with the cursor in the brackets. */
export function linked(doc: string, from: number, to: number): Replace {
  const selected = doc.slice(from, to)
  return { from, to, insert: `[${selected}](https://)`, anchor: from + 1, head: from + 1 + selected.length }
}

/** A line command of the editing strip: a heading (`## `), or a list of a kind. */
export type LineKind = "heading" | "bullet" | "numbered" | "task"

/** A line's edit: the range of the line it replaces (from its start) and the text put there. */
export type LineEdit = { from: number; to: number; insert: string }

/** Any list marker a line may start with: a task's first, as it starts like a bullet. */
const LIST_MARKER = /^(?:- \[[ xX]\] |[-*+] |\d+\. )/

/** Whether `rest` (a line after its indentation) starts with the marker of `kind`. */
function hasMarker(rest: string, kind: Exclude<LineKind, "heading">): boolean {
  if (kind === "task") return /^- \[[ xX]\] /.test(rest)
  if (kind === "numbered") return /^\d+\. /.test(rest)
  return rest.startsWith("- ") && !/^- \[[ xX]\] /.test(rest)
}

/**
 * The edits of a line command on the lines `lines` (the ones the selection touches), one per line, `null` for a line
 * left as it is; each keeps its line's leading indentation. Blank lines are left out unless every line is blank.
 *
 * - Heading: when every line starts with `## `, it is removed; otherwise any `#{1,6} ` prefix is replaced by `## `.
 * - Bulleted, Numbered or Task list: when every line has the kind's marker (`- ` but not a task's; `N. `; `- [ ] ` or
 *   `- [x] `), the markers are removed; otherwise each line's list marker (`- `, `* `, `+ `, `N. `, `- [ ] `, `- [x] `)
 *   is replaced by the kind's, a line that has it already keeping it, and numbered lines are numbered from 1 in order.
 */
export function lineEdits(lines: readonly string[], kind: LineKind): (LineEdit | null)[] {
  const blank = (line: string) => line.trim() === ""
  const touched = lines.every(blank) ? lines.map(() => true) : lines.map((l) => !blank(l))
  const parts = lines.map((line) => {
    const indent = /^\s*/.exec(line)?.[0].length ?? 0
    return { indent, rest: line.slice(indent) }
  })
  const own = parts.filter((_, i) => touched[i])
  if (kind === "heading") {
    const remove = own.every((p) => p.rest.startsWith("## "))
    return parts.map(({ indent, rest }, i) => {
      if (!touched[i]) return null
      if (remove) return { from: indent, to: indent + 3, insert: "" }
      const prefix = /^#{1,6} /.exec(rest)?.[0] ?? ""
      return prefix === "## " ? null : { from: indent, to: indent + prefix.length, insert: "## " }
    })
  }
  const remove = own.every((p) => hasMarker(p.rest, kind))
  let n = 0
  return parts.map(({ indent, rest }, i) => {
    if (!touched[i]) return null
    const marker = LIST_MARKER.exec(rest)?.[0] ?? ""
    if (remove) return { from: indent, to: indent + marker.length, insert: "" }
    n += 1
    if (kind !== "numbered" && hasMarker(rest, kind)) return null
    const insert = kind === "numbered" ? `${n}. ` : kind === "task" ? "- [ ] " : "- "
    return marker === insert ? null : { from: indent, to: indent + marker.length, insert }
  })
}
