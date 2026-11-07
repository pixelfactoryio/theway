import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Document } from "yaml";
import type { Overlay } from "../src/core/io";
import { resolveStepFile, resolveWorkflow } from "../src/core/workflow";
import {
  insertEntry,
  insertNode,
  moveEntry,
  newStepText,
  newWorkflowText,
  parse,
  removeEntry,
  removeNode,
  setEntryAgents,
  setEntryParam,
  setNodeField,
  setParam,
  setWorkflowField,
  textOf,
} from "../src/dashboard/client/editor/ops";
import { type StepSource, sourceModel } from "../src/dashboard/client/editor/source";
import { type Box, foreachCaption, type Layout, layout, loopCaption } from "../src/dashboard/client/graph/layout";
import type { Graph } from "../src/dashboard/client/graph/model";

const SHIPPED_HOME = join(import.meta.dirname, "..", "plugin", "home");
const shipped = (rel: string) => readFileSync(join(SHIPPED_HOME, rel), "utf-8");

/** A home holding the shipped config, convention standards, workflows, steps and prompts, and a project `p`. */
const HOME = (() => {
  const dir = mkdtempSync(join(tmpdir(), "theway-ops-"));
  const put = (rel: string, text: string) => {
    mkdirSync(join(dir, rel, ".."), { recursive: true });
    writeFileSync(join(dir, rel), text);
  };
  for (const rel of ["config.yaml", "standards/commits.md", "standards/git-host.md"]) put(rel, shipped(rel));
  for (const folder of ["workflows", "steps", "prompts"]) for (const f of readdirSync(join(SHIPPED_HOME, folder))) put(`${folder}/${f}`, shipped(`${folder}/${f}`));
  mkdirSync(join(dir, "projects", "p"), { recursive: true });
  return dir;
})();
afterAll(() => rmSync(HOME, { recursive: true, force: true }));

const quiet = () => {};
const overlay = (kind: string, name: string, text: string): Overlay => new Map([[join(HOME, "projects", "p", kind, `${name}.yaml`), text]]);

/** The workflow `agents` resolved with `text` as its project file; the error line when it does not resolve. */
function resolvesAsAgents(text: string): string | null {
  const r = resolveWorkflow(HOME, "p", "agents", quiet, overlay("workflows", "agents", text));
  return "error" in r ? r.error : null;
}

/** The step `review` resolved with `text` as its project file, and `agents` with it; the first error line. */
function resolvesAsReview(text: string): string | null {
  const o = overlay("steps", "review", text);
  const step = resolveStepFile(HOME, "p", "review", quiet, o);
  if ("error" in step) return step.error;
  const r = resolveWorkflow(HOME, "p", "agents", quiet, o);
  return "error" in r ? r.error : null;
}

/** Every comment of a text: from the first `#` of a line to its end. */
const comments = (text: string): string[] =>
  text
    .split("\n")
    .filter((l) => l.includes("#"))
    .map((l) => l.slice(l.indexOf("#")).trim());

/** `text` with a full-line comment before every list item and an inline comment on every list item line. */
function commented(text: string): string {
  let n = 0;
  return text
    .split("\n")
    .flatMap((line) => {
      const m = /^(\s*)- /.exec(line);
      if (m === null) return [line];
      n += 1;
      return [`${m[1]}# before item ${n}`, `${line} # on item ${n}`];
    })
    .join("\n");
}

const AGENTS = shipped("workflows/agents.yaml");
const REVIEW = shipped("steps/review.yaml");

/** Runs `op` on a document of `text`, then checks every comment survives and the result resolves. */
function check(text: string, op: (doc: Document) => void, resolves: (text: string) => string | null): string {
  const doc = parse(text);
  op(doc);
  const out = textOf(doc);
  for (const c of comments(text)) expect([c, out.includes(c)]).toEqual([c, true]);
  expect(resolves(out)).toBeNull();
  return out;
}

