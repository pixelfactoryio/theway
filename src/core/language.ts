import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parse } from "yaml";
import type { Warn } from "./config";
import { escaped, type Overlay } from "./io";
import {
  MODELS,
  NAME,
  PARAM,
  type PromptFileItem,
  type PromptHeader,
  type PromptInput,
  type ResolvedInput,
  type ResolvedOnFail,
  type ResolvedStep,
  type ResolvedWorkflow,
  RUNS_ON,
  type RunsOn,
  VERSION,
  WORKFLOW_INPUT_TYPES,
  type WorkflowFileItem,
  type WorkflowInputType,
  type WithValue,
} from "./language-schema";
import { changeIdReason } from "./path";
import { dirsOf, fileOf, namesIn, searched } from "./step-files";

/** The version of the language this one replaces. */
const V1 = "theway.workflow/v1";

/** The error line of a `theway.workflow/v1` file at `rel`. */
export const v1Line = (rel: string) => `${rel}: ${V1} is no longer read: rewrite it as ${VERSION}`;

const WORKFLOW_KEYS = ["version", "description", "default", "inputs", "runs-on", "steps"];
const STEP_KEYS = ["uses", "with", "matrix", "on-fail", "tries", "runs-on", "model"];
const ON_FAIL_KEYS = ["uses", "with", "model"];

const RULE = {
  nonEmpty: "must be a non-empty string",
  bool: "must be true or false",
  runsOn: `must be ${RUNS_ON.join(" or ")}`,
  model: `must be one of ${MODELS.join(", ")}`,
  uses: "must be prompts/<name>.md, <name> lowercase letters and digits in words separated by single hyphens",
  param: "must be a param name (lowercase letters, digits and _, starting with a letter)",
  tries: "must be an integer from 1 to 10",
  type: `must be ${WORKFLOW_INPUT_TYPES.join(" or ")}`,
};

/**
 * A reference theway may replace: `${{ inputs.<name> }}` or `${{ matrix.<key> }}`, with an optional space inside each
 * brace pair. Any other `${{ … }}` text is plain text.
 */
const REF = /\$\{\{ ?(inputs|matrix)\.([^\s}]+) ?\}\}/g;

/** A `uses` or `on-fail` value: `prompts/<name>.md`. */
const USES = /^prompts\/([^/]+)\.md$/;

const isMap = (v: unknown): v is Map<unknown, unknown> => v instanceof Map;
const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const isModel = (v: unknown): v is string => (MODELS as readonly unknown[]).includes(v);
const isRunsOn = (v: unknown): v is RunsOn => (RUNS_ON as readonly unknown[]).includes(v);

