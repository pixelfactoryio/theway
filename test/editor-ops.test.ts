import { afterAll, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Overlay } from "../src/core/io";
import type { Document } from "yaml";
import { parsePromptFile, resolveWorkflowFile } from "../src/core/language";
import {
  addInput,
  defaultOnFail,
  HEADER_ORDER,
  insertStep,
  movedIndex,
  moveStep,
  type PromptChoice,
  parse,
  removeInput,
  removeStep,
  renameInput,
  setInputField,
  setStepField,
  setStepMatrix,
  setStepOnFail,
  setStepPrompt,
  setStepTries,
  setStepWith,
  setWorkflowField,
  textOf,
  WORKFLOW_ORDER,
} from "../src/dashboard/client/editor/ops";
import { editHeader, setHeaderField } from "../src/dashboard/client/editor/prompt";
import { headerSource } from "../src/dashboard/client/files/source";

const SHIPPED_HOME = join(import.meta.dirname, "..", "plugin", "home");

/** A home holding the shipped workflows and prompts, and a project `p`. */
const HOME = (() => {
  const dir = mkdtempSync(join(tmpdir(), "theway-ops-"));
  for (const folder of ["workflows", "prompts"]) cpSync(join(SHIPPED_HOME, folder), join(dir, folder), { recursive: true });
  mkdirSync(join(dir, "projects", "p"), { recursive: true });
  return dir;
})();
afterAll(() => rmSync(HOME, { recursive: true, force: true }));

/** `text` with a full-line comment above each step and a comment at the end of each step's first line. */
function commented(text: string): string {
  let n = 0;
  return text
    .split("\n")
    .flatMap((line) => {
      const m = /^(\s*)- uses: /.exec(line);
      if (m === null) return [line];
      n += 1;
      return [`${m[1]}# before step ${n}`, `${line} # on step ${n}`];
    })
    .join("\n");
}

