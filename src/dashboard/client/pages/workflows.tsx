/** The Workflows page: Create workflow, then the workflows of the chosen project as a table, each row a link to its page. */
import { cn } from "cn";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/reui/badge";
import { Empty } from "@/components/state";
import { Button } from "@/components/ui/button";
import { isDirty } from "@/files/draft";
import { useDrafts } from "@/files/drafts";
import { NewDialog } from "@/files/NewDialog";
import { workflowSource } from "@/files/source";
import { fileHref, fileKey, useFiles } from "@/lib/api";
import { plural } from "@/lib/changes";
import { projectNames } from "@/lib/labels";
import { appliesText, nameTag, overridersOf } from "@/lib/prompts";
import { newWorkflowItem, runsOnText, workflowRows } from "@/lib/workflows";
import type { WorkflowItem } from "../../types";
import { HEAD, ROW } from "./changes";

/** The columns: below `lg`, Name and Steps. */
const COLUMNS = "grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,200px)_minmax(0,1fr)_60px_minmax(0,160px)_minmax(0,160px)]";

/** A row: the whole row links to the workflow's page. `rows` are the table's rows, `all` every workflow of the files list. */
function Row({
  item,
  edited,
  names,
  rows,
  all,
}: {
  item: WorkflowItem;
  edited: boolean;
  names: ReadonlyMap<string, string>;
  rows: readonly WorkflowItem[];
  all: readonly WorkflowItem[];
}) {
  const none = <span className="text-muted-foreground">–</span>;
  const tag = nameTag(item, rows, names);
  const overriddenBy = overridersOf(item, all);
  const overrides = item.scope === "project" && all.some((o) => o.scope === "global" && o.name === item.name);
  return (
    <Link href={fileHref(item)} className={cn(ROW, COLUMNS)}>
      <span className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="wrap-anywhere font-semibold">
          {item.name}
          {tag !== null && (
            <>
              {" "}
              <span className="font-normal text-muted-foreground" title={item.label ?? item.key ?? undefined}>
                ({tag})
              </span>
            </>
          )}
        </span>
        {item.default && <Badge variant="secondary">default</Badge>}
        {item.errors > 0 && (
          <Badge variant="destructive" title={item.error ?? undefined}>
            {plural(item.errors, "error", "errors")}
          </Badge>
        )}
        {edited && <Badge variant="warning-light">edited</Badge>}
      </span>
      <span className="hidden wrap-anywhere text-muted-foreground lg:block">{item.description ?? ""}</span>
      <span>{item.steps === null ? none : item.steps}</span>
      <span className="hidden wrap-anywhere lg:block">{item.runsOn === null ? none : runsOnText(item.runsOn)}</span>
      <span className="hidden wrap-anywhere text-muted-foreground lg:block" title={appliesText(item, overriddenBy, overrides)}>
        {appliesText(item, overriddenBy, overrides, names)}
      </span>
    </Link>
  );
}

/** The Workflows page: the global workflows and the chosen project's, with the new files not saved yet. */
export function WorkflowsPage({ project }: { project: string }) {
  const files = useFiles();
  const { drafts } = useDrafts();
  const [creating, setCreating] = useState(false);
  const labels = new Map((files.data?.projects ?? []).map((p) => [p.key, p.label]));
  const names = projectNames((files.data?.projects ?? []).map((p) => p.label));
  const fresh = [...drafts.values()]
    .filter((e) => e.draft.isNew && e.file.kind === "workflows")
    .map((e) => {
      const source = workflowSource(e.draft.text);
      const description = "error" in source || source.description === "" ? null : source.description;
      return newWorkflowItem(e.file, e.file.key === null ? null : (labels.get(e.file.key) ?? null), description);
    });
  const rows = workflowRows(files.data?.workflows ?? [], fresh, project);
  const edited = (item: WorkflowItem) => {
    const d = drafts.get(fileKey(item))?.draft;
    return d !== undefined && isDirty(d);
  };
  return (
    <main id="content" tabIndex={-1} className="flex w-full max-w-[1120px] flex-col gap-5 px-4 py-6 outline-none lg:px-8 lg:py-8">
      <PageHeader title="Workflows" count={files.data === undefined ? undefined : rows.length} purpose="The steps a change runs through.">
        <Button onClick={() => setCreating(true)}>
          <Plus /> Create workflow
        </Button>
      </PageHeader>
      {files.data === undefined ? (
        <Empty error={files.isError}>{files.isError ? files.error.message : "Loading…"}</Empty>
      ) : (
        <div className="flex flex-col">
          <div className={cn(HEAD, COLUMNS)}>
            <span>Name</span>
            <span className="hidden lg:block">What it does</span>
            <span>Steps</span>
            <span className="hidden lg:block">Runs on</span>
            <span className="hidden lg:block">Applies to</span>
          </div>
          {rows.map((item) => (
            <Row key={fileKey(item)} item={item} edited={edited(item)} names={names} rows={rows} all={files.data?.workflows ?? []} />
          ))}
        </div>
      )}
      <NewDialog kind={creating ? "workflows" : null} project={project} onClose={() => setCreating(false)} />
    </main>
  );
}
