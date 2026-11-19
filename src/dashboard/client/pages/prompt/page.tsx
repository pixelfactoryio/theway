import { EyeIcon, FileTextIcon, HistoryIcon } from "lucide-react"
import { type ReactNode, useEffect, useMemo, useRef } from "react"
import { useLocation } from "wouter"

import { CodeTab } from "@/components/code-tab"
import type { CodeViewHandle } from "@/components/code-view"
import { DraftDialogs, DraftNotices, DraftStatus } from "@/components/draft-notices"
import { useFileDraft } from "@/components/file-draft"
import { PageLoading, PageUnknown } from "@/components/page-states"
import { HistoryTab, useHistoryTab } from "@/components/history"
import { Dash, InputsList, LineList, UNKNOWN_FILE } from "@/components/file-page"
import { MarkdownView } from "@/components/markdown-view"
import { DocFrame } from "@/components/doc-frame"
import { DocFooter } from "@/components/doc-footer"
import { ColumnTitle, DocTitle } from "@/components/doc-title"
import { useSaveKey } from "@/components/step-prompt"
import { UsedByList } from "@/components/used-by-list"
import { StatusPill } from "@/components/status"
import { DetailRow, DocPanel } from "@/components/doc-panel"
import { CopyPath } from "@/components/title-block"
import { useFile, useLabel, useProjects, usePrompts } from "@/data/queries"
import {
  appliesTo,
  errorCount,
  type FileBody,
  type HeaderFields,
  KIND_LABEL,
  kindOf,
  previewText,
  type PromptRow,
} from "@/lib/files"
import { type AlertLine, alertLines } from "@/lib/alert-lines"
import { to } from "@/lib/routes"
import { LoadError } from "@/shell/load-error"
import { PageBody, PageHeader } from "@/shell/top-bar"

/** The prompt page's side panel: its status; Inputs and Used by (or the versions); then its Details. */
function PromptPanel({
  file,
  fields,
  errors,
  lines,
  versions,
}: {
  file: FileBody
  fields: HeaderFields
  errors: number
  lines: readonly AlertLine[]
  versions: ReactNode | null
}) {
  const label = useLabel()
  const usedBy = file.usedBy ?? []
  return (
    <DocPanel
      remember="prompt"
      label="Prompt"
      header={
        <StatusPill status={errors === 0 ? "ready" : "invalid"} label={errors === 0 ? "Valid" : errorCount(errors)} />
      }
      top={
        versions !== null
          ? [{ value: "versions", label: "Versions", content: versions }]
          : [
              {
                value: "inputs",
                label: "Inputs",
                count: fields.inputs.length > 0 ? fields.inputs.length : undefined,
                content: (
                  <div className="p-4">
                    <InputsList inputs={fields.inputs} />
                  </div>
                ),
              },
              {
                value: "used-by",
                label: "Used by",
                count: usedBy.length > 0 ? usedBy.length : undefined,
                content: <UsedByList uses={usedBy} label={label} />,
              },
              {
                value: "problems",
                label: "Problems",
                count: errors > 0 ? errors : undefined,
                content: <LineList variant="panel" lines={lines} />,
              },
            ]
      }
      bottom={[
        {
          value: "details",
          label: "Details",
          content: (
            <dl className="flex flex-col py-2">
              <DetailRow label="Description">
                {fields.header && fields.description !== null ? fields.description : <Dash />}
              </DetailRow>
              <DetailRow label="Kind">{KIND_LABEL[kindOf(fields)]}</DetailRow>
              <DetailRow label="Model">{fields.model ?? <Dash />}</DetailRow>
              <DetailRow label="Applies to">{appliesTo(file.project, label)}</DetailRow>
              <DetailRow label="File">
                <CopyPath value={file.path} name="the file path" />
              </DetailRow>
            </dl>
          ),
        },
      ]}
    />
  )
}

