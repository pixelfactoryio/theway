import { useState } from "react";
import { Link } from "wouter";
import { Empty, PageHeader, StatusBadge, TaskBar } from "@/components/state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useChanges } from "@/lib/api";
import { useLabel } from "@/lib/projects";
import { type Row, rowsOf } from "@/lib/series";
import type { ActiveChange, ArchivedChange } from "../../types";

/** One of the four totals. */
function Total({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border p-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-2xl font-semibold ${className ?? ""}`}>{children}</span>
    </div>
  );
}

/** A member's bar with its ordinal and task count, linking to the member. */
function Member({ projectKey, change }: { projectKey: string; change: ActiveChange }) {
  const ordinal = String(change.series?.ordinal ?? 0).padStart(2, "0");
  return (
    <Link href={`/p/${projectKey}/changes/${change.id}`} title={change.id} className="flex w-[72px] flex-col gap-1 hover:opacity-80">
      <TaskBar tasks={change.tasks} />
      <span className="text-[11px] text-muted-foreground tabular-nums">
        {ordinal} · {change.tasks.done}/{change.tasks.total}
      </span>
    </Link>
  );
}

function RowView({ projectKey, row }: { projectKey: string; row: Row }) {
  return (
    <TableRow>
      <TableCell className="py-3">
        {row.kind === "series" ? (
          <span className="font-mono">{row.id}</span>
        ) : (
          <Link href={`/p/${projectKey}/changes/${row.id}`} className="font-mono hover:underline">
            {row.id}
          </Link>
        )}
      </TableCell>
      <TableCell className="py-3">
        {row.kind === "series" ? (
          <div className="flex flex-wrap gap-1.5">
            {row.members.map((m) => (
              <Member key={m.id} projectKey={projectKey} change={m} />
            ))}
          </div>
        ) : (
          <div className="flex w-[228px] flex-col gap-1">
            <TaskBar tasks={row.change.tasks} />
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {row.change.tasks.done}/{row.change.tasks.total}
            </span>
          </div>
        )}
      </TableCell>
      <TableCell className="py-3">
        <StatusBadge status={row.status} />
      </TableCell>
    </TableRow>
  );
}

function ArchivedList({ projectKey, archived }: { projectKey: string; archived: ArchivedChange[] }) {
  if (archived.length === 0) return <Empty>No archived changes.</Empty>;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow>
            <TableHead className="w-32 px-4">Date</TableHead>
            <TableHead className="px-4">Change</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {archived.map((a) => (
            <TableRow key={a.folder}>
              <TableCell className="px-4 text-muted-foreground tabular-nums">{a.date ?? "—"}</TableCell>
              <TableCell className="px-4">
                {a.id === null ? (
                  <span className="font-mono">{a.folder}</span>
                ) : (
                  <Link href={`/p/${projectKey}/archive/${a.folder}`} className="font-mono hover:underline">
                    {a.id}
                  </Link>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** The Changes page: the Active and Archived tabs, the four totals, the series table and the archived list. */
export function ChangesPage({ projectKey }: { projectKey: string }) {
  const label = useLabel(projectKey);
  const changes = useChanges(projectKey);
  const [tab, setTab] = useState<string>("active");
  const data = changes.data;
  const done = data?.active.reduce((n, c) => n + c.tasks.done, 0) ?? 0;
  const total = data?.active.reduce((n, c) => n + c.tasks.total, 0) ?? 0;
  const ready = data?.active.filter((c) => c.status === "Ready to archive").length ?? 0;
  const rows = data === undefined ? [] : rowsOf(data.active);
  return (
    <Tabs value={tab} onValueChange={(v) => setTab(String(v))} className="gap-0">
      <PageHeader project={label} crumbs="Changes">
        <TabsList>
          <TabsTrigger value="active">Active {data?.active.length ?? ""}</TabsTrigger>
          <TabsTrigger value="archived">Archived {data?.archived.length ?? ""}</TabsTrigger>
        </TabsList>
      </PageHeader>
      {data === undefined ? (
        <Empty error={changes.isError}>{changes.isError ? changes.error.message : "Loading…"}</Empty>
      ) : (
        <main className="flex flex-col gap-5 p-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Total label="Active changes">{data.active.length}</Total>
            <Total label="Tasks done">
              {done} <span className="text-[15px] font-normal text-muted-foreground">/ {total}</span>
            </Total>
            <Total label="Ready to archive" className="text-[#15803D]">
              {ready}
            </Total>
            <Total label="Archived">{data.archived.length}</Total>
          </div>
          <TabsContent value="active">
            {rows.length === 0 ? (
              <Empty>No active changes.</Empty>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow>
                      <TableHead className="min-w-[260px] px-4">Series / change</TableHead>
                      <TableHead className="min-w-[340px]">Members · tasks</TableHead>
                      <TableHead className="w-[130px]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="[&_td:first-child]:px-4">
                    {rows.map((row) => (
                      <RowView key={`${row.kind}:${row.id}`} projectKey={projectKey} row={row} />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
          <TabsContent value="archived">
            <ArchivedList projectKey={projectKey} archived={data.archived} />
          </TabsContent>
        </main>
      )}
    </Tabs>
  );
}
