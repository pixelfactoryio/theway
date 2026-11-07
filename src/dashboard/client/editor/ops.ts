/**
 * The editor's operations: pure functions over `yaml` Documents of workflow and step files. Every edit goes through the
 * Document API, so the comments of a file are kept. DOM-free.
 */
import { type Document, isMap, isNode, isScalar, isSeq, type Node, Pair, parseDocument, Scalar, visit, type YAMLMap, type YAMLSeq } from "yaml";
import type { ParamValue } from "../../../core/schema";

/** A YAML path: map keys and list indices, as `Document.getIn` takes it. */
export type Path = (string | number)[];

/** The options every text is written with: flow collections unpadded, no folding, an empty null (`- implement:`). */
export const TEXT_OPTIONS = { flowCollectionPadding: false, lineWidth: 0, nullStr: "" } as const;

/** A document's text, as the editor saves it. */
export const textOf = (doc: Document): string => doc.toString(TEXT_OPTIONS);

/** A document parsed from a file's text; `doc.errors` holds why it does not parse. */
export const parse = (text: string): Document => parseDocument(text);

/** The schema modeline of each kind of file. */
export const SCHEMA_LINE = {
  workflow: "# yaml-language-server: $schema=https://pixelfactoryio.github.io/theway/schemas/workflow.v1.json",
  step: "# yaml-language-server: $schema=https://pixelfactoryio.github.io/theway/schemas/step.v1.json",
} as const;

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
  if (isNode(node)) take(node);
  if (isMap(node) || isSeq(node)) {
    visit(node, (_, n) => {
      if (isNode(n)) take(n);
    });
  }
  return out;
}

/** Appends `texts` to a node's trailing (`comment`) or leading (`commentBefore`) comment. */
function addComments(node: Node, texts: string[], where: "comment" | "commentBefore"): void {
  if (texts.length === 0) return;
  node[where] = [node[where], ...texts].filter((t) => t !== null && t !== undefined && t !== "").join("\n");
}