test("the shipped files and their commented copies round-trip byte for byte, and each copy resolves", () => {
  for (const dir of ["workflows", "steps"]) {
    for (const f of readdirSync(join(SHIPPED_HOME, dir))) {
      const text = shipped(`${dir}/${f}`);
      expect([f, textOf(parse(text))]).toEqual([f, text]);
    }
  }
  expect(commented(AGENTS)).toContain("  # before item 1\n  - implement: # on item 1\n");
  expect(resolvesAsAgents(commented(AGENTS))).toBeNull();
  expect(resolvesAsReview(commented(REVIEW))).toBeNull();
});

for (const [label, wf, step] of [
  ["shipped", AGENTS, REVIEW],
  ["commented", commented(AGENTS), commented(REVIEW)],
] as const) {
  test(`workflow operations on the ${label} agents.yaml keep every comment and resolve`, () => {
    const gated = check(wf, (d) => insertEntry(d, 2, { gate: "Ready to open the PR?" }), resolvesAsAgents);
    expect(gated).toContain("- gate: Ready to open the PR?");
    expect(gated.indexOf("gate:")).toBeLessThan(gated.indexOf("- pr:"));

    const moved = check(wf, (d) => moveEntry(d, 1, 0), resolvesAsAgents);
    expect(moved.indexOf("- review:")).toBeLessThan(moved.indexOf("- implement:"));

    const rounds = check(wf, (d) => setEntryParam(d, 1, "rounds", 2), resolvesAsAgents);
    expect(rounds).toContain("- review: {rounds: 2}");
    const r = resolveWorkflow(HOME, "p", "agents", quiet, overlay("workflows", "agents", rounds));
    expect("doc" in r && r.doc.steps[1] !== undefined && "params" in r.doc.steps[1] && r.doc.steps[1].params.rounds?.value).toBe(2);
    const cleared = check(rounds, (d) => setEntryParam(d, 1, "rounds", undefined), resolvesAsAgents);
    if (label === "shipped") expect(cleared).toBe(wf);

    const inline = check(wf, (d) => setEntryAgents(d, 0, false), resolvesAsAgents);
    expect(inline).toContain("- implement: {agents: false}");
    const mode = check(inline, (d) => setEntryAgents(d, 0, undefined), resolvesAsAgents);
    if (label === "shipped") expect(mode).toBe(wf);

    const removed = check(wf, (d) => removeEntry(d, 1), resolvesAsAgents);
    expect(removed).not.toContain("- review:");

    const described = check(wf, (d) => setWorkflowField(d, "description", undefined), resolvesAsAgents);
    expect(described).not.toContain("description:");
    const back = check(described, (d) => setWorkflowField(d, "description", "Again"), resolvesAsAgents);
    expect(back).toContain("version: theway.workflow/v1\ndescription: Again\n");
  });

  test(`step operations on the ${label} review.yaml keep every comment and resolve`, () => {
    const added = check(
      step,
      (d) => insertNode(d, ["do", 0, "loop", "do"], 3, { when: "findings", do: [{ agent: { prompt: ["verdicts", "triage"], returns: "verdicts" } }] }),
      resolvesAsReview,
    );
    expect(added.match(/prompt: \[verdicts, triage\]/g)?.length).toBe(2);

    const agent = check(step, (d) => insertNode(d, ["do", 0, "loop", "do", 2, "do"], 2, { agent: { prompt: "fix-check", returns: "resolutions", model: "${model}" } }), resolvesAsReview);
    expect(agent).toContain('- agent: {prompt: fix-check, returns: resolutions, model: "${model}"}');

    const deleted = check(step, (d) => removeNode(d, ["do", 0, "loop", "do", 2, "do", 1]), resolvesAsReview);
    expect(deleted).not.toContain("fix-check");

    const param = check(step, (d) => setParam(d, "rounds", { default: 2, description: "Maximum review rounds" }), resolvesAsReview);
    expect(param).toContain("rounds: {default: 2, description: Maximum review rounds}");

    const sonnet = check(step, (d) => setNodeField(d, ["do", 0, "loop", "do", 1, "do", 0], "model", "sonnet"), resolvesAsReview);
    expect(sonnet).toContain("- agent: {prompt: [verdicts, triage], returns: verdicts, model: sonnet}");
    const max = check(step, (d) => setNodeField(d, ["do", 0, "loop"], "max", 3), resolvesAsReview);
    expect(max).toContain("max: 3");
    const serial = check(step, (d) => setNodeField(d, ["do", 0, "loop", "do", 0], "parallel", undefined), resolvesAsReview);
    expect(serial).not.toContain("parallel:");
  });
}

