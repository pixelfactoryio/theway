import { CSPProvider } from "@base-ui/react/csp-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cn } from "cn";
import { Redirect, Route, Router, Switch, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DraftsProvider } from "@/files/drafts";
import { FileListStateProvider } from "@/files/FileList";
import { SavedProvider } from "@/files/saved";
import type { FileRef } from "@/lib/api";
import { ChangePage } from "@/pages/change";
import { ChangesPage } from "@/pages/changes";
import { type Mode, WIDE, WorkflowsIndex, WorkflowsPage } from "@/pages/workflows";
import { EXT, type SourceKind } from "../types";

const queryClient = new QueryClient();

/** The top bar, sticky: the logo mark and the word theway, then Changes and Workflows as a segmented control. */
function TopBar() {
  const [location, navigate] = useLocation();
  const changes = location.startsWith("/changes") || location.startsWith("/archive");
  const tab = "h-8 flex-none px-3 text-muted-foreground pointer-coarse:h-11";
  return (
    <header className="sticky top-0 z-40 h-(--topbar-h) border-b border-divider bg-card">
      <nav aria-label="Main" className={cn("mx-auto flex h-full items-center gap-6 px-6", changes ? "max-w-[1120px]" : WIDE)}>
        <span className="flex items-center gap-2 font-semibold">
          {/* The logo mark: three lines on a rounded primary square. */}
          <span className="inline-flex size-[22px] items-center justify-center rounded-[7px] bg-primary">
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round">
              <path d="M2 3h8M2 6h5M2 9h8" />
            </svg>
          </span>
          theway
        </span>
        <Tabs value={changes ? "changes" : "workflows"}>
          <TabsList className="group-data-horizontal/tabs:h-auto">
            <TabsTrigger value="changes" className={tab} onClick={() => navigate("/changes")}>
              Changes
            </TabsTrigger>
            <TabsTrigger value="workflows" className={tab} onClick={() => navigate("/workflows")}>
              Workflows
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </nav>
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

const isKind = (k: string): k is SourceKind => Object.hasOwn(EXT, k);

/** The Workflows page of a file, in view, edit or versions mode; `/workflows` for a kind that is not one. */
function page(file: Omit<FileRef, "kind"> & { kind: string }, mode: Mode) {
  if (!isKind(file.kind)) return <Redirect to="/workflows" replace />;
  const ref: FileRef = { ...file, kind: file.kind };
  return <WorkflowsPage key={`${ref.scope}/${ref.key ?? ""}/${ref.kind}/${ref.name}`} file={ref} mode={mode} />;
}

const VIEW: Mode = { view: true };
const EDIT: Mode = { edit: true };

function Routes() {
  return (
    <Switch>
      <Route path="/changes">
        <ChangesPage />
      </Route>
      <Route path="/changes/:key/:id">{(p) => <ChangePage key={`c/${p.key}/${p.id}`} projectKey={p.key} id={p.id} archived={false} />}</Route>
      <Route path="/archive/:key/:folder">{(p) => <ChangePage key={`a/${p.key}/${p.folder}`} projectKey={p.key} id={p.folder} archived={true} />}</Route>
      <Route path="/workflows">
        <WorkflowsIndex />
      </Route>
      <Route path="/workflows/global/:kind/:name">{(p) => page({ scope: "global", key: null, kind: p.kind, name: p.name }, VIEW)}</Route>
      <Route path="/workflows/global/:kind/:name/edit">{(p) => page({ scope: "global", key: null, kind: p.kind, name: p.name }, EDIT)}</Route>
      <Route path="/workflows/global/:kind/:name/versions">{(p) => page({ scope: "global", key: null, kind: p.kind, name: p.name }, { version: null })}</Route>
      <Route path="/workflows/global/:kind/:name/versions/:id">
        {(p) => page({ scope: "global", key: null, kind: p.kind, name: p.name }, { version: p.id })}
      </Route>
      <Route path="/workflows/projects/:key/:kind/:name">{(p) => page({ scope: "project", key: p.key, kind: p.kind, name: p.name }, VIEW)}</Route>
      <Route path="/workflows/projects/:key/:kind/:name/edit">{(p) => page({ scope: "project", key: p.key, kind: p.kind, name: p.name }, EDIT)}</Route>
      <Route path="/workflows/projects/:key/:kind/:name/versions">
        {(p) => page({ scope: "project", key: p.key, kind: p.kind, name: p.name }, { version: null })}
      </Route>
      <Route path="/workflows/projects/:key/:kind/:name/versions/:id">
        {(p) => page({ scope: "project", key: p.key, kind: p.kind, name: p.name }, { version: p.id })}
      </Route>
      <Route>
        <Redirect to="/changes" replace />
      </Route>
    </Switch>
  );
}

export function App() {
  return (
    <CSPProvider disableStyleElements>
      <QueryClientProvider client={queryClient}>
        <DraftsProvider>
          <Router hook={useHashLocation}>
            <SavedProvider>
              <FileListStateProvider>
                <div className="flex min-h-screen flex-col">
                  <SkipLink />
                  <TopBar />
                  <Routes />
                </div>
              </FileListStateProvider>
            </SavedProvider>
          </Router>
        </DraftsProvider>
      </QueryClientProvider>
    </CSPProvider>
  );
}
