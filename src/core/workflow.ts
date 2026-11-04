import { readdirSync } from "node:fs";
import { basename, join, relative } from "node:path";
import {
  CONVENTIONS,
  type DefaultsLayer,
  kindOf,
  type Loaded,
  load,
  loadConfig,
  NAME,
  PARAM_VALUE_TEXT,
  type ParamValue,
  warnLoud,
} from "./config";
import { isFile, thewayHome } from "./io";
import { projectDir as projectOf, resolveKey } from "./project";
import { dirsOf, fileOf, knownSteps, namesIn, searched, suggest, warnUnknownDefaults } from "./step-files";

const WORKFLOW_VERSION = "theway.workflow/v1";
const STEP_VERSION = "theway.step/v1";

const TYPES = ["work", "findings", "verdicts", "resolutions", "pr", "ci", "diagnosis"] as const;
type ResultType = (typeof TYPES)[number];
const CONDITIONS = ["findings", "no-findings", "confirmed", "no-confirmed", "green", "red", "fixable", "more"] as const;
type Condition = (typeof CONDITIONS)[number];
const ACCESS = ["read", "commit", "push"] as const;
type Access = (typeof ACCESS)[number];
const MODELS = ["opus", "sonnet", "haiku"];
const CONSTRUCTS = ["agent", "foreach", "loop", "when"] as const;

/** The type whose agent sets each condition; `more` is set by the loop. */
const PRODUCER: Record<Exclude<Condition, "more">, ResultType> = {
  findings: "findings",
  "no-findings": "findings",
  confirmed: "verdicts",
  "no-confirmed": "verdicts",
  green: "ci",
  red: "ci",
  fixable: "diagnosis",
};
/** The types an agent of each type reads from the scope, in the order their absence is reported. */
const READS: Partial<Record<ResultType, ResultType[]>> = {
  verdicts: ["findings"],
  resolutions: ["verdicts", "work"],
  diagnosis: ["ci"],
};

const FIELDS = {
  agent: ["prompt", "returns", "model", "access"],
  foreach: ["parallel", "do"],
  loop: ["max", "until", "exhausted", "do"],
  when: ["do", "fail"],
};

const RULE = {
  returns: `one of ${TYPES.join(", ")}`,
  condition: `one of ${CONDITIONS.join(", ")}`,
  access: "read, commit or push",
  exhausted: "continue or fail",
  model: "one of opus, sonnet, haiku",
  positive: "a positive integer",
  bool: "true or false",
  fail: "true",
  names: "a non-empty list of names",
  prompt: "a name or a non-empty list of names",
  nonEmpty: "a non-empty string",
  nodes: "a non-empty list",
};

/** A param name: snake_case. */
const PARAM = /^[a-z][a-z0-9_]*$/;
const RESERVED = ["agents", "item"];
/** A whole-value reference, `${name}`. */
const REF = /^\$\{([^}]*)\}$/;

/** Stops the resolution with one error line. */
class Fail {
  constructor(readonly line: string) {}
}

/** The text a value of each kind is named by in a kind error. */
const KIND_TEXT: Record<string, string> = {
  string: "a string",
  integer: "an integer",
  boolean: "true or false",
  list: "a non-empty list of names without duplicates",
};

type ParamDef = { default: ParamValue; description: string };

/** A step file read up to its params: its tree is checked per entry, with the entry's params. */
type StepFile = {
  name: string;
  path: string;
  rel: string;
  description: string;
  params: Map<string, ParamDef>;
  root: Map<unknown, unknown>;
};

/** A param's effective value, the origin `theway workflow` prints and the origin an error names. */
type Effective = { value: ParamValue; from: string; origin: string };

type AgentOut = { name: string; label: string; prompt: string[]; returns: ResultType; access: Access; model?: string };
type Out =
  | { agent: AgentOut }
  | { parallel: { agent: AgentOut }[] }
  | { loop: { max: number; until: Condition[]; exhausted: string; do: Out[] } }
  | { when: Condition[]; do: Out[] }
  | { when: Condition[]; fail: true };

type StepEntry = {
  id: string;
  step: string;
  agents: boolean;
  file: string;
  description: string;
  params: Record<string, { value: ParamValue; from: string }>;
  do: Out[];
};
type GateEntry = { id: string; gate: string; agents: false };
type Entry = StepEntry | GateEntry;
type Workflow = { name: string; file: string; steps: Entry[] };

/** The home, the project key, the loaded config and a warning sink that writes each line once. */
type Dirs = { home: string; key: string; loaded: Loaded; warn: (file: string, text: string) => void };

const rel = (d: Dirs, path: string) => relative(d.home, path);

/** Whether `v` is a map: a YAML map parsed with `mapAsMap`. */
const isMap = (v: unknown): v is Map<unknown, unknown> => v instanceof Map;

// ---- Step files ----

