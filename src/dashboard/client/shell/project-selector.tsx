import { ChevronsUpDownIcon } from "lucide-react"
import { useState } from "react"
import { useLocation } from "wouter"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { byLabel, changesPath } from "@/lib/projects"
import { useCurrentKey, useProjects } from "@/shell/projects"

/**
 * The breadcrumb's project selector: the current project's label, opening a searchable list of every project by label
 * with its number of active changes. A skeleton while the projects load, nothing after a failure or with no project.
 */
export function ProjectSelector() {
  const projects = useProjects()
  const current = useCurrentKey()
  const [open, setOpen] = useState(false)
  const [, navigate] = useLocation()

  if (projects.isPending) return <Skeleton className="h-5 w-24" />
  const project = projects.data?.projects.find((p) => p.key === current)
  if (projects.data === undefined || project === undefined) return null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="-mx-2 max-w-64 gap-1 px-2 text-sm font-medium"
            aria-label={`Project: ${project.label}`}
            title={project.key}
          />
        }
      >
        <span className="truncate">{project.label}</span>
        <ChevronsUpDownIcon className="size-4 text-muted-foreground" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search projects" aria-label="Search projects" />
          <CommandList>
            <CommandEmpty>No project matches</CommandEmpty>
            <CommandGroup>
              {byLabel(projects.data.projects).map((p) => (
                <CommandItem
                  key={p.key}
                  value={p.key}
                  keywords={[p.label]}
                  title={p.key}
                  data-checked={p.key === project.key ? "true" : undefined}
                  onSelect={() => {
                    setOpen(false)
                    navigate(changesPath(p.key))
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">{p.label}</span>
                  <span className="text-muted-foreground tabular-nums">{p.active}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
