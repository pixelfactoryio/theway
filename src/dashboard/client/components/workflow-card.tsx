import { cn } from "cn"
import { ArrowDownIcon, ArrowUpIcon, CircleAlertIcon, MoreHorizontalIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { type ReactNode } from "react"

import { Badge } from "@/components/reui/badge"
import { IconTile } from "@/components/reui/icon-tile"
import { OneLine } from "@/components/text"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { errorCount } from "@/lib/files"

/** A block's kind, which tints its icon tile; `null` (a step with no valid target) leaves the tile untinted. */
export type Tone = "inputs" | "session" | "agents" | "on-fail" | null

/** Each kind's tint: identity, not state, from the `--tone-*` tokens (palette hues paired for dark), none of them amber. */
const TONES: Record<Exclude<Tone, null>, string> = {
  inputs: "text-tone-inputs",
  session: "text-tone-session",
  agents: "text-tone-agents",
  "on-fail": "text-tone-on-fail",
}

/** The icon tile's variant and classes for a tone, for the cards and the panel headers. */
export const toneTile = (tone: Tone): { variant: "soft" | "outline"; className?: string } =>
  tone === null ? { variant: "outline" } : { variant: "soft", className: TONES[tone] }

/**
 * One card of the canvas, filling its node: a button holding the header (the tone's 24px icon tile, the name and the
 * badges) and one muted line (the `N errors` badge first when the card has errors), then the menu beside it. A card
 * with errors has a destructive border; the selected card a stronger border and a 4px translucent ring; an on-fail card
 * (`dashed`) a dashed border.
 */
export function Card({
  label,
  icon,
  tone,
  name,
  code,
  badges,
  second,
  errors,
  selected,
  dashed = false,
  menu = null,
  onSelect,
}: {
  label: string
  icon: ReactNode
  tone: Tone
  name: string
  code: boolean
  badges: string[]
  second: ReactNode
  errors: number
  selected: boolean
  dashed?: boolean
  menu?: ReactNode
  onSelect: () => void
}) {
  return (
    <div className="pointer-events-auto relative size-full">
      <button
        type="button"
        aria-label={label}
        aria-pressed={selected}
        onClick={onSelect}
        className={cn(
          "flex size-full flex-col justify-center gap-1 rounded-lg border bg-card px-3 text-left text-card-foreground transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring",
          dashed && "border-dashed border-input",
          selected && "border-foreground/60 ring-4 ring-foreground/10",
          errors > 0 && "border-destructive",
          errors > 0 && selected && "ring-destructive/20",
        )}
      >
        <span className={cn("flex h-6 min-w-0 items-center gap-2", menu !== null && "pe-7")}>
          <IconTile size="xs" {...toneTile(tone)}>
            {icon}
          </IconTile>
          <OneLine
            text={name}
            tooltipClassName="max-w-sm"
            className={cn("min-w-0 flex-1 text-sm font-medium", code && "font-mono")}
          />
          {badges.length > 0 ? (
            <span className="flex shrink-0 items-center gap-1">
              {badges.map((b) => (
                <Badge key={b} variant="outline">
                  {b}
                </Badge>
              ))}
            </span>
          ) : null}
        </span>
        <span className="flex h-5 min-w-0 items-center gap-2">
          {errors > 0 ? (
            <Badge variant="destructive-light">
              <CircleAlertIcon aria-hidden="true" />
              {errorCount(errors)}
            </Badge>
          ) : null}
          {second}
        </span>
      </button>
      {menu}
    </div>
  )
}

/** A card's muted line: one line, cut with an ellipsis, the full text in a tooltip while it is cut. */
export function CardLine({ text, code = false }: { text: string; code?: boolean }) {
  return (
    <OneLine
      text={text}
      tooltipClassName="max-w-sm"
      className={cn("min-w-0 flex-1 text-xs text-muted-foreground", code && "font-mono")}
    />
  )
}

/** A step card's menu, in its header: Move up, Move down, Remove step. */
export function StepMenu({
  first,
  last,
  onMove,
  onRemove,
}: {
  first: boolean
  last: boolean
  onMove: (delta: -1 | 1) => void
  onRemove: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-xs" aria-label="Step actions" className="absolute top-3 right-2" />}
      >
        <MoreHorizontalIcon aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto">
        <DropdownMenuItem disabled={first} onClick={() => onMove(-1)}>
          <ArrowUpIcon aria-hidden="true" />
          Move up
        </DropdownMenuItem>
        <DropdownMenuItem disabled={last} onClick={() => onMove(1)}>
          <ArrowDownIcon aria-hidden="true" />
          Move down
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onRemove}>
          <Trash2Icon aria-hidden="true" />
          Remove step
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The round 20px "Add a step" button, on an edge or under the last card, always shown. */
export function AddButton({ label, onAdd }: { label: string; onAdd: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="outline"
            size="icon-xs"
            aria-label={label}
            className="nodrag nopan pointer-events-auto size-5 rounded-full bg-card shadow-xs hover:bg-accent dark:bg-accent dark:hover:bg-input"
            onClick={onAdd}
          />
        }
      >
        <PlusIcon aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** The empty outlined card where a step is being added. */
export function Placeholder() {
  return (
    <div
      role="img"
      aria-label="New step: choose a prompt in the panel"
      className="flex size-full items-center justify-center rounded-lg border border-dashed border-primary bg-card/50"
    >
      <PlusIcon aria-hidden="true" className="size-4 text-muted-foreground" />
    </div>
  )
}