/** Reads a step file's version, description and params, and that its `do` is a non-empty list. */
function readStep(d: Dirs, name: string, path: string, full: boolean): StepFile {
  const file = rel(d, path);
  const fail = (reason: string): never => {
    throw new Fail(`theway: ${file}: ${reason}`);
  };
  const loaded = load(d.home, file, true);
  if ("error" in loaded) throw new Fail(loaded.error);
  const root = loaded.root;
  if (!isMap(root)) return fail("not a map");
  if (!root.has("version")) fail(`version is required (${STEP_VERSION})`);
  if (root.get("version") !== STEP_VERSION) fail(`version must be ${STEP_VERSION}`);
  if (full) {
    for (const k of root.keys()) {
      if (!["version", "description", "params", "do"].includes(k as string)) fail(`unknown key ${String(k)}`);
    }
  }
  const params = new Map<string, ParamDef>();
  for (const k of root.keys()) {
    if (k === "description") {
      const v = root.get(k);
      if (typeof v !== "string" || v.trim() === "") fail("description must be a non-empty string");
      if ((v as string).includes("${")) fail("description does not take a reference");
    } else if (k === "params") {
      const v = root.get(k);
      if (!isMap(v)) return fail("params must be a map");
      for (const [rawP, def] of v) {
        const p = String(rawP);
        if (RESERVED.includes(p)) fail(`params.${p}: agents and item are reserved`);
        if (!PARAM.test(p)) fail(`params.${p} must be a param name (lowercase letters, digits and _, starting with a letter)`);
        if (!isMap(def) || def.size !== 2 || !def.has("default") || !def.has("description")) fail(`params.${p} must be {default, description}`);
        const dv = (def as Map<unknown, unknown>).get("default");
        const desc = (def as Map<unknown, unknown>).get("description");
        if (kindOf(dv) === null) fail(`params.${p}.default must be ${PARAM_VALUE_TEXT}`);
        if (typeof dv === "string" && dv.includes("${")) fail(`params.${p}.default does not take a reference`);
        if (typeof desc !== "string" || desc.trim() === "") fail(`params.${p}.description must be a non-empty string`);
        params.set(p, { default: dv as ParamValue, description: desc as string });
      }
    } else if (k === "do" && full) {
      const v = root.get(k);
      if (!Array.isArray(v) || v.length === 0) fail("do must be a non-empty list");
    }
  }
  if (!root.has("description")) fail("description must be a non-empty string");
  if (full && !root.has("do")) fail("do must be a non-empty list");
  return { name, path, rel: file, description: root.get("description") as string, params, root };
}

/** The params a step's agents take their model from: `model` when declared, and every param an agent `model` references. */
function modelParams(step: StepFile): Set<string> {
  const out = new Set<string>();
  if (step.params.has("model")) out.add("model");
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (isMap(v)) {
      const agent = v.get("agent");
      if (isMap(agent)) {
        const m = REF.exec(String(agent.get("model") ?? ""));
        if (m !== null && step.params.has(m[1] as string)) out.add(m[1] as string);
      }
      for (const child of v.values()) walk(child);
    }
  };
  walk(step.root.get("do"));
  return out;
}

/** The unknown-name suffix of a param of `step`: a suggestion, the valid set, or that the step declares none. */
function paramSuffix(step: StepFile, wanted: string): string {
  const known = [...step.params.keys()];
  if (known.length === 0) return `; ${step.name} declares no params`;
  return suggest(wanted, known, "params");
}

/**
 * The effective value of each param of `step`, in declaration order: the workflow entry's, else the project
 * `workflow.defaults`, else the global one, else the step file's default. Invalid config values are warned about and
 * dropped; with `inline`, the params that set a model take the step file's default.
 */
function effectiveParams(d: Dirs, step: StepFile, given: Map<string, ParamValue>, entryOrigin: string, inline: boolean): Map<string, Effective> {
  const models = inline ? modelParams(step) : new Set<string>();
  const valid: Map<string, { value: ParamValue; file: string }>[] = [];
  for (const layer of d.loaded.defaults as DefaultsLayer[]) {
    const values = new Map<string, { value: ParamValue; file: string }>();
    valid.push(values);
    for (const [p, v] of layer.steps.get(step.name) ?? []) {
      const def = step.params.get(p);
      if (def === undefined) {
        d.warn(layer.file, `workflow.defaults.${step.name}.${p} is not a param of ${step.name}${paramSuffix(step, p)}`);
      } else if (!models.has(p)) {
        const kind = kindOf(def.default) as string;
        if (kindOf(v) !== kind) d.warn(layer.file, `workflow.defaults.${step.name}.${p} must be ${KIND_TEXT[kind]}`);
        else values.set(p, { value: v, file: layer.file });
      }
    }
  }
  const out = new Map<string, Effective>();
  for (const [p, def] of step.params) {
    if (given.has(p)) {
      out.set(p, { value: given.get(p) as ParamValue, from: entryOrigin, origin: entryOrigin });
      continue;
    }
    const layer = [...valid].reverse().find((l) => l.has(p));
    if (layer !== undefined) {
      const { value, file } = layer.get(p) as { value: ParamValue; file: string };
      out.set(p, { value, from: file, origin: file });
    } else {
      out.set(p, { value: def.default, from: step.rel, origin: `params.${p}` });
    }
  }
  return out;
}

