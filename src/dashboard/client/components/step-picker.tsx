import { FileTextIcon, XIcon } from "lucide-react"
import { useState } from "react"

import { IconTile } from "@/components/reui/icon-tile"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import type { PromptRow } from "@/lib/files"
import { pickerGroups } from "@/lib/workflow-edit"
import { useLabel } from "@/shell/files"

/** One prompt of the picker: its icon, its name and its description on one line, the full description in `title`. */
function PromptItem({ group, prompt, onChoose }: { group: string; prompt: PromptRow; onChoose: (prompt: PromptRow) => void }) {
  const description = prompt.description ?? ""
  return (
    <CommandItem value={`${group}/${prompt.name}`} onSelect={() => onChoose(prompt)} className="gap-3">
      <IconTile variant="outline" size="xs">
        <FileTextIcon aria-hidden="true" />
      </IconTile>
      <span className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="shrink-0 font-medium">{prompt.name}</span>
        <span className="truncate text-muted-foreground" title={description}>
          {description}
        </span>
      </span>
    </CommandItem>
  )
}

/**
 * The step picker in the right panel: a search over the step prompts of the workflow's context, the project's own
 * under its label (a project's workflow only) then "All projects". Arrow keys move, Enter chooses, Escape closes.
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
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
        <h2 className="text-sm font-medium">{title}</h2>
        <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
          <XIcon aria-hidden="true" />
        </Button>
      </div>
      <Command
        shouldFilter={false}
        label={title}
        className="min-h-0 flex-1 rounded-none bg-transparent"
        onKeyDown={(e) => {
          if (e.key !== "Escape") return
          e.preventDefault()
          e.stopPropagation()
          onClose()
        }}
      >
        <CommandInput autoFocus placeholder="Search prompts" aria-label="Search prompts" value={q} onValueChange={setQ} />
        <CommandList className="max-h-none">
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
    </div>
  )
}
