import { CSPProvider } from "@base-ui/react/csp-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Redirect, Route, Router, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { AppSidebar } from "@/components/app-sidebar";
import { Empty } from "@/components/state";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useProjects } from "@/lib/api";
import { ChangePage } from "@/pages/change";
import { ChangesPage } from "@/pages/changes";
import { WorkflowsPage } from "@/pages/workflows";

const queryClient = new QueryClient();

/** The routes under `#/p/<key>/`; `#/` goes to the initially selected project. */
function Routes() {
  const projects = useProjects();
  return (
    <Switch>
      <Route path="/p/:key/changes">{(p) => <ChangesPage key={p.key} projectKey={p.key} />}</Route>
      <Route path="/p/:key/changes/:id">{(p) => <ChangePage projectKey={p.key} id={p.id} archived={false} />}</Route>
      <Route path="/p/:key/archive/:folder">{(p) => <ChangePage projectKey={p.key} id={p.folder} archived={true} />}</Route>
      <Route path="/p/:key/workflows">{(p) => <WorkflowsPage projectKey={p.key} />}</Route>
      <Route path="/p/:key">{(p) => <Redirect to={`/p/${p.key}/changes`} replace />}</Route>
      <Route>
        {projects.data === undefined ? (
          <Empty>{projects.isError ? projects.error.message : "Loading…"}</Empty>
        ) : projects.data.initial === null ? (
          <Empty>No projects yet</Empty>
        ) : (
          <Redirect to={`/p/${projects.data.initial}/changes`} replace />
        )}
      </Route>
    </Switch>
  );
}

export function App() {
  return (
    <CSPProvider disableStyleElements>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Router hook={useHashLocation}>
            <SidebarProvider>
              <AppSidebar />
              <SidebarInset className="min-w-0">
                <Routes />
              </SidebarInset>
            </SidebarProvider>
          </Router>
        </TooltipProvider>
      </QueryClientProvider>
    </CSPProvider>
  );
}
