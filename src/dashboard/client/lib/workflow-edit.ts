/**
 * Editing a workflow's text from the canvas: each edit loads the text with `parseDocument`, changes the Document's
 * nodes and prints it again, so values, comments, blank lines and scalar styles stay as written. Also what the panel's
 * forms read from the text, where each check line is shown, and the step picker's rows. Pure: no React, no DOM.
 */
import { type Document, isAlias, isMap, isScalar, isSeq, type Node, type Pair, parseDocument, visit, YAMLMap, YAMLSeq } from "yaml";
import { fileMatches, lineSeparatorOf, type PromptRow } from "./files";
import { findPrompt, promptRef } from "./workflow";

/** How every edit prints the Document. */
const PRINT = { lineWidth: 0, flowCollectionPadding: false } as const;

/** The models a `model` select offers, in order. */
export const MODELS = ["opus", "sonnet", "haiku"] as const;

/** The places a step runs, in the order the selects offer them. */
export const RUNS_ON = ["session", "agents"] as const;

/** The input types, in the order the select offers them. */
export const INPUT_TYPES = ["text", "change"] as const;

/** Thrown inside an edit that cannot apply: the text stays as it was. */
class NoEdit extends Error {}

const refuse = (): never => {
  throw new NoEdit();
};

/** A node holding nothing: a missing value, or a null scalar (`key:`, `key: ~`, `key: null`). */
const isNull = (node: unknown): boolean => node === null || (isScalar(node) && node.value === null);

/** A map's value node for `key`; `undefined` when absent. */
const node = (map: YAMLMap, key: string): unknown => map.get(key, true) as unknown;

/** The string a map key reads as. */
const keyOf = (pair: Pair): string => String(isScalar(pair.key) ? pair.key.value : pair.key);

/**
 * `text` changed by `change`: loaded with `parseDocument`, changed, printed with `lineWidth: 0` and
 * `flowCollectionPadding: false`, every `\n` written `\r\n` when the text's first line break is `\r\n`. A text that does
 * not parse, a change that leaves the Document as it printed, or a change or print that throws, gives `text` back
 * unchanged.
 */
export function editText(text: string, change: (doc: Document, root: YAMLMap) => void): string {
  try {
    const doc = parseDocument(text, { logLevel: "silent" });
    if (doc.errors.length > 0 || !isMap(doc.contents)) return text;
    const before = doc.toString(PRINT);
    change(doc, doc.contents);
    const out = doc.toString(PRINT);
    if (out === before) return text;
    return lineSeparatorOf(text) === "\r\n" ? out.replaceAll("\n", "\r\n") : out;
  } catch {
    return text;
  }
}

/** Whether a workflow's Document holds an anchor or an alias: the canvas then edits nothing. */
export function hasAnchors(text: string): boolean {
  const doc = parseDocument(text, { logLevel: "silent" });
  let found = false;
  visit(doc, {
    Alias() {
      found = true;
      return visit.BREAK;
    },
    Node(_, node) {
      if (node.anchor !== undefined && node.anchor !== null && node.anchor !== "") {
        found = true;
        return visit.BREAK;
      }
      return undefined;
    },
  });
  return found || isAlias(doc.contents);
}

/** A new empty block map. */
function blockMap(doc: Document): YAMLMap {
  const map = doc.createNode({}) as YAMLMap;
  map.flow = false;
  return map;
}

/** The steps list of the Document, refused when it has none. */
function stepsOf(root: YAMLMap): YAMLSeq {
  const seq = node(root, "steps");
  return isSeq(seq) ? seq : refuse();
}

/** Step `index` as a map, refused for any other node. */
function stepOf(root: YAMLMap, index: number): YAMLMap {
  const node = stepsOf(root).items[index];
  return isMap(node) ? node : refuse();
}

