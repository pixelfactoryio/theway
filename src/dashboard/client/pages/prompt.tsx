import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useLocation } from "wouter"

import { CodeView, type CodeViewHandle } from "@/components/code-view"
import { type AlertLine, Dash, ErrorStrip, InputsList, PanelRow, UnknownFile } from "@/components/file-page"
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

/** The prompt page's Details panel. */
function DetailsPanel({ file, row }: { file: FileBody; row: PromptRow }) {
  const label = useLabel()
  const usedBy = file.usedBy ?? []
  return (
    <div className="flex flex-col gap-4 p-4">
      <h2 className="text-sm font-medium">Details</h2>
      <dl className="flex flex-col gap-4">
        <PanelRow label="description" code>
          {row.header && row.description !== null ? row.description : <Dash />}
        </PanelRow>
        <PanelRow label="Kind">{KIND_LABEL[kindOf(row)]}</PanelRow>
        <PanelRow label="model" code>
          {row.model ?? <Dash />}
        </PanelRow>
        <PanelRow label="inputs" code>
          <InputsList inputs={row.inputs} />
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
 * `#/prompts/global/<name>[/preview]` and `#/prompts/projects/<key>/<name>[/preview]`: a prompt's text in the code
 * view, its rendered preview, and its Details panel.
 */
export function PromptPage({ project, name, tab }: { project: string | null; name: string; tab?: string }) {
  const projects = useProjects()
  const prompts = usePrompts()
  const file = useFile("prompts", project, name)
  const label = useLabel()
  const [open, setOpen] = usePanelOpen()
  const [, navigate] = useLocation()
  const code = useRef<CodeViewHandle>(null)
  const [pending, setPending] = useState<number | null>(null)
  const preview = tab === "preview"
  const base = filePath("prompts", project, name)

  // A placed line clicked on the Preview tab moves the cursor once the Prompt tab's code view is there.
  useEffect(() => {
    if (preview || pending === null) return
    code.current?.goToLine(pending)
    setPending(null)
  }, [preview, pending])

  const lines = useMemo<AlertLine[]>(
    () =>
      (file.data?.errors ?? []).map((e) => {
        const line = e.line
        if (line === null) return { text: e.text, onClick: null }
        if (preview) {
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
    [file.data, preview, base, navigate]
  )

  const crumbs = [{ label: "Prompts", href: "/prompts?" }, { label: name }]
  const unknownKey = project !== null && projects.data !== undefined && !projects.data.projects.some((p) => p.key === project)
  const unknown = unknownKey || (file.isError && UNKNOWN_FILE.includes(file.error.message))
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
  if (projects.isError || file.isError || prompts.isError) {
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
  if (data === undefined || projects.data === undefined || prompts.data === undefined) {
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

  return (
    <>
      <TopBar items={crumbs} actions={<PanelToggle x="details" open={open} onOpenChange={setOpen} />} />
      <PageBody>
        <RecordBody name="Details" open={open} onOpenChange={setOpen} panel={<DetailsPanel file={data} row={shownRow} />}>
          <RecordTabs
            column={false}
            label="Prompt views"
            value={preview ? "preview" : "prompt"}
            tabs={[
              { value: "prompt", label: "Prompt", href: `${base}?` },
              { value: "preview", label: "Preview", href: `${base}/preview?` },
            ]}
            right={
              <>
                <span className="text-sm text-muted-foreground">{appliesTo(project, label)}</span>
                <ErrorsBadge errors={data.errors.map((e) => e.text)} />
              </>
            }
          />
          <ErrorStrip lines={lines} />
          {preview ? (
            <div data-scroll-root className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
              <MarkdownView text={previewText(data.text, shownRow.header)} />
            </div>
          ) : (
            <div className="min-h-0 flex-1">
              <CodeView ref={code} text={data.text} language="prompt" name={`${name}.md`} errors={data.errors} />
            </div>
          )}
        </RecordBody>
      </PageBody>
    </>
  )
}
