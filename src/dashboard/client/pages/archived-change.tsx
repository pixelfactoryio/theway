import { Header, IssuesAlert, TaskCount } from "@/components/change-header"
import { ChangePanel } from "@/components/change-panel"
import { MarkdownView } from "@/components/markdown"
import { PanelToggle, RecordBody, usePanelOpen } from "@/components/record-panel"
import { RecordTabs } from "@/components/record-tabs"
import { TaskText } from "@/components/text"
import { Checkbox } from "@/components/ui/checkbox"
import { type ChangeDetail, changeTabs, shownTab } from "@/lib/changes"
import { PageBody, TopBar, type TopBarItem } from "@/shell/top-bar"

/** The tasks of an archived change, read-only. */
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
          <span
            className={task.done ? "text-sm whitespace-pre-line text-muted-foreground" : "text-sm whitespace-pre-line"}
          >
            <TaskText text={task.text} />
          </span>
        </li>
      ))}
    </ol>
  )
}

/** The page of an archived change, read-only. */
export function ArchivedChange({
  projectKey,
  data,
  tab,
  crumbs,
}: {
  projectKey: string
  data: ChangeDetail
  tab?: string
  crumbs: TopBarItem[]
}) {
  const [open, setOpen] = usePanelOpen()
  const base = `/${projectKey}/changes/archive/${data.ref}`
  const tabs = changeTabs(data.files)
  const current = shownTab(tabs, tab)
  const file = data.files.find((f) => f.name === current.file)
  return (
    <>
      <TopBar
        items={crumbs}
        heading={false}
        actions={<PanelToggle page="change" open={open} onOpenChange={setOpen} />}
      />
      <PageBody>
        <RecordBody
          name="Change details"
          open={open}
          onOpenChange={setOpen}
          panel={<ChangePanel projectKey={projectKey} change={data} />}
        >
          <Header change={data} column edit={null} />
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
                    <TaskCount change={data} />
                  </>
                ) : (
                  t.label
                ),
            }))}
          />
          <div data-scroll-root className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable_both-edges]">
            <div
              className={
                file !== undefined ? "mx-auto w-full max-w-4xl px-4 py-6" : "mx-auto w-full max-w-4xl px-4 py-4"
              }
            >
              {file !== undefined ? <MarkdownView key={file.name} text={file.text} /> : <Tasks change={data} />}
            </div>
          </div>
        </RecordBody>
      </PageBody>
    </>
  )
}