/** The names of the workflow's inputs, as written. */
function inputNames(root: YAMLMap): string[] {
  const inputs = node(root, "inputs");
  return isMap(inputs) ? inputs.items.map(keyOf) : [];
}

/** The value a required input of a prompt is written with: `${{ inputs.<name> }}` when the workflow declares it, else `""`. */
const requiredValue = (root: YAMLMap, name: string): string => (inputNames(root).includes(name) ? `\${{ inputs.${name} }}` : "");

/** The `with` a new step or on-fail writes: its prompt's required inputs, in declaration order; `null` for none. */
function requiredWith(root: YAMLMap, prompt: PromptRow): Record<string, string> | null {
  const required = prompt.inputs.filter((i) => i.required);
  return required.length === 0 ? null : Object.fromEntries(required.map((i) => [i.name, requiredValue(root, i.name)]));
}

/**
 * The Change rule on the `with` of `map` (a step or an on-fail map): the keys the prompt declares are kept, its
 * required inputs that are missing are added, the other keys are removed, and a `with` left empty is removed. A `with`
 * that is neither a map nor null is left untouched.
 */
function changeWith(doc: Document, root: YAMLMap, map: YAMLMap, prompt: PromptRow): void {
  const declared = new Set(prompt.inputs.map((i) => i.name));
  let w = node(map, "with");
  if (map.has("with") && !isMap(w) && !isNull(w)) return;
  if (isMap(w)) w.items = w.items.filter((p) => declared.has(keyOf(p)));
  const current = w;
  const missing = prompt.inputs.filter((i) => i.required && !(isMap(current) && current.has(i.name)));
  if (missing.length > 0) {
    if (!isMap(w)) {
      w = blockMap(doc);
      map.set("with", w);
    }
    for (const i of missing) (w as YAMLMap).set(i.name, requiredValue(root, i.name));
  }
  if (isMap(w) && w.items.length === 0) map.delete("with");
}

/**
 * Sets input `name` of the `with` of `map` to `value`: an empty optional value removes its key, and a `with` left empty
 * is removed; a null `with` becomes a block map. A `with` that holds another value, or a key holding a map or a list,
 * is refused.
 */
function setWith(doc: Document, map: YAMLMap, name: string, value: string, required: boolean): void {
  let w = node(map, "with");
  if (map.has("with") && !isMap(w) && !isNull(w)) refuse();
  if (isMap(w)) {
    const held = node(w, name);
    if (isMap(held) || isSeq(held)) refuse();
  }
  if (value === "" && !required) {
    if (isMap(w)) {
      w.delete(name);
      if (w.items.length === 0) map.delete("with");
    }
    return;
  }
  if (!isMap(w)) {
    w = blockMap(doc);
    map.set("with", w);
  }
  (w as YAMLMap).set(name, value);
}

// ---------------------------------------------------------------------------------------------------------------------
// Steps

/**
 * Adds a step running `prompt` at `at` (0 is before the first step): `uses` then `with` holding the prompt's required
 * inputs in its declaration order (no `with` when it has none). With `steps: []` or no `steps` key, the step goes in
 * the list the Document holds, created when absent, set to block style when it was empty.
 */
export function addStep(text: string, at: number, prompt: PromptRow): string {
  return editText(text, (doc, root) => {
    let seq = node(root, "steps");
    if (!isSeq(seq)) {
      if (root.has("steps") && !isNull(seq)) refuse();
      seq = new YAMLSeq(doc.schema);
      root.set("steps", seq);
    }
    const list = seq as YAMLSeq;
    if (at < 0 || at > list.items.length) refuse();
    if (list.items.length === 0) list.flow = false;
    const value: Record<string, unknown> = { uses: `prompts/${prompt.name}.md` };
    const w = requiredWith(root, prompt);
    if (w !== null) value.with = w;
    list.items.splice(at, 0, doc.createNode(value));
  });
}

