import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentOut, WorkflowDoc } from "../src/core/schema";
import { details } from "../src/dashboard/client/graph/details";
import { toFlow } from "../src/dashboard/client/graph/flow";
import { type Box, type Layout, layout, pillWidth } from "../src/dashboard/client/graph/layout";
import { model } from "../src/dashboard/client/graph/model";

const ROOT = join(import.meta.dirname, "..");
const GRAPH = join(ROOT, "src", "dashboard", "client", "graph");
const fixture = (name: string): WorkflowDoc =>
  JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", `${name}-workflow.json`), "utf-8").replaceAll("<home>", "/h")) as WorkflowDoc;

const agent = (name: string, step = "s"): { agent: AgentOut } => ({
  agent: { name, label: `${step}:${name}`, prompt: [`/h/prompts/${name}.md`], returns: "work", access: "read", model: "opus" },
});

/** A workflow nesting a `when` in a `when`, with a `fail` stop, a `block` stop and a gate. */
const synthetic: WorkflowDoc = {
  name: "synthetic",
  description: null,
  file: "/h/workflows/synthetic.yaml",
  input: "changes",
  commits: "/h/standards/commits.md",
  git_host: "/h/standards/git-host.md",
  pushes: false,
  working_tree: false,
  steps: [
    {
      id: "s",
      step: "s",
      agents: true,
      file: "/h/steps/s.yaml",
      description: "S",
      params: { model: { value: "opus", from: "steps/s.yaml" } },
      do: [
        agent("first"),
        { when: ["findings"], do: [agent("outer"), { when: ["confirmed"], do: [agent("inner")] }] },
        { when: ["red"], fail: true },
        { when: ["decision"], block: "why" },
      ],
    },
    { id: "gate", gate: "Continue?", agents: false },
    {
      id: "t",
      step: "t",
      agents: false,
      file: "/h/steps/t.yaml",
      description: "T",
      params: {},
      do: [{ loop: { max: 2, until: ["green"], exhausted: "fail", do: [agent("a", "t"), { when: ["red"], block: true }] } }],
    },
  ],
};

const CARDS = ["start", "agent", "gate", "stop"];
const cards = (l: Layout) => l.boxes.filter((b) => CARDS.includes(b.kind));
const box = (l: Layout, label: string) => l.boxes.find((b) => b.kind === "agent" && "label" in b.node && b.node.label === label) as Box;
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (c: Box, p: Box) => c.x >= p.x && c.y >= p.y && c.x + c.w <= p.x + p.w && c.y + c.h <= p.y + p.h;

/** No two cards overlap, every box lies inside its container, and the canvas holds every box with its margin. */
function checkGeometry(l: Layout): void {
  const list = cards(l);
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const [a, b] = [list[i] as Box, list[j] as Box];
      expect([a.path, b.path, overlap(a, b)]).toEqual([a.path, b.path, false]);
    }
  }
  const byPath = new Map(l.boxes.map((b) => [b.path, b]));
  for (const b of l.boxes) {
    let parent = b.parent === null ? undefined : byPath.get(b.parent);
    while (parent !== undefined) {
      expect([b.path, parent.path, inside(b, parent)]).toEqual([b.path, parent.path, true]);
      parent = parent.parent === null ? undefined : byPath.get(parent.parent);
    }
    expect(b.x >= 40 && b.y >= 40 && b.x + b.w <= l.width - 40 && b.y + b.h <= l.height - 40).toBe(true);
  }
  // Every pill sits on an existing flow edge, within its vertical extent.
  for (const p of l.pills) {
    const e = l.edges[p.edge];
    expect(e?.kind).toBe("flow");
    const ys = (e?.points ?? []).map((pt) => pt.y);
    expect(p.y > Math.min(...ys) && p.y < Math.max(...ys)).toBe(true);
    expect(e?.points.some((pt) => pt.x === p.x)).toBe(true);
  }
  // Every edge joins two cards.
  for (const e of l.edges) expect([CARDS.includes(byPath.get(e.source)?.kind ?? ""), CARDS.includes(byPath.get(e.target)?.kind ?? "")]).toEqual([true, true]);
}

const pillOn = (l: Layout, text: string) => l.pills.find((p) => p.text === text);

