import { FileTextIcon } from "lucide-react"
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react"
import { useLocation } from "wouter"

import { DocFrame } from "@/components/doc-frame"
import { DraftDialogs, DraftNotices } from "@/components/draft-notices"
import { fileStatus, InputsCard, ProblemsCard, StatusCard, UsedByCard } from "@/components/fact-cards"
import { FileEditor, type FileView, SaveControls } from "@/components/file-editor"
import { useFileDraft } from "@/components/file-draft"
import { Dash, SavedStatus, UNKNOWN_FILE } from "@/components/file-page"
import { HistoryTab, useHistoryTab } from "@/components/history"
import { goToLine } from "@/components/live-markdown"
import { PageLoading, PageUnknown } from "@/components/page-states"
import { PropertyCard, PropertyCards, PropertyList, PropertyRow } from "@/components/property-card"
import { StatusPill } from "@/components/status"
import { useSaveKey } from "@/components/step-prompt"
import { CopyPath } from "@/components/title-block"
import { useFile, useLabel, useProjects, usePrompts } from "@/data/queries"
import { appliesTo, type FileBody, type HeaderFields, KIND_LABEL, kindOf, type PromptRow } from "@/lib/files"
import { type AlertLine, alertLines } from "@/lib/alert-lines"
import { to } from "@/lib/routes"
import { PageLoadError } from "@/shell/load-error"
import { PageBody, PageHeader } from "@/shell/top-bar"

/** The prompt's path in every header of its page: Prompts, then its name. */
const PARENTS = [{ label: "Prompts", href: to.prompts() }]

/**
 * The prompt page's right column, one stack of cards: its Problems while it has errors; on History its Versions; then
 * its Details (the description, the kind, the model, what it applies to, the file's path), its Inputs and the
 * workflows that use it, all from the draft.
 */
function PromptCards({
  file,
  fields,
  lines,
  versions,
}: {
  file: FileBody
  fields: HeaderFields
  lines: readonly AlertLine[]
  versions: ReactNode | null
}) {
  const label = useLabel()
  const description = fields.header ? fields.description : null
  return (
    <PropertyCards>
      <StatusCard {...fileStatus(lines.length)} />
      {lines.length > 0 ? <ProblemsCard lines={lines} /> : null}
      {/* The history's own Versions card. */}
      {versions}
      <PropertyCard title="Details">
        <PropertyList>
          <PropertyRow label="Description">{description ?? <Dash />}</PropertyRow>
          <PropertyRow label="Kind">{KIND_LABEL[kindOf(fields)]}</PropertyRow>
          <PropertyRow label="Model">{fields.model ?? <Dash />}</PropertyRow>
          {fields.inputs.length === 0 ? (
            <PropertyRow label="Inputs">
              <Dash />
            </PropertyRow>
          ) : null}
          <PropertyRow label="Applies to">{appliesTo(file.project, label)}</PropertyRow>
          <PropertyRow label="File">
            <CopyPath value={file.path} what="the file path" />
          </PropertyRow>
        </PropertyList>
      </PropertyCard>
      {fields.inputs.length > 0 ? <InputsCard inputs={fields.inputs} /> : null}
      <UsedByCard uses={file.usedBy ?? []} label={label} />
    </PropertyCards>
  )
}

/**
 * `#/prompts/global/<name>[/history]` and `#/prompts/projects/<key>/<name>[/history]`: a prompt's file edited whole in
 * the file editor (Source, Split or Preview), its history, and its cards in the panel, all from the draft (the former
 * `/preview` address shows the file). The
 * header states its name once, for every view: Prompts › name, its status, the panel's button, the views as pill tabs.
 */
