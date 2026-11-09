import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseDocument } from "yaml";
import type { StepEntry } from "../src/core/schema";
import { resolveWorkflow } from "../src/core/workflow";
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
