import { cn } from "cn"
import {
  ChevronRightIcon,
  Clock3Icon,
  CircleHelpIcon,
  FileTextIcon,
  LayoutGridIcon,
  SearchIcon,
  WorkflowIcon,
} from "lucide-react"
import { type ReactNode, useState } from "react"
import { Link, useLocation } from "wouter"

import { Logo } from "@/components/logo"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { version } from "@/data/api"
import { useChangeLists, useLabel, useProjects, usePrompts, useSettings, useWorkflows } from "@/data/queries"
import type { ChangeList } from "@/lib/changes"
import { isAt, routeKeyOf, routeOf, to } from "@/lib/routes"
import { countOf, type Entry, inProgressCount, pinnedEntries, recentEntries, toDo } from "@/lib/workspace"
import { LoadError } from "@/shell/load-error"
import { MAC } from "@/shell/platform"
import { useSearchOpen } from "@/shell/search"
import { readStored, writeStored } from "@/shell/storage"
import { SettingsMenu } from "@/shell/theme"

const DOCS = "https://pixelfactoryio.github.io/theway/docs/cli/#dashboard"

const ROW =
  "relative h-8 pl-3 before:absolute before:top-2 before:bottom-2 before:left-1 before:w-0.5 before:rounded-full"

/** A sidebar row: a 2px state bar at its left, its label, and its value at the right. */
function Row({
  href,
  active,
  bar,
  label,
  value,
  title,
}: {
  href: string
  active: boolean
  bar: string
  label: ReactNode
  value: ReactNode
  title?: string
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<Link href={href} data-nav-item="" />}
        isActive={active}
        aria-current={active ? "page" : undefined}
        title={title}
        className={cn(ROW, bar)}
      >
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums group-data-[collapsible=icon]:hidden">
          {value}
        </span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

/** Whether the address shows `href` (its search part ignored), or one of its sub-views. */
function useShows(): (href: string) => boolean {
  const [location] = useLocation()
  return (href) => isAt(location, href)
}

/** Now and Search: Now counts the changes in progress across every project. */
function Entries({ inProgress }: { inProgress: number | null }) {
  const { setOpen } = useSearchOpen()
  const [location] = useLocation()
  return (
    <SidebarMenu className="gap-0.5">
      <SidebarMenuItem>
        <SidebarMenuButton
          render={<Link href={to.now()} />}
          isActive={routeOf(location).name === "now"}
          className="h-8"
        >
          <Clock3Icon aria-hidden="true" className="text-muted-foreground" />
          <span>Now</span>
          <span className="ml-auto font-mono text-xs text-muted-foreground tabular-nums">{inProgress ?? ""}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
      <SidebarMenuItem>
        <SidebarMenuButton onClick={() => setOpen(true)} className="h-8">
          <SearchIcon aria-hidden="true" className="text-muted-foreground" />
          <span>Search</span>
          {MAC ? (
            <Kbd className="ml-auto">⌘K</Kbd>
          ) : (
            <KbdGroup className="ml-auto">
              <Kbd>Ctrl</Kbd>
              <Kbd>K</Kbd>
            </KbdGroup>
          )}
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

/** A project or group row: its initial tile, its label (a group's project count after it) and its count to do. */
function EntryRow({ entry, open, active }: { entry: Entry; open: number | null; active: boolean }) {
  return (
    <SidebarMenuButton render={<Link href={entry.href} />} isActive={active} className="h-8" title={entry.label}>
      <span
        aria-hidden="true"
        className="flex size-5 shrink-0 items-center justify-center rounded-sm bg-sidebar-accent text-xs font-semibold uppercase"
      >
        {entry.label.slice(0, 1)}
      </span>
      <span className="truncate">{entry.label}</span>
      {entry.kind === "group" ? (
        <span className="shrink-0 text-xs text-muted-foreground">{countOf(entry.keys.length, "project")}</span>
      ) : null}
      <span
        className={cn("ml-auto font-mono text-xs text-muted-foreground tabular-nums", entry.kind === "group" && "mr-6")}
      >
        {open ?? ""}
      </span>
    </SidebarMenuButton>
  )
}

/** The `localStorage` key of a group's open state in the sidebar: `open` or `closed`. */
const groupKey = (id: string): string => `theway-sidebar-group:${id}`

/**
 * A pinned or recent entry; a group opens to list its projects, each its own page with its count to do. A group opens
 * by itself while one of its projects is shown, and keeps the state chosen with its chevron in this browser.
 */
function Place({
  entry,
  lists,
  label,
  active,
  activeKey,
}: {
  entry: Entry
  lists: Map<string, ChangeList>
  label: (key: string) => string
  active: boolean
  /** The repo the page shows, `null` on no repo's page. */
  activeKey: string | null
}) {
  const open = (keys: readonly string[]): number | null =>
    keys.every((k) => lists.has(k)) ? keys.reduce((n, k) => n + toDo(lists.get(k)), 0) : null
  const inside = activeKey !== null && entry.keys.includes(activeKey)
  const [chosen, setChosen] = useState<boolean | null>(() => {
    const stored = readStored(groupKey(entry.id))
    return stored === null ? null : stored === "open"
  })
  const expanded = chosen ?? inside
  if (entry.kind !== "group") {
    return (
      <SidebarMenuItem data-nav-item="">
        <EntryRow entry={entry} open={open(entry.keys)} active={active || inside} />
      </SidebarMenuItem>
    )
  }
  return (
    <SidebarMenuItem data-nav-item="">
      <EntryRow entry={entry} open={open(entry.keys)} active={active} />
      <SidebarMenuAction
        aria-label={expanded ? `Hide the projects of ${entry.label}` : `Show the projects of ${entry.label}`}
        aria-expanded={expanded}
        onClick={() => {
          setChosen(!expanded)
          writeStored(groupKey(entry.id), expanded ? "closed" : "open")
        }}
      >
        <ChevronRightIcon className={cn("transition-transform", expanded && "rotate-90")} aria-hidden="true" />
      </SidebarMenuAction>
      {expanded ? (
        <SidebarMenuSub className="mr-0 pr-0">
          {entry.keys.map((k) => (
            <SidebarMenuSubItem key={k} data-nav-item="">
              <SidebarMenuSubButton render={<Link href={to.project(k)} />} isActive={k === activeKey} title={label(k)}>
                <span className="min-w-0 flex-1 truncate">{label(k)}</span>
                <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                  {open([k]) ?? ""}
                </span>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      ) : null}
    </SidebarMenuItem>
  )
}

/** The pinned entries, then the recently opened ones not pinned, then All projects. */
function Places({ lists }: { lists: Map<string, ChangeList> }) {
  const projects = useProjects()
  const settings = useSettings()
  const shows = useShows()
  const [location] = useLocation()
  const list = projects.data?.projects ?? []
  const pinned = pinnedEntries(list, settings)
  const recent = recentEntries(list, settings)
  const label = useLabel()
  // The repo the page shows: its own page, or one of its changes.
  const routeKey = routeKeyOf(location)
  const activeKey = list.some((p) => p.key === routeKey) ? routeKey : null
  const active = (e: Entry) => shows(e.href)
  return (
    <>
      {pinned.length > 0 ? (
        <SidebarGroup className="py-1">
          <SidebarGroupLabel className="h-7 group-data-[collapsible=icon]:hidden">Pinned</SidebarGroupLabel>
          <SidebarMenu className="gap-0.5">
            {pinned.map((e) => (
              <Place key={e.id} entry={e} lists={lists} label={label} active={active(e)} activeKey={activeKey} />
            ))}
          </SidebarMenu>
        </SidebarGroup>
      ) : null}
      {recent.length > 0 ? (
        <SidebarGroup className="py-1">
          <SidebarGroupLabel className="h-7 group-data-[collapsible=icon]:hidden">Recent</SidebarGroupLabel>
          <SidebarMenu className="gap-0.5">
            {recent.map((e) => (
              <Place
                key={e.id}
                entry={e}
                lists={lists}
                label={label}
                active={active(e)}
                activeKey={pinned.some((p) => activeKey !== null && p.keys.includes(activeKey)) ? null : activeKey}
              />
            ))}
          </SidebarMenu>
        </SidebarGroup>
      ) : null}
      <SidebarGroup className="py-1">
        <SidebarMenu className="gap-0.5">
          <SidebarMenuItem data-nav-item="">
            <SidebarMenuButton
              render={<Link href={to.projects()} />}
              isActive={routeOf(location).name === "projects"}
              className="h-8"
            >
              <LayoutGridIcon aria-hidden="true" className="text-muted-foreground" />
              <span>All projects</span>
              <span className="ml-auto font-mono text-xs text-muted-foreground tabular-nums">
                {projects.data?.projects.length ?? ""}
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        {projects.isError ? (
          <LoadError
            what="the projects"
            error={projects.error}
            retry={() => void projects.refetch()}
            className="mx-2 mt-1 w-auto"
          />
        ) : null}
      </SidebarGroup>
    </>
  )
}

/** The home's workflows and prompts, each with its count; a red bar when a file has errors. */
function Library() {
  const workflows = useWorkflows().data?.workflows
  const prompts = usePrompts().data?.prompts
  const [location] = useLocation()
  const rows = [
    {
      label: "Workflows",
      href: to.workflows(),
      Icon: WorkflowIcon,
      list: workflows,
      active: routeOf(location).name === "workflows",
    },
    {
      label: "Prompts",
      href: to.prompts(),
      Icon: FileTextIcon,
      list: prompts,
      active: routeOf(location).name === "prompts",
    },
  ]
  return (
    <SidebarGroup className="py-1">
      <SidebarGroupLabel className="h-7 group-data-[collapsible=icon]:hidden">Library</SidebarGroupLabel>
      <SidebarMenu className="gap-0.5">
        {rows.map((row) => {
          const broken = row.list?.filter((f) => f.errors.length > 0).length ?? 0
          return (
            <Row
              key={row.label}
              href={row.href}
              active={row.active}
              bar={broken > 0 ? "before:bg-destructive" : "before:bg-transparent"}
              label={
                <span className="flex items-center gap-2">
                  <row.Icon aria-hidden="true" className="size-4 text-muted-foreground" />
                  {row.label}
                </span>
              }
              value={row.list?.length ?? ""}
              title={broken > 0 ? `${row.label}: ${broken} with errors` : row.label}
            />
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}

/**
 * The sidebar: theway's logo and the collapse button; Now and Search; the pinned and recent projects and groups, then All
 * projects; the Library; the version, Documentation and Settings. It never lists changes. Cmd/Ctrl+B or its button
 * hides it; below 768px it opens over the page.
 */
export function AppSidebar() {
  const shown = version()
  const keys = useProjects().data?.projects.map((p) => p.key) ?? []
  const { lists, complete } = useChangeLists(keys)
  const inProgress = complete ? [...lists.values()].reduce((n, l) => n + inProgressCount(l), 0) : null
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-1 p-2 pt-0">
        <div className="flex h-11 items-center justify-between pl-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:pl-0">
          <Logo className="group-data-[collapsible=icon]:hidden" />
          <SidebarTrigger className="size-7 text-muted-foreground" />
        </div>
        <Entries inProgress={inProgress} />
      </SidebarHeader>
      <SidebarContent role="navigation" aria-label="Projects and library" data-nav-list="" className="gap-0 pt-1">
        <Places lists={lists} />
        <Library />
      </SidebarContent>
      <SidebarFooter className="flex-row items-center gap-1 py-2 pr-2 pl-3 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:px-2">
        <span className="rounded-md border px-2 font-mono text-xs leading-5 text-muted-foreground group-data-[collapsible=icon]:hidden">
          {shown !== "" ? `theway ${shown}` : "theway"}
        </span>
        <span className="flex-1 group-data-[collapsible=icon]:hidden" />
        <Tooltip>
          <TooltipTrigger
            render={
              <a
                href={DOCS}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Documentation"
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              />
            }
          >
            <CircleHelpIcon className="size-4" aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent>Documentation</TooltipContent>
        </Tooltip>
        <SettingsMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
