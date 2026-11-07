import { useCallback, useMemo, useState } from "react";
import { Link } from "wouter";
import { Empty, PageHeader } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Canvas } from "@/graph/Canvas";
import { details } from "@/graph/details";
import { toFlow } from "@/graph/flow";
import { Inspector } from "@/graph/Inspector";
import { layout } from "@/graph/layout";
import { model } from "@/graph/model";
import { useWorkflow, useWorkflows } from "@/lib/api";
import { useLabel } from "@/lib/projects";
import type { Warning, WorkflowDetail } from "../../types";

function Warnings({ warnings }: { warnings: Warning[] }) {
  if (warnings.length === 0) return null;
  return (
    <ul className="flex flex-col gap-0.5 font-mono text-[12px] text-muted-foreground">
      {warnings.map((w, i) => (
        <li key={i}>
          {w.file}: {w.text}
        </li>
      ))}
    </ul>
  );
}

const ids = new WeakMap<object, number>();
let lastId = 0;
/**
 * A number for each distinct data object. The query keeps the same object while a refetch returns equal data, so the
 * graph keeps its view and selection then and is drawn again only when the workflow changes.
 */
function dataId(data: object): number {
  let id = ids.get(data);
  if (id === undefined) {
    id = ++lastId;
    ids.set(data, id);
  }
  return id;
}

/** The graph of a resolved workflow with the inspector of the selected node. */
function Graph({ data }: { data: WorkflowDetail }) {
  const graph = useMemo(() => model(data.workflow), [data.workflow]);
  const flow = useMemo(() => toFlow(layout(graph)), [graph]);
  const [selected, setSelected] = useState<string | null>(null);
  const close = useCallback(() => setSelected(null), []);
  const shown = selected === null ? null : details(graph, selected);
  return (
    <div className="flex min-h-0 grow">
      <div className="min-w-0 grow">
        <Canvas nodes={flow.nodes} edges={flow.edges} selected={selected} onSelect={setSelected} />
      </div>
      {shown !== null && <Inspector details={shown} prompts={data.prompts} onClose={close} />}
    </div>
  );
}

/** The workflow page: its graph or its YAML file, with the warnings resolving it gave, or the line that stops it. */
export function WorkflowPage({ projectKey, name }: { projectKey: string; name: string }) {
  const label = useLabel(projectKey);
  const query = useWorkflow(projectKey, name);
  const origin = useWorkflows(projectKey).data?.workflows.find((w) => w.name === name)?.origin;
  const [tab, setTab] = useState<string>("graph");
  const data = query.data;
  const resolved = data !== undefined && "workflow" in data ? data : null;
  const failure = data !== undefined && !("workflow" in data) ? data : null;
  return (
    <Tabs value={tab} onValueChange={(v) => setTab(String(v))} className="flex h-svh min-h-0 flex-col gap-0">
      <PageHeader
        project={label}
        crumbs={
          <>
            <Link href={`/p/${projectKey}/workflows`} className="font-normal text-muted-foreground hover:underline">
              Workflows
            </Link>
            <span className="px-2 text-muted-foreground/60">/</span>
            <span className="font-mono">{name}</span>
          </>
        }
      >
        {origin !== undefined && <Badge variant="secondary">{origin}</Badge>}
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/p/${projectKey}/workflows/${name}/edit`} />}>
          Edit
        </Button>
        {resolved !== null && (
          <TabsList>
            <TabsTrigger value="graph">Graph</TabsTrigger>
            <TabsTrigger value="yaml">YAML</TabsTrigger>
          </TabsList>
        )}
      </PageHeader>
      {data === undefined ? (
        <Empty error={query.isError}>{query.isError ? query.error.message : "Loading…"}</Empty>
      ) : failure !== null ? (
        <main className="flex flex-col gap-3 p-6">
          <p className="font-mono text-[12px] text-destructive">{failure.error}</p>
          <Warnings warnings={failure.warnings} />
        </main>
      ) : resolved === null ? null : (
        <>
          <div className="flex flex-col gap-1 border-b px-4 py-2.5">
            <div className="font-mono font-medium">{resolved.workflow.name}</div>
            {resolved.workflow.description !== null && <div className="text-muted-foreground">{resolved.workflow.description}</div>}
            <Warnings warnings={resolved.warnings} />
          </div>
          <TabsContent value="graph" className="flex min-h-0 grow">
            <Graph key={`${projectKey}/${name}/${dataId(resolved)}`} data={resolved} />
          </TabsContent>
          <TabsContent value="yaml" className="min-h-0 grow overflow-auto p-6">
            <p className="mb-2 font-mono text-[12px] text-muted-foreground">{resolved.source.path}</p>
            <pre className="rounded-md border bg-muted p-4 font-mono text-[12px] leading-relaxed">{resolved.source.text}</pre>
          </TabsContent>
        </>
      )}
    </Tabs>
  );
}
