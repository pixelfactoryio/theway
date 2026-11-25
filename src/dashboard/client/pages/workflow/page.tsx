import { WorkflowIcon } from "lucide-react"
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useSearch } from "wouter"

import { CodeTab } from "@/components/code-tab"
import type { CodeViewHandle } from "@/components/code-view"
import { DocFooter } from "@/components/doc-footer"
import { DocFrame, ItemHeading } from "@/components/doc-frame"
import { DraftDialogs, DraftNotices, DraftStatus } from "@/components/draft-notices"
import { fileStatus, ProblemsCard, StatusCard } from "@/components/fact-cards"
import { useFileDraft } from "@/components/file-draft"
import { UNKNOWN_FILE } from "@/components/file-page"
import { PageLoading, PageUnknown } from "@/components/page-states"
import { HistoryTab, useHistoryTab } from "@/components/history"
import { RowChip } from "@/components/list-kit"
import { PropertyCard, PropertyCards, PropertyList, PropertyRow } from "@/components/property-card"
import { usePanelOpen } from "@/components/record-panel"
import { StatusPill } from "@/components/status"
import { StepPicker } from "@/components/step-picker"
import { StepPrompt, StepPromptUses, useSaveKey } from "@/components/step-prompt"
import { CopyPath } from "@/components/title-block"
import { Button } from "@/components/ui/button"
import { type CanvasEdits, WorkflowCanvas } from "@/components/workflow-canvas"
import { applyEdit, type HistoryMode, type Write } from "@/components/workflow-fields"
import { WorkflowEditPanel } from "@/components/workflow-panel"
import { StepPanel, WorkflowPanel } from "@/components/workflow-read-panels"
import { StepEditPanel } from "@/components/workflow-step-panel"
import { useFile, useLabel, useProjects, usePrompts } from "@/data/queries"
import { alertLines } from "@/lib/alert-lines"
import { workflowCommand } from "@/lib/copy-targets"
import { appliesTo, type PromptRow } from "@/lib/files"
import { to } from "@/lib/routes"
import {
  type Drawing,
  drawWorkflow,
  findPrompt,
  isDefaultText,
  sameSelection,
  type Selection,
  selectionOf,
  selectionFromSearch,
  selectionSearch,
  stepsRunOn,
} from "@/lib/workflow"
import { addStep, changeStepPrompt, hasAnchors, moveStep, removeStep } from "@/lib/workflow-edit"
import { PageLoadError } from "@/shell/load-error"
import { StateBlock, StateNotice } from "@/shell/state"
import { type Crumb, PageBody, PageHeader } from "@/shell/top-bar"

