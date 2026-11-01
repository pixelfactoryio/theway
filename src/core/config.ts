import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { readManifest } from "./init";
import { isFile, thewayHome } from "./io";
import { invalidSegments } from "./path";

/** A leaf's type: the rule its value must follow. */
type Rule = "boolean" | "non-negative" | "positive" | "model";
type Leaf = { rule: Rule; default: boolean | number | string };
type Schema = { [key: string]: Leaf | Schema };

const bool = (d: boolean): Leaf => ({ rule: "boolean", default: d });
const model = (d: "opus" | "sonnet"): Leaf => ({ rule: "model", default: d });

/** The shipped opt-in standards of `<home>/standards/`, in output order: off unless their switch is on. */
export const OPT_IN = ["core-principles.md", "sre.md", "web-development.md", "quality.md"];
/** The shipped standards of `<home>/standards/` the commands always read by path: never listed nor switchable. */
const CORE = ["interaction.md", "develop.md", "tamm-framework.md"];

/** Project names whose folder under the home holds theway's own files, or the folder the old layout kept its standards in. */
const SHARED = new Set(["data", "templates", "standards"]);

/** The `standards.<key>` of a standard file: its stem with `-` turned into `_`. */
const keyOf = (name: string): string => name.slice(0, -".md".length).replaceAll("-", "_");
const OPT_IN_KEYS = OPT_IN.map(keyOf);
const CORE_KEYS = new Set(CORE.map(keyOf));

/** A standard a project can read: its path, its switch and whether it is a shipped opt-in one. */
export type Standard = { path: string; key: string; optIn: boolean };

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
 * A global file is classified by name: a core name is left out, an opt-in name is an opt-in standard, any other name
 * `.shipped.json` lists as `standards/<name>` and any `*.default.md` is left out, the rest are user standards. A project
 * file is a user standard and replaces a global file with the same name. The shared projects read no project folder.
 */
export function standardsOf(home: string, project: string): Standard[] {
  const globalDir = join(home, "standards");
  const projectDir = join(home, project, "standards");
  const projectNames = SHARED.has(project) ? [] : mdFiles(projectDir);
  const shipped = readManifest(home) ?? {};
  const out: Standard[] = [];
  for (const name of mdFiles(globalDir)) {
    if (CORE.includes(name) || projectNames.includes(name)) continue;
    const optIn = OPT_IN.includes(name);
    if (!optIn && (`standards/${name}` in shipped || name.endsWith(".default.md"))) continue;
    out.push({ path: join(globalDir, name), key: keyOf(name), optIn });
  }
  for (const name of projectNames) out.push({ path: join(projectDir, name), key: keyOf(name), optIn: false });
  return out;
}

/**
 * The `standards` section of the schema for a project: the four opt-in keys in order, then the user keys sorted.
 * A key defaults to `true` when only user standards hold it, `false` otherwise (an opt-in key with no file included).
 * A core key is never switchable, even when a project file holds it.
 */
function standardsSchema(standards: Standard[]): Schema {
  const userKeys = [...new Set(standards.map((s) => s.key))]
    .filter((k) => !OPT_IN_KEYS.includes(k) && !CORE_KEYS.has(k))
    .sort();
  const schema: Schema = {};
  for (const key of [...OPT_IN_KEYS, ...userKeys]) {
    const holders = standards.filter((s) => s.key === key);
    schema[key] = { enabled: bool(holders.length > 0 && holders.every((s) => !s.optIn)) };
  }
  return schema;
}

/** Every key of the config, in output order, with its type and default; `standards` is filled per project. */
const SCHEMA: Schema = {
  standards: {},
  engineering: {
    review_rounds: { rule: "non-negative", default: 1 },
    models: { critic: model("opus") },
  },
  workflow: {
    review_rounds: { rule: "non-negative", default: 1 },
    ci_attempts: { rule: "positive", default: 2 },
    open_pr: bool(true),
    models: { implementer: model("opus"), reviewer: model("opus"), fix: model("opus"), ci: model("sonnet") },
  },
};

const RULE_TEXT: Record<Rule, string> = {
  boolean: "true or false",
  "non-negative": "a non-negative integer",
  positive: "a positive integer",
  model: "opus or sonnet",
};

const isLeaf = (node: Leaf | Schema): node is Leaf => typeof (node as Leaf).rule === "string";

