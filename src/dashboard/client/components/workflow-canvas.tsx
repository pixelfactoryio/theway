import { redo, redoDepth, undo, undoDepth } from "@codemirror/commands"
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  type Edge,
  EdgeLabelRenderer,
  type EdgeProps,
  getSmoothStepPath,
  Handle,
  MarkerType,
  MiniMap,
  type Node as FlowNodeBase,
  type NodeProps,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
} from "@xyflow/react"
import { cn } from "cn"
import {
  FileTextIcon,
  MinusIcon,
  PlusIcon,
  Redo2Icon,
  RotateCcwIcon,
  ScanIcon,
  TextCursorInputIcon,
  Undo2Icon,
} from "lucide-react"
import {
  createContext,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { AddButton, Card, CardLine, Placeholder, StepMenu } from "@/components/workflow-card"
import type { DraftStore } from "@/drafts/draft-store"
import { type Drawing, sameSelection, type Selection } from "@/lib/workflow"
import {
  addCentre,
  fitView,
  layoutDrawing,
  type LayoutEdge,
  type LayoutNode,
  overflows,
  percent,
  revealDelta,
  zoomStep,
} from "@/lib/workflow-layout"
import { MOD, modKey } from "@/shell/platform"
import { Shortcut } from "@/shell/shortcut"

/** What the canvas offers to edit: `null` for a read-only canvas. */
export type CanvasEdits = {
  /** Where the placeholder card stands (the index a new step takes), `null` for none. */
  placeholder: number | null
  onAdd: (at: number) => void
  onMove: (index: number, delta: -1 | 1) => void
  onRemove: (index: number) => void
}

/** What every node and edge of the canvas reads: the drawing, the selection and the edits. */
type Canvas = {
  drawing: Drawing
  selection: Selection | null
  onSelect: (selection: Selection | null) => void
  edits: CanvasEdits | null
}

const CanvasContext = createContext<Canvas | null>(null)

const useCanvas = (): Canvas => {
  const canvas = useContext(CanvasContext)
  if (canvas === null) throw new Error("a canvas node outside the canvas")
  return canvas
}

type FlowNode = FlowNodeBase<{ layout: LayoutNode }>
type FlowEdge = Edge<{ layout: LayoutEdge }>

/**
 * A handle where an edge joins a card, never a place to connect (steps are not joined by hand): 1px and invisible, so
 * the edge meets the card's border. Hidden with `visibility`, not `display`, since React Flow measures handles.
 */
function Dot({ type, position, id }: { type: "source" | "target"; position: Position; id?: string }) {
  return (
    <Handle
      type={type}
      position={position}
      id={id}
      isConnectable={false}
      className="invisible size-px min-h-0 min-w-0 border-0"
    />
  )
}

/** The Inputs card: the workflow's inputs, its own errors; selecting it shows the workflow's panel. */
function InputsNode() {
  const { drawing, selection, onSelect, edits } = useCanvas()
  const own = { kind: "inputs" } as const
  return (
    <>
      <Card
        label="Inputs"
        icon={<TextCursorInputIcon aria-hidden="true" />}
        tone="inputs"
        name="Inputs"
        code={false}
        badges={[]}
        second={<CardLine text={drawing.inputs.length === 0 ? "No input" : drawing.inputs.join(", ")} />}
        errors={drawing.errors.length}
        selected={sameSelection(selection, own)}
        onSelect={() => onSelect(own)}
      />
      {edits !== null || drawing.steps.length > 0 ? <Dot type="source" position={Position.Bottom} /> : null}
    </>
  )
}

/** A step's card, its menu when the canvas edits. */
function StepNode({ data }: NodeProps<FlowNode>) {
  const { drawing, selection, onSelect, edits } = useCanvas()
  const index = data.layout.kind === "step" ? data.layout.index : 0
  const step = drawing.steps[index]
  if (step === undefined) return null
  const total = drawing.steps.length
  const own = { kind: "step", index } as const
  const badges = [...(step.matrix !== null ? [step.matrix] : []), ...(step.badge !== null ? [step.badge] : [])]
  return (
    <>
      <Dot type="target" position={Position.Top} />
      <Card
        label={`Step ${index + 1}: ${step.name}`}
        icon={<FileTextIcon aria-hidden="true" />}
        tone={step.target}
        name={step.name}
        code={step.code}
        badges={badges}
        second={<CardLine text={step.valid ? (step.description ?? "No description") : "Invalid step"} />}
        errors={step.errors.length}
        selected={sameSelection(selection, own)}
        menu={
          edits === null ? null : (
            <StepMenu
              first={index === 0}
              last={index === total - 1}
              onMove={(delta) => edits.onMove(index, delta)}
              onRemove={() => edits.onRemove(index)}
            />
          )
        }
        onSelect={() => onSelect(own)}
      />
      {/* A read-only canvas has no edge under its last card. */}
      {edits !== null || index < total - 1 ? <Dot type="source" position={Position.Bottom} /> : null}
      {step.onFail !== null ? <Dot type="source" position={Position.Right} id="on-fail" /> : null}
    </>
  )
}

/** A step's on-fail card, at its right with a dashed border; selecting it opens its step's panel at `on-fail`. */
function OnFailNode({ data }: NodeProps<FlowNode>) {
  const { drawing, selection, onSelect } = useCanvas()
  const index = data.layout.kind === "on-fail" ? data.layout.index : 0
  const card = drawing.steps[index]?.onFail
  if (card == null) return null
  const own = { kind: "on-fail", index } as const
  return (
    <>
      <Dot type="target" position={Position.Left} />
      <Card
        label={`On fail of step ${index + 1}: ${card.name}`}
        icon={<RotateCcwIcon aria-hidden="true" />}
        tone="on-fail"
        name={card.name}
        code={card.code}
        badges={card.badge !== null ? [card.badge] : []}
        second={<CardLine text={card.description ?? "No description"} />}
        errors={card.errors.length}
        selected={sameSelection(selection, own)}
        dashed
        onSelect={() => onSelect(own)}
      />
    </>
  )
}

/** The outlined card where a step is being added. */
function PlaceholderNode() {
  return (
    <>
      <Dot type="target" position={Position.Top} />
      <Placeholder />
      <Dot type="source" position={Position.Bottom} />
    </>
  )
}

/** The round "+" under the last card, always shown while the canvas edits. */
function AddNode({ data }: NodeProps<FlowNode>) {
  const { drawing, edits } = useCanvas()
  const at = data.layout.kind === "add" ? data.layout.at : 0
  if (edits === null) return null
  return (
    <>
      <Dot type="target" position={Position.Top} />
      <AddButton
        label={drawing.steps.length === 0 ? "Add a step" : `Add a step after step ${at}`}
        onAdd={() => edits.onAdd(at)}
      />
    </>
  )
}

/**
 * An edge of the column: a smooth-step line with a small arrow head and, when the canvas edits, a round "+" always
 * shown on it, which adds a step there: centred across the line, and between the card above and the arrow head.
 */
function FlowEdgeView({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
}: EdgeProps<FlowEdge>) {
  const { edits } = useCanvas()
  const [path, labelX] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  })
  const layout = data?.layout
  const add = layout?.kind === "flow" ? layout.add : null
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} interactionWidth={0} />
      {edits !== null && add !== null ? (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-auto absolute flex"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${addCentre(sourceY, targetY)}px)` }}
          >
            <AddButton label={`Add a step before step ${add + 1}`} onAdd={() => edits.onAdd(add)} />
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}

/** The dashed destructive edge from a step to its on-fail card, its pill at the middle: "on fail · tries N". */
function OnFailEdgeView({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
}: EdgeProps<FlowEdge>) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  })
  const layout = data?.layout
  const tries = layout?.kind === "on-fail" ? layout.tries : null
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        interactionWidth={0}
        className="stroke-destructive/60"
        strokeDasharray="5 5"
      />
      <EdgeLabelRenderer>
        <div
          aria-hidden="true"
          className="absolute flex h-5 items-center rounded-full border border-destructive/40 bg-card px-2 text-xs whitespace-nowrap text-destructive-foreground"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
        >
          on fail · tries {tries ?? "–"}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}

