/**
 * The editor's operations: pure functions over `yaml` Documents of workflow files. Every edit goes through the
 * Document API, so the comments of a file are kept. DOM-free.
 */
import { type Document, isMap, isNode, isScalar, isSeq, type Node, parseDocument, Scalar, visit, type YAMLMap, type YAMLSeq } from "yaml";

/** A YAML path: map keys and list indices, as `Document.getIn` takes it. */
export type Path = (string | number)[];

/** The options every text is written with: flow collections unpadded, no folding, an empty null (`- implement:`). */
export const TEXT_OPTIONS = { flowCollectionPadding: false, lineWidth: 0, nullStr: "" } as const;

/** A document's text, as the editor saves it. */
export const textOf = (doc: Document): string => doc.toString(TEXT_OPTIONS);

/** A document parsed from a file's text; `doc.errors` holds why it does not parse. */
export const parse = (text: string): Document => parseDocument(text);

/** Whether a value is a whole `${…}` reference. */
export const isRef = (v: unknown): v is string => typeof v === "string" && /^\$\{[^}]*\}$/.test(v);

// ---- Comments ----

/** Every comment text in `node` and below it, in document order. */
function commentsIn(node: unknown): string[] {
  const out: string[] = [];
  const take = (n: Node) => {
    if (n.commentBefore) out.push(n.commentBefore);
    if (n.comment) out.push(n.comment);
  };
  // `visit` calls back on `node` itself first, so a collection's own comments come first too.
  if (isMap(node) || isSeq(node)) {
    visit(node, (_, n) => {
      if (isNode(n)) take(n);
    });
  } else if (isNode(node)) take(node);
  return out;
}

/** Appends `texts` to a node's trailing (`comment`) or leading (`commentBefore`) comment. */
function addComments(node: Node, texts: string[], where: "comment" | "commentBefore"): void {
  if (texts.length === 0) return;
  node[where] = [node[where], ...texts].filter((t) => t !== null && t !== undefined && t !== "").join("\n");
}

/**
 * Gives `next` every comment of the node it replaces: its leading comment before a block `next`, and the rest, with
 * the comments of the items inside it, after `next`.
 */
function carry(prev: unknown, next: unknown): void {
  if (!isNode(prev) || !isNode(next)) return;
  const texts = commentsIn(prev);
  const block = (isMap(next) || isSeq(next)) && !next.flow;
  const before = block && prev.commentBefore ? 1 : 0;
  addComments(next, texts.slice(0, before), "commentBefore");
  addComments(next, texts.slice(before), "comment");
}

/**
 * Removes item `index` of `seq`, keeping every comment of it: they go after the item before it, or, for the first
 * item, before the list.
 */
function removeItem(seq: YAMLSeq, index: number): void {
  const [gone] = seq.items.splice(index, 1);
  const texts = commentsIn(gone);
  const before = seq.items[index - 1];
  if (isNode(before)) addComments(before, texts, "comment");
  else addComments(seq, texts, "commentBefore");
}

/** A value turned into a node: a reference as a double-quoted string, a list as a flow list. */
function valueNode(doc: Document, v: unknown): unknown {
  if (typeof v === "string" && v.includes("${")) {
    const s = new Scalar(v);
    s.type = Scalar.QUOTE_DOUBLE;
    return s;
  }
  const node = doc.createNode(v);
  if (isSeq(node)) node.flow = true;
  return node;
}

/** The map at `path`, or `null` when there is none. */
function mapAt(doc: Document, path: Path): YAMLMap | null {
  const node = path.length === 0 ? doc.contents : doc.getIn(path, true);
  return isMap(node) ? node : null;
}

/** The list at `path`, or `null` when there is none. */
function seqAt(doc: Document, path: Path): YAMLSeq | null {
  const node = doc.getIn(path, true);
  return isSeq(node) ? node : null;
}

/**
 * Sets `key` of `map` to `v`, keeping its place and its comments when it exists; `undefined` deletes it, and its
 * comments go after the map.
 */
function setKey(doc: Document, map: YAMLMap, key: string, v: unknown): void {
  const at = map.items.findIndex((p) => (isScalar(p.key) ? p.key.value : p.key) === key);
  const pair = map.items[at];
  if (v === undefined) {
    if (pair === undefined) return;
    map.items.splice(at, 1);
    addComments(map, [...commentsIn(pair.key), ...commentsIn(pair.value)], "comment");
    return;
  }
  const node = valueNode(doc, v);
  if (pair === undefined) {
    map.set(key, node);
    return;
  }
  carry(pair.value, node);
  pair.value = node;
}

