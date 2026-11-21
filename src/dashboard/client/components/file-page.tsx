import { useState } from "react"

import { Button } from "@/components/ui/button"
import { errorCount } from "@/lib/files"
import type { AlertLine } from "@/lib/alert-lines"
import { StateNotice } from "@/shell/state"

/** How many lines an alert shows before "Show all". */
const FIRST = 3

/** A notice's error lines, `font-mono text-xs`, in the ink; a line with an action is a button that goes to its place. */
export function LineList({ lines }: { lines: readonly AlertLine[] }) {
  return (
    <ul className="flex flex-col gap-1">
      {lines.map((line, i) => (
        <li key={i} className="font-mono text-xs wrap-break-word text-foreground">
          {line.onClick !== null ? (
            <button
              type="button"
              onClick={line.onClick}
              className="rounded-sm text-left underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              {line.text}
            </button>
          ) : (
            line.text
          )}
        </li>
      ))}
    </ul>
  )
}

/**
 * A file page's error strip under its views: the error notice titled `N errors`, its first three lines, then "Show
 * all" (kept in the page only, not in the address).
 */
export function ErrorStrip({ lines }: { lines: readonly AlertLine[] }) {
  const [all, setAll] = useState(false)
  if (lines.length === 0) return null
  const shown = all ? lines : lines.slice(0, FIRST)
  return (
    <StateNotice tone="error" title={errorCount(lines.length)}>
      <LineList lines={shown} />
      {lines.length > FIRST ? (
        <Button variant="link" size="xs" className="mt-1 h-auto px-0" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : "Show all"}
        </Button>
      ) : null}
    </StateNotice>
  )
}

/**
 * An error notice of plain lines (the issues of a change that cannot be read), titled `title` (`N errors` by
 * default), each line in the code font; `place` as `StateNotice`'s.
 */
export function LinesAlert({
  lines,
  title,
  place,
  className,
}: {
  lines: readonly string[]
  title?: string
  place?: "strip" | "card" | "bare"
  className?: string
}) {
  if (lines.length === 0) return null
  return (
    <StateNotice tone="error" title={title ?? errorCount(lines.length)} place={place} className={className}>
      <LineList lines={lines.map((text) => ({ text, onClick: null }))} />
    </StateNotice>
  )
}

/** A row with nothing to show. */
export const Dash = () => <span className="text-muted-foreground">–</span>

/** The errors of a `404` on a file's route. */
export const UNKNOWN_FILE = ["unknown file", "unknown project"]

/** "Saved" after a save, as a status message, until the next edit. */
export function SavedStatus({ saved }: { saved: boolean }) {
  return saved ? (
    <span role="status" className="text-sm text-muted-foreground">
      Saved
    </span>
  ) : null
}
