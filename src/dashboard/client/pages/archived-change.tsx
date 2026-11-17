import { cn } from "cn"
import { CheckIcon, FileTextIcon, ListChecksIcon } from "lucide-react"

import { ChangeTitle, IssuesAlert } from "@/components/change-header"
import { ChangePanel } from "@/components/change-panel"
import { DOC_COLUMN, DocFrame, PROSE_COLUMN } from "@/components/doc-frame"
import { MarkdownView } from "@/components/markdown"
import { TaskText } from "@/components/text"
import { splitTask } from "@/lib/change-edit"
import { type ChangeDetail, changeTabs, shownTab } from "@/lib/changes"

/** The tasks of an archived change, read-only, each its lead then its detail. */
function Tasks({ change }: { change: ChangeDetail }) {
  if (change.issues.length > 0) return <IssuesAlert issues={change.issues} className="m-3" />
  return (
    <ol className="flex flex-col">
      {change.tasks.map((task, i) => {
        const { lead, detail } = splitTask(task.text)
        return (
          <li key={i} className="flex items-start gap-3 border-t px-3 py-4">
            <span aria-hidden="true" className="mt-5 flex h-(--text-md--line-height) shrink-0 items-center">
              <span
                className={cn(
                  "flex size-4 items-center justify-center rounded-sm border border-muted-foreground",
                  task.done && "border-foreground bg-foreground text-background",
                )}
              >
                {task.done ? <CheckIcon className="size-3.5" /> : null}
              </span>
            </span>
            <div className="min-w-0 flex-1">
              <div className="mb-1 font-mono text-xs leading-4 text-muted-foreground">{i + 1}</div>
              <span className="sr-only">{task.done ? "Done: " : "To do: "}</span>
              <div className={cn("text-md font-medium", task.done && "text-muted-foreground")}>
                <TaskText text={lead} />
              </div>
              {detail !== "" ? (
                <div className="mt-1 text-sm leading-5 whitespace-pre-line text-muted-foreground">
                  <TaskText text={detail} />
                </div>
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/** The page of an archived change, read-only: its files as tabs, the file in the centre, its panel at the right. */
export function ArchivedChange({ projectKey, data, tab }: { projectKey: string; data: ChangeDetail; tab?: string }) {
  const base = `/${projectKey}/changes/archive/${data.ref}`
  // The panel lists the tasks, so the centre shows only the Markdown files; with none, the tasks move to the centre.
  const markdown = data.files.length > 0
  const tabs = changeTabs(data.files).filter((t) => !markdown || t.file !== null)
  const current = shownTab(tabs, tab)
  const file = data.files.find((f) => f.name === current.file)
  return (
    <DocFrame
      title={data.id}
      label="Change files"
      page="change"
      value={current.slug}
      tabs={tabs.map((t) => ({
        value: t.slug,
        label: t.file ?? t.label,
        href: `${base}/${encodeURIComponent(t.slug)}?`,
        Icon: t.file === null ? ListChecksIcon : FileTextIcon,
      }))}
      panelName="Change"
      panel={
        <ChangePanel
          projectKey={projectKey}
          change={data}
          tasks={markdown ? <Tasks change={data} /> : null}
          description={data.description ?? <span className="text-muted-foreground">–</span>}
        />
      }
    >
      <div data-scroll-root className="min-h-0 flex-1 overflow-y-auto">
        <ChangeTitle change={data} />
        <div className={`${DOC_COLUMN} pt-6 pb-10`}>
          {file !== undefined ? (
            <MarkdownView key={file.name} text={file.text} />
          ) : (
            <div className={PROSE_COLUMN}>
              <Tasks change={data} />
            </div>
          )}
        </div>
      </div>
      <div className="flex h-7 shrink-0 items-center gap-2 border-t px-4 text-xs text-muted-foreground">
        {file !== undefined ? <span className="font-mono">{file.name}</span> : <span>Tasks</span>}
        <span aria-hidden="true">·</span>
        <span>Archived {data.archived}, read-only</span>
      </div>
    </DocFrame>
  )
}
