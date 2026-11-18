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
import { useChangeLists, useLabel, useProjects, usePrompts, useWorkflows } from "@/data/queries"
import { to } from "@/lib/routes"
import { searchGroups } from "@/lib/search"
import { useSidebar } from "@/components/ui/sidebar"
import { useDialog } from "@/shell/dialogs"
import { usePanelName, usePanelOpen } from "@/shell/panel"
import { MAC } from "@/shell/platform"
import { chooseTheme } from "@/shell/theme"

/** The search's open state, provided by the shell so the sidebar entry and the shortcut share it. */
export const SearchOpen = createContext<{ open: boolean; setOpen: Dispatch<SetStateAction<boolean>> }>({
  open: false,
  setOpen: () => {},
})

export const useSearchOpen = () => useContext(SearchOpen)

/** The groups and their entries; mounted only while the dialog is open, so its lists load when it opens. */
function Results({ close }: { close: () => void }) {
  const [, navigate] = useLocation()
  const projects = useProjects().data?.projects
  const keys = projects?.map((p) => p.key) ?? []
  const changes = [...useChangeLists(keys).lists].map(([key, list]) => ({ key, list }))
  const workflows = useWorkflows().data?.workflows
  const prompts = usePrompts().data?.prompts
  const label = useLabel()
  const groups = searchGroups({ changes, workflows, prompts, projects, label })
  const list = useRef<HTMLDivElement>(null)
  const sidebar = useSidebar()
  const [panelOpen, setPanelOpen] = usePanelOpen()
  const panel = usePanelName()
  const { open: openDialog } = useDialog()
  const actions: { value: string; label: string; detail: string; run: () => void }[] = [
    { value: "action:now", label: "Go to Now", detail: "G N", run: () => navigate(to.now()) },
    { value: "action:projects", label: "Go to All projects", detail: "G A", run: () => navigate(to.projects()) },
    { value: "action:sidebar", label: "Toggle sidebar", detail: MAC ? "⌘B" : "Ctrl+B", run: sidebar.toggleSidebar },
    ...(panel !== null
      ? [{ value: "action:panel", label: "Toggle panel", detail: panel, run: () => setPanelOpen(!panelOpen) }]
      : []),
    { value: "action:new-workflow", label: "New workflow", detail: "", run: () => openDialog("new-workflow") },
    { value: "action:new-prompt", label: "New prompt", detail: "", run: () => openDialog("new-prompt") },
    { value: "action:theme-dark", label: "Theme: Dark", detail: "", run: () => chooseTheme("dark") },
    { value: "action:theme-light", label: "Theme: Light", detail: "", run: () => chooseTheme("light") },
    { value: "action:theme-system", label: "Theme: System", detail: "", run: () => chooseTheme("system") },
    { value: "action:shortcuts", label: "Keyboard shortcuts", detail: "?", run: () => openDialog("shortcuts") },
  ]

  return (
    // Without vim bindings: cmdk's Ctrl+K (previous entry) would prevent the default, and Ctrl+K could not close it.
    <Command vimBindings={false}>
      {/*
        Each keystroke selects the first match, but cmdk can leave the list scrolled to an earlier keystroke's match, the
        first one above the view: back to the top once cmdk has sorted and selected.
      */}
      <CommandInput
        placeholder="Go to a change, workflow, prompt or project, or run an action"
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
                {entry.detail !== "" ? (
                  <span className="min-w-0 truncate text-muted-foreground">{entry.detail}</span>
                ) : null}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        <CommandGroup heading="Actions">
          {actions.map((a) => (
            <CommandItem
              key={a.value}
              value={a.value}
              keywords={[a.label]}
              onSelect={() => {
                close()
                a.run()
              }}
            >
              <span className="truncate">{a.label}</span>
              {a.detail !== "" ? <span className="ml-auto text-xs text-muted-foreground">{a.detail}</span> : null}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  )
}

/**
 * The ⌘K search: jumps to a change of any project (active or archived), a workflow, a prompt or a project. Cmd+K (Ctrl+K off macOS)
 * toggles it anywhere an editor has not taken the key (the Markdown editor's Mod-k inserts a link and stops there).
 */
export function SearchDialog() {
  const { open, setOpen } = useSearchOpen()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      // ⌘K, or ⌘P, which also works inside the editors where ⌘K inserts a link.
      const palette = key === "p" || (key === "k" && !event.defaultPrevented)
      if (!palette || !(MAC ? event.metaKey : event.ctrlKey) || event.shiftKey || event.altKey) return
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
