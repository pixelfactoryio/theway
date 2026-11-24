/**
 * Where the canvas draws a workflow: one column in the order of the steps (Inputs, then each step), each step's on-fail
 * card at its right, and the edges between them. Pure: no React, no DOM, no React Flow; the canvas maps the result to
 * React Flow's nodes and edges.
 */
import type { Drawing } from "./workflow"

/**
 * The canvas's sizes are given in pixels at the 16px root and multiplied by the root's scale (`rootScale`): the cards
 * hold text in rem, so they grow with it as the root grows with the window.
 *
 * A card's size: 360px wide and 56px high: two lines (the title and the name with where it runs, each a `text-sm`
 * line, 22px) 2px apart, centred in the card, its step number in a 28px tile at its left. A title on more lines (it
 * wraps whole) makes its card 22px higher per line (`cardHeight`).
 */
export const CARD = { width: 360, height: 56 } as const
/** A title's line: `text-sm`, 22px. */
export const TITLE_LINE = 22
/** A card's height for a title on `lines` lines, at the 16px root. */
export const cardHeight = (lines: number): number => CARD.height + (Math.max(1, lines) - 1) * TITLE_LINE
/**
 * The width a card `width` wide gives its title, at the 16px root: less the tile's 12px margin and 28px, the text's
 * 12px sides, and the 24px kept for the step's menu when it has one (`menu`).
 */
export const titleWidth = (width: number, menu: boolean): number => width - 12 - 28 - 24 - (menu ? 24 : 0)

/**
 * The lines `text` takes in `width` pixels, wrapped as the browser wraps it (`overflow-wrap: break-word`): at spaces,
 * each line taking as many words as fit, and a word wider than a line broken where the line is full. `measure` gives a
 * text's width in pixels.
 */
export function wrappedLines(text: string, width: number, measure: (text: string) => number): number {
  const words = text.split(/\s+/).filter((w) => w !== "")
  if (words.length === 0 || width <= 0) return 1
  let lines = 1
  let line = ""
  for (const word of words) {
    const next = line === "" ? word : `${line} ${word}`
    if (measure(next) <= width) {
      line = next
      continue
    }
    if (line !== "") lines += 1
    // A word wider than a line fills lines with its characters, and its rest starts the next line.
    let rest = word
    while (measure(rest) > width && rest.length > 1) {
      let fit = 1
      while (fit < rest.length && measure(rest.slice(0, fit + 1)) <= width) fit += 1
      rest = rest.slice(fit)
      lines += 1
    }
    line = rest
  }
  return lines
}
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
 * and the round "+" under the last card (none while the placeholder stands there). `scale` is the root's scale
 * (`rootScale`), which multiplies every size and space. `lines` gives the lines of a card's title by its node's id
 * (one when not given): a step and its on-fail card, level, are as high as the taller title asks.
 */
