import { Trash2Icon } from "lucide-react"
import { type ReactNode, useEffect, useId, useRef, useState } from "react"
import { Link } from "wouter"

import { MODELS } from "../../../core/language-schema"
import { PropertyCard } from "@/components/property-card"
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "@/components/reui/number-field"
import { Button } from "@/components/ui/button"
import { FieldError } from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import {
  byField,
  CardLines,
  ChoiceSelect,
  DraftText,
  FieldNote,
  type HistoryMode,
  KeyText,
  ON_YAML,
  type Option,
  PanelField,
  RUNS_ON_OPTIONS,
  type Write,
} from "@/components/workflow-fields"
import { type PromptRow } from "@/lib/files"
import { to } from "@/lib/routes"
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
import { keyError, type MatrixForm, matrixLines, stepForm, type WithForm } from "@/lib/workflow-form"
import { placeLine } from "@/lib/workflow-place"

const MODEL_OPTIONS: Option[] = MODELS.map((m) => ({ value: m, label: m }))

/**
 * The rows of a prompt's inputs written under a `with`: one text field each, labelled with the input's name in mono and
 * `required` under it, the input's description under the field.
 */
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
          <PanelField
            key={input.name}
            yamlKey={`${labelPrefix}${input.name}`}
            htmlFor={id}
            errors={errors}
            label={
              <span className="flex flex-col">
                <span className="flex h-7 min-w-0 items-center font-mono text-xs text-foreground">
                  <span className="truncate">{input.name}</span>
                </span>
                {input.required ? <span className="text-xs leading-4">required</span> : null}
              </span>
            }
          >
            <DraftText
              id={id}
              value={v}
              className="font-mono text-xs md:text-xs"
              invalid={errors !== undefined}
              onWrite={(value, mode) => onWrite(input.name, value, input.required, mode)}
            />
            {input.description !== "" ? <FieldNote>{input.description}</FieldNote> : null}
            {v === null ? <FieldNote>{ON_YAML}</FieldNote> : null}
          </PanelField>
        )
      })}
    </>
  )
}

/** A card's sub-heading between its rows (`With`, `On fail`): `text-xs` (14px) at 500, the secondary ink, on a light rule. */
function RowGroup({ children }: { children: string }) {
  return <div className="border-t border-rule px-3 pt-3 pb-1 text-xs font-medium text-muted-foreground">{children}</div>
}

/** The `uses` row: the prompt's page as a link, else the value as written in the code font. */
function UsesValue({ uses, prompt }: { uses: string | null; prompt: PromptRow | null }) {
  if (prompt === null) return <span className="font-mono text-xs break-all">{uses ?? ""}</span>
  return (
    <Link
      href={to.file("prompts", prompt.project, prompt.name)}
      className="w-fit font-mono text-xs text-link underline-offset-4 hover:underline"
    >
      prompts/{prompt.name}.md
    </Link>
  )
}

