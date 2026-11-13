import { FileTextIcon, InfoIcon, RotateCcwIcon, TextCursorInputIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Link, useLocation } from "wouter"

import { type CodeViewHandle, EditableCodeView } from "@/components/code-view"
import { DraftDialogs, DraftNotices, useFileDraft } from "@/components/draft"
import { useHistoryTab } from "@/components/history"
import { type AlertLine, Dash, InputsList, LinesAlert, PanelRow, SavedStatus, UnknownFile } from "@/components/file-page"
import { PanelToggle, RecordBody, usePanelOpen } from "@/components/record-panel"
import { RecordTabs } from "@/components/record-tabs"
import { Alert, AlertTitle } from "@/components/reui/alert"
import { Badge } from "@/components/reui/badge"
import { IconTile } from "@/components/reui/icon-tile"
import { ErrorsBadge } from "@/components/status"
import { CopyField } from "@/components/text"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { StepPicker } from "@/components/step-picker"
import { type CanvasEdits, toneTile, WorkflowCanvas } from "@/components/workflow-canvas"
import { applyEdit, type HistoryMode, StepEditPanel, WorkflowEditPanel, type Write } from "@/components/workflow-forms"
import { appliesTo, type FileBody, filePath, type PromptRow } from "@/lib/files"
import { type Drawing, drawWorkflow, findPrompt, isDefaultWorkflow, type Selection, selectionOf, type Shown, type StepCard } from "@/lib/workflow"
import { addStep, changeStepPrompt, hasAnchors, moveStep, removeStep } from "@/lib/workflow-edit"
import { UNKNOWN_FILE } from "@/pages/prompt"
import { useFile, useLabel, usePrompts } from "@/shell/files"
import { LoadError } from "@/shell/load-error"
import { useProjects } from "@/shell/projects"
import { PageBody, TopBar, type TopBarItem } from "@/shell/top-bar"

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
        <IconTile size="sm" {...toneTile("inputs")}>
          <TextCursorInputIcon aria-hidden="true" />
        </IconTile>
        <h2 className="text-sm font-medium">Workflow</h2>
      </div>
      {drawing !== null ? <LinesAlert lines={drawing.errors} /> : null}
      <dl className="flex flex-col gap-4">
        {drawing !== null ? (
          <>
            <PanelRow yamlKey="description">
              {drawing.description ?? <Dash />}
            </PanelRow>
            <PanelRow yamlKey="runs-on">
              {drawing.runsOn ?? <Dash />}
            </PanelRow>
            <PanelRow yamlKey="default">
              {drawing.default ? "Yes" : "No"}
            </PanelRow>
            <PanelRow yamlKey="inputs">
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

/** The step picker open in the panel: adding a step at `at`, or changing the prompt of step `index`. */
type Picker = { mode: "add"; at: number } | { mode: "change"; index: number }

/** The selection kept after the draft changed: a step that no longer exists is cleared, a gone on-fail card selects its step. */
function keptSelection(selection: Selection | null, drawing: Drawing | null): Selection | null {
  if (selection === null || selection.kind === "inputs" || drawing === null) return selection
  const step = drawing.steps[selection.index]
  if (step === undefined) return null
  if (selection.kind === "on-fail" && step.onFail === null) return { kind: "step", index: selection.index }
  return selection
}

const sameSelection = (a: Selection | null, b: Selection | null): boolean =>
  a === b || (a !== null && b !== null && a.kind === b.kind && (a.kind === "inputs" || (b.kind !== "inputs" && a.index === b.index)))

/** A full-width strip under the tabs: no rounding, the bottom border only. */
const STRIP = "shrink-0 rounded-none border-x-0 border-t-0"

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
 * `#/workflows/global/<name>[/yaml|/history]` and `#/workflows/projects/<key>/<name>[/yaml|/history]`: the Editor
 * tab's canvas drawn from the draft, the YAML tab's editable code view, the history, and the panel of the workflow or
 * of the selected step.
 */
export function WorkflowPage({ project, name, tab }: { project: string | null; name: string; tab?: string }) {
  const projects = useProjects()
  const prompts = usePrompts()
  const file = useFile("workflows", project, name)
  const draft = useFileDraft({
    kind: "workflows",
    project,
    name,
    file: file.data,
    fetching: file.isFetching,
    language: "yaml",
    docName: `${name}.yaml`,
  })
  const label = useLabel()
  const [open, setOpen] = usePanelOpen()
  const [, navigate] = useLocation()
  const [selection, setSelection] = useState<Selection | null>(null)
  const code = useRef<CodeViewHandle>(null)
  const yamlTab = tab === "yaml"
  const history = tab === "history"
  const base = filePath("workflows", project, name)
  const historyTab = useHistoryTab({ draft, kind: "workflows", project, name, language: "yaml", active: history })

  const data = file.data
  const text = draft.text
  const errors = draft.errors
  const drawn = useMemo(
    () =>
      text === null || prompts.data === undefined
        ? null
        : drawWorkflow(
            text,
            errors.map((e) => e.text),
            prompts.data.prompts,
            project
          ),
    [text, errors, prompts.data, project]
  )
  const drawing = drawn !== null && "drawing" in drawn ? drawn.drawing : null
  // From the text, not the drawing: a default file that cannot be drawn still carries its badge.
  const isDefault = useMemo(() => text !== null && isDefaultWorkflow(text), [text])

  const [picker, setPicker] = useState<Picker | null>(null)
  const anchors = useMemo(() => text !== null && hasAnchors(text), [text])
  // Only the Editor tab edits: the YAML tab keeps the read-only panel.
  const editable = drawing !== null && !anchors && !yamlTab && !history

  const select = useCallback(
    (next: Selection | null) => {
      setPicker(null)
      setSelection(next)
      if (next !== null) setOpen(true)
    },
    [setOpen]
  )

  // After Undo, Redo, a YAML tab edit or any edit: a selected step that no longer exists is cleared, a gone on-fail
  // card selects its step.
  const kept = keptSelection(selection, drawing)
  useEffect(() => {
    if (!sameSelection(kept, selection)) setSelection(kept)
  }, [kept, selection])

  // Any change of the draft other than the picker's own choice, and leaving the Editor tab, close the picker.
  const pickerText = useRef<string | null>(null)
  useEffect(() => {
    if (picker !== null && text !== pickerText.current) setPicker(null)
  }, [text, picker])
  useEffect(() => {
    if (tab !== undefined) setPicker(null)
  }, [tab])
  const openPicker = useCallback(
    (next: Picker) => {
      pickerText.current = text
      setPicker(next)
      setOpen(true)
    },
    [text, setOpen]
  )

  const store = draft.store
  const write: Write = useCallback(
    (edit: (text: string) => string, mode: HistoryMode = "full") => (store === null ? false : applyEdit(store, edit, mode)),
    [store]
  )

  const lines = useMemo<AlertLine[]>(
    () =>
      errors.map((e) => {
        const line = e.line
        if (yamlTab) {
          return line === null
            ? { text: e.text, onClick: null }
            : { text: `line ${line} · ${e.text}`, onClick: () => code.current?.goToLine(line) }
        }
        const target = drawing === null ? null : selectionOf(e, drawing)
        return { text: e.text, onClick: target === null ? null : () => select(target) }
      }),
    [errors, yamlTab, drawing, select]
  )

  const crumbs: TopBarItem[] = [{ section: "Library" }, { label: "Workflows", href: "/workflows?" }, { label: name }]
  const unknownKey = project !== null && projects.data !== undefined && !projects.data.projects.some((p) => p.key === project)
  const fileFailed = file.isError && draft.store === null
  if (unknownKey || (fileFailed && UNKNOWN_FILE.includes(file.error.message))) {
    return (
      <>
        <TopBar items={crumbs} />
        <PageBody>
          <UnknownFile noun="workflow" name={name} back="Back to Workflows" href="/workflows?" />
        </PageBody>
      </>
    )
  }
  if (projects.isError || fileFailed || prompts.isError) {
    return (
      <>
        <TopBar items={crumbs} />
        <PageBody>
          {projects.isError ? (
            <LoadError what="the projects" error={projects.error} retry={() => void projects.refetch()} className="m-4 w-auto" />
          ) : fileFailed ? (
            <LoadError what="this workflow" error={file.error as Error} retry={() => void file.refetch()} className="m-4 w-auto" />
          ) : (
            <LoadError what="the prompts" error={prompts.error as Error} retry={() => void prompts.refetch()} className="m-4 w-auto" />
          )}
        </PageBody>
      </>
    )
  }
  if (data === undefined || prompts.data === undefined || projects.data === undefined || drawn === null || draft.store === null) {
    return (
      <>
        <TopBar items={crumbs} />
        <PageBody>{null}</PageBody>
      </>
    )
  }

  const step = kept !== null && kept.kind !== "inputs" ? (drawing?.steps[kept.index] ?? null) : null
  const promptRows = prompts.data.prompts
  const lineTexts = errors.map((e) => e.text)
  const choose = (prompt: PromptRow) => {
    const p = picker
    if (p === null || text === null) return
    setPicker(null)
    if (p.mode === "add") {
      if (write((t) => addStep(t, p.at, prompt))) {
        setSelection({ kind: "step", index: p.at })
        setOpen(true)
      }
    } else write((t) => changeStepPrompt(t, p.index, prompt))
  }
  const edits: CanvasEdits | null = editable
    ? {
        placeholder: picker?.mode === "add" ? picker.at : null,
        onAdd: (at) => {
          setSelection(null)
          openPicker({ mode: "add", at })
        },
        onMove: (index, delta) => {
          if (write((t) => moveStep(t, index, delta))) select({ kind: "step", index: index + delta })
        },
        onRemove: (index) => {
          if (!write((t) => removeStep(t, index))) return
          setSelection((s) => {
            if (s === null || s.kind === "inputs") return s
            if (s.index === index) return null
            return s.index > index ? { ...s, index: s.index - 1 } : s
          })
        },
      }
    : null
  const removeSelected = (index: number) => edits?.onRemove(index)

  const panel =
    editable && picker !== null ? (
      <StepPicker
        title={picker.mode === "add" ? "Add a step" : "Change the prompt"}
        prompts={promptRows}
        project={project}
        onChoose={choose}
        onClose={() => setPicker(null)}
      />
    ) : editable && step !== null && drawing !== null && text !== null ? (
      <StepEditPanel
        key={step.index}
        text={text}
        index={step.index}
        total={drawing.steps.length}
        lines={lineTexts}
        prompts={promptRows}
        project={project}
        workflowRunsOn={drawing.runsOn}
        onFailCard={kept?.kind === "on-fail"}
        tone={kept?.kind === "on-fail" ? "on-fail" : step.target}
        write={write}
        onChange={() => openPicker({ mode: "change", index: step.index })}
        onRemove={() => removeSelected(step.index)}
      />
    ) : editable && text !== null ? (
      <WorkflowEditPanel file={data} text={text} lines={lineTexts} write={write} />
    ) : step !== null && drawing !== null ? (
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
      <TopBar items={crumbs} actions={<PanelToggle page={history ? "history" : "workflow"} open={open} onOpenChange={setOpen} />} />
      <PageBody>
        <RecordTabs
          column={false}
          label="Workflow views"
          value={history ? "history" : yamlTab ? "yaml" : "editor"}
          tabs={[
            { value: "editor", label: "Editor", href: `${base}?` },
            { value: "yaml", label: "YAML", href: `${base}/yaml?` },
            { value: "history", label: "History", href: `${base}/history?` },
          ]}
          right={
            <>
              <SavedStatus saved={draft.saved} />
              {isDefault ? <Badge variant="outline">default</Badge> : null}
              <span className="text-sm text-muted-foreground">{appliesTo(project, label)}</span>
              <ErrorsBadge errors={errors.map((e) => e.text)} />
            </>
          }
        />
        <RecordBody
          name={
            history
              ? "Versions"
              : editable && picker !== null
                ? picker.mode === "add"
                  ? "Add a step"
                  : "Change the prompt"
                : step !== null
                  ? `Step ${step.index + 1}`
                  : "Workflow"
          }
          open={open}
          onOpenChange={setOpen}
          panel={history ? historyTab.panel : panel}
        >
          <DraftNotices draft={draft} lines={lines} history={history} />
          {!history && !yamlTab && drawing !== null && anchors ? (
            <Alert className={STRIP}>
              <InfoIcon aria-hidden="true" />
              <AlertTitle>This file uses YAML anchors. Edit it on the YAML tab.</AlertTitle>
            </Alert>
          ) : null}
          {history ? (
            historyTab.main
          ) : yamlTab ? (
            <div className="min-h-0 flex-1">
              <EditableCodeView ref={code} draft={draft.store} errors={errors} />
            </div>
          ) : "reason" in drawn ? (
            <CannotDraw reason={drawn.reason} openYaml={() => navigate(`${base}/yaml?`)} />
          ) : (
            <WorkflowCanvas
              key={`${project ?? "global"}/${name}`}
              drawing={drawn.drawing}
              selection={kept}
              onSelect={select}
              store={draft.store}
              edits={edits}
            />
          )}
        </RecordBody>
      </PageBody>
      <DraftDialogs draft={draft} />
    </>
  )
}
