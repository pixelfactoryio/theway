import { useState } from "react";
import { Link } from "wouter";
import { Bar, Empty } from "@/components/state";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAllChanges } from "@/lib/api";
import { type Row, rowsOf } from "@/lib/series";
import type { ActiveChange, AllChangesResponse, ArchivedChange } from "../../types";

type Project = AllChangesResponse["projects"][number];

/** The value of the Select's first item. */
const ALL = "";

/** The three columns of a row: the name, the bar and the count. */
const ROW = "grid grid-cols-[minmax(0,1fr)_160px_170px] items-center gap-6 border-t py-[11px]";

/** The count text: `<done> of <total> tasks`, or `no tasks`. */
const taskCount = (c: ActiveChange): string => (c.tasks.total === 0 ? "no tasks" : `${c.tasks.done} of ${c.tasks.total} tasks`);

function ChangeRow({ projectKey, change, indent = false }: { projectKey: string; change: ActiveChange; indent?: boolean }) {
  return (
    <Link href={`/changes/${projectKey}/${change.id}`} className={`${ROW} ${indent ? "pl-6" : ""} hover:bg-accent`}>
      <span className="truncate font-mono text-[13px]">{change.id}</span>
      <Bar done={change.tasks.done} total={change.tasks.total} />
      <span className="text-right text-muted-foreground tabular-nums">{taskCount(change)}</span>
    </Link>
  );
}

/** A series row: a button that shows or hides its active members beneath it. */
function SeriesRow({ projectKey, row }: { projectKey: string; row: Extract<Row, { kind: "series" }> }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className={`${ROW} w-full text-left hover:bg-accent`}>
        <span className="truncate">
          <span className="font-mono text-[13px]">{row.id}</span> <span className="text-muted-foreground">· {row.total} changes</span>
        </span>
        <Bar done={row.done} total={row.total} />
        <span className="text-right text-muted-foreground tabular-nums">
          {row.done} of {row.total} done
        </span>
      </button>
      {open && row.members.map((m) => <ChangeRow key={m.id} projectKey={projectKey} change={m} indent />)}
    </>
  );
}

function ArchivedRow({ projectKey, archived }: { projectKey: string; archived: ArchivedChange }) {
  return (
    <Link href={`/archive/${projectKey}/${archived.folder}`} className={`${ROW} hover:bg-accent`}>
      <span className="truncate font-mono text-[13px]">{archived.id ?? archived.folder}</span>
      <span />
      <span className="text-right text-muted-foreground tabular-nums">{archived.date ?? ""}</span>
    </Link>
  );
}

function Section({ project, showArchived }: { project: Project; showArchived: boolean }) {
  const rows = rowsOf(project.active, project.series);
  return (
    <section className="flex flex-col">
      <h2 className="mb-1.5 text-[12px] font-medium text-muted-foreground">{project.label}</h2>
      <div className="flex flex-col border-b">
        {rows.map((row) =>
          row.kind === "series" ? (
            <SeriesRow key={`s:${row.id}`} projectKey={project.key} row={row} />
          ) : (
            <ChangeRow key={`c:${row.id}`} projectKey={project.key} change={row.change} />
          ),
        )}
        {showArchived && project.archived.map((a) => <ArchivedRow key={`a:${a.folder}`} projectKey={project.key} archived={a} />)}
      </div>
    </section>
  );
}

/** The Changes page: every project's active changes, one section per project, and the archived ones on demand. */
export function ChangesPage() {
  const query = useAllChanges();
  const [archived, setArchived] = useState(false);
  const [selected, setSelected] = useState<string>(ALL);
  const data = query.data;
  const projects = data?.projects ?? [];
  const shown = projects.filter((p) => (selected === ALL || p.key === selected) && (p.active.length > 0 || (archived && p.archived.length > 0)));
  const others = data === undefined ? 0 : data.total - projects.filter((p) => p.active.length > 0).length;
  const items = [{ value: ALL, label: "All projects" }, ...projects.map((p) => ({ value: p.key, label: p.label }))];
  return (
    <main className="mx-auto flex w-full max-w-[1120px] flex-col gap-5 px-6 py-6">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-[20px] font-semibold">Changes</h1>
        <span className="ml-auto flex items-center gap-4">
          <label className="flex items-center gap-1.5 text-muted-foreground">
            <Checkbox checked={archived} onCheckedChange={(v) => setArchived(v === true)} />
            Archived
          </label>
          <Select items={items} value={selected} onValueChange={(v) => setSelected(typeof v === "string" ? v : ALL)}>
            <SelectTrigger aria-label="Project" className="h-8 min-w-40">
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
        </span>
      </div>
      {data === undefined ? (
        <Empty error={query.isError}>{query.isError ? query.error.message : "Loading…"}</Empty>
      ) : shown.length === 0 ? (
        <Empty>No active changes</Empty>
      ) : (
        shown.map((p) => <Section key={p.key} project={p} showArchived={archived} />)
      )}
      {data !== undefined && others > 0 && !archived && selected === ALL && (
        <p className="text-[12px] text-muted-foreground">{others} other projects have no active changes.</p>
      )}
    </main>
  );
}