export function PromptPage({ project, name, tab }: { project: string | null; name: string; tab?: string }) {
  const projects = useProjects()
  const prompts = usePrompts()
  const file = useFile("prompts", project, name)
  const draft = useFileDraft({
    kind: "prompts",
    project,
    name,
    file: file.data,
    fetching: file.isFetching,
    language: "prompt",
    docName: `${name}.md`,
  })
  const [, navigate] = useLocation()
  const [fileView, setFileView] = useState<FileView>("source")
  // A placed line clicked on the History tab, for the Prompt tab's editor.
  const pending = useRef<number | null>(null)
  // The address of the former Preview tab shows the Prompt tab, where the text is read and edited.
  const view = tab === "history" ? tab : "prompt"
  const historyTab = useHistoryTab({
    draft,
    kind: "prompts",
    project,
    name,
    language: "prompt",
    active: view === "history",
  })
  useSaveKey(() => {
    if (draft.dirty) void draft.save(false)
  })

  // A placed line clicked on the History tab moves the cursor once the Prompt tab's editor is there: the child's
  // mount effect, which attaches its editor to the draft, runs before this one.
  const store = draft.store
  useEffect(() => {
    if (view !== "prompt" || pending.current === null || store === null) return
    goToLine(store, pending.current)
    pending.current = null
  }, [view, store])

  const errors = draft.errors
  const lines = useMemo(
    () =>
      view === "prompt"
        ? alertLines(errors, (line) => () => store !== null && goToLine(store, line))
        : alertLines(errors, null, (e) => {
            const line = e.line
            if (line === null) return null
            return () => {
              pending.current = line
              navigate(to.file("prompts", project, name))
            }
          }),
    [errors, view, project, name, navigate, store],
  )

  const unknownKey =
    project !== null && projects.data !== undefined && !projects.data.projects.some((p) => p.key === project)
  const fileFailed = file.isError && draft.store === null
  const unknown = unknownKey || (fileFailed && UNKNOWN_FILE.includes(file.error.message))
  if (unknown) {
    return (
      <PageUnknown
        title={name}
        mono
        icon={FileTextIcon}
        parents={PARENTS}
        message={
          <>
            No prompt <code className="font-mono text-xs">{name}</code>
          </>
        }
        back={{ label: "Back to Prompts", href: to.prompts() }}
      />
    )
  }
  if (projects.isError || fileFailed || prompts.isError) {
    return (
      <>
        <PageHeader title={name} mono icon={FileTextIcon} parents={PARENTS} />
        <PageBody>
          {projects.isError ? (
            <PageLoadError what="the projects" error={projects.error} retry={() => void projects.refetch()} />
          ) : (
            <PageLoadError
              what="this prompt"
              error={(file.error ?? prompts.error) as Error}
              retry={() => {
                void file.refetch()
                void prompts.refetch()
              }}
            />
          )}
        </PageBody>
      </>
    )
  }
  const data = file.data
  const row = prompts.data?.prompts.find((p) => p.name === name && p.project === project)
  if (
    data === undefined ||
    projects.data === undefined ||
    prompts.data === undefined ||
    draft.store === null ||
    draft.text === null
  ) {
    return <PageLoading title={name} mono icon={FileTextIcon} parents={PARENTS} />
  }
  const shownRow: PromptRow = row ?? {
    name,
    project,
    description: null,
    model: null,
    header: false,
    inputs: [],
    errors: data.errors.map((e) => e.text),
    usedBy: data.usedBy ?? [],
  }
  // While the draft differs from the file, the header fields of its last applied check; else the prompt's row.
  const fields: HeaderFields = draft.dirty && draft.details !== null ? draft.details : shownRow
  const history = view === "history"
  const notices = <DraftNotices draft={draft} lines={lines} history={history} />
  const fileName = `${name}.md`

  return (
    <>
      <DocFrame
        title={name}
        mono
        copy={{ value: name, what: "the prompt name" }}
        icon={FileTextIcon}
        parents={PARENTS}
        label="Prompt views"
        value={view}
        tabs={[
          {
            value: "prompt",
            label: "Prompt",
            href: to.file("prompts", project, name),
            dirty: draft.dirty && view === "prompt",
          },
          { value: "history", label: "History", href: to.file("prompts", project, name, "history") },
        ]}
        tabActions={
          history ? undefined : (
            <SaveControls
              dirty={draft.dirty}
              saving={draft.saving}
              onSave={() => void draft.save(false)}
              onDiscard={draft.discard}
            />
          )
        }
        status={<StatusPill {...fileStatus(errors.length)} />}
        notices={notices}
        heading={null}
        panelName="Details"
        panel={<PromptCards file={data} fields={fields} lines={lines} versions={history ? historyTab.panel : null} />}
      >
        {history ? (
          <HistoryTab main={historyTab.main} file={fileName} status={<SavedStatus saved={draft.saved} />} />
        ) : (
          <FileEditor
            key={fileName}
            store={draft.store}
            base={draft.loaded?.text ?? draft.text}
            name={fileName}
            language="prompt"
            errors={errors}
            view={fileView}
            onViewChange={setFileView}
            dirty={draft.dirty}
            saved={draft.saved}
          />
        )}
      </DocFrame>
      <DraftDialogs draft={draft} />
    </>
  )
}
