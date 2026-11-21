/**
 * Where the canvas draws a workflow: one column in the order of the steps (Inputs, then each step), each step's on-fail
 * card at its right, and the edges between them. Pure: no React, no DOM, no React Flow; the canvas maps the result to
 * React Flow's nodes and edges.
 */
import type { Drawing } from "./workflow"

/**
 * A card's size: 360px wide and 56px high: two lines (the title, 18px; the name and where it runs, 20px) 2px apart,
 * centred in the card, its step number in a 36px column at its left.
 */
export const CARD = { width: 360, height: 56 } as const
/** An on-fail card's width; it is as high as a card. */
export const ON_FAIL_WIDTH = 232
/** The space between two cards of the column: a 1px line, with room for a round "+" clear of both cards. */
export const GAP = 40
/** The space between a step card and its on-fail card, which stands level with it: the dashed line and its label. */
export const ON_FAIL_GAP = 112
/** The round "Add a step" button, on each line between two cards and under the last card. */
export const ADD_SIZE = 20
/**
 * The space between a line's start and its "+": the line's length less the "+", halved, so the "+" stands as far from
 * the card above as from the card below; the "+" under the last card stands as far under it.
 */
export const ADD_CLEARANCE = (GAP - ADD_SIZE) / 2
/** Where a line's "+" is centred, between a card's bottom at `sourceY` and the next card's top at `targetY`. */
export const addCentre = (sourceY: number, targetY: number): number => (sourceY + targetY) / 2

/** A node of the canvas, its top-left corner and size in flow coordinates. */
export type LayoutNode = { id: string; x: number; y: number; width: number; height: number } & (
  | { kind: "inputs" }
  | { kind: "step"; index: number }
  | { kind: "on-fail"; index: number }
  /** The outlined card where a step is being added, at `at`. */
  | { kind: "placeholder"; at: number }
  /** The round "+" under the last card, adding a step at `at` (the number of steps). */
  | { kind: "add"; at: number }
)

/** An edge of the canvas. */
export type LayoutEdge = {
  id: string
  source: string
  target: string
} & (
  | {
      kind: "flow"
      /** The index a step added on this edge takes, `null` for an edge with no "+". */
      add: number | null
    }
  | {
      kind: "on-fail"
      /** The step's `tries` as written, `null` when not set. */
      tries: string | null
    }
)

/** A rectangle in flow coordinates. */
export type Bounds = { x: number; y: number; width: number; height: number }

/** The canvas's nodes, in reading order (each step's on-fail card after it), its edges and the box holding them all. */
export type Layout = { nodes: LayoutNode[]; edges: LayoutEdge[]; bounds: Bounds }

/** The id of the node of a step, of its on-fail card, and of the Inputs card. */
export const stepId = (index: number): string => `step-${index}`
export const onFailId = (index: number): string => `on-fail-${index}`
export const INPUTS_ID = "inputs"

/**
 * The layout of a drawing. `placeholder` is the index a step being added takes (its outlined card is drawn there,
 * moving the cards after it down), `null` for none; `editable` adds a "+" on each edge into a step or the placeholder,
 * and the round "+" under the last card (none while the placeholder stands there).
 */
export function layoutDrawing(drawing: Drawing, placeholder: number | null, editable: boolean): Layout {
  const nodes: LayoutNode[] = []
  const edges: LayoutEdge[] = []
  const total = drawing.steps.length
  const column = { width: CARD.width, height: CARD.height }
  let y = 0
  let previous: string = INPUTS_ID
  nodes.push({ id: INPUTS_ID, kind: "inputs", x: 0, y, ...column })
  y += CARD.height + GAP

  /** A card of the column at the current height, joined to the one before it. */
  const place = (node: LayoutNode, add: number | null) => {
    nodes.push(node)
    edges.push({ id: `${previous}->${node.id}`, source: previous, target: node.id, kind: "flow", add })
    previous = node.id
    y += node.height + GAP
  }
  const placeholderAt = (at: number) => {
    if (placeholder !== at) return
    place({ id: "placeholder", kind: "placeholder", at, x: 0, y, ...column }, editable ? at : null)
  }

  for (const step of drawing.steps) {
    placeholderAt(step.index)
    // After the placeholder, the edge into the step has no "+": the placeholder's own edge adds at that index.
    const add = editable && placeholder !== step.index ? step.index : null
    const top = y
    place({ id: stepId(step.index), kind: "step", index: step.index, x: 0, y: top, ...column }, add)
    if (step.onFail !== null) {
      const id = onFailId(step.index)
      nodes.push({
        id,
        kind: "on-fail",
        index: step.index,
        x: CARD.width + ON_FAIL_GAP,
        y: top,
        width: ON_FAIL_WIDTH,
        height: CARD.height,
      })
      edges.push({
        id: `${stepId(step.index)}->${id}`,
        source: stepId(step.index),
        target: id,
        kind: "on-fail",
        tries: step.tries,
      })
    }
  }
  placeholderAt(total)
  if (editable && placeholder !== total) {
    const node: LayoutNode = {
      id: "add",
      kind: "add",
      at: total,
      x: (CARD.width - ADD_SIZE) / 2,
      // The column's last gap is not a line between cards: the "+" stands at a line's clearance under the last card.
      y: y - GAP + ADD_CLEARANCE,
      width: ADD_SIZE,
      height: ADD_SIZE,
    }
    nodes.push(node)
    edges.push({ id: `${previous}->add`, source: previous, target: "add", kind: "flow", add: null })
  }

  const left = Math.min(...nodes.map((n) => n.x))
  const top = Math.min(...nodes.map((n) => n.y))
  const right = Math.max(...nodes.map((n) => n.x + n.width))
  const bottom = Math.max(...nodes.map((n) => n.y + n.height))
  return { nodes, edges, bounds: { x: left, y: top, width: right - left, height: bottom - top } }
}

