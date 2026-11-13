import { isolateHistory } from "@codemirror/commands"
import { cn } from "cn"
import { FileTextIcon, PlusIcon, RotateCcwIcon, TextCursorInputIcon, Trash2Icon, XIcon } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"
import { Link } from "wouter"

import type { DraftStore } from "@/components/code-view"
import { KeyLabelText, LinesAlert, PanelRow } from "@/components/file-page"
import { IconTile } from "@/components/reui/icon-tile"
import { NumberField, NumberFieldDecrement, NumberFieldGroup, NumberFieldIncrement, NumberFieldInput } from "@/components/reui/number-field"
import { CopyField } from "@/components/text"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSeparator, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { type Tone, toneTile } from "@/components/workflow-canvas"
import { appliesTo, type FileBody, filePath, type PromptRow } from "@/lib/files"
import { findPrompt } from "@/lib/workflow"
import {
  addInput,
  INPUT_TYPES,
  type InputKey,
  keyError,
  matrixLines,
  type InputForm,
  type MatrixForm,
  MODELS,
  type Place,
  placeLine,
  removeInput,
  renameInput,
  renameMatrixKey,
  RUNS_ON,
  setDefault,
  setInputField,
  setMatrix,
  setMatrixValues,
  setOnFail,
  setOnFailModel,
  setOnFailWith,
  setStepKey,
  setStepWith,
  setTries,
  setWorkflowKey,
  stepForm,
  stepPromptNames,
  type TextValue,
  type WithForm,
  workflowForm,
} from "@/lib/workflow-edit"
import { useLabel } from "@/shell/files"

/** How an edit joins the undo history: its own step (`full`), the first keystroke of a field (`before`), or typing (`null`). */
export type HistoryMode = "full" | "before" | null

/** An edit of the draft's text; true when it changed the draft. */
export type Write = (edit: (text: string) => string, mode?: HistoryMode) => boolean

/**
 * Applies an edit to the draft: its text read as `state.sliceDoc()`, the new text dispatched as one whole-text
 * replacement with its history annotation. An edit that gives the text back dispatches nothing.
 */
export function applyEdit(store: DraftStore, edit: (text: string) => string, mode: HistoryMode = "full"): boolean {
  const state = store.state
  const text = state.sliceDoc()
  const next = edit(text)
  if (next === text) return false
  store.dispatch({
    changes: { from: 0, to: state.doc.length, insert: next },
    annotations: mode === null ? [] : [isolateHistory.of(mode)],
  })
  return true
}

/** The FieldDescription of a control that cannot show its value. */
const ON_YAML = "Edit this value on the YAML tab."

/** The value of a select's default option (the workflow's, the prompt's, None). */
const DEFAULT = "\u0000default"

/** Each line under its field. */
function Errors({ lines }: { lines: readonly string[] | undefined }) {
  if (lines === undefined || lines.length === 0) return null
  return (
    <>
      {lines.map((line, i) => (
        <FieldError key={i} className="font-mono text-xs">
          {line}
        </FieldError>
      ))}
    </>
  )
}

/**
 * A text control bound to the draft: while it has focus it shows what was typed, else the draft's value (and again
 * the draft's value whenever the draft changes by another way). The first keystroke after it takes focus starts a new
 * undo step; the next ones join it as typing does. `null` disables it.
 */
function DraftText({
  id,
  value,
  onWrite,
  multiline = false,
  rows,
  label,
  className,
  disabled = false,
  invalid = false,
}: {
  id: string
  value: TextValue
  onWrite: (value: string, mode: HistoryMode) => boolean
  multiline?: boolean
  rows?: number
  label?: string
  className?: string
  disabled?: boolean
  invalid?: boolean
}) {
  const [typed, setTyped] = useState<string | null>(null)
  const fresh = useRef(false)
  const self = useRef(false)
  // A change of the draft by another way shows the draft's value, even while focused.
  useEffect(() => {
    if (self.current) {
      self.current = false
      return
    }
    setTyped((t) => (t === null ? null : (value ?? "")))
  }, [value])
  const shown = typed ?? value ?? ""
  const props = {
    id,
    value: shown,
    disabled: disabled || value === null,
    "aria-label": label,
    "aria-invalid": invalid || undefined,
    className,
    onFocus: () => {
      setTyped(value ?? "")
      fresh.current = true
    },
    onBlur: () => setTyped(null),
    onChange: (e: { target: { value: string } }) => {
      const next = e.target.value
      setTyped(next)
      const mode = fresh.current ? "before" : null
      fresh.current = false
      if (onWrite(next, mode)) self.current = true
    },
  }
  return multiline ? <Textarea rows={rows} {...props} /> : <Input {...props} />
}