test("graph layout of agents: deterministic, no overlap, contained, aligned, counts, pills and return edges", () => {
  const doc = fixture("agents");
  const l = layout(model(doc));
  expect(layout(model(doc))).toEqual(l);
  checkGeometry(l);
  expect(box(l, "review:conformance").y).toBe(box(l, "review:correctness").y);
  expect(l.boxes.filter((b) => b.kind === "frame").length).toBe(3);
  expect(l.boxes.filter((b) => b.kind === "agent").length).toBe(10);
  expect(l.boxes.filter((b) => b.kind === "loop").length).toBe(2);
  expect(l.pills.map((p) => p.text).sort()).toEqual(["confirmed", "findings", "fixable, more", "red"]);
  expect(l.pills.every((p) => p.w === pillWidth(p.text))).toBe(true);
  expect(pillWidth("red")).toBe(38);
  const loops = l.edges.filter((e) => e.kind === "loop");
  expect(loops.map((e) => [e.source, e.target])).toEqual([
    [box(l, "review:fix-check").path, box(l, "review:correctness").path],
    [box(l, "pr:ci-fix").path, box(l, "pr:ci-wait").path],
  ]);
  // A return edge leaves the source's right side and comes back to the target's right side, inside its loop.
  const review = l.boxes.find((b) => b.path === "steps[1].do[0]") as Box;
  const [ret] = loops;
  const src = box(l, "review:fix-check");
  const dst = box(l, "review:correctness");
  expect(ret?.points).toEqual([
    { x: src.x + src.w, y: src.y + src.h / 2 },
    { x: review.x + review.w - 6, y: src.y + src.h / 2 },
    { x: review.x + review.w - 6, y: dst.y + dst.h / 2 },
    { x: dst.x + dst.w, y: dst.y + dst.h / 2 },
  ]);
  // The pill gap: 56 between the parallel group and triage, the pill centred on it.
  const triage = box(l, "review:triage");
  expect(triage.y - (dst.y + dst.h)).toBe(56);
  expect(pillOn(l, "findings")?.y).toBe(dst.y + dst.h + 28);
  expect(l.edges[pillOn(l, "findings")?.edge ?? -1]?.target).toBe(triage.path);
  // Labels and paths follow the JSON path grammar.
  expect(triage.path).toBe("steps[1].do[0].loop.do[1].do[0]");
  expect(dst.path).toBe("steps[1].do[0].loop.do[0].parallel[1]");
});

test("graph layout of engineering: the decision pill on the edge into the block stop, its return edge to implementability", () => {
  const l = layout(model(fixture("engineering")));
  expect(layout(model(fixture("engineering")))).toEqual(l);
  checkGeometry(l);
  const stop = l.boxes.find((b) => b.kind === "stop") as Box;
  expect(stop.node.kind === "stop" && stop.node.text).toBe("Block: open question");
  expect(l.edges[pillOn(l, "decision")?.edge ?? -1]?.target).toBe(stop.path);
  const loops = l.edges.filter((e) => e.kind === "loop");
  expect(loops.map((e) => [e.source, e.target])).toEqual([[stop.path, box(l, "spec-review:implementability").path]]);
  expect(box(l, "scaffold:scaffold").node).toMatchObject({ model: null });
});

test("graph layout of a when in a when, a fail stop, a block stop and a gate keeps the overlap and containment rules", () => {
  const g = model(synthetic);
  const l = layout(g);
  expect(layout(model(synthetic))).toEqual(l);
  checkGeometry(l);
  const stops = l.boxes.filter((b) => b.kind === "stop").map((b) => (b.node.kind === "stop" ? [b.node.stop, b.node.text] : []));
  expect(stops).toEqual([
    ["fail", "Fail"],
    ["block", "Block: why"],
    ["block", "Block"],
  ]);
  expect(l.boxes.filter((b) => b.kind === "gate").length).toBe(1);
  expect(l.pills.map((p) => p.text)).toEqual(["findings", "confirmed", "red", "decision", "red"]);
  expect(box(l, "s:inner").node).toMatchObject({ conditions: ["findings", "confirmed"] });
  expect(details(g, "steps[0].do[1].do[1].do[0]")).toMatchObject({ kind: "agent", runsWhen: ["findings", "confirmed"] });
  expect(details(g, "steps[1]")).toEqual({ kind: "gate", id: "gate", question: "Continue?" });
  expect(details(g, "steps[0].do[2]")).toEqual({ kind: "stop", stop: "fail", conditions: ["red"], text: "Fail" });
  expect(details(g, "nope")).toBeNull();
});

