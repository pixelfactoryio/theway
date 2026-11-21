import { cn } from "cn"
import {
  ChevronDownIcon,
  ChevronRightIcon,
  Clock3Icon,
  CircleHelpIcon,
  FileTextIcon,
  LayoutGridIcon,
  type LucideIcon,
  SearchIcon,
  SquarePenIcon,
  WorkflowIcon,
} from "lucide-react"
import type { ReactNode } from "react"
import { Link, useLocation } from "wouter"

import { Logo } from "@/shell/logo"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
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
  useSidebar,
} from "@/components/ui/sidebar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { version } from "@/data/api"
import { useChangeLists, useLabel, useProjects, usePrompts, useSettings, useWorkflows } from "@/data/queries"
import type { ChangeList } from "@/lib/changes"
import { GROUP_OPEN } from "@/lib/preferences"
import { isAt, routeKeyOf, routeOf, to } from "@/lib/routes"
import { countOf, type Entry, inProgressCount, pinnedEntries, recentEntries, toDo } from "@/lib/workspace"
import { CutName } from "@/shell/cut-name"
import { useDialog } from "@/shell/dialogs"
import { MOD } from "@/shell/platform"
import { ProjectMark } from "@/shell/project-mark"
import { useSearchOpen } from "@/shell/search"
import { useStored } from "@/shell/storage"
import { Shortcut } from "@/shell/shortcut"
import { SettingsMenu } from "@/shell/theme"

const DOCS = "https://pixelfactoryio.github.io/theway/docs/cli/#dashboard"

/**
 * A sidebar row: 28px, the sidebar's ink (a step under the content's), `text-sm` (15px) at 400 whether chosen or not; the chosen
 * one on the blue tint in the ink, its icon blue.
 */
const ROW =
  "h-7 gap-2 px-2 font-normal text-sidebar-foreground hover:bg-sidebar-accent data-active:bg-selected data-active:font-medium data-active:text-foreground"

/** A row's count: `text-xs` (14px), the secondary ink, tabular, ending on the row's right edge. */
const COUNT = "ml-auto shrink-0 text-xs text-muted-foreground tabular-nums group-data-[collapsible=icon]:hidden"

/** A row's 16px icon in the secondary ink, blue on the chosen row. */
function RowIcon({ Icon }: { Icon: LucideIcon }) {
  return (
    <Icon
      aria-hidden="true"
      className="size-4 shrink-0 text-muted-foreground group-data-active/menu-button:text-sidebar-primary"
    />
  )
}

