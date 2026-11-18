import { CodeIcon, HistoryIcon, InfoIcon, WorkflowIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLocation } from "wouter"

import { type CodeViewHandle, EditableCodeView } from "@/components/code-view"
import { DraftDialogs, DraftNotices, DraftStatus } from "@/components/draft-notices"
import { useFileDraft } from "@/components/file-draft"
import { useHistoryTab } from "@/components/history"
import { type AlertLine, STRIP, UNKNOWN_FILE, UnknownFile } from "@/components/file-page"
import { DocFrame } from "@/components/doc-frame"
import { DocTitle } from "@/components/doc-title"
import { usePanelOpen } from "@/components/record-panel"
import { StepPrompt, StepPromptUses, useSaveKey } from "@/components/step-prompt"
import { Alert, AlertTitle } from "@/components/reui/alert"
import { Badge } from "@/components/reui/badge"
import { DetailRow, DocPanel } from "@/components/doc-panel"
import { StatusPill } from "@/components/status"
import { CopyPath, Problems } from "@/components/title-block"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { StepPicker } from "@/components/step-picker"
import { type CanvasEdits, WorkflowCanvas } from "@/components/workflow-canvas"
import { applyEdit, type HistoryMode, type Write } from "@/components/workflow-fields"
import { WorkflowEditPanel } from "@/components/workflow-panel"
import { StepPanel, WorkflowPanel } from "@/components/workflow-read-panels"
import { StepEditPanel } from "@/components/workflow-step-panel"
import { useFile, useLabel, useProjects, usePrompts } from "@/data/queries"
import { appliesTo, errorCount, type PromptRow } from "@/lib/files"
import { to } from "@/lib/routes"
import {
  type Drawing,
  drawWorkflow,
  findPrompt,
  isDefaultText,
  sameSelection,
  type Selection,
  selectionOf,
} from "@/lib/workflow"
import { addStep, changeStepPrompt, hasAnchors, moveStep, removeStep } from "@/lib/workflow-edit"
import { LoadError } from "@/shell/load-error"
import { PageBody, PageHeader } from "@/shell/top-bar"

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
  const [, setOpen] = usePanelOpen()
  const [, navigate] = useLocation()
  const [selection, setSelection] = useState<Selection | null>(null)
  const code = useRef<CodeViewHandle>(null)
  const yamlTab = tab === "yaml"
  const history = tab === "history"
  const historyTab = useHistoryTab({ draft, kind: "workflows", project, name, language: "yaml", active: history })
  useSaveKey(() => {
    if (draft.dirty) void draft.save(false)
  })

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
            project,
          ),
    [text, errors, prompts.data, project],
  )
  const drawing = drawn !== null && "drawing" in drawn ? drawn.drawing : null
  // From the text, not the drawing: a default file that cannot be drawn still carries its badge.
  const isDefault = useMemo(() => text !== null && isDefaultText(text), [text])

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
    [setOpen, setPicker],
  )

  // After Undo, Redo, a YAML tab edit or any edit: a selected step that no longer exists is cleared, a gone on-fail
  // card selects its step.
  const kept = keptSelection(selection, drawing)
  if (!sameSelection(kept, selection)) setSelection(kept)

  // Any change of the draft other than the picker's own choice, and leaving the Editor tab, close the picker.
  const pickerText = useRef<string | null>(null)
  useEffect(() => {
    if (picker !== null && text !== pickerText.current) setPicker(null)
  }, [text, picker])
  const [shownTab, setShownTab] = useState(tab)
  if (tab !== shownTab) {
    setShownTab(tab)
    if (tab !== undefined) setPicker(null)
  }
  const openPicker = useCallback(
    (next: Picker) => {
      pickerText.current = text
      setPicker(next)
      setOpen(true)
    },
    [text, setOpen, setPicker],
  )

  const store = draft.store
  const write: Write = useCallback(
    (edit: (text: string) => string, mode: HistoryMode = "full") =>
      store === null ? false : applyEdit(store, edit, mode),
    [store],
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
    [errors, yamlTab, drawing, select],
  )

  const unknownKey =
    project !== null && projects.data !== undefined && !projects.data.projects.some((p) => p.key === project)
  const fileFailed = file.isError && draft.store === null
  if (unknownKey || (fileFailed && UNKNOWN_FILE.includes(file.error.message))) {
    return (
      <>
        <PageHeader title={name} />
        <PageBody>
          <UnknownFile noun="workflow" name={name} back="Back to Workflows" href={to.workflows()} />
        </PageBody>
      </>
    )
  }
  if (projects.isError || fileFailed || prompts.isError) {
    return (
      <>
        <PageHeader title={name} />
        <PageBody>
          {projects.isError ? (
            <LoadError
              what="the projects"
              error={projects.error}
              retry={() => void projects.refetch()}
              className="m-4 w-auto"
            />
          ) : fileFailed ? (
            <LoadError
              what="this workflow"
              error={file.error as Error}
              retry={() => void file.refetch()}
              className="m-4 w-auto"
            />
          ) : (
            <LoadError
              what="the prompts"
              error={prompts.error as Error}
              retry={() => void prompts.refetch()}
              className="m-4 w-auto"
            />
          )}
        </PageBody>
      </>
    )
  }
  if (
    data === undefined ||
    prompts.data === undefined ||
    projects.data === undefined ||
    drawn === null ||
    draft.store === null
  ) {
    return (
      <>
        <PageHeader title={name} />
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
      <WorkflowEditPanel text={text} lines={lineTexts} write={write} />
    ) : step !== null && drawing !== null ? (
      <StepPanel
        step={step}
        total={drawing.steps.length}
        onFail={selection?.kind === "on-fail"}
        prompts={prompts.data.prompts}
        project={project}
      />
    ) : (
      <WorkflowPanel drawing={drawing} />
    )

  const promptName =
    kept?.kind === "step" && step !== null && step.fields.uses !== null && "prompt" in step.fields.uses
      ? step.fields.uses.prompt
      : null
  const promptRow = promptName !== null ? findPrompt(promptRows, project, promptName) : null
  const details = (
    <dl className="flex flex-col py-2">
      <DetailRow label="Applies to">{appliesTo(project, label)}</DetailRow>
      <DetailRow label="Steps">
        <span className="tabular-nums">{drawing === null ? "–" : drawing.steps.length}</span>
      </DetailRow>
      <DetailRow label="Runs on">{drawing?.runsOn ?? "–"}</DetailRow>
      <DetailRow label="File">
        <CopyPath value={data.path} name="the file path" />
      </DetailRow>
    </dl>
  )

  // On the Editor tab the heading stands over the canvas's top, as on a design canvas; elsewhere above the view.
  const onCanvas = !history && !yamlTab && "drawing" in drawn
  const heading = (
    <DocTitle
      caption={`Workflows · ${appliesTo(project, label)}`}
      title={name}
      description={drawing?.description}
      variant="canvas"
    />
  )

  return (
    <>
      <DocFrame
        title={`${name} · Workflows`}
        label="Workflow views"
        page={history ? "history" : "workflow"}
        value={history ? "history" : yamlTab ? "yaml" : "editor"}
        tabs={[
          {
            value: "editor",
            label: "Editor",
            href: to.file("workflows", project, name),
            Icon: WorkflowIcon,
            dirty: draft.dirty && !yamlTab && !history,
          },
          {
            value: "yaml",
            label: "YAML",
            href: to.file("workflows", project, name, "yaml"),
            Icon: CodeIcon,
            dirty: draft.dirty && yamlTab,
          },
          {
            value: "history",
            label: "History",
            href: to.file("workflows", project, name, "history"),
            Icon: HistoryIcon,
          },
        ]}
        panelName={
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
        panel={
          <DocPanel
            key={promptRow !== null ? "prompt" : "workflow"}
            remember={promptRow !== null ? "workflow-step" : "workflow"}
            topShare={promptRow !== null ? "50%" : "70%"}
            label="Workflow"
            header={
              <>
                <StatusPill
                  status={errors.length === 0 ? "ready" : "invalid"}
                  label={errors.length === 0 ? "Valid" : errorCount(errors.length)}
                />
                {isDefault ? <Badge variant="outline">default</Badge> : null}
              </>
            }
            top={
              history
                ? [{ value: "versions", label: "Versions", content: historyTab.panel }]
                : [
                    {
                      value: "inspector",
                      label: step !== null ? `Step ${step.index + 1} · ${step.name}` : "Workflow",
                      content: panel,
                    },
                    {
                      value: "problems",
                      label: "Problems",
                      count: errors.length > 0 ? errors.length : undefined,
                      content: <Problems lines={lines} />,
                    },
                  ]
            }
            bottom={
              promptRow !== null && !history
                ? [
                    {
                      value: "prompt",
                      label: "Prompt",
                      content: <StepPrompt key={`${promptRow.project ?? ""}/${promptRow.name}`} row={promptRow} />,
                    },
                    { value: "used-by", label: "Used by", content: <StepPromptUses row={promptRow} /> },
                  ]
                : [{ value: "details", label: "Details", content: details }]
            }
          />
        }
      >
        {onCanvas ? null : <div className="shrink-0 px-14 pt-5 pb-3">{heading}</div>}
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
          <div className="min-h-0 flex-1 border-t">
            <EditableCodeView ref={code} draft={draft.store} errors={errors} />
          </div>
        ) : "reason" in drawn ? (
          <CannotDraw reason={drawn.reason} openYaml={() => navigate(to.file("workflows", project, name, "yaml"))} />
        ) : (
          <WorkflowCanvas
            key={`${project ?? "global"}/${name}`}
            drawing={drawn.drawing}
            selection={kept}
            onSelect={select}
            store={draft.store}
            edits={edits}
            header={heading}
          />
        )}
        <div className="flex h-7 shrink-0 items-center gap-2 border-t px-4 text-xs text-muted-foreground">
          <span className="font-mono">{name}.yaml</span>
          <span className="ml-auto">
            <DraftStatus dirty={draft.dirty} saved={draft.saved} onDiscard={draft.discard} />
          </span>
        </div>
      </DocFrame>
      <DraftDialogs draft={draft} />
    </>
  )
}
