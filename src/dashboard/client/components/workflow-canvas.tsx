import {
  Background,
  BackgroundVariant,
  BaseEdge,
  type Edge,
  EdgeLabelRenderer,
  type EdgeProps,
  getSmoothStepPath,
  Handle,
  MiniMap,
  type Node as FlowNodeBase,
  type NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
} from "@xyflow/react"
import {
  ArrowDownIcon,
  ArrowRightToLineIcon,
  ArrowUpIcon,
  MinusIcon,
  PlusIcon,
  Trash2Icon,
  WrenchIcon,
} from "lucide-react"
import {
  createContext,
  type FocusEvent,
  type KeyboardEvent,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import { Separator } from "@/components/ui/separator"
import { ReorderMenu } from "@/components/reorder-menu"
import { HistoryButtons, TOOLBAR_ROW, ToolbarButton } from "@/components/toolbar"
import { AddButton, Card, CardChip, CardName, kindOf, Placeholder } from "@/components/workflow-card"
import type { DraftStore } from "@/drafts/draft-store"
import { useRootScale } from "@/hooks/use-root-scale"
import { type Drawing, type OnFailCard, sameSelection, type Selection, type StepCard } from "@/lib/workflow"
import {
  addCentre,
  type Bounds,
  CARD,
  fitView,
  layoutDrawing,
  type LayoutEdge,
  type LayoutNode,
  MINIMAP,
  minimapClears,
  ON_FAIL_WIDTH,
  onFailId,
  openView,
  overflows,
  percent,
  revealDelta,
  stepId,
  titleWidth,
  type View,
  wrappedLines,
  zoomStep,
} from "@/lib/workflow-layout"
import { MOD, modKey } from "@/shell/platform"

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

/** Where a step runs and its matrix, as its card's second line ends: `agents · opus · matrix · 5`. */
const metaOf = (...parts: (string | null)[]): string => parts.filter((p) => p !== null).join(" · ")

/**
 * The Inputs card: the workflow's inputs on its second line (one input with its description and `required`, several
 * by their names), its own errors; selecting it shows the workflow's panel.
 */
function InputsNode() {
  const { drawing, selection, onSelect, edits } = useCanvas()
  const own = { kind: "inputs" } as const
  const inputs = drawing.inputFields
  const only = inputs.length === 1 ? inputs[0] : undefined
  return (
    <>
      <Card
        label="Inputs"
        kind="inputs"
        number={<ArrowRightToLineIcon />}
        title="Inputs"
        name={
          inputs.length === 0 ? (
            "No input"
          ) : only !== undefined ? (
            <>
              <CardName fixed>{only.name}</CardName>
              {only.description !== "" ? <span className="min-w-0 truncate">{only.description}</span> : null}
              {only.required ? <CardChip>required</CardChip> : null}
            </>
          ) : (
            <CardName>{inputs.map((i) => i.name).join(", ")}</CardName>
          )
        }
        meta={inputs.length > 1 ? `${inputs.length} inputs` : null}
        errors={drawing.errors.length}
        selected={sameSelection(selection, own)}
        onSelect={() => onSelect(own)}
      />
      {edits !== null || drawing.steps.length > 0 ? <Dot type="source" position={Position.Bottom} /> : null}
    </>
  )
}

/** A step card's title: what its prompt does, its name when it says nothing, "Invalid step" for an invalid one. */
const stepTitle = (step: StepCard): string => (step.valid ? (step.description ?? step.name) : "Invalid step")

/** An on-fail card's title: what its prompt does, else its name. */
const onFailTitle = (card: OnFailCard): string => card.description ?? card.name

/**
 * A text's width in pixels at a card title's font (`text-sm`, 15px at the 16px root, at 400 in the interface's face),
 * at the root's `scale`; measured again once the fonts have loaded. `null` without a 2D canvas.
 */
function useTitleMeasure(scale: number): ((text: string) => number) | null {
  const [fonts, setFonts] = useState(0)
  useEffect(() => {
    let live = true
    const loaded = () => {
      if (live) setFonts((n) => n + 1)
    }
    void document.fonts.ready.then(loaded)
    document.fonts.addEventListener("loadingdone", loaded)
    return () => {
      live = false
      document.fonts.removeEventListener("loadingdone", loaded)
    }
  }, [])
  return useMemo(() => {
    void fonts
    const context = document.createElement("canvas").getContext("2d")
    if (context === null) return null
    context.font = `400 ${15 * scale}px ${getComputedStyle(document.body).fontFamily}`
    const widths = new Map<string, number>()
    return (text: string) => {
      const known = widths.get(text)
      if (known !== undefined) return known
      const width = context.measureText(text).width
      widths.set(text, width)
      return width
    }
  }, [scale, fonts])
}

/** A step's card: its number, what its prompt does, its name and where it runs; its menu when the canvas edits. */
function StepNode({ data }: NodeProps<FlowNode>) {
  const { drawing, selection, onSelect, edits } = useCanvas()
  const index = data.layout.kind === "step" ? data.layout.index : 0
  const step = drawing.steps[index]
  if (step === undefined) return null
  const total = drawing.steps.length
  const own = { kind: "step", index } as const
  return (
    <>
      <Dot type="target" position={Position.Top} />
      <Card
        label={`Step ${index + 1}: ${step.name}`}
        kind={kindOf(step.badge)}
        number={index + 1}
        title={stepTitle(step)}
        name={<CardName>{step.name}</CardName>}
        meta={metaOf(step.badge, step.matrix)}
        errors={step.errors.length}
        selected={sameSelection(selection, own)}
        menu={
          edits === null ? null : (
            <ReorderMenu
              label={`Step ${index + 1} actions`}
              size="icon-xs"
              triggerClassName="absolute top-1.5 right-1.5 text-muted-foreground"
              contentClassName="w-auto"
              items={[
                {
                  label: "Move up",
                  icon: <ArrowUpIcon aria-hidden="true" />,
                  disabled: index === 0,
                  onSelect: () => edits.onMove(index, -1),
                },
                {
                  label: "Move down",
                  icon: <ArrowDownIcon aria-hidden="true" />,
                  disabled: index === total - 1,
                  onSelect: () => edits.onMove(index, 1),
                },
                "separator",
                {
                  label: "Remove step",
                  icon: <Trash2Icon aria-hidden="true" />,
                  destructive: true,
                  onSelect: () => edits.onRemove(index),
                },
              ]}
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

/** A step's on-fail card, level with it at its right, dashed; selecting it opens its step's panel at `on-fail`. */
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
        kind="on-fail"
        number={<WrenchIcon />}
        title={onFailTitle(card)}
        name={<CardName>{card.name}</CardName>}
        meta={card.badge}
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
 * An edge of the column: a 1px line from a card to the next and, when the canvas edits, a round "+" always shown on
 * it, which adds a step there, centred on the line.
 */
function FlowEdgeView({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
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
      <BaseEdge id={id} path={path} interactionWidth={0} />
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

/** The dashed line from a step to its on-fail card, level with both, its label over its middle: "on fail · tries N". */
function OnFailEdgeView({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
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
      <BaseEdge id={id} path={path} interactionWidth={0} strokeDasharray="4 4" />
      <EdgeLabelRenderer>
        <div
          aria-hidden="true"
          className="absolute rounded-sm bg-canvas px-1 text-xs whitespace-nowrap text-muted-foreground"
          style={{ transform: `translate(-50%, -100%) translate(${labelX}px, ${labelY - 4}px)` }}
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
    // A line between two cards says nothing the cards' order does not, and React Flow names it by its internal ids:
    // out of the accessibility tree, with no name and no role. React Flow reads a `null` name as none (its type says
    // string). Its "+" and its pill are drawn outside it.
    ariaLabel: null as unknown as string,
    ariaRole: "presentation",
    domAttributes: { "aria-hidden": true },
  }))

/**
 * The Editor tab's canvas, on React Flow: one column of cards (Inputs, then each step with its on-fail at its right) on
 * a 16px dot grid, under a toolbar strip (Undo and Redo at its left; zoom out, the zoom, zoom in and Fit at its right),
 * and a minimap at the bottom right while the drawing overflows the view and the room right of it holds the minimap. With `edits`, a "+" on each edge and under the last card,
 * and a menu on each step card.
 */
export function WorkflowCanvas(props: {
  drawing: Drawing
  selection: Selection | null
  onSelect: (selection: Selection | null) => void
  store: DraftStore
  edits: CanvasEdits | null
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
}: {
  drawing: Drawing
  selection: Selection | null
  onSelect: (selection: Selection | null) => void
  store: DraftStore
  edits: CanvasEdits | null
}) {
  const flow = useReactFlow<FlowNode, FlowEdge>()
  const wrapper = useRef<HTMLDivElement>(null)
  const placeholder = edits?.placeholder ?? null
  const editable = edits !== null
  // The cards hold text in rem: their sizes follow the root's, which grows with the window.
  const scale = useRootScale()
  // Each card is as high as its title, which wraps whole: the lines of each, in its room less its 1px borders.
  const measure = useTitleMeasure(scale)
  const lines = useMemo(() => {
    if (measure === null) return undefined
    const counts = new Map<string, number>()
    for (const step of drawing.steps) {
      const room = titleWidth(CARD.width, editable) * scale - 2
      counts.set(stepId(step.index), wrappedLines(stepTitle(step), room, measure))
      if (step.onFail !== null)
        counts.set(
          onFailId(step.index),
          wrappedLines(onFailTitle(step.onFail), titleWidth(ON_FAIL_WIDTH, false) * scale - 2, measure),
        )
    }
    return (id: string) => counts.get(id) ?? 1
  }, [drawing, editable, scale, measure])
  const layout = useMemo(
    () => layoutDrawing(drawing, placeholder, editable, scale, lines),
    [drawing, placeholder, editable, scale, lines],
  )
  const nodes = useMemo(() => flowNodes(layout.nodes), [layout])
  const edges = useMemo(() => flowEdges(layout.edges), [layout])
  const canvas = useMemo<Canvas>(() => ({ drawing, selection, onSelect, edits }), [drawing, selection, onSelect, edits])

  /** The pane's size. */
  const pane = useCallback(() => {
    const box = wrapper.current?.getBoundingClientRect()
    return box === undefined ? null : { width: box.width, height: box.height }
  }, [])

  const bounds = layout.bounds
  /** Shows the drawing through `view`: `openView` as the canvas opens, `fitView` on Fit. */
  const show = useCallback(
    (view: (bounds: Bounds, area: { width: number; height: number }) => View) => {
      const area = pane()
      if (area === null || area.height === 0) return
      void flow.setViewport(view(bounds, area))
    },
    [flow, pane, bounds],
  )
  const fit = () => show((b, area) => fitView(b, area, scale))

  /** Pans by (`dx`, `dy`) pane pixels, at the same zoom. */
  const panBy = useCallback(
    (dx: number, dy: number) => {
      if (dx === 0 && dy === 0) return
      const v = flow.getViewport()
      void flow.setViewport({ x: v.x + dx, y: v.y + dy, zoom: v.zoom })
    },
    [flow],
  )

  // A placeholder card that appears out of view is panned in: 24px above the bottom edge, or under the top edge.
  useEffect(() => {
    if (placeholder === null) return
    const node = layout.nodes.find((n) => n.kind === "placeholder")
    const area = pane()
    if (node === undefined || area === null) return
    const v = flow.getViewport()
    const top = node.y * v.zoom + v.y
    const { dy } = revealDelta({ left: 0, right: 0, top, bottom: top + node.height * v.zoom }, area, scale)
    panBy(0, dy)
  }, [placeholder, layout, flow, pane, panBy, scale])

  /** Pans a focused card, menu or "+" into view, whole. */
  const reveal = (e: FocusEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    const area = wrapper.current?.getBoundingClientRect()
    if (area === undefined || target.closest(".react-flow__viewport") === null) return
    const r = (target.closest(".react-flow__node") ?? target).getBoundingClientRect()
    const { dx, dy } = revealDelta(
      { left: r.left - area.left, right: r.right - area.left, top: r.top - area.top, bottom: r.bottom - area.top },
      area,
      scale,
    )
    panBy(dx, dy)
  }

  const size = useStore((s) => ({ width: s.width, height: s.height }), sameSize)
  // Opened at 100% once per mount, once React Flow's viewport is ready and the pane has its size; later resizes do
  // not move the view.
  const [ready, setReady] = useState(false)
  const opened = useRef(false)
  const sized = size.width > 0 && size.height > 0
  useEffect(() => {
    if (!ready || !sized || opened.current) return
    opened.current = true
    show((b) => openView(b, scale))
  }, [ready, sized, show, scale])

  const zoom = useStore((s) => s.transform[2])
  const view = useStore((s) => ({ x: s.transform[0], y: s.transform[1], zoom: s.transform[2] }), sameView)
  const zoomBy = (delta: number) => void flow.zoomTo(zoomStep(zoom, delta))
  // The minimap stands at the bottom right while part of the drawing is out of view, only where it covers no card.
  const minimap = overflows(layout.bounds, view, size) && minimapClears(layout.bounds, view, size, scale)

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
      <div role="toolbar" aria-label="Canvas" className={TOOLBAR_ROW}>
        <HistoryButtons store={store} />
        <span className="flex-1" />
        <ToolbarButton
          tip="Zoom out"
          keys={[MOD, "-"]}
          label="Zoom out"
          disabled={zoom <= 0.5}
          onClick={() => zoomBy(-0.1)}
        >
          <MinusIcon aria-hidden="true" />
        </ToolbarButton>
        <output aria-label="Zoom" className="w-12 text-center text-foreground tabular-nums">
          {percent(zoom)}
        </output>
        <ToolbarButton tip="Zoom in" keys={[MOD, "="]} label="Zoom in" disabled={zoom >= 2} onClick={() => zoomBy(0.1)}>
          <PlusIcon aria-hidden="true" />
        </ToolbarButton>
        <Separator orientation="vertical" className="mx-1 h-4 data-vertical:self-center" />
        <ToolbarButton tip="Fit to view" keys={[MOD, "0"]} label="Fit to view" size="sm" onClick={fit}>
          Fit
        </ToolbarButton>
      </div>
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
          className="bg-canvas [--xy-edge-stroke-width:1] [--xy-edge-stroke:color-mix(in_oklab,var(--muted-foreground)_75%,transparent)]"
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1.25} color="var(--canvas-dot)" />
          {minimap ? (
            <MiniMap<FlowNode>
              ariaLabel="Minimap"
              pannable
              style={{ width: MINIMAP.width * scale, height: MINIMAP.height * scale }}
              bgColor="var(--card)"
              maskColor="color-mix(in oklab, var(--canvas) 70%, transparent)"
              maskStrokeColor="var(--border)"
              nodeColor={(n) => (selectedNode(n.data.layout, selection) ? "var(--ring)" : "var(--border)")}
              nodeBorderRadius={3}
              className="m-4 overflow-hidden rounded-lg border shadow-md"
            />
          ) : null}
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