/** Gives `next` the comments of the node it replaces. */
function carry(prev: unknown, next: unknown): void {
  if (!isNode(prev) || !isNode(next)) return;
  addComments(next, prev.commentBefore ? [prev.commentBefore] : [], "commentBefore");
  addComments(next, prev.comment ? [prev.comment] : [], "comment");
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

// ---- Workflow operations ----

/** A workflow entry to insert: a step by name, or a gate with its question. */
export type NewEntry = string | { gate: string };

/** The `steps` list of a workflow, created when missing. */
function stepsOf(doc: Document): YAMLSeq {
  const found = seqAt(doc, ["steps"]);
  if (found !== null) return found;
  const seq = doc.createNode([]) as YAMLSeq;
  (doc.contents as YAMLMap).set("steps", seq);
  return seq;
}

/** Inserts an entry at `index` of `steps`: `- <step>:` or `- gate: <question>`. */
export function insertEntry(doc: Document, index: number, entry: NewEntry): void {
  const node = typeof entry === "string" ? doc.createNode({ [entry]: null }) : doc.createNode({ gate: entry.gate });
  stepsOf(doc).items.splice(index, 0, node);
}

/** Sets the question of the gate entry at `index`. */
export function setGate(doc: Document, index: number, question: string): void {
  const entry = stepsOf(doc).items[index];
  if (isMap(entry) && entry.has("gate")) setKey(doc, entry, "gate", question);
}

/** Moves the entry at `from` to `to`, its comments with it. */
export function moveEntry(doc: Document, from: number, to: number): void {
  const items = stepsOf(doc).items;
  if (from === to || from < 0 || from >= items.length || to < 0 || to >= items.length) return;
  const [moved] = items.splice(from, 1);
  items.splice(to, 0, moved);
}

/** Removes the entry at `index`, keeping its comments. */
export function removeEntry(doc: Document, index: number): void {
  const seq = stepsOf(doc);
  if (index >= 0 && index < seq.items.length) removeItem(seq, index);
}

/** The pair of the entry at `index`: `<step>: <map or null>`, or `null` for a gate or a malformed entry. */
function entryPair(doc: Document, index: number): Pair | null {
  const entry = stepsOf(doc).items[index];
  if (!isMap(entry) || entry.items.length !== 1) return null;
  const pair = entry.items[0] as Pair;
  const key = isScalar(pair.key) ? pair.key.value : pair.key;
  return key === "gate" ? null : pair;
}

/** Sets a key of a step entry's map; `undefined` deletes it, and an emptied map leaves `- <step>:`. */
function setEntryKey(doc: Document, index: number, name: string, value: unknown): void {
  const pair = entryPair(doc, index);
  if (pair === null) return;
  let map = isMap(pair.value) ? pair.value : null;
  if (map === null) {
    if (value === undefined) return;
    map = doc.createNode({}) as YAMLMap;
    map.flow = true;
    carry(pair.value, map);
    pair.value = map;
  }
  setKey(doc, map, name, value);
  if (map.items.length === 0) {
    const empty = new Scalar(null);
    carry(map, empty);
    pair.value = empty;
  }
}

/** Sets a param of the step entry at `index`; `undefined` removes it. */
export function setEntryParam(doc: Document, index: number, name: string, value: ParamValue | undefined): void {
  setEntryKey(doc, index, name, value);
}

/** Sets the `agents` mode of the step entry at `index`; `undefined` removes it, so the workflow's applies. */
export function setEntryAgents(doc: Document, index: number, agents: boolean | undefined): void {
  setEntryKey(doc, index, "agents", agents);
}

/** The top-level fields of a workflow the Start card edits. */
export type WorkflowField = "description" | "input" | "default" | "agents";

/** Sets a top-level field of a workflow; `undefined` removes it. A new `description` goes right after `version`. */
export function setWorkflowField(doc: Document, field: WorkflowField, value: string | boolean | undefined): void {
  const root = mapAt(doc, []);
  if (root === null) return;
  if (field === "description" && value !== undefined && !root.has("description")) {
    const at = root.items.findIndex((p) => isScalar(p.key) && p.key.value === "version");
    root.items.splice(at + 1, 0, new Pair(new Scalar("description"), valueNode(doc, value)));
    return;
  }
  setKey(doc, root, field, value);
}

// ---- Step operations ----

/** A construct to insert into a step's `do`. */
export type NewNode =
  | { agent: { prompt: string | string[]; returns: string; access?: string; model?: string } }
  | { loop: { max: number | string; until: string | string[]; exhausted: string; do: NewNode[] } }
  | { when: string | string[]; do: NewNode[] }
  | { when: string | string[]; fail: true }
  | { when: string | string[]; block: true | string }
  | { foreach: string | string[]; parallel?: boolean; do: NewNode[] };

/** A construct as a node: an agent's fields as a flow map, references quoted, lists of conditions or names as flow lists. */
function constructNode(doc: Document, n: NewNode): YAMLMap {
  const map = doc.createNode({}) as YAMLMap;
  if ("agent" in n) {
    const fields = doc.createNode({}) as YAMLMap;
    fields.flow = true;
    for (const [k, v] of Object.entries(n.agent)) if (v !== undefined) fields.set(k, valueNode(doc, v));
    map.set("agent", fields);
  } else if ("loop" in n) {
    const fields = doc.createNode({}) as YAMLMap;
    fields.set("max", valueNode(doc, n.loop.max));
    fields.set("until", valueNode(doc, n.loop.until));
    fields.set("exhausted", valueNode(doc, n.loop.exhausted));
    fields.set("do", doc.createNode(n.loop.do.map((c) => constructNode(doc, c))));
    map.set("loop", fields);
  } else if ("foreach" in n) {
    map.set("foreach", valueNode(doc, n.foreach));
    if (n.parallel !== undefined) map.set("parallel", n.parallel);
    map.set("do", doc.createNode(n.do.map((c) => constructNode(doc, c))));
  } else {
    map.set("when", valueNode(doc, n.when));
    if ("do" in n) map.set("do", doc.createNode(n.do.map((c) => constructNode(doc, c))));
    else if ("fail" in n) map.set("fail", true);
    else map.set("block", valueNode(doc, n.block));
  }
  return map;
}

/** Inserts a construct at `index` of the `do` list at `parentPath` (`["do"]`, `["do", 0, "loop", "do"]`, …). */
export function insertNode(doc: Document, parentPath: Path, index: number, node: NewNode): void {
  const seq = seqAt(doc, parentPath);
  if (seq === null) return;
  // An empty `do: []` grows into a block list.
  if (seq.items.length === 0) seq.flow = false;
  seq.items.splice(index, 0, constructNode(doc, node));
}

/** Removes the construct at `path`, keeping its comments; an emptied `do` list is kept, and the resolver reports it. */
export function removeNode(doc: Document, path: Path): void {
  const parent = seqAt(doc, path.slice(0, -1));
  const index = path[path.length - 1];
  if (parent === null || typeof index !== "number" || index < 0 || index >= parent.items.length) return;
  removeItem(parent, index);
}

/** The construct a node map holds: the first of `agent`, `loop`, `foreach`, `when` it has. */
export function constructOf(map: YAMLMap): "agent" | "loop" | "foreach" | "when" | null {
  for (const c of ["agent", "loop", "foreach", "when"] as const) if (map.has(c)) return c;
  return null;
}

/**
 * Sets a field of the construct at `path`; `undefined` deletes it. An agent's and a loop's fields live in their own
 * map (`agent: {returns}`), a `foreach`'s and a `when`'s next to their key (`parallel`, `do`, `fail`, `block`, and
 * `foreach` or `when` itself).
 */
export function setNodeField(doc: Document, path: Path, field: string, value: unknown): void {
  const node = mapAt(doc, path);
  if (node === null) return;
  const construct = constructOf(node);
  if (construct === "agent" || construct === "loop") {
    const found: unknown = node.get(construct, true);
    let fields: YAMLMap;
    if (isMap(found)) {
      fields = found;
    } else {
      if (value === undefined) return;
      fields = doc.createNode({}) as YAMLMap;
      if (construct === "agent") fields.flow = true;
      node.set(construct, fields);
    }
    setKey(doc, fields, field, value);
    return;
  }
  if (field === "do" && Array.isArray(value)) {
    node.set("do", doc.createNode((value as NewNode[]).map((c) => constructNode(doc, c))));
    return;
  }
  setKey(doc, node, field, value);
}

/** A param definition of a step file. */
export type ParamDef = { default: ParamValue; description: string };

/**
 * Sets a param of a step file, written as `{default, description}`, keeping the comments of the value it replaces;
 * `undefined` removes it, and an emptied `params` goes, their comments kept after the map that held them.
 */
export function setParam(doc: Document, name: string, def: ParamDef | undefined): void {
  const root = mapAt(doc, []);
  if (root === null) return;
  const found: unknown = root.get("params", true);
  let map: YAMLMap;
  if (isMap(found)) {
    map = found;
  } else {
    if (def === undefined) return;
    map = doc.createNode({}) as YAMLMap;
    const at = root.items.findIndex((p) => isScalar(p.key) && p.key.value === "do");
    const pair = new Pair(new Scalar("params"), map);
    if (at === -1) root.items.push(pair);
    else root.items.splice(at, 0, pair);
  }
  if (def === undefined) {
    setKey(doc, map, name, undefined);
    if (map.items.length === 0) setKey(doc, root, "params", undefined);
    return;
  }
  const value = doc.createNode({}) as YAMLMap;
  value.flow = true;
  value.set("default", valueNode(doc, def.default));
  value.set("description", valueNode(doc, def.description));
  const pair = map.items.find((p) => (isScalar(p.key) ? p.key.value : p.key) === name);
  if (pair === undefined) {
    map.set(name, value);
    return;
  }
  carry(pair.value, value);
  pair.value = value;
}

/** Sets a step file's description. */
export function setDescription(doc: Document, text: string): void {
  const root = mapAt(doc, []);
  if (root === null) return;
  if (!root.has("description")) {
    const at = root.items.findIndex((p) => isScalar(p.key) && p.key.value === "version");
    root.items.splice(at + 1, 0, new Pair(new Scalar("description"), valueNode(doc, text)));
    return;
  }
  setKey(doc, root, "description", text);
}

// ---- New files ----

/** A new workflow: the schema line, its version and description, and one `implement` entry. */
export function newWorkflowText(description: string): string {
  const doc = parse(`${SCHEMA_LINE.workflow}\nversion: theway.workflow/v1\nsteps:\n  - implement:\n`);
  setWorkflowField(doc, "description", description);
  return textOf(doc);
}

/** A new step: the schema line, its version and description, and one agent with its prompt and result type. */
export function newStepText(description: string, prompt: string, returns: string): string {
  const doc = parse(`${SCHEMA_LINE.step}\nversion: theway.step/v1\ndo: []\n`);
  setDescription(doc, description);
  const list = doc.createNode([constructNode(doc, { agent: { prompt, returns } })]);
  (doc.contents as YAMLMap).set("do", list);
  return textOf(doc);
}
