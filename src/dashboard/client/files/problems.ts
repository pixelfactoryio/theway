/**
 * A prompt's check lines as its page lists them: each line without its `theway: ` and the open prompt's own prefix
 * (`promptLine`), and the error of the prompt's list item added when no line reports it (`withItemError`). Pure: no
 * DOM, no React.
 */

/** A line without its `<label>: ` (one of `labels`) and its `theway: `: the label, `null` for none, and the rest. */
function unprefixed(line: string, labels: readonly string[]): { label: string | null; rest: string } {
  let rest = line;
  const label = labels.find((l) => rest.startsWith(`${l}: `)) ?? null;
  if (label !== null) rest = rest.slice(label.length + 2);
  if (rest.startsWith("theway: ")) rest = rest.slice("theway: ".length);
  return { label, rest };
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