/** The canvas's node and edge kinds, defined once outside the component, as React Flow asks. */
const NODE_TYPES = {
  inputs: InputsNode,
  step: StepNode,
  "on-fail": OnFailNode,
  placeholder: PlaceholderNode,
  add: AddNode,
}
const EDGE_TYPES = { flow: FlowEdgeView, "on-fail": OnFailEdgeView }

/** A small closed arrow head, coloured by the edge's stroke (a CSS colour). */
const arrow = (color: string) => ({ type: MarkerType.ArrowClosed, width: 14, height: 14, color })

/** The layout's nodes as React Flow's: placed, sized, neither dragged, selected nor focused by React Flow itself. */
const flowNodes = (nodes: LayoutNode[]): FlowNode[] =>
  nodes.map((n) => ({
    id: n.id,
    type: n.kind,
    position: { x: n.x, y: n.y },
    width: n.width,
    height: n.height,
    data: { layout: n },
    // Dragging on a card does not pan: the card takes the click, as the "+" and the menu do.
    className: "nopan",
  }))

const flowEdges = (edges: LayoutEdge[]): FlowEdge[] =>
  edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.kind === "on-fail" ? "on-fail" : undefined,
    type: e.kind,
    data: { layout: e },
    markerEnd:
      e.kind === "on-fail" ? arrow("var(--destructive)") : e.arrow ? arrow("var(--xy-edge-stroke)") : undefined,
  }))

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
    </>
  )
}