export function layoutDrawing(
  drawing: Drawing,
  placeholder: number | null,
  editable: boolean,
  scale = 1,
  lines: (id: string) => number = () => 1,
): Layout {
  const nodes: LayoutNode[] = []
  const edges: LayoutEdge[] = []
  const total = drawing.steps.length
  const card = { width: CARD.width * scale, height: CARD.height * scale }
  const gap = GAP * scale
  const addSize = ADD_SIZE * scale
  const column = { width: card.width, height: card.height }
  let y = 0
  let previous: string = INPUTS_ID
  const inputsHeight = cardHeight(lines(INPUTS_ID)) * scale
  nodes.push({ id: INPUTS_ID, kind: "inputs", x: 0, y, width: card.width, height: inputsHeight })
  y += inputsHeight + gap

  /** A card of the column at the current height, joined to the one before it. */
  const place = (node: LayoutNode, add: number | null) => {
    nodes.push(node)
    edges.push({ id: `${previous}->${node.id}`, source: previous, target: node.id, kind: "flow", add })
    previous = node.id
    y += node.height + gap
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
    const own = lines(stepId(step.index))
    const height = cardHeight(step.onFail !== null ? Math.max(own, lines(onFailId(step.index))) : own) * scale
    place({ id: stepId(step.index), kind: "step", index: step.index, x: 0, y: top, width: card.width, height }, add)
    if (step.onFail !== null) {
      const id = onFailId(step.index)
      nodes.push({
        id,
        kind: "on-fail",
        index: step.index,
        x: card.width + ON_FAIL_GAP * scale,
        y: top,
        width: ON_FAIL_WIDTH * scale,
        height,
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
      x: (card.width - addSize) / 2,
      // The column's last gap is not a line between cards: the "+" stands at a line's clearance under the last card.
      y: y - gap + ADD_CLEARANCE * scale,
      width: addSize,
      height: addSize,
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

/**
 * The room kept free around the drawing in the view: 24px above and below, 16px at its sides (the panel's gutter), at
 * the 16px root; each view function takes the root's `scale`.
 */
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
const viewAt = (bounds: Bounds, zoom: number, scale: number): View => ({
  x: KEEP.side * scale - bounds.x * zoom,
  y: KEEP.top * scale - bounds.y * zoom,
  zoom,
})

/**
 * The view a canvas opens with: `bounds` at 100%, its top 24px under the pane's top and its left 16px from the pane's
 * left. A drawing too tall or too wide for the pane shows its top and its left, and is panned.
 */
export function openView(bounds: Bounds, scale = 1): View {
  return viewAt(bounds, 1, scale)
}

/**
 * The view that fits `bounds` in a pane `width` × `height`: the scale fits its height between the pane's top + 24px
 * and its bottom - 24px, and its width between 16px margins (`fitScale` of each, the smaller), placed as `openView`
 * places it (a drawing too tall or too wide at 0.5 shows its top and its left).
 */
export function fitView(bounds: Bounds, pane: { width: number; height: number }, scale = 1): View {
  const zoom = Math.min(
    fitScale(bounds.height, pane.height - (KEEP.top + KEEP.bottom) * scale),
    fitScale(bounds.width, pane.width - 2 * KEEP.side * scale),
  )
  return viewAt(bounds, zoom, scale)
}

/** Whether part of `bounds` lies outside the pane `width` × `height` seen through `view`. */
export function overflows(bounds: Bounds, view: View, pane: { width: number; height: number }): boolean {
  const left = bounds.x * view.zoom + view.x
  const top = bounds.y * view.zoom + view.y
  const right = left + bounds.width * view.zoom
  const bottom = top + bounds.height * view.zoom
  return left < 0 || top < 0 || right > pane.width || bottom > pane.height
}

/** The minimap's size, and its margin from the pane's edges, at the 16px root. */
export const MINIMAP = { width: 160, height: 100, margin: 16 } as const

/**
 * Whether the minimap, at the pane's bottom right, clears the drawing seen through `view`: the room right of the
 * drawing holds it with its margins. A drawing panned past the pane's right edge leaves no room.
 */
export function minimapClears(bounds: Bounds, view: View, pane: { width: number }, scale = 1): boolean {
  const right = (bounds.x + bounds.width) * view.zoom + view.x
  return pane.width - right >= (MINIMAP.width + 2 * MINIMAP.margin) * scale
}

/**
 * How far to pan so a box (`top`…`bottom`, `left`…`right`, in pane pixels) shows whole: inside 24px at the top and
 * bottom, 16px at the sides. `{ dx: 0, dy: 0 }` when it already shows.
 */
export function revealDelta(
  box: { left: number; top: number; right: number; bottom: number },
  pane: { width: number; height: number },
  scale = 1,
): { dx: number; dy: number } {
  const side = KEEP.side * scale
  const above = KEEP.top * scale
  const below = KEEP.bottom * scale
  let dx = 0
  let dy = 0
  if (box.left < side) dx = side - box.left
  else if (box.right > pane.width - side) dx = pane.width - side - box.right
  if (box.top < above) dy = above - box.top
  else if (box.bottom > pane.height - below) dy = pane.height - below - box.bottom
  return { dx, dy }
}

/** A zoom step: the scale minus or plus 0.1, rounded to one decimal, kept within 0.5 and 2. */
export const zoomStep = (scale: number, delta: number): number =>
  Math.min(ZOOM.max, Math.max(ZOOM.min, Math.round((scale + delta) * 10) / 10))

/** The toolbar's percentage: `Math.round(scale * 100)` followed by `%`. */
export const percent = (scale: number): string => `${Math.round(scale * 100)}%`
