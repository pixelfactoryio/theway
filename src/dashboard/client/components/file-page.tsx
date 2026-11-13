import { cn } from "cn"
import { CircleAlertIcon } from "lucide-react"
import { useState, type ReactNode } from "react"
import { Link } from "wouter"

import { Alert, AlertDescription, AlertTitle } from "@/components/reui/alert"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { errorCount, type PromptInputRow, quoted } from "@/lib/files"

/** One line of an error alert: its text, and what clicking it does (`null`: plain text). */
export type AlertLine = { text: string; onClick: (() => void) | null }

/** How many lines an alert shows before "Show all". */
const FIRST = 3

/** The lines of an alert: `font-mono text-xs`, a line with an action a button. */
function Lines({ lines }: { lines: readonly AlertLine[] }) {
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
    <Alert variant="destructive" className="shrink-0 rounded-none border-x-0 border-t-0">
      <CircleAlertIcon aria-hidden="true" />
      <AlertTitle>{errorCount(lines.length)}</AlertTitle>
      <AlertDescription>
        <Lines lines={shown} />
        {lines.length > FIRST ? (
          <Button variant="link" className="h-auto p-0" onClick={() => setAll(!all)}>
            {all ? "Show fewer" : "Show all"}
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  )
}

/** A panel's alert of a card's or a workflow's lines: destructive, titled `N errors`, each line in the code font. */
export function LinesAlert({ lines }: { lines: readonly string[] }) {
  if (lines.length === 0) return null
  return (
    <Alert variant="destructive">
      <CircleAlertIcon aria-hidden="true" />
      <AlertTitle>{errorCount(lines.length)}</AlertTitle>
      <AlertDescription>
        <Lines lines={lines.map((text) => ({ text, onClick: null }))} />
      </AlertDescription>
    </Alert>
  )
}

/** A labelled row of a panel; `code` writes the label in the code font (a YAML key). */
export function PanelRow({ label, code = false, children }: { label: string; code?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className={cn("text-xs text-muted-foreground", code && "font-mono")}>{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
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
              {input.required ? " · required" : input.default !== null ? ` · default ${quoted(input.default)}` : " · optional"}
            </span>
          </span>
          {input.description !== "" ? <span className="text-muted-foreground">{input.description}</span> : null}
        </li>
      ))}
    </ul>
  )
}

/** An unknown workflow or prompt: "No workflow <name>", and a way back to the table. */
export function UnknownFile({ noun, name, back, href }: { noun: string; name: string; back: string; href: string }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>
          No {noun} <code className="font-mono">{name}</code>
        </EmptyTitle>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" render={<Link href={href} />}>
          {back}
        </Button>
      </EmptyContent>
    </Empty>
  )
}

/** "Saved" after a save, as a status message, until the next edit. */
export function SavedStatus({ saved }: { saved: boolean }) {
  return saved ? (
    <span role="status" className="text-sm text-muted-foreground">
      Saved
    </span>
  ) : null
}
