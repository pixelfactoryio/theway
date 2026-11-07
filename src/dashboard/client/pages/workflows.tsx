import { Link } from "wouter";
import { Empty, PageHeader } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useWorkflows } from "@/lib/api";
import { useLabel } from "@/lib/projects";

/** The Workflows page: one row per workflow, linked to its graph, or its error line, then the warnings. */
export function WorkflowsPage({ projectKey }: { projectKey: string }) {
  const label = useLabel(projectKey);
  const workflows = useWorkflows(projectKey);
  const data = workflows.data;
  return (
    <>
      <PageHeader project={label} crumbs="Workflows" />
      {data === undefined ? (
        <Empty error={workflows.isError}>{workflows.isError ? workflows.error.message : "Loading…"}</Empty>
      ) : (
        <main className="flex flex-col gap-5 p-6">
          {data.error !== undefined && <p className="font-mono text-[12px] text-destructive">{data.error}</p>}
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
                        <div className="flex gap-1.5">
                          {w.default === true && <Badge variant="secondary">default</Badge>}
                          {w.pushes === true && <Badge variant="outline">pushes</Badge>}
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
