import { PlusIcon, TextCursorInputIcon, XIcon } from "lucide-react"
import { useId, useState } from "react"

import { WORKFLOW_INPUT_TYPES } from "../../../core/language-schema"
import { KeyLabelText, LinesAlert, PanelRow } from "@/components/file-page"
import { IconTile } from "@/components/reui/icon-tile"
import { CopyField } from "@/components/text"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldLegend, FieldSet } from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { toneTile } from "@/components/workflow-card"
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
import { appliesTo, type FileBody } from "@/lib/files"
import {
  addInput,
  type InputKey,
  removeInput,
  renameInput,
  setDefault,
  setInputField,
  setWorkflowKey,
} from "@/lib/workflow-edit"
import { type InputForm, keyError, workflowForm } from "@/lib/workflow-form"
import { placeLine } from "@/lib/workflow-place"
import { useLabel } from "@/shell/files"

const TYPE_OPTIONS: Option[] = WORKFLOW_INPUT_TYPES.map((t) => ({ value: t, label: t }))

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
  const field = (k: InputKey, value: string | boolean, mode: HistoryMode = "full") =>
    write((t) => setInputField(t, input.name, k, value), mode)
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
export function WorkflowEditPanel({
  file,
  text,
  lines,
  write,
}: {
  file: FileBody
  text: string
  lines: readonly string[]
  write: Write
}) {
  const uid = useId()
  const label = useLabel()
  const form = workflowForm(text)
  if (form === null) return null
  const names = form.inputs.map((i) => i.name)
  const places = lines
    .map((line) => ({ line, place: placeLine(line, names) }))
    .filter((p) => p.place.panel === "workflow")
  const shown = (field: string): boolean => {
    if (["description", "runs-on", "default"].includes(field)) return true
    const m = /^inputs\.(.+?)(?:\.(description|required|default|type))?$/.exec(field)
    if (m === null) return false
    return names.includes(m[1] as string)
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
