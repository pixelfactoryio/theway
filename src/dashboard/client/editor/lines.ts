/**
 * The line of a workflow's text a check line points at: from the YAML path of its `<where>`, or from the position an
 * `invalid YAML:` message gives. Pure: no DOM, no React.
 */
import { isMap, isNode, isScalar, isSeq, LineCounter, parseDocument } from "yaml";

/** A quoted name as the resolver escapes it, unquoted. */
const unquote = (s: string): string => (/^".*"$/.test(s) ? s.slice(1, -1) : s);

/**
 * The YAML path of a `<where>`: `steps[2].on-fail.uses` → `steps`, 2, `on-fail`, `uses`; `inputs.change` → `inputs`,
 * `change`; a root key alone; `null` when it is not a path of that grammar.
 */
function pathOf(where: string): (string | number)[] | null {
  const step = /^steps\[(\d+)\]((?:\.[^\s.]+)*)$/.exec(where);
  if (step !== null) return ["steps", Number(step[1]), ...(step[2] === "" ? [] : (step[2] as string).slice(1).split("."))];
  const input = /^inputs(?:\.("[^"]*"|[^\s."]+))?$/.exec(where);
  if (input !== null) return input[1] === undefined ? ["inputs"] : ["inputs", unquote(input[1])];
  return /^[^\s.]+$/.test(where) ? [where] : null;
}

/**
 * The 1-based line where the last part of `where`'s path starts in `text`: a key's own line, a list item's first
 * line. A part that does not exist gives its nearest parent's line; a missing top-level key, a `where` that is not a
 * path, or a text that does not parse gives `null`.
 */
export function lineOf(text: string, where: string): number | null {
  const path = pathOf(where);
  if (path === null) return null;
  const counter = new LineCounter();
  const doc = parseDocument(text, { lineCounter: counter });
  if (doc.errors.length > 0) return null;
  const lineAt = (offset: number | undefined): number | null => (offset === undefined ? null : counter.linePos(offset).line);
  let node: unknown = doc.contents;
  let line: number | null = null;
  for (const part of path) {
    if (typeof part === "number") {
      const item = isSeq(node) ? node.items[part] : undefined;
      if (!isNode(item)) break;
      line = lineAt(item.range?.[0]) ?? line;
      node = item;
      continue;
    }
    const pair = isMap(node) ? node.items.find((p) => (isScalar(p.key) ? p.key.value : p.key) === part) : undefined;
    if (pair === undefined) break;
    line = (isNode(pair.key) ? lineAt(pair.key.range?.[0]) : null) ?? line;
    node = pair.value;
  }
  return line;
}

/** The N of "at line N, column M" in a message; `null` for a message with none. */
export function lineOfMessage(message: string): number | null {
  const m = /at line (\d+), column \d+/.exec(message);
  return m === null ? null : Number(m[1]);
}