/** Moves step `index` up (`-1`) or down (`1`). */
export function moveStep(text: string, index: number, delta: -1 | 1): string {
  return editText(text, (_, root) => {
    const seq = stepsOf(root);
    const to = index + delta;
    if (index < 0 || index >= seq.items.length || to < 0 || to >= seq.items.length) refuse();
    const [item] = seq.items.splice(index, 1);
    seq.items.splice(to, 0, item);
  });
}

/** Removes step `index`; removing the last step leaves `steps: []`. */
export function removeStep(text: string, index: number): string {
  return editText(text, (_, root) => {
    const seq = stepsOf(root);
    if (index < 0 || index >= seq.items.length) refuse();
    seq.items.splice(index, 1);
    if (seq.items.length === 0) seq.flow = true;
  });
}

/** Changes the prompt of step `index`: its `uses`, and the Change rule on its `with`. */
export function changeStepPrompt(text: string, index: number, prompt: PromptRow): string {
  return editText(text, (doc, root) => {
    const step = stepOf(root, index);
    step.set("uses", `prompts/${prompt.name}.md`);
    changeWith(doc, root, step, prompt);
  });
}

/** Sets `runs-on` or `model` of step `index`; `null` removes the key. */
export function setStepKey(text: string, index: number, key: "runs-on" | "model", value: string | null): string {
  return editText(text, (_, root) => {
    const step = stepOf(root, index);
    if (value === null) step.delete(key);
    else step.set(key, value);
  });
}

/** Sets input `name` of the `with` of step `index`. */
export function setStepWith(text: string, index: number, name: string, value: string, required: boolean): string {
  return editText(text, (doc, root) => setWith(doc, stepOf(root, index), name, value, required));
}

/** The only key of an editable `matrix` of step `index`. */
function matrixPair(root: YAMLMap, index: number): Pair {
  const matrix = stepOf(root, index).get("matrix", true);
  if (!isMap(matrix) || matrix.items.length !== 1) return refuse();
  const pair = matrix.items[0] as Pair;
  return isScalar(pair.key) ? pair : refuse();
}

/** Turns the `matrix` of step `index` on (`item: null`) or off (removed). */
export function setMatrix(text: string, index: number, on: boolean): string {
  return editText(text, (doc, root) => {
    const step = stepOf(root, index);
    if (!on) step.delete("matrix");
    else if (!step.has("matrix")) step.set("matrix", doc.createNode({ item: null }));
  });
}

/** Renames the matrix key of step `index` in place: a non-empty name only. */
export function renameMatrixKey(text: string, index: number, name: string): string {
  return editText(text, (_, root) => {
    if (name === "") refuse();
    (matrixPair(root, index).key as { value: unknown }).value = name;
  });
}

/**
 * Sets the matrix values of step `index`: the items of its list replaced (the node and its style kept), a new flow
 * list when the key held no list, the null value for none.
 */
export function setMatrixValues(text: string, index: number, values: readonly string[]): string {
  return editText(text, (doc, root) => {
    const pair = matrixPair(root, index);
    if (pair.value !== null && !isNull(pair.value) && !isSeq(pair.value)) refuse();
    if (values.length === 0) {
      if (!isNull(pair.value)) pair.value = doc.createNode(null);
      return;
    }
    if (isSeq(pair.value)) {
      pair.value.items = values.map((v) => doc.createNode(v));
      return;
    }
    const seq = doc.createNode([...values]) as YAMLSeq;
    seq.flow = true;
    pair.value = seq;
  });
}

/**
 * Sets the on-fail of step `index` to `prompt`, `null` removing `on-fail` and `tries`. An on-fail map gets its `uses`
 * and the Change rule on its `with`; otherwise it is written as the string `prompts/<name>.md`, or as a block map of
 * `uses` then `with` when a required input must be written. A step with no `tries` gets `tries: 1`.
 */
