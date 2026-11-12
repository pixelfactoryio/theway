import { cn } from "cn";
import { useState } from "react";
import { Link } from "wouter";
import { Badge } from "@/components/reui/badge";
import { Bar, Empty } from "@/components/state";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAllChanges } from "@/lib/api";
import { type ArchivedRow, archivedRows, badgeVariant, type ChangeRow, changesRows, plural, STATUSES } from "@/lib/changes";
import { projectNames } from "@/lib/labels";
import type { ActiveChange, Status } from "../../types";

/** A table's header cells and rows: the grid of its columns, the Project column and the bar dropped below `lg`. */
export const HEAD = "grid items-end gap-x-6 border-b border-divider px-2 pb-2 text-[12px] font-semibold";
export const ROW = "grid items-center gap-x-6 border-b border-divider-row px-2 py-3 hover:bg-accent";

/** A page's title row: the title over a divider. */
export function Title({ children }: { children: string }) {
  return <h1 className="border-b border-divider pb-4 text-[28px] font-semibold">{children}</h1>;
}

/** The Tasks cell: the bar (from `lg`) and `d of t`; `–` for an invalid change. */
export function TasksCell({ change }: { change: ActiveChange }) {
  if (change.status === "Invalid") return <span className="text-muted-foreground">–</span>;
  return (
    <span className="flex items-center gap-2.5 tabular-nums">
      <span className="hidden w-[90px] lg:block">
        <Bar done={change.tasks.done} total={change.tasks.total} />
      </span>
      {change.tasks.done} of {change.tasks.total}
    </span>
  );
}

/** A change's status badge; an invalid change's error is its title. */
export function StatusBadge({ change }: { change: Pick<ActiveChange, "status" | "error"> }) {
  return (
    <Badge variant={badgeVariant(change.status)} title={change.error ?? undefined}>
      {change.status}
    </Badge>
  );
}

const COLUMNS = "grid-cols-[minmax(0,1fr)_auto_auto] lg:grid-cols-[minmax(0,1fr)_minmax(0,200px)_160px_140px]";

function ActiveRow({ row, project }: { row: ChangeRow; project: string }) {
  return (
    <Link href={`/changes/${row.key}/${row.change.id}`} className={cn(ROW, COLUMNS)}>
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-semibold">{row.change.id}</span>
        {row.change.description !== null && <span className="truncate text-muted-foreground">{row.change.description}</span>}
      </span>
      <span className="hidden truncate text-muted-foreground lg:block" title={row.label}>
        {project}
      </span>
      <TasksCell change={row.change} />
      <span>
        <StatusBadge change={row.change} />
      </span>
    </Link>
  );
}

const ARCHIVED_COLUMNS = "grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_minmax(0,200px)_140px]";

function ArchivedTable({ rows, names }: { rows: ArchivedRow[]; names: Map<string, string> }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[16px] font-semibold">Archived</h2>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">No archived changes.</p>
      ) : (
        <div className="flex flex-col">
          <div className={cn(HEAD, ARCHIVED_COLUMNS)}>
            <span>Change</span>
            <span className="hidden lg:block">Project</span>
            <span>Archived on</span>
          </div>
          {rows.map((r) => (
            <Link key={`${r.key}/${r.archived.folder}`} href={`/archive/${r.key}/${r.archived.folder}`} className={cn(ROW, ARCHIVED_COLUMNS)}>
              <span className="truncate font-semibold">{r.archived.id ?? r.archived.folder}</span>
              <span className="hidden truncate text-muted-foreground lg:block" title={r.label}>
                {names.get(r.label) ?? r.label}
              </span>
              <span className="text-muted-foreground tabular-nums">{r.archived.date ?? ""}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

/** The value of the Status select's first item. */
const ALL_STATUSES = "";

/** The Changes page: the chosen project's active changes in one table, filtered by status, and the archived ones on demand. */
export function ChangesPage({ project }: { project: string }) {
  const query = useAllChanges();
  const [archived, setArchived] = useState(false);
  const [status, setStatus] = useState<Status | "">(ALL_STATUSES);
  const data = query.data;
  const projects = data?.projects ?? [];
  const rows = changesRows(projects, project, status);
  const names = projectNames(projects.map((p) => p.label));
  const items = [{ value: ALL_STATUSES, label: "All statuses" }, ...STATUSES.map((s) => ({ value: s, label: s }))];
  return (
    <main id="content" tabIndex={-1} className="flex w-full max-w-[1120px] flex-col gap-5 px-4 py-6 outline-none lg:px-8 lg:py-8">
      <Title>Changes</Title>
      <div className="flex flex-wrap items-center gap-4">
        <Select items={items} value={status} onValueChange={(v) => setStatus(typeof v === "string" ? (v as Status | "") : ALL_STATUSES)}>
          <SelectTrigger aria-label="Status" className="h-8 min-w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map((i) => (
              <SelectItem key={i.value} value={i.value}>
                {i.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-1.5 text-muted-foreground">
          <Checkbox checked={archived} onCheckedChange={(v) => setArchived(v === true)} />
          Archived
        </label>
      </div>
      {data === undefined ? (
        <Empty error={query.isError}>{query.isError ? query.error.message : "Loading…"}</Empty>
      ) : (
        <>
          {rows.length === 0 ? (
            <p className="text-muted-foreground">No changes.</p>
          ) : (
            <div className="flex flex-col">
              <div className={cn(HEAD, COLUMNS)}>
                <span>Change</span>
                <span className="hidden lg:block">Project</span>
                <span>Tasks</span>
                <span>Status</span>
              </div>
              {rows.map((r) => (
                <ActiveRow key={`${r.key}/${r.change.id}`} row={r} project={names.get(r.label) ?? r.label} />
              ))}
              <p className="px-2 pt-3 text-[12px] text-muted-foreground">{plural(rows.length, "change", "changes")}</p>
            </div>
          )}
          {archived && <ArchivedTable rows={archivedRows(projects, project)} names={names} />}
        </>
      )}
    </main>
  );
}
