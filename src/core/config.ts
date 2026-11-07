import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { readManifest } from "./init";
import { warnUnknownDefaults } from "./step-files";
import { isFile, isNameList, type Overlay, thewayHome } from "./io";
import { projectDir, resolveKey } from "./project";
import type { ParamValue } from "./schema";

/** A leaf's type: the rule its value must follow. */
type Rule = "boolean";
type Leaf = { rule: Rule; default: boolean | number | string | string[] };
type Schema = { [key: string]: Leaf | Schema };

/** An empty map with no prototype, so every key, `__proto__` included, is an own property. */
const dict = <T>(): T => Object.create(null) as T;

const bool = (d: boolean): Leaf => ({ rule: "boolean", default: d });

/** The shipped opt-in standards of `<home>/standards/`, in output order: off unless their switch is on. */
export const OPT_IN = ["core-principles.md", "sre.md", "web-development.md", "quality.md"];
/** The shipped standards the commands always read by path: a global file with one of these names is never listed nor switchable. */
const CORE = ["interaction.md", "develop.md"];
/**
 * The shipped convention standards `theway workflow` resolves by path, the project file over the global one: never
 * listed from either folder nor switchable.
 */
export const CONVENTIONS = ["commits.md", "git-host.md"];

export type { ParamValue };

/** The kind of a param value, `null` when it is none of the four. */
export function kindOf(v: unknown): "string" | "integer" | "boolean" | "list" | null {
  if (typeof v === "string") return "string";
  if (typeof v === "boolean") return "boolean";
  if (typeof v === "number" && Number.isInteger(v)) return "integer";
  if (isNameList(v)) return "list";
  return null;
}

export const PARAM_VALUE_TEXT = "a string, an integer, a boolean or a non-empty list of names without duplicates";

/** The `standards.<key>` of a standard file: its stem with `-` turned into `_`. */
const keyOf = (name: string): string => name.slice(0, -".md".length).replaceAll("-", "_");
export const OPT_IN_KEYS = OPT_IN.map(keyOf);
/** The `standards.<key>` names that warn `cannot be switched`: the core ones (unless a project file holds one) and the conventions. */
const FIXED_KEYS = new Set([...CORE, ...CONVENTIONS].map(keyOf));

/**
 * A standard a project can read: its path, its switch, whether it is a shipped opt-in one and, for a global file, the
 * path of the project file with the same name that replaces it for the phases that file applies to.
 */
export type Standard = { path: string; key: string; optIn: boolean; shadowedBy?: string };

/** The names of the regular `.md` files directly in `dir`, sorted; none when it is missing. */
function mdFiles(dir: string): string[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names.filter((n) => n.endsWith(".md") && isFile(join(dir, n))).sort();
}

/**
 * Every standard of a project before any phase filter: the global folder's files, sorted, then the project's, sorted.
 * A convention name is left out of both folders. A global file is classified by name: a core name is left out, an opt-in name is an opt-in standard, any other name
 * `.shipped.json` lists as `standards/<name>` and any `*.default.md` is left out, the rest are user standards. A project
 * file is a user standard; a global file with the same name is kept and records it in `shadowedBy`, so that the phase
 * filter drops the global file only for the phases the project file applies to.
 */
export function standardsOf(home: string, key: string): Standard[] {
  const globalDir = join(home, "standards");
  const ownDir = join(projectDir(home, key), "standards");
  const projectNames = mdFiles(ownDir).filter((n) => !CONVENTIONS.includes(n));
  const shipped = readManifest(home) ?? {};
  const out: Standard[] = [];
  for (const name of mdFiles(globalDir)) {
    if (CORE.includes(name) || CONVENTIONS.includes(name)) continue;
    const optIn = OPT_IN.includes(name);
    if (!optIn && (`standards/${name}` in shipped || name.endsWith(".default.md"))) continue;
    const global: Standard = { path: join(globalDir, name), key: keyOf(name), optIn };
    if (projectNames.includes(name)) global.shadowedBy = join(ownDir, name);
    out.push(global);
  }
  for (const name of projectNames) out.push({ path: join(ownDir, name), key: keyOf(name), optIn: false });
  return out;
}

/**
 * The `standards` section of the schema for a project: the four opt-in keys in order, then the user keys sorted.
 * A key defaults to `true` when only user standards hold it, `false` otherwise (an opt-in key with no file included);
 * a shipped opt-in global file counts even when a project file shadows it, so that key stays off until enabled.
 * A core key is switchable only when a project file holds it: `standardsOf` leaves the global core files out.
 */
function standardsSchema(standards: Standard[]): Schema {
  const userKeys = [...new Set(standards.map((s) => s.key))].filter((k) => !OPT_IN_KEYS.includes(k)).sort();
  const schema = dict<Schema>();
  for (const key of [...OPT_IN_KEYS, ...userKeys]) {
    const holders = standards.filter((s) => s.key === key);
    schema[key] = { enabled: bool(holders.length > 0 && holders.every((s) => !s.optIn)) };
  }
  return schema;
}

