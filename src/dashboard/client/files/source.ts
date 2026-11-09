/**
 * The workflow and step files as written, from their YAML documents: `${…}` values raw, each node with its YAML path.
 * Pure: no DOM, no React.
 */
import type { Document } from "yaml";

/** A YAML path: map keys and list indices, like `["do", 0, "loop", "do", 1]`. */
export type YamlPath = (string | number)[];

/** A value as written: a scalar's text, or a list's items. */
export type Written = string | string[];

/** An agent: its prompts as written (empty when it writes none), its `returns`, and its `access` and `model` when written. */
export type AgentNode = { kind: "agent"; path: YamlPath; prompts: string[]; returns: string; access: string | null; model: string | null };
/** A `loop`: `max` as written (a number, or a `${param}`). */
export type LoopNode = { kind: "loop"; path: YamlPath; max: string; until: string[]; exhausted: string; children: StepNode[] };
/** A `foreach`, unexpanded: its value as written. */
export type ForeachNode = { kind: "foreach"; path: YamlPath; value: Written; parallel: boolean; children: StepNode[] };
/** A `when` with a `do`. */
export type WhenNode = { kind: "when"; path: YamlPath; conditions: string[]; children: StepNode[] };
/** A `when` with `fail` or `block`; `text` is the block's text, `null` for none. */
export type StopNode = { kind: "stop"; path: YamlPath; conditions: string[]; stop: "fail" | "block"; text: string | null };

/** A node of a step file's `do` tree. */
export type StepNode = AgentNode | LoopNode | ForeachNode | WhenNode | StopNode;

/** A param of a step file: its default as written, `null` when it has none. */
export type ParamNode = { name: string; default: Written | number | boolean | null; description: string | null; path: YamlPath };

/** A step file as written: its description, its `do` tree and its params; or its first parse error. */
export type StepSource = { description: string | null; nodes: StepNode[]; params: ParamNode[] } | { error: string };

/** A workflow entry as written: a step with its `agents` and params, or a gate with its question; `index` in `steps`. */
export type EntrySource =
  | { kind: "step"; index: number; id: string; agents: boolean | null; params: Record<string, unknown> }
  | { kind: "gate"; index: number; question: string };

/** A workflow file as written: its entries; or its first parse error. */
export type WorkflowSource = { entries: EntrySource[] } | { error: string };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): string => (v === undefined || v === null ? "" : String(v));
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(text) : v === undefined || v === null ? [] : [text(v)]);
const written = (v: unknown): Written => (Array.isArray(v) ? v.map(text) : text(v));

/** The first parse error of a document, `null` when it parses. */
export const parseError = (doc: Document): string | null => {
  const first = doc.errors[0];
  return first === undefined ? null : (first.message.split("\n")[0] ?? "invalid YAML");
};

/** The nodes of a `do` list at YAML path `path`. */
function nodes(raw: unknown, path: YamlPath): StepNode[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((n, i): StepNode[] => {
    if (!isObj(n)) return [];
    const at = [...path, i];
    if ("agent" in n) {
      const f = isObj(n.agent) ? n.agent : {};
      return [
        {
          kind: "agent",
          path: at,
          prompts: list(f.prompt),
          returns: text(f.returns),
          access: f.access === undefined || f.access === null ? null : text(f.access),
          model: f.model === undefined || f.model === null ? null : text(f.model),
        },
      ];
    }
    if ("loop" in n) {
      const f = isObj(n.loop) ? n.loop : {};
      return [{ kind: "loop", path: at, max: text(f.max), until: list(f.until), exhausted: text(f.exhausted), children: nodes(f.do, [...at, "loop", "do"]) }];
    }
    if ("foreach" in n) {
      return [{ kind: "foreach", path: at, value: written(n.foreach), parallel: n.parallel === true, children: nodes(n.do, [...at, "do"]) }];
    }
    if ("when" in n) {
      const conditions = list(n.when);
      if ("fail" in n) return [{ kind: "stop", path: at, conditions, stop: "fail", text: null }];
      if ("block" in n) return [{ kind: "stop", path: at, conditions, stop: "block", text: n.block === true ? null : text(n.block) }];
      return [{ kind: "when", path: at, conditions, children: nodes(n.do, [...at, "do"]) }];
    }
    return [];
  });
}

/** The tree and params of a step file's document. */
export function stepSource(doc: Document): StepSource {
  const failed = parseError(doc);
  if (failed !== null) return { error: failed };
  const root = doc.toJS() as unknown;
  if (!isObj(root)) return { error: "not a map" };
  const params = isObj(root.params)
    ? Object.entries(root.params).map(([name, v]): ParamNode => {
        const f = isObj(v) ? v : {};
        const d = f.default;
        return {
          name,
          default: d === undefined || d === null ? null : typeof d === "number" || typeof d === "boolean" ? d : written(d),
          description: typeof f.description === "string" ? f.description : null,
          path: ["params", name],
        };
      })
    : [];
  return { description: typeof root.description === "string" ? root.description : null, nodes: nodes(root.do, ["do"]), params };
}

/** The entries of a workflow file's document, as written. */
export function workflowSource(doc: Document): WorkflowSource {
  const failed = parseError(doc);
  if (failed !== null) return { error: failed };
  const root = doc.toJS() as unknown;
  if (!isObj(root)) return { error: "not a map" };
  const entries = (Array.isArray(root.steps) ? root.steps : []).flatMap((e, index): EntrySource[] => {
    if (!isObj(e) || Object.keys(e).length !== 1) return [];
    const [key, value] = Object.entries(e)[0] as [string, unknown];
    if (key === "gate") return [{ kind: "gate", index, question: text(value) }];
    const given = isObj(value) ? value : {};
    const params = Object.fromEntries(Object.entries(given).filter(([p]) => p !== "agents"));
    return [{ kind: "step", index, id: key, agents: typeof given.agents === "boolean" ? given.agents : null, params }];
  });
  return { entries };
}
