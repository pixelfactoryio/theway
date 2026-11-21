import { XIcon } from "lucide-react"
import { useState } from "react"

import { PropertyCard } from "@/components/property-card"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { useLabel } from "@/data/queries"
import type { PromptRow } from "@/lib/files"
import { pickerGroups } from "@/lib/step-prompts"

/**
 * One prompt of the picker, as a list's row: what it does first, in the ink, then its name in Geist Mono in the
 * secondary ink (its name alone, in the ink, when it has no description); the full description in `title`.
 */
function PromptItem({
  group,
  prompt,
  onChoose,
}: {
  group: string
  prompt: PromptRow
  onChoose: (prompt: PromptRow) => void
}) {
  const description = prompt.description ?? ""
  return (
    <CommandItem
      value={`${group}/${prompt.name}`}
      onSelect={() => onChoose(prompt)}
      title={description === "" ? undefined : description}
      className="h-8 gap-2 rounded-md px-2"
    >
      {description !== "" ? (
        <>
          <span className="min-w-0 flex-1 truncate">{description}</span>
          <code className="max-w-2/5 shrink-0 truncate font-mono text-xs text-muted-foreground">{prompt.name}</code>
        </>
      ) : (
        <code className="min-w-0 truncate font-mono text-xs">{prompt.name}</code>
      )}
    </CommandItem>
  )
}

/**
 * The step picker in the right column, as a card (`title` and Close in its header): a search over the step prompts of
 * the workflow's context, the project's own under its label (a project's workflow only) then "All projects". Arrow
 * keys move, Enter chooses, Escape closes.
 */
export function StepPicker({
  title,
  prompts,
  project,
  onChoose,
  onClose,
}: {
  title: string
  prompts: readonly PromptRow[]
  project: string | null
  onChoose: (prompt: PromptRow) => void
  onClose: () => void
}) {
  const label = useLabel()
  const [q, setQ] = useState("")
  const groups = pickerGroups(prompts, project, q)
  return (
    <PropertyCard
      title={title}
      action={
        <Button variant="ghost" size="icon-xs" aria-label="Close" className="text-muted-foreground" onClick={onClose}>
          <XIcon aria-hidden="true" />
        </Button>
      }
    >
      <Command
        shouldFilter={false}
        label={title}
        className="rounded-none rounded-b-lg border-t border-rule bg-transparent p-0"
        onKeyDown={(e) => {
          if (e.key !== "Escape") return
          e.preventDefault()
          e.stopPropagation()
          onClose()
        }}
      >
        <CommandInput
          autoFocus
          placeholder="Search prompts"
          aria-label="Search prompts"
          value={q}
          onValueChange={setQ}
        />
        <CommandList className="max-h-none px-1 pb-1">
          <CommandEmpty>No prompt matches</CommandEmpty>
          {project !== null && groups.own.length > 0 ? (
            <CommandGroup heading={label(project)}>
              {groups.own.map((p) => (
                <PromptItem key={p.name} group="own" prompt={p} onChoose={onChoose} />
              ))}
            </CommandGroup>
          ) : null}
          {groups.global.length > 0 ? (
            <CommandGroup heading="All projects">
              {groups.global.map((p) => (
                <PromptItem key={p.name} group="global" prompt={p} onChoose={onChoose} />
              ))}
            </CommandGroup>
          ) : null}
        </CommandList>
      </Command>
    </PropertyCard>
  )
}