/** Every key of the config, in output order, with its type and default; `standards` is filled per project. */
const SCHEMA: Schema = {
  standards: {},
  // workflow.defaults is free-form: a map of step names to maps of param values, checked by applyDefaults.
  workflow: { defaults: {} },
};

/** The dotted key of the free-form `workflow.defaults` map. */
const DEFAULTS_KEY = "workflow.defaults";

const RULE_TEXT: Record<Rule, string> = {
  boolean: "true or false",
};

const isLeaf = (node: Leaf | Schema): node is Leaf => typeof (node as Leaf).rule === "string";

function valid(rule: Rule, v: unknown): boolean {
  switch (rule) {
    case "boolean":
      return typeof v === "boolean";
  }
}

export type Config = { [key: string]: Config | boolean | number | string | string[] };

function defaults(schema: Schema): Config {
  const out = dict<Config>();
  for (const [key, node] of Object.entries(schema)) {
    out[key] = isLeaf(node) ? (Array.isArray(node.default) ? [...node.default] : node.default) : defaults(node);
  }
  return out;
}

export type Warn = (file: string, text: string) => void;

/** Writes a warning line, `theway: warning: <file>: <text>; ignored`. */
export const warnLoud: Warn = (file, text) => {
  process.stderr.write(`theway: warning: ${file}: ${text}; ignored\n`);
};
/** Drops every warning. */
export const warnQuiet: Warn = () => {};

/** One config file's valid `workflow.defaults`: per step name, its param values, in document order. */
export type DefaultsLayer = { file: string; steps: Map<string, Map<string, ParamValue>> };

/**
 * Applies one file's `workflow.defaults` map onto `into` and records its valid values in `layer`: a step whose value
 * is not a map, and a param value of none of the four kinds, are warned about and dropped.
 */
function applyDefaults(file: string, value: Map<unknown, unknown>, into: Config, layer: DefaultsLayer, warn: Warn): void {
  for (const [rawStep, params] of value) {
    const step = String(rawStep);
    if (!(params instanceof Map)) {
      warn(file, `${DEFAULTS_KEY}.${step} must be a map`);
      continue;
    }
    const kept = layer.steps.get(step) ?? new Map<string, ParamValue>();
    layer.steps.set(step, kept);
    if (!Object.hasOwn(into, step)) into[step] = dict<Config>();
    for (const [rawParam, v] of params) {
      const param = String(rawParam);
      if (kindOf(v) === null) {
        warn(file, `${DEFAULTS_KEY}.${step}.${param} must be ${PARAM_VALUE_TEXT}`);
        continue;
      }
      const copy = Array.isArray(v) ? [...(v as string[])] : (v as ParamValue);
      kept.set(param, copy);
      (into[step] as Config)[param] = Array.isArray(copy) ? [...copy] : copy;
    }
  }
}

/** Applies one layer's map onto `into`, warning about every unknown key, invalid value or wrong shape in document order. */
function apply(
  file: string,
  schema: Schema,
  layer: Map<unknown, unknown>,
  into: Config,
  prefix: string,
  warn: Warn,
  defaults: DefaultsLayer,
): void {
  for (const [rawKey, value] of layer) {
    const key = String(rawKey);
    const dotted = prefix === "" ? key : `${prefix}.${key}`;
    const node = Object.hasOwn(schema, key) ? schema[key] : undefined;
    if (node === undefined) {
      if (prefix !== "standards") warn(file, `unknown key ${dotted}`);
      else if (FIXED_KEYS.has(key)) warn(file, `${dotted} cannot be switched`);
      else warn(file, `${dotted} has no standard file`);
    } else if (isLeaf(node)) {
      if (valid(node.rule, value)) into[key] = Array.isArray(value) ? [...(value as string[])] : (value as boolean | number | string);
      else warn(file, `${dotted} must be ${RULE_TEXT[node.rule]}`);
    } else if (value instanceof Map) {
      if (dotted === DEFAULTS_KEY) applyDefaults(file, value, into[key] as Config, defaults, warn);
      else apply(file, node, value, into[key] as Config, dotted, warn, defaults);
    } else {
      warn(file, `${dotted} must be a map`);
    }
  }
}

/** The hint an invalid step file gets when the failing line holds a `${…}` reference. */
const QUOTE_HINT = '; quote ${…} references, for example model: "${model}"';

/** The parsed root of `<home>/<file>`, or an error line when it cannot be read or is not valid YAML. */
export function load(home: string, file: string): { root: unknown } | { error: string } {
  const parsed = parseFile(home, file);
  return "reason" in parsed ? { error: `theway: ${file}: ${parsed.reason}` } : parsed;
}

