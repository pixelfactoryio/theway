import { EyeIcon, FileTextIcon, HistoryIcon } from "lucide-react"
import { type ReactNode, useEffect, useMemo, useRef } from "react"
import { Link, useLocation } from "wouter"

import { type CodeViewHandle, EditableCodeView } from "@/components/code-view"
import { DraftDialogs, DraftNotices, type HeaderFields, useFileDraft } from "@/components/draft"
import { useHistoryTab } from "@/components/history"
import { type AlertLine, Dash, InputsList, SavedStatus, UnknownFile } from "@/components/file-page"
import { MarkdownView } from "@/components/markdown"
import { DocFrame } from "@/components/doc-frame"
import { useSaveKey } from "@/components/step-prompt"
import { FileStatusPill } from "@/components/status"
import { CopyButton, DetailRow, DocPanel } from "@/components/doc-panel"
import { CopyPath, Problems } from "@/components/title-block"
import {
  appliesTo,
  type FileBody,
  filePath,
  KIND_LABEL,
  kindOf,
  previewText,
  type PromptRow,
  describeUse,
} from "@/lib/files"
import { useFile, useLabel, usePrompts } from "@/shell/files"
import { LoadError } from "@/shell/load-error"
import { useProjects } from "@/shell/projects"
import { MAC } from "@/shell/platform"
import { PageBody, TopBar, type TopBarItem } from "@/shell/top-bar"

/** The errors of a `404` on a file's route. */
export const UNKNOWN_FILE = ["unknown file", "unknown project"]

/** The prompt page's side panel: its status and Copy path; Inputs and Used by (or the versions); then its Details. */
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
  lines: AlertLine[]
  versions: ReactNode | null
}) {
  const label = useLabel()
  const usedBy = file.usedBy ?? []
  return (
    <DocPanel
      remember="prompt"
      topShare="70%"
      label="Prompt"
      header={
        <>
          <FileStatusPill errors={errors} />
          <span className="flex-1" />
          <CopyButton value={file.path} label="Copy path" />
        </>
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
                content:
                  usedBy.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-muted-foreground">No workflow uses this prompt.</p>
                  ) : (
                    <ul className="flex flex-col py-1">
                      {usedBy.map((use, i) => (
                        <li key={i}>
                          <Link
                            href={`${filePath("workflows", use.project, use.workflow)}?`}
                            className="block px-4 py-2 text-sm transition-colors hover:bg-accent"
                          >
                            {describeUse(use, label)}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ),
              },
              {
                value: "problems",
                label: "Problems",
                count: errors > 0 ? errors : undefined,
                content: <Problems lines={lines} />,
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
  const base = filePath("prompts", project, name)
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
  const lines = useMemo<AlertLine[]>(
    () =>
      errors.map((e) => {
        const line = e.line
        if (line === null) return { text: e.text, onClick: null }
        if (view !== "prompt") {
          return {
            text: e.text,
            onClick: () => {
              pending.current = line
              navigate(`${base}?`)
            },
          }
        }
        return { text: `line ${line} · ${e.text}`, onClick: () => code.current?.goToLine(line) }
      }),
    [errors, view, base, navigate],
  )

  const crumbs: TopBarItem[] = [{ section: "Library" }, { label: "Prompts", href: "/prompts?" }, { label: name }]
  const unknownKey =
    project !== null && projects.data !== undefined && !projects.data.projects.some((p) => p.key === project)
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
      <DocFrame
        label="Prompt views"
        page={history ? "history" : "prompt"}
        value={view}
        tabs={[
          {
            value: "prompt",
            label: "Prompt",
            href: `${base}?`,
            Icon: FileTextIcon,
            dirty: draft.dirty && view === "prompt",
          },
          { value: "preview", label: "Preview", href: `${base}/preview?`, Icon: EyeIcon },
          { value: "history", label: "History", href: `${base}/history?`, Icon: HistoryIcon },
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
        <div className="shrink-0 px-12 pt-5 pb-3">
          <p className="text-xs text-muted-foreground">Prompts · {appliesTo(project, label)}</p>
          <h1 className="mt-1 text-title font-semibold tracking-tight">{name}</h1>
          {fields.description !== null ? <p className="text-sm text-muted-foreground">{fields.description}</p> : null}
        </div>
        <DraftNotices draft={draft} lines={lines} history={history} />
        {history ? (
          historyTab.main
        ) : view === "preview" ? (
          <div data-scroll-root className="min-h-0 flex-1 overflow-y-auto">
            <div className="max-w-[53rem] px-12 py-6">
              <MarkdownView text={previewText(draft.text, fields.header)} />
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1">
            <EditableCodeView ref={code} draft={draft.store} errors={errors} />
          </div>
        )}
        <div className="flex h-7 shrink-0 items-center gap-2 border-t px-4 text-xs text-muted-foreground">
          <span className="font-mono">{name}.md</span>
          <span aria-hidden="true">·</span>
          <span>{appliesTo(project, label)}</span>
          <span className="ml-auto">
            {draft.dirty ? (
              <span className="text-foreground">Unsaved · {MAC ? "⌘S" : "Ctrl+S"} to save</span>
            ) : (
              <SavedStatus saved={draft.saved} />
            )}
          </span>
        </div>
      </DocFrame>
      <DraftDialogs draft={draft} />
    </>
  )
}
