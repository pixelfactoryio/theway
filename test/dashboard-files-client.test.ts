import { expect, test } from "bun:test";
import {
  appliesTo,
  checkedKinds,
  fileCountText,
  filesQueryString,
  kindOfChecked,
  lineSeparatorOf,
  parseFilesQuery,
  previewText,
  type PromptRow,
  useText,
} from "../src/dashboard/client/lib/files";
import { drawWorkflow, findPrompt, isDefaultWorkflow, percent, selectionOf, zoomStep } from "../src/dashboard/client/lib/workflow";

const prompt = (name: string, project: string | null, description: string | null, model: string | null = null): PromptRow => ({
  name,
  project,
  description,
  model,
  header: true,
  inputs: [],
  errors: [],
  usedBy: [],
});

const PROMPTS = [
  prompt("implement", null, "Implement it", "opus"),
  prompt("review", null, "Review it"),
  prompt("review", "-p", "Own review", "sonnet"),
  prompt("fix", null, "Fix it", "haiku"),
];

test("the tables' address keeps q and one kind; both or none checked is no kind", () => {
  expect(parseFilesQuery("?q=imp&kind=step")).toEqual({ q: "imp", kind: "step" });
  expect(parseFilesQuery("kind=both")).toEqual({ q: "", kind: null });
  expect(filesQueryString({ q: "a b", kind: "reference" })).toBe("q=a+b&kind=reference");
  expect(filesQueryString({ q: "", kind: null })).toBe("");
  expect([kindOfChecked([]), kindOfChecked(["step"]), kindOfChecked(["step", "reference"])]).toEqual([null, "step", null]);
  expect(checkedKinds("reference")).toEqual(["reference"]);
  expect([fileCountText(1, 1, false, "workflow"), fileCountText(2, 5, true, "prompt"), fileCountText(0, 1, true, "prompt")]).toEqual([
    "1 workflow",
    "2 of 5 prompts",
    "0 of 1 prompt",
  ]);
});

test("labels and uses read as the tables and panels write them", () => {
  const label = (k: string) => (k === "-p" ? "tower" : k);
  expect([appliesTo(null, label), appliesTo("-p", label)]).toEqual(["All projects", "tower only"]);
  expect(useText({ workflow: "agents", project: null, step: 2, as: "step" }, label)).toBe("agents · step 2");
  expect(useText({ workflow: "agents", project: "-p", step: 1, as: "on-fail" }, label)).toBe("agents · tower · on-fail of step 1");
  expect(useText({ workflow: "w", project: null, step: 3, as: "value" }, label)).toBe("w · value in step 3");
});

test("the preview is the text after the header, without a BOM or CRLF; the separator follows the first line break", () => {
  expect(previewText("﻿---\r\ndescription: x\r\n---\r\n\r\n\r\n# Body\r\n", true)).toBe("# Body\n");
  expect(previewText("---\ndescription: x\n---\nBody", false)).toBe("---\ndescription: x\n---\nBody");
  expect([lineSeparatorOf("a\r\nb\nc"), lineSeparatorOf("a\nb\r\n"), lineSeparatorOf("one")]).toEqual(["\r\n", "\n", "\n"]);
});

const WORKFLOW = `# The workflow
version: theway.workflow/v1beta # a comment
description: Implement and review
runs-on: agents
inputs:
  change:
    description: The change
    required: true
    type: change
  mode:
    description: How
    default: fast
steps:
  # first
  - uses: prompts/implement.md
  - uses: prompts/review.md
    runs-on: session
    matrix:
      lens: [a, b, c]
    on-fail:
      uses: prompts/fix.md
      with:
        why: \${{ inputs.change }}
    tries: 2
  - uses: prompts/review.md
    model: opus
`;

test("a workflow with comments is drawn: Inputs, steps with their badges, matrix and on-fail", () => {
  const r = drawWorkflow(WORKFLOW, [], PROMPTS, null);
  if (!("drawing" in r)) throw new Error(r.reason);
  const d = r.drawing;
  expect(d.inputs).toEqual(["change", "mode"]);
  expect(d.inputFields).toEqual([
    { name: "change", type: "change", required: true, default: null, description: "The change" },
    { name: "mode", type: "text", required: false, default: "fast", description: "How" },
  ]);
  expect([d.description, d.runsOn, d.default]).toEqual(["Implement and review", "agents", false]);
  expect(d.steps.map((s) => [s.name, s.description, s.badge, s.target, s.matrix, s.tries])).toEqual([
    ["implement", "Implement it", "agents · opus", "agents", null, null],
    ["review", "Review it", "session", "session", "matrix · 3", "2"],
    ["review", "Review it", "agents · opus", "agents", null, null],
  ]);
  const onFail = d.steps[1]?.onFail;
  expect(onFail).toMatchObject({ name: "fix", code: false, description: "Fix it", badge: "session", uses: { prompt: "fix" } });
  expect(onFail?.with).toEqual([{ key: "why", value: "${{ inputs.change }}" }]);
  expect(d.steps[1]?.fields.matrix).toEqual({ key: "lens", values: ["a", "b", "c"] });
  // A project's workflow takes its project's own prompt.
  const own = drawWorkflow(WORKFLOW, [], PROMPTS, "-p");
  expect("drawing" in own && own.drawing.steps[1]?.description).toBe("Own review");
});

