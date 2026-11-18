/**
 * Editing a workflow's text from the canvas: each edit loads the text with `parseDocument`, changes the Document's
 * nodes and prints it again, so values, comments, blank lines and scalar styles stay as written. Pure: no React, no
 * DOM.
 */
import { type Document, isAlias, isMap, isScalar, isSeq, type Pair, parseDocument, visit, YAMLMap, YAMLSeq } from "yaml"
import { promptUses } from "../../../core/language-schema"
import { lineSeparatorOf, type PromptRow } from "./files"
import { isNull, keyOf, node } from "./yaml-nodes"

/** How every edit prints the Document. */
const PRINT = { lineWidth: 0, flowCollectionPadding: false } as const

/** Thrown inside an edit that cannot apply: the text stays as it was. */
class NoEdit extends Error {}

const refuse = (): never => {
  throw new NoEdit()
}

/**
 * `text` changed by `change`: loaded with `parseDocument`, changed, printed with `lineWidth: 0` and
 * `flowCollectionPadding: false`, every `\n` written `\r\n` when the text's first line break is `\r\n`. A text that does
 * not parse, a change that leaves the Document as it printed, or a change or print that throws, gives `text` back
 * unchanged.
 */
export function editText(text: string, change: (doc: Document, root: YAMLMap) => void): string {
  try {
    const doc = parseDocument(text, { logLevel: "silent" })
    if (doc.errors.length > 0 || !isMap(doc.contents)) return text
    const before = doc.toString(PRINT)
    change(doc, doc.contents)
    const out = doc.toString(PRINT)
    if (out === before) return text
    return lineSeparatorOf(text) === "\r\n" ? out.replaceAll("\n", "\r\n") : out
  } catch {
    return text
  }
}

/** Whether a workflow's Document holds an anchor or an alias: the canvas then edits nothing. */
export function hasAnchors(text: string): boolean {
  const doc = parseDocument(text, { logLevel: "silent" })
  let found = false
  visit(doc, {
    Alias() {
      found = true
      return visit.BREAK
    },
    Node(_, node) {
      if (node.anchor !== undefined && node.anchor !== null && node.anchor !== "") {
        found = true
        return visit.BREAK
      }
      return undefined
    },
  })
  return found || isAlias(doc.contents)
}

/** A new empty block map. */
function blockMap(doc: Document): YAMLMap {
  const map = doc.createNode({}) as YAMLMap
  map.flow = false
  return map
}

/** The steps list of the Document, refused when it has none. */
function stepsOf(root: YAMLMap): YAMLSeq {
  const seq = node(root, "steps")
  return isSeq(seq) ? seq : refuse()
}

/** Step `index` as a map, refused for any other node. */
function stepOf(root: YAMLMap, index: number): YAMLMap {
  const node = stepsOf(root).items[index]
  return isMap(node) ? node : refuse()
}

/** The names of the workflow's inputs, as written. */
function inputNames(root: YAMLMap): string[] {
  const inputs = node(root, "inputs")
  return isMap(inputs) ? inputs.items.map(keyOf) : []
}

/** The value a required input of a prompt is written with: `${{ inputs.<name> }}` when the workflow declares it, else `""`. */
const requiredValue = (root: YAMLMap, name: string): string =>
  inputNames(root).includes(name) ? `\${{ inputs.${name} }}` : ""

/** The `with` a new step or on-fail writes: its prompt's required inputs, in declaration order; `null` for none. */
function requiredWith(root: YAMLMap, prompt: PromptRow): Record<string, string> | null {
  const required = prompt.inputs.filter((i) => i.required)
  return required.length === 0 ? null : Object.fromEntries(required.map((i) => [i.name, requiredValue(root, i.name)]))
}

/**
 * The Change rule on the `with` of `map` (a step or an on-fail map): the keys the prompt declares are kept, its
 * required inputs that are missing are added, the other keys are removed, and a `with` left empty is removed. A `with`
 * that is neither a map nor null is left untouched.
 */
