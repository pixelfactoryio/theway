/**
 * The text of a `change.yaml`: its check, the lines of its issues, the status of a change, and the edits the dashboard
 * and `theway task done` make to it. No module this one imports reads the disk, so the client bundle imports it too.
 */
import { Document, isAlias, isCollection, isMap as isYamlMap, isPair, isScalar, isSeq, LineCounter, type Node, parseDocument, Scalar, type YAMLMap, type YAMLSeq } from "yaml";
import { escaped, parseYaml, yamlErrorLine } from "./text";

export const CHANGE_VERSION = "theway.change/v1beta";
export const CHANGE_FILE = "change.yaml";

export const ROOT_KEYS = ["version", "description", "tasks"];
export const TASK_KEYS = ["text", "done"];

export type ChangeTask = { text: string; done: boolean };
export type Change = { description: string; tasks: ChangeTask[] };

/** What `checkChangeText` gives: the change, or every reason its text is invalid. */
export type ChangeCheck = { change: Change } | { issues: string[] };

export const isMap = (v: unknown): v is Map<unknown, unknown> => v instanceof Map;
export const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

/** A task's `[where, message]` errors, in its key order, then its missing keys. */
export function taskIssues(v: unknown, at: string): string[] {
  if (!isMap(v)) return [`${at}: must be a map`];
  const out: string[] = [];
  for (const [k, value] of v) {
    const key = String(k);
    if (key === "text") {
      if (!nonEmpty(value)) out.push(`${at}.text: must be a non-empty string`);
    } else if (key === "done") {
      if (typeof value !== "boolean") out.push(`${at}.done: must be true or false`);
    } else {
      out.push(`${at}.${escaped(key)}: unknown key`);
    }
  }
  if (!v.has("text")) out.push(`${at}.text: is required`);
  return out;
}

/** A YAML key's text, as error lines name it. */
export const keyText = (key: unknown): string => escaped(String(isScalar(key) ? key.value : key));

export const ANCHOR = "anchors and aliases are not allowed";

/**
 * One `<where>: anchors and aliases are not allowed` line per anchor and per alias of `text`, in document order.
 * `<where>` is the node's path in the error grammar of `change.yaml`, never deeper: a map key takes the path of the map
 * that holds it, a node below a root key's value or below `tasks[i].<key>` the path of its nearest named ancestor; the
 * root and the root map's keys have no path.
 */
export function anchorIssues(text: string): string[] {
  const out: string[] = [];
  const flag = (node: unknown, where: string | null): void => {
    if (isAlias(node) || (node as { anchor?: string } | null)?.anchor) out.push(where === null ? ANCHOR : `${where}: ${ANCHOR}`);
  };
  // Every node of the subtree, all at `where` (an alias is not followed).
  const all = (node: unknown, where: string | null): void => {
    flag(node, where);
    if (!isCollection(node)) return;
    for (const item of node.items) {
      if (isPair(item)) {
        all(item.key, where);
        all(item.value, where);
      } else all(item, where);
    }
  };
  const root = parseDocument(text).contents;
  if (!isYamlMap(root)) {
    all(root, null);
    return out;
  }
  flag(root, null);
  for (const pair of root.items) {
    all(pair.key, null);
    const key = keyText(pair.key);
    if (key !== "tasks" || !isSeq(pair.value)) {
      all(pair.value, key);
      continue;
    }
    flag(pair.value, "tasks");
    pair.value.items.forEach((task, i) => {
      const at = `tasks[${i}]`;
      if (!isYamlMap(task)) return all(task, at);
      flag(task, at);
      for (const p of task.items) {
        all(p.key, at);
        all(p.value, `${at}.${keyText(p.key)}`);
      }
    });
  }
  return out;
}

/**
 * The change a `change.yaml` text holds, or every reason it is invalid: `<where>: <message>`, or `<message>` alone for
 * a file-level rule; collected in the file's key order, then the missing keys.
 */
export function checkChangeText(text: string): ChangeCheck {
  const parsed = parseYaml(text);
  if ("reason" in parsed) return { issues: [parsed.reason] };
  const anchors = anchorIssues(text);
  if (anchors.length > 0) return { issues: anchors };
  const root = parsed.root;
  if (!isMap(root)) return { issues: ["must be a map"] };

  const issues: string[] = [];
  for (const [k, value] of root) {
    const key = String(k);
    if (key === "version") {
      if (value !== CHANGE_VERSION) issues.push(`version: must be ${CHANGE_VERSION}`);
    } else if (key === "description") {
      if (!nonEmpty(value) || /[\r\n]/.test(value)) issues.push("description: must be a non-empty string on one line");
    } else if (key === "tasks") {
      if (!Array.isArray(value) || value.length === 0) issues.push("tasks: must be a list with at least one task");
      else value.forEach((t, i) => issues.push(...taskIssues(t, `tasks[${i}]`)));
    } else {
      issues.push(`${escaped(key)}: unknown key`);
    }
  }
  for (const key of ROOT_KEYS) if (!root.has(key)) issues.push(`${key}: is required`);
  if (issues.length > 0) return { issues };

  const tasks = (root.get("tasks") as Map<unknown, unknown>[]).map((t) => ({ text: t.get("text") as string, done: t.get("done") === true }));
  return { change: { description: root.get("description") as string, tasks } };
}