// ---- The tree ----

/** Where the producer check stands: the types set before the current node, outside and inside the current loop. */
type Producers = {
  outer: Set<ResultType>;
  /** The types each ended loop set, by loop path, for the "set only inside the loop" error. */
  ended: { path: string; types: Set<ResultType> }[];
};

type Ctx = {
  d: Dirs;
  step: StepFile;
  params: Map<string, Effective>;
  inline: boolean;
  item?: { value: string; origin?: string };
  inForeach: boolean;
  loop?: { path: string; types: Set<ResultType>; unguarded: { path: string; conds: Condition[] }[] };
  /** The conditions of the `when` nodes around the node, inside the current loop. */
  conds: Condition[];
  producers: Producers;
};

/** Fails with `<reason>`, plus ` (value from <origin>)` when the value came from a substitution. */
function fail(ctx: Ctx, reason: string, origin?: string): never {
  throw new Fail(`theway: ${ctx.step.rel}: ${reason}${origin === undefined ? "" : ` (value from ${origin})`}`);
}

/** The types visible at the current node: the current loop's inside a loop, else the step's. */
const visible = (ctx: Ctx) => (ctx.loop === undefined ? ctx.producers.outer : ctx.loop.types);

/** Records an agent's type as set for the nodes after it. */
function produced(ctx: Ctx, type: ResultType): void {
  visible(ctx).add(type);
}

/** Fails unless a `<type>` agent is visible: `what` is the condition or `returns <type>` that needs it. */
function needs(ctx: Ctx, path: string, what: string, type: ResultType, loopMessage: boolean): void {
  if (visible(ctx).has(type)) return;
  if (loopMessage && ctx.loop === undefined) {
    const loop = ctx.producers.ended.find((l) => l.types.has(type));
    if (loop !== undefined) fail(ctx, `${path}: ${what} is set only inside the loop at ${loop.path}; use exhausted: fail`);
  }
  fail(ctx, `${path}: ${what} needs an earlier ${type} agent in this step`);
}

/** Fails when a field that takes no reference holds `${`, in its value or a list element. */
function noRef(ctx: Ctx, path: string, v: unknown): void {
  const has = (x: unknown) => typeof x === "string" && x.includes("${");
  if (has(v) || (Array.isArray(v) && v.some(has))) fail(ctx, `${path} does not take a reference`);
}

/** A field value with its `${…}` references substituted, and the origin of a substituted value. */
function subst(ctx: Ctx, path: string, v: unknown): { value: unknown; origin?: string } {
  if (typeof v !== "string" || !v.includes("${")) return { value: v };
  const m = REF.exec(v);
  if (m === null) fail(ctx, `${path}: \${…} must be the whole value; there is no string templating`);
  const name = (m as RegExpExecArray)[1] as string;
  if (name === "item") {
    if (ctx.item === undefined) fail(ctx, `${path}: \${item} outside foreach`);
    return { value: ctx.item?.value, origin: ctx.item?.origin };
  }
  const p = ctx.params.get(name);
  if (p === undefined) fail(ctx, `${path}: \${${name}} is not a param of ${ctx.step.name}${paramSuffix(ctx.step, name)}`);
  return { value: Array.isArray(p?.value) ? [...(p?.value as string[])] : p?.value, origin: p?.origin };
}

/** The conditions of a `when` or `until` value, checked: a condition or a non-empty list of them. */
function conditions(ctx: Ctx, path: string, v: unknown): Condition[] {
  noRef(ctx, path, v);
  const list = Array.isArray(v) ? v : [v];
  if (list.length === 0 || !list.every((c) => (CONDITIONS as readonly unknown[]).includes(c))) fail(ctx, `${path} must be ${RULE.condition}`);
  return list as Condition[];
}

/** The nodes of a `do` list, expanded: a sequential `foreach` is replaced by its copies in place. */
function nodes(ctx: Ctx, path: string, v: unknown): Out[] {
  if (!Array.isArray(v) || v.length === 0) fail(ctx, `${path} must be ${RULE.nodes}`);
  return (v as unknown[]).flatMap((n, i) => node(ctx, `${path}[${i}]`, n));
}

/** The fields of a construct written next to its key (`foreach`, `when`): every other key of the node is an error. */
function siblings(ctx: Ctx, path: string, raw: Map<unknown, unknown>, construct: "foreach" | "when"): void {
  for (const k of raw.keys()) {
    if (k !== construct && !FIELDS[construct].includes(k as string)) {
      fail(ctx, `${path}.${construct}.${String(k)} is not a field of ${construct} (fields: ${FIELDS[construct].join(", ")})`);
    }
  }
}

