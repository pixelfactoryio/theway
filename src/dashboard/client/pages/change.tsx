import type { UseQueryResult } from "@tanstack/react-query";
import { Link } from "wouter";
import { Empty, PageHeader, TaskBar } from "@/components/state";
import { Separator } from "@/components/ui/separator";
import { useArchived, useChange } from "@/lib/api";
import { useLabel } from "@/lib/projects";
import type { ChangeDetail } from "../../types";

/** A change's detail, active or archived (`id` is then the archive folder). */
export function ChangePage({ projectKey, id, archived }: { projectKey: string; id: string; archived: boolean }) {
  return archived ? <ArchivedDetail projectKey={projectKey} folder={id} /> : <ActiveDetail projectKey={projectKey} id={id} />;
}

function ActiveDetail({ projectKey, id }: { projectKey: string; id: string }) {
  return <Detail projectKey={projectKey} id={id} archived={false} query={useChange(projectKey, id)} />;
}

function ArchivedDetail({ projectKey, folder }: { projectKey: string; folder: string }) {
  return <Detail projectKey={projectKey} id={folder} archived={true} query={useArchived(projectKey, folder)} />;
}

/** The progress line, then each Markdown file rendered under its name. */
function Detail({ projectKey, id, archived, query }: { projectKey: string; id: string; archived: boolean; query: UseQueryResult<ChangeDetail> }) {
  const label = useLabel(projectKey);
  const data = query.data;
  return (
    <>
      <PageHeader
        project={label}
        crumbs={
          <>
            <Link href={`/p/${projectKey}/changes`} className="font-normal text-muted-foreground hover:underline">
              Changes
            </Link>
            <span className="px-2 text-muted-foreground/60">/</span>
            <span className="font-mono">{data?.id ?? id}</span>
            {archived && <span className="ml-2 text-muted-foreground">(archived)</span>}
          </>
        }
      />
      {data === undefined ? (
        <Empty error={query.isError}>{query.isError ? query.error.message : "Loading…"}</Empty>
      ) : (
        <main className="flex max-w-4xl flex-col gap-6 p-6">
          <div className="flex items-center gap-3">
            <TaskBar tasks={data.tasks} className="w-60" />
            <span className="text-muted-foreground tabular-nums">
              {data.tasks.done}/{data.tasks.total} tasks done
            </span>
          </div>
          {data.files.map((f, i) => (
            <section key={f.name} className="flex flex-col gap-2">
              {i > 0 && <Separator className="mb-4" />}
              <h2 className="font-mono text-[12px] text-muted-foreground">{f.name}</h2>
              {/* Rendered on the server with raw HTML escaped; the CSP is the second layer. */}
              <div className="markdown" dangerouslySetInnerHTML={{ __html: f.html }} />
            </section>
          ))}
        </main>
      )}
    </>
  );
}
