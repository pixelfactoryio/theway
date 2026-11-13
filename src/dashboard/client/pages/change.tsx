import { useQuery } from "@tanstack/react-query"
import { CircleAlertIcon } from "lucide-react"
import type { ReactNode } from "react"
import { Link } from "wouter"

import { MarkdownView } from "@/components/markdown"
import { PanelToggle, RecordBody, usePanelOpen } from "@/components/record-panel"
import { RecordTabs } from "@/components/record-tabs"
import { Badge } from "@/components/reui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/reui/alert"
import { StatusBadge, StatusIcon } from "@/components/status"
import { CopyField, OneLine, TaskText } from "@/components/text"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Empty, EmptyContent, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { type ChangeDetail, changeTabs, nextTask, runCommand, type SeriesMember, shownTab } from "@/lib/changes"
import { changesPath } from "@/lib/projects"
import { LoadError } from "@/shell/load-error"
import { getJson, useProjects } from "@/shell/projects"
import { PageBody, TopBar } from "@/shell/top-bar"

/** The errors of a `404` on a change's route. */
const UNKNOWN = ["unknown change", "unknown archive folder"]

/** The issues of a change that cannot be read, in a destructive alert. */
function IssuesAlert({ issues, className }: { issues: string[]; className?: string }) {
  return (
    <Alert variant="destructive" className={className}>
      <CircleAlertIcon aria-hidden="true" />
      <AlertTitle>This change cannot be read</AlertTitle>
      <AlertDescription>
        {issues.map((issue, i) => (
          <span key={i} className="font-mono text-xs">
            {issue}
          </span>
        ))}
      </AlertDescription>
    </Alert>
  )
}

function Header({ change }: { change: ChangeDetail }) {
  const invalid = change.archived === null && change.issues.length > 0
  return (
    <div className="mx-auto w-full max-w-4xl shrink-0">
      <div className="flex w-full flex-col gap-1 px-4 pt-6 pb-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h1 className="truncate text-lg font-semibold">{change.id}</h1>
          <StatusBadge status={change.status} />
        </div>
        {invalid ? (
          <IssuesAlert issues={change.issues} className="mt-2 max-w-[80ch]" />
        ) : change.description !== null ? (
          <OneLine text={change.description} className="max-w-[80ch] text-sm text-muted-foreground" />
        ) : null}
      </div>
    </div>
  )
}

function Tasks({ change }: { change: ChangeDetail }) {
  if (change.issues.length > 0) return <IssuesAlert issues={change.issues} className="max-w-[80ch]" />
  return (
    <ol className="flex max-w-[80ch] flex-col">
      {change.tasks.map((task, i) => (
        <li key={i} className="flex items-start gap-3 border-b py-2 last:border-b-0">
          <Checkbox
            checked={task.done}
            readOnly
            aria-label={task.done ? `Task ${i + 1}, done` : `Task ${i + 1}`}
            className="mt-0.5"
          />
          <span className="w-6 shrink-0 text-right text-sm text-muted-foreground tabular-nums">{i + 1}.</span>
          <span className={task.done ? "text-sm whitespace-pre-line text-muted-foreground" : "text-sm whitespace-pre-line"}>
            <TaskText text={task.text} />
          </span>
        </li>
      ))}
    </ol>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  )
}

const memberHref = (key: string, m: { active: string | null; archived: string | null }): string =>
  m.active !== null ? `/${key}/changes/${m.active}?` : `/${key}/changes/archive/${m.archived}?`

/** One ordinal of the series list; the current change's row shows the current change itself. */
function SeriesRow({ projectKey, member, current }: { projectKey: string; member: SeriesMember; current: ChangeDetail | null }) {
  const shown: SeriesMember | null =
    current !== null
      ? {
          ordinal: member.ordinal,
          active: current.archived === null ? current.id : null,
          archived: current.archived === null ? null : `${current.archived}-${current.id}`,
          status: current.status,
          done: current.archived === null ? current.done : null,
          total: current.archived === null ? current.total : null,
        }
      : member
  const classes = "flex h-8 min-w-0 items-center gap-2 rounded-md px-2"
  if (shown.status === null || (shown.active === null && shown.archived === null)) {
    return (
      <li className={current !== null ? `${classes} bg-muted` : classes} aria-current={current !== null ? "true" : undefined}>
        <span className="text-muted-foreground tabular-nums">{member.ordinal}</span>
      </li>
    )
  }
  const id = shown.active ?? (shown.archived as string).slice(11)
  const right =
    shown.status === "archived" ? "Archived" : shown.status === "invalid" ? "–" : `${shown.done ?? 0}/${shown.total ?? 0}`
  return (
    <li className={current !== null ? `${classes} bg-muted` : classes} aria-current={current !== null ? "true" : undefined}>
      <StatusIcon status={shown.status} />
      <Link href={memberHref(projectKey, shown)} className="min-w-0 flex-1 underline-offset-4 hover:underline">
        <OneLine text={id} />
      </Link>
      <span className="shrink-0 text-muted-foreground tabular-nums">{right}</span>
    </li>
  )
}

