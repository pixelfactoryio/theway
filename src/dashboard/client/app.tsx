import { type CSSProperties, type ReactNode, useMemo, useRef, useState } from "react"
import { usePanelRef } from "react-resizable-panels"
import { Redirect, Route, Router, Switch, useLocation, useSearch } from "wouter"

import { SearchDialog } from "@/components/search-dialog"
import { ShellDialogs } from "@/components/shell-dialogs"
import { Toaster } from "@/components/toaster"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { HANDLE, SIDEBAR_HANDLE } from "@/components/ui-classes"
import { useProjects } from "@/data/queries"
import { panelWidthCodec, sidebarCodec } from "@/lib/preferences"
import { decoded, type Params, ROUTES, type RouteName, to } from "@/lib/routes"
import { ChangesRoute } from "@/pages/change/route"
import { NowPage } from "@/pages/workspace/now"
import { ProjectsPage } from "@/pages/workspace/projects"
import { ScopePage } from "@/pages/workspace/scope"
import { PromptPage } from "@/pages/prompt/page"
import { PromptsPage } from "@/pages/files/prompts"
import { WorkflowPage } from "@/pages/workflow/page"
import { WorkflowsPage } from "@/pages/files/workflows"
import { AppSidebar } from "@/shell/app-sidebar"
import { ErrorBoundary, PageError, RootError } from "@/shell/error-boundary"
import { useGuardedLocation } from "@/shell/guard"
import { useScrollMemory } from "@/shell/scroll"
import { SearchOpen } from "@/shell/search"
import { DialogOpen } from "@/shell/dialogs"
import { useGlobalKeys, type ShellDialog } from "@/shell/keys"
import { useIsMobile } from "@/hooks/use-mobile"
import { rootScale } from "@/hooks/use-root-scale"
import { PANEL_WIDTH, PanelArea, PanelProvider, rem, usePanelState, useWide } from "@/shell/panel"
import { useRecordStart } from "@/shell/settings"
import { useStored } from "@/shell/storage"
import { HeaderSlot } from "@/shell/top-bar"

/** The `localStorage` key of the sidebar's state: `open` or `closed`; when absent, open from 1024px wide. */
const SIDEBAR_KEY = "theway-sidebar"

const SIDEBAR = sidebarCodec(() => window.matchMedia("(min-width: 1024px)").matches)

/** The `localStorage` key of the docked panel's width, in pixels at the 16px root. */
const PANEL_WIDTH_KEY = "theway-panel-width"

const PANEL_PIXELS = panelWidthCodec(PANEL_WIDTH.min, PANEL_WIDTH.max, PANEL_WIDTH.default)

/**
 * The expanded sidebar's width in pixels at the 16px root (where the work area starts): its least, its most and its
 * first. Given in rem, it grows with the root, as the text it holds does.
 */
const SIDEBAR_WIDTH = { min: 208, max: 320, default: 244 } as const

/** The `localStorage` key of the expanded sidebar's width, in pixels at the 16px root. */
const SIDEBAR_WIDTH_KEY = "theway-sidebar-width"

const SIDEBAR_PIXELS = panelWidthCodec(SIDEBAR_WIDTH.min, SIDEBAR_WIDTH.max, SIDEBAR_WIDTH.default)

/** The icon rail: its 32px buttons with 8px at each side, the work area 8px after them as everywhere else. */
const RAIL = "3rem"

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
 * The shell: the sidebar on the app's ground, and the work area, one inset panel with rounded corners: the page's
 * header (its place, its actions and its views) across its top, then the page and, on a record's page, its panel at the
 * right. It holds the search's open state for the sidebar's Search entry and the Cmd/Ctrl+K shortcut.
 */
