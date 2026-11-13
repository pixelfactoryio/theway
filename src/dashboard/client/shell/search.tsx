import { createContext, type Dispatch, type SetStateAction, useContext, useEffect, useRef } from "react"
import { useLocation } from "wouter"

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { searchGroups } from "@/lib/search"
import { useChanges } from "@/shell/changes"
import { useLabel, usePrompts, useWorkflows } from "@/shell/files"
import { useCurrentKey, useProjects } from "@/shell/projects"

/** Whether the platform is Apple's: ⌘ then, Ctrl elsewhere. */
export const MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent)

/** The search's open state, provided by the shell so the sidebar entry and the shortcut share it. */
export const SearchOpen = createContext<{ open: boolean; setOpen: Dispatch<SetStateAction<boolean>> }>({
  open: false,
  setOpen: () => {},
})

export const useSearchOpen = () => useContext(SearchOpen)

/** The groups and their entries; mounted only while the dialog is open, so its lists load when it opens. */
function Results({ close }: { close: () => void }) {
  const [, navigate] = useLocation()
  const key = useCurrentKey()
  const changes = useChanges(key).data
  const workflows = useWorkflows().data?.workflows
  const prompts = usePrompts().data?.prompts
  const projects = useProjects().data?.projects
  const label = useLabel()
  const groups = searchGroups({ key, changes, workflows, prompts, projects, label })
  const list = useRef<HTMLDivElement>(null)

  return (
    <Command>
      {/*
        Each keystroke selects the first match, but cmdk can leave the list scrolled to an earlier keystroke's match, the
        first one above the view: back to the top once cmdk has sorted and selected.
      */}
      <CommandInput
        placeholder="Search changes, workflows, prompts and projects"
        onValueChange={() => requestAnimationFrame(() => list.current?.scrollTo({ top: 0 }))}
      />
      <CommandList ref={list}>
        <CommandEmpty>No match</CommandEmpty>
        {groups.map((group) => (
          <CommandGroup key={group.heading} heading={group.heading}>
            {group.entries.map((entry) => (
              <CommandItem
                key={entry.value}
                value={entry.value}
                keywords={[entry.label, entry.detail]}
                onSelect={() => {
                  close()
                  navigate(entry.href)
                }}
              >
                {/* The label keeps its width up to 4/5 of the row; the detail takes what is left. */}
                <span className="max-w-4/5 shrink-0 truncate">{entry.label}</span>
                {entry.detail !== "" ? <span className="min-w-0 truncate text-muted-foreground">{entry.detail}</span> : null}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </Command>
  )
}

/**
 * The ⌘K search: jumps to a change of the current project, a workflow, a prompt or a project. Cmd+K (Ctrl+K off macOS)
 * toggles it anywhere an editor has not taken the key (the Markdown editor's Mod-k inserts a link and stops there).
 */
export function SearchDialog() {
  const { open, setOpen } = useSearchOpen()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || !(MAC ? event.metaKey : event.ctrlKey) || event.defaultPrevented) return
      event.preventDefault()
      setOpen((was) => !was)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [setOpen])

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Search"
      description="Jump to a change, workflow, prompt or project"
      className="sm:max-w-lg"
    >
      <Results close={() => setOpen(false)} />
    </CommandDialog>
  )
}
