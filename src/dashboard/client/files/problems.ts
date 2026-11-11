/**
 * A prompt's check lines tied to the prompt page's fields: a line that names a header key gives that key and the
 * validator's reason unchanged. Pure: no DOM, no React.
 */

/** A quoted name as the resolver escapes it, unquoted. */
const unquote = (s: string): string => (/^".*"$/.test(s) ? s.slice(1, -1) : s);

/** A line without its `<label>: ` (one of `labels`) and its `theway: `: the label, `null` for none, and the rest. */
function unprefixed(line: string, labels: readonly string[]): { label: string | null; rest: string } {
  let rest = line;
  const label = labels.find((l) => rest.startsWith(`${l}: `)) ?? null;
  if (label !== null) rest = rest.slice(label.length + 2);
  if (rest.startsWith("theway: ")) rest = rest.slice("theway: ".length);
  return { label, rest };
}

/** A prompt check line that names a key of the open prompt's header: the key, the input it names, and the validator's reason. */
export type HeaderProblem = { key: "description" | "model" | "inputs"; input: string | null; message: string };

/**
 * The header problem of a check line for the open prompt `name`: the line, after an optional `<label>: ` (one of
 * `labels`) and `theway: `, is `prompts/<name>.md: <key>[.<input>]: <message>` for the key `description`, `model` or
 * `inputs`; the message is kept as the validator wrote it. `null` for any other line.
 */
export function headerProblem(line: string, name: string, labels: readonly string[] = []): HeaderProblem | null {
  const { rest } = unprefixed(line, labels);
  const own = `prompts/${name}.md: `;
  if (!rest.startsWith(own)) return null;
  const m = /^(description|model|inputs)(?:\.("[^"]*"|[^:\s]+))?: (.*)$/.exec(rest.slice(own.length));
  if (m === null) return null;
  const key = m[1] as HeaderProblem["key"];
  const input = m[2] === undefined ? null : unquote(m[2]);
  if (key !== "inputs" && input !== null) return null;
  return { key, input, message: m[3] as string };
}

/**
 * A prompt check line as the prompt page lists it: without `theway: ` and without the open prompt's own
 * `prompts/<name>.md: ` prefix (`inputs.change: …`, `body: …`), its `<label>: ` kept; not reworded.
 */
export function promptLine(line: string, name: string, labels: readonly string[] = []): string {
  const { label, rest } = unprefixed(line, labels);
  const own = `prompts/${name}.md: `;
  const text = rest.startsWith(own) ? rest.slice(own.length) : rest;
  return label === null ? text : `${label}: ${text}`;
}

/**
 * The check lines of the open prompt `name` with the `error` of its list item: that error, as the line
 * `prompts/<name>.md: <error>`, is added when it is not `null` and no line (after an optional `<label>: ` and
 * `theway: `) is `prompts/<name>.md: ` followed by the same text. The check reports a header error only through the
 * workflows that use the prompt, so an unused prompt's comes from its item.
 */
export function withItemError(lines: readonly string[], error: string | null, name: string, labels: readonly string[] = []): string[] {
  const own = `prompts/${name}.md: `;
  if (error === null || lines.some((l) => unprefixed(l, labels).rest === `${own}${error}`)) return [...lines];
  return [...lines, `${own}${error}`];
}
