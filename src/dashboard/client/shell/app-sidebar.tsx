import { cn } from "cn"
import {
  BookOpenIcon,
  FileTextIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  type LucideIcon,
  SearchIcon,
  WorkflowIcon,
} from "lucide-react"
import { Link, useRoute } from "wouter"

import { Kbd, KbdGroup } from "@/components/ui/kbd"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { changesPath, overviewPath } from "@/lib/projects"
import { version } from "@/shell/api"
import { usePrompts, useWorkflows } from "@/shell/files"
import { useCurrentKey, useProjects } from "@/shell/projects"
import { MAC, useSearchOpen } from "@/shell/search"
import { ThemeMenu } from "@/shell/theme"

const DOCS = "https://pixelfactoryio.github.io/theway/docs/cli/#dashboard"

/** One sidebar entry: its label, address, icon, whether it is the current page, and its count (none while unknown). */
type Row = { label: string; href: string; Icon: LucideIcon; active: boolean; count?: number }

/** A labelled group of entries, each with its count as a badge and the current one marked. */
function Group({ label, rows }: { label: string; rows: Row[] }) {
  return (
    <SidebarGroup>
      {/* Collapsed, the label slides up over the entry above it, invisible: it must not take that entry's pointer. */}
      <SidebarGroupLabel className="group-data-[collapsible=icon]:pointer-events-none">{label}</SidebarGroupLabel>
      <SidebarMenu>
        {rows.map((row) => (
          <SidebarMenuItem key={row.label}>
            <SidebarMenuButton
              render={<Link href={row.href} />}
              isActive={row.active}
              aria-current={row.active ? "page" : undefined}
              tooltip={row.label}
            >
              <row.Icon className={cn("size-4", row.active && "text-sidebar-primary")} aria-hidden="true" />
              <span>{row.label}</span>
            </SidebarMenuButton>
            {row.count !== undefined ? <SidebarMenuBadge className="tabular-nums">{row.count}</SidebarMenuBadge> : null}
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}

/** The Search entry: opens the ⌘K search, with its key hint while expanded (the tooltip names it when collapsed). */
function SearchEntry() {
  const { setOpen } = useSearchOpen()
  return (
    <SidebarGroup>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton tooltip="Search" onClick={() => setOpen(true)}>
            <SearchIcon className="size-4" aria-hidden="true" />
            <span>Search</span>
            {MAC ? (
              <Kbd className="ml-auto group-data-[collapsible=icon]:hidden">⌘K</Kbd>
            ) : (
              <KbdGroup className="ml-auto group-data-[collapsible=icon]:hidden">
                <Kbd>Ctrl</Kbd>
                <Kbd>K</Kbd>
              </KbdGroup>
            )}
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  )
}

/**
 * The sidebar below the site header, expanded until collapsed to icons: the Search entry, the Project group (Overview, Changes) when there
 * is a current project, the Library group (Workflows, Prompts), then Documentation, Theme and theway's version.
 */
export function AppSidebar() {
  const current = useCurrentKey()
  const projects = useProjects()
  const active = projects.data?.projects.find((p) => p.key === current)?.active
  const workflows = useWorkflows().data?.workflows.length
  const prompts = usePrompts().data?.prompts.length
  const [overview, route] = useRoute<{ key: string }>("/:key")
  const [onChanges] = useRoute("/:key/changes/*?")
  const [onWorkflows] = useRoute("/workflows/*?")
  const [onPrompts] = useRoute("/prompts/*?")
  const shown = version()

  return (
    <Sidebar variant="sidebar" collapsible="icon" className="top-(--header-height) h-[calc(100svh-var(--header-height))]!">
      <SidebarContent role="navigation" aria-label="Sections">
        <SearchEntry />
        {current !== null ? (
          <Group
            label="Project"
            rows={[
              {
                label: "Overview",
                href: overviewPath(current),
                Icon: LayoutDashboardIcon,
                active: overview && route.key === current,
              },
              { label: "Changes", href: changesPath(current), Icon: ListChecksIcon, active: onChanges, count: active },
            ]}
          />
        ) : null}
        <Group
          label="Library"
          rows={[
            { label: "Workflows", href: "/workflows?", Icon: WorkflowIcon, active: onWorkflows, count: workflows },
            { label: "Prompts", href: "/prompts?", Icon: FileTextIcon, active: onPrompts, count: prompts },
          ]}
        />
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Documentation"
              render={<a href={DOCS} target="_blank" rel="noopener noreferrer" />}
            >
              <BookOpenIcon className="size-4" aria-hidden="true" />
              <span>Documentation</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <ThemeMenu />
        </SidebarMenu>
        {shown !== "" ? (
          <p className="px-2 font-mono text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">theway {shown}</p>
        ) : null}
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
