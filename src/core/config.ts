import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { isFile, thewayHome } from "./io";
import { invalidSegments } from "./path";

/** A leaf's type: the rule its value must follow. */
type Rule = "boolean" | "non-negative" | "positive" | "model";
type Leaf = { rule: Rule; default: boolean | number | string };
type Schema = { [key: string]: Leaf | Schema };

const bool = (d: boolean): Leaf => ({ rule: "boolean", default: d });
const model = (d: "opus" | "sonnet"): Leaf => ({ rule: "model", default: d });

/** Every key of the config, in output order, with its type and default. */
const SCHEMA: Schema = {
  standards: {
    core_principles: { enabled: bool(false) },
    sre: { enabled: bool(false) },
    web_development: { enabled: bool(false) },
    quality: { enabled: bool(false) },
  },
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

const warn = (file: string, text: string): void => {
  process.stderr.write(`theway: warning: ${file}: ${text}; ignored\n`);
};

/** Applies one layer's map onto `into`, warning about every unknown key, invalid value or wrong shape in document order. */
function apply(file: string, schema: Schema, layer: Map<unknown, unknown>, into: Config, prefix: string): void {
  for (const [rawKey, value] of layer) {
    const key = String(rawKey);
    const dotted = prefix === "" ? key : `${prefix}.${key}`;
    const node = Object.hasOwn(schema, key) ? schema[key] : undefined;
    if (node === undefined) {
      warn(file, `unknown key ${dotted}`);
    } else if (isLeaf(node)) {
      if (valid(node.rule, value)) into[key] = value as boolean | number | string;
      else warn(file, `${dotted} must be ${RULE_TEXT[node.rule]}`);
    } else if (value instanceof Map) {
      apply(file, node, value, into[key] as Config, dotted);
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

/**
 * `theway config <project>`: the effective config of a project, as YAML on stdout.
 * Per key: the project file's valid value, else the global file's valid value, else the default.
 */
export function cmdConfig(project: string): number {
  if (invalidSegments([["project", project]])) return 1;
  const home = thewayHome();
  if (!isFile(join(home, "config.yaml"))) {
    process.stderr.write(`theway: config.yaml not found in ${home}; run /theway:setup\n`);
    return 1;
  }
  const files = ["config.yaml"];
  if (isFile(join(home, project, "config.yaml"))) files.push(join(project, "config.yaml"));

  const roots: [string, unknown][] = [];
  for (const file of files) {
    const loaded = load(home, file);
    if ("error" in loaded) {
      process.stderr.write(`${loaded.error}\n`);
      return 1;
    }
    roots.push([file, loaded.root]);
  }

  const config = defaults(SCHEMA);
  for (const [file, root] of roots) {
    if (root === null) continue;
    if (root instanceof Map) apply(file, SCHEMA, root, config, "");
    else warn(file, "not a map");
  }
  process.stdout.write(stringify(config));
  return 0;
}
