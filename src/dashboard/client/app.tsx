import { CSPProvider } from "@base-ui/react/csp-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cn } from "cn";
import { Link, Redirect, Route, Router, Switch, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { DraftsProvider } from "@/files/drafts";
import { ChangePage } from "@/pages/change";
import { ChangesPage } from "@/pages/changes";
import { type Mode, WorkflowsIndex, WorkflowsPage } from "@/pages/workflows";
import type { FileRef } from "@/lib/api";

const queryClient = new QueryClient();

/** One top tab: a link with a 2px bottom border in the foreground colour when active. */
function Tab({ href, active, children }: { href: string; active: boolean; children: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn("border-b-2 py-3.5", active ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
    >
      {children}
    </Link>
  );
}

/** The top bar: the word theway, then the Changes and Workflows tabs. */
function TopBar() {
  const [location] = useLocation();
  const changes = location.startsWith("/changes") || location.startsWith("/archive");
  return (
    <header className="border-b border-divider">
      <nav aria-label="Main" className="mx-auto flex max-w-[1120px] items-center gap-6 px-6">
        <span className="mr-2 font-semibold">theway</span>
        <Tab href="/changes" active={changes}>
          Changes
        </Tab>
        <Tab href="/workflows" active={location.startsWith("/workflows")}>
          Workflows
        </Tab>
      </nav>
    </header>
  );
}

const isKind = (k: string): k is "workflows" | "steps" => k === "workflows" || k === "steps";

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
