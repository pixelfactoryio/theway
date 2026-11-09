import type { UseQueryResult } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "wouter";
import { Empty } from "@/components/state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAllChanges, useArchived, useChange } from "@/lib/api";
import type { ChangeDetail } from "../../types";

/** A change's page, active or archived (`id` is then the archive folder). */
export function ChangePage({ projectKey, id, archived }: { projectKey: string; id: string; archived: boolean }) {
  return archived ? <ArchivedDetail projectKey={projectKey} folder={id} /> : <ActiveDetail projectKey={projectKey} id={id} />;
}

function ActiveDetail({ projectKey, id }: { projectKey: string; id: string }) {
  return <Detail projectKey={projectKey} id={id} archived={false} query={useChange(projectKey, id)} />;
}

function ArchivedDetail({ projectKey, folder }: { projectKey: string; folder: string }) {
  return <Detail projectKey={projectKey} id={folder} archived={true} query={useArchived(projectKey, folder)} />;
}

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The tab name of a change file: Spec, Tasks, or the file name. */
const tabName = (file: string): string => (file === "spec.md" ? "Spec" : file === "tasks.md" ? "Tasks" : file);

/** The files in tab order: `spec.md`, `tasks.md`, then the others by name. */
function ordered(files: ChangeDetail["files"]): ChangeDetail["files"] {
  const first = ["spec.md", "tasks.md"].flatMap((n) => files.filter((f) => f.name === n));
  return [...first, ...files.filter((f) => !first.includes(f)).sort((a, b) => byText(a.name, b.name))];
}

/** The link text of a PR URL: `PR #<n>` when its last path segment is digits, else `PR`. */
function prText(url: string): string {
  const last = url.replace(/\/+$/, "").split("/").pop() ?? "";
  return /^[0-9]+$/.test(last) ? `PR #${last}` : "PR";
}

/** `Series` and one two-digit ordinal per number up to the total: the current one marked, members linked. */
function SeriesFacts({ projectKey, series }: { projectKey: string; series: NonNullable<ChangeDetail["properties"]["series"]> }) {
  const ordinals = Array.from({ length: series.total }, (_, i) => i + 1);
  return (
    <span className="flex flex-wrap gap-2.5">
      Series
      {ordinals.map((n) => {
        const text = String(n).padStart(2, "0");
        if (n === series.ordinal) {
          return (
            <span key={n} aria-current="page" className="font-semibold text-foreground underline">
              {text}
            </span>
          );
        }
        const member = series.members.find((m) => m.ordinal === n);
        if (member === undefined) return <span key={n}>{text}</span>;
        const href = member.folder === null ? `/changes/${projectKey}/${member.id}` : `/archive/${projectKey}/${member.folder}`;
        return (
          <Link key={n} href={href} className="text-foreground hover:underline">
            {text}
          </Link>
        );
      })}
    </span>
  );
}

/** The breadcrumb, the title, the facts line, then one tab per file. */
function Detail({ projectKey, id, archived, query }: { projectKey: string; id: string; archived: boolean; query: UseQueryResult<ChangeDetail> }) {
  const all = useAllChanges();
  const label = all.data?.projects.find((p) => p.key === projectKey)?.label ?? projectKey;
  const data = query.data;
  const files = data === undefined ? [] : ordered(data.files);
  const [tab, setTab] = useState<string | null>(null);
  const current = files.find((f) => f.name === tab) ?? files[0];
  return (
    <main className="mx-auto flex w-full max-w-[1120px] flex-col gap-4 px-6 py-6">
      <div className="text-muted-foreground">
        <Link href="/changes" className="hover:underline">
          Changes
        </Link>{" "}
        / {label}
        {archived && " · archived"}
      </div>
      {data === undefined ? (
        <Empty error={query.isError}>{query.isError ? query.error.message : "Loading…"}</Empty>
      ) : (
        <>
          <h1 className="font-mono text-[20px] font-medium">{data.id}</h1>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-muted-foreground">
            {data.tasks.total > 0 && (
              <span className="tabular-nums">
                {data.tasks.done} of {data.tasks.total} tasks
              </span>
            )}
            {data.properties.pr !== null && (
              <a href={data.properties.pr} target="_blank" rel="noopener noreferrer" className="text-foreground underline">
                {prText(data.properties.pr)}
              </a>
            )}
            {data.properties.series !== null && <SeriesFacts projectKey={projectKey} series={data.properties.series} />}
          </div>
          {current !== undefined && (
            <Tabs value={current.name} onValueChange={(v) => setTab(String(v))} className="gap-4">
              <TabsList variant="line" className="h-auto w-full justify-start gap-6 rounded-none border-b p-0">
                {files.map((f) => (
                  <TabsTrigger
                    key={f.name}
                    value={f.name}
                    className="flex-none rounded-none border-0 border-b-2 border-transparent px-0 py-2 font-normal text-muted-foreground after:hidden data-active:border-foreground data-active:text-foreground"
                  >
                    {tabName(f.name)}
                  </TabsTrigger>
                ))}
              </TabsList>
              {files.map((f) => (
                <TabsContent key={f.name} value={f.name}>
                  {/* Rendered on the server with raw HTML escaped; the CSP is the second layer. */}
                  <div className="markdown max-w-[720px]" dangerouslySetInnerHTML={{ __html: f.html }} />
                </TabsContent>
              ))}
            </Tabs>
          )}
        </>
      )}
    </main>
  );
}
