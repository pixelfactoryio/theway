import { type CSSProperties, useMemo, useState } from "react"
import { Redirect, Route, Router, Switch, useLocation, useSearch } from "wouter"

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ChangesRoute } from "@/pages/changes"
import { NowPage, ProjectsPage, ScopePage } from "@/pages/workspace"
import { PromptPage } from "@/pages/prompt"
import { PromptsPage } from "@/pages/prompts-list"
import { WorkflowPage } from "@/pages/workflow"
import { WorkflowsPage } from "@/pages/workflows-list"
import { AppSidebar } from "@/shell/app-sidebar"
import { ErrorBoundary, PageError, RootError } from "@/shell/error-boundary"
import { useGuardedLocation } from "@/shell/guard"
import { useScrollMemory } from "@/shell/scroll"
import { SearchDialog, SearchOpen } from "@/shell/search"
import { ShellDialogs, useGlobalKeys } from "@/shell/keys"
import { PanelArea, PanelProvider, usePanelState } from "@/shell/panel"
import { useProjects } from "@/shell/projects"
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

function Routes() {
  return (
    <Switch>
      <Route path="/">
        <NowPage />
      </Route>
      <Route path="/projects">
        <ProjectsPage />
      </Route>
      <Route<{ id: string }> path="/group/:id">{(params) => <ScopeRoute id={`group:${params.id}`} />}</Route>
      <Route<{ key: string }> path="/:key/changes/*?">{(params) => <ChangesRoute routeKey={params.key} />}</Route>
      <Route path="/workflows">
        <WorkflowsPage />
      </Route>
      <Route<{ name: string; tab?: string }> path="/workflows/global/:name/:tab?">
        {(params) => <WorkflowPage key={`/${params.name}`} project={null} name={params.name} tab={params.tab} />}
      </Route>
      <Route<{ key: string; name: string; tab?: string }> path="/workflows/projects/:key/:name/:tab?">
        {(params) => (
          <WorkflowPage key={`${params.key}/${params.name}`} project={params.key} name={params.name} tab={params.tab} />
        )}
      </Route>
      <Route path="/prompts">
        <PromptsPage />
      </Route>
      <Route<{ name: string; tab?: string }> path="/prompts/global/:name/:tab?">
        {(params) => <PromptPage key={`/${params.name}`} project={null} name={params.name} tab={params.tab} />}
      </Route>
      <Route<{ key: string; name: string; tab?: string }> path="/prompts/projects/:key/:name/:tab?">
        {(params) => (
          <PromptPage key={`${params.key}/${params.name}`} project={params.key} name={params.name} tab={params.tab} />
        )}
      </Route>
      <Route<{ key: string }> path="/:key">{(params) => <ScopeRoute id={`project:${params.key}`} />}</Route>
      <Route>
        <Redirect to="/?" replace />
      </Route>
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
  const [location] = useLocation()
  const panel = usePanelState()
  useScrollMemory()
  useGlobalKeys()
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
          <SkipLink />
          <AppSidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <SidebarInset id="content" tabIndex={-1} className="min-h-0 overflow-hidden bg-background outline-none">
              <ErrorBoundary resetKey={location} fallback={(error, reset) => <PageError error={error} reset={reset} />}>
                <Routes />
              </ErrorBoundary>
            </SidebarInset>
          </div>
          <PanelArea />
          <SearchDialog />
          <ShellDialogs />
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
