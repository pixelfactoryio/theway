import { expect, test } from "bun:test"
import { type Drawing, drawWorkflow } from "../src/dashboard/client/lib/workflow"
import {
  ADD_CLEARANCE,
  ADD_SIZE,
  addCentre,
  CARD,
  cardHeight,
  fitView,
  GAP,
  KEEP,
  MINIMAP,
  minimapClears,
  layoutDrawing,
  ON_FAIL_GAP,
  ON_FAIL_WIDTH,
  titleWidth,
  wrappedLines,
  openView,
  overflows,
  percent,
  revealDelta,
  zoomStep,
} from "../src/dashboard/client/lib/workflow-layout"

/** The drawing of a workflow file with these steps (YAML block list items, without their leading `- `). */
function drawing(...steps: string[]): Drawing {
  const text = `version: theway.workflow/v1beta1\nsteps:${steps.length === 0 ? " []" : ""}\n${steps.map((s) => `  - ${s}\n`).join("")}`
  const drawn = drawWorkflow(text, [], [], null)
  if (!("drawing" in drawn)) throw new Error(drawn.reason)
  return drawn.drawing
}

const ROW = CARD.height + GAP
const THREE = drawing(
  "uses: prompts/a.md",
  "uses: prompts/b.md\n    on-fail: prompts/fix.md\n    tries: 2",
  "uses: prompts/c.md",
)

test("the column is Inputs then each step in order, one card and a gap apart, each on-fail card level at its step's right", () => {
  const { nodes } = layoutDrawing(THREE, null, false)
  expect(nodes.map((n) => [n.id, n.x, n.y, n.width, n.height])).toEqual([
    ["inputs", 0, 0, CARD.width, CARD.height],
    ["step-0", 0, ROW, CARD.width, CARD.height],
    ["step-1", 0, 2 * ROW, CARD.width, CARD.height],
    ["on-fail-1", CARD.width + ON_FAIL_GAP, 2 * ROW, ON_FAIL_WIDTH, CARD.height],
    ["step-2", 0, 3 * ROW, CARD.width, CARD.height],
  ])
})

test("the cards are 360 by 56 and stand 40px apart; an on-fail card stands 112px to the right of its step", () => {
  expect(CARD).toEqual({ width: 360, height: 56 })
  expect([GAP, ON_FAIL_GAP]).toEqual([40, 112])
  const { nodes } = layoutDrawing(THREE, null, false)
  const at = (id: string) => nodes.find((n) => n.id === id)!
  expect(at("step-1").y - (at("step-0").y + CARD.height)).toBe(40)
  expect(at("on-fail-1").x - (at("step-1").x + CARD.width)).toBe(112)
})

test("a line's '+' stands centred between the card above and the card below, as far from each; the last '+' as far under its card", () => {
  expect(ADD_CLEARANCE).toBe(10)
  // A line from a card's bottom at 100 to the next card's top at 140: the "+" is 20px.
  const centre = addCentre(100, 100 + GAP)
  const top = centre - ADD_SIZE / 2
  const bottom = centre + ADD_SIZE / 2
  expect(top - 100).toBe(ADD_CLEARANCE)
  expect(100 + GAP - bottom).toBe(ADD_CLEARANCE)
  const { nodes } = layoutDrawing(THREE, null, true)
  const add = nodes.find((n) => n.kind === "add")!
  expect(add.y - (3 * ROW + CARD.height)).toBe(ADD_CLEARANCE)
})

test("read-only, the edges join the column with lines and no '+', and the on-fail edge carries its tries", () => {
  const { edges } = layoutDrawing(THREE, null, false)
  expect(edges).toEqual([
    { id: "inputs->step-0", source: "inputs", target: "step-0", kind: "flow", add: null },
    { id: "step-0->step-1", source: "step-0", target: "step-1", kind: "flow", add: null },
    { id: "step-1->on-fail-1", source: "step-1", target: "on-fail-1", kind: "on-fail", tries: "2" },
    { id: "step-1->step-2", source: "step-1", target: "step-2", kind: "flow", add: null },
  ])
})

test("editable, each edge into a step adds a step at its index, and the round '+' under the last card adds at the end", () => {
  const { nodes, edges } = layoutDrawing(THREE, null, true)
  expect(edges.filter((e) => e.kind === "flow").map((e) => [e.target, e.kind === "flow" ? e.add : null])).toEqual([
    ["step-0", 0],
    ["step-1", 1],
    ["step-2", 2],
    ["add", null],
  ])
  expect(edges.at(-1)).toMatchObject({ source: "step-2", target: "add", add: null })
  expect(nodes.at(-1)).toEqual({
    id: "add",
    kind: "add",
    at: 3,
    x: (CARD.width - ADD_SIZE) / 2,
    y: 3 * ROW + CARD.height + ADD_CLEARANCE,
    width: ADD_SIZE,
    height: ADD_SIZE,
  })
})

