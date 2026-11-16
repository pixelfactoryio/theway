/**
 * A workflow file drawn as cards: read from its text as written (so a file that does not resolve is still drawn),
 * with the prompts list for each card's description and model. Pure: no React, no DOM.
 */
import { type Document, isAlias, isMap, isScalar, isSeq, type Node, parseDocument, type YAMLMap } from "yaml"
import {
  FILE_PREFIX,
  isDefaultWorkflow,
  matrixOf,
  promptRef,
  type RunsOn,
  stepRunsOn,
  VERSION,
} from "../../../core/language-schema"
import type { PromptRow } from "./files"

/** A line about step N (0-based), and whether it is about its on-fail. */
const STEP_LINE = /^steps\[(\d+)\](\.on-fail(?![\w-]))?/

/** A value as the panel shows it: a prompt reference (a link), or its YAML source text. */
export type Shown = { prompt: string } | { source: string }

/** The on-fail card of a step. */
export type OnFailCard = {
  /** The on-fail prompt's name, or the YAML source text naming the card. */
  name: string
  /** Whether `name` is YAML source text (shown in the code font). */
  code: boolean
  description: string | null
  badge: string | null
  errors: string[]
  uses: Shown | null
  with: { key: string; value: string }[] | { source: string } | null
  model: string | null
}

/** One step's card. */
export type StepCard = {
  /** 0-based, as `steps[N]` counts. */
  index: number
  /** `false` for a step that is not a map: "Invalid step". */
  valid: boolean
  name: string
  code: boolean
  description: string | null
  badge: string | null
  /**
   * Where the step runs: its `runs-on` when valid, the workflow's when absent; `null` for an invalid value, an invalid
   * step, or when neither names one.
   */
  target: "session" | "agents" | null
  /** `matrix · N`, `matrix`, or `null` without one. */
  matrix: string | null
  errors: string[]
  onFail: OnFailCard | null
  /** The `tries` as written, `null` when not set. */
  tries: string | null
  fields: {
    uses: Shown | null
    runsOn: string | null
    model: string | null
    with: { key: string; value: string }[] | { source: string } | null
    matrix: { key: string; values: string[] } | { source: string } | null
    onFail: Shown | null
    tries: string | null
  }
}

/** A workflow input as the Workflow panel lists it. */
export type InputField = { name: string; type: string; required: boolean; default: string | null; description: string }

/** A workflow file drawn: its Inputs card, its steps, and its workflow-level fields. */
export type Drawing = {
  /** The Inputs card's second row: the input names, `[]` for "No input". */
  inputs: string[]
  /** The workflow's own lines (neither `steps[` nor another file's prefix): the Inputs card's and the Workflow panel's. */
  errors: string[]
  steps: StepCard[]
  description: string | null
  runsOn: string | null
  default: boolean
  inputFields: InputField[]
}

/** What a card selection names. */
export type Selection = { kind: "inputs" } | { kind: "step"; index: number } | { kind: "on-fail"; index: number }

/** The prompt of `name` in a workflow's context: its project's own when it has one, else the global one. */
export function findPrompt(prompts: readonly PromptRow[], project: string | null, name: string): PromptRow | null {
  return (
    (project !== null ? prompts.find((p) => p.name === name && p.project === project) : undefined) ??
    prompts.find((p) => p.name === name && p.project === null) ??
    null
  )
}

/** Whether a line is the workflow's own: it starts neither with `steps[` nor with another file's prefix. */
export const isWorkflowLine = (line: string): boolean => !line.startsWith("steps[") && !FILE_PREFIX.test(line)

/** The YAML source text of a node. */
const sourceOf = (text: string, node: unknown): string => {
  const range = (node as Node | null)?.range
  return range === undefined || range === null ? String(node ?? "") : text.slice(range[0], range[1])
}

/** A map's value for `key`, as a node. */
function get(map: YAMLMap, key: string): unknown {
  const pair = map.items.find((p) => isScalar(p.key) && String(p.key.value) === key)
  return pair === undefined ? undefined : (pair.value ?? null)
}

const has = (map: YAMLMap, key: string): boolean =>
  map.items.some((p) => isScalar(p.key) && String(p.key.value) === key)

/** A scalar node's value, `undefined` for anything else. */
const scalar = (node: unknown): unknown => (isScalar(node) ? node.value : undefined)

