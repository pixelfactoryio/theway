import { FileTextIcon, RotateCcwIcon, TextCursorInputIcon } from "lucide-react"
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react"
import { Link, useLocation } from "wouter"

import { CodeView, type CodeViewHandle } from "@/components/code-view"
import { type AlertLine, Dash, ErrorStrip, InputsList, LinesAlert, PanelRow, UnknownFile } from "@/components/file-page"
import { PanelToggle, RecordBody, usePanelOpen } from "@/components/record-panel"
import { RecordTabs } from "@/components/record-tabs"
import { Badge } from "@/components/reui/badge"
import { IconTile } from "@/components/reui/icon-tile"
import { ErrorsBadge } from "@/components/status"
import { CopyField } from "@/components/text"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { WorkflowCanvas } from "@/components/workflow-canvas"
import { appliesTo, type FileBody, filePath, type PromptRow } from "@/lib/files"
import { type Drawing, drawWorkflow, findPrompt, isDefaultWorkflow, type Selection, selectionOf, type Shown, type StepCard } from "@/lib/workflow"
import { UNKNOWN_FILE } from "@/pages/prompt"
import { useFile, useLabel, usePrompts } from "@/shell/files"
import { LoadError } from "@/shell/load-error"
import { useProjects } from "@/shell/projects"
import { PageBody, TopBar } from "@/shell/top-bar"

/** A shown value: a prompt reference as a link to its page, or YAML source text in the code font. */
function ShownValue({ shown, prompts, project }: { shown: Shown; prompts: readonly PromptRow[]; project: string | null }) {
  if ("source" in shown) return <span className="font-mono text-sm">{shown.source}</span>
  const text = `prompts/${shown.prompt}.md`
  const row = findPrompt(prompts, project, shown.prompt)
  if (row === null) return <span className="text-sm">{text}</span>
  return (
    <Link href={`${filePath("prompts", row.project, row.name)}?`} className="text-sm underline-offset-4 hover:underline">
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
function WorkflowPanel({ file, drawing }: { file: FileBody; drawing: Drawing | null }) {
  const label = useLabel()
  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex items-center gap-3">
        <IconTile variant="outline" size="sm">
          <TextCursorInputIcon aria-hidden="true" />
        </IconTile>
        <h2 className="text-sm font-medium">Workflow</h2>
      </div>
      {drawing !== null ? <LinesAlert lines={drawing.errors} /> : null}
      <dl className="flex flex-col gap-4">
        {drawing !== null ? (
          <>
            <PanelRow label="description" code>
              {drawing.description ?? <Dash />}
            </PanelRow>
            <PanelRow label="runs-on" code>
              {drawing.runsOn ?? <Dash />}
            </PanelRow>
            <PanelRow label="default" code>
              {drawing.default ? "Yes" : "No"}
            </PanelRow>
            <PanelRow label="inputs" code>
              <InputsList inputs={drawing.inputFields} />
            </PanelRow>
          </>
        ) : null}
        <PanelRow label="Applies to">{appliesTo(file.project, label)}</PanelRow>
        <PanelRow label="File">
          <CopyField value={file.path} name="the file path" />
        </PanelRow>
      </dl>
    </div>
  )
}

/** The panel of a step card or of its on-fail card. */
function StepPanel({
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
        value: <span className="font-mono text-sm">{"source" in f.matrix ? f.matrix.source : `${f.matrix.key}: ${f.matrix.values.join(", ")}`}</span>,
      })
    }
    if (f.onFail !== null) rows.push({ label: "on-fail", value: shown(f.onFail) })
    if (f.tries !== null) rows.push({ label: "tries", value: f.tries })
  }
  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex items-start gap-3">
        <IconTile variant="outline" size="sm">
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
            <PanelRow key={r.label} label={r.label} code>
              {r.value}
            </PanelRow>
          ))}
        </dl>
      ) : null}
    </div>
  )
}

/** In place of the canvas when the file cannot be drawn. */
function CannotDraw({ reason, openYaml }: { reason: string; openYaml: () => void }) {
  return (
    <Empty className="min-h-0 flex-1 rounded-none bg-muted">
      <EmptyHeader>
        <EmptyTitle>This file cannot be drawn</EmptyTitle>
        <EmptyDescription className="font-mono text-xs">{reason}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" onClick={openYaml}>
          Open YAML
        </Button>
      </EmptyContent>
    </Empty>
  )
}

/**
 * `#/workflows/global/<name>[/yaml]` and `#/workflows/projects/<key>/<name>[/yaml]`: the Editor tab's canvas and the
 * YAML tab's code view, read-only, and the panel of the workflow or of the selected step.
 */
