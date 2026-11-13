import { redo, redoDepth, undo, undoDepth } from "@codemirror/commands"
import Panzoom, { type PanzoomObject } from "@panzoom/panzoom"
import { cn } from "cn"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CircleAlertIcon,
  FileTextIcon,
  MinusIcon,
  MoreHorizontalIcon,
  PlusIcon,
  Redo2Icon,
  RotateCcwIcon,
  TextCursorInputIcon,
  Trash2Icon,
  Undo2Icon,
} from "lucide-react"
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type Ref } from "react"

import type { DraftStore } from "@/components/code-view"
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
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { errorCount } from "@/lib/files"
import { type Drawing, fitScale, hasOnFail, percent, type Selection, zoomStep } from "@/lib/workflow"

/** The rem in pixels, for the narrow-surface rule. */
const REM = 16

/** Room kept around a card panned into view: 16px from the top, left and right, 72px from the bottom (the toolbar). */
const KEEP = { top: 16, left: 16, right: 16, bottom: 72 }

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

const same = (a: Selection | null, b: Selection): boolean =>
  a !== null && a.kind === b.kind && (a.kind === "inputs" || (b.kind !== "inputs" && a.index === b.index))

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
      <TooltipTrigger render={<span ref={ref} className="line-clamp-2 text-xs text-muted-foreground" />}>{text}</TooltipTrigger>
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
function Card({
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
          selected && "border-primary ring-1 ring-primary"
        )}
      >
        <span className={cn("flex min-w-0 items-center gap-2", menu !== null && "pe-7")}>
          <IconTile size="xs" {...toneTile(tone)}>
            {icon}
          </IconTile>
          <OneLine text={name} tooltipClassName="max-w-sm" className={cn("min-w-0 flex-1 text-sm font-medium", code && "font-mono")} />
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
function ArrowHead({ right = false }: { right?: boolean }) {
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
function Connector({
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
function StepMenu({
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
function Placeholder({ ref }: { ref: Ref<HTMLDivElement> }) {
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

/** The Undo and Redo buttons: they act on the draft's state through its dispatch, and update on every transaction. */
function HistoryButtons({ store }: { store: DraftStore }) {
  const state = useSyncExternalStore(store.subscribe, store.getState)
  const target = () => ({ state: store.state, dispatch: store.dispatch })
  return (
    <>
      <ToolbarButton tip="Undo" label="Undo" disabled={undoDepth(state) === 0} onClick={() => undo(target())}>
        <Undo2Icon aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton tip="Redo" label="Redo" disabled={redoDepth(state) === 0} onClick={() => redo(target())}>
        <Redo2Icon aria-hidden="true" />
      </ToolbarButton>
      <Separator orientation="vertical" className="mx-1 h-4 data-vertical:self-center" />
    </>
  )
}

/** What the canvas offers to edit: `null` for a read-only canvas. */
export type CanvasEdits = {
  /** Where the placeholder card stands (the index a new step takes), `null` for none. */
  placeholder: number | null
  onAdd: (at: number) => void
  onMove: (index: number, delta: -1 | 1) => void
  onRemove: (index: number) => void
}

/**
 * The Editor tab's canvas: one column of cards (Inputs, then each step with its on-fail at its right) on a `muted`
 * surface, panned and zoomed with Panzoom, and a floating toolbar with Undo, Redo and the zoom. With `edits`, a "+" on
 * each vertical connector and under the last card, and a menu on each step card.
 */
export function WorkflowCanvas({
  drawing,
  selection,
  onSelect,
  store,
  edits,
}: {
  drawing: Drawing
  selection: Selection | null
  onSelect: (selection: Selection | null) => void
  store: DraftStore
  edits: CanvasEdits | null
}) {
  const surface = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const panzoom = useRef<PanzoomObject | null>(null)
  const [scale, setScale] = useState(1)
  const [width, setWidth] = useState<number | null>(null)
  const down = useRef<{ x: number; y: number } | null>(null)
  const onFail = hasOnFail(drawing)
  const narrow = width !== null && width < (onFail ? 52 : 26) * REM

  useEffect(() => {
    const elem = inner.current
    const parent = surface.current
    if (elem === null || parent === null) return
    const pz = Panzoom(elem, {
      minScale: 0.5,
      maxScale: 2,
      step: 0.1,
      canvas: true,
      cursor: "grab",
      excludeClass: "panzoom-exclude",
      animate: false,
      origin: "50% 0",
    })
    panzoom.current = pz
    const change = (e: Event) => setScale((e as CustomEvent<{ scale: number }>).detail.scale)
    elem.addEventListener("panzoomchange", change)
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) pz.zoomWithWheel(e)
      else {
        const s = pz.getScale()
        pz.pan(-e.deltaX / s, -e.deltaY / s, { relative: true, force: true })
      }
    }
    parent.addEventListener("wheel", wheel, { passive: false })
    // Focus would scroll the surface itself: the view moves by panning only.
    const unscroll = () => {
      parent.scrollTop = 0
      parent.scrollLeft = 0
    }
    parent.addEventListener("scroll", unscroll)
    const observer = new ResizeObserver(() => setWidth(parent.clientWidth))
    observer.observe(parent)
    return () => {
      observer.disconnect()
      parent.removeEventListener("scroll", unscroll)
      parent.removeEventListener("wheel", wheel)
      elem.removeEventListener("panzoomchange", change)
      pz.destroy()
      panzoom.current = null
    }
  }, [])

  /** Pans a focused card or button into view, whole. */
  const reveal = (node: HTMLElement) => {
    const pz = panzoom.current
    const box = surface.current?.getBoundingClientRect()
    if (pz === null || box === undefined) return
    const r = node.getBoundingClientRect()
    let dx = 0
    let dy = 0
    if (r.left < box.left + KEEP.left) dx = box.left + KEEP.left - r.left
    else if (r.right > box.right - KEEP.right) dx = box.right - KEEP.right - r.right
    if (r.top < box.top + KEEP.top) dy = box.top + KEEP.top - r.top
    else if (r.bottom > box.bottom - KEEP.bottom) dy = box.bottom - KEEP.bottom - r.bottom
    if (dx === 0 && dy === 0) return
    const s = pz.getScale()
    pz.pan(dx / s, dy / s, { relative: true, force: true })
  }

  const zoomTo = (next: number) => panzoom.current?.zoom(next, { animate: false })

  /**
   * Fits the drawing's height between the surface's top + 16px and its bottom − 72px, at the largest 0.1 step from 0.5
   * to 1, its top 16px under the surface's top, at Panzoom's start x. The drawing is the column and every card (an
   * on-fail card stands outside the column's box). Panzoom writes its transform on the next animation frame, so the
   * boxes are measured once, from the transform the page shows now, and never after a Panzoom call.
   */
  const fit = () => {
    const pz = panzoom.current
    const elem = inner.current
    const area = surface.current?.getBoundingClientRect()
    const column = elem?.firstElementChild
    if (pz === null || elem === null || area === undefined || column == null) return
    const shown = getComputedStyle(elem).transform
    const m = new DOMMatrixReadOnly(shown === "none" ? undefined : shown)
    const s0 = m.a
    const innerTop = elem.getBoundingClientRect().top
    // The origin is `50% 0`: scaling does not move the top edge, so only the translation lies between it and the shown top.
    const untransformedTop = innerTop - m.f
    const boxes = [column, ...elem.querySelectorAll("button[aria-pressed]")].map((n) => n.getBoundingClientRect())
    const top = Math.min(...boxes.map((b) => b.top))
    const bottom = Math.max(...boxes.map((b) => b.bottom))
    const T = (top - innerTop) / s0
    const h = (bottom - top) / s0
    const s = fitScale(h, area.height - KEEP.top - KEEP.bottom)
    pz.zoom(s, { animate: false })
    pz.pan(0, (area.top + KEEP.top - untransformedTop) / s - T, { animate: false, force: true })
  }

  // Fitted once per mount, once the surface's width has settled the layout (`narrow`); later resizes do not refit.
  // Panzoom's constructor queues its start pan, an absolute pan to (0, 0), in a `setTimeout`: the fit is queued as a
  // later timer, which runs after it, so that pan cannot undo the fit.
  const fitted = useRef(false)
  useEffect(() => {
    if (width === null || fitted.current) return
    const timer = setTimeout(() => {
      fitted.current = true
      fit()
    })
    return () => clearTimeout(timer)
  }, [width])

  // A placeholder card that appears out of view is panned in: 96px above the bottom edge, or 16px under the top edge.
  const placeholderRef = useRef<HTMLDivElement>(null)
  const placeholderAt = edits?.placeholder ?? null
  useEffect(() => {
    const node = placeholderRef.current
    const pz = panzoom.current
    const box = surface.current?.getBoundingClientRect()
    if (placeholderAt === null || node === null || pz === null || box === undefined) return
    const r = node.getBoundingClientRect()
    let dy = 0
    if (r.bottom > box.bottom) dy = box.bottom - 96 - r.bottom
    else if (r.top < box.top) dy = box.top + 16 - r.top
    if (dy === 0) return
    pz.pan(0, dy / pz.getScale(), { relative: true, force: true })
  }, [placeholderAt])

  const total = drawing.steps.length
  const add = (at: number) => (edits === null ? null : () => edits.onAdd(at))
  const placeholder = (at: number) =>
    placeholderAt === at ? (
      <>
        <Placeholder ref={placeholderRef} />
        {at < total ? <Connector /> : null}
      </>
    ) : null

  return (
    <div
      ref={surface}
      // The dot grid is painted by the surface, not by the transformed inner node: it stays put and keeps its 16px while the cards pan and zoom.
      className="relative min-h-0 flex-1 overflow-hidden bg-canvas bg-[image:radial-gradient(var(--canvas-dot)_1px,transparent_1px)] bg-size-[16px_16px]"
      // Capture phase: Panzoom's own pointerdown on this surface stops the event before it bubbles to React.
      onPointerDownCapture={(e) => {
        down.current = { x: e.clientX, y: e.clientY }
      }}
      onPointerUp={(e) => {
        const start = down.current
        down.current = null
        if (start === null || start.x !== e.clientX || start.y !== e.clientY) return
        // A menu's content is portalled: its events reach this surface through React, not through the DOM.
        if (!(surface.current?.contains(e.target as Node) ?? false)) return
        if ((e.target as HTMLElement).closest(".panzoom-exclude") !== null) return
        onSelect(null)
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && (surface.current?.contains(e.target as Node) ?? false)) onSelect(null)
      }}
    >
      <div ref={inner} className={cn("flex w-max flex-col px-12 pt-12 pb-40", !narrow && "mx-auto")}>
        <div className={cn("flex w-80 flex-col", onFail && !narrow && "me-104")}>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Workflow</span>
            <Card
              label="Inputs"
              icon={<TextCursorInputIcon aria-hidden="true" />}
              tone="inputs"
              name="Inputs"
              code={false}
              badge={null}
              second={drawing.inputs.length === 0 ? "No input" : drawing.inputs.join(", ")}
              third={[]}
              errors={drawing.errors.length}
              selected={same(selection, { kind: "inputs" })}
              port
              onSelect={() => onSelect({ kind: "inputs" })}
              onFocusCard={reveal}
            />
          </div>
          {drawing.steps.map((step) => {
            const n = step.index + 1
            return (
              <div key={step.index} className="flex flex-col">
                <Connector onAdd={add(step.index)} onFocusButton={reveal} />
                {placeholder(step.index)}
                <div className="relative">
                  <Card
                    label={`Step ${n}: ${step.name}`}
                    icon={<FileTextIcon aria-hidden="true" />}
                    tone={step.target}
                    name={step.name}
                    code={step.code}
                    badge={step.badge}
                    second={step.valid ? (step.description ?? "No description") : "Invalid step"}
                    third={step.matrix !== null ? [<Badge key="matrix" variant="outline">{step.matrix}</Badge>] : []}
                    errors={step.errors.length}
                    selected={same(selection, { kind: "step", index: step.index })}
                    port
                    menu={
                      edits === null ? null : (
                        <StepMenu
                          first={step.index === 0}
                          last={step.index === total - 1}
                          onMove={(delta) => edits.onMove(step.index, delta)}
                          onRemove={() => edits.onRemove(step.index)}
                          onFocusButton={reveal}
                        />
                      )
                    }
                    onSelect={() => onSelect({ kind: "step", index: step.index })}
                    onFocusCard={reveal}
                  />
                  {step.onFail !== null ? (
                    <div className="absolute top-0 left-full flex items-start">
                      <div aria-hidden="true" className="relative mt-8 flex w-24 items-center">
                        <span className="absolute bottom-full left-0 w-full truncate px-1 pb-1 text-xs text-muted-foreground">
                          on fail · tries {step.tries ?? "–"}
                        </span>
                        <span className="h-px flex-1 bg-muted-foreground/40" />
                        <ArrowHead right />
                      </div>
                      <Card
                        label={`On fail of step ${n}: ${step.onFail.name}`}
                        icon={<RotateCcwIcon aria-hidden="true" />}
                        tone="on-fail"
                        name={step.onFail.name}
                        code={step.onFail.code}
                        badge={step.onFail.badge}
                        second={step.onFail.description ?? "No description"}
                        third={[]}
                        errors={step.onFail.errors.length}
                        selected={same(selection, { kind: "on-fail", index: step.index })}
                        port={false}
                        onSelect={() => onSelect({ kind: "on-fail", index: step.index })}
                        onFocusCard={reveal}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            )
          })}
          {edits !== null ? (
            <>
              <Connector arrow={placeholderAt === total} onAdd={add(total)} onFocusButton={reveal} />
              {placeholder(total)}
            </>
          ) : null}
        </div>
      </div>
      <div
        role="toolbar"
        aria-label="Canvas"
        className="panzoom-exclude absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-lg border bg-background p-1 shadow-sm"
      >
        <HistoryButtons store={store} />
        <ToolbarButton tip="Zoom out" label="Zoom out" disabled={scale <= 0.5} onClick={() => zoomTo(zoomStep(scale, -0.1))}>
          <MinusIcon aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          tip="Fit to view"
          label={`Zoom ${percent(scale)}, fit to view`}
          className="w-16 tabular-nums"
          onClick={fit}
          size="default"
        >
          {percent(scale)}
        </ToolbarButton>
        <ToolbarButton tip="Zoom in" label="Zoom in" disabled={scale >= 2} onClick={() => zoomTo(zoomStep(scale, 0.1))}>
          <PlusIcon aria-hidden="true" />
        </ToolbarButton>
      </div>
    </div>
  )
}

function ToolbarButton({
  tip,
  label,
  disabled = false,
  className,
  size = "icon",
  onClick,
  children,
}: {
  tip: string
  label: string
  disabled?: boolean
  className?: string
  size?: "icon" | "default"
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size={size}
            aria-label={label}
            disabled={disabled}
            className={cn("panzoom-exclude", className)}
            onClick={onClick}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  )
}