function changeWith(doc: Document, root: YAMLMap, map: YAMLMap, prompt: PromptRow): void {
  const declared = new Set(prompt.inputs.map((i) => i.name))
  let w = node(map, "with")
  if (map.has("with") && !isMap(w) && !isNull(w)) return
  if (isMap(w)) w.items = w.items.filter((p) => declared.has(keyOf(p)))
  const current = w
  const missing = prompt.inputs.filter((i) => i.required && !(isMap(current) && current.has(i.name)))
  if (missing.length > 0) {
    if (!isMap(w)) {
      w = blockMap(doc)
      map.set("with", w)
    }
    for (const i of missing) (w as YAMLMap).set(i.name, requiredValue(root, i.name))
  }
  if (isMap(w) && w.items.length === 0) map.delete("with")
}

/**
 * Sets input `name` of the `with` of `map` to `value`: an empty optional value removes its key, and a `with` left empty
 * is removed; a null `with` becomes a block map. A `with` that holds another value, or a key holding a map or a list,
 * is refused.
 */
function setWith(doc: Document, map: YAMLMap, name: string, value: string, required: boolean): void {
  let w = node(map, "with")
  if (map.has("with") && !isMap(w) && !isNull(w)) refuse()
  if (isMap(w)) {
    const held = node(w, name)
    if (isMap(held) || isSeq(held)) refuse()
  }
  if (value === "" && !required) {
    if (isMap(w)) {
      w.delete(name)
      if (w.items.length === 0) map.delete("with")
    }
    return
  }
  if (!isMap(w)) {
    w = blockMap(doc)
    map.set("with", w)
  }
  ;(w as YAMLMap).set(name, value)
}

// ---------------------------------------------------------------------------------------------------------------------
// Steps

/**
 * Adds a step running `prompt` at `at` (0 is before the first step): `uses` then `with` holding the prompt's required
 * inputs in its declaration order (no `with` when it has none). With `steps: []` or no `steps` key, the step goes in
 * the list the Document holds, created when absent, set to block style when it was empty.
 */
export function addStep(text: string, at: number, prompt: PromptRow): string {
  return editText(text, (doc, root) => {
    let seq = node(root, "steps")
    if (!isSeq(seq)) {
      if (root.has("steps") && !isNull(seq)) refuse()
      seq = new YAMLSeq(doc.schema)
      root.set("steps", seq)
    }
    const list = seq as YAMLSeq
    if (at < 0 || at > list.items.length) refuse()
    if (list.items.length === 0) list.flow = false
    const value: Record<string, unknown> = { uses: promptUses(prompt.name) }
    const w = requiredWith(root, prompt)
    if (w !== null) value.with = w
    list.items.splice(at, 0, doc.createNode(value))
  })
}

/** Moves step `index` up (`-1`) or down (`1`). */
export function moveStep(text: string, index: number, delta: -1 | 1): string {
  return editText(text, (_, root) => {
    const seq = stepsOf(root)
    const to = index + delta
    if (index < 0 || index >= seq.items.length || to < 0 || to >= seq.items.length) refuse()
    const [item] = seq.items.splice(index, 1)
    seq.items.splice(to, 0, item)
  })
}

/** Removes step `index`; removing the last step leaves `steps: []`. */
export function removeStep(text: string, index: number): string {
  return editText(text, (_, root) => {
    const seq = stepsOf(root)
    if (index < 0 || index >= seq.items.length) refuse()
    seq.items.splice(index, 1)
    if (seq.items.length === 0) seq.flow = true
  })
}

/** Changes the prompt of step `index`: its `uses`, and the Change rule on its `with`. */
export function changeStepPrompt(text: string, index: number, prompt: PromptRow): string {
  return editText(text, (doc, root) => {
    const step = stepOf(root, index)
    step.set("uses", promptUses(prompt.name))
    changeWith(doc, root, step, prompt)
  })
}

/** Sets `runs-on` or `model` of step `index`; `null` removes the key. */
export function setStepKey(text: string, index: number, key: "runs-on" | "model", value: string | null): string {
  return editText(text, (_, root) => {
    const step = stepOf(root, index)
    if (value === null) step.delete(key)
    else step.set(key, value)
  })
}

/** Sets input `name` of the `with` of step `index`. */
export function setStepWith(text: string, index: number, name: string, value: string, required: boolean): string {
  return editText(text, (doc, root) => setWith(doc, stepOf(root, index), name, value, required))
}

