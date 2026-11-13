import { BookOpenIcon, FileTextIcon, ListChecksIcon, RouteIcon, WorkflowIcon } from "lucide-react"
import { Link, useRoute } from "wouter"

import { IconTile } from "@/components/reui/icon-tile"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { changesPath } from "@/lib/projects"
import { useCurrentKey } from "@/shell/projects"
import { ThemeMenu } from "@/shell/theme"

const DOCS = "https://pixelfactoryio.github.io/theway/docs/cli/#dashboard"

/** The flat sidebar, an icon rail until expanded: the mark, the three sections, then Theme and Documentation. */
export function AppSidebar() {
  const current = useCurrentKey()
  const changes = current === null ? "/?" : changesPath(current)
  const [onChanges] = useRoute("/:key/changes/*?")
  const [onWorkflows] = useRoute("/workflows/*?")
  const [onPrompts] = useRoute("/prompts/*?")
  const rows = [
    { label: "Changes", href: changes, icon: <ListChecksIcon className="size-4" aria-hidden="true" />, active: onChanges },
    { label: "Workflows", href: "/workflows?", icon: <WorkflowIcon className="size-4" aria-hidden="true" />, active: onWorkflows },
    { label: "Prompts", href: "/prompts?", icon: <FileTextIcon className="size-4" aria-hidden="true" />, active: onPrompts },
  ]

  return (
    <Sidebar variant="sidebar" collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip="theway" render={<Link href={changes} />}>
              <IconTile variant="outline" size="sm">
                <RouteIcon className="size-4" aria-hidden="true" />
              </IconTile>
              <span className="truncate text-sm font-semibold group-data-[collapsible=icon]:sr-only">theway</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent role="navigation" aria-label="Sections">
        <SidebarGroup>
          <SidebarMenu>
            {rows.map((row) => (
              <SidebarMenuItem key={row.label}>
                <SidebarMenuButton
                  render={<Link href={row.href} />}
                  isActive={row.active}
                  aria-current={row.active ? "page" : undefined}
                  tooltip={row.label}
                >
                  {row.icon}
                  <span>{row.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <ThemeMenu />
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Documentation"
              render={<a href={DOCS} target="_blank" rel="noopener noreferrer" />}
            >
              <BookOpenIcon className="size-4" aria-hidden="true" />
              <span>Documentation</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
