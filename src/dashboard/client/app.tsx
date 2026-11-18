import { type CSSProperties, type ReactNode, useMemo, useState } from "react"
import { Redirect, Route, Router, Switch, useLocation, useSearch } from "wouter"

import { ShellDialogs } from "@/components/shell-dialogs"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useProjects } from "@/data/queries"
import { decoded, type Params, ROUTES, type RouteName, to } from "@/lib/routes"
import { ChangesRoute } from "@/pages/changes"
import { NowPage } from "@/pages/workspace/now"
import { ProjectsPage } from "@/pages/workspace/projects"
import { ScopePage } from "@/pages/workspace/scope"
import { PromptPage } from "@/pages/prompt"
import { PromptsPage } from "@/pages/prompts-list"
import { WorkflowPage } from "@/pages/workflow"
import { WorkflowsPage } from "@/pages/workflows-list"
import { AppSidebar } from "@/shell/app-sidebar"
import { ErrorBoundary, PageError, RootError } from "@/shell/error-boundary"
import { useGuardedLocation } from "@/shell/guard"
import { useScrollMemory } from "@/shell/scroll"
import { SearchDialog, SearchOpen } from "@/shell/search"
import { DialogOpen } from "@/shell/dialogs"
import { useGlobalKeys, type ShellDialog } from "@/shell/keys"
import { PanelArea, PanelProvider, usePanelState } from "@/shell/panel"
import { useRecordStart } from "@/shell/settings"
import { readStored, writeStored } from "@/shell/storage"

/** The `localStorage` key of the sidebar's state: `open` or `closed`; when absent, open from 1024px wide. */
const SIDEBAR_KEY = "theway-sidebar"

const readSidebar = (): boolean => {
  const stored = readStored(SIDEBAR_KEY)
  if (stored !== null) return stored !== "closed"
  return window.matchMedia("(min-width: 1024px)").matches
}

const writeSidebar = (open: boolean): void => writeStored(SIDEBAR_KEY, open ? "open" : "closed")

/** "Skip to content": the first focusable element, focusing `main#content` without touching the hash route. */
function SkipLink() {
  return (
    <a
      href="#content"
      onClick={(event) => {
        event.preventDefault()
        document.getElementById("content")?.focus()
      }}
      className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-60 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:ring-3 focus:ring-ring/50 focus:outline-none"
    >
      Skip to content
    </a>
  )
}

/** A project's or group's page; `?archive` shows its whole archive. */
function ScopeRoute({ id }: { id: string }) {
  const all = new URLSearchParams(useSearch()).has("archive")
  return <ScopePage key={id} id={id} all={all} />
}

/** What each route renders, from its decoded parameters. */
const RENDER: Record<RouteName, (params: Params) => ReactNode> = {
  now: () => <NowPage />,
  projects: () => <ProjectsPage />,
  group: ({ id = "" }) => <ScopeRoute id={`group:${id}`} />,
  changes: ({ key = "" }) => <ChangesRoute routeKey={key} />,
  workflows: () => <WorkflowsPage />,
  workflowGlobal: ({ name = "", tab }) => <WorkflowPage key={`/${name}`} project={null} name={name} tab={tab} />,
  workflowProject: ({ key = "", name = "", tab }) => (
    <WorkflowPage key={`${key}/${name}`} project={key} name={name} tab={tab} />
  ),
  prompts: () => <PromptsPage />,
  promptGlobal: ({ name = "", tab }) => <PromptPage key={`/${name}`} project={null} name={name} tab={tab} />,
  promptProject: ({ key = "", name = "", tab }) => (
    <PromptPage key={`${key}/${name}`} project={key} name={name} tab={tab} />
  ),
  project: ({ key = "" }) => <ScopeRoute id={`project:${key}`} />,
  fallback: () => <Redirect to={to.now()} replace />,
}

/** The routes of `ROUTES`, in its order. */
function Routes() {
  return (
    <Switch>
      {ROUTES.map((r) => (
        <Route key={r.name} path={r.pattern ?? undefined}>
          {(params) => RENDER[r.name](decoded(params))}
        </Route>
      ))}
    </Switch>
  )
}

/**
 * The shell: the sidebar, the page, and the panel's column at the right. It holds the search's open state for the
 * sidebar's Search entry and the Cmd/Ctrl+K shortcut.
 */
function Shell() {
  const [open, setOpen] = useState(readSidebar)
  const [searching, setSearching] = useState(false)
  const search = useMemo(() => ({ open: searching, setOpen: setSearching }), [searching])
  const [dialog, setDialog] = useState<ShellDialog>(null)
  const dialogs = useMemo(() => ({ dialog, open: setDialog }), [dialog])
  const [location] = useLocation()
  const panel = usePanelState()
  useScrollMemory()
  useGlobalKeys(dialogs)
  useRecordStart(useProjects().data?.start ?? null)

  return (
    <SidebarProvider
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        writeSidebar(next)
      }}
      style={{ "--sidebar-width": "17rem" } as CSSProperties}
      className="h-svh overflow-hidden"
    >
      <PanelProvider value={panel}>
        <SearchOpen.Provider value={search}>
          <DialogOpen.Provider value={dialogs}>
            <SkipLink />
            <AppSidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <SidebarInset id="content" tabIndex={-1} className="min-h-0 overflow-hidden bg-background outline-none">
                <ErrorBoundary
                  resetKey={location}
                  fallback={(error, reset) => <PageError error={error} reset={reset} />}
                >
                  <Routes />
                </ErrorBoundary>
              </SidebarInset>
            </div>
            <PanelArea />
            <SearchDialog />
            <ShellDialogs />
          </DialogOpen.Provider>
        </SearchOpen.Provider>
      </PanelProvider>
    </SidebarProvider>
  )
}

/** The dashboard: hash routes through the guarded location hook, the tooltip provider and the shell. */
export function App() {
  return (
    <Router hook={useGuardedLocation}>
      <TooltipProvider>
        <ErrorBoundary fallback={(error) => <RootError error={error} />}>
          <Shell />
        </ErrorBoundary>
      </TooltipProvider>
    </Router>
  )
}