/** A string scalar's value, else `null`. */
const str = (node: unknown): string | null => {
  const v = scalar(node)
  return typeof v === "string" ? v : null
}

/** The badge of a step or on-fail card: `session`, `agents · <model>` or `agents`, from the runs-on given. */
const badgeOf = (runsOn: string | null, model: string | null): string | null =>
  runsOn === "session"
    ? "session"
    : runsOn === "agents"
      ? model !== null && model !== ""
        ? `agents · ${model}`
        : "agents"
      : null

/**
 * A map's `runs-on` as `stepRunsOn` reads it: `undefined` without the key, the value of a scalar node, the resolved
 * value of an alias (as the resolver's parse resolves it; `null` when it cannot be resolved), `null` for any other node
 * (a key-only pair included).
 */
const runsOnInput = (doc: Document.Parsed, map: YAMLMap): unknown => {
  if (!has(map, "runs-on")) return undefined
  const node = get(map, "runs-on")
  if (isScalar(node)) return node.value
  if (!isAlias(node)) return null
  try {
    return node.toJS(doc)
  } catch {
    return null
  }
}

/**
 * A matrix node's entries, as the resolver's `Map` holds them (`mapAsMap`, aliases resolved): none for a node that is
 * not a map; else per pair, the key's value for a scalar key (else its JS value, `null` for none), and the value's JS
 * value (`null` for none).
 */
function matrixEntries(doc: Document.Parsed, node: unknown): [unknown, unknown][] {
  if (!isMap(node)) return []
  const js = (n: Node | null): unknown => (n === null ? null : n.toJS(doc, { mapAsMap: true }))
  try {
    return node.items.map((p): [unknown, unknown] => {
      const key = p.key as Node | null
      return [isScalar(key) ? key.value : js(key), js(p.value as Node | null)]
    })
  } catch {
    // Too many aliases in a key or a value make `toJS` throw, as they make the resolver's parse fail: no entries, so
    // `matrixOf` rejects the matrix and it draws as its source.
    return []
  }
}

/** A `with` value as the panel shows it: one row per key with its source text, or the whole source text. */
function withOf(text: string, node: unknown): { key: string; value: string }[] | { source: string } | null {
  if (node === undefined) return null
  if (!isMap(node)) return { source: sourceOf(text, node) }
  return node.items.map((p) => ({
    key: String(isScalar(p.key) ? p.key.value : sourceOf(text, p.key)),
    value: sourceOf(text, p.value),
  }))
}

/** The name, code flag and prompt of a `uses`-like node: the prompt's name, or the YAML source text. */
function named(
  text: string,
  node: unknown,
  missing: string,
): { name: string; code: boolean; prompt: string | null; shown: Shown | null } {
  if (node === undefined) return { name: missing, code: false, prompt: null, shown: null }
  const ref = promptRef(scalar(node))
  if (ref !== null) return { name: ref, code: false, prompt: ref, shown: { prompt: ref } }
  const source = sourceOf(text, node)
  return { name: source, code: true, prompt: null, shown: { source } }
}

/** The step and on-fail lines of each step, and the workflow's own lines. */
function splitLines(lines: readonly string[]): {
  workflow: string[]
  step: Map<number, string[]>
  onFail: Map<number, string[]>
} {
  const workflow: string[] = []
  const step = new Map<number, string[]>()
  const onFail = new Map<number, string[]>()
  for (const line of lines) {
    const m = STEP_LINE.exec(line)
    if (m !== null) {
      const target = m[2] !== undefined ? onFail : step
      const n = Number(m[1])
      target.set(n, [...(target.get(n) ?? []), line])
    } else if (isWorkflowLine(line)) workflow.push(line)
  }
  return { workflow, step, onFail }
}

/**
 * Whether a workflow's text sets the default, as the Workflows table reads it: its YAML parses, its root is a map, its
 * `version` is `theway.workflow/v1beta1` and its `default` is `true`, whatever its `steps`.
 */
export function isDefaultText(text: string): boolean {
  const doc = parseDocument(text, { logLevel: "silent" })
  const root = doc.contents
  return (
    doc.errors.length === 0 &&
    isMap(root) &&
    isDefaultWorkflow(scalar(get(root, "version")), scalar(get(root, "default")))
  )
}

