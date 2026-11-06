import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useProjects } from "@/lib/api";

/** The project of the current route, else the initially selected one. */
function useSelected(initial: string | null): string | null {
  const [location] = useLocation();
  const m = /^\/p\/([^/]+)/.exec(location);
  return m === null ? initial : (m[1] as string);
}

/** The sidebar: the theway mark, every project with its active count, and the selected project's pages. */
export function AppSidebar() {
  const projects = useProjects();
  const selected = useSelected(projects.data?.initial ?? null);
  const [location] = useLocation();
  const current = projects.data?.projects.find((p) => p.key === selected);
  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 pt-1.5 pb-2 font-semibold">
          <span className="flex size-5 items-center justify-center rounded-[5px] bg-primary text-[11px] text-primary-foreground">tw</span>
          theway
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Projects</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {projects.data?.projects.map((p) => (
                <SidebarMenuItem key={p.key}>
                  <SidebarMenuButton isActive={p.key === selected} title={p.key} render={<Link href={`/p/${p.key}/changes`} />}>
                    <span className="truncate">{p.label}</span>
                  </SidebarMenuButton>
                  <SidebarMenuBadge>{p.active}</SidebarMenuBadge>
                </SidebarMenuItem>
              ))}
              {projects.data?.projects.length === 0 && <div className="px-2 py-1.5 text-muted-foreground">No projects yet</div>}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {current !== undefined && (
          <SidebarGroup>
            <SidebarGroupLabel title={current.key}>{current.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={location.startsWith(`/p/${current.key}/changes`) || location.startsWith(`/p/${current.key}/archive`)}
                    render={<Link href={`/p/${current.key}/changes`} />}
                  >
                    Changes
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive={location.startsWith(`/p/${current.key}/workflows`)} render={<Link href={`/p/${current.key}/workflows`} />}>
                    Workflows
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