test("setParam keeps the comments of a param it replaces or removes", () => {
  const step = REVIEW.replace("  rounds: {default: 1, description: Maximum review rounds}", "  # before rounds\n  rounds: {default: 1, description: Maximum review rounds} # on rounds");
  const set = check(step, (d) => setParam(d, "rounds", { default: 2, description: "Maximum review rounds" }), resolvesAsReview);
  expect(set).toContain("rounds: {default: 2, description: Maximum review rounds} # on rounds");

  const only = "version: theway.step/v1\ndescription: x\nparams:\n  # before keep\n  keep: {default: 1, description: x} # on keep\ndo:\n  - agent: {prompt: fix, returns: work}\n";
  const doc = parse(only);
  setParam(doc, "keep", undefined);
  const out = textOf(doc);
  expect(out).not.toContain("params:");
  for (const c of comments(only)) expect([c, out.includes(c)]).toEqual([c, true]);
});

test("replacing a block value keeps the comments inside it, once each", () => {
  const block = REVIEW.replace(
    "  rounds: {default: 1, description: Maximum review rounds}",
    "  # before rounds\n  rounds: # on rounds\n    default: 1 # inner default\n    # before description\n    description: Maximum review rounds",
  );
  const set = check(block, (d) => setParam(d, "rounds", { default: 2, description: "Maximum review rounds" }), resolvesAsReview);
  expect(set).toContain("rounds: {default: 2, description: Maximum review rounds}");
  for (const c of comments(block)) expect([c, set.split(c).length - 1]).toEqual([c, 1]);

  const list = REVIEW.replace("      until: no-confirmed", "      until: # on until\n        - no-confirmed # why");
  const until = check(list, (d) => setNodeField(d, ["do", 0], "until", ["no-confirmed", "no-findings"]), resolvesAsReview);
  expect(until).toContain("until: [no-confirmed, no-findings]");
  for (const c of comments(list)) expect([c, until.split(c).length - 1]).toEqual([c, 1]);

  const doc = parse(block);
  setParam(doc, "rounds", undefined);
  const removed = textOf(doc);
  for (const c of comments(block)) expect([c, removed.split(c).length - 1]).toEqual([c, 1]);
});

test("the new-file templates carry the schema line and resolve", () => {
  const wf = newWorkflowText("Mine");
  expect(wf).toBe(
    "# yaml-language-server: $schema=https://pixelfactoryio.github.io/theway/schemas/workflow.v1.json\nversion: theway.workflow/v1\ndescription: Mine\nsteps:\n  - implement:\n",
  );
  const w = resolveWorkflow(HOME, "p", "mine", quiet, overlay("workflows", "mine", wf));
  expect("doc" in w).toBe(true);
  const step = newStepText("Fix it", "fix", "work");
  expect(step).toBe(
    "# yaml-language-server: $schema=https://pixelfactoryio.github.io/theway/schemas/step.v1.json\nversion: theway.step/v1\ndescription: Fix it\ndo:\n  - agent: {prompt: fix, returns: work}\n",
  );
  expect("step" in resolveStepFile(HOME, "p", "mine", quiet, overlay("steps", "mine", step))).toBe(true);
});

/** The editor's graph of the shipped agents workflow, every step file editable. */
function agentsGraph(): Graph {
  const steps = new Map<string, StepSource>();
  for (const s of ["implement", "review", "pr"]) steps.set(s, { doc: parse(shipped(`steps/${s}.yaml`)), origin: "global", editable: true });
  const g = sourceModel("agents", parse(AGENTS), steps);
  if ("error" in g) throw new Error(g.error);
  return g;
}

const CARDS = ["start", "agent", "gate", "stop"];
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (c: Box, p: Box) => c.x >= p.x && c.y >= p.y && c.x + c.w <= p.x + p.w && c.y + c.h <= p.y + p.h;