/**
 * Sets `key` of `map` as `setKey` does; a new key goes before the first key that comes after it in `order`, so a file
 * keeps the order its language writes.
 */
function setOrdered(doc: Document, map: YAMLMap, key: string, v: unknown, order: readonly string[]): void {
  const keyOf = (p: { key: unknown }) => String(isScalar(p.key) ? p.key.value : p.key);
  if (v === undefined || map.items.some((p) => keyOf(p) === key)) {
    setKey(doc, map, key, v);
    return;
  }
  const rank = order.indexOf(key);
  const at = rank === -1 ? -1 : map.items.findIndex((p) => order.indexOf(keyOf(p)) > rank);
  const pair = doc.createPair(key, valueNode(doc, v));
  if (at === -1) map.items.push(pair);
  else map.items.splice(at, 0, pair);
}

/** The root map of a document, created when the document holds none. */
function rootOf(doc: Document): YAMLMap {
  const found = mapAt(doc, []);
  if (found !== null) return found;
  const map = doc.createNode({}) as YAMLMap;
  doc.contents = map;
  return map;
}

// ---- Workflow operations ----

/** The keys of a workflow file, in the order a new one is written. */
export const WORKFLOW_ORDER = ["version", "description", "default", "inputs", "runs-on", "steps"] as const;

/** The keys of a step, in the order a new one is written. */
const STEP_ORDER = ["uses", "runs-on", "model", "matrix", "with", "on-fail", "tries"] as const;

/** The keys of a prompt file's header, in the order a new one is written. */
export const HEADER_ORDER = ["description", "model", "inputs"] as const;

/** The `uses` value of a prompt: `prompts/<name>.md`. */
export const usesOf = (name: string): string => `prompts/${name}.md`;

/** A `""` scalar: an input that is required and not set yet. */
function emptyString(): Scalar {
  const s = new Scalar("");
  s.type = Scalar.QUOTE_DOUBLE;
  return s;
}

/** A `with` map in block style: each input of `entries`, a `""` value written `""`. */
function withNode(doc: Document, entries: [string, string][]): YAMLMap {
  const map = doc.createNode({}) as YAMLMap;
  for (const [k, v] of entries) map.items.push(doc.createPair(k, v === "" ? emptyString() : valueNode(doc, v)));
  return map;
}

/** The `steps` list of a workflow, created when missing. */
function stepsOf(doc: Document): YAMLSeq {
  const found = seqAt(doc, ["steps"]);
  if (found !== null) return found;
  const seq = doc.createNode([]) as YAMLSeq;
  setOrdered(doc, rootOf(doc), "steps", seq, WORKFLOW_ORDER);
  return seq;
}

/** The map of step `index`, `null` when it is not a map. */
function stepAt(doc: Document, index: number): YAMLMap | null {
  const step = stepsOf(doc).items[index];
  return isMap(step) ? step : null;
}

/** Inserts at `index` the step `uses: prompts/<name>.md`, with a `with` entry written `""` for each of `required`. */
export function insertStep(doc: Document, index: number, name: string, required: readonly string[]): void {
  const map = doc.createNode({}) as YAMLMap;
  map.items.push(doc.createPair("uses", usesOf(name)));
  if (required.length > 0) map.items.push(doc.createPair("with", withNode(doc, required.map((r) => [r, ""]))));
  const seq = stepsOf(doc);
  if (seq.items.length === 0) seq.flow = false;
  seq.items.splice(index, 0, map);
}

/** Moves step `from` to `to`, its comments with it. */
export function moveStep(doc: Document, from: number, to: number): void {
  const items = stepsOf(doc).items;
  if (from === to || from < 0 || from >= items.length || to < 0 || to >= items.length) return;
  const [moved] = items.splice(from, 1);
  items.splice(to, 0, moved);
}

/** Where step `index` sits after `moveStep(from, to)`. */
export function movedIndex(index: number, from: number, to: number): number {
  if (index === from) return to;
  if (from < index && index <= to) return index - 1;
  if (to <= index && index < from) return index + 1;
  return index;
}

/** Removes step `index`, keeping its comments. */
export function removeStep(doc: Document, index: number): void {
  const seq = stepsOf(doc);
  if (index >= 0 && index < seq.items.length) removeItem(seq, index);
}

/** The keys of a `with` map. */
const withKeys = (map: YAMLMap | null): string[] => (map === null ? [] : map.items.map((p) => String(isScalar(p.key) ? p.key.value : p.key)));

