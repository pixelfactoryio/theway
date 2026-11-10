import { CSPProvider } from "@base-ui/react/csp-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Redirect, Route, Router, Switch, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DraftsProvider } from "@/files/drafts";
import type { FileRef } from "@/lib/api";
import { ChangePage } from "@/pages/change";
import { ChangesPage } from "@/pages/changes";
import { type Mode, WorkflowsIndex, WorkflowsPage } from "@/pages/workflows";
import { EXT, type SourceKind } from "../types";

const queryClient = new QueryClient();

/** The top bar: the word theway, then Changes and Workflows as a segmented control. */
function TopBar() {
  const [location, navigate] = useLocation();
  const changes = location.startsWith("/changes") || location.startsWith("/archive");
  return (
    <header className="border-b border-divider bg-card">
      <nav aria-label="Main" className="mx-auto flex max-w-[1120px] items-center gap-6 px-6 py-2.5">
        <span className="font-semibold">theway</span>
        <Tabs value={changes ? "changes" : "workflows"}>
          <TabsList>
            <TabsTrigger value="changes" className="px-3" onClick={() => navigate("/changes")}>
              Changes
            </TabsTrigger>
            <TabsTrigger value="workflows" className="px-3" onClick={() => navigate("/workflows")}>
              Workflows
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </nav>
    </header>
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
            <div className="flex min-h-screen flex-col">
              <TopBar />
              <Routes />
            </div>
          </Router>
        </DraftsProvider>
      </QueryClientProvider>
    </CSPProvider>
  );
}
