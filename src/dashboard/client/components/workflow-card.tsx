import { cn } from "cn"
import { PlusIcon } from "lucide-react"
import { type ReactNode, useId } from "react"

import { ErrorsBadge } from "@/components/status"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/** What a card stands for, which colours its tile: the inputs, a step run in the session or by agents, an on-fail. */
export type CardKind = "inputs" | "session" | "agents" | "on-fail"

/**
 * The tile's tint and ring per kind, from the project hues (none is the blue or a status colour); its number and icon
 * stay in the ink, as a hue is never text.
 */
const TILE: Record<CardKind, string> = {
  inputs: "bg-project-4/20 text-foreground ring-1 ring-project-4/30 ring-inset",
  session: "bg-project-2/20 text-foreground ring-1 ring-project-2/30 ring-inset",
  agents: "bg-project-1/20 text-foreground ring-1 ring-project-1/30 ring-inset",
  "on-fail": "bg-project-3/20 text-foreground ring-1 ring-project-3/30 ring-inset",
}

/** A step's kind from its badge (`session`, `agents · opus`). */
export const kindOf = (badge: string | null): CardKind => (badge?.startsWith("session") ? "session" : "agents")

/**
 * One card of the canvas, filling its node, raised off the canvas by its outline and a soft shadow: a button holding,
 * at its left, a 28px tile tinted by the card's `kind` with the step's number (or the card's icon) in the ink, then the
 * `title` (what the step does, in the ink, whole on as many lines as it takes), and under it the step's name in Geist
 * Mono with its `N errors` badge, and `meta` (where it runs, its matrix) at the right in the
 * secondary ink. An on-fail card (`dashed`) has a dashed border. The selected card has the blue border and a 3px blue tint
 * around it; a card with errors a red border. The menu,
 * when the canvas edits, stands at the top right, over the title's end.
 */
export function Card({
  label,
  kind,
  number,
  title,
  name,
  meta,
  errors,
  selected,
  dashed = false,
  menu = null,
  onSelect,
}: {
  label: string
  kind: CardKind
  /** The step's number, or the card's icon. */
  number: ReactNode
  title: string
  /** The second line's lead: the step's name in mono, or the Inputs card's inputs. */
  name: ReactNode
  /** The second line's end: where the step runs, its matrix. */
  meta?: string | null
  errors: number
  selected: boolean
  dashed?: boolean
  menu?: ReactNode
  onSelect: () => void
}) {
  const line = useId()
  return (
    <div className="pointer-events-auto relative size-full">
      {/* Named by `label`, described by its second line, so its name, its errors and where it runs are announced. */}
      <button
        type="button"
        aria-label={label}
        aria-describedby={line}
        aria-pressed={selected}
        onClick={onSelect}
        className={cn(
          "group/card flex size-full items-center overflow-hidden rounded-lg border bg-card text-left text-card-foreground shadow-sm transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          dashed && "border-dashed border-muted-foreground/50",
          errors > 0 && "border-destructive",
          selected && "ring-3 ring-ring/15",
          selected && errors === 0 && "border-ring",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "ms-3 flex size-7 shrink-0 items-center justify-center rounded-md font-mono text-xs font-semibold [&_svg]:size-3.5",
            TILE[kind],
          )}
        >
          {number}
        </span>
        <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-3">
          {/* Whole, wrapped as the canvas measures it (`wrappedLines`): the card is as high as its lines. */}
          <span className={cn("min-w-0 text-sm wrap-break-word", menu !== null && "pe-6")}>{title}</span>
          <span id={line} className="flex h-(--text-sm--line-height) min-w-0 items-center gap-2 text-muted-foreground">
            <span className="flex min-w-0 items-center gap-2 truncate">{name}</span>
            <ErrorsBadge count={errors} />
            {meta != null && meta !== "" ? <span className="ml-auto shrink-0 text-xs">{meta}</span> : null}
          </span>
        </span>
      </button>
      {menu}
    </div>
  )
}

/**
 * A step's name on its card's second line: Geist Mono `text-xs` (14px), cut at its end; `fixed` keeps it whole while the text after
 * it gives way (an input's name before its description).
 */
export function CardName({ children, fixed = false }: { children: string; fixed?: boolean }) {
  return (
    <code className={cn("min-w-0 truncate font-mono text-xs text-sidebar-foreground", fixed && "shrink-0")}>
      {children}
    </code>
  )
}

/**
 * A small chip on a card's second line (`required`): `text-xs` (14px) on its 20px line, the secondary ink, a hairline
 * outline, 4px corners.
 */
export function CardChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-(--text-xs--line-height) shrink-0 items-center rounded-sm border px-1 text-xs whitespace-nowrap">
      {children}
    </span>
  )
}

/** The round 20px "Add a step" button, on a line between two cards or under the last card, always shown. */
export function AddButton({ label, onAdd }: { label: string; onAdd: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="outline"
            size="icon-xs"
            aria-label={label}
            className="nodrag nopan pointer-events-auto size-5 rounded-full bg-card text-muted-foreground shadow-xs hover:bg-accent hover:text-foreground dark:bg-card dark:hover:bg-accent"
            onClick={onAdd}
          />
        }
      >
        <PlusIcon aria-hidden="true" className="size-3" />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** The empty card where a step is being added: a dashed blue outline (the step is being chosen in the panel). */
export function Placeholder() {
  return (
    <div
      role="img"
      aria-label="New step: choose a prompt in the panel"
      className="flex size-full items-center gap-2 rounded-lg border border-dashed border-ring bg-card/60 px-4 text-muted-foreground"
    >
      <PlusIcon aria-hidden="true" className="size-3.5" />
      <span>Choose a prompt in the panel</span>
    </div>
  )
}
