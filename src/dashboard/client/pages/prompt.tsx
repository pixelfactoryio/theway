import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useLocation } from "wouter"

import { type CodeViewHandle, EditableCodeView } from "@/components/code-view"
import { DraftDialogs, DraftNotices, type HeaderFields, useFileDraft } from "@/components/draft"
import { useHistoryTab } from "@/components/history"
import { type AlertLine, Dash, InputsList, PanelRow, SavedStatus, UnknownFile } from "@/components/file-page"
import { MarkdownView } from "@/components/markdown"
import { PanelToggle, RecordBody, usePanelOpen } from "@/components/record-panel"
import { RecordTabs } from "@/components/record-tabs"
import { ErrorsBadge } from "@/components/status"
import { CopyField } from "@/components/text"
import { appliesTo, type FileBody, filePath, KIND_LABEL, kindOf, previewText, type PromptRow, useText } from "@/lib/files"
import { useFile, useLabel, usePrompts } from "@/shell/files"
import { LoadError } from "@/shell/load-error"
import { useProjects } from "@/shell/projects"
import { PageBody, TopBar } from "@/shell/top-bar"

/** The errors of a `404` on a file's route. */
export const UNKNOWN_FILE = ["unknown file", "unknown project"]

/** The prompt page's Details panel: `row`'s header fields, or the draft's (`fields`) while it differs from the file. */
function DetailsPanel({ file, row, fields }: { file: FileBody; row: PromptRow; fields: HeaderFields }) {
  const label = useLabel()
  const usedBy = file.usedBy ?? []
  return (
    <div className="flex flex-col gap-4 p-4">
      <h2 className="text-sm font-medium">Details</h2>
      <dl className="flex flex-col gap-4">
        <PanelRow yamlKey="description">
          {fields.header && fields.description !== null ? fields.description : <Dash />}
        </PanelRow>
        <PanelRow label="Kind">{KIND_LABEL[kindOf(fields)]}</PanelRow>
        <PanelRow yamlKey="model">
          {fields.model ?? <Dash />}
        </PanelRow>
        <PanelRow yamlKey="inputs">
          <InputsList inputs={fields.inputs} />
        </PanelRow>
        <PanelRow label="Used by">
          {usedBy.length === 0 ? (
            <Dash />
          ) : (
            <ul className="flex flex-col gap-1">
              {usedBy.map((use, i) => (
                <li key={i}>
                  <Link href={`${filePath("workflows", use.project, use.workflow)}?`} className="underline-offset-4 hover:underline">
                    {useText(use, label)}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </PanelRow>
        <PanelRow label="Applies to">{appliesTo(file.project, label)}</PanelRow>
        <PanelRow label="File">
          <CopyField value={file.path} name="the file path" />
        </PanelRow>
      </dl>
    </div>
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
  const label = useLabel()
  const [open, setOpen] = usePanelOpen()
  const [, navigate] = useLocation()
  const code = useRef<CodeViewHandle>(null)
  const [pending, setPending] = useState<number | null>(null)
  const view = tab === "preview" || tab === "history" ? tab : "prompt"
  const base = filePath("prompts", project, name)
  const historyTab = useHistoryTab({ draft, kind: "prompts", project, name, language: "prompt", active: view === "history" })

  // A placed line clicked on the Preview tab moves the cursor once the Prompt tab's code view is there.
  useEffect(() => {
    if (view !== "prompt" || pending === null) return
    code.current?.goToLine(pending)
    setPending(null)
  }, [view, pending])

  const errors = draft.errors
  const lines = useMemo<AlertLine[]>(
    () =>
      errors.map((e) => {
        const line = e.line
        if (line === null) return { text: e.text, onClick: null }
        if (view !== "prompt") {
          return {
            text: e.text,
            onClick: () => {
              setPending(line)
              navigate(`${base}?`)
            },
          }
        }
        return { text: `line ${line} · ${e.text}`, onClick: () => code.current?.goToLine(line) }
      }),
    [errors, view, base, navigate]
  )

  const crumbs = [{ label: "Prompts", href: "/prompts?" }, { label: name }]
  const unknownKey = project !== null && projects.data !== undefined && !projects.data.projects.some((p) => p.key === project)
  const fileFailed = file.isError && draft.store === null
  const unknown = unknownKey || (fileFailed && UNKNOWN_FILE.includes(file.error.message))
  if (unknown) {
    return (
      <>
        <TopBar items={crumbs} />
        <PageBody>
          <UnknownFile noun="prompt" name={name} back="Back to Prompts" href="/prompts?" />
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
  if (data === undefined || projects.data === undefined || prompts.data === undefined || draft.store === null || draft.text === null) {
    return (
      <>
        <TopBar items={crumbs} />
        <PageBody>{null}</PageBody>
      </>
    )
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

  return (
    <>
      <TopBar
        items={crumbs}
        actions={<PanelToggle page={history ? "history" : "prompt"} open={open} onOpenChange={setOpen} />}
      />
      <PageBody>
        <RecordTabs
          column={false}
          label="Prompt views"
          value={view}
          tabs={[
            { value: "prompt", label: "Prompt", href: `${base}?` },
            { value: "preview", label: "Preview", href: `${base}/preview?` },
            { value: "history", label: "History", href: `${base}/history?` },
          ]}
          right={
            <>
              <SavedStatus saved={draft.saved} />
              <span className="text-sm text-muted-foreground">{appliesTo(project, label)}</span>
              <ErrorsBadge errors={errors.map((e) => e.text)} />
            </>
          }
        />
        <RecordBody
          name={history ? "Versions" : "Details"}
          open={open}
          onOpenChange={setOpen}
          panel={history ? historyTab.panel : <DetailsPanel file={data} row={shownRow} fields={fields} />}
        >
          <DraftNotices draft={draft} lines={lines} history={history} />
          {history ? (
            historyTab.main
          ) : view === "preview" ? (
            <div data-scroll-root className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
              <MarkdownView text={previewText(draft.text, fields.header)} />
            </div>
          ) : (
            <div className="min-h-0 flex-1">
              <EditableCodeView ref={code} draft={draft.store} errors={errors} />
            </div>
          )}
        </RecordBody>
      </PageBody>
      <DraftDialogs draft={draft} />
    </>
  )
}