/**
 * The parsed root of `<home>/<file>`, or why it cannot be read or is not valid YAML, the reason of `load`'s error line;
 * with `refs`, the reason of a failing line that holds `${` gets the quoting hint. A path the overlay holds is read
 * from it: its text, or `cannot be read` for `null`.
 */
export function parseFile(home: string, file: string, refs = false, overlay?: Overlay): { root: unknown } | { reason: string } {
  let text: string;
  const path = join(home, file);
  if (overlay?.has(path) === true) {
    const candidate = overlay.get(path);
    if (candidate === null || candidate === undefined) return { reason: "cannot be read" };
    text = candidate;
  } else {
    try {
      text = readFileSync(path, "utf-8");
    } catch {
      return { reason: "cannot be read" };
    }
  }
  try {
    return { root: parse(text, { mapAsMap: true, logLevel: "error" }) };
  } catch (e) {
    const first = (e instanceof Error ? e.message : String(e)).split("\n")[0] ?? "";
    const line = (e as { linePos?: { line: number }[] }).linePos?.[0]?.line;
    const failing = line === undefined ? "" : (text.split("\n")[line - 1] ?? "");
    const hint = refs && failing.includes("${") ? QUOTE_HINT : "";
    return { reason: `invalid YAML: ${first.replace(/:$/, "")}${hint}` };
  }
}

/**
 * A project's effective config, its standards before any phase filter, and the valid `workflow.defaults` of each
 * config file, global first: the resolver checks each param against its step and falls back to the next file.
 */
export type Loaded = { config: Config; standards: Standard[]; defaults: DefaultsLayer[] };

/** A project's effective config and standards, or the error line that stops it. */
export type Effective = Loaded | { error: string };

/**
 * The effective config of a project: per key, the project file's valid value, else the global file's valid value,
 * else the default. A missing global file counts as an empty layer; every warning goes to `warn`.
 */
export function effectiveConfig(home: string, key: string, warn: Warn): Effective {
  const files: string[] = [];
  const own = join("projects", key, "config.yaml");
  if (isFile(join(home, "config.yaml"))) files.push("config.yaml");
  if (isFile(join(home, own))) files.push(own);

  const roots: [string, unknown][] = [];
  for (const file of files) {
    const loaded = load(home, file);
    if ("error" in loaded) return { error: loaded.error };
    roots.push([file, loaded.root]);
  }

  const standards = standardsOf(home, key);
  const schema = Object.assign(dict<Schema>(), SCHEMA, { standards: standardsSchema(standards) });
  const config = defaults(schema);
  const layers: DefaultsLayer[] = [];
  for (const [file, root] of roots) {
    const layer: DefaultsLayer = { file, steps: new Map() };
    layers.push(layer);
    if (root === null) continue;
    if (root instanceof Map) apply(file, schema, root, config, "", warn, layer);
    else warn(file, "not a map");
  }
  return { config, standards, defaults: layers };
}

/** Whether a standard is on in an effective config; a key with no switch is always on. */
export function enabled(config: Config, key: string): boolean {
  const all = config.standards as Config;
  return !Object.hasOwn(all, key) || (all[key] as Config).enabled === true;
}

/**
 * A project's effective config as `theway config` loads it, its warnings sent to `warn`; or the line that stops it (a
 * missing global `config.yaml`, an unreadable or invalid file).
 */
export function loadConfigResult(home: string, key: string, warn: Warn): Effective {
  if (!isFile(join(home, "config.yaml"))) {
    return { error: `theway: config.yaml not found in ${home}; run npx --yes @pixelfactoryio/theway@latest install, then /reload-plugins` };
  }
  return effectiveConfig(home, key, warn);
}

/**
 * A project's effective config as `theway config` loads it, its warnings on stderr; `null` once the line that stops it
 * (a missing global `config.yaml`, an unreadable or invalid file) is written.
 */
export function loadConfig(home: string, key: string): Loaded | null {
  const result = loadConfigResult(home, key, warnLoud);
  if ("error" in result) {
    process.stderr.write(`${result.error}\n`);
    return null;
  }
  return result;
}

/** `theway config [--project <key>]`: the effective config of the project, as YAML on stdout. */
export function cmdConfig(override: string | undefined): number {
  const key = resolveKey(override);
  if (key === null) return 1;
  const home = thewayHome();
  const loaded = loadConfig(home, key);
  if (loaded === null) return 1;
  // A defaults entry naming no step is ignored, so it is not printed as part of the effective config.
  const defaults = (loaded.config.workflow as Config).defaults as Config;
  for (const step of warnUnknownDefaults(home, key, loaded, warnLoud)) delete defaults[step];
  process.stdout.write(stringify(loaded.config));
  return 0;
}
