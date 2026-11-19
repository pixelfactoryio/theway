/**
 * The `theway.workflow/v1beta1` vocabulary, the rules every reader of a workflow file shares, and the resolved-document
 * types. This module imports nothing.
 */

/** A workflow, step or prompt name: lowercase letters and digits in words separated by single hyphens. */
export const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** The models an agent or a model config key may name. */
export const MODELS = ["opus", "sonnet", "haiku"] as const

/** A param name: snake_case. */
export const PARAM = /^[a-z][a-z0-9_]*$/

/** The `version` of a workflow file in this language. */
export const VERSION = "theway.workflow/v1beta1" as const

/** A `uses`, `on-fail` or value naming a prompt: `prompts/<name>.md`. */
export const PROMPT_REF = /^prompts\/([^/]+)\.md$/

/** A line still starting with a file's prefix: `workflows/<name>.yaml: ` or `prompts/<name>.md: `. */
export const FILE_PREFIX = /^(?:workflows\/[^/:\s]+\.yaml|prompts\/[^/:\s]+\.md): /

/** Where a step runs: through an agent, or in the session. */
export const RUNS_ON = ["agents", "session"] as const
export type RunsOn = (typeof RUNS_ON)[number]

/** The types of a workflow input: free text, or a change ID. */
export const WORKFLOW_INPUT_TYPES = ["text", "change"] as const
export type WorkflowInputType = (typeof WORKFLOW_INPUT_TYPES)[number]

/** The keys of a workflow file's root map. */
export const WORKFLOW_KEYS = ["version", "description", "default", "inputs", "runs-on", "steps"] as const
/** The keys of a step map. */
export const STEP_KEYS = ["uses", "with", "matrix", "on-fail", "tries", "runs-on", "model"] as const
/** The keys of an on-fail map. */
export const ON_FAIL_KEYS = ["uses", "with", "model"] as const

/** The reference to prompt `name`: `prompts/<name>.md`. */
export const promptUses = (name: string): string => `prompts/${name}.md`

/** The name a value names when it is a prompt reference, else `null`. */
export function promptRef(v: unknown): string | null {
  const m = typeof v === "string" ? PROMPT_REF.exec(v) : null
  return m !== null && NAME.test(m[1] as string) ? (m[1] as string) : null
}

/** Whether a workflow file's `version` and `default` values set the default: only a file of this version can. */
export function isDefaultWorkflow(version: unknown, def: unknown): boolean {
  return version === VERSION && def === true
}

/**
 * Where a step runs from its `runs-on` value: the workflow's (`workflow`) when it is `undefined` (no `runs-on` key),
 * the value when it is a member of `RUNS_ON`, else `null`.
 */
export function stepRunsOn(value: unknown, workflow: RunsOn | null): RunsOn | null {
  if (value === undefined) return workflow
  return (RUNS_ON as readonly unknown[]).includes(value) ? (value as RunsOn) : null
}

/**
 * Where a workflow's steps run, from each step's place: `agents` or `session` when every step runs there, else `mixed`;
 * `null` without steps, or while a step names no place.
 */
export function runsOnOf(places: readonly (RunsOn | null)[]): RunsOn | "mixed" | null {
  const set = new Set(places)
  if (set.size === 0 || set.has(null)) return null
  return set.size === 1 ? ([...set][0] as RunsOn) : "mixed"
}

/**
 * A step's matrix from its map's entries: exactly one entry, its key (as `String` gives it) a param name, its value a
 * non-empty list of strings; else `null`.
 */
export function matrixOf(entries: readonly (readonly [unknown, unknown])[]): { key: string; values: string[] } | null {
  if (entries.length !== 1) return null
  const [key, value] = entries[0] as readonly [unknown, unknown]
  const name = String(key)
  if (!PARAM.test(name)) return null
  if (!Array.isArray(value) || value.length === 0 || !value.every((x) => typeof x === "string")) return null
  return { key: name, values: value as string[] }
}

/** A prompt input as its header declares it. */
export type PromptInput = { description: string; required: boolean; default: string | null }

/** The header of a prompt file a workflow uses. */
export type PromptHeader = { description: string; model: string | null; inputs: Record<string, PromptInput> }

/** A workflow input as declared, with its value: set when the document is resolved, else `null`. */
export type ResolvedInput = {
  description: string
  required: boolean
  default: string | null
  type: WorkflowInputType
  value: string | null
}

/** A `with` value as the workflow file writes it. */
export type WithValue = string | number | boolean | null

/** One run of a step: its label, every prompt input with its final value, and the prompt's body substituted. */
export type StepRun = { label: string; with: Record<string, string>; prompt: string }

/** The prompt a failed step runs before it runs again. */
export type ResolvedOnFail = {
  uses: string
  file: string
  description: string
  model: string | null
  with: Record<string, string>
  label: string
  prompt: string
}

/** One step of a resolved workflow. */
export type ResolvedStep = {
  index: number
  uses: string
  file: string
  description: string
  runs_on: RunsOn
  model: string | null
  matrix: { key: string; values: string[] } | null
  with: Record<string, WithValue>
  runs: StepRun[]
  on_fail: ResolvedOnFail | null
  tries: number | null
}

/** The document `theway workflow <name>` prints for a `theway.workflow/v1beta1` file. */
export type ResolvedWorkflow = {
  name: string
  version: typeof VERSION
  description: string
  file: string
  default: boolean
  inputs: Record<string, ResolvedInput>
  runs_on: RunsOn
  resolved: boolean
  steps: ResolvedStep[]
}

/**
 * One workflow file of a project, as `listWorkflowFiles` lists it: `errors` holds every error line of its resolve
 * (`[]` when it resolves), `error` the first one, and `doc` the resolved document (`null` when it does not resolve).
 */
export type WorkflowFileItem = {
  name: string
  scope: "project" | "global"
  description: string | null
  default: boolean
  error?: string
  errors: string[]
  doc: ResolvedWorkflow | null
}

/** One prompt file of a project, as `listPromptFiles` lists it; `error` is its first header rule error, `null` for none. */
export type PromptFileItem = {
  name: string
  scope: "project" | "global"
  description: string | null
  step: boolean
  error: string | null
}
