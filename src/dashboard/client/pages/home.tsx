import { cn } from "cn";
import { Link } from "wouter";
import { Empty } from "@/components/state";
import { useAllChanges, useFiles } from "@/lib/api";
import { activeCount, homeRows, notices, plural } from "@/lib/changes";
import { projectNames } from "@/lib/labels";
import { HEAD, ROW, TasksCell, Title } from "@/pages/changes";

const COLUMNS = "grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_minmax(0,200px)_160px]";

/** Home: what needs attention in the chosen project, and its changes in progress. */
export function HomePage({ project }: { project: string }) {
  const query = useAllChanges();
  const files = useFiles();
  const data = query.data;
  const projects = data?.projects ?? [];
  const rows = homeRows(projects, project);
  const names = projectNames(projects.map((p) => p.label));
  const shown = data === undefined || files.data === undefined ? [] : notices(projects, files.data.workflows, project);
  return (
    <main id="content" tabIndex={-1} className="flex w-full max-w-[1120px] flex-col gap-5 px-4 py-6 outline-none lg:px-8 lg:py-8">
      <Title>Home</Title>
      {shown.map((n) => (
        <p key={n.href} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-warning/10 px-3 py-2.5 text-warning-foreground">
          <span className="mr-auto font-medium">{n.text}</span>
          <Link href={n.href} className="underline underline-offset-2">
            {n.link}
          </Link>
        </p>
      ))}
      {data === undefined ? (
        <Empty error={query.isError}>{query.isError ? query.error.message : "Loading…"}</Empty>
      ) : (
        <section className="flex flex-col gap-2">
          <h2 className="text-[16px] font-semibold">In progress</h2>
          {rows.length === 0 ? (
            <p className="text-muted-foreground">Nothing in progress.</p>
          ) : (
            <div className="flex flex-col">
              <div className={cn(HEAD, COLUMNS)}>
                <span>Change</span>
                <span className="hidden lg:block">Project</span>
                <span>Tasks</span>
              </div>
              {rows.map((r) => (
                <Link key={`${r.key}/${r.change.id}`} href={`/changes/${r.key}/${r.change.id}`} className={cn(ROW, COLUMNS)}>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">
                      <span className="font-semibold">{r.change.id}</span>
                      {r.series !== null && (
                        <span className="text-muted-foreground">
                          {" "}
                          · {r.series.ordinal} of {r.series.total} in its series
                        </span>
                      )}
                    </span>
                    {r.change.description !== null && <span className="truncate text-muted-foreground">{r.change.description}</span>}
                  </span>
                  <span className="hidden truncate text-muted-foreground lg:block" title={r.label}>
                    {names.get(r.label) ?? r.label}
                  </span>
                  <TasksCell change={r.change} />
                </Link>
              ))}
            </div>
          )}
          <Link href="/changes" className="self-start px-2 pt-1 text-[12px] text-primary hover:underline">
            See all {plural(activeCount(projects, project), "change", "changes")}
          </Link>
        </section>
      )}
    </main>
  );
}
