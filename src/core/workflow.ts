import { readdirSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { type Config, isLensList, isShared, load, loadConfig, NAME } from "./config";
import { isFile, thewayHome } from "./io";
import { invalidSegments } from "./path";

const TYPES = ["implement", "review", "agent", "pr"] as const;
type StepType = (typeof TYPES)[number];

/** A field's rule and the text its error names. */
type FieldRule = { test: (v: unknown) => boolean; text: string };

const positive: FieldRule = {
  test: (v) => typeof v === "number" && Number.isInteger(v) && v >= 1,
  text: "a positive integer",
};
const model: FieldRule = { test: (v) => v === "opus" || v === "sonnet" || v === "haiku", text: "opus, sonnet or haiku" };
const lenses: FieldRule = { test: isLensList, text: "a non-empty list of names without duplicates" };
const name: FieldRule = {
  test: (v) => typeof v === "string" && NAME.test(v),
  text: "a name (lowercase letters, digits and -)",
};
const nonEmpty: FieldRule = { test: (v) => typeof v === "string" && v.length > 0, text: "a non-empty string" };

/** The fields of each step type, in output order, with their rules. */
const FIELDS: Record<StepType, [string, FieldRule][]> = {
  implement: [["model", model]],
  review: [
    ["rounds", positive],
    ["lenses", lenses],
    ["model", model],
    ["fix_model", model],
  ],
  agent: [
    ["name", name],
    ["prompt", nonEmpty],
    ["model", model],
  ],
  pr: [
    ["ci_attempts", positive],
    ["model", model],
    ["fix_model", model],
  ],
};
/** The `agent` fields with no default, in the order their absence is reported. */
const REQUIRED = ["name", "prompt"];

type Lens = { name: string; path: string };
type Step = { step: StepType } & Record<string, unknown>;
type Workflow = { name: string; file: string; steps: Step[] };

/** The home, the project and whether the project has its own `workflows/` and `lenses/` (not for a shared name). */
type Dirs = { home: string; project: string; own: boolean };

const projectDir = (d: Dirs, kind: "workflows" | "lenses") => join(d.home, d.project, kind);
const globalDir = (d: Dirs, kind: "workflows" | "lenses") => join(d.home, kind);
/** The folders searched for `kind`, for an error line: the global one alone when the project folder is not read. */
const searched = (d: Dirs, kind: "workflows" | "lenses") =>
  d.own ? `${projectDir(d, kind)} or ${globalDir(d, kind)}` : globalDir(d, kind);

/** The lens file of `lens`: the project one if it is a file, else the global one, else `null`. */
function lensPath(d: Dirs, lens: string): string | null {
  const own = join(projectDir(d, "lenses"), `${lens}.md`);
  if (d.own && isFile(own)) return own;
  const global = join(globalDir(d, "lenses"), `${lens}.md`);
  return isFile(global) ? global : null;
}

/** A workflow file, fully validated with the defaults applied, and its `default` value; or the error line. */
function validate(d: Dirs, path: string, defaults: Config): { workflow: Workflow; isDefault: boolean } | { error: string } {
  const rel = relative(d.home, path);
  const fail = (reason: string) => ({ error: `theway: ${rel}: ${reason}` });
  const loaded = load(d.home, rel);
  if ("error" in loaded) return loaded;
  const root = loaded.root;
  if (!(root instanceof Map)) return fail("not a map");
  for (const key of root.keys()) {
    if (key !== "default" && key !== "steps") return fail(`unknown key ${String(key)}`);
  }
  if (root.has("default") && typeof root.get("default") !== "boolean") return fail("default must be true or false");
  const entries: unknown = root.get("steps");
  if (!Array.isArray(entries) || entries.length === 0) return fail("steps must be a non-empty list");

  const steps: Step[] = [];
  for (const [i, entry] of entries.entries()) {
    const at = `steps[${i}]`;
    const type = entry instanceof Map && entry.size === 1 ? [...entry.keys()][0] : undefined;
    if (!(TYPES as readonly unknown[]).includes(type)) return fail(`${at} must be one of ${TYPES.join(", ")}`);
    const t = type as StepType;
    const value: unknown = (entry as Map<unknown, unknown>).get(t);
    if (value !== null && !(value instanceof Map)) return fail(`${at}.${t} must be a map`);
    const given = (value ?? new Map()) as Map<unknown, unknown>;
    const fields = new Map(FIELDS[t]);
    for (const key of given.keys()) {
      if (typeof key !== "string" || !fields.has(key)) return fail(`${at}.${t}.${String(key)} is not a field of ${t}`);
    }
    for (const [key, v] of given) {
      const rule = fields.get(key as string) as FieldRule;
      if (!rule.test(v)) return fail(`${at}.${t}.${String(key)} must be ${rule.text}`);
    }
    if (t === "agent") {
      for (const field of REQUIRED) if (!given.has(field)) return fail(`${at}.agent.${field} is required`);
    }
    if (i === 0 && t !== "implement") return fail("steps[0] must be implement");
    if (i > 0 && t === "implement") return fail(`${at}: implement may appear only once`);
    if (t === "pr" && i !== entries.length - 1) return fail(`${at}: pr must be the last step`);

    const own = (defaults[t] ?? {}) as Config;
    const step: Step = { step: t };
    for (const [field] of FIELDS[t]) {
      const v = given.has(field) ? given.get(field) : own[field];
      step[field] = Array.isArray(v) ? [...v] : v;
    }
    if (t === "review") {
      const found: Lens[] = [];
      for (const lens of step.lenses as string[]) {
        const p = lensPath(d, lens);
        if (p === null) {
          return fail(`${at}.review lens '${lens}' has no file in ${searched(d, "lenses")}`);
        }
        found.push({ name: lens, path: p });
      }
      step.lenses = found;
    }
    steps.push(step);
  }
  return { workflow: { name: basename(path, ".yaml"), file: path, steps }, isDefault: root.get("default") === true };
}

/** The workflow files of a folder, sorted, with a warning for each `.yaml` file whose stem is not a valid name. */
function scan(d: Dirs, dir: string): string[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const n of names.sort()) {
    if (!n.endsWith(".yaml") || n.endsWith(".default.yaml") || !isFile(join(dir, n))) continue;
    if (!NAME.test(n.slice(0, -".yaml".length))) {
      process.stderr.write(`theway: warning: ${relative(d.home, join(dir, n))}: not a valid workflow name; ignored\n`);
      continue;
    }
    out.push(n);
  }
  return out;
}