/** The value map of a construct written as `<construct>: {fields}` (`agent`, `loop`), with no field next to it. */
function fieldMap(ctx: Ctx, path: string, raw: Map<unknown, unknown>, construct: "agent" | "loop"): Map<unknown, unknown> {
  for (const k of raw.keys()) {
    if (k !== construct) fail(ctx, `${path}.${String(k)} is not a field of ${construct} (fields: ${FIELDS[construct].join(", ")})`);
  }
  const v = raw.get(construct);
  if (v === null) return new Map();
  if (!isMap(v)) fail(ctx, `${path}.${construct} must be a map`);
  const map = v as Map<unknown, unknown>;
  for (const k of map.keys()) {
    if (!FIELDS[construct].includes(k as string)) {
      fail(ctx, `${path}.${construct}.${String(k)} is not a field of ${construct} (fields: ${FIELDS[construct].join(", ")})`);
    }
  }
  return map;
}

function node(ctx: Ctx, path: string, raw: unknown): Out[] {
  const exactly = `${path} must have exactly one of ${CONSTRUCTS.join(", ")}`;
  if (!isMap(raw)) fail(ctx, exactly);
  const map = raw as Map<unknown, unknown>;
  if (map.has("gate")) fail(ctx, `${path}: gate is a workflow entry; a step cannot ask the user`);
  if (map.has("parallel") && !map.has("foreach")) fail(ctx, `${path}: parallel is output only; write foreach: … with parallel: true`);
  const found = CONSTRUCTS.filter((c) => map.has(c));
  if (found.length !== 1) fail(ctx, exactly);
  switch (found[0]) {
    case "agent":
      return [{ agent: agent(ctx, `${path}.agent`, fieldMap(ctx, path, map, "agent")) }];
    case "foreach":
      return foreach(ctx, `${path}.foreach`, map);
    case "loop":
      return [loop(ctx, `${path}.loop`, fieldMap(ctx, path, map, "loop"))];
    default:
      return [when(ctx, `${path}.when`, map)];
  }
}

function agent(ctx: Ctx, path: string, map: Map<unknown, unknown>): AgentOut {
  let prompt: { names: string[]; origin?: string } = { names: [ctx.step.name] };
  let returns: ResultType | undefined;
  let model: { value: string; origin?: string } | undefined;
  let access: Access | undefined;
  for (const [k, v] of map) {
    const at = `${path}.${String(k)}`;
    if (k === "prompt") {
      let origin: string | undefined;
      let value: unknown;
      if (Array.isArray(v)) {
        value = v.map((x, i) => {
          const s = subst(ctx, `${at}[${i}]`, x);
          origin ??= s.origin;
          return s.value;
        });
      } else {
        const s = subst(ctx, at, v);
        value = s.value;
        origin = s.origin;
      }
      const list = Array.isArray(value) ? value : [value];
      if (list.length === 0 || !list.every((n) => typeof n === "string" && NAME.test(n))) fail(ctx, `${at} must be ${RULE.prompt}`, origin);
      prompt = { names: list as string[], origin };
    } else if (k === "returns") {
      noRef(ctx, at, v);
      if (!(TYPES as readonly unknown[]).includes(v)) fail(ctx, `${at} must be ${RULE.returns}`);
      returns = v as ResultType;
    } else if (k === "model") {
      const s = subst(ctx, at, v);
      if (!MODELS.includes(s.value as string)) fail(ctx, `${at} must be ${RULE.model}`, s.origin);
      model = { value: s.value as string, origin: s.origin };
    } else {
      noRef(ctx, at, v);
      if (!(ACCESS as readonly unknown[]).includes(v)) fail(ctx, `${at} must be ${RULE.access}`);
      access = v as Access;
    }
  }
  if (returns === undefined) return fail(ctx, `${path}.returns is required (${RULE.returns})`);
  const own = ctx.item?.origin;
  access ??= returns === "work" ? "commit" : returns === "pr" ? "push" : "read";
  if (returns === "work" && access === "read") fail(ctx, `${path}.access must be commit or push for returns: work`, own);
  if (returns === "pr" && access !== "push") fail(ctx, `${path}.access must be push for returns: pr`, own);
  const paths: string[] = [];
  for (const n of prompt.names) {
    const p = fileOf(ctx.d.home, ctx.d.key, "prompts", n);
    if (p === null) fail(ctx, `${path}.prompt: prompt '${n}' has no file in ${searched(ctx.d.home, ctx.d.key, "prompts")}`, prompt.origin ?? own);
    paths.push(p as string);
  }
  for (const type of READS[returns] ?? []) needs(ctx, path, `returns ${returns}`, type, false);
  if (returns === "work" && ctx.loop !== undefined && !ctx.conds.includes("more")) {
    ctx.loop.unguarded.push({ path, conds: ctx.conds });
  }
  produced(ctx, returns);
  const out: AgentOut = { name: prompt.names[prompt.names.length - 1] as string, label: "", prompt: paths, returns, access };
  if (!ctx.inline) {
    const fallback = ctx.params.get("model");
    if (model === undefined && fallback !== undefined && !MODELS.includes(fallback.value as string)) {
      fail(ctx, `${path}.model must be ${RULE.model}`, fallback.origin);
    }
    out.model = model?.value ?? (fallback === undefined ? "sonnet" : (fallback.value as string));
  }
  return out;
}

