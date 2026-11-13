import { useState } from "react"
import { Redirect, Route, Router, Switch } from "wouter"
import { useHashLocation } from "wouter/use-hash-location"

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ChangesRoute, HomeRoute } from "@/pages/changes"
import { PromptsPage } from "@/pages/prompts-list"
import { WorkflowsPage } from "@/pages/workflows-list"
import { AppSidebar } from "@/shell/app-sidebar"
import { useScrollMemory } from "@/shell/scroll"

/** The `localStorage` key of the sidebar's state: `open` or `closed`; closed (the icon rail) when absent. */
const SIDEBAR_KEY = "theway-sidebar"

function readSidebar(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === "open"
  } catch {
    return false
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
      className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:ring-3 focus:ring-ring/50 focus:outline-none"
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
      <Route path="/prompts">
        <PromptsPage />
      </Route>
      <Route>
        <Redirect to="/?" replace />
      </Route>
    </Switch>
  )
}

function Shell() {
  const [open, setOpen] = useState(readSidebar)
  useScrollMemory()

  return (
    <SidebarProvider
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        writeSidebar(next)
      }}
      className="h-svh overflow-hidden"
    >
      <SkipLink />
      <AppSidebar />
      <SidebarInset id="content" tabIndex={-1} className="min-h-0 overflow-hidden outline-none">
        <Routes />
      </SidebarInset>
    </SidebarProvider>
  )
}

/** The dashboard: hash routes, the tooltip provider and the shell. */
export function App() {
  return (
    <Router hook={useHashLocation}>
      <TooltipProvider>
        <Shell />
      </TooltipProvider>
    </Router>
  )
}
