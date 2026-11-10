/**
 * The workflow vocabulary and the resolved-document types, shared by the CLI and the dashboard's browser client.
 * This module imports only `language-schema`, which imports nothing, so a program without node types can import it.
 */

export { MODELS, NAME, PARAM } from "./language-schema";

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

/** One workflow of a project as `listWorkflows` lists it: the resolved fields when it resolves, else its error line. */
export type WorkflowItem = {
  name: string;
  origin: "project" | "global";
  file: string;
  description?: string | null;
  input?: Input;
  pushes?: boolean;
  default?: boolean;
  error?: string;
};

/** One step of a project as `listSteps` lists it: its description and params' effective values, or its error line. */
export type StepItem =
  | { name: string; origin: "project" | "global"; description: string; params: { name: string; default: ParamValue; description: string }[] }
  | { name: string; origin: "project" | "global"; error: string };

/** Every workflow of a project, and the name of the one a run without a name uses, or why it does not resolve. */
export type WorkflowList = { defaultName: string | null; defaultError: string | null; workflows: WorkflowItem[] };
