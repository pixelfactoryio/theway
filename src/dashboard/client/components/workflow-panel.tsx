import { PlusIcon, XIcon } from "lucide-react"
import { useId, useState } from "react"

import { WORKFLOW_INPUT_TYPES } from "../../../core/language-schema"
import { PropertyCard } from "@/components/property-card"
import { Button } from "@/components/ui/button"
import { FieldError } from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  byField,
  CardLines,
  ChoiceSelect,
  DraftMarkdown,
  DraftText,
  Errors,
  FieldNote,
  type HistoryMode,
  KeyText,
  ON_YAML,
  type Option,
  PanelField,
  RUNS_ON_OPTIONS,
  type Write,
} from "@/components/workflow-fields"
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
    <div className="flex flex-col border-t first:border-t-0">
      <div className="flex flex-col gap-1 px-3 py-2">
        <div className="flex items-center gap-1">
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
                  size="icon-sm"
                  aria-label={`Remove input ${input.name}`}
                  disabled={disabled}
                  className="text-muted-foreground"
                  onClick={() => write((t) => removeInput(t, input.name))}
                />
              }
            >
              <XIcon aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent>{`Remove input ${input.name}`}</TooltipContent>
          </Tooltip>
        </div>
        {nameErr !== null ? <FieldError className="text-xs font-normal">{nameErr}</FieldError> : null}
        <Errors lines={lines.get(`inputs.${input.name}`)} />
      </div>
      <PanelField yamlKey="type" htmlFor={id("type")} errors={at("type")}>
        <ChoiceSelect
          id={id("type")}
          value={input.type}
          options={TYPE_OPTIONS}
          disabled={!editable}
          onChange={(v) => v !== null && field("type", v)}
        />
      </PanelField>
      <PanelField yamlKey="description" errors={at("description")}>
        <DraftMarkdown
          label={`${input.name} description`}
          value={editable ? input.description : null}
          onWrite={(v, mode) => field("description", v, mode)}
        />
        {input.editable && input.description === null ? <FieldNote>{ON_YAML}</FieldNote> : null}
      </PanelField>
      <PanelField yamlKey="required" htmlFor={id("required")} errors={at("required")}>
        <Switch
          id={id("required")}
          size="sm"
          checked={input.required === true}
          disabled={!editable || input.required === null}
          onCheckedChange={(v) => field("required", v)}
        />
        {input.editable && input.required === null ? <FieldNote>{ON_YAML}</FieldNote> : null}
      </PanelField>
      <PanelField yamlKey="default" htmlFor={id("default")} errors={at("default")}>
        <DraftText
          id={id("default")}
          value={editable ? input.default : null}
          disabled={input.required === true}
          onWrite={(v, mode) => field("default", v, mode)}
        />
        {input.editable && input.default === null ? <FieldNote>{ON_YAML}</FieldNote> : null}
      </PanelField>
      {!input.editable && !disabled ? (
        <div className="border-t border-rule px-3 py-2">
          <FieldNote>{ON_YAML}</FieldNote>
        </div>
      ) : null}
    </div>
  )
}

/**
 * The workflow's cards as a form (no card or the Inputs card selected): Workflow (`description`, `runs-on`,
 * `default`) and Inputs (each input's name, `type`, `description`, `required` and `default`, with Add input in its
 * header). The workflow's lines go under their fields; the others in the Workflow card, under its header.
 */
export function WorkflowEditPanel({ text, lines, write }: { text: string; lines: readonly string[]; write: Write }) {
  const uid = useId()
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
    <>
      <PropertyCard title="Workflow">
        <CardLines lines={alert} />
        <PanelField yamlKey="description" errors={fields.get("description")}>
          <DraftMarkdown
            label="Workflow description"
            value={form.description}
            onWrite={(v, mode) => write((t) => setWorkflowKey(t, "description", v), mode)}
          />
          {form.description === null ? <FieldNote>{ON_YAML}</FieldNote> : null}
        </PanelField>
        <PanelField yamlKey="runs-on" htmlFor={id("runs-on")} errors={fields.get("runs-on")}>
          <ChoiceSelect
            id={id("runs-on")}
            value={form.runsOn}
            options={RUNS_ON_OPTIONS}
            placeholder="Not set"
            onChange={(v) => v !== null && write((t) => setWorkflowKey(t, "runs-on", v))}
          />
        </PanelField>
        <PanelField yamlKey="default" htmlFor={id("default")} errors={fields.get("default")}>
          <Switch
            id={id("default")}
            size="sm"
            checked={form.default === true}
            disabled={form.default === null}
            onCheckedChange={(v) => write((t) => setDefault(t, v))}
          />
          {form.default === null ? <FieldNote>{ON_YAML}</FieldNote> : null}
        </PanelField>
      </PropertyCard>
      <PropertyCard
        title="Inputs"
        meta={form.inputs.length}
        action={
          <Button variant="outline" size="xs" disabled={!form.inputsEditable} onClick={() => write((t) => addInput(t))}>
            <PlusIcon aria-hidden="true" />
            Add input
          </Button>
        }
      >
        {form.inputs.length > 0 ? (
          <div className="flex flex-col border-t">
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
        {!form.inputsEditable ? (
          <div className="border-t border-rule px-3 py-2">
            <FieldNote>{ON_YAML}</FieldNote>
          </div>
        ) : null}
      </PropertyCard>
    </>
  )
}
