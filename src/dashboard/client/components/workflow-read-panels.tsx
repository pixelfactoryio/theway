import type { ReactNode } from "react"
import { Link } from "wouter"

import { promptUses } from "../../../core/language-schema"
import { Dash } from "@/components/file-page"
import { PropertyCard, PropertyList, PropertyRow } from "@/components/property-card"
import { CardLines } from "@/components/workflow-fields"
import { type PromptRow, quoted } from "@/lib/files"
import { to } from "@/lib/routes"
import { type Drawing, findPrompt, keyLabel, type Shown, type StepCard } from "@/lib/workflow"

/** A shown value: a prompt reference as a link to its page, or YAML source text in the code font. */
function ShownValue({
  shown,
  prompts,
  project,
}: {
  shown: Shown
  prompts: readonly PromptRow[]
  project: string | null
}) {
  if ("source" in shown) return <code className="font-mono text-xs break-all">{shown.source}</code>
  const text = promptUses(shown.prompt)
  const row = findPrompt(prompts, project, shown.prompt)
  if (row === null) return <code className="font-mono text-xs break-all">{text}</code>
  return (
    <Link
      href={to.file("prompts", row.project, row.name)}
      className="font-mono text-xs text-link underline-offset-4 hover:underline"
    >
      {text}
    </Link>
  )
}

/** A chip of a value list (a matrix's values): Geist Mono `text-xs` (14px) on its 20px line, a hairline outline, 4px corners. */
function ValueChip({ children }: { children: string }) {
  return (
    <code className="inline-flex h-(--text-xs--line-height) items-center rounded-sm border px-1 font-mono text-xs whitespace-nowrap">
      {children}
    </code>
  )
}

/** A `with` row's value: one line per key, its value in mono after it, or the YAML source text. */
function WithValue({ value }: { value: NonNullable<StepCard["fields"]["with"]> }) {
  if (!Array.isArray(value)) return <code className="font-mono text-xs break-all">{value.source}</code>
  if (value.length === 0) return <Dash />
  return (
    <ul className="flex flex-col gap-1">
      {value.map((w) => (
        <li key={w.key} className="flex min-w-0 flex-col">
          <span className="font-mono text-xs text-muted-foreground">{w.key}</span>
          <code className="font-mono text-xs break-all">{w.value}</code>
        </li>
      ))}
    </ul>
  )
}

/** A workflow's inputs as a card row lists them: the name in mono, `required` or its default, its description. */
function InputsValue({ inputs }: { inputs: Drawing["inputFields"] }) {
  if (inputs.length === 0) return <Dash />
  return (
    <ul className="flex flex-col gap-2">
      {inputs.map((input) => (
        <li key={input.name} className="flex min-w-0 flex-col">
          <span className="flex flex-wrap items-center gap-x-2">
            <code className="font-mono text-xs">{input.name}</code>
            <span className="text-xs text-muted-foreground">
              {input.type}
              {input.required
                ? " · required"
                : input.default !== null
                  ? ` · default ${quoted(input.default)}`
                  : " · optional"}
            </span>
          </span>
          {input.description !== "" ? <span className="text-muted-foreground">{input.description}</span> : null}
        </li>
      ))}
    </ul>
  )
}

/** The Workflow card, read-only: with no card or the Inputs card selected, on the YAML and History tabs. */
export function WorkflowPanel({ drawing }: { drawing: Drawing | null }) {
  return (
    <PropertyCard title="Workflow">
      {drawing !== null ? (
        <>
          <CardLines lines={drawing.errors} />
          <PropertyList>
            <PropertyRow label="Description">{drawing.description ?? <Dash />}</PropertyRow>
            <PropertyRow label="Runs on">{drawing.runsOn ?? <Dash />}</PropertyRow>
            <PropertyRow label="Default">{drawing.default ? "Yes" : "No"}</PropertyRow>
            <PropertyRow label="Inputs">
              <InputsValue inputs={drawing.inputFields} />
            </PropertyRow>
          </PropertyList>
        </>
      ) : null}
    </PropertyCard>
  )
}

/** The Step card of a step card or of its on-fail card, read-only: its keys as rows, the sketch's Step card. */
export function StepPanel({
  step,
  total,
  onFail,
  prompts,
  project,
}: {
  step: StepCard
  total: number
  onFail: boolean
  prompts: readonly PromptRow[]
  project: string | null
}) {
  const n = step.index + 1
  const card = onFail && step.onFail !== null ? step.onFail : null
  const name = card !== null ? card.name : step.valid ? step.name : "Invalid step"
  const code = card !== null ? card.code : step.valid && step.code
  const lines = card !== null ? card.errors : step.errors
  const rows: { key: string; value: ReactNode }[] = []
  const shown = (s: Shown) => <ShownValue shown={s} prompts={prompts} project={project} />
  if (card !== null) {
    if (card.uses !== null) rows.push({ key: "uses", value: shown(card.uses) })
    if (card.with !== null) rows.push({ key: "with", value: <WithValue value={card.with} /> })
    if (card.model !== null) rows.push({ key: "model", value: card.model })
  } else if (step.valid) {
    const f = step.fields
    if (f.uses !== null) rows.push({ key: "uses", value: shown(f.uses) })
    if (f.runsOn !== null) rows.push({ key: "runs-on", value: f.runsOn })
    if (f.model !== null) rows.push({ key: "model", value: f.model })
    if (f.with !== null) rows.push({ key: "with", value: <WithValue value={f.with} /> })
    if (f.matrix !== null) {
      rows.push({
        key: "matrix",
        value:
          "source" in f.matrix ? (
            <code className="font-mono text-xs break-all">{f.matrix.source}</code>
          ) : (
            <span className="flex flex-wrap items-center gap-1">
              <code className="font-mono text-xs text-muted-foreground">{f.matrix.key}:</code>
              {f.matrix.values.map((v) => (
                <ValueChip key={v}>{v}</ValueChip>
              ))}
            </span>
          ),
      })
    }
    if (f.onFail !== null) rows.push({ key: "on-fail", value: shown(f.onFail) })
    if (f.tries !== null) rows.push({ key: "tries", value: f.tries })
  }
  return (
    <PropertyCard
      title={`Step ${n} of ${total}${card !== null ? " · on fail" : ""}`}
      meta={<span className={code ? "font-mono text-xs" : undefined}>{name}</span>}
    >
      <CardLines lines={lines} />
      {rows.length > 0 ? (
        <PropertyList>
          {rows.map((r) => (
            <PropertyRow key={r.key} label={keyLabel(r.key)}>
              {r.value}
            </PropertyRow>
          ))}
        </PropertyList>
      ) : null}
    </PropertyCard>
  )
}