/** The status of an active change, as the API names it. */
export type ActiveStatus = "invalid" | "in-progress" | "not-started" | "ready";

/** The status of an active change from its check: Invalid, Ready to archive, Not started, else In progress. */
export function changeStatus(result: ChangeCheck): ActiveStatus {
  if ("issues" in result) return "invalid";
  const total = result.change.tasks.length;
  const done = result.change.tasks.filter((t) => t.done).length;
  if (total > 0 && done === total) return "ready";
  if (done === 0) return "not-started";
  return "in-progress";
}

/** The segments of an issue's path: keys and list indexes. */
function segmentsOf(path: string): (string | number)[] {
  const out: (string | number)[] = [];
  const re = /\[(\d+)\]|\.?([^.[\]]+)/y;
  let m: RegExpExecArray | null;
  while (re.lastIndex < path.length && (m = re.exec(path)) !== null) out.push(m[1] !== undefined ? Number(m[1]) : (m[2] as string));
  return out;
}

/** The start offset of the node `segments` names in `root`: a key's start, a list item's start; `null` when absent. */
function startOf(root: unknown, segments: (string | number)[], map: boolean): number | null {
  let node: unknown = root;
  let at: number | null = (root as Node | null)?.range?.[0] ?? null;
  for (const seg of segments) {
    if (typeof seg === "string" && isYamlMap(node)) {
      const pair = node.items.find((p) => keyText(p.key) === seg);
      if (pair === undefined) return null;
      at = (pair.key as Node | null)?.range?.[0] ?? null;
      node = pair.value;
    } else if (typeof seg === "number" && isSeq(node)) {
      const item = node.items[seg] as Node | null | undefined;
      if (item === undefined || item === null) return null;
      at = item.range?.[0] ?? null;
      node = item;
    } else return null;
  }
  if (map) return isYamlMap(node) ? ((node as Node).range?.[0] ?? null) : null;
  return at;
}

/**
 * The issues of `checkChangeText(text)`, each with the 1-based line of the YAML node its path names, `null` when it
 * names none: an invalid YAML on its error's line, `<path>.<key>: is required` on the map at `<path>` (the root's first
 * line for a root key).
 */
export function changeTextErrors(text: string): { text: string; line: number | null }[] {
  const result = checkChangeText(text);
  if (!("issues" in result)) return [];
  const counter = new LineCounter();
  const doc = parseDocument(text, { lineCounter: counter, logLevel: "silent" });
  const lineOf = (offset: number | null): number | null => (offset === null ? null : counter.linePos(offset).line);
  return result.issues.map((issue) => {
    if (issue.startsWith("invalid YAML")) return { text: issue, line: yamlErrorLine(text) };
    const colon = issue.indexOf(": ");
    if (colon === -1) return { text: issue, line: null };
    const segments = segmentsOf(issue.slice(0, colon));
    if (issue.slice(colon + 2) === "is required") return { text: issue, line: lineOf(startOf(doc.contents, segments.slice(0, -1), true)) };
    return { text: issue, line: lineOf(startOf(doc.contents, segments, false)) };
  });
}

/** One edit of a `change.yaml` text; tasks are named by their 0-based position. */
export type ChangeEdit =
  | { kind: "done"; index: number; done: boolean }
  | { kind: "text"; index: number; text: string }
  | { kind: "description"; text: string }
  | { kind: "add"; index: number; text: string; done?: boolean }
  | { kind: "move"; from: number; to: number }
  | { kind: "remove"; index: number };

/** The reasons `editedChangeText` refuses an edit. */
export const REFUSAL = {
  position: "no task at that position",
  empty: "text is empty",
  oneLine: "description must be one line",
  lastTask: "a change keeps at least one task",
  check: "change.yaml does not pass the check",
} as const;

