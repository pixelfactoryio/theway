import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import type { PromptRow } from "../src/dashboard/client/lib/files";
import {
  addInput,
  addStep,
  changeStepPrompt,
  editText,
  hasAnchors,
  keyError,
  matrixLines,
  moveStep,
  nextInputName,
  pickerGroups,
  placeLine,
  removeInput,
  removeStep,
  renameInput,
  renameMatrixKey,
  setDefault,
  setInputField,
  setMatrix,
  setMatrixValues,
  setOnFail,
  setOnFailModel,
  setOnFailWith,
  setStepKey,
  setStepWith,
  setTries,
  setWorkflowKey,
  stepForm,
  stepPromptNames,
  workflowForm,
} from "../src/dashboard/client/lib/workflow-edit";

const REPO = join(import.meta.dirname, "..");

const prompt = (name: string, inputs: [string, boolean][] = [], project: string | null = null, description: string | null = null): PromptRow => ({
  name,
  project,
  description,
  model: null,
  header: true,
  inputs: inputs.map(([n, required]) => ({ name: n, required, default: null, description: `${n} input` })),
  errors: [],
  usedBy: [],
});

const IMPLEMENT = prompt("implement", [["change", true], ["notes", false], ["extra", true]]);
const REVIEW = prompt("review", [["lens", true]]);
const PLAIN = prompt("plain");
const FIX = prompt("fix", [["why", true], ["how", false]]);

/** A workflow with comments, blank lines, a `>-` scalar, an unknown key on a step and on the workflow. */
const SOURCE = `# The workflow
version: theway.workflow/v1beta # the version
description: >-
  Implement and
  review
runs-on: agents
custom: kept # an unknown key
inputs:
  change: # the change
    description: The change
    required: true
    type: change
steps:
  # above the first
  - uses: prompts/implement.md # first trailing
    with:
      change: \${{ inputs.change }}
      notes: "some notes" # notes comment

  # above the second
  - uses: prompts/review.md # second trailing
    matrix:
      lens: [a, b]
    on-fail: prompts/fix.md
    tries: 2
    extra: kept
  # above the third
  - uses: 'prompts/plain.md'
    model: opus
`;

