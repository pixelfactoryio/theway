import { FileTextIcon, ListChecksIcon } from "lucide-react"

import { ChangeTitle, UNREADABLE } from "@/components/change-header"
import { ChangePanel } from "@/components/change-panel"
import { DOC_COLUMN, DocFrame, PROSE_COLUMN } from "@/components/doc-frame"
import { DocFooter } from "@/components/doc-footer"
import { LinesAlert } from "@/components/file-page"
import { MarkdownView } from "@/components/markdown-view"
import { TaskList } from "@/components/task-list"
import { type ChangeDetail, changeTabs, shownTab } from "@/lib/changes"
import { to } from "@/lib/routes"

/** The tasks of an archived change, read-only; the reasons it cannot be read instead when it has any. */
function Tasks({ change }: { change: ChangeDetail }) {
  if (change.issues.length > 0) return <LinesAlert lines={change.issues} title={UNREADABLE} className="m-3" />
  return <TaskList readOnly rows={change.tasks} />
}

/** The page of an archived change, read-only: its files as tabs, the file in the centre, its panel at the right. */
export function ArchivedChange({ projectKey, data, tab }: { projectKey: string; data: ChangeDetail; tab?: string }) {
  // The panel lists the tasks, so the centre shows only the Markdown files; with none, the tasks move to the centre.
  const markdown = data.files.length > 0
  const tabs = changeTabs(data.files).filter((t) => !markdown || t.file !== null)
  const current = shownTab(tabs, tab)
  const file = data.files.find((f) => f.name === current.file)
  return (
    <DocFrame
      title={data.id}
      label="Change files"
      value={current.slug}
      tabs={tabs.map((t) => ({
        value: t.slug,
        label: t.file ?? t.label,
        href: to.archived(projectKey, data.ref ?? "", t.slug),
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
        {file !== undefined ? (
          <MarkdownView key={file.name} text={file.text} name={file.name} />
        ) : (
          <div className={`${DOC_COLUMN} pt-6 pb-10`}>
            <div className={PROSE_COLUMN}>
              <Tasks change={data} />
            </div>
          </div>
        )}
      </div>
      <DocFooter
        file={file !== undefined ? file.name : <span className="font-sans">Tasks</span>}
        details={[`Archived ${data.archived}, read-only`]}
      />
    </DocFrame>
  )
}
