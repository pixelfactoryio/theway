import { CSPProvider } from "@base-ui/react/csp-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cn } from "cn";
import { FileText, House, List, Menu, Workflow } from "lucide-react";
import { type ComponentType, useState } from "react";
import { Link, Redirect, Route, Router, Switch, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DraftsProvider } from "@/files/drafts";
import { type FileRef, retryQuery, useFiles } from "@/lib/api";
import { ALL_PROJECTS } from "@/lib/changes";
import { projectNames } from "@/lib/labels";
import { ChangePage } from "@/pages/change";
import { History } from "@/files/History";
import { ChangesPage } from "@/pages/changes";
import { HomePage } from "@/pages/home";
import { PromptPage } from "@/pages/prompt";
import { PromptsPage } from "@/pages/prompts";
import { WorkflowPage } from "@/pages/workflow";
import { WorkflowsPage } from "@/pages/workflows";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: retryQuery } } });

type Area = "Home" | "Changes" | "Workflows" | "Prompts";

/** The sidebar's entries: each area, its route and its icon. */
const AREAS: { name: Area; href: string; icon: ComponentType<{ className?: string }> }[] = [
  { name: "Home", href: "/", icon: House },
  { name: "Changes", href: "/changes", icon: List },
  { name: "Workflows", href: "/workflows", icon: Workflow },
  { name: "Prompts", href: "/prompts", icon: FileText },
];

/** The area of a route: Changes for a change or an archived one, Workflows and Prompts for their pages, else Home. */
function areaOf(location: string): Area {
  if (location.startsWith("/changes") || location.startsWith("/archive")) return "Changes";
  if (location.startsWith("/workflows")) return "Workflows";
  if (location.startsWith("/prompts")) return "Prompts";
  return "Home";
}

/** The logo mark: three lines on a rounded primary square. */
function Logo() {
  return (
    <span className="inline-flex size-[26px] flex-none items-center justify-center rounded-[7px] bg-primary">
      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round">
        <path d="M2 3h8M2 6h5M2 9h8" />
      </svg>
    </span>
  );
}

