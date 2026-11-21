import { cn } from "cn"
import { WorkflowIcon } from "lucide-react"
import type { ReactNode } from "react"
import { Link } from "wouter"

import { EmptyNote } from "@/components/empty-note"
import { RowChip } from "@/components/list-kit"
import { PropertyCard } from "@/components/property-card"
import { StatusMark, StatusPill } from "@/components/status"
import type { AlertLine } from "@/lib/alert-lines"
import type { Status } from "@/lib/changes"
import { errorCount, type PromptInputRow, placeOfUse, quoted, type Use, workflowCount } from "@/lib/files"
import { to } from "@/lib/routes"

/**
 * The cards of facts an item's page and a step's panel share, in the right column's `PropertyCards`: the item's
 * status, a prompt's Inputs, the workflows that use it, and a file's Problems. Their rows sit on the card's 12px gutter, each above a
 * light rule; a row that opens something is a link or a button across the card, with the hover fill and an inset ring.
 */

/** A card row that opens something: the whole row, the hover fill and an inset focus ring; the last keeps the corners. */
const ROW_ACTION =
  "flex w-full items-center gap-2 border-t border-rule px-3 text-left transition-colors outline-none hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"

/**
 * The first card of an item's panel, the same on a change's, a workflow's and a prompt's page: its status as the
 * status pill (`label` in place of the status's name), and `action` at the right (a change's progress, a workflow's
 * `default` chip).
 */
export function StatusCard({ status, label, action }: { status: Status; label?: string; action?: ReactNode }) {
  return <PropertyCard title={<StatusPill status={status} label={label} />} action={action} />
}

/** A file's status, as its header and its status card give it: Valid, or `N errors`. */
export function fileStatus(errors: number): { status: Status; label: string } {
  return errors === 0 ? { status: "ready", label: "Valid" } : { status: "invalid", label: errorCount(errors) }
}

/** An input's requirement, as a chip: `required`, `default "<value>"` or `optional`. */
const requirement = (input: PromptInputRow): string =>
  input.required ? "required" : input.default !== null ? `default ${quoted(input.default)}` : "optional"

/**
 * The Inputs card: one row per input, its name in mono and its requirement as a chip, its description under them; the
 * number of inputs in the header.
 */
export function InputsCard({ inputs }: { inputs: readonly PromptInputRow[] }) {
  return (
    <PropertyCard title="Inputs" meta={inputs.length}>
      <ul className="flex flex-col">
        {inputs.map((input) => (
          <li key={input.name} className="flex flex-col gap-1 border-t border-rule px-3 py-2">
            <span className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 truncate font-mono text-xs text-foreground">{input.name}</span>
              <RowChip>{requirement(input)}</RowChip>
            </span>
            {input.description !== "" ? <span className="text-muted-foreground">{input.description}</span> : null}
          </li>
        ))}
      </ul>
    </PropertyCard>
  )
}

/**
 * The Used by card: one row per use, each opening its workflow's page: the workflow's icon and name, its project's
 * when it is a project's own, and at the right where it uses the prompt (`step 2`), or `this workflow` on `current`'s
 * own page; the number of workflows in the header, and a note when none uses it.
 */
export function UsedByCard({
  uses,
  label,
  current,
}: {
  uses: readonly Use[]
  label: (key: string) => string
  /** The workflow whose page shows the card: its rows are marked `this workflow`. */
  current?: { workflow: string; project: string | null }
}) {
  return (
    <PropertyCard title="Used by" meta={uses.length > 0 ? workflowCount(uses) : undefined}>
      {uses.length === 0 ? (
        // On the card's 12px gutter, as its rows.
        <div className="border-t border-rule [&>div]:px-3">
          <EmptyNote>No workflow uses this prompt.</EmptyNote>
        </div>
      ) : (
        <ul aria-label="Used by" className="flex flex-col">
          {uses.map((use, i) => {
            const own = current !== undefined && current.workflow === use.workflow && current.project === use.project
            return (
              <li key={i}>
                <Link
                  href={to.file("workflows", use.project, use.workflow)}
                  className={cn(ROW_ACTION, "h-8", i === uses.length - 1 && "rounded-b-lg")}
                >
                  <WorkflowIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 truncate text-foreground">{use.workflow}</span>
                  {use.project !== null ? (
                    <span className="min-w-0 truncate text-muted-foreground">{label(use.project)}</span>
                  ) : null}
                  <span className="ml-auto shrink-0 text-xs whitespace-nowrap text-muted-foreground">
                    {own ? `this workflow · ${placeOfUse(use)}` : placeOfUse(use)}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </PropertyCard>
  )
}

/**
 * The Problems card of a file with errors: one row per error with the Invalid icon, a button when a click goes to its
 * place (its line, its card); the number of errors in the header.
 */
export function ProblemsCard({ lines }: { lines: readonly AlertLine[] }) {
  return (
    <PropertyCard title="Problems" meta={lines.length}>
      <ul className="flex flex-col">
        {lines.map((line, i) => {
          const body = (
            <>
              <StatusMark status="invalid" className="mt-0.5 self-start" />
              <span className="min-w-0 flex-1 wrap-break-word">{line.text}</span>
            </>
          )
          return (
            <li key={i}>
              {line.onClick !== null ? (
                <button
                  type="button"
                  onClick={line.onClick}
                  className={cn(ROW_ACTION, "py-2", i === lines.length - 1 && "rounded-b-lg")}
                >
                  {body}
                </button>
              ) : (
                <div className="flex gap-2 border-t border-rule px-3 py-2">{body}</div>
              )}
            </li>
          )
        })}
      </ul>
    </PropertyCard>
  )
}