test("details of review:triage gives its returns, access, model, conditions and prompts", () => {
  expect(details(model(fixture("agents")), "steps[1].do[0].loop.do[1].do[0]")).toEqual({
    kind: "agent",
    label: "review:triage",
    name: "triage",
    returns: "verdicts",
    access: "read",
    model: "opus",
    runsWhen: ["findings"],
    prompts: ["/h/prompts/verdicts.md", "/h/prompts/triage.md"],
    params: [
      { name: "rounds", value: 1, from: "steps/review.yaml" },
      { name: "lenses", value: ["conformance", "correctness"], from: "steps/review.yaml" },
      { name: "model", value: "opus", from: "steps/review.yaml" },
      { name: "fix_model", value: "opus", from: "steps/review.yaml" },
    ],
  });
  expect(details(model(fixture("agents")), "steps[0]")).toMatchObject({ kind: "step", id: "implement", mode: "through agents" });
});

test("toFlow puts parents first, children relative to them, and one routed edge per layout edge between cards", () => {
  const l = layout(model(fixture("agents")));
  const { nodes, edges } = toFlow(l);
  expect(toFlow(l)).toEqual({ nodes, edges });
  expect(nodes.length).toBe(l.boxes.length);
  expect(edges.length).toBe(l.edges.length);
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const abs = new Map(l.boxes.map((b) => [b.path, b]));
  for (const [i, n] of nodes.entries()) {
    const b = abs.get(n.id) as Box;
    expect([n.width, n.height, n.draggable, n.type]).toEqual([b.w, b.h, false, b.kind]);
    if (n.parentId === undefined) {
      expect(n.position).toEqual({ x: b.x, y: b.y });
      continue;
    }
    expect((index.get(n.parentId) ?? Infinity) < i).toBe(true);
    const p = abs.get(n.parentId) as Box;
    expect({ x: n.position.x + p.x, y: n.position.y + p.y }).toEqual({ x: b.x, y: b.y });
  }
  const types = new Map(nodes.map((n) => [n.id, n.type]));
  for (const [i, e] of edges.entries()) {
    expect([e.id, e.type, e.sourceHandle, e.targetHandle]).toEqual([`e${i}`, "routed", "out", "in"]);
    expect([CARDS.includes(types.get(e.source) ?? ""), CARDS.includes(types.get(e.target) ?? "")]).toEqual([true, true]);
    expect(e.data?.points).toEqual(l.edges[i]?.points);
  }
  const before = box(l, "review:conformance");
  const fork = edges.filter((e) => e.data?.kind === "flow" && (e.target === before.path || e.target === box(l, "review:correctness").path));
  expect(fork.map((e) => [e.source, e.target])).toEqual([
    [box(l, "implement:implement").path, box(l, "review:conformance").path],
    [box(l, "implement:implement").path, box(l, "review:correctness").path],
  ]);
  expect(edges.filter((e) => e.data?.kind === "loop").length).toBe(2);
  const pilled = edges.filter((e) => e.data?.pill !== undefined);
  expect(pilled.map((e) => e.data?.pill).sort()).toEqual(["confirmed", "findings", "fixable, more", "red"]);
  expect(pilled.every((e) => e.data?.kind === "flow")).toBe(true);
});

test("the graph modules import only types from src/core/schema.ts and nothing from React or the DOM", () => {
  for (const f of readdirSync(GRAPH)) {
    const text = readFileSync(join(GRAPH, f), "utf-8");
    const core = [...text.matchAll(/^import (type )?.*from "((?:\.\.\/)+core\/[^"]+)";$/gm)];
    for (const m of core) expect([f, m[1], m[2]]).toEqual([f, "type ", "../../../core/schema"]);
    if (!f.endsWith(".ts")) continue;
    expect([f, /from "react"|from "react-dom|document\.|window\./.test(text)]).toEqual([f, false]);
    for (const m of text.matchAll(/^import (type )?.*from "@xyflow\/react";$/gm)) expect([f, m[1]]).toEqual([f, "type "]);
  }
});
