import type { UseQueryResult } from "@tanstack/react-query";
import { cn } from "cn";
import { Check } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Badge } from "@/components/reui/badge";
import { Bar, Empty } from "@/components/state";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fileHref, useAllChanges, useArchived, useChange } from "@/lib/api";
import { StatusBadge } from "@/pages/changes";
import type { ChangeDetail } from "../../types";

/** A change's page, active or archived (`id` is then the archive folder). */
export function ChangePage({ projectKey, id, archived }: { projectKey: string; id: string; archived: boolean }) {
  return archived ? <ArchivedDetail projectKey={projectKey} folder={id} /> : <ActiveDetail projectKey={projectKey} id={id} />;
}

function ActiveDetail({ projectKey, id }: { projectKey: string; id: string }) {
  return <Detail projectKey={projectKey} date={null} query={useChange(projectKey, id)} />;
}

function ArchivedDetail({ projectKey, folder }: { projectKey: string; folder: string }) {
  return <Detail projectKey={projectKey} date={folder.slice(0, 10)} query={useArchived(projectKey, folder)} />;
}

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The tab names of the change files: Spec, Design and Notes, else the file name. */
const NAMES: Record<string, string> = { "spec.md": "Spec", "design.md": "Design", "notes.md": "Notes" };

/** The value of the Tasks tab, which no `.md` file name can take. */
const TASKS = "tasks";

/** The files in tab order: `spec.md`, `design.md`, `notes.md`, then the others by name. */
function ordered(files: ChangeDetail["files"]): ChangeDetail["files"] {
  const first = ["spec.md", "design.md", "notes.md"].flatMap((n) => files.filter((f) => f.name === n));
  return [...first, ...files.filter((f) => !first.includes(f)).sort((a, b) => byText(a.name, b.name))];
}

/** `N of M`, then one two-digit ordinal per number up to the total: the current one marked, members linked. */
function SeriesFacts({ projectKey, series }: { projectKey: string; series: NonNullable<ChangeDetail["properties"]["series"]> }) {
  const ordinals = Array.from({ length: series.total }, (_, i) => i + 1);
  return (
    <>
      <span className="tabular-nums">
        {series.ordinal} of {series.total}
      </span>
      <span className="flex flex-wrap gap-2.5 text-muted-foreground tabular-nums">
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
            <Link key={n} href={href} className="text-primary hover:underline">
              {text}
            </Link>
          );
        })}
      </span>
    </>
  );
}

