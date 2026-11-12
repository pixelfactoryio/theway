import { cn } from "cn";
import { ChevronDownIcon, ChevronRightIcon, Search, X } from "lucide-react";
import { type ReactNode, useRef } from "react";
import { Link } from "wouter";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/reui/badge";
import { Empty } from "@/components/state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAllChanges } from "@/lib/api";
import {
  activeCount,
  archivedRows,
  badgeVariant,
  type ChangeEntry,
  type ChangeRow,
  type ChangesTab,
  changeEntries,
  type Project,
  plural,
  TABS,
  tabCounts,
} from "@/lib/changes";
import { projectNames } from "@/lib/labels";
import type { ActiveChange } from "../../types";

/** A table's header cells and rows: the grid of its columns, the Project column dropped below `lg`. */
export const HEAD = "grid items-end gap-x-6 border-b border-divider px-2 pb-2 text-[12px] font-medium text-muted-foreground";
export const ROW = "grid items-center gap-x-6 border-b border-divider-row px-2 py-2 hover:bg-accent pointer-coarse:min-h-10";

/**
 * The Changes page's state, kept by the app between pages: the tab, the search as typed, and the open series, each as
 * `<project key>/<series id>`.
 */
export type ChangesView = { tab: ChangesTab; search: string; open: ReadonlySet<string> };

