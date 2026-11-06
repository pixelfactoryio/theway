/**
 * The workflow vocabulary and the resolved-document types, shared by the CLI and the dashboard's browser client.
 * This module imports nothing, so a program without node types can import it.
 */

/** A workflow, step or prompt name: lowercase letters and digits in words separated by single hyphens. */
export const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The models an agent or a model config key may name. */
export const MODELS = ["opus", "sonnet", "haiku"] as const;

export const TYPES = ["work", "findings", "verdicts", "resolutions", "pr", "ci", "diagnosis", "scaffold", "edits"] as const;
export type ResultType = (typeof TYPES)[number];
export const CONDITIONS = [
  "findings",
  "no-findings",
  "confirmed",
  "no-confirmed",
  "green",
  "red",
  "fixable",
  "more",
  "decision",
  "no-decision",
] as const;
export type Condition = (typeof CONDITIONS)[number];
export const ACCESS = ["read", "commit", "push", "spec"] as const;
export type Access = (typeof ACCESS)[number];
/** The kinds of workflow: change IDs in and the repository written, or a free-text request in and change folders written. */
export const INPUTS = ["changes", "request"] as const;
export type Input = (typeof INPUTS)[number];
export const EXHAUSTED = ["continue", "fail"] as const;

/** A param name: snake_case. */
export const PARAM = /^[a-z][a-z0-9_]*$/;

/** A param value: a string, an integer, a boolean or a non-empty list of names without duplicates. */
export type ParamValue = string | number | boolean | string[];

export type AgentOut = { name: string; label: string; prompt: string[]; returns: ResultType; access: Access; model?: string };
export type Out =
  | { agent: AgentOut }
  | { parallel: { agent: AgentOut }[] }
  | { loop: { max: number; until: Condition[]; exhausted: string; do: Out[] } }
  | { when: Condition[]; do: Out[] }
  | { when: Condition[]; fail: true }
  | { when: Condition[]; block: true | string };

export type StepEntry = {
  id: string;
  step: string;
  agents: boolean;
  file: string;
  description: string;
  params: Record<string, { value: ParamValue; from: string }>;
  do: Out[];
};
export type GateEntry = { id: string; gate: string; agents: false };
export type Entry = StepEntry | GateEntry;

/** A resolved workflow, the document `theway workflow` prints. */
export type WorkflowDoc = {
  name: string;
  description: string | null;
  file: string;
  input: Input;
  commits: string;
  git_host: string;
  pushes: boolean;
  working_tree: boolean;
  steps: Entry[];
};