/**
 * The Step card of a step, and of its on-fail card (scrolled to the `on-fail` rows): `Step N of M` and the prompt's
 * name with Change prompt in its header, the lines no field shows, its keys as rows (Uses, Runs on, Model, With, Matrix,
 * On fail and its inputs, On fail model, Tries), and Remove step. A step that is not a map shows only its lines and
 * Remove step.
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

  const card = (name: string, code: boolean, change: (() => void) | null, children: ReactNode) => (
    <PropertyCard
      title={`Step ${n} of ${total}`}
      meta={<span className={code ? "font-mono text-xs" : undefined}>{name}</span>}
      action={
        change !== null ? (
          <Button variant="outline" size="xs" onClick={change}>
            Change prompt
          </Button>
        ) : undefined
      }
    >
      {children}
      <div className="border-t border-rule p-1">
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive-foreground hover:text-destructive-foreground"
          onClick={onRemove}
        >
          <Trash2Icon aria-hidden="true" />
          Remove step
        </Button>
      </div>
    </PropertyCard>
  )

  if (!form.valid) return card(`Step ${n}`, false, null, <CardLines lines={places.map((p) => p.line)} />)

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

  return card(
    name,
    prompt === null,
    onChange,
    <>
      <CardLines lines={alert} />
      <PanelField yamlKey="uses" errors={fields.get("uses")}>
        <UsesValue uses={form.uses} prompt={prompt} />
      </PanelField>
      <PanelField yamlKey="runs-on" htmlFor={id("runs-on")} errors={fields.get("runs-on")}>
        <ChoiceSelect
          id={id("runs-on")}
          value={form.runsOn}
          first={workflowRunsOnLabel}
          options={RUNS_ON_OPTIONS}
          onChange={(v) => write((t) => setStepKey(t, index, "runs-on", v))}
        />
      </PanelField>
      {showModel ? (
        <PanelField yamlKey="model" htmlFor={id("model")} errors={fields.get("model")}>
          <ChoiceSelect
            id={id("model")}
            value={form.model}
            first={promptModel(prompt)}
            options={MODEL_OPTIONS}
            onChange={(v) => write((t) => setStepKey(t, index, "model", v))}
          />
        </PanelField>
      ) : null}
      {withPrompt !== null ? (
        <>
          <RowGroup>With</RowGroup>
          <WithFields
            idPrefix={id("with")}
            labelPrefix="with."
            prompt={withPrompt}
            form={form.with}
            lines={fields}
            onWrite={(k, v, required, mode) => write((t) => setStepWith(t, index, k, v, required), mode)}
          />
        </>
      ) : null}
      <MatrixGroup id={id("matrix")} index={index} matrix={form.matrix} lines={fields.get("matrix")} write={write} />
      <div ref={onFailRef} className="flex scroll-mt-3 flex-col">
        <PanelField yamlKey="on-fail" htmlFor={id("on-fail")} errors={fields.get("on-fail")}>
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
        </PanelField>
        {onFail !== null && onFailPrompt !== null
          ? onFailPrompt.inputs.length > 0 && (
              <>
                <RowGroup>On fail with</RowGroup>
                <WithFields
                  idPrefix={id("on-fail-with")}
                  labelPrefix="on-fail.with."
                  prompt={onFailPrompt}
                  form={onFail.with}
                  lines={fields}
                  onWrite={(k, v, required, mode) => write((t) => setOnFailWith(t, index, k, v, required), mode)}
                />
              </>
            )
          : null}
        {showOnFailModel ? (
          <PanelField yamlKey="on-fail.model" htmlFor={id("on-fail-model")} errors={fields.get("on-fail.model")}>
            <ChoiceSelect
              id={id("on-fail-model")}
              value={onFail?.model ?? null}
              first={promptModel(onFailPrompt)}
              options={MODEL_OPTIONS}
              onChange={(v) => write((t) => setOnFailModel(t, index, v))}
            />
          </PanelField>
        ) : null}
        {showTries ? (
          <PanelField yamlKey="tries" htmlFor={id("tries")} errors={fields.get("tries")}>
            <NumberField
              id={id("tries")}
              size="sm"
              min={1}
              max={10}
              value={form.tries === "bad" ? null : form.tries}
              disabled={form.tries === "bad"}
              className="w-28"
              onValueChange={(v) => {
                write((t) => setTries(t, index, v))
              }}
            >
              <NumberFieldGroup aria-invalid={fields.has("tries") || undefined} className="rounded-md">
                <NumberFieldDecrement aria-label="Decrease tries" />
                <NumberFieldInput aria-invalid={fields.has("tries") || undefined} />
                <NumberFieldIncrement aria-label="Increase tries" />
              </NumberFieldGroup>
            </NumberField>
            {form.tries === "bad" ? <FieldNote>{ON_YAML}</FieldNote> : null}
          </PanelField>
        ) : null}
      </div>
    </>,
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
    <>
      <PanelField yamlKey="matrix" htmlFor={`${id}-on`} errors={on ? undefined : lines}>
        <Switch id={`${id}-on`} size="sm" checked={on} onCheckedChange={(v) => write((t) => setMatrix(t, index, v))} />
      </PanelField>
      {on ? (
        <>
          <PanelField yamlKey="key" label="Matrix key" htmlFor={`${id}-key`}>
            <KeyText
              id={`${id}-key`}
              value={editable ? matrix.key : null}
              siblings={[]}
              onTyped={setKeyTyped}
              onWrite={(v, mode) => write((t) => renameMatrixKey(t, index, v), mode)}
            />
            {keyErr !== null ? <FieldError className="text-xs font-normal">{keyErr}</FieldError> : null}
          </PanelField>
          <PanelField yamlKey="values" label="Values" htmlFor={`${id}-values`} errors={lines}>
            <DraftText
              id={`${id}-values`}
              multiline
              rows={Math.max(2, editable ? matrix.values.length : 2)}
              value={editable ? matrix.values.join("\n") : null}
              className="font-mono text-xs md:text-xs"
              onWrite={(v, mode) => write((t) => setMatrixValues(t, index, matrixLines(v)), mode)}
            />
            <FieldNote>{editable ? "One value per line." : "Edit this matrix on the YAML tab."}</FieldNote>
          </PanelField>
        </>
      ) : null}
    </>
  )
}