function foreach(ctx: Ctx, path: string, map: Map<unknown, unknown>): Out[] {
  siblings(ctx, path.slice(0, -".foreach".length), map, "foreach");
  if (ctx.inForeach) fail(ctx, `${path}: no foreach inside a foreach`);
  const s = subst(ctx, path, map.get("foreach"));
  if (!Array.isArray(s.value) || s.value.length === 0 || !s.value.every((n) => typeof n === "string" && NAME.test(n))) {
    fail(ctx, `${path} must be ${RULE.names}`, s.origin);
  }
  const items = s.value as string[];
  let parallel = false;
  if (map.has("parallel")) {
    const v = map.get("parallel");
    noRef(ctx, `${path}.parallel`, v);
    if (typeof v !== "boolean") fail(ctx, `${path}.parallel must be ${RULE.bool}`);
    parallel = v as boolean;
  }
  if (!map.has("do")) fail(ctx, `${path}.do is required (${RULE.nodes})`);
  const group: Set<ResultType> = new Set();
  const copies: Out[] = [];
  for (const item of items) {
    const before = new Set(visible(ctx));
    const inner: Ctx = { ...ctx, item: { value: item, origin: s.origin }, inForeach: true };
    const out = nodes(inner, `${path}[item=${item}].do`, map.get("do"));
    if (parallel) {
      if (!out.every((n) => "agent" in n && n.agent.access === "read")) fail(ctx, `${path}: a parallel foreach may hold only agents with access: read`, s.origin);
      // The agents of one parallel group run together: none sees another's result.
      for (const t of visible(ctx)) if (!before.has(t)) group.add(t);
      visible(ctx).clear();
      for (const t of before) visible(ctx).add(t);
    }
    copies.push(...out);
  }
  if (!parallel) return copies;
  for (const t of group) produced(ctx, t);
  return copies.length === 0 ? [] : [{ parallel: copies as { agent: AgentOut }[] }];
}

function loop(ctx: Ctx, path: string, map: Map<unknown, unknown>): Out {
  if (ctx.loop !== undefined) fail(ctx, `${path}: no loop inside a loop`);
  let max: number | undefined;
  let until: Condition[] | undefined;
  let exhausted: string | undefined;
  for (const [k, v] of map) {
    const at = `${path}.${String(k)}`;
    if (k === "max") {
      const s = subst(ctx, at, v);
      if (typeof s.value !== "number" || !Number.isInteger(s.value) || s.value < 1) fail(ctx, `${at} must be ${RULE.positive}`, s.origin);
      max = s.value as number;
    } else if (k === "until") {
      until = conditions(ctx, at, v);
    } else if (k === "exhausted") {
      noRef(ctx, at, v);
      if (v !== "continue" && v !== "fail") fail(ctx, `${at} must be ${RULE.exhausted}`);
      exhausted = v as string;
    }
  }
  if (max === undefined) fail(ctx, `${path}.max is required (${RULE.positive})`);
  if (until === undefined) fail(ctx, `${path}.until is required (${RULE.condition})`);
  if (exhausted === undefined) fail(ctx, `${path}.exhausted is required (${RULE.exhausted}); say what happens when the loop ends without until`);
  if (!map.has("do")) fail(ctx, `${path}.do is required (${RULE.nodes})`);
  const inner: Ctx = { ...ctx, loop: { path, types: new Set(), unguarded: [] }, conds: [] };
  const body = nodes(inner, `${path}.do`, map.get("do"));
  const types = inner.loop?.types as Set<ResultType>;
  for (const c of until as Condition[]) {
    if (c !== "more" && !types.has(PRODUCER[c])) fail(ctx, `${path}.until: ${c} needs an earlier ${PRODUCER[c]} agent in this step`);
  }
  if (exhausted === "fail") {
    for (const u of inner.loop?.unguarded ?? []) {
      const conds = u.conds.length > 0 ? u.conds.join(", ") : "<condition>";
      ctx.d.warn(
        ctx.step.rel,
        `${path}: exhausted: fail with a work agent not guarded by more; its last fix is never checked (guard it with when: [${conds}, more])`,
      );
    }
  }
  ctx.producers.ended.push({ path, types });
  return { loop: { max: max as number, until: until as Condition[], exhausted: exhausted as string, do: body } };
}

function when(ctx: Ctx, path: string, map: Map<unknown, unknown>): Out {
  siblings(ctx, path.slice(0, -".when".length), map, "when");
  const conds = conditions(ctx, path, map.get("when"));
  for (const c of conds) {
    if (c === "more") {
      if (ctx.loop === undefined) fail(ctx, `${path}: more outside a loop`);
    } else {
      needs(ctx, path, c, PRODUCER[c], true);
    }
  }
  if (map.has("fail")) {
    noRef(ctx, `${path}.fail`, map.get("fail"));
    if (map.get("fail") !== true) fail(ctx, `${path}.fail must be ${RULE.fail}`);
  }
  if (map.has("do") === map.has("fail")) fail(ctx, `${path}: when needs do or fail: true, not both`);
  if (map.has("fail")) return { when: conds, fail: true };
  const inner: Ctx = { ...ctx, conds: ctx.loop === undefined ? [] : [...ctx.conds, ...conds] };
  return { when: conds, do: nodes(inner, `${path}.do`, map.get("do")) };
}