/** Drops the entries of the `with` map at `key` of `map` that `declared` does not name; an emptied map is removed. */
function keepDeclared(doc: Document, map: YAMLMap, declared: readonly string[]): void {
  const w = map.get("with", true);
  if (!isMap(w)) return;
  for (const k of withKeys(w)) if (!declared.includes(k)) setKey(doc, w, k, undefined);
  if (w.items.length === 0) setKey(doc, map, "with", undefined);
}

/** Sets the prompt of step `index` to `name`, keeping the `with` entries it declares (`declared`) and dropping the others. */
export function setStepPrompt(doc: Document, index: number, name: string, declared: readonly string[]): void {
  const step = stepAt(doc, index);
  if (step === null) return;
  setOrdered(doc, step, "uses", usesOf(name), STEP_ORDER);
  keepDeclared(doc, step, declared);
}

/** Sets an entry of the `with` map of `map`; `""` writes `""`, `undefined` removes it, and an emptied map is removed. */
function setWithIn(doc: Document, map: YAMLMap, input: string, value: string | undefined, order: readonly string[]): void {
  let w: unknown = map.get("with", true);
  if (!isMap(w)) {
    if (value === undefined) return;
    w = withNode(doc, []);
    setOrdered(doc, map, "with", w, order);
    w = map.get("with", true);
    if (!isMap(w)) return;
  }
  if (value === "") {
    const at = w.items.findIndex((p) => (isScalar(p.key) ? p.key.value : p.key) === input);
    const pair = w.items[at];
    if (pair === undefined) w.items.push(doc.createPair(input, emptyString()));
    else {
      const next = emptyString();
      carry(pair.value, next);
      pair.value = next;
    }
  } else setKey(doc, w, input, value);
  if (w.items.length === 0) setKey(doc, map, "with", undefined);
}

/** Sets the input `input` of step `index`'s `with`; `""` writes `""`, `undefined` removes it. */
export function setStepWith(doc: Document, index: number, input: string, value: string | undefined): void {
  const step = stepAt(doc, index);
  if (step !== null) setWithIn(doc, step, input, value, STEP_ORDER);
}

/** Sets the matrix of step `index`: `<key>: [values]`; `undefined` removes it. */
export function setStepMatrix(doc: Document, index: number, matrix: { key: string; values: string[] } | undefined): void {
  const step = stepAt(doc, index);
  if (step === null) return;
  if (matrix === undefined) {
    setKey(doc, step, "matrix", undefined);
    return;
  }
  const map = doc.createNode({}) as YAMLMap;
  map.items.push(doc.createPair(matrix.key, valueNode(doc, matrix.values)));
  const prev = step.get("matrix", true);
  if (prev !== undefined) carry(prev, map);
  if (step.has("matrix")) step.set("matrix", map);
  else setOrdered(doc, step, "matrix", map, STEP_ORDER);
}

/** Sets `runs-on` or `model` of step `index`; `undefined` removes it, so the workflow's or the prompt's applies. */
export function setStepField(doc: Document, index: number, field: "runs-on" | "model", value: string | undefined): void {
  const step = stepAt(doc, index);
  if (step !== null) setOrdered(doc, step, field, value, STEP_ORDER);
}

/** An on-fail as the editor reads and writes it: its prompt, its `with` entries and its model. */
export type OnFail = { name: string; with: [string, string][]; model: string | null };

/** The node of an on-fail: the string `prompts/<name>.md` with no `with` entry and no model, else the block map. */
function onFailNode(doc: Document, o: OnFail): unknown {
  if (o.with.length === 0 && o.model === null) return usesOf(o.name);
  const map = doc.createNode({}) as YAMLMap;
  map.items.push(doc.createPair("uses", usesOf(o.name)));
  if (o.with.length > 0) map.items.push(doc.createPair("with", withNode(doc, o.with)));
  if (o.model !== null) map.items.push(doc.createPair("model", o.model));
  return map;
}

/**
 * Sets the on-fail of step `index`, in the string form or the map form (`onFailNode`), with `tries: 1` when the step
 * has no `tries`; `undefined` removes `on-fail` and `tries` together.
 */
export function setStepOnFail(doc: Document, index: number, onFail: OnFail | undefined): void {
  const step = stepAt(doc, index);
  if (step === null) return;
  if (onFail === undefined) {
    setKey(doc, step, "on-fail", undefined);
    setKey(doc, step, "tries", undefined);
    return;
  }
  const node = valueNode(doc, onFailNode(doc, onFail)) as Node;
  const prev = step.get("on-fail", true);
  if (prev === undefined) setOrdered(doc, step, "on-fail", node, STEP_ORDER);
  else {
    const pair = step.items.find((p) => (isScalar(p.key) ? p.key.value : p.key) === "on-fail");
    if (pair !== undefined) {
      carry(prev, node);
      pair.value = node;
    }
  }
  if (!step.has("tries")) setOrdered(doc, step, "tries", 1, STEP_ORDER);
}