/** The only key of an editable `matrix` of step `index`. */
function matrixPair(root: YAMLMap, index: number): Pair {
  const matrix = stepOf(root, index).get("matrix", true)
  if (!isMap(matrix) || matrix.items.length !== 1) return refuse()
  const pair = matrix.items[0] as Pair
  return isScalar(pair.key) ? pair : refuse()
}

/** Turns the `matrix` of step `index` on (`item: null`) or off (removed). */
export function setMatrix(text: string, index: number, on: boolean): string {
  return editText(text, (doc, root) => {
    const step = stepOf(root, index)
    if (!on) step.delete("matrix")
    else if (!step.has("matrix")) step.set("matrix", doc.createNode({ item: null }))
  })
}

/** Renames the matrix key of step `index` in place: a non-empty name only. */
export function renameMatrixKey(text: string, index: number, name: string): string {
  return editText(text, (_, root) => {
    if (name === "") refuse()
    ;(matrixPair(root, index).key as { value: unknown }).value = name
  })
}

/**
 * Sets the matrix values of step `index`: the items of its list replaced (the node and its style kept), a new flow
 * list when the key held no list, the null value for none.
 */
export function setMatrixValues(text: string, index: number, values: readonly string[]): string {
  return editText(text, (doc, root) => {
    const pair = matrixPair(root, index)
    if (pair.value !== null && !isNull(pair.value) && !isSeq(pair.value)) refuse()
    if (values.length === 0) {
      if (!isNull(pair.value)) pair.value = doc.createNode(null)
      return
    }
    if (isSeq(pair.value)) {
      pair.value.items = values.map((v) => doc.createNode(v))
      return
    }
    const seq = doc.createNode([...values]) as YAMLSeq
    seq.flow = true
    pair.value = seq
  })
}

/**
 * Sets the on-fail of step `index` to `prompt`, `null` removing `on-fail` and `tries`. An on-fail map gets its `uses`
 * and the Change rule on its `with`; otherwise it is written as the string `prompts/<name>.md`, or as a block map of
 * `uses` then `with` when a required input must be written. A step with no `tries` gets `tries: 1`.
 */
export function setOnFail(text: string, index: number, prompt: PromptRow | null): string {
  return editText(text, (doc, root) => {
    const step = stepOf(root, index)
    if (prompt === null) {
      step.delete("on-fail")
      step.delete("tries")
      return
    }
    const ref = promptUses(prompt.name)
    const current = node(step, "on-fail")
    if (isMap(current)) {
      current.set("uses", ref)
      changeWith(doc, root, current, prompt)
    } else {
      const w = requiredWith(root, prompt)
      if (w === null) step.set("on-fail", ref)
      else {
        const map = doc.createNode({ uses: ref, with: w }) as YAMLMap
        map.flow = false
        step.set("on-fail", map)
      }
    }
    if (!step.has("tries")) step.set("tries", 1)
  })
}

/** The on-fail of a step as a map to write in: a string one becomes a block map of `uses` alone. */
function onFailMap(doc: Document, step: YAMLMap): YAMLMap {
  const current = node(step, "on-fail")
  if (isMap(current)) return current
  if (!isScalar(current) || typeof current.value !== "string") return refuse()
  const map = blockMap(doc)
  map.set("uses", current.value)
  step.set("on-fail", map)
  return map
}

/** Sets input `name` of the on-fail's `with` of step `index`; a string on-fail becomes a map of `uses` then `with`. */
export function setOnFailWith(text: string, index: number, name: string, value: string, required: boolean): string {
  return editText(text, (doc, root) => {
    const step = stepOf(root, index)
    const current = node(step, "on-fail")
    // An empty optional value under a string on-fail has nothing to remove.
    if (value === "" && !required && !isMap(current)) return
    setWith(doc, onFailMap(doc, step), name, value, required)
  })
}

/** Sets the on-fail's `model` of step `index`; `null` removes it. A string on-fail becomes a map of `uses` then `model`. */
export function setOnFailModel(text: string, index: number, value: string | null): string {
  return editText(text, (doc, root) => {
    const step = stepOf(root, index)
    const current = node(step, "on-fail")
    if (value === null) {
      if (isMap(current)) current.delete("model")
      return
    }
    onFailMap(doc, step).set("model", value)
  })
}

