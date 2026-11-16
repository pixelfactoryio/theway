/** What the workflow page's panels read from a workflow's text, and the values their selects offer. Pure: no React, no DOM. */
import { isMap, isScalar, isSeq, type Node, type Pair, parseDocument, type YAMLMap } from "yaml"
import { promptRef, type RunsOn } from "../../../core/language-schema"
import type { PromptRow } from "./files"
import { findPrompt } from "./workflow"
import { isNull, keyOf, node } from "./yaml-nodes"

/** The places a step runs, in the order the selects offer them. */
export const RUNS_ON_ORDER = ["session", "agents"] as const satisfies readonly RunsOn[]

// ---------------------------------------------------------------------------------------------------------------------
// What the forms read

/** A text control's value: its text, or `null` when the control cannot show it (disabled, written by nothing). */
export type TextValue = string | null

/** The YAML source text of a node. */
function sourceOf(text: string, node: unknown): string {
  const range = (node as Node | null)?.range
  return range === undefined || range === null ? String(node ?? "") : text.slice(range[0], range[1])
}

/** A select's value: `null` when absent, else the value as written (a scalar's text, or the node's source). */
function selectValue(text: string, node: unknown, present: boolean): string | null {
  if (!present) return null
  if (isScalar(node)) return node.value === null ? sourceOf(text, node) : String(node.value)
  return sourceOf(text, node)
}

/** A text field's value: a scalar's text (`""` for null), `null` for a map or a list. */
function textValue(node: unknown): TextValue {
  if (node === undefined || isNull(node)) return ""
  if (isScalar(node)) return String(node.value)
  return null
}

/** The fields of a `with` map: each key's text value. */
export type WithForm =
  /** No `with`, a null one, or a map. */
  | { editable: true; values: Map<string, TextValue> }
  /** A `with` that is neither a map nor null: its fields are disabled. */
  | { editable: false }

function withForm(map: YAMLMap): WithForm {
  const w = node(map, "with")
  if (map.has("with") && !isMap(w) && !isNull(w)) return { editable: false }
  const values = new Map<string, TextValue>()
  if (isMap(w)) for (const p of w.items) values.set(keyOf(p), textValue(p.value))
  return { editable: true, values }
}

/** The `matrix` as the form shows it. */
export type MatrixForm = { state: "off" } | { state: "edit"; key: string; values: string[] } | { state: "other" }

function matrixForm(step: YAMLMap): MatrixForm {
  if (!step.has("matrix")) return { state: "off" }
  const m = node(step, "matrix")
  if (!isMap(m) || m.items.length !== 1) return { state: "other" }
  const pair = m.items[0] as Pair
  if (!isScalar(pair.key)) return { state: "other" }
  const key = String(pair.key.value)
  if (isNull(pair.value)) return { state: "edit", key, values: [] }
  if (isSeq(pair.value) && pair.value.items.every((v) => isScalar(v) && typeof v.value === "string")) {
    return { state: "edit", key, values: pair.value.items.map((v) => String((v as { value: unknown }).value)) }
  }
  return { state: "other" }
}

/** The on-fail as the form shows it. */
export type OnFailForm = {
  /** The prompt name its `uses` names, else the value as written (an invalid option), `""` for a map with no `uses`. */
  value: string
  /** The prompt it names, found in the workflow's context; `null` when none is. */
  prompt: PromptRow | null
  with: WithForm
  model: string | null
}

/** A step as the step panel shows it. */
export type StepForm =
  | { valid: false }
  | {
      valid: true
      /** `uses` as written; `null` when missing. */
      uses: string | null
      /** The prompt its `uses` names, found in the workflow's context; `null` when none is. */
      prompt: PromptRow | null
      runsOn: string | null
      model: string | null
      with: WithForm
      matrix: MatrixForm
      onFail: OnFailForm | null
      /**
       * `tries`: the number as written, in range or not (the field shows it, its error marks it); `null` when absent;
       * `"bad"` for a value that is not a finite number, which its control cannot show.
       */
      tries: number | null | "bad"
    }