/** The change page's right panel: Next task, Run, Series, Archived and Folder. */
function ChangePanel({ projectKey, change }: { projectKey: string; change: ChangeDetail }) {
  const archived = change.archived !== null
  const invalid = change.status === "invalid"
  const next = nextTask(change.tasks)
  const run = runCommand(change)
  const ordinal = /-(\d{2})$/.exec(change.id)?.[1]
  return (
    <div className="flex flex-col gap-4 p-4">
      <dl className="flex flex-col gap-4">
        {!archived && !invalid ? (
          <Row label="Next task">
            {next === null ? (
              "All tasks are done."
            ) : (
              <div className="flex gap-2">
                <span className="shrink-0 text-muted-foreground tabular-nums">{next.n}.</span>
                <span>
                  <TaskText text={next.text} />
                </span>
              </div>
            )}
          </Row>
        ) : null}
        {!archived ? (
          <Row label="Run">
            <CopyField value={run.command} name={run.name} />
          </Row>
        ) : null}
        {change.series !== null ? (
          <Row label="Series">
            <ol className="-mx-2 flex flex-col">
              {change.series.members.map((m) => (
                <SeriesRow key={m.ordinal} projectKey={projectKey} member={m} current={m.ordinal === ordinal ? change : null} />
              ))}
            </ol>
          </Row>
        ) : null}
        {archived ? (
          <Row label="Archived">
            <span className="tabular-nums">{change.archived}</span>
          </Row>
        ) : null}
        <Row label="Folder">
          <CopyField value={change.folder} name="the folder path" />
        </Row>
      </dl>
    </div>
  )
}

/** The unknown change, or unknown archive folder, state. */
function Unknown({ projectKey, name }: { projectKey: string; name: string }) {
  const projects = useProjects()
  const label = projects.data?.projects.find((p) => p.key === projectKey)?.label ?? projectKey
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>
          No change <code className="font-mono">{name}</code> in {label}
        </EmptyTitle>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" render={<Link href={changesPath(projectKey)} />}>
          Back to Changes
        </Button>
      </EmptyContent>
    </Empty>
  )
}

/**
 * `#/<key>/changes/<id>[/<tab>]` and `#/<key>/changes/archive/<dir>[/<tab>]`: a change's header, its tabs (its Markdown
 * files, then Tasks) and its right panel.
 */
export function ChangePage({ projectKey, id, dir, tab }: { projectKey: string; id?: string; dir?: string; tab?: string }) {
  const path =
    dir !== undefined ? `/api/projects/${projectKey}/changes/archive/${dir}` : `/api/projects/${projectKey}/changes/${id}`
  const change = useQuery({ queryKey: ["change", path], queryFn: () => getJson<ChangeDetail>(path) })
  const [open, setOpen] = usePanelOpen()

  const name = dir ?? id ?? ""
  const crumbs = (label: string) => [{ label: "Changes", href: changesPath(projectKey) }, { selector: true as const }, { label }]
  const fallback = dir !== undefined && /^\d{4}-\d{2}-\d{2}-.+/.test(dir) ? dir.slice(11) : name

  if (change.isPending) {
    return (
      <>
        <TopBar items={crumbs(fallback)} heading={false} />
        <PageBody>{null}</PageBody>
      </>
    )
  }
  if (change.isError) {
    const unknown = UNKNOWN.includes(change.error.message)
    return (
      <>
        <TopBar items={crumbs(unknown ? name : fallback)} heading={false} />
        <PageBody>
          {unknown ? (
            <Unknown projectKey={projectKey} name={name} />
          ) : (
            <LoadError what="this change" error={change.error} retry={() => void change.refetch()} className="m-4 w-auto" />
          )}
        </PageBody>
      </>
    )
  }

  const data = change.data
  const base = dir !== undefined ? `/${projectKey}/changes/archive/${dir}` : `/${projectKey}/changes/${data.id}`
  const tabs = changeTabs(data.files)
  const current = shownTab(tabs, tab)
  const file = data.files.find((f) => f.name === current.file)

  return (
    <>
      <TopBar
        items={crumbs(data.id)}
        heading={false}
        actions={<PanelToggle x="details" open={open} onOpenChange={setOpen} />}
      />
      <PageBody>
        <RecordBody name="Change details" open={open} onOpenChange={setOpen} panel={<ChangePanel projectKey={projectKey} change={data} />}>
          <Header change={data} />
          <RecordTabs
            column
            label="Change files"
            value={current.slug}
            tabs={tabs.map((t) => ({
              value: t.slug,
              href: `${base}/${encodeURIComponent(t.slug)}?`,
              label:
                t.file === null ? (
                  <>
                    Tasks
                    <Badge variant="secondary" className="tabular-nums">
                      {data.issues.length > 0 ? "–" : `${data.done}/${data.total}`}
                    </Badge>
                  </>
                ) : (
                  t.label
                ),
            }))}
          />
          <div data-scroll-root className="min-h-0 flex-1 overflow-y-auto">
            <div className={file !== undefined ? "mx-auto w-full max-w-4xl px-4 py-6" : "mx-auto w-full max-w-4xl px-4 py-4"}>
              {file !== undefined ? <MarkdownView key={file.name} text={file.text} /> : <Tasks change={data} />}
            </div>
          </div>
        </RecordBody>
      </PageBody>
    </>
  )
}
