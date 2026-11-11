/**
 * The check's error lines tied to the editor's fields. A workflow's line that names a place of the open file gives the
 * field it concerns and its reason in plain words, without the file's path and the locator; a prompt's line that names
 * a header key gives that key and the validator's reason unchanged. Pure: no DOM, no React.
 */

/** The fields of a step's settings a line can name. */
export type StepKey = "uses" | "with" | "matrix" | "on-fail" | "on-fail.with" | "on-fail.model" | "tries" | "runs-on" | "model";

/**
 * A field of the workflow editor: one of step `step`'s, or of the workflow panel; `input` names the input of a `with`
 * or an `inputs` field when the line names one.
 */
export type Field =
  | { at: "step"; step: number; key: StepKey; input: string | null }
  | { at: "workflow"; key: "description" | "default" | "runs-on" | "inputs"; input: string | null };

/** A check line: the field it concerns and its message, or `field: null` and the line as it is; `step` is the step it names, if any. */
export type Problem = { line: string; field: Field | null; step: number | null; message: string };

/** The words of a step field in a message. */
const STEP_LABEL: Record<StepKey, string> = {
  uses: "Prompt",
  with: "Inputs",
  matrix: "Matrix",
  "on-fail": "On fail",
  "on-fail.with": "On fail inputs",
  "on-fail.model": "On fail model",
  tries: "Tries",
  "runs-on": "Runs on",
  model: "Model",
};

/** The words of a workflow field in a message. */
const TOP_LABEL: Record<string, string> = { description: "Description", default: "Default workflow", "runs-on": "Steps run on", inputs: "Inputs" };

/** A word with its first letter in capitals. */
const cap = (w: string): string => `${w.slice(0, 1).toUpperCase()}${w.slice(1)}`;

/** A quoted name as the resolver escapes it, unquoted. */
const unquote = (s: string): string => (/^".*"$/.test(s) ? s.slice(1, -1) : s);

const RANGE = "use a number from 1 to 10";

/** A reason in plain words, and the input it names, if any. */
function plain(reason: string): { text: string; input: string | null } {
  let m: RegExpExecArray | null;
  if (reason === "must be an integer from 1 to 10") return { text: RANGE, input: null };
  if (reason === "needs tries (an integer from 1 to 10)") return { text: `set Tries, ${RANGE.slice(4)}`, input: null };
  if (reason === "needs on-fail") return { text: "only used with On fail", input: null };
  if (reason === "must be a non-empty string" || reason === "uses is required") return { text: "required, not set", input: null };
  if ((m = /^required input (\S+) is not set$/.exec(reason)) !== null) return { text: "required, not set", input: unquote(m[1] as string) };
  if ((m = /^(\S+) declares no input (\S+)$/.exec(reason)) !== null) return { text: `not an input of ${m[1]}`, input: unquote(m[2] as string) };
  if ((m = /^(\S+) must be a string, a number or a boolean$/.exec(reason)) !== null) return { text: "use text, a number or true or false", input: unquote(m[1] as string) };
  if ((m = /^the step runs on agents and (?:its on-fail )?has no model; set model .* in (\S+)$/.exec(reason)) !== null) {
    return { text: `an agent runs this step: choose a model here or in ${m[1]}`, input: null };
  }
  if ((m = /^(prompts\/\S+) not found in .*$/.exec(reason)) !== null) return { text: `${m[1]} not found`, input: null };
  return { text: reason, input: null };
}

/** The step key a locator after `steps[i]` names; `null` for none the settings hold. */
function stepKey(key: string | undefined, reason: string): StepKey | null {
  if (key === undefined) return reason === "uses is required" ? "uses" : null;
  if (key === "on-fail.uses") return "on-fail";
  return Object.hasOwn(STEP_LABEL, key) ? (key as StepKey) : null;
}

/** A line without its `<label>: ` (one of `labels`) and its `theway: `: the label, `null` for none, and the rest. */
function unprefixed(line: string, labels: readonly string[]): { label: string | null; rest: string } {
  let rest = line;
  const label = labels.find((l) => rest.startsWith(`${l}: `)) ?? null;
  if (label !== null) rest = rest.slice(label.length + 2);
  if (rest.startsWith("theway: ")) rest = rest.slice("theway: ".length);
  return { label, rest };
}

/** A step's number as the page shows it, from 1. */
export const stepWords = (index: number): string => `Step ${index + 1}`;

/**
 * The problem of a check line for the open workflow `file`: the line, after an optional `<label>: ` (one of `labels`)
 * and `theway: `, starts with the file's own path and a locator the editor has a field for. Its message is the field's
 * name and the reason in plain words (`Tries: use a number from 1 to 10`, `change: required, not set`), with
 * ` (in <label>)` for a line from a project's context. Any other line keeps its text, with `theway: ` removed.
 */
export function problemOf(line: string, file: { kind: "workflows"; name: string }, labels: readonly string[]): Problem {
  const { label, rest: whole } = unprefixed(line, labels);
  let rest = whole;
  const shown = label === null ? rest : `${label}: ${rest}`;
  const none = (step: number | null = null): Problem => ({ line, field: null, step, message: shown });
  const own = `workflows/${file.name}.yaml: `;
  if (!rest.startsWith(own)) return none();
  rest = rest.slice(own.length);
  const where = label === null ? "" : ` (in ${label})`;

  const s = /^steps\[(\d+)\](?:\.([a-z-]+(?:\.[a-z-]+)?))?: (.*)$/.exec(rest);
  if (s !== null) {
    const step = Number(s[1]);
    const reason = s[3] as string;
    const key = stepKey(s[2], reason);
    if (key === null) return none(step);
    const { text, input } = plain(reason);
    const named = input !== null && (key === "with" || key === "on-fail.with");
    return {
      line,
      field: { at: "step", step, key, input: named ? input : null },
      step,
      message: `${named ? input : STEP_LABEL[key]}: ${text}${where}`,
    };
  }
  const top = /^(description|default|runs-on|inputs)(?:\.("[^"]*"|[^:\s]+))?: (.*)$/.exec(rest);
  if (top === null) return none();
  const key = top[1] as "description" | "default" | "runs-on" | "inputs";
  const input = top[2] === undefined ? null : unquote(top[2]);
  if (key !== "inputs" && input !== null) return none();
  const reason = top[3] as string;
  // An input's reason names its field first: `description must be a non-empty string`.
  const sub = input === null ? null : /^(description|required|default|type) (.*)$/.exec(reason);
  const message =
    sub !== null
      ? `${input}: ${cap(sub[1] as string)}: ${plain(sub[2] as string).text}`
      : `${input ?? TOP_LABEL[key]}: ${plain(reason).text}`;
  return { line, field: { at: "workflow", key, input }, step: null, message: `${message}${where}` };
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

/** Whether two fields are the same: the same place, key, input and, for a step's, step. */
export function sameField(a: Field | null, b: Field): boolean {
  if (a === null || a.at !== b.at || a.key !== b.key || a.input !== b.input) return false;
  return a.at !== "step" || (b.at === "step" && a.step === b.step);
}

/** The DOM ID of a field's control, so "Show first" can focus it. */
export function fieldId(f: Field): string {
  const input = f.input === null ? "" : `-${f.input}`;
  return f.at === "step" ? `field-step-${f.key.replace(".", "-")}${input}` : `field-${f.at}-${f.key}${input}`;
}