/** The command that runs the change, and Copy: the clipboard when the page has one, else the command's text selected. */
function RunCommand({ id }: { id: string }) {
  const command = `/theway:workflow ${id}`;
  const text = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  const copy = () => {
    // `navigator.clipboard` is undefined outside a secure context.
    const clipboard = navigator.clipboard as Clipboard | undefined;
    if (clipboard === undefined) {
      if (text.current !== null) window.getSelection()?.selectAllChildren(text.current);
      return;
    }
    clipboard.writeText(command).then(
      () => setCopied(true),
      () => {
        if (text.current !== null) window.getSelection()?.selectAllChildren(text.current);
      },
    );
  };
  return (
    <div className="flex items-center gap-2 rounded-md bg-canvas p-2">
      <code ref={text} className="min-w-0 flex-1 font-mono text-[12px] break-all">
        {command}
      </code>
      <Button variant="outline" size="sm" onClick={copy}>
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

/** One fact of the Details column: its name, then its value. */
function Fact({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[12px] text-muted-foreground">{name}</span>
      {children}
    </div>
  );
}

/** The Details column: the project, the tasks, the series, the default workflow and the command that runs an active change. */
function Details({ projectKey, label, data }: { projectKey: string; label: string; data: ChangeDetail }) {
  const series = data.properties.series;
  const workflow = data.defaultWorkflow;
  return (
    <aside aria-label="Details" className="flex flex-col gap-3 lg:w-[280px] lg:flex-none">
      <h2 className="border-b border-divider pb-3 font-semibold">Details</h2>
      <Fact name="Project">
        <span className="break-words">{label}</span>
      </Fact>
      {data.status !== "Invalid" && (
        <Fact name="Tasks">
          <span className="flex items-center gap-2.5 tabular-nums">
            <span className="w-[90px]">
              <Bar done={data.tasks.done} total={data.tasks.total} />
            </span>
            {data.tasks.done} of {data.tasks.total}
          </span>
        </Fact>
      )}
      {series !== null && (
        <Fact name="Series">
          <SeriesFacts projectKey={projectKey} series={series} />
        </Fact>
      )}
      {!data.archived && workflow !== null && (
        <Fact name="Run it with">
          <span className="flex items-center gap-1.5">
            <Link href={fileHref({ ...workflow, kind: "workflows" })} className="font-medium text-primary hover:underline">
              {workflow.name}
            </Link>
            <Badge variant="secondary">default</Badge>
          </span>
        </Fact>
      )}
      {!data.archived && <RunCommand id={data.id} />}
    </aside>
  );
}

/** The Tasks tab: each task's mark, number and text, a done task's text muted. */
function TaskList({ items }: { items: ChangeDetail["taskItems"] }) {
  return (
    <ol className="flex flex-col">
      {items.map((t, i) => (
        <li key={`${i}:${t.html}`} className="flex items-start gap-3 border-b border-divider-row py-2.5">
          <span
            role="img"
            aria-label={t.done ? "done" : "open"}
            className={cn(
              "mt-0.5 inline-flex size-4 flex-none items-center justify-center rounded-[4px] border",
              t.done ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card",
            )}
          >
            {t.done && <Check className="size-3" strokeWidth={3} />}
          </span>
          <span className="w-5 flex-none text-muted-foreground tabular-nums">{i + 1}</span>
          {/* Rendered on the server with raw HTML escaped; the CSP is the second layer. */}
          <span className={cn("markdown min-w-0", t.done && "text-muted-foreground")} dangerouslySetInnerHTML={{ __html: t.html }} />
        </li>
      ))}
    </ol>
  );
}

const TRIGGER =
  "flex-none rounded-none border-0 border-b-2 border-transparent px-0 py-2 font-normal text-muted-foreground after:hidden data-active:border-primary data-active:text-primary";

/** The link back to Changes, the title with its badge, the description or the error, then the tabs and the Details column. */
function Detail({ projectKey, date, query }: { projectKey: string; date: string | null; query: UseQueryResult<ChangeDetail> }) {
  const all = useAllChanges();
  const label = all.data?.projects.find((p) => p.key === projectKey)?.label ?? projectKey;
  const data = query.data;
  const files = data === undefined ? [] : ordered(data.files);
  const tabs = [
    ...files.filter((f) => f.name === "spec.md").map((f) => ({ value: f.name, name: NAMES[f.name] as string })),
    ...(data !== undefined && data.status !== "Invalid" ? [{ value: TASKS, name: `Tasks · ${data.tasks.done} of ${data.tasks.total}` }] : []),
    ...files.filter((f) => f.name !== "spec.md").map((f) => ({ value: f.name, name: NAMES[f.name] ?? f.name })),
  ];
  const [tab, setTab] = useState<string | null>(null);
  const current = tabs.find((t) => t.value === tab) ?? tabs[0];
  return (
    <main id="content" tabIndex={-1} className="flex w-full max-w-[1280px] flex-col gap-2 px-4 py-6 outline-none lg:px-8 lg:py-8">
      <Link href="/changes" className="self-start text-[12px] text-primary hover:underline">
        Changes ›
      </Link>
      {data === undefined ? (
        <Empty error={query.isError}>{query.isError ? query.error.message : "Loading…"}</Empty>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-[28px] font-semibold break-all">{data.id}</h1>
            {data.archived ? (
              <span className="flex items-center gap-2">
                <Badge variant="secondary">Archived</Badge>
                <span className="text-muted-foreground tabular-nums">{date}</span>
              </span>
            ) : (
              <StatusBadge change={data} />
            )}
          </div>
          {data.status === "Invalid" ? (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2.5 text-destructive">
              {data.error}
            </p>
          ) : (
            <p className="text-muted-foreground">{data.description}</p>
          )}
          <div className="mt-3 flex flex-col gap-8 lg:flex-row">
            <div className="min-w-0 flex-1">
              {current !== undefined && (
                <Tabs value={current.value} onValueChange={(v) => setTab(String(v))} className="gap-4">
                  <TabsList variant="line" className="h-auto w-full justify-start gap-5 overflow-x-auto rounded-none border-b border-divider p-0">
                    {tabs.map((t) => (
                      <TabsTrigger key={t.value} value={t.value} className={TRIGGER}>
                        {t.name}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {tabs.map((t) => (
                    <TabsContent key={t.value} value={t.value}>
                      {t.value === TASKS ? (
                        <TaskList items={data.taskItems} />
                      ) : (
                        // Rendered on the server with raw HTML escaped; the CSP is the second layer.
                        <div className="markdown max-w-[72ch]" dangerouslySetInnerHTML={{ __html: files.find((f) => f.name === t.value)?.html ?? "" }} />
                      )}
                    </TabsContent>
                  ))}
                </Tabs>
              )}
            </div>
            <Details projectKey={projectKey} label={label} data={data} />
          </div>
        </>
      )}
    </main>
  );
}