test("each fixture workflow, as is and commented, round-trips byte for byte and resolves through an overlay", () => {
  const names = readdirSync(join(SHIPPED_HOME, "workflows")).map((f) => f.slice(0, -".yaml".length));
  expect(names.length).toBe(4);
  for (const name of names) {
    const text = readFileSync(join(SHIPPED_HOME, "workflows", `${name}.yaml`), "utf-8");
    const copy = commented(text);
    expect(copy).toContain("# before step 1\n");
    expect(copy).toMatch(/- uses: prompts\/[a-z-]+\.md # on step 1\n/);
    for (const t of [text, copy]) {
      expect([name, textOf(parse(t))]).toEqual([name, t]);
      const overlay: Overlay = new Map([[join(HOME, "projects", "p", "workflows", `${name}.yaml`), t]]);
      const r = resolveWorkflowFile(HOME, "p", name, {}, overlay);
      expect([name, "errors" in r ? r.errors : []]).toEqual([name, []]);
    }
  }
});

const AGENTS = readFileSync(join(SHIPPED_HOME, "workflows", "agents.yaml"), "utf-8");

/** The commented `agents.yaml`, with every comment it holds. */
const COMMENTED = commented(AGENTS);
const COMMENTS = [1, 2, 3, 4, 5, 6].flatMap((n) => [`# before step ${n}`, `# on step ${n}`]);

/** The shipped step prompts, with their declared inputs. */
const STEP_PROMPTS: PromptChoice[] = readdirSync(join(SHIPPED_HOME, "prompts")).flatMap((f) => {
  const { header, headerErrors } = parsePromptFile(readFileSync(join(SHIPPED_HOME, "prompts", f), "utf-8"));
  if (header === null || headerErrors.length > 0) return [];
  return [{ name: f.slice(0, -".md".length), inputs: Object.entries(header.inputs).map(([name, i]) => ({ name, required: i.required })) }];
});

/** The error lines of `agents.yaml` written as `text` (and the prompts of `prompts`), resolved in project `p` with no input. */
function errorsOf(text: string, prompts: Record<string, string> = {}): string[] {
  const overlay: Overlay = new Map([[join(HOME, "projects", "p", "workflows", "agents.yaml"), text]]);
  for (const [name, t] of Object.entries(prompts)) overlay.set(join(HOME, "prompts", `${name}.md`), t);
  const r = resolveWorkflowFile(HOME, "p", "agents", {}, overlay);
  return "errors" in r ? r.errors : [];
}

/** Runs `ops` in turn on a parsed copy of `text`, checking after each one that every comment is kept and that it gives `expected` errors; returns the last text. */
function run(label: string, text: string, ops: ((d: Document) => void)[], expected: (string[] | undefined)[] = []): string {
  const doc = parse(text);
  let out = text;
  ops.forEach((op, i) => {
    op(doc);
    out = textOf(doc);
    for (const c of COMMENTS) expect([label, i, c, out.includes(c)]).toEqual([label, i, c, true]);
    expect([label, i, errorsOf(out)]).toEqual([label, i, expected[i] ?? []]);
  });
  return out;
}

/** The `uses` of each step, in order. */
const usesList = (text: string): string[] => ((parse(text).toJS() as { steps: { uses: string }[] }).steps ?? []).map((s) => s.uses);

test("a ci step inserted at each position keeps every comment and resolves; implement inserted names its required input", () => {
  for (let i = 0; i <= 6; i++) {
    const out = run(`ci at ${i}`, COMMENTED, [(d) => insertStep(d, i, "ci", [])]);
    expect(usesList(out)[i]).toBe("prompts/ci.md");
  }
  const out = run("implement", COMMENTED, [(d) => insertStep(d, 2, "implement", ["change"])], [["workflows/agents.yaml: steps[2].with: required input change is not set"]]);
  expect(out).toContain('  - uses: prompts/implement.md\n    with:\n      change: ""\n');
});

test("moving a step up, down, and step 5 to position 3 in one operation keeps every comment; removing a step keeps them too", () => {
  const order = usesList(AGENTS);
  const up = run("up", COMMENTED, [(d) => moveStep(d, 3, 2)]);
  expect(usesList(up)).toEqual([order[0], order[1], order[3], order[2], order[4], order[5]]);
  const down = run("down", COMMENTED, [(d) => moveStep(d, 1, 2)]);
  expect(usesList(down)).toEqual([order[0], order[2], order[1], order[3], order[4], order[5]]);
  const five = run("5 to 3", COMMENTED, [(d) => moveStep(d, 4, 2)]);
  expect(usesList(five)).toEqual([order[0], order[1], order[4], order[2], order[3], order[5]]);
  const removed = run("remove", COMMENTED, [(d) => removeStep(d, 4)]);
  expect(usesList(removed)).toEqual([order[0], order[1], order[2], order[3], order[5]]);
});

test("with, matrix, runs-on and model are set and cleared on a step, every comment kept", () => {
  const w = run("with", COMMENTED, [(d) => setStepWith(d, 1, "commit", "no"), (d) => setStepWith(d, 1, "commit", undefined)]);
  expect(w).toBe(textOf(parse(COMMENTED)));
  run("matrix", COMMENTED, [(d) => setStepMatrix(d, 1, { key: "lens", values: ["prompts/conformance.md", "prompts/correctness.md"] }), (d) => setStepMatrix(d, 1, undefined)]);
  run("runs-on", COMMENTED, [(d) => setStepField(d, 1, "runs-on", "session"), (d) => setStepField(d, 1, "runs-on", undefined)]);
  run("model", COMMENTED, [(d) => setStepField(d, 1, "model", "haiku"), (d) => setStepField(d, 1, "model", undefined)]);
  run("prompt", COMMENTED, [(d) => setStepPrompt(d, 1, "open-pr", ["change"])]);
});

test("on-fail turned on writes tries: 1 and the string form on ci; a model gives the map form and back; off removes on-fail and tries", () => {
  const on = defaultOnFail(STEP_PROMPTS);
  expect(on).toEqual({ name: "ci", with: [], model: null });
  const step = (text: string) => (parse(text).toJS() as { steps: Record<string, unknown>[] }).steps[1];
  const doc = parse(COMMENTED);
  setStepOnFail(doc, 1, on ?? undefined);
  const a = textOf(doc);
  expect(step(a)).toMatchObject({ "on-fail": "prompts/ci.md", tries: 1 });
  expect(errorsOf(a)).toEqual([]);
  setStepOnFail(doc, 1, { name: "ci", with: [], model: "haiku" });
  const b = textOf(doc);
  expect(step(b)?.["on-fail"]).toEqual({ uses: "prompts/ci.md", model: "haiku" });
  expect(errorsOf(b)).toEqual([]);
  setStepOnFail(doc, 1, { name: "ci", with: [], model: null });
  expect(step(textOf(doc))?.["on-fail"]).toBe("prompts/ci.md");
  setStepOnFail(doc, 1, undefined);
  const off = textOf(doc);
  expect(Object.keys(step(off) ?? {})).toEqual(["uses", "with"]);
  for (const c of COMMENTS) expect([c, off.includes(c)]).toEqual([c, true]);
  expect(errorsOf(off)).toEqual([]);
  // A step prompt with required inputs only: the map form, each written `""`.
  expect(defaultOnFail(STEP_PROMPTS.filter((p) => p.inputs.some((i) => i.required)))).toEqual({ name: "branch", with: [["change", ""]], model: null });
  expect(defaultOnFail([])).toBeNull();
  // The triage step's on-fail turned off.
  run("off", COMMENTED, [(d) => setStepOnFail(d, 3, undefined)]);
});

test("Tries set to 0 writes tries: 0 and gives a steps[<i>].tries error", () => {
  const doc = parse(AGENTS);
  setStepTries(doc, 3, 0);
  const out = textOf(doc);
  expect(out).toContain("    tries: 0\n");
  expect(errorsOf(out)).toEqual(["workflows/agents.yaml: steps[3].tries: must be an integer from 1 to 10"]);
});

test("the triage step's prompt changed to ci leaves no with key", () => {
  const out = run("triage to ci", COMMENTED, [(d) => setStepPrompt(d, 3, "ci", [])]);
  const triage = (parse(out).toJS() as { steps: Record<string, unknown>[] }).steps[3];
  expect(triage?.uses).toBe("prompts/ci.md");
  expect(Object.hasOwn(triage ?? {}, "with")).toBe(false);
});

test("each workflow field is set, and a workflow input added twice and removed, every comment kept", () => {
  run("fields", COMMENTED, [
    (d) => setWorkflowField(d, "description", "Another description"),
    (d) => setWorkflowField(d, "default", true),
    (d) => setWorkflowField(d, "default", undefined),
    (d) => setWorkflowField(d, "runs-on", "session"),
    (d) => setWorkflowField(d, "runs-on", "agents"),
  ]);
  const added = run("inputs", COMMENTED, [(d) => addInput(d, WORKFLOW_ORDER)]);
  expect(added).toContain("    type: change\n  input:\n    description: Describe this input.\nruns-on: agents\n");
  const twice = run("inputs twice", added, [(d) => addInput(d, WORKFLOW_ORDER)]);
  expect(twice).toContain("  input:\n    description: Describe this input.\n  input2:\n    description: Describe this input.\nruns-on: agents\n");
  const back = run("remove", twice, [(d) => removeInput(d, "input2"), (d) => removeInput(d, "input")]);
  expect(back).toBe(textOf(parse(COMMENTED)));
  run("input fields", added, [
    (d) => renameInput(d, "input", "notes"),
    (d) => setInputField(d, "notes", "default", "none"),
    (d) => setInputField(d, "notes", "type", "text"),
    (d) => setInputField(d, "notes", "description", "Notes to add"),
  ]);
});

test("an input added to the review.md header writes input then input2, and agents still resolves", () => {
  const review = readFileSync(join(SHIPPED_HOME, "prompts", "review.md"), "utf-8");
  const once = editHeader(review, (h) => addInput(h, HEADER_ORDER));
  expect(once).toContain("    required: true\n  input:\n    description: Describe this input.\n---\n");
  expect(errorsOf(AGENTS, { review: once })).toEqual([]);
  const twice = editHeader(once, (h) => addInput(h, HEADER_ORDER));
  expect(twice).toContain("  input:\n    description: Describe this input.\n  input2:\n    description: Describe this input.\n---\n");
  expect(errorsOf(AGENTS, { review: twice })).toEqual([]);
});

test("a move keeps the selection on the same step: the moved one, one it passes over, and one it does not reach", () => {
  expect(movedIndex(4, 4, 2)).toBe(2);
  expect(movedIndex(3, 4, 2)).toBe(4);
  expect(movedIndex(2, 4, 1)).toBe(3);
  expect(movedIndex(2, 1, 3)).toBe(1);
  expect(movedIndex(0, 4, 2)).toBe(0);
  expect(movedIndex(5, 1, 3)).toBe(5);
});

test("a header that does not parse is reported by headerSource and left as is by a header edit", () => {
  const broken = "---\ndescription: [a\n---\nbody\n";
  expect(headerSource(broken)).toHaveProperty("error");
  expect(editHeader(broken, (h) => setHeaderField(h, "description", "x"))).toBe(broken);
});
