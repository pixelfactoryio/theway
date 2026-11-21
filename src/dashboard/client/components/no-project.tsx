import { EmptyNote } from "@/components/empty-note"
import { PageBody, PageHeader } from "@/shell/top-bar"

/** A home with no project: "No project yet", in the one empty state. */
export function NoProjectPage() {
  return (
    <>
      <PageHeader title="theway" />
      <PageBody>
        <div data-scroll-root className="flex min-h-0 flex-1 flex-col overflow-auto">
          <EmptyNote size="page">
            No project yet. A project appears here once <code className="font-mono text-xs">/theway:engineering</code>{" "}
            has written its first change.
          </EmptyNote>
        </div>
      </PageBody>
    </>
  )
}
