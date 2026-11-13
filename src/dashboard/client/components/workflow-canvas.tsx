import Panzoom, { type PanzoomObject } from "@panzoom/panzoom"
import { cn } from "cn"
import { CircleAlertIcon, FileTextIcon, MinusIcon, PlusIcon, RotateCcwIcon, TextCursorInputIcon } from "lucide-react"
import { useEffect, useRef, useState, type ReactNode } from "react"

import { Badge } from "@/components/reui/badge"
import { IconTile } from "@/components/reui/icon-tile"
import { OneLine } from "@/components/text"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { errorCount } from "@/lib/files"
import { type Drawing, hasOnFail, percent, type Selection, zoomStep } from "@/lib/workflow"

/** The rem in pixels, for the narrow-surface rule. */
const REM = 16

/** Room kept around a card panned into view: 16px from the top, left and right, 72px from the bottom (the toolbar). */
const KEEP = { top: 16, left: 16, right: 16, bottom: 72 }

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

/** One card: a `relative` wrapper holding the card button (member 05 adds its menu as a sibling of the button). */
function Card({
  label,
  icon,
  name,
  code,
  badge,
  second,
  third,
  errors,
  selected,
  port,
  onSelect,
  onFocusCard,
}: {
  label: string
  icon: ReactNode
  name: string
  code: boolean
  badge: string | null
  second: string
  third: ReactNode[]
  errors: number
  selected: boolean
  port: boolean
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
        <span className="flex min-w-0 items-center gap-2">
          <IconTile variant="outline" size="xs">
            {icon}
          </IconTile>
          <OneLine text={name} className={cn("min-w-0 flex-1 text-sm font-medium", code && "font-mono")} />
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

/** The connector between two cards of the column: 3rem high, a 1px line ending in an arrow head. */
function Connector() {
  return (
    <div aria-hidden="true" className="flex h-12 flex-col items-center">
      <span className="w-px flex-1 bg-muted-foreground/40" />
      <ArrowHead />
    </div>
  )
}

/**
 * The Editor tab's canvas: one column of cards (Inputs, then each step with its on-fail at its right) on a `muted`
 * surface, panned and zoomed with Panzoom, and a floating zoom toolbar.
 */
export function WorkflowCanvas({
  drawing,
  selection,
  onSelect,
}: {
  drawing: Drawing
  selection: Selection | null
  onSelect: (selection: Selection | null) => void
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

  return (
    <div
      ref={surface}
      className="relative min-h-0 flex-1 overflow-hidden bg-muted"
      onPointerDown={(e) => {
        down.current = { x: e.clientX, y: e.clientY }
      }}
      onPointerUp={(e) => {
        const start = down.current
        down.current = null
        if (start === null || start.x !== e.clientX || start.y !== e.clientY) return
        if ((e.target as HTMLElement).closest(".panzoom-exclude") !== null) return
        onSelect(null)
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onSelect(null)
      }}
    >
      <div ref={inner} className={cn("flex w-max flex-col px-12 pt-12 pb-40", !narrow && "mx-auto")}>
        <div className={cn("flex w-80 flex-col", onFail && !narrow && "me-104")}>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Workflow</span>
            <Card
              label="Inputs"
              icon={<TextCursorInputIcon aria-hidden="true" />}
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
                <Connector />
                <div className="relative">
                  <Card
                    label={`Step ${n}: ${step.name}`}
                    icon={<FileTextIcon aria-hidden="true" />}
                    name={step.name}
                    code={step.code}
                    badge={step.badge}
                    second={step.valid ? (step.description ?? "No description") : "Invalid step"}
                    third={step.matrix !== null ? [<Badge key="matrix" variant="outline">{step.matrix}</Badge>] : []}
                    errors={step.errors.length}
                    selected={same(selection, { kind: "step", index: step.index })}
                    port
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
        </div>
      </div>
      <div
        role="toolbar"
        aria-label="Canvas"
        className="panzoom-exclude absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-lg border bg-background p-1 shadow-sm"
      >
        <ToolbarButton tip="Zoom out" label="Zoom out" disabled={scale <= 0.5} onClick={() => zoomTo(zoomStep(scale, -0.1))}>
          <MinusIcon aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          tip="Reset to 100%"
          label={`Zoom ${percent(scale)}, reset to 100%`}
          className="w-16 tabular-nums"
          onClick={() => panzoom.current?.reset({ animate: false })}
         
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