/**
 * `#/prompts/global/<name>[/preview|/history]` and `#/prompts/projects/<key>/<name>[/preview|/history]`: a prompt's text
 * in the editable code view, its rendered preview, its history, and its Details panel, all from the draft.
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
  const code = useRef<CodeViewHandle>(null)
  // A placed line clicked on the Preview tab, for the Prompt tab's code view.
  const pending = useRef<number | null>(null)
  const view = tab === "preview" || tab === "history" ? tab : "prompt"
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
  const label = useLabel()

  // A placed line clicked on the Preview tab moves the cursor once the Prompt tab's code view is there: the child's
  // mount effect, which attaches its editor to the draft, runs before this one.
  useEffect(() => {
    if (view !== "prompt" || pending.current === null) return
    code.current?.goToLine(pending.current)
    pending.current = null
  }, [view])

  const errors = draft.errors
  const lines = useMemo(
    () =>
      view === "prompt"
        ? alertLines(errors, (line) => () => code.current?.goToLine(line))
        : alertLines(errors, null, (e) => {
            const line = e.line
            if (line === null) return null
            return () => {
              pending.current = line
              navigate(to.file("prompts", project, name))
            }
          }),
    [errors, view, project, name, navigate],
  )

  const unknownKey =
    project !== null && projects.data !== undefined && !projects.data.projects.some((p) => p.key === project)
  const fileFailed = file.isError && draft.store === null
  const unknown = unknownKey || (fileFailed && UNKNOWN_FILE.includes(file.error.message))
  if (unknown) {
    return (
      <PageUnknown
        title={name}
        message={
          <>
            No prompt <code className="font-mono">{name}</code>
          </>
        }
        back={{ label: "Back to Prompts", href: to.prompts() }}
      />
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
          ) : (
            <LoadError
              what="this prompt"
              error={(file.error ?? prompts.error) as Error}
              retry={() => {
                void file.refetch()
                void prompts.refetch()
              }}
              className="m-4 w-auto"
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
    return <PageLoading title={name} />
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
  const title = (
    <DocTitle
      caption={`Prompts · ${appliesTo(project, label)}`}
      title={name}
      description={fields.description}
      variant="document"
    />
  )
  const notices = <DraftNotices draft={draft} lines={lines} history={history} />
  const status = <DraftStatus dirty={draft.dirty} saved={draft.saved} onDiscard={draft.discard} />

  return (
    <>
      <DocFrame
        title={`${name} · Prompts`}
        label="Prompt views"
        value={view}
        tabs={[
          {
            value: "prompt",
            label: "Prompt",
            href: to.file("prompts", project, name),
            Icon: FileTextIcon,
            dirty: draft.dirty && view === "prompt",
          },
          { value: "preview", label: "Preview", href: to.file("prompts", project, name, "preview"), Icon: EyeIcon },
          { value: "history", label: "History", href: to.file("prompts", project, name, "history"), Icon: HistoryIcon },
        ]}
        panelName={history ? "Versions" : "Details"}
        panel={
          <PromptPanel
            file={data}
            fields={fields}
            errors={errors.length}
            lines={lines}
            versions={history ? historyTab.panel : null}
          />
        }
      >
        {view === "prompt" ? (
          <CodeTab
            ref={code}
            title={title}
            notices={notices}
            draft={draft.store}
            errors={errors}
            file={`${name}.md`}
            status={status}
          />
        ) : history ? (
          <HistoryTab title={title} notices={notices} main={historyTab.main} file={`${name}.md`} status={status} />
        ) : (
          <>
            {notices}
            <div data-scroll-root className="min-h-0 flex-1 overflow-y-auto">
              <ColumnTitle>{title}</ColumnTitle>
              <MarkdownView text={previewText(draft.text, fields.header)} name={`${name}.md`} />
            </div>
            <DocFooter file={`${name}.md`} status={status} />
          </>
        )}
      </DocFrame>
      <DraftDialogs draft={draft} />
    </>
  )
}