export function setOnFail(text: string, index: number, prompt: PromptRow | null): string {
  return editText(text, (doc, root) => {
    const step = stepOf(root, index);
    if (prompt === null) {
      step.delete("on-fail");
      step.delete("tries");
      return;
    }
    const ref = `prompts/${prompt.name}.md`;
    const current = node(step, "on-fail");
    if (isMap(current)) {
      current.set("uses", ref);
      changeWith(doc, root, current, prompt);
    } else {
      const w = requiredWith(root, prompt);
      if (w === null) step.set("on-fail", ref);
      else {
        const map = doc.createNode({ uses: ref, with: w }) as YAMLMap;
        map.flow = false;
        step.set("on-fail", map);
      }
    }
    if (!step.has("tries")) step.set("tries", 1);
  });
}

/** The on-fail of a step as a map to write in: a string one becomes a block map of `uses` alone. */
function onFailMap(doc: Document, step: YAMLMap): YAMLMap {
  const current = node(step, "on-fail");
  if (isMap(current)) return current;
  if (!isScalar(current) || typeof current.value !== "string") return refuse();
  const map = blockMap(doc);
  map.set("uses", current.value);
  step.set("on-fail", map);
  return map;
}

/** Sets input `name` of the on-fail's `with` of step `index`; a string on-fail becomes a map of `uses` then `with`. */
export function setOnFailWith(text: string, index: number, name: string, value: string, required: boolean): string {
  return editText(text, (doc, root) => {
    const step = stepOf(root, index);
    const current = node(step, "on-fail");
    // An empty optional value under a string on-fail has nothing to remove.
    if (value === "" && !required && !isMap(current)) return;
    setWith(doc, onFailMap(doc, step), name, value, required);
  });
}

/** Sets the on-fail's `model` of step `index`; `null` removes it. A string on-fail becomes a map of `uses` then `model`. */
export function setOnFailModel(text: string, index: number, value: string | null): string {
  return editText(text, (doc, root) => {
    const step = stepOf(root, index);
    const current = node(step, "on-fail");
    if (value === null) {
      if (isMap(current)) current.delete("model");
      return;
    }
    onFailMap(doc, step).set("model", value);
  });
}

