import { Command as CommandPrimitive } from "cmdk"
import {
  FileTextIcon,
  FolderIcon,
  KeyboardIcon,
  type LucideIcon,
  MonitorIcon,
  MoonIcon,
  PanelLeftIcon,
  PanelRightIcon,
  SunIcon,
  WorkflowIcon,
} from "lucide-react"
import { type ReactNode, useEffect, useRef, useState } from "react"
import { useLocation } from "wouter"

import { EmptyNote } from "@/components/empty-note"
import { StatusMark } from "@/components/status"
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Kbd } from "@/components/ui/kbd"
import { useSidebar } from "@/components/ui/sidebar"
import { useChangeLists, useLabel, useProjects, usePrompts, useWorkflows } from "@/data/queries"
import { type SearchEntry, searchGroups } from "@/lib/search"
import { useDialog } from "@/shell/dialogs"
import { GO_TO } from "@/shell/keys"
import { usePanelName, usePanelOpen } from "@/shell/panel"
import { MOD, modKey } from "@/shell/platform"
import { useSearchOpen } from "@/shell/search"
import { Shortcut } from "@/shell/shortcut"
import { chooseTheme } from "@/shell/theme"

/**
 * A group of the palette: its heading in `text-xs` (14px) secondary ink on the rows' 12px inset. Its rows are the palette's rows
 * (`PaletteRow`).
 */
const GROUP =
  "p-0 pb-2 **:[[cmdk-group-heading]]:flex **:[[cmdk-group-heading]]:h-8 **:[[cmdk-group-heading]]:items-end **:[[cmdk-group-heading]]:px-3 **:[[cmdk-group-heading]]:pt-0 **:[[cmdk-group-heading]]:pb-2 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:font-normal"

/**
 * A row of the palette, the list row's anatomy: 36px, a 16px icon slot, the name first, what follows it (an ID in
 * mono), and the row's right (where it applies, a shortcut). The entry the arrows are on takes the hover fill, its icon
 * the ink; the shipped check mark (for checked entries, which this list has none of) is left out.
 */
function PaletteRow({
  value,
  keywords,
  onSelect,
  icon,
  children,
  after,
  right,
}: {
  value: string
  keywords: string[]
  onSelect: () => void
  icon: ReactNode
  children: ReactNode
  after?: ReactNode
  right?: ReactNode
}) {
  return (
    <CommandItem
      value={value}
      keywords={keywords}
      onSelect={onSelect}
      className="h-9 gap-3 rounded-md! px-3 py-0 text-sm text-foreground data-selected:bg-foreground/8 [&>svg:last-child]:hidden"
    >
      <span
        aria-hidden="true"
        className="flex size-4 shrink-0 items-center justify-center text-muted-foreground group-data-selected/command-item:text-foreground [&_svg:not([data-status])]:size-4"
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-2">
        {children}
        {after}
      </span>
      {right !== undefined ? <span className="flex shrink-0 items-center">{right}</span> : null}
    </CommandItem>
  )
}

/** An entry's icon: a change's status, a workflow's, a prompt's or a project's icon as the sidebar draws them. */
function EntryIcon({ entry }: { entry: SearchEntry }) {
  if (entry.status !== undefined) return <StatusMark status={entry.status} />
  const Icon = entry.kind === "workflow" ? WorkflowIcon : entry.kind === "prompt" ? FileTextIcon : FolderIcon
  return <Icon />
}

/** One action of the palette: its icon, its name, and its shortcut (or what it acts on) at the right. */
type Action = { value: string; label: string; icon: LucideIcon; keys?: string[]; detail?: string; run: () => void }

