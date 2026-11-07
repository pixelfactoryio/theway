/**
 * The source mapper: the editor's graph model built from the workflow and step files as written, `${…}` values raw,
 * each node with the file and YAML path it is written at. Pure: no DOM, no React.
 */
import type { Document } from "yaml";
import type { Access, Condition, Input, ParamValue, ResultType } from "../../../core/schema";
import type { AgentNode, EntryNode, Graph, GraphNode, StepNode, YamlPath } from "../graph/model";

/** A step file as the editor holds it: its document, or why it cannot be drawn. */
export type StepSource =
  | { doc: Document; origin: "project" | "global"; editable: boolean }
  | { error: string; origin?: "project" | "global" };

/** The key of a file in the editor: `workflows/<name>` or `steps/<name>`. */
export const fileKey = (kind: "workflows" | "steps", name: string): string => `${kind}/${name}`;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => v !== null && typeof v === "object" && !Array.isArray(v);
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v === undefined || v === null ? [] : [String(v)]);

/** The access an agent takes when it names none, as the resolver gives it. */
export function defaultAccess(returns: string): Access {
  if (returns === "work") return "commit";
  if (returns === "pr") return "push";
  if (returns === "scaffold" || returns === "edits") return "spec";
  return "read";
}

/** The first parse error of a document, `null` when it parses. */
export const parseError = (doc: Document): string | null => (doc.errors[0] === undefined ? null : doc.errors[0].message.split("\n")[0] ?? "invalid YAML");

/** What `nodes` needs about the step it maps: the entry id, the step name, its file key and whether it is editable. */
type Ctx = { id: string; step: string; file: string; editable: boolean };

/** The nodes of a `do` list as written, at model path `path` and YAML path `yaml`, under the `when` conditions `conds`. */
function nodes(ctx: Ctx, raw: unknown, path: string, yaml: YamlPath, conds: string[]): GraphNode[] {
  if (!Array.isArray(raw)) return [];
  const out: GraphNode[] = [];
  raw.forEach((n, j) => {
    if (!isObj(n)) return;
    const at = `${path}[${j}]`;
    const y = [...yaml, j];
    const src = { file: ctx.file, yaml: y, editable: ctx.editable };
    if ("agent" in n) {
      const f = isObj(n.agent) ? n.agent : {};
      const prompts = f.prompt === undefined ? [ctx.step] : list(f.prompt);
      const title = prompts.join(", ");
      const returns = String(f.returns ?? "");
      const agent: AgentNode = {
        kind: "agent",
        path: at,
        label: `${ctx.id}:${title}`,
        name: title,
        returns: returns as ResultType,
        access: (f.access === undefined ? defaultAccess(returns) : String(f.access)) as Access,
        model: f.model === undefined || f.model === null ? null : String(f.model),
        prompts,
        conditions: [...conds],
        src,
      };
      out.push(agent);
    } else if ("loop" in n) {
      const f = isObj(n.loop) ? n.loop : {};
      out.push({
        kind: "loop",
        path: at,
        max: typeof f.max === "number" ? f.max : String(f.max ?? ""),
        until: list(f.until) as Condition[],
        exhausted: String(f.exhausted ?? ""),
        children: nodes(ctx, f.do, `${at}.loop.do`, [...y, "loop", "do"], conds),
        src,
      });
    } else if ("foreach" in n) {
      out.push({
        kind: "foreach",
        path: at,
        value: Array.isArray(n.foreach) ? n.foreach.map(String).join(", ") : String(n.foreach ?? ""),
        parallel: n.parallel === true,
        children: nodes(ctx, n.do, `${at}.do`, [...y, "do"], conds),
        src,
      });
    } else if ("when" in n) {
      const c = list(n.when) as Condition[];
      if ("fail" in n) out.push({ kind: "stop", path: at, conditions: c, stop: "fail", text: "Fail", src });
      else if ("block" in n) {
        out.push({ kind: "stop", path: at, conditions: c, stop: "block", text: n.block === true ? "Block" : `Block: ${String(n.block)}`, src });
      } else out.push({ kind: "when", path: at, conditions: c, children: nodes(ctx, n.do, `${at}.do`, [...y, "do"], [...conds, ...c]), src });
    }
  });
  return out;
}

/** The editor's graph of workflow `name` from its document and the step files it names; or the workflow's parse error. */
export function sourceModel(name: string, workflow: Document, steps: Map<string, StepSource>): Graph | { error: string } {
  const failed = parseError(workflow);
  if (failed !== null) return { error: failed };
  const root = workflow.toJS() as unknown;
  if (!isObj(root)) return { error: "not a map" };
  const file = fileKey("workflows", name);
  const topAgents = typeof root.agents === "boolean" ? root.agents : true;
  const entries: EntryNode[] = [];
  (Array.isArray(root.steps) ? root.steps : []).forEach((e, i) => {
    if (!isObj(e) || Object.keys(e).length !== 1) return;
    const [key, value] = Object.entries(e)[0] as [string, unknown];
    const path = `steps[${i}]`;
    const src = { file, yaml: ["steps", i], editable: true };
    if (key === "gate") {
      entries.push({ kind: "gate", path, id: "gate", question: String(value ?? ""), src });
      return;
    }
    const given = isObj(value) ? value : {};
    const params: Record<string, { value: ParamValue; from: string }> = {};
    for (const [p, v] of Object.entries(given)) if (p !== "agents") params[p] = { value: v as ParamValue, from: file };
    const step: StepNode = {
      kind: "step",
      path,
      id: key,
      step: key,
      agents: typeof given.agents === "boolean" ? given.agents : topAgents,
      file: fileKey("steps", key),
      description: "",
      params,
      children: [],
      editable: false,
      src,
    };
    const source = steps.get(key);
    if (source === undefined) step.error = `no step '${key}'`;
    else if ("error" in source) {
      step.error = source.error;
      if (source.origin !== undefined) step.origin = source.origin;
    } else {
      step.origin = source.origin;
      const bad = parseError(source.doc);
      const body = source.doc.toJS() as unknown;
      if (bad !== null) step.error = bad;
      else if (!isObj(body)) step.error = "not a map";
      else {
        step.editable = source.editable;
        step.description = typeof body.description === "string" ? body.description : "";
        step.children = nodes({ id: key, step: key, file: step.file, editable: source.editable }, body.do, `${path}.do`, ["do"], []);
      }
    }
    entries.push(step);
  });
  const input = (root.input === "request" ? "request" : "changes") as Input;
  return { start: { kind: "start", path: "start", input, src: { file, yaml: [], editable: true } }, entries };
}
