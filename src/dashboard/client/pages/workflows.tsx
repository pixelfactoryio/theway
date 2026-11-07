import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Empty, PageHeader } from "@/components/state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Confirm, type ConfirmAsk, NewFileDialog } from "@/editor/dialogs";
import { newWorkflowText } from "@/editor/ops";
import { setPendingWorkflow } from "@/editor/pending";
import { revertFile, useWorkflowSources, useWorkflows } from "@/lib/api";
import { useLabel } from "@/lib/projects";

/**
 * The Workflows page: one row per workflow, linked to its graph, or its error line, then the warnings; New workflow,
 * and Revert to global on a project workflow whose name also exists globally.
 */
export function WorkflowsPage({ projectKey }: { projectKey: string }) {
  const label = useLabel(projectKey);
  const workflows = useWorkflows(projectKey);
  const data = workflows.data;
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [creating, setCreating] = useState(0);
  const [ask, setAsk] = useState<ConfirmAsk | null>(null);
  const [failed, setFailed] = useState<string[] | null>(null);
  const own = (data?.workflows ?? []).filter((w) => w.origin === "project").map((w) => w.name);
  const sources = useWorkflowSources(projectKey, own);
  const copyOf = (name: string) => {
    const s = sources[own.indexOf(name)]?.data;
    return s !== undefined && s !== null && s.globalPath !== null && s.sha256 !== null ? s : null;
  };
  const revert = (name: string, base: string) =>
    setAsk({
      title: "Revert to global?",
      text: `This deletes projects/${label}/workflows/${name}.yaml; the project uses the global workflow again.`,
      action: "Revert",
      onConfirm: () => {
        void revertFile(projectKey, "workflows", name, base)
          .then(async (r) => {
            if (r.status === 200) {
              setFailed(null);
              await queryClient.invalidateQueries({ queryKey: ["sources", projectKey] });
              await queryClient.invalidateQueries({ queryKey: ["workflows", projectKey] });
              await queryClient.invalidateQueries({ queryKey: ["workflow", projectKey, name] });
            } else if ("conflicts" in r.body) setFailed([`${name}: changed on disk since the page loaded; reload it.`]);
            else if ("errors" in r.body) setFailed(r.body.errors);
          })
          .catch((e: Error) => setFailed([e.message]));
      },
    });
  return (
    <>
      <PageHeader project={label} crumbs="Workflows">
        <Button size="sm" variant="outline" onClick={() => setCreating((n) => n + 1)}>
          New workflow
        </Button>
      </PageHeader>
      <NewFileDialog
        key={creating}
        open={creating > 0}
        kind="workflow"
        taken={(data?.workflows ?? []).map((w) => w.name)}
        onCancel={() => setCreating(0)}
        onSubmit={(v) => {
          setPendingWorkflow(projectKey, v.name, newWorkflowText(v.description));
          setCreating(0);
          navigate(`/p/${projectKey}/workflows/${v.name}/edit`);
        }}
      />
      <Confirm ask={ask} onClose={() => setAsk(null)} />
      {data === undefined ? (
        <Empty error={workflows.isError}>{workflows.isError ? workflows.error.message : "Loading…"}</Empty>
      ) : (
        <main className="flex flex-col gap-5 p-6">
          {data.error !== undefined && <p className="font-mono text-[12px] text-destructive">{data.error}</p>}
          {failed !== null && (
            <Alert variant="destructive">
              <AlertTitle>Not reverted</AlertTitle>
              <AlertDescription>
                <ul className="font-mono text-[12px]">
                  {failed.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          {data.defaultError !== null && (
            <p className="text-destructive">
              No default workflow: <span className="font-mono text-[12px]">{data.defaultError}</span>
            </p>
          )}
          {data.workflows.length > 0 && (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="min-w-[280px] px-4">Workflow</TableHead>
                    <TableHead>Origin</TableHead>
                    <TableHead>Input</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.workflows.map((w) => (
                    <TableRow key={w.name}>
                      <TableCell className="px-4 py-3 align-top whitespace-normal">
                        <Link href={`/p/${projectKey}/workflows/${w.name}`} className="font-mono hover:underline" title={w.file}>
                          {w.name}
                        </Link>
                        {w.error !== undefined ? (
                          <div className="mt-0.5 font-mono text-[12px] text-destructive">{w.error}</div>
                        ) : (
                          w.description != null && <div className="mt-0.5 text-muted-foreground">{w.description}</div>
                        )}
                      </TableCell>
                      <TableCell className="py-3 align-top text-muted-foreground">{w.origin}</TableCell>
                      <TableCell className="py-3 align-top">{w.input ?? ""}</TableCell>
                      <TableCell className="py-3 align-top">
                        <div className="flex items-center gap-1.5">
                          {w.default === true && <Badge variant="secondary">default</Badge>}
                          {w.pushes === true && <Badge variant="outline">pushes</Badge>}
                          {w.origin === "project" && copyOf(w.name) !== null && (
                            <Button variant="ghost" size="xs" onClick={() => revert(w.name, copyOf(w.name)?.sha256 as string)}>
                              Revert to global
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {data.workflows.length === 0 && data.error === undefined && <Empty>No workflows.</Empty>}
          {data.warnings.length > 0 && (
            <section className="flex flex-col gap-1.5">
              <h2 className="font-medium">Warnings</h2>
              <ul className="flex flex-col gap-1 font-mono text-[12px] text-muted-foreground">
                {data.warnings.map((w, i) => (
                  <li key={i}>
                    {w.file}: {w.text}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </main>
      )}
    </>
  );
}