test("the placeholder stands where the step goes in, moving the cards after it down; its edge in keeps the '+'", () => {
  const { nodes, edges } = layoutDrawing(THREE, 1, true)
  expect(nodes.map((n) => [n.id, n.y])).toEqual([
    ["inputs", 0],
    ["step-0", ROW],
    ["placeholder", 2 * ROW],
    ["step-1", 3 * ROW],
    ["on-fail-1", 3 * ROW],
    ["step-2", 4 * ROW],
    ["add", 4 * ROW + CARD.height + ADD_CLEARANCE],
  ])
  const into = (target: string) => edges.find((e) => e.target === target)
  expect(into("placeholder")).toMatchObject({ source: "step-0", add: 1 })
  expect(into("step-1")).toMatchObject({ source: "placeholder", add: null })
})

test("a placeholder at the end replaces the round '+' under the last card", () => {
  const { nodes, edges } = layoutDrawing(THREE, 3, true)
  expect(nodes.map((n) => n.id).slice(-2)).toEqual(["step-2", "placeholder"])
  expect(edges.at(-1)).toMatchObject({ source: "step-2", target: "placeholder", add: 3 })
})

test("no steps: Inputs alone read-only, Inputs and the '+' editable; the bounds hold every node", () => {
  const none = drawing()
  expect(layoutDrawing(none, null, false)).toEqual({
    nodes: [{ id: "inputs", kind: "inputs", x: 0, y: 0, ...CARD }],
    edges: [],
    bounds: { x: 0, y: 0, ...CARD },
  })
  const editable = layoutDrawing(none, null, true)
  expect(editable.nodes.map((n) => n.id)).toEqual(["inputs", "add"])
  expect(editable.bounds).toEqual({ x: 0, y: 0, width: CARD.width, height: CARD.height + ADD_CLEARANCE + ADD_SIZE })
  expect(layoutDrawing(THREE, null, false).bounds).toEqual({
    x: 0,
    y: 0,
    width: CARD.width + ON_FAIL_GAP + ON_FAIL_WIDTH,
    height: 3 * ROW + CARD.height,
  })
})

test("a canvas opens at 100%, its top 24px under the pane's top and its left 16px from the pane's left", () => {
  const bounds = { x: 0, y: 0, width: 300, height: 500 }
  // Room for it all: its left 16px from the pane's left, its top 24px under the pane's top.
  expect(openView(bounds)).toEqual({ x: KEEP.side, y: KEEP.top, zoom: 1 })
  expect(KEEP).toEqual({ top: 24, side: 16, bottom: 24 })
  // Too tall: still 100%, from its top.
  expect(openView(bounds)).toEqual({ x: KEEP.side, y: KEEP.top, zoom: 1 })
  // Too wide: still 100%, its left edge 16px from the pane's left.
  expect(openView({ x: 0, y: 0, width: 900, height: 100 })).toEqual({
    x: KEEP.side,
    y: KEEP.top,
    zoom: 1,
  })
})

test("fit: between 50% and 100% for height and width, the top 24px under the pane's top, its left 16px from the pane's left", () => {
  const bounds = { x: 0, y: 0, width: 300, height: 500 }
  // Room for it all at 100%: on the pane's left edge.
  expect(fitView(bounds, { width: 800, height: 900 })).toEqual({ x: KEEP.side, y: KEEP.top, zoom: 1 })
  // Too tall: the largest 0.1 step that fits the height, never below 0.5.
  expect(fitView(bounds, { width: 800, height: KEEP.top + 450 + KEEP.bottom }).zoom).toBe(0.9)
  expect(fitView(bounds, { width: 800, height: KEEP.top + 300 + KEEP.bottom }).zoom).toBe(0.6)
  expect(fitView(bounds, { width: 800, height: 100 }).zoom).toBe(0.5)
  // Too wide: the width's step wins (568 of 700 is 0.81); too wide at 0.5, its left edge 16px from the pane's left.
  expect(fitView({ x: 0, y: 0, width: 700, height: 100 }, { width: 600, height: 900 }).zoom).toBe(0.8)
  expect(fitView({ x: 0, y: 0, width: 1400, height: 100 }, { width: 600, height: 900 })).toEqual({
    x: KEEP.side,
    y: KEEP.top,
    zoom: 0.5,
  })
})

test("zoom steps by 0.1 within 50% and 200%, shown as a whole percent", () => {
  expect([zoomStep(1, 0.1), zoomStep(0.5, -0.1), zoomStep(1.95, 0.1), zoomStep(0.73, -0.1)]).toEqual([1.1, 0.5, 2, 0.6])
  expect([percent(1), percent(0.734), percent(2)]).toEqual(["100%", "73%", "200%"])
})

