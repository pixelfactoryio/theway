import { type ReactNode, type Ref, useSyncExternalStore } from "react"

import { type CodeViewHandle, EditableCodeView } from "@/components/code-view"
import { DocFooter, LineCount } from "@/components/doc-footer"
import type { DraftStore } from "@/drafts/draft-store"
import type { FileError } from "@/lib/files"

/**
 * A file's code tab, the same on every page that shows a file as code (a workflow's YAML, a prompt's source, a
 * change's `change.yaml`): the draft's code view on the whole width, then the footer with the file's name, the draft's
 * line count and its save state. The page's frame (`DocFrame`) gives its notices and its title above it.
 */
export function CodeTab({
  draft,
  errors,
  file,
  status,
  ref,
}: {
  draft: DraftStore
  /** The applied check's errors, marked on their lines. */
  errors: readonly FileError[]
  /** The file's name, in the footer. */
  file: string
  /** The footer's save state. */
  status: ReactNode
  ref?: Ref<CodeViewHandle>
}) {
  // A draft's text is always read with the state's line break: `sliceDoc()`.
  const text = useSyncExternalStore(draft.subscribe, () => draft.getState().sliceDoc())
  return (
    <>
      <div className="min-h-0 flex-1">
        <EditableCodeView ref={ref} draft={draft} errors={errors} />
      </div>
      <DocFooter file={file} details={[<LineCount text={text} />]} status={status} />
    </>
  )
}
