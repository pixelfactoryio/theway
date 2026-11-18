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