/** Sets `tries` of step `index` to `n`, as typed: no clamp, the check reports a value out of range. */
export function setStepTries(doc: Document, index: number, n: number): void {
  const step = stepAt(doc, index);
  if (step !== null) setOrdered(doc, step, "tries", n, STEP_ORDER);
}

/** A prompt the editor may name, with the inputs its header declares. */
export type PromptChoice = { name: string; inputs: { name: string; required: boolean }[] };

/**
 * The on-fail turning on writes, from the step prompts by name order: the first one that declares no required input,
 * in the string form; else the first one, its required inputs written `""`; `null` when there is none.
 */
export function defaultOnFail(prompts: readonly PromptChoice[]): OnFail | null {
  const sorted = [...prompts].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const free = sorted.find((p) => p.inputs.every((i) => !i.required));
  if (free !== undefined) return { name: free.name, with: [], model: null };
  const first = sorted[0];
  if (first === undefined) return null;
  return { name: first.name, with: first.inputs.filter((i) => i.required).map((i) => [i.name, ""]), model: null };
}

/** Sets a key of a document's root map, created when missing, a new key placed by `order`; `undefined` removes it. */
export function setRootField(doc: Document, field: string, value: string | boolean | undefined, order: readonly string[]): void {
  if (value === undefined && mapAt(doc, []) === null) return;
  setOrdered(doc, rootOf(doc), field, value, order);
}

/** Sets a top-level field of a workflow; `undefined` removes it. */
export const setWorkflowField = (doc: Document, field: "description" | "default" | "runs-on", value: string | boolean | undefined): void =>
  setRootField(doc, field, value, WORKFLOW_ORDER);

// ---- Inputs, of a workflow and of a prompt header ----

/** The fields of an input declaration, in the order they are written. */
const INPUT_ORDER = ["description", "required", "default", "type"] as const;

/** The `inputs` map of a document's root, `null` when there is none. */
const inputsOf = (doc: Document): YAMLMap | null => mapAt(doc, ["inputs"]);

/** The name `Add` gives a new input: `input`, else the first of `input2`, `input3`, … not declared. */
export function newInputName(declared: readonly string[]): string {
  if (!declared.includes("input")) return "input";
  for (let n = 2; ; n++) if (!declared.includes(`input${n}`)) return `input${n}`;
}

/**
 * Adds an optional input as the last of `inputs` (created in its place by `order`, the keys of the root), declared
 * with `description: Describe this input.`; returns its name.
 */
export function addInput(doc: Document, order: readonly string[]): string {
  const root = rootOf(doc);
  let inputs = inputsOf(doc);
  if (inputs === null) {
    setOrdered(doc, root, "inputs", doc.createNode({}), order);
    inputs = inputsOf(doc);
    if (inputs === null) return "";
  }
  inputs.flow = false;
  const name = newInputName(withKeys(inputs));
  inputs.items.push(doc.createPair(name, doc.createNode({ description: "Describe this input." })));
  return name;
}

/** Removes the input `name`; an emptied `inputs` is removed. */
export function removeInput(doc: Document, name: string): void {
  const inputs = inputsOf(doc);
  if (inputs === null) return;
  setKey(doc, inputs, name, undefined);
  if (inputs.items.length === 0) setKey(doc, rootOf(doc), "inputs", undefined);
}

/** Renames the input `from` to `to` in its place, its declaration and comments kept; a taken name changes nothing. */
export function renameInput(doc: Document, from: string, to: string): void {
  const inputs = inputsOf(doc);
  if (inputs === null || from === to || withKeys(inputs).includes(to)) return;
  const pair = inputs.items.find((p) => (isScalar(p.key) ? p.key.value : p.key) === from);
  if (pair === undefined) return;
  if (isScalar(pair.key)) pair.key.value = to;
  else pair.key = new Scalar(to);
}

/** Sets a field of the input `name`'s declaration; `undefined` removes it. */
export function setInputField(doc: Document, name: string, field: (typeof INPUT_ORDER)[number], value: string | boolean | undefined): void {
  const inputs = inputsOf(doc);
  const decl = inputs?.get(name, true);
  if (!isMap(decl)) return;
  setOrdered(doc, decl, field, value, INPUT_ORDER);
}
