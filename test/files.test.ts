import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseDocument } from "yaml";
import type { StepEntry } from "../src/core/schema";
import { resolveWorkflow } from "../src/core/workflow";
import { parse, setWorkflowField, textOf } from "../src/dashboard/client/editor/ops";
import { edit, isDirty, redo, startDraft, undo } from "../src/dashboard/client/files/draft";
import { chainOf, deepest, locate } from "../src/dashboard/client/files/locate";
import { newFileText } from "../src/dashboard/client/files/new-file";
import { type StepNode, stepSource, workflowSource } from "../src/dashboard/client/files/source";
import { summary } from "../src/dashboard/client/files/summary";

const SHIPPED_HOME = join(import.meta.dirname, "..", "plugin", "home");
const shipped = (rel: string) => readFileSync(join(SHIPPED_HOME, rel), "utf-8");

/** A home holding the shipped config, convention standards, workflows, steps and prompts, and a project `p`. */
const HOME = (() => {
  const dir = mkdtempSync(join(tmpdir(), "theway-files-"));
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

/** The step entries of the shipped `agents` workflow, resolved. */
function agentsSteps(): StepEntry[] {
  const r = resolveWorkflow(HOME, "p", "agents", () => {});
  if ("error" in r) throw new Error(r.error);
  return r.doc.steps.filter((e): e is StepEntry => "do" in e);
}

test("the summary of the resolved agents workflow gives each step's header note and lines", () => {
  const [implement, review, pr] = agentsSteps().map(summary);
  expect(implement).toEqual({ note: null, lines: [{ names: "implement", note: "commits" }] });
  expect(review).toEqual({
    note: "up to 1, until no-confirmed",
    lines: [
      { names: "conformance, correctness", note: "in parallel" },
      { names: "triage", note: "when findings" },
      { names: "fix, fix-check", note: "when confirmed" },
    ],
  });
  expect(pr?.note).toBe("up to 2, until green");
  expect(pr?.lines).toEqual([
    { names: "open-pr", note: "pushes" },
    { names: "ci-wait", note: null },
    { names: "ci-diagnose, ci-fix", note: "when red" },
  ]);
});

test("the summary gives a fail or block line its conditions as the note", () => {
  const s = summary({
    do: [
      { when: ["red"], fail: true },
      { when: ["decision", "more"], block: "why" },
    ],
  });
  expect(s).toEqual({
    note: null,
    lines: [
      { names: "fail", note: "when red" },
      { names: "block", note: "when decision, more" },
    ],
  });
});

/** The node at `path` of a tree, by its YAML path. */
function at(nodes: StepNode[], path: (string | number)[]): StepNode | undefined {
  for (const n of nodes) {
    if (JSON.stringify(n.path) === JSON.stringify(path)) return n;
    if ("children" in n) {
      const found = at(n.children, path);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

test("the source of review.yaml gives its loop, foreach and whens as written, with YAML paths and params", () => {
  const source = stepSource(parseDocument(shipped("steps/review.yaml")));
  if ("error" in source) throw new Error(source.error);
  expect(source.nodes.length).toBe(1);
  const loop = source.nodes[0];
  if (loop?.kind !== "loop") throw new Error("not a loop");
  expect([loop.max, loop.until, loop.path]).toEqual(["${rounds}", ["no-confirmed"], ["do", 0]]);
  expect(loop.children.map((c) => c.kind)).toEqual(["foreach", "when", "when"]);
  const each = loop.children[0];
  expect(each?.kind === "foreach" && [each.value, each.parallel]).toEqual(["${lenses}", true]);
  expect(at(source.nodes, ["do", 0, "loop", "do", 2, "do", 1])).toEqual({
    kind: "agent",
    path: ["do", 0, "loop", "do", 2, "do", 1],
    prompts: ["fix-check"],
    returns: "resolutions",
    access: null,
    model: null,
  });
  expect(source.params.map((p) => [p.name, p.default])).toEqual([
    ["rounds", 1],
    ["lenses", ["conformance", "correctness"]],
    ["model", "opus"],
    ["fix_model", "opus"],
  ]);
});

test("the source of implement.yaml gives one agent with no prompt written", () => {
  const source = stepSource(parseDocument(shipped("steps/implement.yaml")));
  if ("error" in source) throw new Error(source.error);
  expect(source.nodes).toEqual([{ kind: "agent", path: ["do", 0], prompts: [], returns: "work", access: null, model: null }]);
});

test("the source of a file that does not parse is its first parse error", () => {
  const source = stepSource(parseDocument("do: [\n"));
  expect("error" in source && typeof source.error).toBe("string");
  expect("error" in workflowSource(parseDocument("steps: [\n"))).toBe(true);
});

test("the source of a workflow file gives its entries as written", () => {
  const source = workflowSource(parseDocument("version: theway.workflow/v1\nsteps:\n  - implement:\n  - gate: Go on?\n  - review: {agents: false, rounds: 2}\n"));
  expect(source).toEqual({
    entries: [
      { kind: "step", index: 0, id: "implement", agents: null, params: {} },
      { kind: "gate", index: 1, question: "Go on?" },
      { kind: "step", index: 2, id: "review", agents: false, params: { rounds: 2 } },
    ],
  });
});

/** The constructs of a tree, depth first. */
const flatten = (list: StepNode[]): StepNode[] => list.flatMap((n) => [n, ...("children" in n ? flatten(n.children) : [])]);

/** The construct of the shipped review.yaml a line ties to, `null` for none. */
function reviewTie(line: string): StepNode | null {
  const source = stepSource(parseDocument(shipped("steps/review.yaml")));
  if ("error" in source) throw new Error(source.error);
  const at = locate(line, "steps/review.yaml", []);
  if (at === null || !("path" in at)) return null;
  const nodes = flatten(source.nodes);
  const i = deepest(
    nodes.map((n) => chainOf(n.path)),
    at.path,
  );
  return i === -1 ? null : (nodes[i] as StepNode);
}

test("locate ties a workflow line to its entry, only in the open file, with or without a project label", () => {
  const line = "theway: workflows/agents.yaml: steps[1].review.rounds must be an integer";
  expect(locate(line, "workflows/agents.yaml", [])).toEqual({ entry: 1 });
  expect(locate("theway: workflows/x.yaml: input must be changes or request", "workflows/x.yaml", [])).toBeNull();
  expect(locate("theway: workflows/develop.yaml: steps[1].review.rounds must be an integer", "workflows/agents.yaml", [])).toBeNull();
  expect(locate(`q: ${line}`, "workflows/agents.yaml", ["q"])).toEqual({ entry: 1 });
  expect(locate(`q: ${line}`, "workflows/agents.yaml", ["r"])).toBeNull();
  expect(locate("theway: projects/k/workflows/agents.yaml: steps[0].gate must be a non-empty question", "projects/k/workflows/agents.yaml", [])).toEqual({ entry: 0 });
});

test("locate ties a step line to the deepest construct of review.yaml its do indices start", () => {
  expect(reviewTie("theway: steps/review.yaml: do[0].loop.until must be one of findings, no-findings, …")).toMatchObject({ kind: "loop", path: ["do", 0] });
  expect(reviewTie("theway: steps/review.yaml: do[0].loop.do[1].when.do[0].agent.returns must be one of work, findings, …")).toMatchObject({
    kind: "agent",
    prompts: ["verdicts", "triage"],
  });
  expect(reviewTie("theway: steps/review.yaml: do[0].loop.do[0].foreach[item=conformance].do[0].agent.returns must be one of …")).toMatchObject({
    kind: "agent",
    path: ["do", 0, "loop", "do", 0, "do", 0],
    prompts: ["reviewer", "${item}"],
  });
  expect(reviewTie("theway: steps/review.yaml: do[0].loop.max: ${nope} is not a param of review (params: rounds, lenses, model, fix_model)")).toMatchObject({ kind: "loop" });
  expect(reviewTie("theway: steps/other.yaml: do[0].loop.until must be one of …")).toBeNull();
});

test("a draft takes three edits, two undos and one redo, and is dirty until its text is again the start", () => {
  let d = startDraft("a", "sha", false);
  expect(isDirty(d)).toBe(false);
  d = edit(edit(edit(d, "b"), "c"), "d");
  d = redo(undo(undo(d)));
  expect(d.text).toBe("c");
  expect(isDirty(d)).toBe(true);
  d = undo(d);
  expect(d.text).toBe("b");
  d = undo(d);
  expect(d.text).toBe("a");
  expect(isDirty(d)).toBe(false);
  expect(edit(d, "a")).toBe(d);
  expect(isDirty(startDraft("a", null, true))).toBe(true);
});

test("a restored version is one undoable edit that keeps its text byte for byte", () => {
  const current = shipped("workflows/agents.yaml");
  const versionText = "version: 1\nsteps:\n  - review: {rounds:   2}   # kept\n";
  const d = edit(startDraft(current, "a".repeat(64), false), versionText);
  expect(d.text).toBe(versionText);
  expect([d.start, d.base, d.isNew, d.undo, isDirty(d)]).toEqual([current, "a".repeat(64), false, [current], true]);
  expect(undo(d).text).toBe(current);
});

test("the undo stack keeps the newest 100 texts", () => {
  let d = startDraft("0", null, false);
  for (let i = 1; i <= 150; i++) d = edit(d, String(i));
  expect(d.undo.length).toBe(100);
  expect(d.undo[0]).toBe("50");
});

test("a new workflow copied from develop has its description, no default key, and every comment", () => {
  const develop = shipped("workflows/develop.yaml");
  const doc = parse(develop);
  setWorkflowField(doc, "default", true);
  const text = newFileText("workflows", textOf(doc), "x");
  const root = parseDocument(text).toJS() as Record<string, unknown>;
  expect(root.description).toBe("x");
  expect("default" in root).toBe(false);
  const comments = develop.split("\n").filter((l) => l.trimStart().startsWith("#"));
  expect(comments.length).toBeGreaterThan(0);
  for (const c of comments) expect(text).toContain(c.trim());
});
