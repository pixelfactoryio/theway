import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { PageBody, TopBar, type TopBarItem } from "@/shell/top-bar"

/** A section page until it gets its content: the top bar, then one empty state with the section's title. */
export function SectionPage({ title, items }: { title: string; items: TopBarItem[] }) {
  return (
    <>
      <TopBar items={items} />
      <PageBody>
        <div data-scroll-root className="flex min-h-0 flex-1 flex-col overflow-auto">
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{title}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        </div>
      </PageBody>
    </>
  )
}

/** The Changes page of a home with no project: "No project yet" under a breadcrumb of "Changes" only. */
export function NoProjectPage() {
  return (
    <>
      <TopBar items={[{ label: "Changes" }]} />
      <PageBody>
        <div data-scroll-root className="flex min-h-0 flex-1 flex-col overflow-auto">
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No project yet</EmptyTitle>
              <EmptyDescription>
                A project appears here once <code className="font-mono">/theway:engineering</code> has written its first
                change.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      </PageBody>
    </>
  )
}
