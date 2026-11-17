/**
 * Where the canvas draws a workflow: one column in the order of the steps (Inputs, then each step), each step's on-fail
 * card at its right, and the edges between them. Pure: no React, no DOM, no React Flow; the canvas maps the result to
 * React Flow's nodes and edges.
 */
import type { Drawing } from "./workflow"

/** A card's size: 300px wide and 72px high (12px padding, a 24px header row, 4px, a 20px second row, 12px). */
export const CARD = { width: 300, height: 72 } as const
/** An on-fail card's width; it is as high as a card. */
export const ON_FAIL_WIDTH = 232
/** The space between two cards of the column: room for a round "+" clear of both cards and of the arrow head. */
export const GAP = 64
/** The space between a step card and its on-fail card. */
export const ON_FAIL_GAP = 160
/** How far an on-fail card stands above its step card, so the dashed edge bends and its pill sits on the bend. */
export const ON_FAIL_RISE = 40
/** The round "Add a step" button, on each line between two cards and under the last card. */
export const ADD_SIZE = 20
/**
 * The room an edge's arrow head takes above the card it points to: React Flow's closed arrow, 14px at the edges' 1.5
 * stroke, is 5.25px long, and its own stroke.
 */
export const ARROW = 6
/**
 * The space between a line's start and its "+": the line's room above the arrow head, less the "+", halved. The "+"
 * stands centred in that room, as far from the card above as from the arrow head below; the "+" under the last card
 * stands as far under it.
 */
export const ADD_CLEARANCE = (GAP - ARROW - ADD_SIZE) / 2
/** Where a line's "+" is centred, between a card's bottom at `sourceY` and the next card's top at `targetY`. */
export const addCentre = (sourceY: number, targetY: number): number => (sourceY + targetY - ARROW) / 2

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
      /** Whether the edge ends in an arrow head (not toward the "+" under the last card). */
      arrow: boolean
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
    edges.push({ id: `${previous}->${node.id}`, source: previous, target: node.id, kind: "flow", add, arrow: true })
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
        y: top - ON_FAIL_RISE,
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
    edges.push({ id: `${previous}->add`, source: previous, target: "add", kind: "flow", add: null, arrow: false })
  }

  const left = Math.min(...nodes.map((n) => n.x))
  const top = Math.min(...nodes.map((n) => n.y))
  const right = Math.max(...nodes.map((n) => n.x + n.width))
  const bottom = Math.max(...nodes.map((n) => n.y + n.height))
  return { nodes, edges, bounds: { x: left, y: top, width: right - left, height: bottom - top } }
}

/** The room kept free around the drawing in the view: 16px at the top and sides, and the toolbar's band at the bottom. */
export const KEEP = { top: 16, side: 16, bottom: 68 } as const

/** A view of the canvas: React Flow's viewport, the flow's origin at (`x`, `y`) on the pane, scaled by `zoom`. */
export type View = { x: number; y: number; zoom: number }

/**
 * The scale that fits a drawing `box` long into `area` (its height or its width): never above 1, rounded down to a 0.1
 * step, never below 0.8 (a larger drawing overflows at 0.8).
 */
export const fitScale = (box: number, area: number): number =>
  Math.max(0.8, Math.floor(Math.min(1, area / box) * 10 + 1e-9) / 10)

/** The space between the page's heading, drawn over the canvas's top, and the drawing it fits. */
export const UNDER_HEADING = 24

/**
 * The view that fits `bounds` in a pane `width` × `height` whose top `heading` pixels hold the page's heading: the
 * scale fits its height between the heading + 24px (or the pane's top + 16px without one) and the toolbar's band, and
 * its width between 16px margins (`fitScale` of each, the smaller), its top at that line; it is centred across the
 * pane when it fits between the margins, else its left edge stands 16px from the pane's left (a drawing too tall or too
 * wide at 0.8 shows its top and its left).
 */
export function fitView(bounds: Bounds, pane: { width: number; height: number }, heading = 0): View {
  const top = heading > 0 ? heading + UNDER_HEADING : KEEP.top
  const zoom = Math.min(
    fitScale(bounds.height, pane.height - top - KEEP.bottom),
    fitScale(bounds.width, pane.width - 2 * KEEP.side),
  )
  const shown = bounds.width * zoom
  const x = shown <= pane.width - 2 * KEEP.side ? (pane.width - shown) / 2 : KEEP.side
  return { x: x - bounds.x * zoom, y: top - bounds.y * zoom, zoom }
}

/** Whether part of `bounds` lies outside the pane `width` × `height` seen through `view`. */
export function overflows(bounds: Bounds, view: View, pane: { width: number; height: number }): boolean {
  const left = bounds.x * view.zoom + view.x
  const top = bounds.y * view.zoom + view.y
  const right = left + bounds.width * view.zoom
  const bottom = top + bounds.height * view.zoom
  return left < 0 || top < 0 || right > pane.width || bottom > pane.height
}

/**
 * How far to pan so a box (`top`…`bottom`, `left`…`right`, in pane pixels) shows whole: inside 16px at the top and
 * sides, and above the toolbar's band. `{ dx: 0, dy: 0 }` when it already shows.
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
  Math.min(2, Math.max(0.5, Math.round((scale + delta) * 10) / 10))

/** The toolbar's percentage: `Math.round(scale * 100)` followed by `%`. */
export const percent = (scale: number): string => `${Math.round(scale * 100)}%`
