/**
 * The graph model of a workflow: a tree of nodes, each keyed by the JSON path of its object in the resolved
 * `WorkflowDoc`, or, for the editor's source model, in the workflow and step files as written. Pure: no DOM, no React.
 */
import type { Access, AgentOut, Condition, Input, Out, ParamValue, ResultType, WorkflowDoc } from "../../../core/schema";

/** A YAML path: map keys and list indices. */
export type YamlPath = (string | number)[];

/**
 * Where a node of the source model is written: the file (`workflows/<name>` or `steps/<name>`), its YAML path there,
 * and whether the editor may change it.
 */
export type SourceRef = { file: string; yaml: YamlPath; editable: boolean };

export type StartNode = { kind: "start"; path: "start"; input: Input; src?: SourceRef };
export type StepNode = {
  kind: "step";
  path: string;
  id: string;
  step: string;
  agents: boolean;
  file: string;
  description: string;
  params: Record<string, { value: ParamValue; from: string }>;
  children: GraphNode[];
  /** Whether the step file's frame can be edited: always false for a resolved workflow. */
  editable: boolean;
  /** The source model's entry in the workflow file (`yaml` is `["steps", i]`). */
  src?: SourceRef;
  /** The source model's step file: its origin, or why it cannot be drawn. */
  origin?: "project" | "global";
  error?: string;
};
export type GateNode = { kind: "gate"; path: string; id: string; question: string; src?: SourceRef };
export type AgentNode = {
  kind: "agent";
  path: string;
  label: string;
  name: string;
  returns: ResultType;
  access: Access;
  model: string | null;
  prompts: string[];
  /** The `when` conditions enclosing the agent, outermost first. */
  conditions: string[];
  src?: SourceRef;
};
export type ParallelNode = { kind: "parallel"; path: string; children: AgentNode[]; src?: SourceRef };
/** `max` is a number, or a `${param}` as written in the source model. */
export type LoopNode = {
  kind: "loop";
  path: string;
  max: number | string;
  until: Condition[];
  exhausted: string;
  children: GraphNode[];
  src?: SourceRef;
};
export type WhenNode = { kind: "when"; path: string; conditions: Condition[]; children: GraphNode[]; src?: SourceRef };
/** A `{ when, fail }` or `{ when, block }`: `stop` is the spec's stop kind. */
export type StopNode = { kind: "stop"; path: string; conditions: Condition[]; stop: "fail" | "block"; text: string; src?: SourceRef };
/** A `foreach` of the source model, unexpanded: `value` as written (`${lenses}` or the names joined). */
export type ForeachNode = { kind: "foreach"; path: string; value: string; parallel: boolean; children: GraphNode[]; src?: SourceRef };

/** A node inside a step's `do`. */
export type GraphNode = AgentNode | ParallelNode | LoopNode | WhenNode | StopNode | ForeachNode;
/** A workflow entry. */
export type EntryNode = StepNode | GateNode;

/**
 * Where an editor `+` inserts: a workflow entry at `index` of `steps`, or a construct at `index` of the `do` list at
 * `parent` in a step file; `inLoop` and `inForeach` hide the constructs that cannot nest there.
 */
export type InsertPoint =
  | { scope: "entries"; index: number }
  | { scope: "step"; file: string; parent: YamlPath; index: number; inLoop: boolean; inForeach: boolean };
/** An editor `+` point, placed by the layout. */
export type InsertNode = { kind: "insert"; path: string; at: InsertPoint };

export type AnyNode = StartNode | EntryNode | GraphNode | InsertNode;

/** The model of a workflow: its start card and its entries. */
export type Graph = { start: StartNode; entries: EntryNode[] };

function agentNode(a: AgentOut, path: string, conditions: string[]): AgentNode {
  return {
    kind: "agent",
    path,
    label: a.label,
    name: a.name,
    returns: a.returns,
    access: a.access,
    model: a.model ?? null,
    prompts: [...a.prompt],
    conditions: [...conditions],
  };
}

/** The nodes of an `Out` list at `path` (`<parent>.do`), under the `when` conditions `conditions`. */
function nodes(list: Out[], path: string, conditions: string[]): GraphNode[] {
  return list.map((out, i): GraphNode => {
    const at = `${path}[${i}]`;
    if ("agent" in out) return agentNode(out.agent, at, conditions);
    if ("parallel" in out) {
      return { kind: "parallel", path: at, children: out.parallel.map((p, k) => agentNode(p.agent, `${at}.parallel[${k}]`, conditions)) };
    }
    if ("loop" in out) {
      const { max, until, exhausted } = out.loop;
      return { kind: "loop", path: at, max, until: [...until], exhausted, children: nodes(out.loop.do, `${at}.loop.do`, conditions) };
    }
    if ("do" in out) return { kind: "when", path: at, conditions: [...out.when], children: nodes(out.do, `${at}.do`, [...conditions, ...out.when]) };
    if ("fail" in out) return { kind: "stop", path: at, conditions: [...out.when], stop: "fail", text: "Fail" };
    return { kind: "stop", path: at, conditions: [...out.when], stop: "block", text: out.block === true ? "Block" : `Block: ${out.block}` };
  });
}

/** The graph model of a resolved workflow. */
export function model(doc: WorkflowDoc): Graph {
  const entries = doc.steps.map((entry, i): EntryNode => {
    const path = `steps[${i}]`;
    if ("gate" in entry) return { kind: "gate", path, id: entry.id, question: entry.gate };
    return {
      kind: "step",
      path,
      id: entry.id,
      step: entry.step,
      agents: entry.agents,
      file: entry.file,
      description: entry.description,
      params: entry.params,
      children: nodes(entry.do, `${path}.do`, []),
      editable: false,
    };
  });
  return { start: { kind: "start", path: "start", input: doc.input }, entries };
}

/** The children of a node, none for a card. */
export function childrenOf(node: AnyNode): GraphNode[] {
  return node.kind === "step" || node.kind === "parallel" || node.kind === "loop" || node.kind === "when" || node.kind === "foreach" ? node.children : [];
}

/** The node at `path`, with the entry holding it; `null` when there is none. */
export function find(graph: Graph, path: string): { node: AnyNode; entry: EntryNode | null } | null {
  if (path === "start") return { node: graph.start, entry: null };
  for (const entry of graph.entries) {
    const stack: AnyNode[] = [entry];
    while (stack.length > 0) {
      const node = stack.pop() as AnyNode;
      if (node.path === path) return { node, entry };
      stack.push(...childrenOf(node));
    }
  }
  return null;
}
