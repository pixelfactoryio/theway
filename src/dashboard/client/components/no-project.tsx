import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { PageBody, PageHeader } from "@/shell/top-bar"

/** A home with no project: "No project yet". */
export function NoProjectPage() {
  return (
    <>
      <PageHeader title="theway" />
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