/** The project switcher: All projects, then each project by its full label. */
function ProjectSwitcher({ project, onProject }: { project: string; onProject: (key: string) => void }) {
  const files = useFiles();
  const projects = files.data?.projects ?? [];
  const names = projectNames(projects.map((p) => p.label));
  // Each project by its short name, its full label as the title; "All projects" has none.
  const items = [
    { value: ALL_PROJECTS, label: "All projects", title: undefined },
    ...projects.map((p) => ({ value: p.key, label: names.get(p.label) ?? p.label, title: p.label })),
  ];
  return (
    <Select items={items} value={project} onValueChange={(v) => onProject(typeof v === "string" ? v : ALL_PROJECTS)}>
      <SelectTrigger
        aria-label="Project"
        title={items.find((i) => i.value === project)?.title}
        size="sm"
        className="h-auto max-w-full gap-1 border-0 p-0 text-[12px] text-muted-foreground hover:text-foreground">
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} align="start">
        {items.map((i) => (
          <SelectItem key={i.value} value={i.value} title={i.title}>
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** The sidebar's content: the logo, the word theway and the project switcher, then one link per area, the current one in the primary colour. */
function SidebarContent({ project, onProject, onPick }: { project: string; onProject: (key: string) => void; onPick?: () => void }) {
  const [location] = useLocation();
  const current = areaOf(location);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-2.5 px-2">
        <Logo />
        <div className="flex min-w-0 flex-col">
          <span className="leading-tight font-semibold">theway</span>
          <ProjectSwitcher project={project} onProject={onProject} />
        </div>
      </div>
      <nav aria-label="Main" className="flex flex-col gap-0.5">
        {AREAS.map(({ name, href, icon: Icon }) => (
          <Link
            key={name}
            href={href}
            onClick={onPick}
            aria-current={name === current ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2 py-1.5 font-medium hover:bg-accent pointer-coarse:py-2.5",
              name === current ? "text-primary" : "text-foreground/80",
            )}
          >
            <Icon className="size-4" />
            {name}
          </Link>
        ))}
      </nav>
    </div>
  );
}

/** Below `lg`: the top bar with the menu button and the current area's name; the button opens the sidebar's content in a sheet. */
function MobileBar({ project, onProject }: { project: string; onProject: (key: string) => void }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 flex h-(--topbar-h) items-center gap-2 border-b border-divider bg-card px-2 lg:hidden">
      <Button variant="ghost" size="icon-lg" aria-label="Menu" onClick={() => setOpen(true)}>
        <Menu />
      </Button>
      <span className="font-semibold">{areaOf(location)}</span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-0 left-0 block h-dvh max-w-[min(280px,calc(100%-3rem))] translate-x-0 translate-y-0 overflow-auto rounded-none p-4 pt-5 sm:max-w-[280px]">
          <DialogTitle className="sr-only">Menu</DialogTitle>
          <SidebarContent project={project} onProject={onProject} onPick={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </header>
  );
}

/** The first focusable element: a link to the page's `main`, shown while it has the focus. The route is in the hash, so it moves the focus itself. */
function SkipLink() {
  return (
    <a
      href="#content"
      className="sr-only rounded-md bg-card px-3 py-2 font-medium shadow focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:ring-2 focus:ring-ring"
      onClick={(e) => {
        e.preventDefault();
        document.getElementById("content")?.focus();
      }}
    >
      Skip to content
    </a>
  );
}

/** A workflow's file reference. */
const workflow = (scope: "global" | "project", key: string | null, name: string): FileRef => ({ scope, key, kind: "workflows", name });

/** A prompt's file reference. */
const prompt = (scope: "global" | "project", key: string | null, name: string): FileRef => ({ scope, key, kind: "prompts", name });

function Routes({ project, panelWidth, setPanelWidth }: { project: string; panelWidth: number; setPanelWidth: (width: number) => void }) {
  return (
    <Switch>
      <Route path="/">
        <HomePage project={project} />
      </Route>
      <Route path="/changes">
        <ChangesPage project={project} />
      </Route>
      <Route path="/changes/:key/:id">{(p) => <ChangePage key={`c/${p.key}/${p.id}`} projectKey={p.key} id={p.id} archived={false} />}</Route>
      <Route path="/archive/:key/:folder">{(p) => <ChangePage key={`a/${p.key}/${p.folder}`} projectKey={p.key} id={p.folder} archived={true} />}</Route>
      <Route path="/workflows">
        <WorkflowsPage project={project} />
      </Route>
      <Route path="/workflows/global/:name">
        {(p) => <WorkflowPage key={`g/${p.name}`} file={workflow("global", null, p.name)} view="diagram" panelWidth={panelWidth} setPanelWidth={setPanelWidth} />}
      </Route>
      <Route path="/workflows/global/:name/yaml">
        {(p) => <WorkflowPage key={`g/${p.name}`} file={workflow("global", null, p.name)} view="yaml" panelWidth={panelWidth} setPanelWidth={setPanelWidth} />}
      </Route>
      <Route path="/workflows/global/:name/history">{(p) => <History file={workflow("global", null, p.name)} id={null} />}</Route>
      <Route path="/workflows/global/:name/history/:id">{(p) => <History file={workflow("global", null, p.name)} id={p.id} />}</Route>
      <Route path="/workflows/projects/:key/:name">
        {(p) => <WorkflowPage key={`p/${p.key}/${p.name}`} file={workflow("project", p.key, p.name)} view="diagram" panelWidth={panelWidth} setPanelWidth={setPanelWidth} />}
      </Route>
      <Route path="/workflows/projects/:key/:name/yaml">
        {(p) => <WorkflowPage key={`p/${p.key}/${p.name}`} file={workflow("project", p.key, p.name)} view="yaml" panelWidth={panelWidth} setPanelWidth={setPanelWidth} />}
      </Route>
      <Route path="/workflows/projects/:key/:name/history">{(p) => <History file={workflow("project", p.key, p.name)} id={null} />}</Route>
      <Route path="/workflows/projects/:key/:name/history/:id">{(p) => <History file={workflow("project", p.key, p.name)} id={p.id} />}</Route>
      <Route path="/prompts">
        <PromptsPage project={project} />
      </Route>
      <Route path="/prompts/global/:name">{(p) => <PromptPage key={`g/${p.name}`} file={prompt("global", null, p.name)} />}</Route>
      <Route path="/prompts/global/:name/history">{(p) => <History file={prompt("global", null, p.name)} id={null} />}</Route>
      <Route path="/prompts/global/:name/history/:id">{(p) => <History file={prompt("global", null, p.name)} id={p.id} />}</Route>
      <Route path="/prompts/projects/:key/:name">{(p) => <PromptPage key={`p/${p.key}/${p.name}`} file={prompt("project", p.key, p.name)} />}</Route>
      <Route path="/prompts/projects/:key/:name/history">{(p) => <History file={prompt("project", p.key, p.name)} id={null} />}</Route>
      <Route path="/prompts/projects/:key/:name/history/:id">{(p) => <History file={prompt("project", p.key, p.name)} id={p.id} />}</Route>
      <Route>
        <Redirect to="/" replace />
      </Route>
    </Switch>
  );
}

export function App() {
  // The project switcher's choice, in memory: a reload returns to All projects.
  const [project, setProject] = useState(ALL_PROJECTS);
  // The width of the panel beside a workflow's diagram, in memory like the project: kept between workflows, lost on reload.
  const [panelWidth, setPanelWidth] = useState(360);
  return (
    <CSPProvider disableStyleElements>
      <QueryClientProvider client={queryClient}>
        <DraftsProvider>
          <Router hook={useHashLocation}>
            <div className="flex min-h-dvh">
              <SkipLink />
              <aside aria-label="Sidebar" className="sticky top-0 hidden h-dvh w-[220px] flex-none overflow-auto border-r border-divider px-3 py-5 lg:block">
                <SidebarContent project={project} onProject={setProject} />
              </aside>
              <div className="flex min-w-0 flex-1 flex-col">
                <MobileBar project={project} onProject={setProject} />
                <Routes project={project} panelWidth={panelWidth} setPanelWidth={setPanelWidth} />
              </div>
            </div>
          </Router>
        </DraftsProvider>
      </QueryClientProvider>
    </CSPProvider>
  );
}