test("the drawing overflows when any edge of it leaves the pane; a box out of view pans in, 24px inside its top and bottom, 16px inside its sides", () => {
  const bounds = { x: 0, y: 0, width: 300, height: 500 }
  const pane = { width: 800, height: 600 }
  expect(overflows(bounds, { x: 10, y: 10, zoom: 1 }, pane)).toBe(false)
  expect(overflows(bounds, { x: 10, y: 10, zoom: 1.2 }, pane)).toBe(true)
  expect(overflows(bounds, { x: -1, y: 10, zoom: 1 }, pane)).toBe(true)
  expect(revealDelta({ left: 100, right: 400, top: 100, bottom: 172 }, pane)).toEqual({ dx: 0, dy: 0 })
  expect(revealDelta({ left: 100, right: 400, top: 560, bottom: 632 }, pane)).toEqual({
    dx: 0,
    dy: pane.height - KEEP.bottom - 632,
  })
  expect(revealDelta({ left: -50, right: 250, top: -10, bottom: 62 }, pane)).toEqual({ dx: 66, dy: 34 })
  expect(revealDelta({ left: 700, right: 1000, top: 100, bottom: 172 }, pane)).toEqual({ dx: -216, dy: 0 })
})

test("the minimap shows only where the room right of the drawing holds it with its 16px margins", () => {
  const bounds = { x: 0, y: 0, width: 400, height: 900 }
  const room = 400 + MINIMAP.width + 2 * MINIMAP.margin
  expect(minimapClears(bounds, { x: 0, y: 0, zoom: 1 }, { width: room })).toBe(true)
  expect(minimapClears(bounds, { x: 1, y: 0, zoom: 1 }, { width: room })).toBe(false)
  expect(minimapClears(bounds, { x: 0, y: 0, zoom: 0.5 }, { width: 200 + MINIMAP.width + 2 * MINIMAP.margin })).toBe(
    true,
  )
})

test("at a larger root every size and space of the drawing, the view's margins and the minimap's room grow by its scale", () => {
  const scale = 1.125
  const at1 = layoutDrawing(THREE, null, true)
  const scaled = layoutDrawing(THREE, null, true, scale)
  expect(scaled.nodes.map((n) => [n.id, n.x, n.y, n.width, n.height])).toEqual(
    at1.nodes.map((n) => [n.id, n.x * scale, n.y * scale, n.width * scale, n.height * scale]),
  )
  expect(scaled.bounds).toEqual({
    x: 0,
    y: 0,
    width: at1.bounds.width * scale,
    height: at1.bounds.height * scale,
  })
  const bounds = { x: 0, y: 0, width: 300, height: 500 }
  expect(openView(bounds, scale)).toEqual({ x: KEEP.side * scale, y: KEEP.top * scale, zoom: 1 })
  expect(fitView(bounds, { width: 800, height: 900 }, scale)).toEqual({
    x: KEEP.side * scale,
    y: KEEP.top * scale,
    zoom: 1,
  })
  const pane = { width: 800, height: 600 }
  expect(revealDelta({ left: 10, right: 100, top: 100, bottom: 172 }, pane, scale)).toEqual({
    dx: KEEP.side * scale - 10,
    dy: 0,
  })
  const room = 400 + (MINIMAP.width + 2 * MINIMAP.margin) * scale
  expect(minimapClears({ x: 0, y: 0, width: 400, height: 900 }, { x: 0, y: 0, zoom: 1 }, { width: room }, scale)).toBe(
    true,
  )
  expect(minimapClears({ x: 0, y: 0, width: 400, height: 900 }, { x: 1, y: 0, zoom: 1 }, { width: room }, scale)).toBe(
    false,
  )
})

test("a card is as high as its title: 22px more per line, a step and its on-fail card level at the taller", () => {
  expect([cardHeight(1), cardHeight(3), cardHeight(0)]).toEqual([56, 100, 56])
  expect([titleWidth(360, false), titleWidth(360, true), titleWidth(232, false)]).toEqual([296, 272, 168])
  const lines: Record<string, number> = { inputs: 1, "step-0": 2, "step-1": 1, "on-fail-1": 3, "step-2": 1 }
  const { nodes } = layoutDrawing(THREE, null, false, 1, (id) => lines[id] ?? 1)
  expect(nodes.map((n) => [n.id, n.y, n.height])).toEqual([
    ["inputs", 0, 56],
    ["step-0", 56 + GAP, 78],
    ["step-1", 56 + GAP + 78 + GAP, 100],
    ["on-fail-1", 56 + GAP + 78 + GAP, 100],
    ["step-2", 56 + GAP + 78 + GAP + 100 + GAP, 56],
  ])
})

test("a title wraps at spaces as the browser wraps it, a word wider than a line broken where the line is full", () => {
  // Every character 10px wide.
  const measure = (text: string) => text.length * 10
  expect(wrappedLines("", 100, measure)).toBe(1)
  expect(wrappedLines("one two", 100, measure)).toBe(1)
  expect(wrappedLines("one two three", 100, measure)).toBe(2)
  expect(wrappedLines("aaaa bbbb cccc dddd", 90, measure)).toBe(2)
  expect(wrappedLines("x".repeat(25), 100, measure)).toBe(3)
  expect(wrappedLines("ab " + "x".repeat(25), 100, measure)).toBe(4)
})