/**
 * The drawing of a workflow's text, or the reason it cannot be drawn: its YAML does not parse
 * (`parseDocument(text).errors` not empty), its root is not a map, its `version` is not `theway.workflow/v1beta1`, or its
 * `steps` is present and not a list. `lines` are the file's check lines (each without its own file's prefix); `prompts`
 * the prompts list, `project` the workflow's project (`null` for a global one).
 */
export function drawWorkflow(
  text: string,
  lines: readonly string[],
  prompts: readonly PromptRow[],
  project: string | null,
): { drawing: Drawing } | { reason: string } {
  const doc = parseDocument(text, { logLevel: "silent" })
  const first = lines[0]
  if (doc.errors.length > 0) return { reason: first ?? `invalid YAML: ${doc.errors[0]?.message.split("\n")[0] ?? ""}` }
  const root = doc.contents
  if (!isMap(root) || str(get(root, "version")) !== VERSION) return { reason: first ?? `version: must be ${VERSION}` }
  const stepsNode = get(root, "steps")
  // `steps:` with no value parses as a null scalar, not a missing value: it draws as empty steps.
  const emptySteps = stepsNode === null || (isScalar(stepsNode) && stepsNode.value === null)
  if (has(root, "steps") && !emptySteps && !isSeq(stepsNode))
    return { reason: first ?? "steps: must be a non-empty list" }

  const split = splitLines(lines)
  const workflowRunsOn = stepRunsOn(runsOnInput(doc, root), null)
  const prompt = (name: string | null) => (name === null ? null : findPrompt(prompts, project, name))

  const inputsNode = get(root, "inputs")
  const inputFields: InputField[] = isMap(inputsNode)
    ? inputsNode.items.map((p) => {
        const name = String(isScalar(p.key) ? p.key.value : sourceOf(text, p.key))
        const d = p.value
        const field = (k: string) => (isMap(d) ? get(d, k) : undefined)
        return {
          name,
          type: str(field("type")) ?? "text",
          required: scalar(field("required")) === true,
          default: str(field("default")),
          description: str(field("description")) ?? "",
        }
      })
    : []

  const steps: StepCard[] = (isSeq(stepsNode) ? stepsNode.items : []).map((raw, index): StepCard => {
    const errors = split.step.get(index) ?? []
    if (!isMap(raw)) {
      return {
        index,
        valid: false,
        name: `Step ${index + 1}`,
        code: false,
        description: null,
        badge: null,
        target: null,
        matrix: null,
        errors: [...errors, ...(split.onFail.get(index) ?? [])],
        onFail: null,
        tries: null,
        fields: { uses: null, runsOn: null, model: null, with: null, matrix: null, onFail: null, tries: null },
      }
    }
    const uses = named(text, get(raw, "uses"), "No prompt")
    const p = prompt(uses.prompt)
    const stepRunsOnRaw = str(get(raw, "runs-on"))
    const runsOn: RunsOn | null = stepRunsOn(runsOnInput(doc, raw), workflowRunsOn)
    const stepModel = str(get(raw, "model"))
    const matrixNode = get(raw, "matrix")
    let matrix: string | null = null
    let matrixField: StepCard["fields"]["matrix"] = null
    if (matrixNode !== undefined) {
      const valid = matrixOf(matrixEntries(doc, matrixNode))
      if (valid !== null) {
        matrix = `matrix · ${valid.values.length}`
        matrixField = valid
      } else {
        matrix = "matrix"
        matrixField = { source: sourceOf(text, matrixNode) }
      }
    }

    let onFail: OnFailCard | null = null
    let onFailShown: Shown | null = null
    const onFailNode = get(raw, "on-fail")
    if (onFailNode !== undefined) {
      const ref = promptRef(scalar(onFailNode))
      let card: ReturnType<typeof named>
      let onFailWith: OnFailCard["with"] = null
      let onFailModel: string | null = null
      if (ref !== null) {
        card = named(text, onFailNode, "No prompt")
        onFailShown = { prompt: ref }
      } else if (isMap(onFailNode) && has(onFailNode, "uses")) {
        card = named(text, get(onFailNode, "uses"), "No prompt")
        onFailWith = withOf(text, get(onFailNode, "with"))
        onFailModel = str(get(onFailNode, "model"))
        onFailShown = card.shown
      } else {
        const source = sourceOf(text, onFailNode)
        card = { name: source, code: true, prompt: null, shown: { source } }
        onFailShown = { source }
        if (isMap(onFailNode)) {
          onFailWith = withOf(text, get(onFailNode, "with"))
          onFailModel = str(get(onFailNode, "model"))
        }
      }
      const op = prompt(card.prompt)
      onFail = {
        name: card.name,
        code: card.code,
        description: op?.description ?? null,
        badge: badgeOf(runsOn, onFailModel ?? op?.model ?? null),
        errors: split.onFail.get(index) ?? [],
        uses: card.shown,
        with: onFailWith,
        model: onFailModel,
      }
    }
    const triesNode = get(raw, "tries")
    const tries = triesNode === undefined ? null : sourceOf(text, triesNode)
    return {
      index,
      valid: true,
      name: uses.name,
      code: uses.code,
      description: p?.description ?? null,
      badge: badgeOf(runsOn, stepModel ?? p?.model ?? null),
      target: runsOn,
      matrix,
      // Without an on-fail card, its lines count on the step card.
      errors: onFail === null ? [...errors, ...(split.onFail.get(index) ?? [])] : errors,
      onFail,
      tries,
      fields: {
        uses: uses.shown,
        runsOn: get(raw, "runs-on") === undefined ? null : (stepRunsOnRaw ?? sourceOf(text, get(raw, "runs-on"))),
        model: get(raw, "model") === undefined ? null : (stepModel ?? sourceOf(text, get(raw, "model"))),
        with: withOf(text, get(raw, "with")),
        matrix: matrixField,
        onFail: onFailShown,
        tries,
      },
    }
  })

  const description = get(root, "description")
  const runsOnNode = get(root, "runs-on")
  return {
    drawing: {
      inputs: inputFields.map((i) => i.name),
      errors: split.workflow,
      steps,
      description:
        description === undefined || description === null ? null : (str(description) ?? sourceOf(text, description)),
      runsOn: runsOnNode === undefined || runsOnNode === null ? null : (str(runsOnNode) ?? sourceOf(text, runsOnNode)),
      default: scalar(get(root, "default")) === true,
      inputFields,
    },
  }
}