function Shell() {
  const [open, setOpen] = useStored(SIDEBAR_KEY, SIDEBAR)
  const [searching, setSearching] = useState(false)
  const search = useMemo(() => ({ open: searching, setOpen: setSearching }), [searching])
  const [dialog, setDialog] = useState<ShellDialog>(null)
  const dialogs = useMemo(() => ({ dialog, open: setDialog }), [dialog])
  const [location] = useLocation()
  const panel = usePanelState()
  // From 1280px a page's open panel docks at the page's right, resizable. Its width is kept in pixels at the 16px
  // root and given in rem: a share of the window would give another width in a window of another size, while rem
  // grows with the text the panel holds.
  const { name: panelName, open: panelOpen, setSlot } = panel
  // The sidebar is the first panel of the shell's group, resized by its edge from 768px while expanded and kept in
  // pixels at the 16px root as the docked panel is; folded, it is the 48px rail, and below 768px (where it opens
  // over the page) it takes no room. Its size changes at once: the work area takes its new width in one frame.
  const mobile = useIsMobile()
  const expanded = open && !mobile
  const [sidebarWidth, setSidebarWidth] = useStored(SIDEBAR_WIDTH_KEY, SIDEBAR_PIXELS)
  const sidebarPanel = usePanelRef()
  const wrapper = useRef<HTMLDivElement>(null)
  const sidebarSize = mobile ? "0px" : expanded ? rem(sidebarWidth) : RAIL
  const docked = useWide() && panelName !== null && panelOpen
  const [panelWidth, setPanelWidth] = useStored(PANEL_WIDTH_KEY, PANEL_PIXELS)
  const dockedPanel = usePanelRef()
  const [header, setHeader] = useState<HTMLElement | null>(null)
  // Only a width the user set is kept: a window too narrow for the kept width leaves it for a wider one. The panel
  // is measured once the change is drawn: an arrow key's resize is reported before it.
  const keepPanelWidth = (byUser: boolean) => {
    if (!byUser) return
    requestAnimationFrame(() => {
      const size = dockedPanel.current?.getSize()
      if (size === undefined) return
      const width = Math.round(size.inPixels / rootScale())
      setPanelWidth(Math.min(PANEL_WIDTH.max, Math.max(PANEL_WIDTH.min, width)))
    })
  }
  const keepSidebarWidth = (byUser: boolean) => {
    if (!byUser || !expanded) return
    requestAnimationFrame(() => {
      const size = sidebarPanel.current?.getSize()
      if (size === undefined) return
      const width = Math.round(size.inPixels / rootScale())
      setSidebarWidth(Math.min(SIDEBAR_WIDTH.max, Math.max(SIDEBAR_WIDTH.min, width)))
    })
  }
  useScrollMemory()
  useGlobalKeys(dialogs)
  useRecordStart(useProjects().data?.start ?? null)

  return (
    <SidebarProvider
      ref={wrapper}
      open={open}
      onOpenChange={setOpen}
      style={{ "--sidebar-width": rem(sidebarWidth), "--sidebar-width-icon": "2rem" } as CSSProperties}
      className="h-svh overflow-hidden bg-ground"
    >
      <PanelProvider value={panel}>
        <SearchOpen.Provider value={search}>
          <DialogOpen.Provider value={dialogs}>
            <SkipLink />
            <ResizablePanelGroup
              orientation="horizontal"
              onLayoutChanged={(_, meta) => keepSidebarWidth(meta.isUserInteraction)}
              className="min-w-0 flex-1"
            >
              <ResizablePanel
                // A panel of another id for each state, so the group gives it its default size at once.
                id={mobile ? "sidebar-sheet" : expanded ? "sidebar" : "sidebar-rail"}
                panelRef={sidebarPanel}
                defaultSize={sidebarSize}
                minSize={expanded ? rem(SIDEBAR_WIDTH.min) : sidebarSize}
                maxSize={expanded ? rem(SIDEBAR_WIDTH.max) : sidebarSize}
                groupResizeBehavior="preserve-pixel-size"
                // The sidebar's own width follows its panel's while it is dragged, without a render per frame.
                onResize={(size) => {
                  if (expanded) wrapper.current?.style.setProperty("--sidebar-width", `${size.inPixels}px`)
                }}
              >
                <AppSidebar />
              </ResizablePanel>
              {expanded ? (
                <ResizableHandle withHandle aria-label="Resize the sidebar" className={SIDEBAR_HANDLE} />
              ) : null}
              <ResizablePanel id="work" className="flex min-w-0 flex-col">
                <main
                  id="content"
                  tabIndex={-1}
                  className="m-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border bg-background shadow-sm outline-none md:ml-0"
                >
                  <HeaderSlot.Provider value={header}>
                    <div ref={setHeader} className="flex shrink-0 flex-col" />
                    <ResizablePanelGroup
                      orientation="horizontal"
                      onLayoutChanged={(_, meta) => keepPanelWidth(meta.isUserInteraction)}
                      className="min-h-0 flex-1"
                    >
                      <ResizablePanel id="page" className="flex min-w-0 flex-col">
                        <ErrorBoundary
                          resetKey={location}
                          fallback={(error, reset) => <PageError error={error} reset={reset} />}
                        >
                          <Routes />
                        </ErrorBoundary>
                      </ResizablePanel>
                      {docked ? (
                        <>
                          <ResizableHandle aria-label={`Resize ${panelName}`} className={HANDLE} />
                          <ResizablePanel
                            id="panel"
                            panelRef={dockedPanel}
                            defaultSize={rem(panelWidth)}
                            minSize={rem(PANEL_WIDTH.min)}
                            maxSize={rem(PANEL_WIDTH.max)}
                            groupResizeBehavior="preserve-pixel-size"
                            className="flex min-h-0 flex-col"
                          >
                            <aside aria-label={panelName ?? undefined} className="flex h-full min-h-0 flex-col">
                              <div ref={setSlot} className="flex min-h-0 flex-1 flex-col" />
                            </aside>
                          </ResizablePanel>
                        </>
                      ) : null}
                    </ResizablePanelGroup>
                  </HeaderSlot.Provider>
                </main>
              </ResizablePanel>
            </ResizablePanelGroup>
            <PanelArea />
            <SearchDialog />
            <ShellDialogs />
          </DialogOpen.Provider>
        </SearchOpen.Provider>
      </PanelProvider>
    </SidebarProvider>
  )
}

/** The dashboard: hash routes through the guarded location hook, the tooltip provider, the toasts and the shell. */
export function App() {
  return (
    <Router hook={useGuardedLocation}>
      <TooltipProvider>
        <Toaster>
          <ErrorBoundary fallback={(error) => <RootError error={error} />}>
            <Shell />
          </ErrorBoundary>
        </Toaster>
      </TooltipProvider>
    </Router>
  )
}