/** Sets `tries` of step `index`, an integer from 1 to 10; `null` removes it. */
export function setTries(text: string, index: number, tries: number | null): string {
  return editText(text, (_, root) => {
    const step = stepOf(root, index);
    if (tries === null) step.delete("tries");
    else if (Number.isInteger(tries) && tries >= 1 && tries <= 10) step.set("tries", tries);
    else refuse();
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Workflow

/** Sets the workflow's `description` (always written, an empty one as `""`) or `runs-on`. */
export function setWorkflowKey(text: string, key: "description" | "runs-on", value: string): string {
  return editText(text, (_, root) => {
    const held = node(root, key);
    if (isMap(held) || isSeq(held)) refuse();
    root.set(key, value);
  });
}

/** Sets the workflow's `default`: `false` removes the key. */
export function setDefault(text: string, on: boolean): string {
  return editText(text, (_, root) => {
    if (on) root.set("default", true);
    else root.delete("default");
  });
}

/** The workflow's `inputs` as a map to write in: a missing or null one becomes a block map, any other value is refused. */
function inputsMap(doc: Document, root: YAMLMap): YAMLMap {
  const inputs = node(root, "inputs");
  if (isMap(inputs)) return inputs;
  if (root.has("inputs") && !isNull(inputs)) return refuse();
  const map = blockMap(doc);
  root.set("inputs", map);
  return map;
}

/** The name "Add input" gives: `input`, then `input2`, `input3`… the first no input has. */
export function nextInputName(taken: readonly string[]): string {
  if (!taken.includes("input")) return "input";
  let n = 2;
  while (taken.includes(`input${n}`)) n += 1;
  return `input${n}`;
}

/** Adds an input named by `nextInputName`, with an empty description. */
export function addInput(text: string): string {
  return editText(text, (doc, root) => {
    const inputs = inputsMap(doc, root);
    inputs.set(nextInputName(inputs.items.map(keyOf)), doc.createNode({ description: "" }));
  });
}

/** Renames input `from` to `to` in place: a non-empty name no other input has. */
export function renameInput(text: string, from: string, to: string): string {
  return editText(text, (_, root) => {
    const inputs = node(root, "inputs");
    if (!isMap(inputs) || to === "" || (to !== from && inputs.has(to))) refuse();
    const pair = (inputs as YAMLMap).items.find((p) => keyOf(p) === from);
    if (pair === undefined || !isScalar(pair.key)) refuse();
    ((pair as Pair).key as { value: unknown }).value = to;
  });
}

/** Removes input `name`; removing the last one removes `inputs`. */
export function removeInput(text: string, name: string): string {
  return editText(text, (_, root) => {
    const inputs = node(root, "inputs");
    if (!isMap(inputs) || !inputs.has(name)) refuse();
    (inputs as YAMLMap).delete(name);
    if ((inputs as YAMLMap).items.length === 0) root.delete("inputs");
  });
}

/** A field of an input declaration. */
export type InputKey = "type" | "description" | "required" | "default";

/**
 * Sets a field of input `name`: `type: text`, `required: false` and an empty `default` remove their key, `description`
 * is always written, and turning `required` on removes `default`. A null declaration becomes a block map.
 */
export function setInputField(text: string, name: string, key: InputKey, value: string | boolean): string {
  return editText(text, (doc, root) => {
    const inputs = node(root, "inputs");
    if (!isMap(inputs)) return refuse();
    const pair = inputs.items.find((p) => keyOf(p) === name);
    if (pair === undefined) return refuse();
    let decl = pair.value;
    if (!isMap(decl)) {
      if (!isNull(decl)) refuse();
      decl = blockMap(doc);
      pair.value = decl;
    }
    const d = decl as YAMLMap;
    const held = node(d, key);
    if (isMap(held) || isSeq(held)) refuse();
    if (key === "required") {
      if (value === true) {
        d.set("required", true);
        d.delete("default");
      } else d.delete("required");
    } else if (key === "type") {
      if (value === "text") d.delete("type");
      else d.set("type", value);
    } else if (key === "default") {
      if (value === "") d.delete("default");
      else d.set("default", value);
    } else d.set("description", value);
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// What the forms read

/** A text control's value: its text, or `null` when the control cannot show it (disabled, written by nothing). */
export type TextValue = string | null;

/** The YAML source text of a node. */
function sourceOf(text: string, node: unknown): string {
  const range = (node as Node | null)?.range;
  return range === undefined || range === null ? String(node ?? "") : text.slice(range[0], range[1]);
}

/** A select's value: `null` when absent, else the value as written (a scalar's text, or the node's source). */
function selectValue(text: string, node: unknown, present: boolean): string | null {
  if (!present) return null;
  if (isScalar(node)) return node.value === null ? sourceOf(text, node) : String(node.value);
  return sourceOf(text, node);
}

/** A text field's value: a scalar's text (`""` for null), `null` for a map or a list. */
function textValue(node: unknown): TextValue {
  if (node === undefined || isNull(node)) return "";
  if (isScalar(node)) return String(node.value);
  return null;
}

/** The fields of a `with` map: each key's text value. */
export type WithForm =
  /** No `with`, a null one, or a map. */
  | { editable: true; values: Map<string, TextValue> }
  /** A `with` that is neither a map nor null: its fields are disabled. */
  | { editable: false };

function withForm(map: YAMLMap): WithForm {
  const w = node(map, "with");
  if (map.has("with") && !isMap(w) && !isNull(w)) return { editable: false };
  const values = new Map<string, TextValue>();
  if (isMap(w)) for (const p of w.items) values.set(keyOf(p), textValue(p.value));
  return { editable: true, values };
}

/** The `matrix` as the form shows it. */
export type MatrixForm = { state: "off" } | { state: "edit"; key: string; values: string[] } | { state: "other" };

function matrixForm(step: YAMLMap): MatrixForm {
  if (!step.has("matrix")) return { state: "off" };
  const m = node(step, "matrix");
  if (!isMap(m) || m.items.length !== 1) return { state: "other" };
  const pair = m.items[0] as Pair;
  if (!isScalar(pair.key)) return { state: "other" };
  const key = String(pair.key.value);
  if (isNull(pair.value)) return { state: "edit", key, values: [] };
  if (isSeq(pair.value) && pair.value.items.every((v) => isScalar(v) && typeof v.value === "string")) {
    return { state: "edit", key, values: pair.value.items.map((v) => String((v as { value: unknown }).value)) };
  }
  return { state: "other" };
}

/** The on-fail as the form shows it. */
export type OnFailForm = {
  /** The prompt name its `uses` names, else the value as written (an invalid option), `""` for a map with no `uses`. */
  value: string;
  /** The prompt it names, found in the workflow's context; `null` when none is. */
  prompt: PromptRow | null;
  with: WithForm;
  model: string | null;
};

/** A step as the step panel shows it. */
export type StepForm =
  | { valid: false }
  | {
      valid: true;
      /** `uses` as written; `null` when missing. */
      uses: string | null;
      /** The prompt its `uses` names, found in the workflow's context; `null` when none is. */
      prompt: PromptRow | null;
      runsOn: string | null;
      model: string | null;
      with: WithForm;
      matrix: MatrixForm;
      onFail: OnFailForm | null;
      /** `tries`: the integer, `null` when absent, `"bad"` for a value its control cannot show. */
      tries: number | null | "bad";
    };

/** Step `index` of a workflow's text as the step panel shows it; `null` when the text has no such step. */
export function stepForm(text: string, index: number, prompts: readonly PromptRow[], project: string | null): StepForm | null {
  const doc = parseDocument(text, { logLevel: "silent" });
  const root = doc.contents;
  if (!isMap(root)) return null;
  const seq = node(root, "steps");
  if (!isSeq(seq) || index < 0 || index >= seq.items.length) return null;
  const step = seq.items[index];
  if (!isMap(step)) return { valid: false };
  const find = (v: unknown): PromptRow | null => {
    const name = promptRef(v);
    return name === null ? null : findPrompt(prompts, project, name);
  };
  const usesNode = node(step, "uses");
  const uses = step.has("uses") ? (isScalar(usesNode) && usesNode.value !== null ? String(usesNode.value) : sourceOf(text, usesNode)) : null;

  let onFail: OnFailForm | null = null;
  if (step.has("on-fail")) {
    const of = node(step, "on-fail");
    if (isMap(of)) {
      const u = node(of, "uses");
      const raw = isScalar(u) ? u.value : undefined;
      const name = promptRef(raw);
      onFail = {
        value: !of.has("uses") ? "" : (name ?? selectValue(text, u, true) ?? ""),
        prompt: find(raw),
        with: withForm(of),
        model: selectValue(text, node(of, "model"), of.has("model")),
      };
    } else {
      const raw = isScalar(of) ? of.value : undefined;
      const name = promptRef(raw);
      onFail = {
        value: name ?? selectValue(text, of, true) ?? "",
        prompt: find(raw),
        with: { editable: true, values: new Map() },
        model: null,
      };
    }
  }
  const triesNode = node(step, "tries");
  const t = isScalar(triesNode) ? triesNode.value : undefined;
  const tries = !step.has("tries") ? null : typeof t === "number" && Number.isInteger(t) && t >= 1 && t <= 10 ? t : "bad";
  return {
    valid: true,
    uses,
    prompt: find(isScalar(usesNode) ? usesNode.value : undefined),
    runsOn: selectValue(text, node(step, "runs-on"), step.has("runs-on")),
    model: selectValue(text, node(step, "model"), step.has("model")),
    with: withForm(step),
    matrix: matrixForm(step),
    onFail,
    tries,
  };
}

/** One input as the workflow panel shows it; a field `null` cannot be shown by its control. */
export type InputForm = {
  name: string;
  /** False for a declaration that is neither a map nor null: its fields are disabled. */
  editable: boolean;
  type: string | null;
  description: TextValue;
  required: boolean | null;
  default: TextValue;
};

/** The workflow's own keys as the workflow panel shows them. */
export type WorkflowForm = {
  description: TextValue;
  runsOn: string | null;
  /** `null`: a value the switch cannot show. */
  default: boolean | null;
  /** False for an `inputs` that is neither a map nor null: its fields and Add input are disabled. */
  inputsEditable: boolean;
  inputs: InputForm[];
};

/** A workflow's text as the workflow panel shows it; `null` when its root is not a map. */
export function workflowForm(text: string): WorkflowForm | null {
  const doc = parseDocument(text, { logLevel: "silent" });
  const root = doc.contents;
  if (!isMap(root)) return null;
  const def = node(root, "default");
  const defValue = isScalar(def) ? def.value : undefined;
  const inputs = node(root, "inputs");
  const inputsEditable = !root.has("inputs") || isMap(inputs) || isNull(inputs);
  const list: InputForm[] = isMap(inputs)
    ? inputs.items.map((p): InputForm => {
        const d = p.value;
        const name = keyOf(p);
        if (!isMap(d)) {
          const editable = isNull(d);
          return { name, editable, type: "text", description: editable ? "" : null, required: editable ? false : null, default: editable ? "" : null };
        }
        const req = node(d, "required");
        const reqValue = !d.has("required") ? false : isScalar(req) && typeof req.value === "boolean" ? req.value : null;
        return {
          name,
          editable: true,
          type: d.has("type") ? selectValue(text, node(d, "type"), true) : "text",
          description: textValue(node(d, "description")),
          required: reqValue,
          default: textValue(node(d, "default")),
        };
      })
    : [];
  return {
    description: textValue(node(root, "description")),
    runsOn: selectValue(text, node(root, "runs-on"), root.has("runs-on")),
    default: !root.has("default") ? false : typeof defValue === "boolean" ? defValue : null,
    inputsEditable,
    inputs: list,
  };
}

/** The matrix values a textarea's text gives: its lines, trimmed, blank ones dropped. */
export const matrixLines = (value: string): string[] =>
  value
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "");

/** The error of a key field (an input's name, the matrix Key): empty, taken by a sibling, else `null`. */
export function keyError(name: string, siblings: readonly string[]): string | null {
  if (name === "") return "A name is required.";
  if (siblings.includes(name)) return "This name is already used.";
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Where each check line is shown

/**
 * Where a check line (read without its own file's prefix) is shown: under a field of step N's panel or of the workflow
 * panel, in that panel's alert, or in neither panel. Step fields: `uses`, `runs-on`, `model`, `matrix`, `with.<X>`,
 * `on-fail`, `on-fail.with.<X>`, `on-fail.model`, `tries`. Workflow fields: `description`, `runs-on`, `default`,
 * `inputs.<name>` (its name field) and `inputs.<name>.<key>`.
 */
export type Place = { panel: "step"; index: number; field: string } | { panel: "workflow"; field: string } | { panel: "none" };

const STEP = /^steps\[(\d+)\]/;

/** The input name and rest of an `inputs.<name>: ` line, `inputs` naming the workflow's inputs. */
function inputLine(line: string, inputs: readonly string[]): { name: string; rest: string } | null {
  if (!line.startsWith("inputs.")) return null;
  const tail = line.slice("inputs.".length);
  // A declared name first: a name may hold `: ` itself.
  const known = [...inputs].sort((a, b) => b.length - a.length).find((n) => tail.startsWith(`${n}: `));
  if (known !== undefined) return { name: known, rest: tail.slice(known.length + 2) };
  const at = tail.indexOf(": ");
  return at === -1 ? null : { name: tail.slice(0, at), rest: tail.slice(at + 2) };
}

/** Where `line` is shown, by the first row of the spec's table that matches it. */
export function placeLine(line: string, inputs: readonly string[] = []): Place {
  const m = STEP.exec(line);
  if (m !== null) {
    const index = Number(m[1]);
    const rest = line.slice((m[0] as string).length);
    const step = (field: string): Place => ({ panel: "step", index, field });
    if (rest.startsWith(": ")) return step("alert");
    for (const key of ["uses", "runs-on", "model", "matrix"]) if (rest.startsWith(`.${key}: `)) return step(key);
    const req = /^\.with: required input (.+) is not set$/.exec(rest);
    if (req !== null) return step(`with.${req[1]}`);
    if (rest.startsWith(".with: ")) return step("alert");
    const onFailReq = /^\.on-fail\.with: required input (.+) is not set$/.exec(rest);
    if (onFailReq !== null) return step(`on-fail.with.${onFailReq[1]}`);
    if (rest.startsWith(".on-fail.with: ")) return step("alert");
    if (rest.startsWith(".on-fail.model: ")) return step("on-fail.model");
    if (rest.startsWith(".on-fail.uses: ")) return step("on-fail");
    if (rest.startsWith(".on-fail: needs tries")) return step("tries");
    if (rest.startsWith(".on-fail: ")) return step("on-fail");
    if (rest.startsWith(".tries: ")) return step("tries");
    if (rest.startsWith(".")) return step("alert");
  }
  const workflow = (field: string): Place => ({ panel: "workflow", field });
  if (line.endsWith(" both set default: true")) return workflow("default");
  for (const key of ["description", "runs-on", "default"]) if (line.startsWith(`${key}: `)) return workflow(key);
  const input = inputLine(line, inputs);
  if (input !== null) {
    const key = /^(description|required|default|type)(?: |$)/.exec(input.rest)?.[1];
    return workflow(key === undefined ? `inputs.${input.name}` : `inputs.${input.name}.${key}`);
  }
  if (/^prompts\/[^/:\s]+\.md: /.test(line)) return { panel: "none" };
  return workflow("alert");
}

// ---------------------------------------------------------------------------------------------------------------------
// The step picker

/** The step prompts of a workflow's context: the project's own, and the global ones no project prompt hides. */
export function contextPrompts(prompts: readonly PromptRow[], project: string | null): { own: PromptRow[]; global: PromptRow[] } {
  const byName = (a: PromptRow, b: PromptRow) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const steps = prompts.filter((p) => p.header);
  const own = project === null ? [] : steps.filter((p) => p.project === project).sort(byName);
  // Every project prompt hides the global one of its name, step prompt or not: `prompts/<name>.md` resolves to it.
  const hidden = new Set(project === null ? [] : prompts.filter((p) => p.project === project).map((p) => p.name));
  const global = steps.filter((p) => p.project === null && !hidden.has(p.name)).sort(byName);
  return { own, global };
}

/** The picker's groups for the typed text: the rows whose name or description holds it, ignoring case, in name order. */
export function pickerGroups(prompts: readonly PromptRow[], project: string | null, q: string): { own: PromptRow[]; global: PromptRow[] } {
  const { own, global } = contextPrompts(prompts, project);
  const keep = (p: PromptRow) => fileMatches(p, q);
  return { own: own.filter(keep), global: global.filter(keep) };
}

/** The names the `on-fail` select offers: each step prompt of the context, in name order. */
export function stepPromptNames(prompts: readonly PromptRow[], project: string | null): string[] {
  const { own, global } = contextPrompts(prompts, project);
  return [...new Set([...own, ...global].map((p) => p.name))].sort();
}
