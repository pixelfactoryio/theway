import { cn } from "cn"
import { FileCodeIcon, FileTextIcon } from "lucide-react"

import { ChangeTitle, IssuesAlert } from "@/components/change-header"
import { ChangePanel } from "@/components/change-panel"
import { DocFrame } from "@/components/doc-frame"
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
            <span
              aria-hidden="true"
              className={cn(
                "mt-5 size-4 shrink-0 rounded-[4px] border-[1.5px] border-input",
                task.done && "border-success bg-success",
              )}
            />
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 font-mono text-xs leading-4 text-muted-foreground">{i + 1}</div>
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
  const tabs = changeTabs(data.files)
  const current = shownTab(tabs, tab)
  const file = data.files.find((f) => f.name === current.file)
  return (
    <DocFrame
      label="Change files"
      page="change"
      value={current.slug}
      tabs={tabs.map((t) => ({
        value: t.slug,
        label: t.file ?? "change.yaml",
        href: `${base}/${encodeURIComponent(t.slug)}?`,
        Icon: t.file === null ? FileCodeIcon : FileTextIcon,
      }))}
      panelName="Change"
      panel={
        <ChangePanel
          projectKey={projectKey}
          change={data}
          tasks={<Tasks change={data} />}
          description={data.description ?? <span className="text-muted-foreground">–</span>}
        />
      }
    >
      <div data-scroll-root className="min-h-0 flex-1 overflow-y-auto">
        <ChangeTitle change={data} />
        <div className="max-w-[53rem] px-14 pb-10">
          {file !== undefined ? <MarkdownView key={file.name} text={file.text} /> : <Tasks change={data} />}
        </div>
      </div>
      <div className="flex h-7 shrink-0 items-center gap-2 border-t px-4 text-xs text-muted-foreground">
        <span className="font-mono">{file?.name ?? "change.yaml"}</span>
        <span aria-hidden="true">·</span>
        <span>Archived {data.archived}, read-only</span>
      </div>
    </DocFrame>
  )
}