/** Sets `tries` of step `index`, an integer from 1 to 10; `null` removes it. */
export function setTries(text: string, index: number, tries: number | null): string {
  return editText(text, (_, root) => {
    const step = stepOf(root, index)
    if (tries === null) step.delete("tries")
    else if (Number.isInteger(tries) && tries >= 1 && tries <= 10) step.set("tries", tries)
    else refuse()
  })
}

// ---------------------------------------------------------------------------------------------------------------------
// Workflow

/** Sets the workflow's `description` (always written, an empty one as `""`) or `runs-on`. */
export function setWorkflowKey(text: string, key: "description" | "runs-on", value: string): string {
  return editText(text, (_, root) => {
    const held = node(root, key)
    if (isMap(held) || isSeq(held)) refuse()
    root.set(key, value)
  })
}

/** Sets the workflow's `default`: `false` removes the key. */
export function setDefault(text: string, on: boolean): string {
  return editText(text, (_, root) => {
    if (on) root.set("default", true)
    else root.delete("default")
  })
}

/** The workflow's `inputs` as a map to write in: a missing or null one becomes a block map, any other value is refused. */
function inputsMap(doc: Document, root: YAMLMap): YAMLMap {
  const inputs = node(root, "inputs")
  if (isMap(inputs)) return inputs
  if (root.has("inputs") && !isNull(inputs)) return refuse()
  const map = blockMap(doc)
  root.set("inputs", map)
  return map
}

/** The name "Add input" gives: `input`, then `input2`, `input3`… the first no input has. */
export function nextInputName(taken: readonly string[]): string {
  if (!taken.includes("input")) return "input"
  let n = 2
  while (taken.includes(`input${n}`)) n += 1
  return `input${n}`
}

/** Adds an input named by `nextInputName`, with an empty description. */
export function addInput(text: string): string {
  return editText(text, (doc, root) => {
    const inputs = inputsMap(doc, root)
    inputs.set(nextInputName(inputs.items.map(keyOf)), doc.createNode({ description: "" }))
  })
}

/** Renames input `from` to `to` in place: a non-empty name no other input has. */
export function renameInput(text: string, from: string, to: string): string {
  return editText(text, (_, root) => {
    const inputs = node(root, "inputs")
    if (!isMap(inputs) || to === "" || (to !== from && inputs.has(to))) refuse()
    const pair = (inputs as YAMLMap).items.find((p) => keyOf(p) === from)
    if (pair === undefined || !isScalar(pair.key)) refuse()
    ;((pair as Pair).key as { value: unknown }).value = to
  })
}

/** Removes input `name`; removing the last one removes `inputs`. */
export function removeInput(text: string, name: string): string {
  return editText(text, (_, root) => {
    const inputs = node(root, "inputs")
    if (!isMap(inputs) || !inputs.has(name)) refuse()
    ;(inputs as YAMLMap).delete(name)
    if ((inputs as YAMLMap).items.length === 0) root.delete("inputs")
  })
}

/** A field of an input declaration. */
export type InputKey = "type" | "description" | "required" | "default"

/**
 * Sets a field of input `name`: `type: text`, `required: false` and an empty `default` remove their key, `description`
 * is always written, and turning `required` on removes `default`. A null declaration becomes a block map.
 */
export function setInputField(text: string, name: string, key: InputKey, value: string | boolean): string {
  return editText(text, (doc, root) => {
    const inputs = node(root, "inputs")
    if (!isMap(inputs)) return refuse()
    const pair = inputs.items.find((p) => keyOf(p) === name)
    if (pair === undefined) return refuse()
    let decl = pair.value
    if (!isMap(decl)) {
      if (!isNull(decl)) refuse()
      decl = blockMap(doc)
      pair.value = decl
    }
    const d = decl as YAMLMap
    const held = node(d, key)
    if (isMap(held) || isSeq(held)) refuse()
    if (key === "required") {
      if (value === true) {
        d.set("required", true)
        d.delete("default")
      } else d.delete("required")
    } else if (key === "type") {
      if (value === "text") d.delete("type")
      else d.set("type", value)
    } else if (key === "default") {
      if (value === "") d.delete("default")
      else d.set("default", value)
    } else d.set("description", value)
  })
}
