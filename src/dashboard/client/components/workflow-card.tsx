import { cn } from "cn"
import { ArrowDownIcon, ArrowUpIcon, CircleAlertIcon, MoreHorizontalIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { useEffect, useRef, useState, type ReactNode, type Ref } from "react"

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

/** A second row: at most two lines, the full text in a tooltip while it is cut. */
function TwoLines({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [cut, setCut] = useState(false)
  useEffect(() => {
    const node = ref.current
    if (node === null) return
    const measure = () => setCut(node.scrollHeight > node.clientHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [text])
  return (
    <Tooltip disabled={!cut}>
      <TooltipTrigger render={<span ref={ref} className="line-clamp-2 text-xs text-muted-foreground" />}>
        {text}
      </TooltipTrigger>
      <TooltipContent className="max-w-sm">{text}</TooltipContent>
    </Tooltip>
  )
}

/** The `N errors` badge of a card. */
function CardErrors({ count }: { count: number }) {
  return (
    <Badge variant="destructive-light">
      <CircleAlertIcon aria-hidden="true" />
      {errorCount(count)}
    </Badge>
  )
}

/** One card: a `relative` wrapper holding the card button and, after it, its menu. */
export function Card({
  label,
  icon,
  tone,
  name,
  code,
  badge,
  second,
  third,
  errors,
  selected,
  port,
  menu = null,
  onSelect,
  onFocusCard,
}: {
  label: string
  icon: ReactNode
  tone: Tone
  name: string
  code: boolean
  badge: string | null
  second: string
  third: ReactNode[]
  errors: number
  selected: boolean
  port: boolean
  menu?: ReactNode
  onSelect: () => void
  onFocusCard: (node: HTMLElement) => void
}) {
  return (
    <div className="panzoom-exclude relative w-80">
      <button
        type="button"
        aria-label={label}
        aria-pressed={selected}
        onClick={onSelect}
        onFocus={(e) => onFocusCard(e.currentTarget)}
        className={cn(
          "flex w-full flex-col gap-2 rounded-lg border bg-card p-3 text-left text-card-foreground shadow-xs transition-colors outline-none hover:bg-accent/50 focus-visible:ring-3 focus-visible:ring-ring/50",
          errors > 0 && "border-destructive",
          selected && "border-primary ring-1 ring-primary",
        )}
      >
        <span className={cn("flex min-w-0 items-center gap-2", menu !== null && "pe-7")}>
          <IconTile size="xs" {...toneTile(tone)}>
            {icon}
          </IconTile>
          <OneLine
            text={name}
            tooltipClassName="max-w-sm"
            className={cn("min-w-0 flex-1 text-sm font-medium", code && "font-mono")}
          />
          {badge !== null ? (
            <span className="flex shrink-0 items-center gap-1">
              <Badge variant="outline">{badge}</Badge>
            </span>
          ) : null}
        </span>
        <TwoLines text={second} />
        {third.length > 0 || errors > 0 ? (
          <span className="flex flex-wrap items-center gap-1">
            {third}
            {errors > 0 ? <CardErrors count={errors} /> : null}
          </span>
        ) : null}
      </button>
      {menu}
      {port ? (
        <span
          aria-hidden="true"
          className="absolute -bottom-1 left-1/2 size-2 -translate-x-1/2 rounded-full border border-muted-foreground/40 bg-background"
        />
      ) : null}
    </div>
  )
}

/** The arrow head at the end of a connector, 8px wide. */
export function ArrowHead({ right = false }: { right?: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 8 8" className="size-2 shrink-0 fill-muted-foreground/60">
      <polygon points={right ? "0,0 8,4 0,8" : "0,0 8,0 4,8"} />
    </svg>
  )
}

/**
 * The connector between two cards of the column: 3rem high, a 1px line ending in an arrow head (`arrow`), with the
 * round "Add a step here" button centred on it when `onAdd` is given.
 */
export function Connector({
  arrow = true,
  onAdd = null,
  onFocusButton,
}: {
  arrow?: boolean
  onAdd?: (() => void) | null
  onFocusButton?: (node: HTMLElement) => void
}) {
  return (
    <div className="relative flex h-12 flex-col items-center">
      <span aria-hidden="true" className="w-px flex-1 bg-muted-foreground/40" />
      {arrow ? <ArrowHead /> : null}
      {onAdd !== null ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                size="icon-xs"
                aria-label="Add a step here"
                className="panzoom-exclude absolute top-1/2 left-1/2 -translate-1/2 rounded-full"
                onClick={onAdd}
                onFocus={(e) => onFocusButton?.(e.currentTarget)}
              />
            }
          >
            <PlusIcon aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent>Add a step here</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  )
}

/** A step card's menu: Move up, Move down, Remove step. */
export function StepMenu({
  first,
  last,
  onMove,
  onRemove,
  onFocusButton,
}: {
  first: boolean
  last: boolean
  onMove: (delta: -1 | 1) => void
  onRemove: () => void
  onFocusButton: (node: HTMLElement) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Step actions"
            className="absolute top-3 right-2"
            onFocus={(e) => onFocusButton(e.currentTarget)}
          />
        }
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

/** The empty outlined card where a step is being added. */
export function Placeholder({ ref }: { ref: Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      role="img"
      aria-label="New step: choose a prompt in the panel"
      className="flex h-20 w-80 items-center justify-center rounded-lg border border-dashed border-primary"
    >
      <PlusIcon aria-hidden="true" className="size-4 text-muted-foreground" />
    </div>
  )
}