/** The room kept free around the drawing in the view: 24px above and below, 16px at its sides (the panel's gutter). */
export const KEEP = { top: 24, side: 16, bottom: 24 } as const

/** A view of the canvas: React Flow's viewport, the flow's origin at (`x`, `y`) on the pane, scaled by `zoom`. */
export type View = { x: number; y: number; zoom: number }

/** The zoom's range: 50% to 200%. */
const ZOOM = { min: 0.5, max: 2 } as const

/**
 * The scale that fits a drawing `box` long into `area` (its height or its width): never above 1, rounded down to a 0.1
 * step, never below the zoom's minimum (a larger drawing overflows at 0.5).
 */
const fitScale = (box: number, area: number): number =>
  Math.max(ZOOM.min, Math.floor(Math.min(1, area / box) * 10 + 1e-9) / 10)

/**
 * The view of `bounds` at `zoom`: its top 24px under the pane's top, its left edge 16px from the pane's left, on the
 * title's edge.
 */
const viewAt = (bounds: Bounds, zoom: number): View => ({
  x: KEEP.side - bounds.x * zoom,
  y: KEEP.top - bounds.y * zoom,
  zoom,
})

/**
 * The view a canvas opens with: `bounds` at 100%, its top 24px under the pane's top and its left 16px from the pane's
 * left. A drawing too tall or too wide for the pane shows its top and its left, and is panned.
 */
export function openView(bounds: Bounds): View {
  return viewAt(bounds, 1)
}

/**
 * The view that fits `bounds` in a pane `width` × `height`: the scale fits its height between the pane's top + 24px
 * and its bottom - 24px, and its width between 16px margins (`fitScale` of each, the smaller), placed as `openView`
 * places it (a drawing too tall or too wide at 0.5 shows its top and its left).
 */
export function fitView(bounds: Bounds, pane: { width: number; height: number }): View {
  const zoom = Math.min(
    fitScale(bounds.height, pane.height - KEEP.top - KEEP.bottom),
    fitScale(bounds.width, pane.width - 2 * KEEP.side),
  )
  return viewAt(bounds, zoom)
}

/** Whether part of `bounds` lies outside the pane `width` × `height` seen through `view`. */
export function overflows(bounds: Bounds, view: View, pane: { width: number; height: number }): boolean {
  const left = bounds.x * view.zoom + view.x
  const top = bounds.y * view.zoom + view.y
  const right = left + bounds.width * view.zoom
  const bottom = top + bounds.height * view.zoom
  return left < 0 || top < 0 || right > pane.width || bottom > pane.height
}

/** The minimap's size, and its margin from the pane's edges. */
export const MINIMAP = { width: 160, height: 100, margin: 16 } as const

/**
 * Whether the minimap, at the pane's bottom right, clears the drawing seen through `view`: the room right of the
 * drawing holds it with its margins. A drawing panned past the pane's right edge leaves no room.
 */
export function minimapClears(bounds: Bounds, view: View, pane: { width: number }): boolean {
  const right = (bounds.x + bounds.width) * view.zoom + view.x
  return pane.width - right >= MINIMAP.width + 2 * MINIMAP.margin
}

/**
 * How far to pan so a box (`top`…`bottom`, `left`…`right`, in pane pixels) shows whole: inside 24px at the top and
 * bottom, 16px at the sides. `{ dx: 0, dy: 0 }` when it already shows.
 */
export function revealDelta(
  box: { left: number; top: number; right: number; bottom: number },
  pane: { width: number; height: number },
): { dx: number; dy: number } {
  let dx = 0
  let dy = 0
  if (box.left < KEEP.side) dx = KEEP.side - box.left
  else if (box.right > pane.width - KEEP.side) dx = pane.width - KEEP.side - box.right
  if (box.top < KEEP.top) dy = KEEP.top - box.top
  else if (box.bottom > pane.height - KEEP.bottom) dy = pane.height - KEEP.bottom - box.bottom
  return { dx, dy }
}

/** A zoom step: the scale minus or plus 0.1, rounded to one decimal, kept within 0.5 and 2. */
export const zoomStep = (scale: number, delta: number): number =>
  Math.min(ZOOM.max, Math.max(ZOOM.min, Math.round((scale + delta) * 10) / 10))

/** The toolbar's percentage: `Math.round(scale * 100)` followed by `%`. */
export const percent = (scale: number): string => `${Math.round(scale * 100)}%`
