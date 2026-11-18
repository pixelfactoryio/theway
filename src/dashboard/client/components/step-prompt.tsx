import { useEffect } from "react"
import { Link } from "wouter"

import { DetailRow } from "@/components/doc-panel"
import { Dash, InputsList } from "@/components/file-page"
import { MarkdownView } from "@/components/markdown"
import { Button } from "@/components/ui/button"
import { describeUse, filePath, promptReading, type PromptRow, workflowCount } from "@/lib/files"
import { MAC } from "@/shell/platform"
import { useFile, useLabel } from "@/shell/files"
import { LoadError } from "@/shell/load-error"

/** Calls `save` on Cmd+S (Ctrl+S off macOS) anywhere on the page, the browser's own Save page prevented. */
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

/**
 * A step's prompt in the workflow panel, read-only: a row with its file name, how many workflows share it and Open
 * prompt (its own page, where it is edited); then, scrolling in the pane, its header as fields (description, model,
 * inputs) and its body rendered at the document scale.
 */
export function StepPrompt({ row }: { row: PromptRow }) {
  const file = useFile("prompts", row.project, row.name)
  const sharedBy = workflowCount(file.data?.usedBy ?? row.usedBy)
  const reading = file.data !== undefined ? promptReading(file.data.text, row) : null
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-4 text-xs text-muted-foreground">
        <span className="min-w-0 truncate font-mono">{row.name}.md</span>
        {sharedBy > 1 ? <span className="shrink-0">Shared by {sharedBy} workflows</span> : null}
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          className="ml-auto"
          render={<Link href={`${filePath("prompts", row.project, row.name)}?`} />}
        >
          Open prompt
        </Button>
      </div>
      {file.isError ? (
        <LoadError what="this prompt" error={file.error} retry={() => void file.refetch()} className="m-3 w-auto" />
      ) : reading !== null ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {reading.fields !== null ? (
            <dl aria-label="Prompt header" className="flex flex-col border-b py-2">
              <DetailRow label="Description">{reading.fields.description ?? <Dash />}</DetailRow>
              <DetailRow label="Model">{reading.fields.model ?? <Dash />}</DetailRow>
              <DetailRow label="Inputs">
                <InputsList inputs={reading.fields.inputs} />
              </DetailRow>
            </dl>
          ) : null}
          <div className="px-4 py-4">
            <MarkdownView text={reading.body} />
          </div>
        </div>
      ) : null}
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
