import { useMemo, useState } from "react"
import { Redirect, Route, Router, Switch } from "wouter"

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ChangesRoute, HomeRoute, OverviewRoute } from "@/pages/changes"
import { PromptPage } from "@/pages/prompt"
import { PromptsPage } from "@/pages/prompts-list"
import { WorkflowPage } from "@/pages/workflow"
import { WorkflowsPage } from "@/pages/workflows-list"
import { AppSidebar } from "@/shell/app-sidebar"
import { useGuardedLocation } from "@/shell/guard"
import { useScrollMemory } from "@/shell/scroll"
import { SearchDialog, SearchOpen } from "@/shell/search"
import { SiteHeader } from "@/shell/site-header"
import { TopBarSlot } from "@/shell/top-bar"

/** The `localStorage` key of the sidebar's state: `open` or `closed`; open (expanded) when absent. */
const SIDEBAR_KEY = "theway-sidebar"

function readSidebar(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) !== "closed"
  } catch {
    return true
  }
}

function writeSidebar(open: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_KEY, open ? "open" : "closed")
  } catch {
    // The state still applies to this page.
  }
}

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

function Routes() {
  return (
    <Switch>
      <Route path="/">
        <HomeRoute />
      </Route>
      <Route<{ key: string }> path="/:key/changes/*?">
        {(params) => <ChangesRoute routeKey={params.key} />}
      </Route>
      <Route path="/workflows">
        <WorkflowsPage />
      </Route>
      <Route<{ name: string; tab?: string }> path="/workflows/global/:name/:tab?">
        {(params) => <WorkflowPage key={`/${params.name}`} project={null} name={params.name} tab={params.tab} />}
      </Route>
      <Route<{ key: string; name: string; tab?: string }> path="/workflows/projects/:key/:name/:tab?">
        {(params) => <WorkflowPage key={`${params.key}/${params.name}`} project={params.key} name={params.name} tab={params.tab} />}
      </Route>
      <Route path="/prompts">
        <PromptsPage />
      </Route>
      <Route<{ name: string; tab?: string }> path="/prompts/global/:name/:tab?">
        {(params) => <PromptPage key={`/${params.name}`} project={null} name={params.name} tab={params.tab} />}
      </Route>
      <Route<{ key: string; name: string; tab?: string }> path="/prompts/projects/:key/:name/:tab?">
        {(params) => <PromptPage key={`${params.key}/${params.name}`} project={params.key} name={params.name} tab={params.tab} />}
      </Route>
      <Route<{ key: string }> path="/:key">
        {(params) => <OverviewRoute routeKey={params.key} />}
      </Route>
      <Route>
        <Redirect to="/?" replace />
      </Route>
    </Switch>
  )
}

/**
 * The shell: the full-width site header, then the sidebar beside the page; pages render their `TopBar` into the header.
 * It holds the search's open state for the sidebar's Search entry and the Cmd/Ctrl+K shortcut.
 */
function Shell() {
  const [open, setOpen] = useState(readSidebar)
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const [searching, setSearching] = useState(false)
  const search = useMemo(() => ({ open: searching, setOpen: setSearching }), [searching])
  useScrollMemory()

  return (
    <div className="[--header-height:calc(--spacing(12))]">
      <SidebarProvider
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          writeSidebar(next)
        }}
        className="flex h-svh flex-col overflow-hidden"
      >
        <TopBarSlot.Provider value={slot}>
          <SearchOpen.Provider value={search}>
            <SkipLink />
            <SiteHeader setSlot={setSlot} />
            <div className="flex min-h-0 flex-1">
              <AppSidebar />
              <SidebarInset id="content" tabIndex={-1} className="min-h-0 overflow-hidden outline-none">
                <Routes />
              </SidebarInset>
            </div>
            <SearchDialog />
          </SearchOpen.Provider>
        </TopBarSlot.Provider>
      </SidebarProvider>
    </div>
  )
}

/** The dashboard: hash routes through the guarded location hook, the tooltip provider and the shell. */
export function App() {
  return (
    <Router hook={useGuardedLocation}>
      <TooltipProvider>
        <Shell />
      </TooltipProvider>
    </Router>
  )
}