/** Every comment of a text. */
const commentsOf = (text: string): string[] => [...text.matchAll(/(?:^|\s)(#.*)$/gm)].map((m) => (m[1] as string).trim());

/** The parsed value of a text. */
const value = (text: string) => parse(text) as Record<string, any>;

/** Asserts that every comment of `from` is in `to`, except `gone`. */
function keepsComments(from: string, to: string, gone: string[] = []) {
  const after = commentsOf(to);
  expect(commentsOf(from).filter((c) => !gone.includes(c) && !after.includes(c))).toEqual([]);
  for (const g of gone) expect(after).not.toContain(g);
}

test("each shipped workflow file prints back identical when nothing is changed", () => {
  const dir = join(REPO, "plugin", "home", "workflows");
  const files = readdirSync(dir).filter((f) => f.endsWith(".yaml"));
  expect(files.length).toBeGreaterThan(0);
  for (const f of files) {
    const text = readFileSync(join(dir, f), "utf-8");
    expect([f, editText(text, () => undefined)]).toEqual([f, text]);
  }
});

test("an edit that changes nothing gives the text back; one that throws or does not parse too", () => {
  expect(setStepKey(SOURCE, 2, "model", "opus")).toBe(SOURCE);
  expect(
    editText(SOURCE, () => {
      throw new Error("boom");
    }),
  ).toBe(SOURCE);
  expect(moveStep(SOURCE, 0, -1)).toBe(SOURCE);
  expect(setStepKey(SOURCE, 9, "model", "opus")).toBe(SOURCE);
  const broken = "steps: [\n";
  expect(addStep(broken, 0, PLAIN)).toBe(broken);
});

test("a new step is uses then with, the required inputs in declaration order, and is placed where asked", () => {
  const out = addStep(SOURCE, 1, IMPLEMENT);
  const v = value(out);
  expect(v.steps.length).toBe(4);
  expect(v.steps[1]).toEqual({ uses: "prompts/implement.md", with: { change: "${{ inputs.change }}", extra: "" } });
  expect(Object.keys(v.steps[1].with)).toEqual(["change", "extra"]);
  keepsComments(SOURCE, out);
  // No `with` for a prompt with no required input; at the end too.
  const end = value(addStep(SOURCE, 3, PLAIN));
  expect(end.steps[3]).toEqual({ uses: "prompts/plain.md" });
  // The comment above a step moves with it: the new step goes in before it.
  expect(out.indexOf("# above the second")).toBeGreaterThan(out.indexOf("uses: prompts/implement.md\n    with:\n      change: ${{ inputs.change }}\n      extra"));
});

test("steps: [] and a file with no steps take the first step in a block list", () => {
  const empty = addStep("version: theway.workflow/v1beta\nsteps: []\n", 0, PLAIN);
  expect(empty).toBe("version: theway.workflow/v1beta\nsteps:\n  - uses: prompts/plain.md\n");
  const none = addStep("version: theway.workflow/v1beta\n", 0, REVIEW);
  expect(value(none)).toEqual({ version: "theway.workflow/v1beta", steps: [{ uses: "prompts/review.md", with: { lens: "" } }] });
  const nulled = addStep("version: theway.workflow/v1beta\nsteps:\n", 0, PLAIN);
  expect(value(nulled).steps).toEqual([{ uses: "prompts/plain.md" }]);
});

test("moving a step carries its comments; the comment above the first step stays at the top of the list", () => {
  const down = moveStep(SOURCE, 0, 1);
  expect(value(down).steps.map((s: { uses: string }) => s.uses)).toEqual(["prompts/review.md", "prompts/implement.md", "prompts/plain.md"]);
  keepsComments(SOURCE, down);
  const lines = down.split("\n");
  // The list's comment stays first; the second step's comment moved up with it; trailing comments moved with their step.
  expect(lines.indexOf("  # above the first")).toBeLessThan(lines.indexOf("  # above the second"));
  expect(lines[lines.indexOf("  # above the second") + 1]).toBe("  - uses: prompts/review.md # second trailing");
  expect(down.indexOf("# first trailing")).toBeGreaterThan(down.indexOf("# second trailing"));
  // Unknown keys stay.
  expect(value(down).steps[0].extra).toBe("kept");
  const up = moveStep(SOURCE, 2, -1);
  const upLines = up.split("\n");
  expect(upLines[upLines.indexOf("  # above the third") + 1]).toBe("  - uses: 'prompts/plain.md'");
  expect(value(up).steps[1].uses).toBe("prompts/plain.md");
});

test("removing a step removes its comments; the comment above the first stays; the last leaves steps: []", () => {
  const out = removeStep(SOURCE, 1);
  expect(value(out).steps.length).toBe(2);
  keepsComments(SOURCE, out, ["# above the second", "# second trailing"]);
  const first = removeStep(SOURCE, 0);
  keepsComments(SOURCE, first, ["# first trailing", "# notes comment"]);
  expect(first).toContain("# above the first");
  let text = "version: theway.workflow/v1beta\nsteps:\n  - uses: prompts/plain.md\n";
  text = removeStep(text, 0);
  expect(text).toBe("version: theway.workflow/v1beta\nsteps: []\n");
  expect(value(text).steps).toEqual([]);
});

test("changing a step's prompt keeps the with keys it declares, adds its required inputs and removes the others", () => {
  const out = changeStepPrompt(SOURCE, 0, prompt("other", [["notes", false], ["lens", true]]));
  const step = value(out).steps[0];
  expect(step.uses).toBe("prompts/other.md");
  expect(step.with).toEqual({ notes: "some notes", lens: "" });
  keepsComments(SOURCE, out);
  // A prompt that declares none of them: with removed.
  const bare = value(changeStepPrompt(SOURCE, 0, PLAIN)).steps[0];
  expect(bare).toEqual({ uses: "prompts/plain.md" });
  // The uses scalar keeps its style.
  expect(changeStepPrompt(SOURCE, 2, REVIEW)).toContain("- uses: 'prompts/review.md'\n    model: opus\n    with:\n      lens: \"\"");
});

test("step keys: runs-on and model set at the end of the step, removed with null; unknown keys untouched", () => {
  const out = setStepKey(SOURCE, 0, "runs-on", "session");
  expect(Object.keys(value(out).steps[0])).toEqual(["uses", "with", "runs-on"]);
  keepsComments(SOURCE, out);
  const removed = setStepKey(SOURCE, 2, "model", null);
  expect(value(removed).steps[2]).toEqual({ uses: "prompts/plain.md" });
  expect(value(removed).custom).toBe("kept");
});

test("with values: set in place keeping comments, an empty optional value removed, the last key removing with", () => {
  const out = setStepWith(SOURCE, 0, "notes", "other", false);
  expect(value(out).steps[0].with.notes).toBe("other");
  expect(out).toContain("# notes comment");
  const emptied = setStepWith(SOURCE, 0, "notes", "", false);
  expect(value(emptied).steps[0].with).toEqual({ change: "${{ inputs.change }}" });
  const required = setStepWith(SOURCE, 0, "change", "", true);
  expect(value(required).steps[0].with.change).toBe("");
  let text = setStepWith(SOURCE, 0, "notes", "", false);
  text = setStepWith(text, 0, "change", "", false);
  expect(value(text).steps[0]).toEqual({ uses: "prompts/implement.md" });
  // A null with is filled with a block map; a with that is not a map is never written.
  const nulled = setStepWith("version: theway.workflow/v1beta\nsteps:\n  - uses: prompts/review.md\n    with:\n", 0, "lens", "x", true);
  expect(nulled).toBe("version: theway.workflow/v1beta\nsteps:\n  - uses: prompts/review.md\n    with:\n      lens: x\n");
  const list = "version: theway.workflow/v1beta\nsteps:\n  - uses: prompts/review.md\n    with: [a]\n";
  expect(setStepWith(list, 0, "lens", "x", true)).toBe(list);
  // A number value turned into a numeric-looking string reads back as a string.
  const numeric = setStepWith("version: theway.workflow/v1beta\nsteps:\n  - with:\n      n: 3\n", 0, "n", "4", true);
  expect(value(numeric).steps[0].with.n).toBe("4");
});

test("matrix: on writes item: null, off removes it; values keep the list's node and style; a rename keeps its place", () => {
  const off = setMatrix(SOURCE, 1, false);
  expect(value(off).steps[1].matrix).toBeUndefined();
  const on = setMatrix(SOURCE, 0, true);
  expect(on).toContain("    matrix:\n      item: null\n");
  // Flow list: items replaced, flow kept.
  const flow = setMatrixValues(SOURCE, 1, ["x", "y", "z"]);
  expect(flow).toContain("      lens: [x, y, z]\n");
  // Block list: block kept.
  const block = "version: theway.workflow/v1beta\nsteps:\n  - matrix:\n      k:\n        - a\n        - b\n";
  expect(setMatrixValues(block, 0, ["c"])).toBe("version: theway.workflow/v1beta\nsteps:\n  - matrix:\n      k:\n        - c\n");
  // A key holding no list gets a flow list; no value writes null.
  const fresh = setMatrixValues(on, 0, ["p", "q"]);
  expect(fresh).toContain("      item: [p, q]\n");
  expect(setMatrixValues(flow, 1, [])).toContain("      lens: null\n");
  // Rename in place: the key keeps its place and comments.
  const renamed = renameMatrixKey(block, 0, "lens");
  expect(renamed).toBe("version: theway.workflow/v1beta\nsteps:\n  - matrix:\n      lens:\n        - a\n        - b\n");
  expect(renameMatrixKey(block, 0, "")).toBe(block);
  // A matrix the form cannot show is never written.
  const other = "version: theway.workflow/v1beta\nsteps:\n  - matrix: {a: [x], b: [y]}\n";
  expect(setMatrixValues(other, 0, ["z"])).toBe(other);
  expect(matrixLines("  a \n\n b\r\n  \n")).toEqual(["a", "b"]);
});

test("on-fail: a string or a block map of uses then with; a map keeps its keys; None removes on-fail and tries", () => {
  // A new on-fail with no required input is a string, and writes tries: 1.
  const plain = setOnFail(SOURCE, 0, PLAIN);
  expect(value(plain).steps[0]["on-fail"]).toBe("prompts/plain.md");
  expect(value(plain).steps[0].tries).toBe(1);
  // One with a required input is a block map of uses then with.
  const fix = setOnFail(SOURCE, 0, FIX);
  expect(value(fix).steps[0]["on-fail"]).toEqual({ uses: "prompts/fix.md", with: { why: "" } });
  expect(fix).toContain("    on-fail:\n      uses: prompts/fix.md\n      with:\n        why: \"\"\n    tries: 1\n");
  // An existing string replaced by a string keeps tries.
  const replaced = setOnFail(SOURCE, 1, PLAIN);
  expect(value(replaced).steps[1]["on-fail"]).toBe("prompts/plain.md");
  expect(value(replaced).steps[1].tries).toBe(2);
  // An existing map keeps its keys and gets its uses; Change rule on its with.
  const map = "version: theway.workflow/v1beta\nsteps:\n  - uses: prompts/plain.md\n    on-fail:\n      uses: prompts/fix.md\n      model: opus # m\n      with:\n        why: because\n        how: so\n    tries: 3\n";
  const changed = setOnFail(map, 0, prompt("redo", [["how", false], ["what", true]]));
  expect(value(changed).steps[0]["on-fail"]).toEqual({ uses: "prompts/redo.md", model: "opus", with: { how: "so", what: "" } });
  expect(changed).toContain("# m");
  // None removes on-fail and tries.
  expect(value(setOnFail(SOURCE, 1, null)).steps[1]).toEqual({ uses: "prompts/review.md", matrix: { lens: ["a", "b"] }, extra: "kept" });
});

test("a field set under a string on-fail makes it a block map of uses followed only by that key", () => {
  const withed = setOnFailWith(SOURCE, 1, "why", "because", true);
  expect(value(withed).steps[1]["on-fail"]).toEqual({ uses: "prompts/fix.md", with: { why: "because" } });
  const modeled = setOnFailModel(SOURCE, 1, "haiku");
  expect(value(modeled).steps[1]["on-fail"]).toEqual({ uses: "prompts/fix.md", model: "haiku" });
  // An empty optional value under a string writes nothing; null model on a string writes nothing.
  expect(setOnFailWith(SOURCE, 1, "how", "", false)).toBe(SOURCE);
  expect(setOnFailModel(SOURCE, 1, null)).toBe(SOURCE);
  // In a map: the model removed, an emptied on-fail.with removed.
  let text = setOnFailWith(modeled, 1, "how", "x", false);
  expect(value(text).steps[1]["on-fail"]).toEqual({ uses: "prompts/fix.md", model: "haiku", with: { how: "x" } });
  text = setOnFailWith(text, 1, "how", "", false);
  text = setOnFailModel(text, 1, null);
  expect(value(text).steps[1]["on-fail"]).toEqual({ uses: "prompts/fix.md" });
});

test("tries: an integer from 1 to 10 keeps its node; null removes it", () => {
  expect(value(setTries(SOURCE, 1, 5)).steps[1].tries).toBe(5);
  expect(value(setTries(SOURCE, 1, null)).steps[1].tries).toBeUndefined();
  expect(setTries(SOURCE, 1, 11)).toBe(SOURCE);
});

test("tries: any number shows as written; a value of another kind cannot be shown", () => {
  const triesOf = (raw: string) => {
    const f = stepForm(`version: theway.workflow/v1beta\nsteps:\n  - uses: prompts/plain.md\n    tries: ${raw}\n`, 0, [PLAIN], null);
    if (f === null || !f.valid) throw new Error("no form");
    return f.tries;
  };
  expect([triesOf("12"), triesOf("0"), triesOf("-3"), triesOf("2.5")]).toEqual([12, 0, -3, 2.5]);
  expect([triesOf('"x"'), triesOf("soon"), triesOf("[1]"), triesOf("{a: 1}"), triesOf("true")]).toEqual(["bad", "bad", "bad", "bad", "bad"]);
});

test("tries: a whole number from 1 to 10 replaces an out-of-range one; others write nothing", () => {
  const over = "version: theway.workflow/v1beta\nsteps:\n  - uses: prompts/plain.md\n    tries: 12 # many\n";
  expect(setTries(over, 0, 3)).toBe("version: theway.workflow/v1beta\nsteps:\n  - uses: prompts/plain.md\n    tries: 3 # many\n");
  expect(setTries(over, 0, 11)).toBe(over);
  expect(setTries(over, 0, 2.5)).toBe(over);
});

test("workflow keys: description always written, its >- style kept; default false removed; runs-on set", () => {
  const out = setWorkflowKey(SOURCE, "description", "Short");
  expect(out).toContain("description: >-\n  Short\n");
  expect(value(setWorkflowKey(SOURCE, "description", "")).description).toBe("");
  expect(value(setWorkflowKey(SOURCE, "runs-on", "session"))["runs-on"]).toBe("session");
  const on = setDefault(SOURCE, true);
  expect(Object.keys(value(on)).at(-1)).toBe("default");
  const off = setDefault(on, false);
  expect(value(off)).toEqual(value(SOURCE));
  keepsComments(SOURCE, off);
  keepsComments(SOURCE, on);
});

test("inputs: add input, input2…; rename in place; required removes default; defaults remove keys; last removed removes inputs", () => {
  expect(nextInputName([])).toBe("input");
  expect(nextInputName(["input", "input2"])).toBe("input3");
  let text = addInput(SOURCE);
  expect(value(text).inputs.input).toEqual({ description: "" });
  text = addInput(text);
  expect(Object.keys(value(text).inputs)).toEqual(["change", "input", "input2"]);
  // Rename in place: place, value and comments kept; an empty or taken name writes nothing.
  const renamed = renameInput(SOURCE, "change", "id");
  expect(renamed).toContain("  id:\n    # the change\n    description: The change\n");
  keepsComments(SOURCE, renamed);
  expect(renameInput(text, "input", "change")).toBe(text);
  expect(renameInput(text, "input", "")).toBe(text);
  // A rename rewrites nothing else.
  expect(renamed).toContain("${{ inputs.change }}");
  // Fields.
  let t = setInputField(text, "input", "default", "x");
  expect(value(t).inputs.input).toEqual({ description: "", default: "x" });
  t = setInputField(t, "input", "required", true);
  expect(value(t).inputs.input).toEqual({ description: "", required: true });
  t = setInputField(t, "input", "required", false);
  t = setInputField(t, "input", "type", "change");
  expect(value(t).inputs.input).toEqual({ description: "", type: "change" });
  t = setInputField(t, "input", "type", "text");
  t = setInputField(t, "input", "description", "");
  expect(value(t).inputs.input).toEqual({ description: "" });
  // Removing every input removes inputs.
  t = removeInput(removeInput(removeInput(t, "input"), "input2"), "change");
  expect(value(t).inputs).toBeUndefined();
  // A null inputs or declaration is filled; another value is never written.
  expect(value(addInput("version: theway.workflow/v1beta\ninputs:\n")).inputs).toEqual({ input: { description: "" } });
  expect(value(setInputField("inputs:\n  a:\n", "a", "description", "d")).inputs).toEqual({ a: { description: "d" } });
  const odd = "inputs: [a]\n";
  expect(addInput(odd)).toBe(odd);
  expect(keyError("", ["a"])).toBe("A name is required.");
  expect(keyError("a", ["a"])).toBe("This name is already used.");
  expect(keyError("b", ["a"])).toBeNull();
});

test("a \\r\\n file keeps \\r\\n on every line", () => {
  const crlf = SOURCE.replaceAll("\n", "\r\n");
  const out = moveStep(crlf, 0, 1);
  expect(out.replaceAll("\r\n", "")).not.toContain("\n");
  expect(out.split("\r\n").length).toBe(moveStep(SOURCE, 0, 1).split("\n").length);
  expect(editText(crlf, () => undefined)).toBe(crlf);
});

test("anchors and aliases are detected", () => {
  expect(hasAnchors(SOURCE)).toBe(false);
  expect(hasAnchors("a: &x 1\nb: *x\n")).toBe(true);
  expect(hasAnchors("a: &x {b: 1}\n")).toBe(true);
});

test("the step form reads each key, and marks what its controls cannot show", () => {
  const prompts = [IMPLEMENT, REVIEW, PLAIN, FIX];
  const f = stepForm(SOURCE, 1, prompts, null);
  if (f === null || !f.valid) throw new Error("no form");
  expect(f.uses).toBe("prompts/review.md");
  expect(f.prompt?.name).toBe("review");
  expect(f.matrix).toEqual({ state: "edit", key: "lens", values: ["a", "b"] });
  expect(f.onFail).toMatchObject({ value: "fix", model: null });
  expect(f.tries).toBe(2);
  const odd = "version: theway.workflow/v1beta\nsteps:\n  - 42\n  - uses: {a: 1}\n    runs-on: nowhere\n    with:\n      a: {b: c}\n      n: 3\n    matrix: {a: [x], b: [y]}\n    tries: 0\n";
  expect(stepForm(odd, 0, prompts, null)).toEqual({ valid: false });
  const g = stepForm(odd, 1, prompts, null);
  if (g === null || !g.valid) throw new Error("no form");
  expect([g.uses, g.prompt, g.runsOn, g.matrix, g.tries]).toEqual(["{a: 1}", null, "nowhere", { state: "other" }, 0]);
  expect(g.with).toEqual({ editable: true, values: new Map([["a", null], ["n", "3"]]) });
  expect(stepForm(odd, 5, prompts, null)).toBeNull();
  const w = workflowForm("description: [x]\ndefault: maybe\ninputs:\n  a:\n  b: 1\n  c:\n    required: yes\n    type: other\n");
  expect(w).toEqual({
    description: null,
    runsOn: null,
    default: null,
    inputsEditable: true,
    inputs: [
      { name: "a", editable: true, type: "text", description: "", required: false, default: "" },
      { name: "b", editable: false, type: "text", description: null, required: null, default: null },
      { name: "c", editable: true, type: "other", description: "", required: null, default: "" },
    ],
  });
  expect(workflowForm("inputs: 5\n")?.inputsEditable).toBe(false);
});

test("every row of the error table places its line", () => {
  const inputs = ["change", "a b"];
  const cases: [string, ReturnType<typeof placeLine>][] = [
    ["steps[2]: must be a map that runs a prompt", { panel: "step", index: 2, field: "alert" }],
    ["steps[0].uses: prompts/x.md not found in ~/.theway/prompts", { panel: "step", index: 0, field: "uses" }],
    ["steps[0].runs-on: must be agents or session", { panel: "step", index: 0, field: "runs-on" }],
    ["steps[0].model: must be one of opus, sonnet, haiku", { panel: "step", index: 0, field: "model" }],
    ["steps[0].matrix: must be a map with exactly one key", { panel: "step", index: 0, field: "matrix" }],
    ["steps[1].with: required input change is not set", { panel: "step", index: 1, field: "with.change" }],
    ["steps[1].with: prompts/x.md declares no input zz", { panel: "step", index: 1, field: "alert" }],
    ["steps[1].on-fail.with: required input why is not set", { panel: "step", index: 1, field: "on-fail.with.why" }],
    ["steps[1].on-fail.with: must be a map of prompt input name to a value", { panel: "step", index: 1, field: "alert" }],
    ["steps[1].on-fail.model: must be one of opus, sonnet, haiku", { panel: "step", index: 1, field: "on-fail.model" }],
    ["steps[1].on-fail.uses: prompts/x.md not found", { panel: "step", index: 1, field: "on-fail" }],
    ["steps[1].on-fail: needs tries (an integer from 1 to 10)", { panel: "step", index: 1, field: "tries" }],
    ["steps[1].on-fail: unknown key x", { panel: "step", index: 1, field: "on-fail" }],
    ["steps[1].tries: must be an integer from 1 to 10", { panel: "step", index: 1, field: "tries" }],
    ["steps[1].extra: unknown key", { panel: "step", index: 1, field: "alert" }],
    ["workflows/a.yaml and workflows/b.yaml both set default: true", { panel: "workflow", field: "default" }],
    ["description: must be a non-empty string", { panel: "workflow", field: "description" }],
    ["runs-on: must be agents or session", { panel: "workflow", field: "runs-on" }],
    ["default: must be true or false", { panel: "workflow", field: "default" }],
    ["inputs.change: description must be a non-empty string", { panel: "workflow", field: "inputs.change.description" }],
    ["inputs.change: required must be true or false", { panel: "workflow", field: "inputs.change.required" }],
    ["inputs.change: default is refused together with required: true", { panel: "workflow", field: "inputs.change.default" }],
    ["inputs.change: type must be text or change", { panel: "workflow", field: "inputs.change.type" }],
    ["inputs.a b: must be a param name (lowercase letters, digits and _, starting with a letter)", { panel: "workflow", field: "inputs.a b" }],
    ["inputs.change: unknown key x", { panel: "workflow", field: "inputs.change" }],
    ["inputs: must be a map of input name to its declaration", { panel: "workflow", field: "alert" }],
    ["steps: must be a non-empty list", { panel: "workflow", field: "alert" }],
    ["version: must be theway.workflow/v1beta", { panel: "workflow", field: "alert" }],
    ["prompts/review.md: model: must be one of opus, sonnet, haiku", { panel: "none" }],
    ["something else entirely", { panel: "workflow", field: "alert" }],
  ];
  for (const [line, place] of cases) expect([line, placeLine(line, inputs)]).toEqual([line, place]);
});

test("the picker lists the project's own step prompts then the global ones it does not hide, filtered and in name order", () => {
  const rows: PromptRow[] = [
    prompt("zeta", [], null, "Last one"),
    prompt("alpha", [], null, "First"),
    prompt("review", [], null, "Global review"),
    prompt("review", [], "-p", "Own review"),
    { ...prompt("notes", [], null, "A reference"), header: false },
  ];
  const all = pickerGroups(rows, "-p", "");
  expect(all.own.map((p) => p.name)).toEqual(["review"]);
  expect(all.global.map((p) => p.name)).toEqual(["alpha", "zeta"]);
  expect(pickerGroups(rows, null, "").global.map((p) => p.name)).toEqual(["alpha", "review", "zeta"]);
  expect(pickerGroups(rows, "-p", "LAST").global.map((p) => p.name)).toEqual(["zeta"]);
  expect(pickerGroups(rows, "-p", "REV").own.map((p) => p.description)).toEqual(["Own review"]);
  expect(stepPromptNames(rows, "-p")).toEqual(["alpha", "review", "zeta"]);
});

test("a project prompt that is not a step prompt hides the global step prompt of its name", () => {
  const rows: PromptRow[] = [
    prompt("alpha", [], null, "Global alpha"),
    prompt("zeta", [], null, "Global zeta"),
    { ...prompt("alpha", [], "-p", "Own notes"), header: false },
  ];
  expect(pickerGroups(rows, "-p", "").own).toEqual([]);
  expect(pickerGroups(rows, "-p", "").global.map((p) => p.name)).toEqual(["zeta"]);
  expect(stepPromptNames(rows, "-p")).toEqual(["zeta"]);
  expect(stepPromptNames(rows, null)).toEqual(["alpha", "zeta"]);
});