/** `a`, `a and b`, `a, b and c`. */
const joinAnd = (items: string[]) =>
  items.length === 1 ? (items[0] as string) : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/** The default among `paths` of one folder: its error, its only `default: true` file, or `null` when none sets it. */
function defaultOf(d: Dirs, paths: string[], defaults: Config): { workflow: Workflow } | { error: string } | null {
  const marked: Workflow[] = [];
  for (const path of paths) {
    const result = validate(d, path, defaults);
    if ("error" in result) return result;
    if (result.isDefault) marked.push(result.workflow);
  }
  if (marked.length > 1) {
    return { error: `theway: ${joinAnd(marked.map((w) => relative(d.home, w.file)))} both set default: true` };
  }
  return marked.length === 1 ? { workflow: marked[0] as Workflow } : null;
}

/** The workflow named `wanted`: the project file, else the global one, validated. */
function byName(d: Dirs, wanted: string, defaults: Config): { workflow: Workflow } | { error: string } {
  const own = join(projectDir(d, "workflows"), `${wanted}.yaml`);
  const global = join(globalDir(d, "workflows"), `${wanted}.yaml`);
  const path = d.own && isFile(own) ? own : isFile(global) ? global : null;
  if (path === null) {
    return { error: `theway: no workflow '${wanted}' in ${searched(d, "workflows")}` };
  }
  return validate(d, path, defaults);
}

/** The workflow a run without `<name>` uses: the project's `default: true` file, else the global one, else `develop`. */
function byDefault(d: Dirs, defaults: Config): { workflow: Workflow } | { error: string } {
  const ownNames = d.own ? scan(d, projectDir(d, "workflows")) : [];
  const own = defaultOf(
    d,
    ownNames.map((n) => join(projectDir(d, "workflows"), n)),
    defaults,
  );
  if (own !== null) return own;
  const globalNames = scan(d, globalDir(d, "workflows")).filter((n) => !ownNames.includes(n));
  const global = defaultOf(
    d,
    globalNames.map((n) => join(globalDir(d, "workflows"), n)),
    defaults,
  );
  if (global !== null) return global;
  return byName(d, "develop", defaults);
}

/** `theway workflow <project> [<name>]`: one workflow, resolved, validated and with every field filled, as JSON. */
export function cmdWorkflow(project: string, wanted: string | undefined): number {
  if (invalidSegments([["project", project]])) return 1;
  if (wanted !== undefined && !NAME.test(wanted)) {
    const shown = wanted.replaceAll("\n", "\\n").replaceAll("\r", "\\r");
    process.stderr.write(`theway: invalid workflow name '${shown}'\n`);
    return 1;
  }
  const home = thewayHome();
  const loaded = loadConfig(home, project);
  if (loaded === null) return 1;
  const defaults = (loaded.config.workflow as Config).defaults as Config;
  const d: Dirs = { home, project, own: !isShared(project) };
  const result = wanted === undefined ? byDefault(d, defaults) : byName(d, wanted, defaults);
  if ("error" in result) {
    process.stderr.write(`${result.error}\n`);
    return 1;
  }
  process.stdout.write(`${JSON.stringify(result.workflow, null, 2)}\n`);
  return 0;
}