/** The text of `path`: the overlay's when it holds the path, else the disk's; `null` when it cannot be read. */
function readText(path: string, overlay?: Overlay): string | null {
  if (overlay?.has(path) === true) return overlay.get(path) ?? null;
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

/** The YAML root of `text`, maps as `Map`, or the first line of the parser's error. */
export function parseYaml(text: string): { root: unknown } | { reason: string } {
  try {
    return { root: parse(text, { mapAsMap: true, logLevel: "error" }) };
  } catch (e) {
    const first = (e instanceof Error ? e.message : String(e)).split("\n")[0] ?? "";
    const line = (e as { linePos?: { line: number }[] }).linePos?.[0]?.line;
    const failing = line === undefined ? "" : (text.split("\n")[line - 1] ?? "");
    const hint = failing.includes("${{") ? "; quote a ${{ … }} reference written inside {…}" : "";
    return { reason: `invalid YAML: ${first.replace(/:$/, "")}${hint}` };
  }
}

/** Replaces each reference in `text` in one pass: `f` gives its value, or `undefined` to keep it as written. */
function substitute(text: string, f: (kind: string, name: string) => string | undefined): string {
  return text.replace(REF, (whole, kind: string, name: string) => f(kind, name) ?? whole);
}

/** The references of `text`, in order. */
const refsOf = (text: string): { kind: string; name: string }[] =>
  [...text.matchAll(REF)].map((m) => ({ kind: m[1] as string, name: m[2] as string }));

type Decl = PromptInput & { type: WorkflowInputType };

/**
 * The input declarations of a map at `at` (`inputs`), checked: each name a param name and each declaration a map with a
 * non-empty `description`, a boolean `required`, a string `default` refused together with `required: true` and, for a
 * workflow, a `type`. Error lines go to `errors` as `<where>: <message>`; a declaration with a valid name is kept.
 */
function declarations(v: unknown, at: string, errors: string[], workflow: boolean): Map<string, Decl> {
  const out = new Map<string, Decl>();
  if (!isMap(v)) {
    errors.push(`${at}: must be a map of input name to its declaration`);
    return out;
  }
  const keys = workflow ? ["description", "required", "default", "type"] : ["description", "required", "default"];
  for (const [rawName, d] of v) {
    const name = String(rawName);
    const where = `${at}.${escaped(name)}`;
    if (!PARAM.test(name)) {
      errors.push(`${where}: ${RULE.param}`);
      continue;
    }
    const decl: Decl = { description: "", required: false, default: null, type: "text" };
    out.set(name, decl);
    if (!isMap(d)) {
      errors.push(`${where}: must be a map with a description`);
      continue;
    }
    for (const [rk, value] of d) {
      const k = String(rk);
      if (!keys.includes(k)) errors.push(`${where}: unknown key ${escaped(k)}`);
      else if (k === "description") {
        if (nonEmpty(value)) decl.description = value;
        else errors.push(`${where}: description ${RULE.nonEmpty}`);
      } else if (k === "required") {
        if (typeof value === "boolean") decl.required = value;
        else errors.push(`${where}: required ${RULE.bool}`);
      } else if (k === "default") {
        if (typeof value === "string") decl.default = value;
        else errors.push(`${where}: default must be a string`);
      } else if ((WORKFLOW_INPUT_TYPES as readonly unknown[]).includes(value)) {
        decl.type = value as WorkflowInputType;
      } else {
        errors.push(`${where}: type ${RULE.type}`);
      }
    }
    if (!d.has("description")) errors.push(`${where}: description ${RULE.nonEmpty}`);
    if (d.get("required") === true && d.has("default")) errors.push(`${where}: default is refused together with required: true`);
    if (workflow && decl.type === "change" && decl.default !== null && changeIdReason(decl.default) !== "") {
      errors.push(`${where}: default ${changeIdReason(decl.default)}`);
    }
  }
  return out;
}

/**
 * Splits a prompt file into its header and its body. `header` is `null` when the text does not start with a `---` line
 * followed by a closing `---` line, or when that YAML is not a map holding a `description` key; `body` is then the
 * whole text. `headerErrors` holds the header rule errors as `<where>: <message>` lines, `[]` when `header` is `null`.
 */
export function parsePromptFile(raw: string): { header: PromptHeader | null; headerErrors: string[]; body: string } {
  // A leading BOM is ignored and CRLF line endings read as LF, header and body alike.
  const text = raw.replace(/^﻿/, "").replaceAll("\r\n", "\n");
  const none = { header: null, headerErrors: [], body: text };
  const lines = text.split("\n");
  const fence = (l: string | undefined) => l !== undefined && l.replace(/\r$/, "") === "---";
  if (!fence(lines[0])) return none;
  const end = lines.findIndex((l, i) => i > 0 && fence(l));
  if (end === -1) return none;
  const parsed = parseYaml(lines.slice(1, end).join("\n"));
  if ("reason" in parsed || !isMap(parsed.root) || !parsed.root.has("description")) return none;
  const headerErrors: string[] = [];
  const header: PromptHeader = { description: "", model: null, inputs: {} };
  for (const [rk, v] of parsed.root) {
    const k = String(rk);
    if (k === "description") {
      if (nonEmpty(v)) header.description = v;
      else headerErrors.push(`description: ${RULE.nonEmpty}`);
    } else if (k === "model") {
      if (isModel(v)) header.model = v;
      else headerErrors.push(`model: ${RULE.model}`);
    } else if (k === "inputs") {
      for (const [name, d] of declarations(v, "inputs", headerErrors, false)) {
        header.inputs[name] = { description: d.description, required: d.required, default: d.default };
      }
    } else {
      headerErrors.push(`${escaped(k)}: unknown key`);
    }
  }
  const body = lines
    .slice(end + 1)
    .join("\n")
    .replace(/^(\r?\n)+/, "");
  return { header, headerErrors, body };
}

/** A prompt a workflow names by `uses` or `on-fail`, read and checked. */
type Prompt = { uses: string; name: string; file: string; header: PromptHeader; body: string };

/** What a workflow's check needs: where to look, the file's relative path, its inputs, and the prompts read so far. */
type Ctx = {
  home: string;
  key: string;
  overlay?: Overlay;
  rel: string;
  inputs: Map<string, Decl>;
  prompts: Map<string, Prompt | null>;
};

/**
 * The prompt a `uses` value names, read and checked once per file: an error line (`<rel>: <where>: <message>`) for a
 * bad value or a missing file goes to `out`, and so does each error of the prompt file itself, under its own
 * `prompts/<name>.md`. `null` when the prompt cannot be used.
 */
function promptOf(ctx: Ctx, v: unknown, where: string, out: string[]): Prompt | null {
  const m = typeof v === "string" ? USES.exec(v) : null;
  const name = m?.[1];
  if (name === undefined || !NAME.test(name)) {
    out.push(`${ctx.rel}: ${where}: ${RULE.uses}`);
    return null;
  }
  const uses = `prompts/${name}.md`;
  const file = fileOf(ctx.home, ctx.key, "prompts", name, ctx.overlay);
  if (file === null) {
    out.push(`${ctx.rel}: ${where}: ${uses} not found in ${searched(ctx.home, ctx.key, "prompts")}`);
    return null;
  }
  if (ctx.prompts.has(file)) return ctx.prompts.get(file) as Prompt | null;
  const text = readText(file, ctx.overlay);
  if (text === null) {
    out.push(`${uses}: cannot be read`);
    ctx.prompts.set(file, null);
    return null;
  }
  const { header, headerErrors, body } = parsePromptFile(text);
  if (header === null) {
    out.push(`${uses}: header: missing; a prompt a workflow uses starts with a --- line, YAML holding a description, and a --- line`);
    ctx.prompts.set(file, null);
    return null;
  }
  for (const e of headerErrors) out.push(`${uses}: ${e}`);
  if (body.trim() === "") out.push(`${uses}: body: must not be empty`);
  for (const r of refsOf(body)) {
    if (r.kind === "inputs" && !Object.hasOwn(header.inputs, r.name)) {
      out.push(`${uses}: body: \${{ inputs.${r.name} }} names no input of this prompt`);
    }
  }
  const prompt = { uses, name, file, header, body };
  ctx.prompts.set(file, prompt);
  return prompt;
}

/**
 * A `with` map at `where`, checked against its prompt: every key declared, every value a string, a number or a boolean,
 * every reference naming something declared (a `matrix` one is not checked when `matrixKey` is `undefined`, the step's
 * matrix having a mistake), every required input set. Returns each written input's text, `""` for
 * `null`; a required input written `""` or `null` counts as not set, an optional one is the empty string.
 */
function withOf(ctx: Ctx, v: unknown, where: string, prompt: Prompt | null, matrixKey: string | null | undefined, onFail: boolean, out: string[]): Map<string, string> {
  const set = new Map<string, string>();
  const err = (msg: string) => out.push(`${ctx.rel}: ${where}: ${msg}`);
  if (v !== undefined && v !== null && !isMap(v)) err("must be a map of prompt input name to a value");
  if (isMap(v)) {
    for (const [rk, value] of v) {
      const k = String(rk);
      if (prompt !== null && !Object.hasOwn(prompt.header.inputs, k)) err(`${prompt.uses} declares no input ${escaped(k)}`);
      if (value !== null && !["string", "number", "boolean"].includes(typeof value)) {
        err(`${escaped(k)} must be a string, a number or a boolean`);
        continue;
      }
      const text = value === null ? "" : String(value);
      for (const r of refsOf(text)) {
        if (r.kind === "inputs") {
          if (!ctx.inputs.has(r.name)) err(`\${{ inputs.${r.name} }} names no input of the workflow`);
        } else if (onFail) {
          err(`\${{ matrix.${r.name} }} is not allowed in an on-fail`);
        } else if (matrixKey !== undefined && matrixKey !== r.name) {
          err(`\${{ matrix.${r.name} }} names no matrix key of this step`);
        }
      }
      set.set(k, text);
    }
  }
  if (prompt !== null) {
    for (const [name, decl] of Object.entries(prompt.header.inputs)) {
      if (decl.required && (set.get(name) ?? "") === "") err(`required input ${name} is not set`);
    }
  }
  return set;
}

/** A step of the workflow, checked, with what its resolution needs. */
type Step = {
  prompt: Prompt;
  runsOn: RunsOn;
  model: string | null;
  matrix: { key: string; values: string[] } | null;
  written: Record<string, WithValue>;
  set: Map<string, string>;
  onFail: { prompt: Prompt; model: string | null; set: Map<string, string> } | null;
  tries: number | null;
};

/** Checks step `i`; its error lines go to `out` in the order of its keys, then the lines about the whole step. */
function checkStep(ctx: Ctx, raw: unknown, i: number, workflowRunsOn: RunsOn | null, out: string[]): Step | null {
  const at = `steps[${i}]`;
  if (!isMap(raw)) {
    out.push(`${ctx.rel}: ${at}: must be a map that runs a prompt`);
    return null;
  }
  const byKey = new Map<string, string[]>();
  const lines = (k: string) => byKey.get(k) ?? (byKey.set(k, []).get(k) as string[]);
  const err = (k: string, msg: string) => lines(k).push(`${ctx.rel}: ${at}.${k}: ${msg}`);
  const tail: string[] = [];

  const has = (k: string) => raw.has(k);
  const prompt = has("uses") ? promptOf(ctx, raw.get("uses"), `${at}.uses`, lines("uses")) : null;
  let matrix: Step["matrix"] = null;
  if (has("matrix")) {
    const v = raw.get("matrix");
    const [first] = isMap(v) ? [...v] : [];
    if (!isMap(v) || v.size !== 1) err("matrix", "must be a map with exactly one key");
    else if (!PARAM.test(String(first?.[0]))) err("matrix", `key ${escaped(String(first?.[0]))} ${RULE.param}`);
    else if (!Array.isArray(first?.[1]) || first[1].length === 0 || !first[1].every((x) => typeof x === "string")) {
      err("matrix", `${String(first?.[0])} must be a non-empty list of strings`);
    } else {
      matrix = { key: String(first?.[0]), values: first[1] as string[] };
    }
  }
  // A matrix with a mistake has its one error line: no reference to a matrix key of this step is checked then.
  const matrixKey = has("matrix") && matrix === null ? undefined : (matrix?.key ?? null);
  const set = withOf(ctx, raw.get("with"), `${at}.with`, prompt, matrixKey, false, lines("with"));
  const written: Record<string, WithValue> = {};
  if (isMap(raw.get("with"))) {
    for (const [k, v] of raw.get("with") as Map<unknown, unknown>) written[String(k)] = v as WithValue;
  }

  let onFail: { prompt: Prompt | null; model: string | null; set: Map<string, string> } | null = null;
  let onFailModelBad = false;
  if (has("on-fail")) {
    const v = raw.get("on-fail");
    const o = lines("on-fail");
    if (isMap(v)) {
      for (const k of v.keys()) {
        if (!ON_FAIL_KEYS.includes(String(k))) o.push(`${ctx.rel}: ${at}.on-fail: unknown key ${escaped(String(k))}`);
      }
      const p = v.has("uses") ? promptOf(ctx, v.get("uses"), `${at}.on-fail.uses`, o) : null;
      if (!v.has("uses")) o.push(`${ctx.rel}: ${at}.on-fail: uses is required`);
      let model: string | null = null;
      if (v.has("model")) {
        if (isModel(v.get("model"))) model = v.get("model") as string;
        else {
          onFailModelBad = true;
          o.push(`${ctx.rel}: ${at}.on-fail.model: ${RULE.model}`);
        }
      }
      onFail = { prompt: p, model, set: withOf(ctx, v.get("with"), `${at}.on-fail.with`, p, null, true, o) };
    } else {
      const p = promptOf(ctx, v, `${at}.on-fail`, o);
      onFail = { prompt: p, model: null, set: withOf(ctx, undefined, `${at}.on-fail.with`, p, null, true, o) };
    }
  }
  let tries: number | null = null;
  if (has("tries")) {
    const v = raw.get("tries");
    if (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 10) tries = v;
    else err("tries", RULE.tries);
  }
  let runsOn: RunsOn | null = workflowRunsOn;
  if (has("runs-on")) {
    const v = raw.get("runs-on");
    if (isRunsOn(v)) runsOn = v;
    else {
      runsOn = null;
      err("runs-on", RULE.runsOn);
    }
  }
  let model: string | null = null;
  let modelBad = false;
  if (has("model")) {
    if (isModel(raw.get("model"))) model = raw.get("model") as string;
    else {
      modelBad = true;
      err("model", RULE.model);
    }
  }
  for (const k of raw.keys()) {
    if (!STEP_KEYS.includes(String(k))) lines(String(k)).push(`${ctx.rel}: ${at}.${escaped(String(k))}: unknown key`);
  }

  if (!has("uses")) tail.push(`${ctx.rel}: ${at}: uses is required`);
  if (has("on-fail") && !has("tries")) tail.push(`${ctx.rel}: ${at}.on-fail: needs tries (an integer from 1 to 10)`);
  if (has("tries") && !has("on-fail")) tail.push(`${ctx.rel}: ${at}.tries: needs on-fail`);
  if (runsOn === "agents") {
    model ??= prompt?.header.model ?? null;
    if (prompt !== null && model === null && !modelBad) {
      tail.push(`${ctx.rel}: ${at}.model: the step runs on agents and has no model; set model on the step or in ${prompt.uses}`);
    }
    if (onFail !== null) {
      onFail.model ??= onFail.prompt?.header.model ?? null;
      if (onFail.prompt !== null && onFail.model === null && !onFailModelBad) {
        tail.push(`${ctx.rel}: ${at}.on-fail.model: the step runs on agents and its on-fail has no model; set model in the on-fail map or in ${onFail.prompt.uses}`);
      }
    }
  } else {
    model = null;
    if (onFail !== null) onFail.model = null;
  }

  for (const k of raw.keys()) out.push(...(byKey.get(String(k)) ?? []));
  // A step with no `with` key still has its required-input lines.
  if (!has("with")) out.push(...(byKey.get("with") ?? []));
  out.push(...tail);
  if (prompt === null || runsOn === null) return null;
  const resolvedOnFail = onFail === null || onFail.prompt === null ? null : { prompt: onFail.prompt, model: onFail.model, set: onFail.set };
  return { prompt, runsOn, model, matrix, written, set, onFail: resolvedOnFail, tries };
}

/** A prompt's inputs with their final values, and its body substituted with them. */
function run(prompt: Prompt, set: Map<string, string>, value: (kind: string, name: string) => string | undefined): { with: Record<string, string>; prompt: string } {
  const w: Record<string, string> = {};
  for (const [name, decl] of Object.entries(prompt.header.inputs)) {
    const given = set.get(name);
    w[name] = given === undefined ? (decl.default ?? "") : substitute(given, value);
  }
  return { with: w, prompt: substitute(prompt.body, (kind, name) => (kind === "inputs" ? w[name] : undefined)) };
}

/**
 * The workflow `name` of a project, checked and resolved: found in the project folder, then the home (the overlay
 * first), every rule checked and every error collected in file order as `<rel>: <where>: <message>`. `inputs` holds the
 * `--input` values; `{}` means none given.
 */
export function resolveWorkflowFile(
  home: string,
  key: string,
  name: string,
  inputs: Record<string, string>,
  overlay?: Overlay,
): { doc: ResolvedWorkflow } | { errors: string[] } {
  const rel = `workflows/${name}.yaml`;
  if (!NAME.test(name)) return { errors: [`${rel}: invalid workflow name`] };
  const file = fileOf(home, key, "workflows", name, overlay);
  if (file === null) return { errors: [`${rel}: not found in ${searched(home, key, "workflows")}`] };
  const text = readText(file, overlay);
  if (text === null) return { errors: [`${rel}: cannot be read`] };
  const parsed = parseYaml(text);
  if ("reason" in parsed) return { errors: [`${rel}: ${parsed.reason}`] };
  const root = parsed.root;
  const version = isMap(root) ? root.get("version") : undefined;
  if (version === V1) return { errors: [v1Line(rel)] };
  if (!isMap(root) || version !== VERSION) return { errors: [`${rel}: version: must be ${VERSION}`] };

  const ctx: Ctx = { home, key, rel, inputs: new Map(), prompts: new Map() };
  if (overlay !== undefined) ctx.overlay = overlay;
  const byKey = new Map<string, string[]>();
  const lines = (k: string) => byKey.get(k) ?? (byKey.set(k, []).get(k) as string[]);
  const err = (k: string, msg: string) => lines(k).push(`${rel}: ${k}: ${msg}`);

  const description = root.get("description");
  if (root.has("description") && !nonEmpty(description)) err("description", RULE.nonEmpty);
  if (root.has("default") && typeof root.get("default") !== "boolean") err("default", RULE.bool);
  if (root.has("inputs")) {
    const decl: string[] = [];
    ctx.inputs = declarations(root.get("inputs"), "inputs", decl, true);
    lines("inputs").push(...decl.map((l) => `${rel}: ${l}`));
  }
  let runsOn: RunsOn | null = null;
  if (root.has("runs-on")) {
    if (isRunsOn(root.get("runs-on"))) runsOn = root.get("runs-on") as RunsOn;
    else err("runs-on", RULE.runsOn);
  }
  const steps: (Step | null)[] = [];
  if (root.has("steps")) {
    const list = root.get("steps");
    if (!Array.isArray(list) || list.length === 0) err("steps", "must be a non-empty list");
    else list.forEach((raw, i) => steps.push(checkStep(ctx, raw, i, runsOn, lines("steps"))));
  }
  for (const k of root.keys()) {
    if (!WORKFLOW_KEYS.includes(String(k))) lines(String(k)).push(`${rel}: ${escaped(String(k))}: unknown key`);
  }
  const errors: string[] = [];
  for (const k of root.keys()) errors.push(...(byKey.get(String(k)) ?? []));
  if (!root.has("description")) errors.push(`${rel}: description: ${RULE.nonEmpty}`);
  if (!root.has("runs-on")) errors.push(`${rel}: runs-on: ${RULE.runsOn}`);
  if (!root.has("steps")) errors.push(`${rel}: steps: must be a non-empty list`);

  const given = Object.entries(inputs);
  // A required input given as `--input <name>=` counts as not given.
  const missing = (n: string, decl: Decl) => decl.required && (inputs[n] ?? "") === "";
  for (const [n, v] of given) {
    const decl = ctx.inputs.get(n);
    if (decl === undefined) errors.push(`--input ${escaped(n)}: ${rel} declares no such input`);
    else if (decl.type === "change" && !missing(n, decl) && changeIdReason(v) !== "") errors.push(`--input ${n}: ${changeIdReason(v)}`);
  }
  if (given.length > 0) {
    for (const [n, decl] of ctx.inputs) {
      if (missing(n, decl)) errors.push(`--input ${n}: required input is not given`);
    }
  }
  if (errors.length > 0) return { errors };

  const resolved = [...ctx.inputs.values()].every((d) => !d.required) || given.length > 0;
  const values: Record<string, string> = {};
  const docInputs: Record<string, ResolvedInput> = {};
  for (const [n, d] of ctx.inputs) {
    const value = inputs[n] ?? d.default ?? "";
    if (resolved) values[n] = value;
    docInputs[n] = { description: d.description, required: d.required, default: d.default, type: d.type, value: resolved ? value : null };
  }
  const inputValue = (n: string) => (resolved ? values[n] : undefined);

  const docSteps: ResolvedStep[] = (steps as Step[]).map((s, i): ResolvedStep => {
    const n = i + 1;
    const runs = (s.matrix === null ? [null] : s.matrix.values).map((mv) => {
      const label = mv === null ? `${n}.${s.prompt.name}` : `${n}.${s.prompt.name}[${mv}]`;
      const r = run(s.prompt, s.set, (kind, name) => (kind === "matrix" ? (mv ?? undefined) : inputValue(name)));
      return { label, with: r.with, prompt: r.prompt };
    });
    let onFail: ResolvedOnFail | null = null;
    if (s.onFail !== null) {
      const r = run(s.onFail.prompt, s.onFail.set, (kind, name) => (kind === "inputs" ? inputValue(name) : undefined));
      const p = s.onFail.prompt;
      onFail = { uses: p.uses, file: p.file, description: p.header.description, model: s.onFail.model, with: r.with, label: `${n}.${p.name}`, prompt: r.prompt };
    }
    return {
      index: i,
      uses: s.prompt.uses,
      file: s.prompt.file,
      description: s.prompt.header.description,
      runs_on: s.runsOn,
      model: s.model,
      matrix: s.matrix,
      with: s.written,
      runs,
      on_fail: onFail,
      tries: s.tries,
    };
  });
  const doc: ResolvedWorkflow = {
    name,
    version: VERSION,
    description: description as string,
    file,
    default: root.get("default") === true,
    inputs: docInputs,
    runs_on: runsOn as RunsOn,
    resolved,
    steps: docSteps,
  };
  return { doc };
}

/** The names of `kind` files in the project folder and the home, a project file hiding the global one, sorted. */
function scopedNames(
  home: string,
  key: string,
  kind: "workflows" | "prompts",
  overlay?: Overlay,
  rejected?: (path: string) => void,
): { name: string; scope: "project" | "global"; path: string }[] {
  const ext = kind === "workflows" ? ".yaml" : ".md";
  const [ownDir, globalDir] = dirsOf(home, key, kind);
  const own = namesIn(ownDir, kind, rejected, overlay);
  return [
    ...own.map((name) => ({ name, scope: "project" as const, path: join(ownDir, `${name}${ext}`) })),
    ...namesIn(globalDir, kind, rejected, overlay)
      .filter((n) => !own.includes(n))
      .map((name) => ({ name, scope: "global" as const, path: join(globalDir, `${name}${ext}`) })),
  ].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** Whether a workflow file's parsed root sets the default: only a theway.workflow/v1beta file can, a v1 file's `default:` is not read. */
function isDefaultRoot(root: unknown): boolean {
  return isMap(root) && root.get("version") === VERSION && root.get("default") === true;
}

/**
 * The workflow files of a project and of the home that set `default: true`, as `listWorkflowFiles` lists them (a project
 * file hiding the global one, sorted by name), without resolving them.
 */
export function defaultWorkflows(home: string, key: string, overlay?: Overlay): { name: string; scope: "project" | "global" }[] {
  return scopedNames(home, key, "workflows", overlay)
    .filter(({ path }) => {
      const text = readText(path, overlay);
      const parsed = text === null ? null : parseYaml(text);
      return parsed !== null && "root" in parsed && isDefaultRoot(parsed.root);
    })
    .map(({ name, scope }) => ({ name, scope }));
}

/**
 * Every workflow file of a project and of the home, a project file hiding the global one of the same name, sorted by
 * name: its description (`null` when unreadable), its `default` (false for a file of another version), every error line of `resolveWorkflowFile`
 * (the first also as `error`) and its resolved document (`null` when it does not resolve). A `.yaml` file whose stem is not a valid name is warned about and left out.
 */
export function listWorkflowFiles(home: string, key: string, warn: Warn, overlay?: Overlay): WorkflowFileItem[] {
  const found = scopedNames(home, key, "workflows", overlay, (path) => warn(relative(home, path), "not a valid workflow name"));
  return found.map(({ name, scope, path }): WorkflowFileItem => {
    const text = readText(path, overlay);
    const parsed = text === null ? null : parseYaml(text);
    const root = parsed !== null && "root" in parsed ? parsed.root : null;
    const description = isMap(root) && nonEmpty(root.get("description")) ? (root.get("description") as string) : null;
    const isDefault = isDefaultRoot(root);
    const result = resolveWorkflowFile(home, key, name, {}, overlay);
    const errors = "errors" in result ? result.errors : [];
    const item: WorkflowFileItem = { name, scope, description, default: isDefault, errors, doc: "doc" in result ? result.doc : null };
    if (errors.length > 0) item.error = errors[0] as string;
    return item;
  });
}

/**
 * Every `.md` file of the project's and the home's `prompts/` folders, `.default.md` copies left out, a project file
 * hiding the global one, sorted by name: its header's description (else `null`), `step`: whether it has a header
 * that passes the header rules, and `error`: the first header rule error (`<where>: <message>`), `null` for none.
 */
export function listPromptFiles(home: string, key: string, overlay?: Overlay): PromptFileItem[] {
  return scopedNames(home, key, "prompts", overlay).map(({ name, scope, path }): PromptFileItem => {
    const text = readText(path, overlay);
    const { header, headerErrors } = text === null ? { header: null, headerErrors: [] } : parsePromptFile(text);
    const description = header !== null && header.description !== "" ? header.description : null;
    return { name, scope, description, step: header !== null && headerErrors.length === 0, error: headerErrors[0] ?? null };
  });
}