test("lines go to their card, steps[N] being 0-based; the workflow's own lines to the Inputs card", () => {
  const lines = [
    "description: x",
    "steps[0].uses: prompts/x.md not found",
    "steps[1].on-fail.with: required input why is not set",
    "steps[1].tries: must be an integer from 1 to 10",
    "prompts/review.md: model: must be one of opus, sonnet, haiku",
  ];
  const r = drawWorkflow(WORKFLOW, lines, PROMPTS, null);
  if (!("drawing" in r)) throw new Error(r.reason);
  expect(r.drawing.errors).toEqual(["description: x"]);
  expect(r.drawing.steps.map((s) => s.errors.length)).toEqual([1, 1, 0]);
  expect(r.drawing.steps[1]?.onFail?.errors).toEqual(["steps[1].on-fail.with: required input why is not set"]);
  expect(selectionOf({ text: "steps[1].on-fail.with: x", line: null }, r.drawing)).toEqual({ kind: "on-fail", index: 1 });
  expect(selectionOf({ text: "steps[0].uses: x", line: null }, r.drawing)).toEqual({ kind: "step", index: 0 });
  expect(selectionOf({ text: "inputs.change: x", line: 6 }, r.drawing)).toEqual({ kind: "inputs" });
  expect(selectionOf({ text: "description: x", line: null }, r.drawing)).toBeNull();
  expect(selectionOf({ text: "prompts/review.md: model: x", line: null }, r.drawing)).toBeNull();
});

test("a workflow that does not resolve is still drawn, malformed shapes as the spec says", () => {
  const text = [
    "version: theway.workflow/v1beta",
    "inputs: [a]",
    "runs-on: nowhere",
    "steps:",
    "  - 42",
    "  - uses: {x: 1}",
    "    matrix: nope",
    "    with: [a]",
    "    on-fail: 7",
    "  - with: {a: b}",
    "    runs-on: agents",
    "  - uses: prompts/implement.md",
    "    matrix: {a: [x], b: [y]}",
    "    on-fail: {model: opus}",
    "",
  ].join("\n");
  const r = drawWorkflow(text, [], PROMPTS, null);
  if (!("drawing" in r)) throw new Error(r.reason);
  const [invalid, odd, missing, two] = r.drawing.steps;
  expect(r.drawing.inputs).toEqual([]);
  expect(invalid).toMatchObject({ valid: false, name: "Step 1", badge: null, target: null, matrix: null, onFail: null });
  expect(odd).toMatchObject({ name: "{x: 1}", code: true, description: null, badge: null, target: null, matrix: "matrix" });
  expect(odd?.fields.with).toEqual({ source: "[a]" });
  expect(odd?.fields.matrix).toEqual({ source: "nope" });
  expect(odd?.onFail).toMatchObject({ name: "7", code: true });
  expect(missing).toMatchObject({ name: "No prompt", code: false, badge: "agents", target: "agents" });
  expect(two).toMatchObject({ matrix: "matrix", badge: null });
  expect(two?.onFail).toMatchObject({ name: "{model: opus}", code: true });
  // steps missing or empty: the Inputs card alone.
  const bare = drawWorkflow("version: theway.workflow/v1beta\nsteps: []\n", [], PROMPTS, null);
  expect("drawing" in bare && bare.drawing.steps).toEqual([]);
  // `steps:` with no value parses as a null scalar: the Inputs card alone too.
  for (const empty of ["steps:\n", "steps: ~\n", "steps: null\n"]) {
    const r = drawWorkflow(`version: theway.workflow/v1beta\n${empty}`, ["steps: must be a non-empty list"], PROMPTS, null);
    expect("drawing" in r && r.drawing.steps).toEqual([]);
  }
});

test("a file is the default from its text, whatever its steps", () => {
  expect(isDefaultWorkflow("version: theway.workflow/v1beta\ndefault: true\nsteps: 5\n")).toBe(true);
  expect(isDefaultWorkflow("version: theway.workflow/v1beta\ndefault: false\nsteps: []\n")).toBe(false);
  expect(isDefaultWorkflow("version: theway.workflow/v1\ndefault: true\n")).toBe(false);
  expect(isDefaultWorkflow("version: theway.workflow/v1beta\ndefault: true\nsteps: [\n")).toBe(false);
  expect(isDefaultWorkflow("- a\n")).toBe(false);
});

test("a file that cannot be drawn gives its first line as the reason", () => {
  expect(drawWorkflow("steps: [\n  - a\n", ["invalid YAML: bad"], PROMPTS, null)).toEqual({ reason: "invalid YAML: bad" });
  expect(drawWorkflow("- a\n", [], PROMPTS, null)).toEqual({ reason: "version: must be theway.workflow/v1beta" });
  expect(drawWorkflow("version: theway.workflow/v1\n", ["version: x"], PROMPTS, null)).toEqual({ reason: "version: x" });
  expect(drawWorkflow("version: theway.workflow/v1beta\nsteps: {a: 1}\n", [], PROMPTS, null)).toEqual({ reason: "steps: must be a non-empty list" });
});

test("the prompt of a step is its project's own, else the global one; zoom steps by 0.1 within 50% and 200%", () => {
  expect(findPrompt(PROMPTS, "-p", "review")?.description).toBe("Own review");
  expect(findPrompt(PROMPTS, "-q", "review")?.description).toBe("Review it");
  expect(findPrompt(PROMPTS, null, "nope")).toBeNull();
  expect([zoomStep(1, 0.1), zoomStep(0.5, -0.1), zoomStep(1.95, 0.1), zoomStep(0.73, -0.1)]).toEqual([1.1, 0.5, 2, 0.6]);
  expect([percent(1), percent(0.734), percent(2)]).toEqual(["100%", "73%", "200%"]);
});