/** No two cards or `+` points overlap, every box lies inside its containers, and the canvas holds every box with its margin. */
function checkGeometry(l: Layout): void {
  const list = l.boxes.filter((b) => CARDS.includes(b.kind) || b.kind === "insert");
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
  for (const p of l.pills) {
    for (const b of list) {
      const pill = { x: p.x - p.w / 2, y: p.y - 9, w: p.w, h: 18 } as Box;
      expect([p.text, b.path, overlap(pill, b)]).toEqual([p.text, b.path, false]);
    }
  }
}

test("the source mapper gives review a foreach container inside a loop showing max ${rounds}, and its layout keeps the rules", () => {
  const g = agentsGraph();
  const review = g.entries[1];
  expect(review?.kind === "step" && review.editable).toBe(true);
  const loop = review?.kind === "step" ? review.children[0] : undefined;
  expect(loop?.kind).toBe("loop");
  if (loop?.kind !== "loop") return;
  expect([loop.max, loop.until, loop.src?.yaml]).toEqual(["${rounds}", ["no-confirmed"], ["do", 0]]);
  expect(loopCaption(loop)).toBe("max ${rounds} · until no-confirmed · then continue");
  const each = loop.children[0];
  expect(each?.kind).toBe("foreach");
  if (each?.kind !== "foreach") return;
  expect([each.value, each.parallel, each.path, each.src?.yaml]).toEqual(["${lenses}", true, "steps[1].do[0].loop.do[0]", ["do", 0, "loop", "do", 0]]);
  expect(foreachCaption(each)).toBe("For each ${lenses} · parallel");
  expect(each.children[0]).toMatchObject({ kind: "agent", name: "reviewer, ${item}", label: "review:reviewer, ${item}", returns: "findings", access: "read" });

  for (const inserts of [false, true]) {
    const l = layout(g, { inserts });
    expect(layout(g, { inserts })).toEqual(l);
    checkGeometry(l);
    const container = l.boxes.find((b) => b.path === each.path) as Box;
    expect([container.kind, container.caption]).toEqual(["foreach", "For each ${lenses} · parallel"]);
    expect(container.parent).toBe(loop.path);
    const agent = l.boxes.find((b) => b.path === `${each.path}.do[0]`) as Box;
    expect(agent.parent).toBe(each.path);
    expect(agent.y - container.y).toBe(32);
    expect(l.edges.filter((e) => e.kind === "loop").length).toBe(2);
    expect(l.boxes.filter((b) => b.kind === "insert").length).toBe(inserts ? 4 + 16 : 0);
  }
  const l = layout(g, { inserts: true });
  const at = (path: string) => l.boxes.find((b) => b.path === path)?.node;
  expect(at("steps+3")).toEqual({ kind: "insert", path: "steps+3", at: { scope: "entries", index: 3 } });
  expect(at("steps[1].do[0].loop.do[0].do+1")).toEqual({
    kind: "insert",
    path: "steps[1].do[0].loop.do[0].do+1",
    at: { scope: "step", file: "steps/review", parent: ["do", 0, "loop", "do", 0, "do"], index: 1, inLoop: true, inForeach: true },
  });
});

test("a read-only step frame takes no + point, and a step that does not parse gives its error in place of its frame", () => {
  const steps = new Map<string, StepSource>([
    ["implement", { doc: parse(shipped("steps/implement.yaml")), origin: "global", editable: false }],
    ["review", { doc: parse("do: [\n"), origin: "project", editable: true }],
  ]);
  const g = sourceModel("agents", parse(AGENTS), steps);
  if ("error" in g) throw new Error(g.error);
  const [implement, review, pr] = g.entries;
  expect(implement).toMatchObject({ kind: "step", editable: false, origin: "global" });
  expect(review?.kind === "step" && typeof review.error).toBe("string");
  expect(pr).toMatchObject({ kind: "step", error: "no step 'pr'" });
  const l = layout(g, { inserts: true });
  checkGeometry(l);
  expect(l.boxes.filter((b) => b.kind === "insert").map((b) => b.path)).toEqual(["steps+0", "steps+1", "steps+2", "steps+3"]);
  const broken = sourceModel("x", parse("steps: [\n"), new Map());
  expect("error" in broken && typeof broken.error).toBe("string");
});