/** The path above every workflow's page. */
const PARENTS: readonly Crumb[] = [{ label: "Workflows", href: to.workflows() }]

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
    <div className="min-h-0 flex-1">
      <StateBlock
        size="page"
        title="This file cannot be drawn"
        action={
          <Button variant="outline" size="sm" onClick={openYaml}>
            Open YAML
          </Button>
        }
      >
        <span className="font-mono text-xs">{reason}</span>
      </StateBlock>
    </div>
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
  const [location, navigate] = useLocation()
  const search = useSearch()
  // The selected card is in the address (`?step=`, `selectionSearch`), written in place, so a reload or a copied link
  // opens it selected; a view's tab drops it from the address, and it is written again.
  const [selection, setSelection] = useState<Selection | null>(() => selectionFromSearch(search))
  const selected = selectionSearch(selection)
  useEffect(() => {
    if (new URLSearchParams(search).toString() !== selected) navigate(`${location}?${selected}`, { replace: true })
  }, [selected, search, location, navigate])
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

  const lines = useMemo(
    () =>
      yamlTab
        ? alertLines(errors, (line) => () => code.current?.goToLine(line))
        : alertLines(errors, null, (e) => {
            const target = drawing === null ? null : selectionOf(e, drawing)
            return target === null ? null : () => select(target)
          }),
    [errors, yamlTab, drawing, select],
  )

  const unknownKey =
    project !== null && projects.data !== undefined && !projects.data.projects.some((p) => p.key === project)
  const fileFailed = file.isError && draft.store === null
  if (unknownKey || (fileFailed && UNKNOWN_FILE.includes(file.error.message))) {
    return (
      <PageUnknown
        title={name}
        mono
        icon={WorkflowIcon}
        parents={PARENTS}
        message={
          <>
            No workflow <code className="font-mono text-xs">{name}</code>
          </>
        }
        back={{ label: "Back to Workflows", href: to.workflows() }}
      />
    )
  }
  if (projects.isError || fileFailed || prompts.isError) {
    return (
      <>
        <PageHeader title={name} mono icon={WorkflowIcon} parents={PARENTS} />
        <PageBody>
          {projects.isError ? (
            <PageLoadError what="the projects" error={projects.error} retry={() => void projects.refetch()} />
          ) : fileFailed ? (
            <PageLoadError what="this workflow" error={file.error as Error} retry={() => void file.refetch()} />
          ) : (
            <PageLoadError what="the prompts" error={prompts.error as Error} retry={() => void prompts.refetch()} />
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
    return <PageLoading title={name} mono icon={WorkflowIcon} parents={PARENTS} />
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

  const inspector: ReactNode =
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
    <PropertyCard title="Details">
      <PropertyList>
        <PropertyRow label="Applies to">{appliesTo(project, label)}</PropertyRow>
        <PropertyRow label="Steps">
          <span className="tabular-nums">{drawing === null ? "–" : drawing.steps.length}</span>
        </PropertyRow>
        <PropertyRow label="Runs on">{(drawing === null ? null : stepsRunOn(drawing)) ?? "–"}</PropertyRow>
        <PropertyRow label="File">
          <CopyPath value={data.path} what="the file path" />
        </PropertyRow>
      </PropertyList>
    </PropertyCard>
  )

  // The right column: the versions on History; else the problems, then the selected card's cards (the picker, the
  // step and its prompt and the workflows that use it) or the workflow's cards and its details.
  const shownStatus = fileStatus(errors.length)
  const panel = (
    <PropertyCards>
      <StatusCard {...shownStatus} action={isDefault ? <RowChip>default</RowChip> : undefined} />
      {history ? (
        historyTab.panel
      ) : (
        <>
          {errors.length > 0 ? <ProblemsCard lines={lines} /> : null}
          {inspector}
          {promptRow !== null && !(editable && picker !== null) ? (
            <>
              <StepPrompt key={`${promptRow.project ?? ""}/${promptRow.name}`} row={promptRow} />
              <StepPromptUses row={promptRow} current={{ workflow: name, project }} />
            </>
          ) : null}
          {step === null && !(editable && picker !== null) ? details : null}
        </>
      )}
    </PropertyCards>
  )

  const notices = (
    <>
      <DraftNotices draft={draft} lines={lines} history={history} />
      {!yamlTab && !history && drawing !== null && anchors ? (
        <StateNotice tone="info" title="This file uses YAML anchors">
          Edit it on the YAML tab.
        </StateNotice>
      ) : null}
    </>
  )
  const status = <DraftStatus dirty={draft.dirty} saved={draft.saved} onDiscard={draft.discard} />
  const fileName = `${name}.yaml`

  return (
    <>
      <DocFrame
        title={name}
        mono
        copy={{ value: name, what: "the workflow name" }}
        run={[workflowCommand(name)]}
        icon={WorkflowIcon}
        parents={PARENTS}
        label="Workflow views"
        value={history ? "history" : yamlTab ? "yaml" : "editor"}
        tabs={[
          {
            value: "editor",
            label: "Editor",
            href: to.file("workflows", project, name),
            dirty: draft.dirty && !yamlTab && !history,
          },
          {
            value: "yaml",
            label: "YAML",
            href: to.file("workflows", project, name, "yaml"),
            dirty: draft.dirty && yamlTab,
          },
          { value: "history", label: "History", href: to.file("workflows", project, name, "history") },
        ]}
        status={<StatusPill {...shownStatus} />}
        notices={notices}
        heading={<ItemHeading title={drawing?.description ?? null} />}
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
        panel={panel}
      >
        {yamlTab ? (
          <CodeTab ref={code} draft={draft.store} errors={errors} file={fileName} status={status} />
        ) : history ? (
          <HistoryTab main={historyTab.main} file={fileName} status={status} />
        ) : (
          <>
            {"reason" in drawn ? (
              <CannotDraw
                reason={drawn.reason}
                openYaml={() => navigate(to.file("workflows", project, name, "yaml"))}
              />
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
            <DocFooter file={fileName} status={status} />
          </>
        )}
      </DocFrame>
      <DraftDialogs draft={draft} />
    </>
  )
}
