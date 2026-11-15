import { cn } from "cn"
import { FileTextIcon, RotateCcwIcon, Trash2Icon } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"
import { Link } from "wouter"

import { KeyLabelText, LinesAlert } from "@/components/file-page"
import { IconTile } from "@/components/reui/icon-tile"
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "@/components/reui/number-field"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import { type Tone, toneTile } from "@/components/workflow-card"
import {
  byField,
  ChoiceSelect,
  DraftText,
  Errors,
  type HistoryMode,
  KeyLabel,
  KeyText,
  ON_YAML,
  type Option,
  RUNS_ON_OPTIONS,
  type Write,
} from "@/components/workflow-fields"
import { filePath, type PromptRow } from "@/lib/files"
import { stepPromptNames } from "@/lib/step-prompts"
import { findPrompt } from "@/lib/workflow"
import {
  renameMatrixKey,
  setMatrix,
  setMatrixValues,
  setOnFail,
  setOnFailModel,
  setOnFailWith,
  setStepKey,
  setStepWith,
  setTries,
} from "@/lib/workflow-edit"
import { keyError, type MatrixForm, matrixLines, MODELS, stepForm, type WithForm } from "@/lib/workflow-form"
import { placeLine } from "@/lib/workflow-place"

const MODEL_OPTIONS: Option[] = MODELS.map((m) => ({ value: m, label: m }))

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
    <Link
      href={`${filePath("prompts", prompt.project, prompt.name)}?`}
      className="text-sm underline-offset-4 hover:underline"
    >
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
  const places = lines
    .map((line) => ({ line, place: placeLine(line) }))
    .filter((p) => p.place.panel === "step" && p.place.index === index)

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
    if (field.startsWith("with."))
      return withPrompt !== null && withPrompt.inputs.some((i) => `with.${i.name}` === field)
    if (field.startsWith("on-fail.with."))
      return onFailPrompt !== null && onFailPrompt.inputs.some((i) => `on-fail.with.${i.name}` === field)
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