/** The groups and their entries; mounted only while the dialog is open, so its lists load when it opens. */
function Results({ close }: { close: () => void }) {
  const [, navigate] = useLocation()
  const [query, setQuery] = useState("")
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
  const actions: Action[] = [
    ...GO_TO.map((g) => ({
      value: `action:go-${g.key}`,
      label: `Go to ${g.label}`,
      icon: g.icon,
      keys: ["G", g.key.toUpperCase()],
      run: () => navigate(g.href()),
    })),
    {
      value: "action:sidebar",
      label: "Toggle sidebar",
      icon: PanelLeftIcon,
      keys: [MOD, "B"],
      run: sidebar.toggleSidebar,
    },
    ...(panel !== null
      ? [
          {
            value: "action:panel",
            label: "Toggle panel",
            icon: PanelRightIcon,
            detail: panel,
            run: () => setPanelOpen(!panelOpen),
          },
        ]
      : []),
    { value: "action:new-workflow", label: "New workflow", icon: WorkflowIcon, run: () => openDialog("new-workflow") },
    { value: "action:new-prompt", label: "New prompt", icon: FileTextIcon, run: () => openDialog("new-prompt") },
    { value: "action:theme-dark", label: "Theme: Dark", icon: MoonIcon, run: () => chooseTheme("dark") },
    { value: "action:theme-light", label: "Theme: Light", icon: SunIcon, run: () => chooseTheme("light") },
    { value: "action:theme-system", label: "Theme: System", icon: MonitorIcon, run: () => chooseTheme("system") },
    {
      value: "action:shortcuts",
      label: "Keyboard shortcuts",
      icon: KeyboardIcon,
      keys: ["?"],
      run: () => openDialog("shortcuts"),
    },
  ]

  return (
    // Without vim bindings: cmdk's Ctrl+K (previous entry) would prevent the default, and Ctrl+K could not close it.
    <Command vimBindings={false} className="rounded-none! bg-transparent p-0">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
        {/*
          Each keystroke selects the first match, but cmdk can leave the list scrolled to an earlier keystroke's match,
          the first one above the view: back to the top once cmdk has sorted and selected.
        */}
        <CommandPrimitive.Input
          value={query}
          onValueChange={(next) => {
            setQuery(next)
            requestAnimationFrame(() => list.current?.scrollTo({ top: 0 }))
          }}
          placeholder="Go to a change, workflow, prompt or project, or run an action"
          className="h-full min-w-0 flex-1 bg-transparent text-heading text-foreground outline-none"
        />
        <Kbd className="border bg-background font-normal">Esc</Kbd>
      </div>
      <CommandList ref={list} className="max-h-96 scroll-py-2 px-2 pt-1 pb-0">
        <CommandEmpty className="-mx-2 py-0 text-left text-sm">
          <EmptyNote>Nothing matches “{query.trim()}”</EmptyNote>
        </CommandEmpty>
        {groups.map((group) => (
          <CommandGroup key={group.heading} heading={group.heading} className={GROUP}>
            {group.entries.map((entry) => (
              <PaletteRow
                key={entry.value}
                value={entry.value}
                keywords={[entry.name, entry.id ?? "", entry.detail]}
                onSelect={() => {
                  close()
                  navigate(entry.href)
                }}
                icon={<EntryIcon entry={entry} />}
                after={
                  entry.id !== null ? (
                    // The ID takes the room the name leaves, up to its own width: it gives way first.
                    <span className="max-w-max min-w-0 grow basis-0 truncate font-mono text-xs text-muted-foreground">
                      {entry.id}
                    </span>
                  ) : undefined
                }
                right={
                  entry.detail !== "" ? (
                    <span className="max-w-48 truncate text-xs text-muted-foreground">{entry.detail}</span>
                  ) : undefined
                }
              >
                <span className={entry.mono ? "min-w-0 truncate font-mono text-xs" : "max-w-4/5 min-w-0 truncate"}>
                  {entry.name}
                </span>
              </PaletteRow>
            ))}
          </CommandGroup>
        ))}
        <CommandGroup heading="Actions" className={GROUP}>
          {actions.map((a) => (
            <PaletteRow
              key={a.value}
              value={a.value}
              keywords={[a.label]}
              onSelect={() => {
                close()
                a.run()
              }}
              icon={<a.icon />}
              right={
                a.keys !== undefined ? (
                  <Shortcut keys={a.keys} />
                ) : a.detail !== undefined ? (
                  <span className="text-xs text-muted-foreground">{a.detail}</span>
                ) : undefined
              }
            >
              <span className="min-w-0 truncate">{a.label}</span>
            </PaletteRow>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  )
}

/**
 * The ⌘K search, a command menu: jumps to a change of any project (active or archived), a workflow, a prompt or a
 * project, or runs an action. Cmd+K (Ctrl+K off macOS) toggles it anywhere an editor has not taken the key (the
 * Markdown editor's Mod-k inserts a link and stops there).
 */
export function SearchDialog() {
  const { open, setOpen } = useSearchOpen()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      // ⌘K, or ⌘P, which also works inside the editors where ⌘K inserts a link.
      const palette = key === "p" || (key === "k" && !event.defaultPrevented)
      if (!palette || !modKey(event) || event.shiftKey || event.altKey) return
      event.preventDefault()
      setOpen((was) => !was)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [setOpen])

  // The shipped command dialog puts its title outside the dialog's content, where it stays on the page as a heading
  // while the search is closed: the dialog is composed here, its title and description inside. It stands a fifth of
  // the window from the top, so a long list grows down, not both ways.
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="top-1/5 flex translate-y-0 flex-col gap-0 overflow-hidden rounded-xl! p-0 sm:max-w-2xl"
        showCloseButton={false}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Search</DialogTitle>
          <DialogDescription>Jump to a change, workflow, prompt or project</DialogDescription>
        </DialogHeader>
        <Results close={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}