function valid(rule: Rule, v: unknown): boolean {
  switch (rule) {
    case "boolean":
      return typeof v === "boolean";
    case "non-negative":
      return typeof v === "number" && Number.isInteger(v) && v >= 0;
    case "positive":
      return typeof v === "number" && Number.isInteger(v) && v >= 1;
    case "model":
      return v === "opus" || v === "sonnet";
  }
}

type Config = { [key: string]: Config | boolean | number | string };

function defaults(schema: Schema): Config {
  const out: Config = {};
  for (const [key, node] of Object.entries(schema)) out[key] = isLeaf(node) ? node.default : defaults(node);
  return out;
}

type Warn = (file: string, text: string) => void;

const warnLoud: Warn = (file, text) => {
  process.stderr.write(`theway: warning: ${file}: ${text}; ignored\n`);
};
const warnQuiet: Warn = () => {};

/** Applies one layer's map onto `into`, warning about every unknown key, invalid value or wrong shape in document order. */
function apply(file: string, schema: Schema, layer: Map<unknown, unknown>, into: Config, prefix: string, warn: Warn): void {
  for (const [rawKey, value] of layer) {
    const key = String(rawKey);
    const dotted = prefix === "" ? key : `${prefix}.${key}`;
    const node = Object.hasOwn(schema, key) ? schema[key] : undefined;
    if (node === undefined) {
      if (prefix !== "standards") warn(file, `unknown key ${dotted}`);
      else if (CORE_KEYS.has(key)) warn(file, `${dotted} cannot be switched`);
      else warn(file, `${dotted} has no standard file`);
    } else if (isLeaf(node)) {
      if (valid(node.rule, value)) into[key] = value as boolean | number | string;
      else warn(file, `${dotted} must be ${RULE_TEXT[node.rule]}`);
    } else if (value instanceof Map) {
      apply(file, node, value, into[key] as Config, dotted, warn);
    } else {
      warn(file, `${dotted} must be a map`);
    }
  }
}

/** The parsed root of `<home>/<file>`, or an error line when it cannot be read or is not valid YAML. */
function load(home: string, file: string): { root: unknown } | { error: string } {
  let text: string;
  try {
    text = readFileSync(join(home, file), "utf-8");
  } catch {
    return { error: `theway: ${file}: cannot be read` };
  }
  try {
    return { root: parse(text, { mapAsMap: true, logLevel: "error" }) };
  } catch (e) {
    const first = (e instanceof Error ? e.message : String(e)).split("\n")[0] ?? "";
    return { error: `theway: ${file}: invalid YAML: ${first.replace(/:$/, "")}` };
  }
}

/** A project's effective config and standards, or the error line that stops it. */
export type Effective = { config: Config; standards: Standard[] } | { error: string };

/**
 * The effective config of a project: per key, the project file's valid value, else the global file's valid value,
 * else the default. A missing global file counts as an empty layer; `loud` prints the warnings.
 */
export function effectiveConfig(home: string, project: string, loud: boolean): Effective {
  const files: string[] = [];
  if (isFile(join(home, "config.yaml"))) files.push("config.yaml");
  if (isFile(join(home, project, "config.yaml"))) files.push(join(project, "config.yaml"));

  const roots: [string, unknown][] = [];
  for (const file of files) {
    const loaded = load(home, file);
    if ("error" in loaded) return { error: loaded.error };
    roots.push([file, loaded.root]);
  }

  const standards = standardsOf(home, project);
  const schema: Schema = { ...SCHEMA, standards: standardsSchema(standards) };
  const warn = loud ? warnLoud : warnQuiet;
  const config = defaults(schema);
  for (const [file, root] of roots) {
    if (root === null) continue;
    if (root instanceof Map) apply(file, schema, root, config, "", warn);
    else warn(file, "not a map");
  }
  return { config, standards };
}

/** Whether a standard is on in an effective config; a core key, which has no switch, is always on. */
export function enabled(config: Config, key: string): boolean {
  const entry = (config.standards as Config)[key];
  return entry === undefined || (entry as Config).enabled === true;
}

/** `theway config <project>`: the effective config of a project, as YAML on stdout. */
export function cmdConfig(project: string): number {
  if (invalidSegments([["project", project]])) return 1;
  const home = thewayHome();
  if (!isFile(join(home, "config.yaml"))) {
    process.stderr.write(`theway: config.yaml not found in ${home}; run /theway:setup\n`);
    return 1;
  }
  const result = effectiveConfig(home, project, true);
  if ("error" in result) {
    process.stderr.write(`${result.error}\n`);
    return 1;
  }
  process.stdout.write(stringify(result.config));
  return 0;
}