/** Step `index` of a workflow's text as the step panel shows it; `null` when the text has no such step. */
export function stepForm(
  text: string,
  index: number,
  prompts: readonly PromptRow[],
  project: string | null,
): StepForm | null {
  const doc = parseDocument(text, { logLevel: "silent" })
  const root = doc.contents
  if (!isMap(root)) return null
  const seq = node(root, "steps")
  if (!isSeq(seq) || index < 0 || index >= seq.items.length) return null
  const step = seq.items[index]
  if (!isMap(step)) return { valid: false }
  const find = (v: unknown): PromptRow | null => {
    const name = promptRef(v)
    return name === null ? null : findPrompt(prompts, project, name)
  }
  const usesNode = node(step, "uses")
  const uses = step.has("uses")
    ? isScalar(usesNode) && usesNode.value !== null
      ? String(usesNode.value)
      : sourceOf(text, usesNode)
    : null

  let onFail: OnFailForm | null = null
  if (step.has("on-fail")) {
    const of = node(step, "on-fail")
    if (isMap(of)) {
      const u = node(of, "uses")
      const raw = isScalar(u) ? u.value : undefined
      const name = promptRef(raw)
      onFail = {
        value: !of.has("uses") ? "" : (name ?? selectValue(text, u, true) ?? ""),
        prompt: find(raw),
        with: withForm(of),
        model: selectValue(text, node(of, "model"), of.has("model")),
      }
    } else {
      const raw = isScalar(of) ? of.value : undefined
      const name = promptRef(raw)
      onFail = {
        value: name ?? selectValue(text, of, true) ?? "",
        prompt: find(raw),
        with: { editable: true, values: new Map() },
        model: null,
      }
    }
  }
  const triesNode = node(step, "tries")
  const t = isScalar(triesNode) ? triesNode.value : undefined
  const tries = !step.has("tries") ? null : typeof t === "number" && Number.isFinite(t) ? t : "bad"
  return {
    valid: true,
    uses,
    prompt: find(isScalar(usesNode) ? usesNode.value : undefined),
    runsOn: selectValue(text, node(step, "runs-on"), step.has("runs-on")),
    model: selectValue(text, node(step, "model"), step.has("model")),
    with: withForm(step),
    matrix: matrixForm(step),
    onFail,
    tries,
  }
}

/** One input as the workflow panel shows it; a field `null` cannot be shown by its control. */
export type InputForm = {
  name: string
  /** False for a declaration that is neither a map nor null: its fields are disabled. */
  editable: boolean
  type: string | null
  description: TextValue
  required: boolean | null
  default: TextValue
}

/** The workflow's own keys as the workflow panel shows them. */
export type WorkflowForm = {
  description: TextValue
  runsOn: string | null
  /** `null`: a value the switch cannot show. */
  default: boolean | null
  /** False for an `inputs` that is neither a map nor null: its fields and Add input are disabled. */
  inputsEditable: boolean
  inputs: InputForm[]
}

/** A workflow's text as the workflow panel shows it; `null` when its root is not a map. */
export function workflowForm(text: string): WorkflowForm | null {
  const doc = parseDocument(text, { logLevel: "silent" })
  const root = doc.contents
  if (!isMap(root)) return null
  const def = node(root, "default")
  const defValue = isScalar(def) ? def.value : undefined
  const inputs = node(root, "inputs")
  const inputsEditable = !root.has("inputs") || isMap(inputs) || isNull(inputs)
  const list: InputForm[] = isMap(inputs)
    ? inputs.items.map((p): InputForm => {
        const d = p.value
        const name = keyOf(p)
        if (!isMap(d)) {
          const editable = isNull(d)
          return {
            name,
            editable,
            type: "text",
            description: editable ? "" : null,
            required: editable ? false : null,
            default: editable ? "" : null,
          }
        }
        const req = node(d, "required")
        const reqValue = !d.has("required") ? false : isScalar(req) && typeof req.value === "boolean" ? req.value : null
        return {
          name,
          editable: true,
          type: d.has("type") ? selectValue(text, node(d, "type"), true) : "text",
          description: textValue(node(d, "description")),
          required: reqValue,
          default: textValue(node(d, "default")),
        }
      })
    : []
  return {
    description: textValue(node(root, "description")),
    runsOn: selectValue(text, node(root, "runs-on"), root.has("runs-on")),
    default: !root.has("default") ? false : typeof defValue === "boolean" ? defValue : null,
    inputsEditable,
    inputs: list,
  }
}

/** The matrix values a textarea's text gives: its lines, trimmed, blank ones dropped. */
export const matrixLines = (value: string): string[] =>
  value
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "")

/** The error of a key field (an input's name, the matrix Key): empty, taken by a sibling, else `null`. */
export function keyError(name: string, siblings: readonly string[]): string | null {
  if (name === "") return "A name is required."
  if (siblings.includes(name)) return "This name is already used."
  return null
}
