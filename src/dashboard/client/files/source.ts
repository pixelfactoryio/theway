/**
 * A workflow file or a prompt header read as written, for the editor's forms: values as text, nothing resolved.
 * Pure: no DOM, no React.
 */
import { VERSION } from "../../../core/language-schema";
import { parse } from "../editor/ops";
import { headerDoc } from "../editor/prompt";

/** The `<name>` of a `prompts/<name>.md` value; `null` for any other value. */
export const promptName = (value: string): string | null => /^prompts\/([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/.exec(value)?.[1] ?? null;

/**
 * A step card's badge from its effective runs-on and model: "your session", `agent · <model>` (`agent` with no model),
 * else its model alone; `info-light` for opus, `secondary` for the other models; `null` for nothing to show. `title`
 * says it in full.
 */
export function stepBadge(
  runsOn: string,
  model: string | null,
): { text: string; variant: "outline" | "info-light" | "secondary"; title: string } | null {
  if (runsOn === "session") return { text: "your session", variant: "outline", title: "Done by your own Claude session" };
  const variant = model === "opus" ? "info-light" : "secondary";
  if (runsOn === "agents") {
    return model === null
      ? { text: "agent", variant, title: "Run by an agent" }
      : { text: `agent · ${model}`, variant, title: `Run by an agent on the ${model} model` };
  }
  return model === null ? null : { text: model, variant, title: `Runs on the ${model} model` };
}

/** The long form of a matrix badge: what `N copies at once` means for the matrix key `key`. */
export const matrixTitle = (key: string): string => `Runs one copy per value of ${key}, in parallel`;

/** The long form of an on-fail badge. */
export const ON_FAIL_TITLE = "If this step fails, the fix prompt runs and this step runs again";

/** The long form of the `step prompt` badge. */
export const STEP_PROMPT_TITLE = "A workflow can use this file as a step";

/** How many steps run elsewhere than the workflow's `runs-on`, in words: `<N> step(s) override(s) it.`; `null` for none. */
export function overridesText(runsOn: string, steps: { runs_on: string }[]): string | null {
  const n = steps.filter((s) => s.runs_on !== runsOn).length;
  if (n === 0) return null;
  return n === 1 ? "1 step overrides it." : `${n} steps override it.`;
}

/** An input declaration as written. */
export type InputSource = { name: string; description: string; required: boolean; default: string | null; type: string };

/** An on-fail as written: its `uses`, its prompt's name (`null` for a value that names none), its `with` and its model. */
export type OnFailSource = { uses: string; name: string | null; with: Record<string, string>; model: string | null };

/** A step as written. */
export type StepSource = {
  uses: string;
  name: string | null;
  with: Record<string, string>;
  matrix: { key: string; values: string[] } | null;
  onFail: OnFailSource | null;
  tries: string | null;
  runsOn: string | null;
  model: string | null;
};

/** A workflow file as written; `runsOn` is `null` when it writes none. */
export type WorkflowSource = { description: string; default: boolean; runsOn: string | null; inputs: InputSource[]; steps: StepSource[] };

/** A prompt header as written. */
export type HeaderSource = { description: string; model: string | null; inputs: InputSource[] };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const textOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

/** A `with` map's entries as text. */
const withOf = (v: unknown): Record<string, string> => (isObj(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, text(x)])) : {});

/** The inputs of an `inputs` map, in their order. */
function inputsOf(v: unknown): InputSource[] {
  if (!isObj(v)) return [];
  return Object.entries(v).map(([name, d]) => {
    const o = isObj(d) ? d : {};
    return { name, description: text(o.description), required: o.required === true, default: textOrNull(o.default), type: text(o.type) || "text" };
  });
}

/** A step's map as written. */
function stepOf(v: unknown): StepSource {
  const s = isObj(v) ? v : {};
  const uses = text(s.uses);
  let matrix: StepSource["matrix"] = null;
  if (isObj(s.matrix)) {
    const [first] = Object.entries(s.matrix);
    if (first !== undefined) matrix = { key: first[0], values: Array.isArray(first[1]) ? first[1].map(text) : [] };
  }
  let onFail: OnFailSource | null = null;
  const of = s["on-fail"];
  if (typeof of === "string") onFail = { uses: of, name: promptName(of), with: {}, model: null };
  else if (isObj(of)) onFail = { uses: text(of.uses), name: promptName(text(of.uses)), with: withOf(of.with), model: textOrNull(of.model) };
  return {
    uses,
    name: promptName(uses),
    with: withOf(s.with),
    matrix,
    onFail,
    tries: textOrNull(s.tries),
    runsOn: textOrNull(s["runs-on"]),
    model: textOrNull(s.model),
  };
}

/** The error of a `theway.workflow/v1` file, as the resolver words it after the file's path. */
export const V1_ERROR = `theway.workflow/v1 is no longer read: rewrite it as ${VERSION}`;

/** A workflow's text as written; `error` when it does not parse, is a v1 file, or has no list of steps. */
export function workflowSource(src: string): WorkflowSource | { error: string } {
  const doc = parse(src);
  if (doc.errors.length > 0) return { error: `invalid YAML: ${doc.errors[0]?.message.split("\n")[0] ?? ""}` };
  const root = doc.toJS() as unknown;
  if (!isObj(root)) return { error: "the file is not a map" };
  if (root.version === "theway.workflow/v1") return { error: V1_ERROR };
  if (root.steps !== undefined && !Array.isArray(root.steps)) return { error: "steps: must be a non-empty list" };
  return {
    description: text(root.description),
    default: root.default === true,
    runsOn: textOrNull(root["runs-on"]),
    inputs: inputsOf(root.inputs),
    steps: (Array.isArray(root.steps) ? root.steps : []).map(stepOf),
  };
}

/** A prompt file's header as written; `null` for a file with no header, `error` when the header does not parse. */
export function headerSource(src: string): HeaderSource | { error: string } | null {
  const doc = headerDoc(src);
  if (doc === null) return null;
  if (doc.errors.length > 0) return { error: `invalid YAML in the header: ${doc.errors[0]?.message.split("\n")[0] ?? ""}` };
  const root = doc.toJS() as unknown;
  const h = isObj(root) ? root : {};
  return { description: text(h.description), model: textOrNull(h.model), inputs: inputsOf(h.inputs) };
}
