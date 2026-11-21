import { FolderIcon } from "lucide-react"

import { ChangeHeading, SameAsId, UNREADABLE } from "@/components/change-header"
import { ChangePanel, ChangeStatus } from "@/components/change-panel"
import { DOC_COLUMN, DocFrame, PROSE_COLUMN } from "@/components/doc-frame"
import { DocFooter } from "@/components/doc-footer"
import { DocTab } from "@/components/doc-tab"
import { LinesAlert } from "@/components/file-page"
import { MarkdownView } from "@/components/markdown-view"
import { TaskList } from "@/components/task-list"
import { useLabel } from "@/data/queries"
import { type ChangeDetail, changeTabs, ownDescription, shownTab } from "@/lib/changes"
import { to } from "@/lib/routes"

/**
 * The tasks of an archived change, read-only; the reasons it cannot be read instead when it has any, as a row of the
 * Tasks card (`card`) or on its own in the page's centre.
 */
function Tasks({ change, card }: { change: ChangeDetail; card: boolean }) {
  if (change.issues.length > 0) {
    return <LinesAlert lines={change.issues} title={UNREADABLE} place={card ? "card" : "bare"} />
  }
  return <TaskList readOnly rows={change.tasks} />
}

/**
 * The page of an archived change, read-only, laid out as an active one: its path (the project, its archive, the
 * change's ID), its files as views, its title, the file, and its panel at the right.
 */
export function ArchivedChange({ projectKey, data, tab }: { projectKey: string; data: ChangeDetail; tab?: string }) {
  const project = useLabel()(projectKey)
  // The panel lists the tasks, so the centre shows only the Markdown files; with none, the tasks move to the centre.
  const markdown = data.files.length > 0
  const tabs = changeTabs(data.files).filter((t) => !markdown || t.file !== null)
  const current = shownTab(tabs, tab)
  const file = data.files.find((f) => f.name === current.file)
  return (
    <DocFrame
      title={data.id}
      mono
      icon={FolderIcon}
      parents={[
        { label: project, href: to.project(projectKey) },
        { label: "Archive", href: to.project(projectKey, { archive: true }) },
      ]}
      label="Change files"
      value={current.slug}
      tabs={tabs.map((t) => ({
        value: t.slug,
        label: t.file ?? t.label,
        href: to.archived(projectKey, data.ref ?? "", t.slug),
      }))}
      status={<ChangeStatus change={data} />}
      heading={<ChangeHeading change={data} />}
      panelName="Change"
      panel={
        <ChangePanel
          projectKey={projectKey}
          change={data}
          tasks={markdown ? <Tasks change={data} card /> : null}
          description={
            data.description === null || data.description.trim() === "" ? (
              <span className="text-muted-foreground">–</span>
            ) : ownDescription(data.description, data.id) === null ? (
              <SameAsId />
            ) : (
              data.description
            )
          }
        />
      }
    >
      <DocTab
        footer={
          <DocFooter
            file={file !== undefined ? file.name : <span className="font-sans">Tasks</span>}
            details={[`Archived ${data.archived}, read-only`]}
          />
        }
      >
        {file !== undefined ? (
          <MarkdownView
            key={file.name}
            text={file.text}
            name={file.name}
            title={ownDescription(data.description, data.id)}
          />
        ) : (
          <div className={`${DOC_COLUMN} pt-6 pb-10`}>
            <div className={PROSE_COLUMN}>
              <Tasks change={data} card={false} />
            </div>
          </div>
        )}
      </DocTab>
    </DocFrame>
  )
}