/** A task's text without the blank lines at its start and end. */
const taskText = (text: string): string => {
  const lines = text.split("\n");
  while (lines.length > 0 && /^\s*$/.test(lines[0] as string)) lines.shift();
  while (lines.length > 0 && /^\s*$/.test(lines[lines.length - 1] as string)) lines.pop();
  return lines.join("\n");
};

/** Whether `text`'s first line break is `\r\n`. */
const crlf = (text: string): boolean => {
  const at = text.indexOf("\n");
  return at > 0 && text[at - 1] === "\r";
};

/**
 * `text` with one edit applied, or the reason it is refused. The text is loaded with `parseDocument`, the edit changes
 * the Document's nodes, and the Document is printed with `lineWidth: 0` and `flowCollectionPadding: false`, every line
 * break `\r\n` when the source's first one is. An edit that changes no node returns the source text unprinted; a printed
 * text equal to the source returns the source. The source and the result must pass the check.
 */
/**
 * Double-quotes a plain one-line scalar whose new value cannot stay plain, in a block (or, with `inFlow`, a flow)
 * mapping: left plain, the `yaml` package would fall back to single quotes for a value holding `"`.
 */
function quoteUnlessPlain(node: unknown, value: string, inFlow: boolean): void {
  if (!isScalar(node) || node.type !== Scalar.PLAIN || /[\r\n]/.test(value)) return;
  const probe = new Document({ k: value });
  (probe.contents as YAMLMap).flow = inFlow;
  const read = parseDocument(probe.toString({ lineWidth: 0, singleQuote: false })).get("k", true);
  if (!isScalar(read) || read.type !== Scalar.PLAIN || read.value !== value) node.type = Scalar.QUOTE_DOUBLE;
}

export function editedChangeText(text: string, edit: ChangeEdit): { text: string } | { reason: string } {
  if ("issues" in checkChangeText(text)) return { reason: REFUSAL.check };
  const doc = parseDocument(text);
  if (doc.errors.length > 0) return { reason: REFUSAL.check };
  const seq = doc.get("tasks", true) as YAMLSeq<YAMLMap>;
  const n = seq.items.length;
  const valid = (i: number, end = n): boolean => Number.isInteger(i) && i >= 0 && i < end;
  const task = (i: number): YAMLMap => seq.items[i] as YAMLMap;

  switch (edit.kind) {
    case "done": {
      if (!valid(edit.index)) return { reason: REFUSAL.position };
      const t = task(edit.index);
      const current = t.get("done", true);
      if (edit.done) {
        if (isScalar(current) && current.value === true) return { text };
        t.set("done", true);
      } else {
        if (current === undefined) return { text };
        t.delete("done");
      }
      break;
    }
    case "text": {
      if (!valid(edit.index)) return { reason: REFUSAL.position };
      const value = taskText(edit.text);
      if (value.trim() === "") return { reason: REFUSAL.empty };
      const t = task(edit.index);
      const current = t.get("text", true);
      if (isScalar(current) && current.value === value) return { text };
      t.set("text", value);
      quoteUnlessPlain(t.get("text", true), value, seq.flow === true || t.flow === true);
      break;
    }
    case "description": {
      if (/[\r\n]/.test(edit.text)) return { reason: REFUSAL.oneLine };
      if (edit.text.trim() === "") return { reason: REFUSAL.empty };
      const current = doc.get("description", true);
      if (isScalar(current) && current.value === edit.text) return { text };
      doc.set("description", edit.text);
      quoteUnlessPlain(doc.get("description", true), edit.text, (doc.contents as YAMLMap).flow === true);
      break;
    }
    case "add": {
      if (!valid(edit.index, n + 1)) return { reason: REFUSAL.position };
      const value = taskText(edit.text);
      if (value.trim() === "") return { reason: REFUSAL.empty };
      seq.items.splice(edit.index, 0, doc.createNode(edit.done === true ? { text: value, done: true } : { text: value }) as YAMLMap);
      break;
    }
    case "move": {
      if (!valid(edit.from) || !valid(edit.to)) return { reason: REFUSAL.position };
      if (edit.from === edit.to) return { text };
      const [item] = seq.items.splice(edit.from, 1);
      seq.items.splice(edit.to, 0, item as YAMLMap);
      break;
    }
    case "remove": {
      if (!valid(edit.index)) return { reason: REFUSAL.position };
      if (n === 1) return { reason: REFUSAL.lastTask };
      seq.items.splice(edit.index, 1);
      break;
    }
  }

  let printed = doc.toString({ lineWidth: 0, flowCollectionPadding: false });
  if (crlf(text)) printed = printed.replaceAll("\n", "\r\n");
  if (printed === text) return { text };
  if ("issues" in checkChangeText(printed)) return { reason: REFUSAL.check };
  return { text: printed };
}
