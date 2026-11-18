import { FileTextIcon, RotateCcwIcon, TextCursorInputIcon } from "lucide-react"
import type { ReactNode } from "react"
import { Link } from "wouter"

import { promptUses } from "../../../core/language-schema"
import { Dash, InputsList, LinesAlert, PanelRow } from "@/components/file-page"
import { IconTile } from "@/components/reui/icon-tile"
import { toneTile } from "@/components/workflow-card"
import type { PromptRow } from "@/lib/files"
import { to } from "@/lib/routes"
import { type Drawing, findPrompt, type Shown, type StepCard } from "@/lib/workflow"

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
  if ("source" in shown) return <span className="font-mono text-sm">{shown.source}</span>
  const text = promptUses(shown.prompt)
  const row = findPrompt(prompts, project, shown.prompt)
  if (row === null) return <span className="text-sm">{text}</span>
  return (
    <Link href={to.file("prompts", row.project, row.name)} className="text-sm underline-offset-4 hover:underline">
      {text}
    </Link>
  )
}

/** A `with` row's value: one line per key, or the YAML source text. */
function WithValue({ value }: { value: NonNullable<StepCard["fields"]["with"]> }) {
  if (!Array.isArray(value)) return <span className="font-mono text-sm">{value.source}</span>
  if (value.length === 0) return <Dash />
  return (
    <ul className="flex flex-col gap-1">
      {value.map((w) => (
        <li key={w.key} className="flex min-w-0 flex-col">
          <span className="text-xs text-muted-foreground">{w.key}</span>
          <span className="font-mono text-sm break-all">{w.value}</span>
        </li>
      ))}
    </ul>
  )
}

/** The Workflow panel: with no card or the Inputs card selected. */
export function WorkflowPanel({ drawing }: { drawing: Drawing | null }) {
  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex items-center gap-3">
        <IconTile size="sm" {...toneTile("inputs")}>
          <TextCursorInputIcon aria-hidden="true" />
        </IconTile>
        <h2 className="text-sm font-medium">Workflow</h2>
      </div>
      {drawing !== null ? <LinesAlert lines={drawing.errors} /> : null}
      <dl className="flex flex-col gap-4">
        {drawing !== null ? (
          <>
            <PanelRow yamlKey="description">{drawing.description ?? <Dash />}</PanelRow>
            <PanelRow yamlKey="runs-on">{drawing.runsOn ?? <Dash />}</PanelRow>
            <PanelRow yamlKey="default">{drawing.default ? "Yes" : "No"}</PanelRow>
            <PanelRow yamlKey="inputs">
              <InputsList inputs={drawing.inputFields} />
            </PanelRow>
          </>
        ) : null}
      </dl>
    </div>
  )
}

/** The panel of a step card or of its on-fail card. */
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
  const rows: { label: string; value: ReactNode }[] = []
  const shown = (s: Shown) => <ShownValue shown={s} prompts={prompts} project={project} />
  if (card !== null) {
    if (card.uses !== null) rows.push({ label: "uses", value: shown(card.uses) })
    if (card.with !== null) rows.push({ label: "with", value: <WithValue value={card.with} /> })
    if (card.model !== null) rows.push({ label: "model", value: card.model })
  } else if (step.valid) {
    const f = step.fields
    if (f.uses !== null) rows.push({ label: "uses", value: shown(f.uses) })
    if (f.runsOn !== null) rows.push({ label: "runs-on", value: f.runsOn })
    if (f.model !== null) rows.push({ label: "model", value: f.model })
    if (f.with !== null) rows.push({ label: "with", value: <WithValue value={f.with} /> })
    if (f.matrix !== null) {
      rows.push({
        label: "matrix",
        value: (
          <span className="font-mono text-sm">
            {"source" in f.matrix ? f.matrix.source : `${f.matrix.key}: ${f.matrix.values.join(", ")}`}
          </span>
        ),
      })
    }
    if (f.onFail !== null) rows.push({ label: "on-fail", value: shown(f.onFail) })
    if (f.tries !== null) rows.push({ label: "tries", value: f.tries })
  }
  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex items-start gap-3">
        <IconTile size="sm" {...toneTile(card !== null ? "on-fail" : step.target)}>
          {card !== null ? <RotateCcwIcon aria-hidden="true" /> : <FileTextIcon aria-hidden="true" />}
        </IconTile>
        <div className="flex min-w-0 flex-col">
          <span className="text-xs text-muted-foreground">
            Step {n} of {total}
            {card !== null ? " · on fail" : ""}
          </span>
          <h2 className={code ? "truncate font-mono text-sm font-medium" : "truncate text-sm font-medium"}>{name}</h2>
        </div>
      </div>
      <LinesAlert lines={lines} />
      {rows.length > 0 ? (
        <dl className="flex flex-col gap-4">
          {rows.map((r) => (
            <PanelRow key={r.label} yamlKey={r.label}>
              {r.value}
            </PanelRow>
          ))}
        </dl>
      ) : null}
    </div>
  )
}
