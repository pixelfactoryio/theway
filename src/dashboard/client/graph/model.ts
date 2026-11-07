/**
 * The graph model of a resolved workflow: a tree of nodes, each keyed by the JSON path of its object in the
 * `WorkflowDoc`. Pure: no DOM, no React.
 */
import type { Access, AgentOut, Condition, Input, Out, ParamValue, ResultType, WorkflowDoc } from "../../../core/schema";

export type StartNode = { kind: "start"; path: "start"; input: Input };
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
  editable: false;
};
export type GateNode = { kind: "gate"; path: string; id: string; question: string };
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
};
export type ParallelNode = { kind: "parallel"; path: string; children: AgentNode[] };
export type LoopNode = { kind: "loop"; path: string; max: number; until: Condition[]; exhausted: string; children: GraphNode[] };
export type WhenNode = { kind: "when"; path: string; conditions: Condition[]; children: GraphNode[] };
/** A `{ when, fail }` or `{ when, block }`: `stop` is the spec's stop kind. */
export type StopNode = { kind: "stop"; path: string; conditions: Condition[]; stop: "fail" | "block"; text: string };

/** A node inside a step's `do`. */
export type GraphNode = AgentNode | ParallelNode | LoopNode | WhenNode | StopNode;
/** A workflow entry. */
export type EntryNode = StepNode | GateNode;
export type AnyNode = StartNode | EntryNode | GraphNode;

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
  return node.kind === "step" || node.kind === "parallel" || node.kind === "loop" || node.kind === "when" ? node.children : [];
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