/** A select option. */
type Option = { value: string; label: string }

/**
 * A select of `options`, the default option (`first`, value `null`) first when given. A value the file holds that the
 * select does not offer shows first, marked "invalid". With no default option, `null` shows the placeholder.
 */
function ChoiceSelect({
  id,
  value,
  first,
  options,
  placeholder,
  onChange,
  className,
  disabled = false,
}: {
  id: string
  value: string | null
  first?: string
  options: readonly Option[]
  placeholder?: string
  onChange: (value: string | null) => void
  className?: string
  disabled?: boolean
}) {
  const known = (v: string) => options.some((o) => o.value === v)
  const items: Option[] = [
    ...(value !== null && !known(value) ? [{ value, label: `${value} (invalid)` }] : []),
    ...(first !== undefined ? [{ value: DEFAULT, label: first }] : []),
    ...options,
  ]
  const selected = value ?? (first !== undefined ? DEFAULT : null)
  return (
    <Select
      items={items}
      value={selected}
      disabled={disabled}
      onValueChange={(v) => {
        if (v === null || v === selected) return
        if (v === DEFAULT) onChange(null)
        else if (known(v as string)) onChange(v as string)
      }}
    >
      <SelectTrigger id={id} className={cn("w-full", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {items.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** A field label that is a YAML key, as `KeyLabelText` writes it. */
function KeyLabel({ htmlFor, yamlKey }: { htmlFor?: string; yamlKey: string }) {
  return (
    <FieldLabel htmlFor={htmlFor}>
      <KeyLabelText yamlKey={yamlKey} />
    </FieldLabel>
  )
}

const MODEL_OPTIONS: Option[] = MODELS.map((m) => ({ value: m, label: m }))
const RUNS_ON_OPTIONS: Option[] = RUNS_ON.map((r) => ({ value: r, label: r }))
const TYPE_OPTIONS: Option[] = INPUT_TYPES.map((t) => ({ value: t, label: t }))

/** The lines of one panel by the field they name, and those its alert shows. */
function byField(places: readonly { line: string; place: Place }[], shown: (field: string) => boolean) {
  const fields = new Map<string, string[]>()
  const alert: string[] = []
  for (const { line, place } of places) {
    if (place.panel === "none") continue
    if (place.field === "alert" || !shown(place.field)) alert.push(line)
    else fields.set(place.field, [...(fields.get(place.field) ?? []), line])
  }
  return { fields, alert }
}

/** The fields of a prompt's inputs written under a `with`: one text field each. */
function WithFields({
  idPrefix,
  labelPrefix,
  prompt,
  form,
  lines,
  onWrite,
}: {
  idPrefix: string
  labelPrefix: string
  prompt: PromptRow
  form: WithForm
  lines: Map<string, string[]>
  onWrite: (name: string, value: string, required: boolean, mode: HistoryMode) => boolean
}) {
  return (
    <>
      {prompt.inputs.map((input) => {
        const id = `${idPrefix}-${input.name}`
        // A key that is absent is an empty field; a map or a list (null) is disabled.
        const held = form.editable ? form.values.get(input.name) : null
        const v = held === undefined ? "" : held
        const errors = lines.get(`${labelPrefix}${input.name}`)
        return (
          <Field key={input.name}>
            <FieldLabel htmlFor={id} className="gap-1">
              <span className="font-mono">{`${labelPrefix.replace(/^with\./, "")}${input.name}`}</span>
              {input.required ? <span className="font-normal text-muted-foreground">required</span> : null}
            </FieldLabel>
            <DraftText
              id={id}
              value={v}
              className="font-mono"
              invalid={errors !== undefined}
              onWrite={(value, mode) => onWrite(input.name, value, input.required, mode)}
            />
            {input.description !== "" ? <FieldDescription>{input.description}</FieldDescription> : null}
            {v === null ? <FieldDescription>{ON_YAML}</FieldDescription> : null}
            <Errors lines={errors} />
          </Field>
        )
      })}
    </>
  )
}

/** The `uses` row: the prompt's page as a link, else the value as written in the code font. */
function UsesValue({ uses, prompt }: { uses: string | null; prompt: PromptRow | null }) {
  if (prompt === null) return <span className="min-h-5 font-mono text-sm break-all">{uses ?? ""}</span>
  return (
    <Link href={`${filePath("prompts", prompt.project, prompt.name)}?`} className="text-sm underline-offset-4 hover:underline">
      prompts/{prompt.name}.md
    </Link>
  )
}

/**
 * The panel of a step, and of its on-fail card (scrolled to the `on-fail` group): its header with Change, the alert,
 * its fields as a form, and Remove step. A step that is not a map shows only the header, the alert and Remove step.
 */
export function StepEditPanel({
  text,
  index,
  total,
  lines,
  prompts,
  project,
  workflowRunsOn,
  onFailCard,
  tone,
  write,
  onChange,
  onRemove,
}: {
  text: string
  index: number
  total: number
  lines: readonly string[]
  prompts: readonly PromptRow[]
  project: string | null
  workflowRunsOn: string | null
  onFailCard: boolean
  /** The header tile's tone: the selected card's. */
  tone: Tone
  write: Write
  onChange: () => void
  onRemove: () => void
}) {
  const uid = useId()
  const onFailRef = useRef<HTMLDivElement>(null)
  const form = stepForm(text, index, prompts, project)
  useEffect(() => {
    if (onFailCard) onFailRef.current?.scrollIntoView({ block: "start" })
  }, [onFailCard, index])
  if (form === null) return null
  const n = index + 1
  const places = lines.map((line) => ({ line, place: placeLine(line) })).filter((p) => p.place.panel === "step" && p.place.index === index)

  if (!form.valid) {
    return (
      <div className="flex flex-col gap-6 p-4">
        <StepHeader n={n} total={total} name={`Step ${n}`} code={false} tone={tone} onChange={null} />
        <LinesAlert lines={places.map((p) => p.line)} />
        <RemoveStep onRemove={onRemove} />
      </div>
    )
  }

  const runsAgents = (form.runsOn === "agents" || form.runsOn === "session" ? form.runsOn : workflowRunsOn) === "agents"
  const showModel = runsAgents || form.model !== null
  const withPrompt = form.prompt !== null && form.prompt.inputs.length > 0 ? form.prompt : null
  const onFail = form.onFail
  const onFailPrompt = onFail?.prompt ?? null
  const showOnFailModel = onFail !== null && (runsAgents || onFail.model !== null)
  const showTries = onFail !== null || form.tries !== null
  const shown = (field: string): boolean => {
    if (["uses", "runs-on", "matrix", "on-fail"].includes(field)) return true
    if (field === "model") return showModel
    if (field === "tries") return showTries
    if (field === "on-fail.model") return showOnFailModel
    if (field.startsWith("with.")) return withPrompt !== null && withPrompt.inputs.some((i) => `with.${i.name}` === field)
    if (field.startsWith("on-fail.with.")) return onFailPrompt !== null && onFailPrompt.inputs.some((i) => `on-fail.with.${i.name}` === field)
    return false
  }
  const { fields, alert } = byField(places, shown)
  const id = (k: string) => `${uid}-${k}`
  const prompt = form.prompt
  const name = prompt?.name ?? (form.uses === null ? "No prompt" : form.uses)
  const promptModel = (p: PromptRow | null) => `Prompt's (${p?.model ?? "none"})`
  const workflowRunsOnLabel = `Workflow's (${workflowRunsOn === "agents" || workflowRunsOn === "session" ? workflowRunsOn : "Not set"})`

  return (
    <div className="flex flex-col gap-6 p-4">
      <StepHeader n={n} total={total} name={name} code={prompt === null} tone={tone} onChange={onChange} />
      <LinesAlert lines={alert} />
      <div className="flex flex-col gap-4">
        <Field>
          <KeyLabel yamlKey="uses" />
          <UsesValue uses={form.uses} prompt={prompt} />
          <Errors lines={fields.get("uses")} />
        </Field>
        <Field>
          <KeyLabel htmlFor={id("runs-on")} yamlKey="runs-on" />
          <ChoiceSelect
            id={id("runs-on")}
            value={form.runsOn}
            first={workflowRunsOnLabel}
            options={RUNS_ON_OPTIONS}
            onChange={(v) => write((t) => setStepKey(t, index, "runs-on", v))}
          />
          <Errors lines={fields.get("runs-on")} />
        </Field>
        {showModel ? (
          <Field>
            <KeyLabel htmlFor={id("model")} yamlKey="model" />
            <ChoiceSelect
              id={id("model")}
              value={form.model}
              first={promptModel(prompt)}
              options={MODEL_OPTIONS}
              onChange={(v) => write((t) => setStepKey(t, index, "model", v))}
            />
            <Errors lines={fields.get("model")} />
          </Field>
        ) : null}
      </div>
      {withPrompt !== null ? (
        <FieldSet className="gap-4">
          <FieldLegend variant="label" className="mb-0">
            <KeyLabelText yamlKey="with" />
          </FieldLegend>
          <WithFields
            idPrefix={id("with")}
            labelPrefix="with."
            prompt={withPrompt}
            form={form.with}
            lines={fields}
            onWrite={(k, v, required, mode) => write((t) => setStepWith(t, index, k, v, required), mode)}
          />
        </FieldSet>
      ) : null}
      <MatrixGroup id={id("matrix")} index={index} matrix={form.matrix} lines={fields.get("matrix")} write={write} />
      <div ref={onFailRef} className="flex scroll-mt-4 flex-col gap-4">
        <Field>
          <KeyLabel htmlFor={id("on-fail")} yamlKey="on-fail" />
          <ChoiceSelect
            id={id("on-fail")}
            value={onFail === null ? null : onFail.value}
            first="None"
            options={stepPromptNames(prompts, project).map((p) => ({ value: p, label: p }))}
            onChange={(v) => {
              const p = v === null ? null : findPrompt(prompts, project, v)
              if (v !== null && (p === null || !p.header)) return
              write((t) => setOnFail(t, index, p))
            }}
          />
          <Errors lines={fields.get("on-fail")} />
        </Field>
        {onFail !== null && onFailPrompt !== null
          ? onFailPrompt.inputs.length > 0 && (
              <WithFields
                idPrefix={id("on-fail-with")}
                labelPrefix="on-fail.with."
                prompt={onFailPrompt}
                form={onFail.with}
                lines={fields}
                onWrite={(k, v, required, mode) => write((t) => setOnFailWith(t, index, k, v, required), mode)}
              />
            )
          : null}
        {showOnFailModel ? (
          <Field>
            <KeyLabel htmlFor={id("on-fail-model")} yamlKey="on-fail.model" />
            <ChoiceSelect
              id={id("on-fail-model")}
              value={onFail?.model ?? null}
              first={promptModel(onFailPrompt)}
              options={MODEL_OPTIONS}
              onChange={(v) => write((t) => setOnFailModel(t, index, v))}
            />
            <Errors lines={fields.get("on-fail.model")} />
          </Field>
        ) : null}
        {showTries ? (
          <Field>
            <KeyLabel htmlFor={id("tries")} yamlKey="tries" />
            <NumberField
              id={id("tries")}
              min={1}
              max={10}
              value={form.tries === "bad" ? null : form.tries}
              disabled={form.tries === "bad"}
              onValueChange={(v) => {
                if (v === null) write((t) => setTries(t, index, null))
                else if (Number.isInteger(v) && v >= 1 && v <= 10) write((t) => setTries(t, index, v))
              }}
            >
              <NumberFieldGroup aria-invalid={fields.has("tries") || undefined}>
                <NumberFieldDecrement aria-label="Decrease tries" />
                <NumberFieldInput aria-invalid={fields.has("tries") || undefined} />
                <NumberFieldIncrement aria-label="Increase tries" />
              </NumberFieldGroup>
            </NumberField>
            {form.tries === "bad" ? <FieldDescription>{ON_YAML}</FieldDescription> : null}
            <Errors lines={fields.get("tries")} />
          </Field>
        ) : null}
      </div>
      <RemoveStep onRemove={onRemove} />
    </div>
  )
}

/** The step panel's header: `Step N of M`, the step's name, and Change. */
function StepHeader({
  n,
  total,
  name,
  code,
  tone,
  onChange,
}: {
  n: number
  total: number
  name: string
  code: boolean
  tone: Tone
  onChange: (() => void) | null
}) {
  return (
    <div className="flex items-center gap-3">
      <IconTile size="sm" {...toneTile(tone)}>
        {tone === "on-fail" ? <RotateCcwIcon aria-hidden="true" /> : <FileTextIcon aria-hidden="true" />}
      </IconTile>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-xs text-muted-foreground">
          Step {n} of {total}
        </span>
        <h2 className={cn("truncate text-sm font-medium", code && "font-mono")}>{name}</h2>
      </div>
      {onChange !== null ? (
        <Button variant="outline" onClick={onChange}>
          Change
        </Button>
      ) : null}
    </div>
  )
}

/** The step panel's footer: Remove step. */
function RemoveStep({ onRemove }: { onRemove: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <FieldSeparator />
      <div>
        <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={onRemove}>
          <Trash2Icon aria-hidden="true" />
          Remove step
        </Button>
      </div>
    </div>
  )
}

/** The `matrix` group: a switch, then Key and Values when on. */
function MatrixGroup({
  id,
  index,
  matrix,
  lines,
  write,
}: {
  id: string
  index: number
  matrix: MatrixForm
  lines: string[] | undefined
  write: Write
}) {
  const [keyTyped, setKeyTyped] = useState<string | null>(null)
  const on = matrix.state !== "off"
  const editable = matrix.state === "edit"
  const keyErr = keyTyped === null ? null : keyError(keyTyped, [])
  return (
    <div className="flex flex-col gap-4">
      <Field orientation="horizontal">
        <Switch id={`${id}-on`} checked={on} onCheckedChange={(v) => write((t) => setMatrix(t, index, v))} />
        <KeyLabel htmlFor={`${id}-on`} yamlKey="matrix" />
      </Field>
      {on ? (
        <>
          <Field>
            <FieldLabel htmlFor={`${id}-key`}>Key</FieldLabel>
            <KeyText
              id={`${id}-key`}
              value={editable ? matrix.key : null}
              siblings={[]}
              onTyped={setKeyTyped}
              onWrite={(v, mode) => write((t) => renameMatrixKey(t, index, v), mode)}
            />
            {keyErr !== null ? <FieldError>{keyErr}</FieldError> : null}
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-values`}>Values, one per line</FieldLabel>
            <DraftText
              id={`${id}-values`}
              multiline
              rows={Math.max(2, editable ? matrix.values.length : 2)}
              value={editable ? matrix.values.join("\n") : null}
              className="min-h-0 font-mono"
              onWrite={(v, mode) => write((t) => setMatrixValues(t, index, matrixLines(v)), mode)}
            />
            {!editable ? <FieldDescription>Edit this matrix on the YAML tab.</FieldDescription> : null}
          </Field>
        </>
      ) : null}
      <Errors lines={lines} />
    </div>
  )
}

/**
 * A key field (an input's name, the matrix Key): it writes only a non-empty name no sibling has; otherwise the file
 * keeps the last written name, and `onTyped` lets the caller show why.
 */
function KeyText({
  id,
  value,
  siblings,
  label,
  onTyped,
  onWrite,
  className,
}: {
  id: string
  value: TextValue
  siblings: readonly string[]
  label?: string
  onTyped: (typed: string | null) => void
  onWrite: (value: string, mode: HistoryMode) => boolean
  className?: string
}) {
  const [typed, setTyped] = useState<string | null>(null)
  const fresh = useRef(false)
  const self = useRef(false)
  useEffect(() => {
    if (self.current) {
      self.current = false
      return
    }
    setTyped((t) => (t === null ? null : (value ?? "")))
    onTyped(null)
  }, [value])
  const err = typed === null ? null : keyError(typed, siblings)
  return (
    <Input
      id={id}
      aria-label={label}
      aria-invalid={err !== null || undefined}
      className={cn("font-mono", className)}
      value={typed ?? value ?? ""}
      disabled={value === null}
      onFocus={() => {
        setTyped(value ?? "")
        fresh.current = true
      }}
      onBlur={() => {
        setTyped(null)
        onTyped(null)
      }}
      onChange={(e) => {
        const next = e.target.value
        setTyped(next)
        onTyped(next)
        if (keyError(next, siblings) !== null) return
        const mode = fresh.current ? "before" : null
        fresh.current = false
        if (onWrite(next, mode)) self.current = true
      }}
    />
  )
}

/** One input of the workflow panel: name, type, description, required, default, and Remove. */
function InputBox({
  idPrefix,
  index,
  input,
  siblings,
  disabled,
  lines,
  write,
}: {
  idPrefix: string
  index: number
  input: InputForm
  siblings: readonly string[]
  disabled: boolean
  lines: Map<string, string[]>
  write: Write
}) {
  const [typed, setTyped] = useState<string | null>(null)
  const id = (k: string) => `${idPrefix}-${index}-${k}`
  const nameErr = typed === null ? null : keyError(typed, siblings)
  const at = (k: string) => lines.get(`inputs.${input.name}.${k}`)
  const field = (k: InputKey, value: string | boolean, mode: HistoryMode = "full") => write((t) => setInputField(t, input.name, k, value), mode)
  const editable = input.editable && !disabled
  return (
    <div className="flex flex-col gap-4 rounded-lg border p-3">
      <Field>
        <div className="flex items-center gap-2">
          <KeyText
            id={id("name")}
            label="Input name"
            value={disabled ? null : input.name}
            siblings={siblings}
            onTyped={setTyped}
            onWrite={(v, mode) => write((t) => renameInput(t, input.name, v), mode)}
          />
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove input ${input.name}`}
                  disabled={disabled}
                  onClick={() => write((t) => removeInput(t, input.name))}
                />
              }
            >
              <XIcon aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent>{`Remove input ${input.name}`}</TooltipContent>
          </Tooltip>
        </div>
        {nameErr !== null ? <FieldError>{nameErr}</FieldError> : null}
        <Errors lines={lines.get(`inputs.${input.name}`)} />
      </Field>
      <Field>
        <KeyLabel htmlFor={id("type")} yamlKey="type" />
        <ChoiceSelect
          id={id("type")}
          value={input.type}
          options={TYPE_OPTIONS}
          disabled={!editable}
          onChange={(v) => v !== null && field("type", v)}
        />
        <Errors lines={at("type")} />
      </Field>
      <Field>
        <KeyLabel htmlFor={id("description")} yamlKey="description" />
        <DraftText
          id={id("description")}
          value={editable ? input.description : null}
          onWrite={(v, mode) => field("description", v, mode)}
        />
        {input.editable && input.description === null ? <FieldDescription>{ON_YAML}</FieldDescription> : null}
        <Errors lines={at("description")} />
      </Field>
      <Field orientation="horizontal">
        <Switch
          id={id("required")}
          checked={input.required === true}
          disabled={!editable || input.required === null}
          onCheckedChange={(v) => field("required", v)}
        />
        <KeyLabel htmlFor={id("required")} yamlKey="required" />
      </Field>
      {input.editable && input.required === null ? <FieldDescription>{ON_YAML}</FieldDescription> : null}
      <Errors lines={at("required")} />
      <Field>
        <KeyLabel htmlFor={id("default")} yamlKey="default" />
        <DraftText
          id={id("default")}
          value={editable ? input.default : null}
          disabled={input.required === true}
          onWrite={(v, mode) => field("default", v, mode)}
        />
        {input.editable && input.default === null ? <FieldDescription>{ON_YAML}</FieldDescription> : null}
        <Errors lines={at("default")} />
      </Field>
      {!input.editable && !disabled ? <FieldDescription>{ON_YAML}</FieldDescription> : null}
    </div>
  )
}

/**
 * The workflow panel as a form (no card or the Inputs card selected): `description`, `runs-on`, `default`, the
 * inputs with Add input, then Applies to and File, read-only. The workflow's lines go under their fields; the others
 * in the alert under the title row.
 */
export function WorkflowEditPanel({ file, text, lines, write }: { file: FileBody; text: string; lines: readonly string[]; write: Write }) {
  const uid = useId()
  const label = useLabel()
  const form = workflowForm(text)
  if (form === null) return null
  const names = form.inputs.map((i) => i.name)
  const places = lines.map((line) => ({ line, place: placeLine(line, names) })).filter((p) => p.place.panel === "workflow")
  const shown = (field: string): boolean => {
    if (["description", "runs-on", "default"].includes(field)) return true
    const m = /^inputs\.(.+?)(?:\.(description|required|default|type))?$/.exec(field)
    if (m === null) return false
    const key = m[2]
    const name = key === undefined ? field.slice("inputs.".length) : (m[1] as string)
    return names.includes(name)
  }
  const { fields, alert } = byField(places, shown)
  const id = (k: string) => `${uid}-${k}`
  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex items-center gap-3">
        <IconTile size="sm" {...toneTile("inputs")}>
          <TextCursorInputIcon aria-hidden="true" />
        </IconTile>
        <h2 className="text-sm font-medium">Workflow</h2>
      </div>
      <LinesAlert lines={alert} />
      <div className="flex flex-col gap-4">
        <Field>
          <KeyLabel htmlFor={id("description")} yamlKey="description" />
          <DraftText
            id={id("description")}
            multiline
            rows={2}
            value={form.description}
            className="min-h-0"
            onWrite={(v, mode) => write((t) => setWorkflowKey(t, "description", v), mode)}
          />
          {form.description === null ? <FieldDescription>{ON_YAML}</FieldDescription> : null}
          <Errors lines={fields.get("description")} />
        </Field>
        <Field>
          <KeyLabel htmlFor={id("runs-on")} yamlKey="runs-on" />
          <ChoiceSelect
            id={id("runs-on")}
            value={form.runsOn}
            options={RUNS_ON_OPTIONS}
            placeholder="Not set"
            onChange={(v) => v !== null && write((t) => setWorkflowKey(t, "runs-on", v))}
          />
          <Errors lines={fields.get("runs-on")} />
        </Field>
        <Field orientation="horizontal">
          <Switch
            id={id("default")}
            checked={form.default === true}
            disabled={form.default === null}
            onCheckedChange={(v) => write((t) => setDefault(t, v))}
          />
          <KeyLabel htmlFor={id("default")} yamlKey="default" />
        </Field>
        {form.default === null ? <FieldDescription>{ON_YAML}</FieldDescription> : null}
        <Errors lines={fields.get("default")} />
      </div>
      <FieldSet className="gap-4">
        <FieldLegend variant="label" className="mb-0">
          <KeyLabelText yamlKey="inputs" />
        </FieldLegend>
        {form.inputs.length > 0 ? (
          <div className="flex flex-col gap-4">
            {form.inputs.map((input, i) => (
              <InputBox
                key={i}
                idPrefix={id("input")}
                index={i}
                input={input}
                siblings={names.filter((n) => n !== input.name)}
                disabled={!form.inputsEditable}
                lines={fields}
                write={write}
              />
            ))}
          </div>
        ) : null}
        <div>
          <Button variant="outline" disabled={!form.inputsEditable} onClick={() => write((t) => addInput(t))}>
            <PlusIcon aria-hidden="true" />
            Add input
          </Button>
        </div>
        {!form.inputsEditable ? <FieldDescription>{ON_YAML}</FieldDescription> : null}
      </FieldSet>
      <dl className="flex flex-col gap-4">
        <PanelRow label="Applies to">{appliesTo(file.project, label)}</PanelRow>
        <PanelRow label="File">
          <CopyField value={file.path} name="the file path" />
        </PanelRow>
      </dl>
    </div>
  )
}