/**
 * The Editor tab's canvas, on React Flow: one column of cards (Inputs, then each step with its on-fail at its right) on
 * a 16px dot grid, a floating toolbar at the bottom centre (Undo, Redo, zoom out, the zoom, zoom in, Fit), and a minimap
 * at the bottom right while the drawing overflows the view. With `edits`, a "+" on each edge and under the last card,
 * and a menu on each step card.
 */
export function WorkflowCanvas(props: {
  drawing: Drawing
  selection: Selection | null
  onSelect: (selection: Selection | null) => void
  store: DraftStore
  edits: CanvasEdits | null
  header: ReactNode
}) {
  return (
    <ReactFlowProvider>
      <Flow {...props} />
    </ReactFlowProvider>
  )
}

function Flow({
  drawing,
  selection,
  onSelect,
  store,
  edits,
  header,
}: {
  drawing: Drawing
  selection: Selection | null
  onSelect: (selection: Selection | null) => void
  store: DraftStore
  edits: CanvasEdits | null
  header: ReactNode
}) {
  const flow = useReactFlow<FlowNode, FlowEdge>()
  const wrapper = useRef<HTMLDivElement>(null)
  const placeholder = edits?.placeholder ?? null
  const editable = edits !== null
  const layout = useMemo(() => layoutDrawing(drawing, placeholder, editable), [drawing, placeholder, editable])
  const nodes = useMemo(() => flowNodes(layout.nodes), [layout])
  const edges = useMemo(() => flowEdges(layout.edges), [layout])
  const canvas = useMemo<Canvas>(() => ({ drawing, selection, onSelect, edits }), [drawing, selection, onSelect, edits])

  const heading = useRef<HTMLDivElement>(null)
  /** The pane's size, and the room the page's heading takes at its top: the drawing fits under it. */
  const pane = useCallback(() => {
    const box = wrapper.current?.getBoundingClientRect()
    if (box === undefined) return null
    const head = heading.current?.getBoundingClientRect()
    return { width: box.width, height: box.height, top: head === undefined ? 0 : head.bottom - box.top }
  }, [])

  const bounds = layout.bounds
  const fit = useCallback(() => {
    const area = pane()
    if (area === null || area.height === 0) return
    void flow.setViewport(fitView(bounds, area, area.top))
  }, [flow, pane, bounds])

  /** Pans by (`dx`, `dy`) pane pixels, at the same zoom. */
  const panBy = useCallback(
    (dx: number, dy: number) => {
      if (dx === 0 && dy === 0) return
      const v = flow.getViewport()
      void flow.setViewport({ x: v.x + dx, y: v.y + dy, zoom: v.zoom })
    },
    [flow],
  )

  // A placeholder card that appears out of view is panned in: above the toolbar's band, or 16px under the top edge.
  useEffect(() => {
    if (placeholder === null) return
    const node = layout.nodes.find((n) => n.kind === "placeholder")
    const area = pane()
    if (node === undefined || area === null) return
    const v = flow.getViewport()
    const top = node.y * v.zoom + v.y
    const { dy } = revealDelta({ left: 0, right: 0, top, bottom: top + node.height * v.zoom }, area)
    panBy(0, dy)
  }, [placeholder, layout, flow, pane, panBy])

  /** Pans a focused card, menu or "+" into view, whole. */
  const reveal = (e: FocusEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    const area = wrapper.current?.getBoundingClientRect()
    if (area === undefined || target.closest(".react-flow__viewport") === null) return
    const r = (target.closest(".react-flow__node") ?? target).getBoundingClientRect()
    const { dx, dy } = revealDelta(
      { left: r.left - area.left, right: r.right - area.left, top: r.top - area.top, bottom: r.bottom - area.top },
      area,
    )
    panBy(dx, dy)
  }

  const size = useStore((s) => ({ width: s.width, height: s.height }), sameSize)
  // Fitted once per mount, once React Flow's viewport is ready and the pane has its size; later resizes do not refit.
  const [ready, setReady] = useState(false)
  const fitted = useRef(false)
  const sized = size.width > 0 && size.height > 0
  useEffect(() => {
    if (!ready || !sized || fitted.current) return
    fitted.current = true
    fit()
  }, [ready, sized, fit])

  const zoom = useStore((s) => s.transform[2])
  const view = useStore((s) => ({ x: s.transform[0], y: s.transform[1], zoom: s.transform[2] }), sameView)
  const zoomBy = (delta: number) => void flow.zoomTo(zoomStep(zoom, delta))
  // The minimap stands at the bottom right while part of the drawing is out of view; on a pane too narrow to hold it
  // beside the toolbar, above the toolbar's band.
  const minimap = overflows(layout.bounds, view, size)
  const minimapAbove = size.width < 640

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // A menu's content is portalled: its keys reach the canvas through React, not through the DOM.
    if (!(wrapper.current?.contains(e.target as Node | null) ?? false)) return
    if (e.key === "Escape") {
      onSelect(null)
      return
    }
    if (!modKey(e) || e.altKey) return
    if (e.key === "0") fit()
    else if (e.key === "=" || e.key === "+") zoomBy(0.1)
    else if (e.key === "-") zoomBy(-0.1)
    else return
    e.preventDefault()
  }

  return (
    <CanvasContext value={canvas}>
      <div
        ref={wrapper}
        tabIndex={-1}
        aria-label="Workflow canvas"
        className="relative min-h-0 flex-1 outline-none"
        onKeyDown={onKeyDown}
        onFocus={reveal}
        onPointerDown={(e) => {
          // The pane takes no focus of its own: clicking it focuses the canvas, so its keys work.
          if ((e.target as HTMLElement).classList.contains("react-flow__pane"))
            wrapper.current?.focus({ preventScroll: true })
        }}
      >
        <ReactFlow<FlowNode, FlowEdge>
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          onInit={() => setReady(true)}
          onPaneClick={() => onSelect(null)}
          minZoom={0.5}
          maxZoom={2}
          nodesDraggable={false}
          nodesConnectable={false}
          nodesFocusable={false}
          edgesFocusable={false}
          elementsSelectable={false}
          disableKeyboardA11y
          deleteKeyCode={null}
          selectionKeyCode={null}
          multiSelectionKeyCode={null}
          panOnScroll
          zoomOnDoubleClick={false}
          defaultMarkerColor={null}
          attributionPosition="bottom-left"
          className="bg-canvas [--xy-edge-stroke-width:1.5] [--xy-edge-stroke:color-mix(in_oklab,var(--muted-foreground)_50%,transparent)]"
        >
          <Panel ref={heading} position="top-left" className="pointer-events-none z-0 m-0 px-6 pt-4">
            {header}
          </Panel>
          <Background variant={BackgroundVariant.Dots} gap={16} size={1.5} color="var(--canvas-dot)" />
          {minimap ? (
            <MiniMap<FlowNode>
              ariaLabel="Minimap"
              pannable
              style={{ width: 160, height: 100 }}
              bgColor="var(--card)"
              maskColor="color-mix(in oklab, var(--background) 55%, transparent)"
              nodeColor={(n) => (selectedNode(n.data.layout, selection) ? "var(--muted-foreground)" : "var(--input)")}
              nodeBorderRadius={2}
              className={cn("m-4 overflow-hidden rounded-lg border shadow-md", minimapAbove && "mb-17")}
            />
          ) : null}
          <Panel position="bottom-center" className="m-4">
            <div
              role="toolbar"
              aria-label="Canvas"
              className="flex h-9 items-center gap-0.5 rounded-lg border bg-card px-1 shadow-md"
            >
              <HistoryButtons store={store} />
              <Separator orientation="vertical" className="mx-1 h-4 data-vertical:self-center" />
              <ToolbarButton
                tip="Zoom out"
                keys={[MOD, "-"]}
                label="Zoom out"
                disabled={zoom <= 0.5}
                onClick={() => zoomBy(-0.1)}
              >
                <MinusIcon aria-hidden="true" />
              </ToolbarButton>
              <output aria-label="Zoom" className="w-12 text-center text-xs tabular-nums">
                {percent(zoom)}
              </output>
              <ToolbarButton
                tip="Zoom in"
                keys={[MOD, "="]}
                label="Zoom in"
                disabled={zoom >= 2}
                onClick={() => zoomBy(0.1)}
              >
                <PlusIcon aria-hidden="true" />
              </ToolbarButton>
              <Separator orientation="vertical" className="mx-1 h-4 data-vertical:self-center" />
              <ToolbarButton tip="Fit to view" keys={[MOD, "0"]} label="Fit to view" size="sm" onClick={fit}>
                <ScanIcon aria-hidden="true" />
                Fit
              </ToolbarButton>
            </div>
          </Panel>
        </ReactFlow>
      </div>
    </CanvasContext>
  )
}

/** Whether a node is the selected card. */
const selectedNode = (n: LayoutNode, selection: Selection | null): boolean =>
  (n.kind === "inputs" && sameSelection(selection, { kind: "inputs" })) ||
  ((n.kind === "step" || n.kind === "on-fail") && sameSelection(selection, { kind: n.kind, index: n.index }))

const sameView = (a: { x: number; y: number; zoom: number }, b: { x: number; y: number; zoom: number }) =>
  a.x === b.x && a.y === b.y && a.zoom === b.zoom
const sameSize = (a: { width: number; height: number }, b: { width: number; height: number }) =>
  a.width === b.width && a.height === b.height

function ToolbarButton({
  tip,
  keys,
  label,
  disabled = false,
  size = "icon-sm",
  onClick,
  children,
}: {
  tip: string
  keys?: string[]
  label: string
  disabled?: boolean
  size?: "icon-sm" | "sm"
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button variant="ghost" size={size} aria-label={label} disabled={disabled} onClick={onClick} />}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>
        {tip}
        {keys !== undefined ? <Shortcut keys={keys} /> : null}
      </TooltipContent>
    </Tooltip>
  )
}