/** Gives each agent its name, `-2`, `-3` for a name repeated in the step in document order, and its label. */
function name(tree: Out[], id: string): void {
  const seen = new Map<string, number>();
  const visit = (n: Out): void => {
    if ("agent" in n) {
      const count = (seen.get(n.agent.name) ?? 0) + 1;
      seen.set(n.agent.name, count);
      if (count > 1) n.agent.name = `${n.agent.name}-${count}`;
      const { name: agentName, ...rest } = n.agent;
      // Field order: name, label, prompt, returns, access, model.
      const ordered: AgentOut = { name: agentName, label: `${id}:${agentName}`, prompt: rest.prompt, returns: rest.returns, access: rest.access };
      if (rest.model !== undefined) ordered.model = rest.model;
      n.agent = ordered;
    } else if ("parallel" in n) n.parallel.forEach(visit);
    else if ("loop" in n) n.loop.do.forEach(visit);
    else if ("do" in n) n.do.forEach(visit);
  };
  tree.forEach(visit);
}

/** A step resolved for one entry: its params substituted, its `foreach` expanded and every agent field filled. */
function resolveStep(d: Dirs, step: StepFile, id: string, agents: boolean, given: Map<string, ParamValue>, entryOrigin: string): StepEntry {
  const params = effectiveParams(d, step, given, entryOrigin, !agents);
  const ctx: Ctx = { d, step, params, inline: !agents, inForeach: false, conds: [], producers: { outer: new Set(), ended: [] } };
  const tree = nodes(ctx, "do", step.root.get("do"));
  name(tree, id);
  const models = agents ? new Set<string>() : modelParams(step);
  const printed: Record<string, { value: ParamValue; from: string }> = {};
  for (const [p, e] of params) if (!models.has(p)) printed[p] = { value: e.value, from: e.from };
  return { id, step: step.name, agents, file: step.path, description: step.description, params: printed, do: tree };
}

// ---- Workflow files ----

/** Whether a resolved step has an agent that pushes. */
function pushes(entry: Entry): boolean {
  if (!("do" in entry)) return false;
  const visit = (n: Out): boolean =>
    "agent" in n
      ? n.agent.access === "push"
      : "parallel" in n
        ? n.parallel.some(visit)
        : "loop" in n
          ? n.loop.do.some(visit)
          : "do" in n && n.do.some(visit);
  return entry.do.some(visit);
}

/** Whether the workflow is one inline entry whose tree is a single `work` agent with `access: commit`. */
function workingTree(steps: Entry[]): boolean {
  if (steps.length !== 1) return false;
  const only = steps[0] as Entry;
  if (!("do" in only) || only.agents || only.do.length !== 1) return false;
  const first = only.do[0] as Out;
  return "agent" in first && first.agent.returns === "work" && first.agent.access === "commit";
}

/** A workflow file, fully validated and resolved, and its `default` value; or the error line. */
function validate(d: Dirs, path: string): { workflow: Workflow; isDefault: boolean } | { error: string } {
  try {
    return validateOrThrow(d, path);
  } catch (e) {
    if (e instanceof Fail) return { error: e.line };
    throw e;
  }
}

