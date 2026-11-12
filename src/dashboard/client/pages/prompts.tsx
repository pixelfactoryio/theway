import { cn } from "cn";
import { Plus } from "lucide-react";
import { Fragment, useState } from "react";
import { Link } from "wouter";
import { Badge } from "@/components/reui/badge";
import { Empty } from "@/components/state";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isDirty } from "@/files/draft";
import { useDrafts } from "@/files/drafts";
import { NewDialog } from "@/files/NewDialog";
import { fileHref, fileKey, useFiles } from "@/lib/api";
import { projectNames } from "@/lib/labels";
import { appliesText, nameTag, overridersOf, promptRows, userName } from "@/lib/prompts";
import type { PromptItem } from "../../types";
import { HEAD, ROW } from "./changes";

/** The columns of each tab: below `lg`, Name and Model for the step prompts, Name alone for the reference files. */
const STEP_COLUMNS = "grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,160px)_minmax(0,1fr)_80px_minmax(0,180px)_minmax(0,140px)]";
const REFERENCE_COLUMNS = "grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,240px)_minmax(0,160px)]";

/** The Used by cell: each workflow's `userName`, a link to its page, comma-separated; `–` for none. */
function UsedByCell({ item, names }: { item: PromptItem; names: ReadonlyMap<string, string> }) {
  if (item.usedBy.length === 0) return <span className="hidden text-muted-foreground lg:block">–</span>;
  return (
    <span className="hidden min-w-0 truncate lg:block">
      {item.usedBy.map((u, i) => (
        <Fragment key={`${u.scope}/${u.key ?? ""}/${u.name}`}>
          {i > 0 && ", "}
          <Link
            href={fileHref({ scope: u.scope, key: u.key, kind: "workflows", name: u.name })}
            title={u.scope === "project" ? (u.label ?? u.key ?? undefined) : undefined}
            className="relative z-10 font-medium text-primary hover:underline"
          >
            {userName(u, item.usedBy, names)}
          </Link>
        </Fragment>
      ))}
    </span>
  );
}

/**
 * A row: the whole row links to the prompt's page; the Used by links sit above that link. `rows` are the tab's rows,
 * `all` every prompt of the files list.
 */
function Row({
  item,
  step,
  edited,
  names,
  rows,
  all,
}: {
  item: PromptItem;
  step: boolean;
  edited: boolean;
  names: ReadonlyMap<string, string>;
  rows: readonly PromptItem[];
  all: readonly PromptItem[];
}) {
  const tag = nameTag(item, rows, names);
  const overriddenBy = overridersOf(item, all);
  const overrides = item.scope === "project" && all.some((o) => o.scope === "global" && o.name === item.name);
  return (
    <div className={cn(ROW, "relative", step ? STEP_COLUMNS : REFERENCE_COLUMNS)}>
      <span className="flex min-w-0 items-center gap-1.5">
        <Link href={fileHref(item)} className="truncate font-semibold after:absolute after:inset-0">
          {item.name}
          {tag !== null && (
            <>
              {" "}
              <span className="font-normal text-muted-foreground" title={item.label ?? item.key ?? undefined}>
                ({tag})
              </span>
            </>
          )}
        </Link>
        {edited && <Badge variant="warning-light">edited</Badge>}
        {item.error !== null && (
          <Badge variant="destructive" title={item.error}>
            error
          </Badge>
        )}
      </span>
      {step && <span className="hidden truncate text-muted-foreground lg:block">{item.description ?? ""}</span>}
      {step && <span className={item.model === null ? "text-muted-foreground" : undefined}>{item.model ?? "–"}</span>}
      <UsedByCell item={item} names={names} />
      <span className="hidden truncate text-muted-foreground lg:block" title={appliesText(item, overriddenBy, overrides)}>
        {appliesText(item, overriddenBy, overrides, names)}
      </span>
    </div>
  );
}

/** A tab's table: its header cells, then its rows. */
function Table({ rows, all, step, names }: { rows: PromptItem[]; all: readonly PromptItem[]; step: boolean; names: ReadonlyMap<string, string> }) {
  const { drafts } = useDrafts();
  const edited = (item: PromptItem) => {
    const d = drafts.get(fileKey(item))?.draft;
    return d !== undefined && isDirty(d);
  };
  if (rows.length === 0) return <p className="py-3 text-muted-foreground">{step ? "No step prompts." : "No reference files."}</p>;
  return (
    <div className="flex flex-col">
      <div className={cn(HEAD, step ? STEP_COLUMNS : REFERENCE_COLUMNS)}>
        <span>Name</span>
        {step && <span className="hidden lg:block">What it tells the agent to do</span>}
        {step && <span>Model</span>}
        <span className="hidden lg:block">Used by</span>
        <span className="hidden lg:block">Applies to</span>
      </div>
      {rows.map((item) => (
        <Row key={fileKey(item)} item={item} step={step} edited={edited(item)} names={names} rows={rows} all={all} />
      ))}
    </div>
  );
}

/** The Prompts page: Create prompt, then the step prompts and the reference files of the chosen project, one tab each. */
export function PromptsPage({ project }: { project: string }) {
  const files = useFiles();
  const [creating, setCreating] = useState(false);
  const prompts = files.data?.prompts ?? [];
  const steps = promptRows(prompts, project, true);
  const references = promptRows(prompts, project, false);
  const names = projectNames((files.data?.projects ?? []).map((p) => p.label));
  return (
    <main id="content" tabIndex={-1} className="flex w-full max-w-[1120px] flex-col gap-5 px-4 py-6 outline-none lg:px-8 lg:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[28px] font-semibold">Prompts</h1>
        <Button onClick={() => setCreating(true)}>
          <Plus /> Create prompt
        </Button>
      </div>
      {files.data === undefined ? (
        <Empty error={files.isError}>{files.isError ? files.error.message : "Loading…"}</Empty>
      ) : (
        <Tabs defaultValue="steps">
          <TabsList variant="line" className="w-full justify-start">
            <TabsTrigger value="steps">
              Step prompts · {steps.length}
            </TabsTrigger>
            <TabsTrigger value="references">
              Reference files · {references.length}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="steps">
            <Table rows={steps} all={prompts} step names={names} />
          </TabsContent>
          <TabsContent value="references">
            <Table rows={references} all={prompts} step={false} names={names} />
          </TabsContent>
        </Tabs>
      )}
      <NewDialog kind={creating ? "prompts" : null} project={project} onClose={() => setCreating(false)} />
    </main>
  );
}