export function WorkflowPage({ project, name, tab }: { project: string | null; name: string; tab?: string }) {
  const projects = useProjects()
  const prompts = usePrompts()
  const file = useFile("workflows", project, name)
  const label = useLabel()
  const [open, setOpen] = usePanelOpen()
  const [, navigate] = useLocation()
  const [selection, setSelection] = useState<Selection | null>(null)
  const code = useRef<CodeViewHandle>(null)
  const yamlTab = tab === "yaml"
  const base = filePath("workflows", project, name)

  const data = file.data
  const drawn = useMemo(
    () =>
      data === undefined || prompts.data === undefined
        ? null
        : drawWorkflow(
            data.text,
            data.errors.map((e) => e.text),
            prompts.data.prompts,
            project
          ),
    [data, prompts.data, project]
  )
  const drawing = drawn !== null && "drawing" in drawn ? drawn.drawing : null
  // From the text, not the drawing: a default file that cannot be drawn still carries its badge.
  const isDefault = useMemo(() => data !== undefined && isDefaultWorkflow(data.text), [data])

  const select = useCallback(
    (next: Selection | null) => {
      setSelection(next)
      if (next !== null) setOpen(true)
    },
    [setOpen]
  )

  const lines = useMemo<AlertLine[]>(
    () =>
      (data?.errors ?? []).map((e) => {
        const line = e.line
        if (yamlTab) {
          return line === null
            ? { text: e.text, onClick: null }
            : { text: `line ${line} · ${e.text}`, onClick: () => code.current?.goToLine(line) }
        }
        const target = drawing === null ? null : selectionOf(e, drawing)
        return { text: e.text, onClick: target === null ? null : () => select(target) }
      }),
    [data, yamlTab, drawing, select]
  )

  const crumbs = [{ label: "Workflows", href: "/workflows?" }, { label: name }]
  const unknownKey = project !== null && projects.data !== undefined && !projects.data.projects.some((p) => p.key === project)
  if (unknownKey || (file.isError && UNKNOWN_FILE.includes(file.error.message))) {
    return (
      <>
        <TopBar items={crumbs} />
        <PageBody>
          <UnknownFile noun="workflow" name={name} back="Back to Workflows" href="/workflows?" />
        </PageBody>
      </>
    )
  }
  if (projects.isError || file.isError || prompts.isError) {
    return (
      <>
        <TopBar items={crumbs} />
        <PageBody>
          {projects.isError ? (
            <LoadError what="the projects" error={projects.error} retry={() => void projects.refetch()} className="m-4 w-auto" />
          ) : file.isError ? (
            <LoadError what="this workflow" error={file.error} retry={() => void file.refetch()} className="m-4 w-auto" />
          ) : (
            <LoadError what="the prompts" error={prompts.error as Error} retry={() => void prompts.refetch()} className="m-4 w-auto" />
          )}
        </PageBody>
      </>
    )
  }
  if (data === undefined || prompts.data === undefined || projects.data === undefined || drawn === null) {
    return (
      <>
        <TopBar items={crumbs} />
        <PageBody>{null}</PageBody>
      </>
    )
  }

  const step = selection !== null && selection.kind !== "inputs" ? (drawing?.steps[selection.index] ?? null) : null
  const panel =
    step !== null && drawing !== null ? (
      <StepPanel
        step={step}
        total={drawing.steps.length}
        onFail={selection?.kind === "on-fail"}
        prompts={prompts.data.prompts}
        project={project}
      />
    ) : (
      <WorkflowPanel file={data} drawing={drawing} />
    )

  return (
    <>
      <TopBar items={crumbs} actions={<PanelToggle x="details" open={open} onOpenChange={setOpen} />} />
      <PageBody>
        <RecordBody name={step !== null ? `Step ${step.index + 1}` : "Workflow"} open={open} onOpenChange={setOpen} panel={panel}>
          <RecordTabs
            column={false}
            label="Workflow views"
            value={yamlTab ? "yaml" : "editor"}
            tabs={[
              { value: "editor", label: "Editor", href: `${base}?` },
              { value: "yaml", label: "YAML", href: `${base}/yaml?` },
            ]}
            right={
              <>
                {isDefault ? <Badge variant="outline">default</Badge> : null}
                <span className="text-sm text-muted-foreground">{appliesTo(project, label)}</span>
                <ErrorsBadge errors={data.errors.map((e) => e.text)} />
              </>
            }
          />
          <ErrorStrip lines={lines} />
          {yamlTab ? (
            <div className="min-h-0 flex-1">
              <CodeView ref={code} text={data.text} language="yaml" name={`${name}.yaml`} errors={data.errors} />
            </div>
          ) : "reason" in drawn ? (
            <CannotDraw reason={drawn.reason} openYaml={() => navigate(`${base}/yaml?`)} />
          ) : (
            <WorkflowCanvas drawing={drawn.drawing} selection={selection} onSelect={select} />
          )}
        </RecordBody>
      </PageBody>
    </>
  )
}
