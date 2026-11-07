/** The inspector's data for a selected node. Pure: no DOM, no React. */
import type { Access, Condition, Input, ParamValue, ResultType } from "../../../core/schema";
import { find, type Graph } from "./model";

export type Param = { name: string; value: ParamValue; from: string };

export type Details =
  | {
      kind: "agent";
      label: string;
      name: string;
      returns: ResultType;
      access: Access;
      /** `null` for an agent of an inline step. */
      model: string | null;
      /** The `when` conditions it runs under, outermost first; empty when it always runs. */
      runsWhen: string[];
      prompts: string[];
      /** The params of the step holding it. */
      params: Param[];
    }
  | { kind: "step"; id: string; description: string; file: string; mode: "through agents" | "inline"; params: Param[] }
  | { kind: "gate"; id: string; question: string }
  | { kind: "stop"; stop: "fail" | "block"; conditions: Condition[]; text: string }
  | { kind: "loop"; max: number; until: Condition[]; exhausted: string }
  | { kind: "start"; input: Input };

const paramsOf = (params: Record<string, { value: ParamValue; from: string }>): Param[] =>
  Object.entries(params).map(([name, p]) => ({ name, value: p.value, from: p.from }));

/** The inspector's data for the node at `path`; `null` for a path with no node or a node with no panel. */
export function details(graph: Graph, path: string): Details | null {
  const found = find(graph, path);
  if (found === null) return null;
  const { node, entry } = found;
  switch (node.kind) {
    case "agent":
      return {
        kind: "agent",
        label: node.label,
        name: node.name,
        returns: node.returns,
        access: node.access,
        model: node.model,
        runsWhen: [...node.conditions],
        prompts: [...node.prompts],
        params: entry?.kind === "step" ? paramsOf(entry.params) : [],
      };
    case "step":
      return { kind: "step", id: node.id, description: node.description, file: node.file, mode: node.agents ? "through agents" : "inline", params: paramsOf(node.params) };
    case "gate":
      return { kind: "gate", id: node.id, question: node.question };
    case "stop":
      return { kind: "stop", stop: node.stop, conditions: [...node.conditions], text: node.text };
    case "loop":
      return { kind: "loop", max: node.max, until: [...node.until], exhausted: node.exhausted };
    case "start":
      return { kind: "start", input: node.input };
    default:
      return null;
  }
}