/** A sidebar row that opens a page: its icon, its label, and its value at the right. */
function Row({
  href,
  active,
  Icon,
  label,
  value,
  title,
}: {
  href: string
  active: boolean
  Icon: LucideIcon
  label: string
  value: ReactNode
  title?: string
}) {
  return (
    <SidebarMenuItem data-nav-item="">
      <SidebarMenuButton
        render={<Link href={href} />}
        isActive={active}
        aria-current={active ? "page" : undefined}
        tooltip={label}
        title={title}
        className={ROW}
      >
        <RowIcon Icon={Icon} />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className={COUNT}>{value}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

/** Whether the address shows `href` (its search part ignored), or one of its sub-views. */
function useShows(): (href: string) => boolean {
  const [location] = useLocation()
  return (href) => isAt(location, href)
}

/**
 * The workspace row: theway's mark and name, then Search and New (New workflow, New prompt), the two ways in that
 * stand on every page. In the icon rail, the mark alone.
 */
function Workspace() {
  const { setOpen } = useSearchOpen()
  const { open: openDialog } = useDialog()
  return (
    <div className="flex h-9 items-center gap-1 pr-0.5 pl-2 group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
      <Logo className="min-w-0 flex-1 group-data-[collapsible=icon]:flex-none" />
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Search"
              className="text-muted-foreground group-data-[collapsible=icon]:hidden"
              onClick={() => setOpen(true)}
            />
          }
        >
          <SearchIcon aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent>
          Search <Shortcut keys={[MOD, "K"]} />
        </TooltipContent>
      </Tooltip>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger
            render={
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="New"
                    className="text-muted-foreground group-data-[collapsible=icon]:hidden"
                  />
                }
              />
            }
          >
            <SquarePenIcon aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent>New</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => openDialog("new-workflow")}>
            <WorkflowIcon aria-hidden="true" />
            New workflow
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openDialog("new-prompt")}>
            <FileTextIcon aria-hidden="true" />
            New prompt
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/** Now and Search: Now counts the changes in progress across every project. */
function Entries({ inProgress }: { inProgress: number | null }) {
  const { setOpen } = useSearchOpen()
  const [location] = useLocation()
  const active = routeOf(location).name === "now"
  return (
    <SidebarMenu className="gap-px">
      <SidebarMenuItem data-nav-item="">
        <SidebarMenuButton
          render={<Link href={to.now()} />}
          isActive={active}
          aria-current={active ? "page" : undefined}
          tooltip="Now"
          className={ROW}
        >
          <RowIcon Icon={Clock3Icon} />
          <span>Now</span>
          <span className={COUNT}>{inProgress ?? ""}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
      <SidebarMenuItem>
        <SidebarMenuButton onClick={() => setOpen(true)} tooltip="Search" className={ROW}>
          <RowIcon Icon={SearchIcon} />
          <span>Search</span>
          <Shortcut keys={[MOD, "K"]} className="ml-auto group-data-[collapsible=icon]:hidden" />
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

/**
 * A section of the sidebar: its label with a small caret that folds it, kept per browser under `id`. In the icon rail
 * a section is always open: its label is hidden there.
 */
function Section({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  const [chosen, setChosen] = useStored(`theway-sidebar-section:${id}`, GROUP_OPEN)
  const { state, isMobile } = useSidebar()
  const rail = state === "collapsed" && !isMobile
  const open = rail || chosen !== false
  return (
    <Collapsible open={open} onOpenChange={(next) => setChosen(next)} render={<SidebarGroup className="px-2 py-0" />}>
      <SidebarGroupLabel
        render={<CollapsibleTrigger />}
        className="mt-3 h-7 w-fit gap-1 px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        {label}
        <ChevronDownIcon aria-hidden="true" className={cn("size-3! transition-transform", !open && "-rotate-90")} />
      </SidebarGroupLabel>
      {/* In the icon rail, where the label is hidden, a hairline parts the section from the one above. */}
      <span aria-hidden="true" className="mx-2 my-2 hidden h-px bg-border group-data-[collapsible=icon]:block" />
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  )
}

/**
 * A project or group row: its icon, its label (a group's project count after it) and its count to do. A group's row
 * keeps a 20px slot for its chevron, left of the count.
 */
function EntryRow({ entry, open, active }: { entry: Entry; open: number | null; active: boolean }) {
  return (
    <SidebarMenuButton
      render={<Link href={entry.href} />}
      isActive={active}
      aria-current={active ? "page" : undefined}
      tooltip={entry.label}
      // Under the shipped variant, which clears a chevron at the row's right edge: here it stands left of the count.
      className={cn(ROW, "group-has-data-[sidebar=menu-action]/menu-item:pr-2")}
      title={entry.label}
    >
      <ProjectMark label={entry.label} group={entry.kind === "group"} className="size-4" />
      <CutName name={entry.label} />
      {entry.kind === "group" ? (
        <span className="shrink-0 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
          {countOf(entry.keys.length, "project")}
        </span>
      ) : null}
      {entry.kind === "group" ? <span aria-hidden="true" className="ml-auto w-5 shrink-0" /> : null}
      <span className={cn(COUNT, entry.kind === "group" && "ml-0 min-w-4 text-right")}>{open ?? ""}</span>
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
  const [chosen, setChosen] = useStored(groupKey(entry.id), GROUP_OPEN)
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
        // In the 20px slot left of the count: past the row's 8px padding and the count's 16px.
        className="top-1 right-6 text-muted-foreground"
        onClick={() => {
          setChosen(!expanded)
        }}
      >
        <ChevronRightIcon className={cn("transition-transform", expanded && "rotate-90")} aria-hidden="true" />
      </SidebarMenuAction>
      {expanded ? (
        <SidebarMenuSub className="mr-0 gap-px pr-0">
          {entry.keys.map((k) => (
            <SidebarMenuSubItem key={k} data-nav-item="">
              <SidebarMenuSubButton
                render={<Link href={to.project(k)} />}
                isActive={k === activeKey}
                title={label(k)}
                className="text-sidebar-foreground hover:bg-sidebar-accent data-active:bg-selected data-active:text-foreground"
              >
                <CutName name={label(k)} className="flex-1" />
                <span className={COUNT}>{open([k]) ?? ""}</span>
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
  // Until the projects are known, no pinned or recent entry: a group would count none of its projects.
  const pinned = projects.data !== undefined ? pinnedEntries(list, settings) : []
  const recent = projects.data !== undefined ? recentEntries(list, settings) : []
  const label = useLabel()
  // The repo the page shows: its own page, or one of its changes.
  const routeKey = routeKeyOf(location)
  const activeKey = list.some((p) => p.key === routeKey) ? routeKey : null
  const active = (e: Entry) => shows(e.href)
  return (
    <>
      {pinned.length > 0 ? (
        <Section id="pinned" label="Pinned">
          <SidebarMenu className="gap-px">
            {pinned.map((e) => (
              <Place key={e.id} entry={e} lists={lists} label={label} active={active(e)} activeKey={activeKey} />
            ))}
          </SidebarMenu>
        </Section>
      ) : null}
      {recent.length > 0 ? (
        <Section id="recent" label="Recent">
          <SidebarMenu className="gap-px">
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
        </Section>
      ) : null}
      <SidebarGroup className="px-2 pt-1 pb-0">
        <SidebarMenu className="gap-px">
          <Row
            href={to.projects()}
            active={routeOf(location).name === "projects"}
            Icon={LayoutGridIcon}
            label="All projects"
            value={projects.data?.projects.length ?? ""}
          />
        </SidebarMenu>
      </SidebarGroup>
    </>
  )
}

/** The home's workflows and prompts, each with its count; a red dot before the count when a file has errors. */
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
    <Section id="library" label="Library">
      <SidebarMenu className="gap-px">
        {rows.map((row) => {
          const broken = row.list?.filter((f) => f.errors.length > 0).length ?? 0
          return (
            <Row
              key={row.label}
              href={row.href}
              active={row.active}
              Icon={row.Icon}
              label={row.label}
              value={
                <span className="inline-flex items-center gap-2">
                  {broken > 0 ? (
                    <span
                      role="img"
                      aria-label={`${broken} with errors`}
                      className="size-1.5 rounded-full bg-destructive"
                    />
                  ) : null}
                  {row.list?.length ?? ""}
                </span>
              }
              title={broken > 0 ? `${row.label}: ${broken} with errors` : row.label}
            />
          )
        })}
      </SidebarMenu>
    </Section>
  )
}

/**
 * The sidebar, on the app's ground with no border: the workspace row (Search, New); Now and Search; the pinned and
 * recent projects and groups, then All projects; the Library; the version, Documentation, Settings and the button that
 * folds it. It never lists changes. Cmd/Ctrl+B or that button folds it to a rail of icons; below 768px it opens over
 * the page.
 */
export function AppSidebar() {
  const shown = version()
  const projects = useProjects().data?.projects
  const keys = projects?.map((p) => p.key) ?? []
  const { lists, complete } = useChangeLists(keys)
  // No count until the projects and every change list are known: an empty list of keys is complete at once.
  const inProgress =
    projects !== undefined && complete ? [...lists.values()].reduce((n, l) => n + inProgressCount(l), 0) : null
  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="gap-2 p-0">
        <Workspace />
        <Entries inProgress={inProgress} />
      </SidebarHeader>
      <SidebarContent role="navigation" aria-label="Projects and library" data-nav-list="" className="-mx-2 gap-0">
        <Places lists={lists} />
        <Library />
      </SidebarContent>
      <SidebarFooter className="flex-row items-center gap-1 p-0 pl-2 group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:pl-0">
        <span className="truncate text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
          {shown !== "" ? `theway ${shown}` : "theway"}
        </span>
        <span className="flex-1 group-data-[collapsible=icon]:hidden" />
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Documentation"
                className="text-muted-foreground"
                nativeButton={false}
                render={<a href={DOCS} target="_blank" rel="noopener noreferrer" />}
              />
            }
          >
            <CircleHelpIcon className="size-4" aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent>Documentation</TooltipContent>
        </Tooltip>
        <SettingsMenu />
        <Tooltip>
          <TooltipTrigger render={<SidebarTrigger className="text-muted-foreground" />} />
          <TooltipContent>
            Toggle sidebar <Shortcut keys={[MOD, "B"]} />
          </TooltipContent>
        </Tooltip>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
