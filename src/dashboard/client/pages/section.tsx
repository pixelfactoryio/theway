import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { PageBody, TopBar } from "@/shell/top-bar"

/** The Changes page of a home with no project: "No project yet" under the breadcrumb of the selector (empty) and "Changes". */
export function NoProjectPage() {
  return (
    <>
      <TopBar items={[{ selector: true }, { label: "Changes" }]} />
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
