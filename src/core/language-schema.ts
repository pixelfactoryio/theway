/**
 * The `theway.workflow/v1beta` vocabulary and the resolved-document types, shared by the CLI and the dashboard's
 * browser client. This module imports nothing, so a program without node types can import it.
 */

/** A workflow, step or prompt name: lowercase letters and digits in words separated by single hyphens. */
export const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The models an agent or a model config key may name. */
export const MODELS = ["opus", "sonnet", "haiku"] as const;

/** A param name: snake_case. */
export const PARAM = /^[a-z][a-z0-9_]*$/;

/** The `version` of a workflow file in this language. */
export const VERSION = "theway.workflow/v1beta" as const;

/** Where a step runs: through an agent, or in the session. */
export const RUNS_ON = ["agents", "session"] as const;
export type RunsOn = (typeof RUNS_ON)[number];

/** The types of a workflow input: free text, or a change ID. */
export const WORKFLOW_INPUT_TYPES = ["text", "change"] as const;
export type WorkflowInputType = (typeof WORKFLOW_INPUT_TYPES)[number];

/** A prompt input as its header declares it. */
export type PromptInput = { description: string; required: boolean; default: string | null };

/** The header of a prompt file a workflow uses. */
export type PromptHeader = { description: string; model: string | null; inputs: Record<string, PromptInput> };

/** A workflow input as declared, with its value: set when the document is resolved, else `null`. */
export type ResolvedInput = {
  description: string;
  required: boolean;
  default: string | null;
  type: WorkflowInputType;
  value: string | null;
};

/** A `with` value as the workflow file writes it. */
export type WithValue = string | number | boolean | null;

/** One run of a step: its label, every prompt input with its final value, and the prompt's body substituted. */
export type StepRun = { label: string; with: Record<string, string>; prompt: string };

/** The prompt a failed step runs before it runs again. */
export type ResolvedOnFail = {
  uses: string;
  file: string;
  description: string;
  model: string | null;
  with: Record<string, string>;
  label: string;
  prompt: string;
};

/** One step of a resolved workflow. */
export type ResolvedStep = {
  index: number;
  uses: string;
  file: string;
  description: string;
  runs_on: RunsOn;
  model: string | null;
  matrix: { key: string; values: string[] } | null;
  with: Record<string, WithValue>;
  runs: StepRun[];
  on_fail: ResolvedOnFail | null;
  tries: number | null;
};

/** The document `theway workflow <name>` prints for a `theway.workflow/v1beta` file. */
export type ResolvedWorkflow = {
  name: string;
  version: typeof VERSION;
  description: string;
  file: string;
  default: boolean;
  inputs: Record<string, ResolvedInput>;
  runs_on: RunsOn;
  resolved: boolean;
  steps: ResolvedStep[];
};

/**
 * One workflow file of a project, as `listWorkflowFiles` lists it: `errors` holds every error line of its resolve
 * (`[]` when it resolves), `error` the first one, and `doc` the resolved document (`null` when it does not resolve).
 */
export type WorkflowFileItem = {
  name: string;
  scope: "project" | "global";
  description: string | null;
  default: boolean;
  error?: string;
  errors: string[];
  doc: ResolvedWorkflow | null;
};

/** One prompt file of a project, as `listPromptFiles` lists it; `error` is its first header rule error, `null` for none. */
export type PromptFileItem = { name: string; scope: "project" | "global"; description: string | null; step: boolean; error: string | null };
