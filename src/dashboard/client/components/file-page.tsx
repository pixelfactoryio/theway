import { CircleAlertIcon } from "lucide-react"
import { useState } from "react"

import { EmptyNote } from "@/components/empty-note"
import { Alert, AlertDescription, AlertTitle } from "@/components/reui/alert"
import { StatusMark } from "@/components/status"
import { Button } from "@/components/ui/button"
import { errorCount, type PromptInputRow, quoted } from "@/lib/files"
import type { AlertLine } from "@/lib/alert-lines"
import { keyLabel } from "@/lib/workflow"

/** A full-width strip under the tabs: no rounding, the bottom border only. */
export const STRIP = "shrink-0 rounded-none border-x-0 border-t-0"

/** How many lines an alert shows before "Show all". */
const FIRST = 3

/**
 * A list of error lines. `alert`: an alert's lines, `font-mono text-xs`, a line with an action a button. `panel`: the
 * Problems tab, each line a full-width row with its mark, a button when it has an action; a note when there is none.
 */
export function LineList({ lines, variant }: { lines: readonly AlertLine[]; variant: "alert" | "panel" }) {
  if (variant === "panel") {
    if (lines.length === 0) return <EmptyNote>No problem found.</EmptyNote>
    return (
      <ul className="flex flex-col py-1">
        {lines.map((line, i) => (
          <li key={i}>
            {line.onClick !== null ? (
              <button
                type="button"
                onClick={line.onClick}
                className="flex w-full gap-2 px-4 py-2 text-left text-sm transition-colors outline-none hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                <StatusMark status="invalid" className="mt-2" />
                <span className="min-w-0 flex-1">{line.text}</span>
              </button>
            ) : (
              <div className="flex gap-2 px-4 py-2 text-sm">
                <StatusMark status="invalid" className="mt-2" />
                <span className="min-w-0 flex-1">{line.text}</span>
              </div>
            )}
          </li>
        ))}
      </ul>
    )
  }
  return (
    <ul className="flex flex-col gap-1">
      {lines.map((line, i) => (
        <li key={i} className="font-mono text-xs">
          {line.onClick !== null ? (
            <button
              type="button"
              onClick={line.onClick}
              className="text-left text-foreground underline-offset-4 hover:underline"
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
 * A file page's error strip under its tabs: a destructive alert titled `N errors`, its first three lines, then "Show
 * all" (kept in the page only, not in the address).
 */
export function ErrorStrip({ lines }: { lines: readonly AlertLine[] }) {
  const [all, setAll] = useState(false)
  if (lines.length === 0) return null
  const shown = all ? lines : lines.slice(0, FIRST)
  return (
    <Alert variant="destructive" className={STRIP}>
      <CircleAlertIcon aria-hidden="true" />
      <AlertTitle>{errorCount(lines.length)}</AlertTitle>
      <AlertDescription>
        <LineList lines={shown} variant="alert" />
        {lines.length > FIRST ? (
          <Button variant="link" className="h-auto p-0" onClick={() => setAll(!all)}>
            {all ? "Show fewer" : "Show all"}
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  )
}

/**
 * An alert of plain lines (a card's, a workflow's, the issues of a change that cannot be read): destructive, titled
 * `title` (`N errors` by default), each line in the code font.
 */
export function LinesAlert({
  lines,
  title,
  className,
}: {
  lines: readonly string[]
  title?: string
  className?: string
}) {
  if (lines.length === 0) return null
  return (
    <Alert variant="destructive" className={className}>
      <CircleAlertIcon aria-hidden="true" />
      <AlertTitle>{title ?? errorCount(lines.length)}</AlertTitle>
      <AlertDescription>
        <LineList lines={lines.map((text) => ({ text, onClick: null }))} variant="alert" />
      </AlertDescription>
    </Alert>
  )
}

/**
 * A YAML key as a label: `keyLabel(yamlKey)` in the label's font and, when the key has a `-` or `.`, the key itself
 * after it in muted monospace. One span, so it stays one flex item inside a `FieldLabel`.
 */
export function KeyLabelText({ yamlKey }: { yamlKey: string }) {
  return (
    <span>
      {keyLabel(yamlKey)}
      {/[-.]/.test(yamlKey) ? (
        <>
          {" "}
          <span className="font-mono font-normal text-muted-foreground">{yamlKey}</span>
        </>
      ) : null}
    </span>
  )
}

/** A row with nothing to show. */
export const Dash = () => <span className="text-muted-foreground">–</span>

/**
 * Inputs as the Details panel lists them: the name in the code font, then ` · required`, ` · default "<value>"` or
 * ` · optional`; the description on a second line. `type` adds ` · <type>` right after the name.
 */
export function InputsList({ inputs }: { inputs: readonly (PromptInputRow & { type?: string })[] }) {
  if (inputs.length === 0) return <Dash />
  return (
    <ul className="flex flex-col gap-2">
      {inputs.map((input) => (
        <li key={input.name} className="flex flex-col">
          <span>
            <span className="font-mono">{input.name}</span>
            {input.type !== undefined ? <span className="text-muted-foreground"> · {input.type}</span> : null}
            <span className="text-muted-foreground">
              {input.required
                ? " · required"
                : input.default !== null
                  ? ` · default ${quoted(input.default)}`
                  : " · optional"}
            </span>
          </span>
          {input.description !== "" ? <span className="text-muted-foreground">{input.description}</span> : null}
        </li>
      ))}
    </ul>
  )
}

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