function validateOrThrow(d: Dirs, path: string): { workflow: Workflow; isDefault: boolean } {
  const file = rel(d, path);
  const fail = (reason: string): never => {
    throw new Fail(`theway: ${file}: ${reason}`);
  };
  const loaded = load(d.home, file);
  if ("error" in loaded) throw new Fail(loaded.error);
  const root = loaded.root;
  if (!isMap(root)) return fail("not a map");
  if (!root.has("version")) fail(`version is required (${WORKFLOW_VERSION})`);
  if (root.get("version") !== WORKFLOW_VERSION) fail(`version must be ${WORKFLOW_VERSION}`);
  for (const key of root.keys()) {
    if (!["version", "default", "agents", "steps"].includes(key as string)) fail(`unknown key ${String(key)}`);
  }
  const topAgents = typeof root.get("agents") === "boolean" ? (root.get("agents") as boolean) : true;
  const steps: Entry[] = [];
  const pushing: number[] = [];
  const ids = new Map<string, number>();
  const idOf = (base: string) => {
    const n = (ids.get(base) ?? 0) + 1;
    ids.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  };
  const cache = new Map<string, StepFile>();
  for (const key of root.keys()) {
    if (key === "default" && typeof root.get(key) !== "boolean") fail("default must be true or false");
    if (key === "agents" && typeof root.get(key) !== "boolean") fail("agents must be true or false");
    if (key !== "steps") continue;
    const entries: unknown = root.get("steps");
    if (!Array.isArray(entries) || entries.length === 0) fail("steps must be a non-empty list");
    for (const [i, entry] of (entries as unknown[]).entries()) {
      const at = `steps[${i}]`;
      if (!isMap(entry) || entry.size !== 1) fail(`${at} must be a map with one key: a step name or gate`);
      const [k, value] = [...(entry as Map<unknown, unknown>)][0] as [unknown, unknown];
      if (k === "gate") {
        if (typeof value !== "string" || value.trim() === "") fail(`${at}.gate must be a non-empty question`);
        steps.push({ id: idOf("gate"), gate: value as string, agents: false });
        continue;
      }
      const stepName = String(k);
      const stepPath = NAME.test(stepName) ? fileOf(d.home, d.key, "steps", stepName) : null;
      if (stepPath === null) {
        fail(`${at}: no step '${stepName}' in ${searched(d.home, d.key, "steps")}${suggest(stepName, knownSteps(d.home, d.key), "steps")}`);
      }
      if (value !== null && !isMap(value)) fail(`${at}.${stepName} must be a map`);
      const given = (value ?? new Map()) as Map<unknown, unknown>;
      const step = cache.get(stepPath as string) ?? readStep(d, stepName, stepPath as string, true);
      cache.set(stepPath as string, step);
      for (const p of given.keys()) {
        if (p !== "agents" && !step.params.has(p as string)) {
          fail(`${at}.${stepName}.${String(p)} is not a param of ${stepName}${paramSuffix(step, String(p))}`);
        }
      }
      const values = new Map<string, ParamValue>();
      for (const [p, v] of given) {
        if (p === "agents") {
          if (typeof v !== "boolean") fail(`${at}.${stepName}.agents must be true or false`);
          continue;
        }
        const kind = kindOf(step.params.get(p as string)?.default) as string;
        if (kindOf(v) !== kind) fail(`${at}.${stepName}.${String(p)} must be ${KIND_TEXT[kind]}`);
        values.set(p as string, v as ParamValue);
      }
      const agents = given.has("agents") ? (given.get("agents") as boolean) : topAgents;
      if (!agents) {
        const models = modelParams(step);
        for (const p of values.keys()) {
          if (models.has(p)) fail(`${at}.${stepName}.${p} has no effect when the step runs inline (agents: false)`);
        }
      }
      const resolved = resolveStep(d, step, idOf(stepName), agents, values, `${file} ${at}`);
      if (pushes(resolved)) pushing.push(i);
      steps.push(resolved);
    }
  }
  if (!root.has("steps")) fail("steps must be a non-empty list");
  if (pushing.length > 1) fail(`steps[${pushing[1]}]: only one step may push`);
  if (pushing.length === 1 && pushing[0] !== steps.length - 1) fail(`steps[${pushing[0]}]: a pushing step must be the last step`);
  if ("gate" in (steps[steps.length - 1] as Entry)) fail(`steps[${steps.length - 1}]: a gate cannot be the last step`);
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
function defaultOf(d: Dirs, paths: string[]): { workflow: Workflow } | { error: string } | null {
  const marked: Workflow[] = [];
  for (const path of paths) {
    const result = validate(d, path);
    if ("error" in result) return result;
    if (result.isDefault) marked.push(result.workflow);
  }
  if (marked.length > 1) {
    return { error: `theway: ${joinAnd(marked.map((w) => relative(d.home, w.file)))} both set default: true` };
  }
  return marked.length === 1 ? { workflow: marked[0] as Workflow } : null;
}

/** The workflow named `wanted`: the project file, else the global one, validated. */
function byName(d: Dirs, wanted: string): { workflow: Workflow } | { error: string } {
  const path = fileOf(d.home, d.key, "workflows", wanted);
  if (path === null) {
    return { error: `theway: no workflow '${wanted}' in ${searched(d.home, d.key, "workflows")}` };
  }
  return validate(d, path);
}

/** The workflow a run without `<name>` uses: the project's `default: true` file, else the global one, else `develop`. */
function byDefault(d: Dirs): { workflow: Workflow } | { error: string } {
  const [ownDir, globalDir] = dirsOf(d.home, d.key, "workflows");
  const ownNames = scan(d, ownDir);
  const own = defaultOf(
    d,
    ownNames.map((n) => join(ownDir, n)),
  );
  if (own !== null) return own;
  const globalNames = scan(d, globalDir).filter((n) => !ownNames.includes(n));
  const global = defaultOf(
    d,
    globalNames.map((n) => join(globalDir, n)),
  );
  if (global !== null) return global;
  return byName(d, "develop");
}

/** The resolver's context for a project: the loaded config and a warning sink that writes each line once. */
function dirsFor(home: string, key: string): Dirs | null {
  const loaded = loadConfig(home, key);
  if (loaded === null) return null;
  const printed = new Set<string>();
  const warn = (file: string, text: string) => {
    const line = `${file}\u0000${text}`;
    if (printed.has(line)) return;
    printed.add(line);
    warnLoud(file, text);
  };
  const d: Dirs = { home, key, loaded, warn };
  for (const dir of dirsOf(home, key, "steps")) {
    if (isFile(join(dir, "gate.yaml"))) warn(rel(d, join(dir, "gate.yaml")), "gate is reserved for the gate entry");
  }
  warnUnknownDefaults(home, key, loaded, warn);
  return d;
}

/** `theway workflow [<name>] [--project <key>]`: one workflow, resolved, validated and with every field filled, as JSON. */
export function cmdWorkflow(wanted: string | undefined, override: string | undefined): number {
  const key = resolveKey(override);
  if (key === null) return 1;
  if (wanted !== undefined && !NAME.test(wanted)) {
    const shown = wanted.replaceAll("\n", "\\n").replaceAll("\r", "\\r");
    process.stderr.write(`theway: invalid workflow name '${shown}'\n`);
    return 1;
  }
  const home = thewayHome();
  const d = dirsFor(home, key);
  if (d === null) return 1;
  const result = wanted === undefined ? byDefault(d) : byName(d, wanted);
  if ("error" in result) {
    process.stderr.write(`${result.error}\n`);
    return 1;
  }
  const conventions: string[] = [];
  for (const file of CONVENTIONS) {
    const global = join(home, "standards", file);
    if (!isFile(global)) {
      process.stderr.write(`theway: ${global} not found; run npx --yes @pixelfactoryio/theway@latest install, then /reload-plugins\n`);
      return 1;
    }
    const own = join(projectOf(home, key), "standards", file);
    conventions.push(isFile(own) ? own : global);
  }
  const { name: workflowName, file, steps } = result.workflow;
  const doc = {
    name: workflowName,
    file,
    commits: conventions[0],
    git_host: conventions[1],
    pushes: steps.some(pushes),
    working_tree: workingTree(steps),
    steps,
  };
  process.stdout.write(`${JSON.stringify(doc, null, 2)}\n`);
  return 0;
}

/** A param value as `theway steps` prints it: a list as its names joined with `,`. */
const shown = (v: ParamValue) => (Array.isArray(v) ? v.join(",") : String(v));

/**
 * `theway steps [<name>] [--project <key>]`: without a name, every step with its origin, description and params'
 * effective values; with one, that step validated and resolved as the step object of `theway workflow`.
 */
export function cmdSteps(wanted: string | undefined, override: string | undefined): number {
  const key = resolveKey(override);
  if (key === null) return 1;
  if (wanted !== undefined && !NAME.test(wanted)) {
    const text = wanted.replaceAll("\n", "\\n").replaceAll("\r", "\\r");
    process.stderr.write(`theway: invalid step name '${text}'\n`);
    return 1;
  }
  const home = thewayHome();
  const d = dirsFor(home, key);
  if (d === null) return 1;
  if (wanted !== undefined) {
    const path = wanted === "gate" ? null : fileOf(home, key, "steps", wanted);
    if (path === null) {
      process.stderr.write(`theway: no step '${wanted}' in ${searched(home, key, "steps")}${suggest(wanted, knownSteps(home, key), "steps")}\n`);
      return 1;
    }
    try {
      const step = readStep(d, wanted, path, true);
      const resolved = resolveStep(d, step, wanted, true, new Map(), "");
      process.stdout.write(`${JSON.stringify(resolved, null, 2)}\n`);
      return 0;
    } catch (e) {
      if (!(e instanceof Fail)) throw e;
      process.stderr.write(`${e.line}\n`);
      return 1;
    }
  }
  const [ownDir, globalDir] = dirsOf(home, key, "steps");
  const own = namesIn(ownDir, "steps").filter((n) => n !== "gate");
  const found = [
    ...own.map((n) => ({ n, origin: "project", path: join(ownDir, `${n}.yaml`) })),
    ...namesIn(globalDir, "steps")
      .filter((n) => n !== "gate" && !own.includes(n))
      .map((n) => ({ n, origin: "global", path: join(globalDir, `${n}.yaml`) })),
  ].sort((a, b) => (a.n < b.n ? -1 : a.n > b.n ? 1 : 0));
  const lines: string[] = [];
  for (const { n, origin, path } of found) {
    let step: StepFile;
    try {
      step = readStep(d, n, path, false);
    } catch (e) {
      if (!(e instanceof Fail)) throw e;
      const prefix = `theway: ${rel(d, path)}: `;
      d.warn(rel(d, path), e.line.startsWith(prefix) ? e.line.slice(prefix.length) : e.line);
      continue;
    }
    lines.push(`${n}  ${origin}  ${step.description}`);
    for (const [p, e] of effectiveParams(d, step, new Map(), "", false)) {
      lines.push(`    ${p}=${shown(e.value)}  ${(step.params.get(p) as ParamDef).description}`);
    }
  }
  process.stdout.write(lines.map((l) => `${l}\n`).join(""));
  return 0;
}
