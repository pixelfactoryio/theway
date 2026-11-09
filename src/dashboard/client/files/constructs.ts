/** The constructs and the param a `+` of a step inserts. Pure: no DOM, no React. */
import type { NewNode, ParamDef } from "../editor/ops";

/** The construct a `do` list's `+` menu offers. */
export type Construct = "agent" | "loop" | "when" | "foreach";

const AGENT: NewNode = { agent: { prompt: "implement", returns: "work" } };

/** The construct each menu item inserts. */
export const DEFAULT_CONSTRUCT: Record<Construct, NewNode> = {
  agent: AGENT,
  loop: { loop: { max: 2, until: "green", exhausted: "fail", do: [AGENT] } },
  when: { when: "findings", do: [AGENT] },
  foreach: { foreach: ["conformance", "correctness"], parallel: true, do: [{ agent: { prompt: ["reviewer", "${item}"], returns: "findings" } }] },
};

/** The agent a `when` gets when it is switched to run steps. */
export const DEFAULT_AGENT = AGENT;

/** A new param's definition. */
export const NEW_PARAM: ParamDef = { default: "value", description: "New param" };

/** The first of `param`, `param2`, `param3`… that `taken` does not hold. */
export function newParamName(taken: string[]): string {
  if (!taken.includes("param")) return "param";
  for (let i = 2; ; i++) if (!taken.includes(`param${i}`)) return `param${i}`;
}
