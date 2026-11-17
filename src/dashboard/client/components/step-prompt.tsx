import { useEffect } from "react"
import { Link } from "wouter"

import { DraftDialogs, DraftStatus, useFileDraft } from "@/components/draft"
import { LiveMarkdown } from "@/components/live-markdown"
import { describeUse, filePath, type PromptRow, workflowCount } from "@/lib/files"
import { MAC } from "@/shell/platform"
import { useFile, useLabel } from "@/shell/files"
import { LoadError } from "@/shell/load-error"

/**
 * Calls `save` on Cmd+S (Ctrl+S off macOS) anywhere on the page, the browser's own Save page prevented. Several pages
 * parts may listen: each saves its own draft.
 */
export function useSaveKey(save: () => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "s" || !(MAC ? event.metaKey : event.ctrlKey) || event.altKey) return
      event.preventDefault()
      save()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [save])
}

/** The prompt a step's `uses: prompts/<name>.md` resolves to: the project's own, else the global one. */
export const stepPromptRow = (prompts: readonly PromptRow[], project: string | null, name: string): PromptRow | null =>
  (project !== null ? prompts.find((p) => p.name === name && p.project === project) : undefined) ??
  prompts.find((p) => p.name === name && p.project === null) ??
  null

/**
 * A step's prompt in the workflow panel, editable with live preview: its own draft, saved by Cmd/Ctrl+S with the
 * workflow, and its save state; a prompt other workflows use says so.
 */
export function StepPrompt({ row }: { row: PromptRow }) {
  const file = useFile("prompts", row.project, row.name)
  const draft = useFileDraft({
    kind: "prompts",
    project: row.project,
    name: row.name,
    file: file.data,
    fetching: file.isFetching,
    language: "prompt",
    docName: `${row.name}.md`,
  })
  useSaveKey(() => {
    if (draft.dirty) void draft.save(false)
  })
  const sharedBy = workflowCount(file.data?.usedBy ?? [])
  if (file.isError && draft.store === null)
    return <LoadError what="this prompt" error={file.error} retry={() => void file.refetch()} className="m-3 w-auto" />
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b px-4 text-xs text-muted-foreground">
        <Link
          href={`${filePath("prompts", row.project, row.name)}?`}
          className="font-mono text-foreground underline-offset-4 hover:underline"
        >
          {row.name}.md
        </Link>
        {sharedBy > 1 ? <span className="text-warning">Shared by {sharedBy} workflows</span> : null}
        <span className="ml-auto">
          <DraftStatus dirty={draft.dirty} saved={draft.saved} />
        </span>
      </div>
      {draft.saveFailure !== null ? (
        <p role="alert" className="border-b px-4 py-2 text-xs text-destructive">
          Could not save: {draft.saveFailure}
        </p>
      ) : null}
      {draft.store !== null ? (
        <LiveMarkdown
          key={`${row.project ?? "global"}/${row.name}`}
          store={draft.store}
          name={`${row.name}.md`}
          className="min-h-0 flex-1 [&_.cm-content]:px-4! [&_.cm-content]:py-3!"
        />
      ) : null}
      <DraftDialogs draft={draft} />
    </div>
  )
}

/** The workflows that use a step's prompt, each linking to it. */
export function StepPromptUses({ row }: { row: PromptRow }) {
  const file = useFile("prompts", row.project, row.name)
  const label = useLabel()
  const usedBy = file.data?.usedBy ?? []
  if (usedBy.length === 0)
    return <p className="px-4 py-3 text-sm text-muted-foreground">No workflow uses this prompt.</p>
  return (
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
  )
}