/** The Tasks cell: `d of t`; `–` for an invalid change. */
function TasksCell({ change }: { change: ActiveChange }) {
  if (change.status === "Invalid") return <span className="text-muted-foreground">–</span>;
  return (
    <span className="tabular-nums">
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

const COLUMNS = "items-start grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_minmax(0,200px)_96px_140px]";

/** The Tasks and Status cells: from `lg` two cells, below it one, Tasks over Status at the right. */
function Trailing({ tasks, status }: { tasks: ReactNode; status: ReactNode }) {
  return (
    <span className="flex flex-col items-end gap-1 lg:contents">
      <span>{tasks}</span>
      <span>{status}</span>
    </span>
  );
}

/** A change's row: a link to it; a member of an open series is indented under the series ID, without its project. */
function ChangeLink({ row, name, member }: { row: ChangeRow; name: string; member: "no" | "inner" | "last" }) {
  return (
    <Link
      href={`/changes/${row.key}/${row.change.id}`}
      className={cn(ROW, COLUMNS, member !== "no" && "py-1.5", member === "inner" && "border-b-0")}
    >
      <span className={cn("min-w-0 wrap-anywhere", member !== "no" && "pl-5")}>
        <span className={member === "no" ? "font-semibold" : "font-medium"}>{row.change.id}</span>
        {member === "no" && row.series !== null && (
          <span className="text-muted-foreground">
            {" "}
            · {row.series.ordinal} of {row.series.total} in its series
          </span>
        )}
        {row.change.description !== null && <span className="block text-muted-foreground lg:ml-2.5 lg:inline">{row.change.description}</span>}
      </span>
      {member === "no" ? (
        <span className="hidden wrap-anywhere text-muted-foreground lg:block" title={row.label}>
          {name}
        </span>
      ) : (
        <span className="hidden lg:block" />
      )}
      <Trailing tasks={<TasksCell change={row.change} />} status={<StatusBadge change={row.change} />} />
    </Link>
  );
}

type SeriesEntry = Extract<ChangeEntry, { kind: "series" }>;

/**
 * A series' row, then its members while it is open: a button that opens and closes it, or, under a search, a row that
 * stays open.
 */
function SeriesRows({
  entry,
  name,
  open,
  searching,
  onToggle,
}: {
  entry: SeriesEntry;
  name: string;
  open: boolean;
  searching: boolean;
  onToggle: () => void;
}) {
  const shown = searching || open;
  const Chevron = shown ? ChevronDownIcon : ChevronRightIcon;
  const count = `${entry.members.length} changes`;
  const cells = (
    <>
      <span className="flex min-w-0 items-start gap-1.5">
        <Chevron aria-hidden="true" className="mt-[3px] size-3.5 flex-none text-muted-foreground" />
        <span className="min-w-0 wrap-anywhere">
          <span className="font-semibold">{entry.id}</span>
          <span className="hidden text-muted-foreground lg:ml-2.5 lg:inline">{count}</span>
          <span className="block text-muted-foreground lg:hidden">
            {count} · {name}
          </span>
        </span>
      </span>
      <span className="hidden wrap-anywhere text-muted-foreground lg:block" title={entry.label}>
        {name}
      </span>
      <Trailing
        tasks={
          entry.tasks === null ? (
            <span className="text-muted-foreground">–</span>
          ) : (
            <span className="tabular-nums">
              {entry.tasks.done} of {entry.tasks.total}
            </span>
          )
        }
        status={<Badge variant={badgeVariant(entry.status)}>{entry.status}</Badge>}
      />
    </>
  );
  return (
    <>
      {searching ? (
        <div className={cn(ROW, COLUMNS)}>{cells}</div>
      ) : (
        <button type="button" aria-expanded={open} onClick={onToggle} className={cn(ROW, COLUMNS, "w-full text-left")}>
          {cells}
        </button>
      )}
      {shown &&
        entry.members.map((row, i) => (
          <ChangeLink key={row.change.id} row={row} name={name} member={i === entry.members.length - 1 ? "last" : "inner"} />
        ))}
    </>
  );
}

const ARCHIVED_COLUMNS = "grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_minmax(0,200px)_140px]";

/** The text under a tab's list: its count, and while searching the count without the search; the empty text when it lists nothing. */
function Under({ n, m, query, rows }: { n: number; m: number; query: string; rows: boolean }) {
  if (!rows) return <p className="py-3 text-muted-foreground">{query === "" ? "No changes." : `No change matches "${query}".`}</p>;
  return <p className="px-2 pt-3 text-[12px] text-muted-foreground">{query === "" ? plural(n, "change", "changes") : `${n} of ${plural(m, "change", "changes")}`}</p>;
}

/** The Archived tab: the matching archived changes, newest first. */
function ArchivedList({ projects, project, view, names, n, m }: ListProps) {
  const rows = archivedRows(projects, project, view.search, names);
  const query = view.search.trim();
  return (
    <div className="flex flex-col">
      {rows.length > 0 && (
        <>
          <div className={cn(HEAD, ARCHIVED_COLUMNS)}>
            <span>Change</span>
            <span className="hidden lg:block">Project</span>
            <span>Archived on</span>
          </div>
          {rows.map((r) => (
            <Link key={`${r.key}/${r.archived.folder}`} href={`/archive/${r.key}/${r.archived.folder}`} className={cn(ROW, ARCHIVED_COLUMNS)}>
              <span className="wrap-anywhere font-semibold">{r.archived.id ?? r.archived.folder}</span>
              <span className="hidden wrap-anywhere text-muted-foreground lg:block" title={r.label}>
                {names.get(r.label) ?? r.label}
              </span>
              <span className="text-muted-foreground tabular-nums">{r.archived.date ?? ""}</span>
            </Link>
          ))}
        </>
      )}
      <Under n={n} m={m} query={query} rows={rows.length > 0} />
    </div>
  );
}

type ListProps = {
  projects: readonly Project[];
  project: string;
  view: ChangesView;
  setView: (view: ChangesView) => void;
  names: ReadonlyMap<string, string>;
  n: number;
  m: number;
};

/** A status tab or All: its changes and series, then the text under the list. */
function ActiveList({ projects, project, view, setView, names, n, m, tab }: ListProps & { tab: Exclude<ChangesTab, "Archived"> }) {
  const entries = changeEntries(projects, project, tab, view.search, names);
  const query = view.search.trim();
  const toggle = (id: string) => {
    const open = new Set(view.open);
    if (open.has(id)) open.delete(id);
    else open.add(id);
    setView({ ...view, open });
  };
  return (
    <div className="flex flex-col">
      {entries.length > 0 && (
        <>
          <div className={cn(HEAD, COLUMNS, "items-end")}>
            <span>Change</span>
            <span className="hidden lg:block">Project</span>
            <span className="hidden lg:block">Tasks</span>
            <span className="hidden lg:block">Status</span>
          </div>
          {entries.map((e) => {
            if (e.kind === "change") return <ChangeLink key={`${e.row.key}/${e.row.change.id}`} row={e.row} name={names.get(e.row.label) ?? e.row.label} member="no" />;
            const id = `${e.key}/${e.id}`;
            return (
              <SeriesRows
                key={`s/${id}`}
                entry={e}
                name={names.get(e.label) ?? e.label}
                open={view.open.has(id)}
                searching={query !== ""}
                onToggle={() => toggle(id)}
              />
            );
          })}
        </>
      )}
      <Under n={n} m={m} query={query} rows={entries.length > 0} />
    </div>
  );
}

/** The search box: the icon and the text, then Clear search while there is text. */
function SearchBox({ view, setView }: { view: ChangesView; setView: (view: ChangesView) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex h-8 items-center gap-1.5 rounded-md border border-input bg-card pl-2.5 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 pointer-coarse:h-10 lg:mb-1.5 lg:w-[260px] lg:flex-none">
      <label className="flex min-w-0 flex-1 items-center gap-1.5 self-stretch">
        <Search aria-hidden="true" className="size-3.5 flex-none text-muted-foreground" />
        <input
          ref={input}
          type="text"
          aria-label="Search changes"
          placeholder="Search changes"
          value={view.search}
          onChange={(e) => setView({ ...view, search: e.target.value })}
          className="h-full min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
        />
      </label>
      {view.search !== "" && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setView({ ...view, search: "" });
            input.current?.focus();
          }}
          className="flex size-7 flex-none items-center justify-center rounded-md text-muted-foreground hover:text-foreground pointer-coarse:size-10"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/**
 * The Changes page: a tab per status with its count, All and Archived, and the search; a tab lists its changes, a series
 * as one row that opens to all its members.
 */
export function ChangesPage({ project, view, setView }: { project: string; view: ChangesView; setView: (view: ChangesView) => void }) {
  const query = useAllChanges();
  const data = query.data;
  const projects = data?.projects ?? [];
  const names = projectNames(projects.map((p) => p.label));
  const counts = tabCounts(projects, project, view.search, names);
  const totals = tabCounts(projects, project, "", names);
  return (
    <main id="content" tabIndex={-1} className="flex w-full max-w-[1120px] flex-col gap-5 px-4 py-6 outline-none lg:px-8 lg:py-8">
      <PageHeader title="Changes" count={data === undefined ? undefined : activeCount(projects, project)} purpose="Each change, with its spec and its tasks." />
      {data === undefined ? (
        <Empty error={query.isError}>{query.isError ? query.error.message : "Loading…"}</Empty>
      ) : (
        <Tabs value={view.tab} onValueChange={(v) => setView({ ...view, tab: v as ChangesTab })} className="gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-6 lg:border-b lg:border-divider">
            <SearchBox view={view} setView={setView} />
            <TabsList variant="line" className="w-full justify-start overflow-x-auto lg:order-first lg:w-auto lg:min-w-0 lg:border-b-0">
              {TABS.map((t) => (
                <TabsTrigger key={t} value={t} aria-label={`${t} ${counts[t]}`}>
                  {t}
                  {t === "Invalid" && counts[t] > 0 ? (
                    <Badge variant="destructive-light">{counts[t]}</Badge>
                  ) : (
                    <span className="font-normal tabular-nums">{counts[t]}</span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {TABS.map((t) => (
            <TabsContent key={t} value={t}>
              {t === "Archived" ? (
                <ArchivedList projects={projects} project={project} view={view} setView={setView} names={names} n={counts[t]} m={totals[t]} />
              ) : (
                <ActiveList projects={projects} project={project} view={view} setView={setView} names={names} n={counts[t]} m={totals[t]} tab={t} />
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </main>
  );
}
