/** The lines of a file's error alert and Problems tab. Pure: no React, no DOM. */

/** One line of an error alert: its text, and what clicking it does (`null`: plain text). */
export type AlertLine = { text: string; onClick: (() => void) | null }

/**
 * The alert lines of a file's errors. An error on a line that `at` goes to reads `line N · text` and goes there on
 * click; any other error reads its text, its click `other(error)` when `other` is given (`null`: plain text), else
 * plain text.
 */
export function alertLines<E extends { text: string; line: number | null }>(
  errors: readonly E[],
  at: ((line: number) => (() => void) | null) | null,
  other?: (error: E) => (() => void) | null,
): AlertLine[] {
  return errors.map((error) => {
    const go = error.line !== null && at !== null ? at(error.line) : null
    if (go !== null) return { text: `line ${error.line} · ${error.text}`, onClick: go }
    return { text: error.text, onClick: other !== undefined ? other(error) : null }
  })
}
