import { type ReactNode, type Ref, useSyncExternalStore } from "react"

import { type CodeViewHandle, EditableCodeView } from "@/components/code-view"
import { DocFooter, LineCount } from "@/components/doc-footer"
import { GutterTitle } from "@/components/doc-title"
import type { DraftStore } from "@/drafts/draft-store"
import type { FileError } from "@/lib/files"

/**
 * A file's code tab, the same on every page that shows a file as code (a workflow's YAML, a prompt's source, a
 * change's `change.yaml`): the page's title block on the 24px gutter over a 1px rule, the page's notices, the draft's code
 * view on the whole width, then the footer with the file's name, the draft's line count and its save state.
 */
export function CodeTab({
  title,
  notices,
  draft,
  errors,
  file,
  status,
  ref,
}: {
  /** The page's title block, as it passes it: a `DocTitle`, with what the page puts under it. */
  title: ReactNode
  /** The strips between the title and the code: a conflict, a failed save, the errors. */
  notices?: ReactNode
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
      {/* The rule is the title's, so a notice, which brings its own under it, never doubles it. */}
      <GutterTitle rule>{title}</GutterTitle>
      {notices}
      <div className="min-h-0 flex-1">
        <EditableCodeView ref={ref} draft={draft} errors={errors} />
      </div>
      <DocFooter file={file} details={[<LineCount text={text} />]} status={status} />
    </>
  )
}
