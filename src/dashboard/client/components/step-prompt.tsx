import { LockIcon } from "lucide-react"
import { useEffect } from "react"
import { Link } from "wouter"

import { Dash } from "@/components/file-page"
import { MarkdownView } from "@/components/markdown-view"
import { UsedByCard } from "@/components/fact-cards"
import { PropertyCard, PropertyList, PropertyRow } from "@/components/property-card"
import { buttonVariants } from "@/components/ui/button"
import { useFile, useLabel } from "@/data/queries"
import { promptReading, type PromptRow, quoted } from "@/lib/files"
import { to } from "@/lib/routes"
import { modKey } from "@/shell/platform"
import { LoadError } from "@/shell/load-error"

/** Calls `save` on Cmd+S (Ctrl+S off macOS) anywhere on the page, the browser's own Save page prevented. */
export function useSaveKey(save: () => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "s" || !modKey(event) || event.altKey) return
      event.preventDefault()
      save()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [save])
}

/**
 * A prompt's body at the panel's reading scale: the document's styles at the interface's sizes, body `text-xs` (14/20),
 * h1 and h2 `text-sm` (15/22, the panel's card titles) and h3 `text-xs` at 600, inline code never under 12px, at most
 * 62 characters a line, on the card's 12px inset.
 */
const PANEL_PROSE =
  "[--read-width:62ch] [--text-doc:var(--text-xs)] [--text-doc--line-height:var(--text-xs--line-height)] [--text-doc-h1:var(--text-sm)] [--text-doc-h1--line-height:var(--text-sm--line-height)] [--text-doc-h2:var(--text-sm)] [--text-doc-h2--line-height:var(--text-sm--line-height)] [--text-doc-h3:var(--text-xs)] [--text-doc-h3--line-height:var(--text-xs--line-height)] [&_.cm-content]:px-3! [&_.cm-content]:py-3! [&_.cm-line]:mx-0!"

/** The inputs of a prompt's header: the name in mono, then `required`, its default or `optional`, its description. */
function PromptInputs({ inputs }: { inputs: NonNullable<ReturnType<typeof promptReading>["fields"]>["inputs"] }) {
  if (inputs.length === 0) return <Dash />
  return (
    <ul className="flex flex-col gap-2">
      {inputs.map((input) => (
        <li key={input.name} className="flex min-w-0 flex-col">
          <span className="flex flex-wrap items-center gap-x-2">
            <code className="font-mono text-xs">{input.name}</code>
            <span className="text-xs text-muted-foreground">
              {input.required ? "required" : input.default !== null ? `default ${quoted(input.default)}` : "optional"}
            </span>
          </span>
          {input.description !== "" ? <span className="text-muted-foreground">{input.description}</span> : null}
        </li>
      ))}
    </ul>
  )
}

/**
 * A step's prompt, read-only, as a card: `Read-only` and Open prompt (its own page, where it is edited) in its header;
 * its file, its header's description, model and inputs as rows; then its body rendered at the panel's reading scale.
 */
export function StepPrompt({ row }: { row: PromptRow }) {
  const file = useFile("prompts", row.project, row.name)
  const reading = file.data !== undefined ? promptReading(file.data.text, row) : null
  return (
    <PropertyCard
      title="Prompt"
      action={
        <>
          <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
            <LockIcon aria-hidden="true" className="size-3" />
            Read-only
          </span>
          <Link
            href={to.file("prompts", row.project, row.name)}
            className={buttonVariants({ variant: "outline", size: "xs" })}
          >
            Open prompt
          </Link>
        </>
      }
    >
      {file.isError ? (
        <div className="border-t border-rule p-3">
          <LoadError what="this prompt" error={file.error} retry={() => void file.refetch()} />
        </div>
      ) : reading !== null ? (
        <>
          <PropertyList>
            <PropertyRow label="File">
              <code className="font-mono text-xs">{row.name}.md</code>
            </PropertyRow>
            {reading.fields !== null ? (
              <>
                <PropertyRow label="Description">{reading.fields.description ?? <Dash />}</PropertyRow>
                <PropertyRow label="Model">{reading.fields.model ?? <Dash />}</PropertyRow>
                <PropertyRow label="Inputs">
                  <PromptInputs inputs={reading.fields.inputs} />
                </PropertyRow>
              </>
            ) : null}
          </PropertyList>
          {reading.body.trim() !== "" ? (
            <div className="border-t border-rule">
              <MarkdownView text={reading.body} name={`${row.name}.md`} inset="panel" className={PANEL_PROSE} />
            </div>
          ) : null}
        </>
      ) : null}
    </PropertyCard>
  )
}

/** The workflows that use a step's prompt, as the Used by card: `this workflow` marks the page's own. */
export function StepPromptUses({
  row,
  current,
}: {
  row: PromptRow
  current: { workflow: string; project: string | null }
}) {
  const file = useFile("prompts", row.project, row.name)
  const label = useLabel()
  return <UsedByCard uses={file.data?.usedBy ?? []} label={label} current={current} />
}