/**
 * The card a line of the error alert selects on the Editor tab: a `steps[N]` line selects step N+1's card (its on-fail
 * card for `steps[N].on-fail`) whatever its line; a placed line of the workflow's own selects the Inputs card; any
 * other line selects nothing.
 */
export function selectionOf(line: { text: string; line: number | null }, drawing: Drawing): Selection | null {
  const m = STEP_LINE.exec(line.text)
  if (m !== null) {
    const index = Number(m[1])
    const step = drawing.steps[index]
    if (step === undefined) return null
    return m[2] !== undefined && step.onFail !== null ? { kind: "on-fail", index } : { kind: "step", index }
  }
  if (line.line !== null && isWorkflowLine(line.text)) return { kind: "inputs" }
  return null
}

/** Whether any step has an on-fail card. */
export const hasOnFail = (drawing: Drawing): boolean => drawing.steps.some((s) => s.onFail !== null)

/** A zoom step: the scale minus or plus 0.1, rounded to one decimal, kept within 0.5 and 2. */
export const zoomStep = (scale: number, delta: number): number =>
  Math.min(2, Math.max(0.5, Math.round((scale + delta) * 10) / 10))

/**
 * The scale that fits a drawing `boxHeight` tall into `areaHeight`: never above 1, rounded down to a 0.1 step, never
 * below 0.5.
 */
export const fitScale = (boxHeight: number, areaHeight: number): number =>
  Math.max(0.5, Math.floor(Math.min(1, areaHeight / boxHeight) * 10 + 1e-9) / 10)

/** The toolbar's percentage: `Math.round(scale * 100)` followed by `%`. */
export const percent = (scale: number): string => `${Math.round(scale * 100)}%`

/** The label of a YAML key: every `-` and `.` becomes a space and the first letter is upper-cased (`runs-on` → `Runs on`). */
export function keyLabel(key: string): string {
  const words = key.replace(/[-.]/g, " ")
  return words.charAt(0).toUpperCase() + words.slice(1)
}
