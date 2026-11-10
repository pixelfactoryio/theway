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
