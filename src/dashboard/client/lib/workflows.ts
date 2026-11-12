/**
 * What the Workflows pages compute from the API and a workflow's text: the table's rows, the "Runs on" text, a card's
 * label and title, the check's error lines split and grouped by step and key, the lines the YAML view shows and
 * marks, and the panel's width. Pure: no DOM, no JSX.
 */
import type { WorkflowItem } from "../../types";
import { lineOf, lineOfMessage } from "../editor/lines";
import { promptName } from "../files/source";
import { ALL_PROJECTS } from "./changes";

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The rows of the Workflows table: the global workflows and the chosen project's (every workflow for `ALL_PROJECTS`),
 * the new files of `fresh` under the same rule, ordered by name, then global before project, then by project label.
 */
export const workflowRows = (workflows: readonly WorkflowItem[], fresh: readonly WorkflowItem[], chosen: string): WorkflowItem[] =>
  [...workflows, ...fresh]
    .filter((w) => chosen === ALL_PROJECTS || w.scope === "global" || w.key === chosen)
    .sort((a, b) => byText(a.name, b.name) || byText(a.scope, b.scope) || byText(a.label ?? "", b.label ?? ""));

/** The table's item of a new workflow file, not saved yet: no path, no count. */
export const newWorkflowItem = (
  file: { scope: "global" | "project"; key: string | null; name: string },
  label: string | null,
  description: string | null,
): WorkflowItem => ({
  ...file,
  kind: "workflows",
  label,
  path: "",
  description,
  default: false,
  error: null,
  errors: 0,
  steps: null,
  runsOn: null,
});

/** The "Runs on" cell: `session` or `agents` when every step runs on it, else `N session, M agents`; `–` for `null`. */
export function runsOnText(runsOn: { session: number; agents: number } | null): string {
  if (runsOn === null) return "–";
  if (runsOn.agents === 0) return "session";
  if (runsOn.session === 0) return "agents";
  return `${runsOn.session} session, ${runsOn.agents} agents`;
}

/** A step's effective runs-on as written: its own `runs-on`, else the workflow's; `null` when neither writes one. */
export const effectiveRunsOn = (step: string | null, workflow: string | null): string | null => step ?? workflow;

/**
 * A step card's small label from its effective runs-on and its model: `session`, `agents · <model>`, `agents` with no
 * model, the runs-on as written when it is neither, or "runs-on not set".
 */
export function cardLabel(runsOn: string | null, model: string | null): string {
  if (runsOn === null) return "runs-on not set";
  if (runsOn === "agents") return model === null ? "agents" : `agents · ${model}`;
  return runsOn;
}

/** A card's title from a `uses` value: the prompt's name, else the value as written, else "no prompt". */
export const cardTitle = (uses: string): string => promptName(uses) ?? (uses === "" ? "no prompt" : uses);

/** The third line of a matrix copy's card: `<key>: <value>`, a `prompts/<name>.md` value shown as its name. */
export const matrixText = (key: string, value: string): string => `${key}: ${promptName(value) ?? value}`;

/** An on-fail card's small label: `on-fail · tries <tries>` as written, `on-fail` with no `tries`. */
export const onFailLabel = (tries: string | null): string => (tries === null ? "on-fail" : `on-fail · tries ${tries}`);

/**
 * A check line split for the open workflow `name`: `own` when it starts with `workflows/<name>.yaml: ` (no label before
 * it); then its `where` when the text before the first `: ` is a path of the `where` grammar (`steps[<n>]` and any
 * `.<key>` parts, `inputs` and an optional `.<name>`, or a single root key), and the rest as its `message`. A line of
 * another file, or with a label, is not `own`: its `message` is the line.
 */
export type SplitLine = { own: boolean; where: string | null; message: string };

const WHERE = [/^steps\[\d+\](\.[^\s.]+)*$/, /^inputs(\.("[^"]*"|[^\s."]+))?$/, /^[^\s.]+$/];

export function splitErrorLine(line: string, name: string): SplitLine {
  const own = `workflows/${name}.yaml: `;
  if (!line.startsWith(own)) return { own: false, where: null, message: line };
  const rest = line.slice(own.length);
  const at = rest.indexOf(": ");
  const head = at === -1 ? "" : rest.slice(0, at);
  if (at !== -1 && WHERE.some((r) => r.test(head))) return { own: true, where: head, message: rest.slice(at + 2) };
  return { own: true, where: null, message: rest };
}

/** An error line as the YAML view shows it: its text, and the line of the text it points at (`null` for none). */
export function shownError(line: string, name: string, text: string): { line: number | null; text: string } {
  const split = splitErrorLine(line, name);
  if (!split.own) return { line: null, text: line };
  if (split.where !== null) return { line: lineOf(text, split.where), text: `${split.where}: ${split.message}` };
  if (split.message.startsWith("invalid YAML:")) return { line: lineOfMessage(split.message), text: split.message };
  return { line: null, text: split.message };
}

/** The code editor's marks of the error lines `errors` on the workflow `name`'s `text`: one per shown error with a line, in order. */
export const marksOf = (errors: readonly string[], name: string, text: string): { line: number; message: string }[] =>
  errors.flatMap((l) => {
    const e = shownError(l, name, text);
    return e.line === null ? [] : [{ line: e.line, message: e.text }];
  });

/** The keys of the workflow settings panel an error line can name. */
export type WorkflowKey = "description" | "default" | "runs-on" | "inputs";

const WORKFLOW_KEYS: readonly string[] = ["description", "default", "runs-on", "inputs"];

/** A quoted name as the resolver escapes it, unquoted. */
const unquote = (s: string): string => (/^".*"$/.test(s) ? s.slice(1, -1) : s);

/**
 * The check's error lines of the open workflow `name`, grouped: by step (its index, then the key after `steps[i].`,
 * `null` for the step itself), by key of the workflow settings (with the input of `inputs.<name>`), and the rest
 * (`loose`): lines of other files and lines with a label as written, lines of this file without its prefix. A line of a
 * step at `steps` or beyond is loose.
 */
export type GroupedErrors = {
  steps: Map<number, { key: string | null; message: string }[]>;
  workflow: { key: WorkflowKey; input: string | null; message: string }[];
  loose: string[];
};

export function groupErrors(lines: readonly string[], name: string, steps: number): GroupedErrors {
  const out: GroupedErrors = { steps: new Map(), workflow: [], loose: [] };
  for (const line of lines) {
    const { own, where, message } = splitErrorLine(line, name);
    if (!own) {
      out.loose.push(line);
      continue;
    }
    if (where === null) {
      out.loose.push(message);
      continue;
    }
    const s = /^steps\[(\d+)\](?:\.(.+))?$/.exec(where);
    if (s !== null && Number(s[1]) < steps) {
      const i = Number(s[1]);
      const list = out.steps.get(i) ?? [];
      list.push({ key: s[2] ?? null, message });
      out.steps.set(i, list);
      continue;
    }
    const w = /^([^.]+)(?:\.(.+))?$/.exec(where);
    const key = w?.[1] ?? "";
    if (s === null && WORKFLOW_KEYS.includes(key) && (key === "inputs" || w?.[2] === undefined)) {
      out.workflow.push({ key: key as WorkflowKey, input: w?.[2] === undefined ? null : unquote(w[2]), message });
      continue;
    }
    out.loose.push(`${where}: ${message}`);
  }
  return out;
}
