import { ChangeDialogs, type DoneAnswers } from "@/components/change-dialogs"
import type { FileDraft } from "@/components/file-draft"
import { ErrorStrip, SavedStatus } from "@/components/file-page"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import type { AlertLine } from "@/lib/alert-lines"
import { MAC } from "@/shell/platform"
import { StateNotice } from "@/shell/state"

/** The strip shown when the file changed on disk since it was opened, with Reload. */
export function ConflictNotice({ onReload }: { onReload: () => void }) {
  return (
    <StateNotice
      tone="warning"
      title="This file changed on disk since you opened it"
      action={
        <Button variant="outline" size="xs" onClick={onReload}>
          Reload
        </Button>
      }
    />
  )
}

/** The strip shown when the last save failed, with the reason. */
export function SaveFailureNotice({ message }: { message: string }) {
  return (
    <StateNotice tone="error" title="The file could not be saved">
      {message}
    </StateNotice>
  )
}

/**
 * The stack under the tabs, from the top: the conflict, the save failure, then the check failure or the error alert. On
 * History the error alert is hidden. Unsaved edits show in the footer, with `SaveBar`.
 */
export function DraftNotices({
  draft,
  lines,
  history,
}: {
  draft: FileDraft
  lines: readonly AlertLine[]
  history: boolean
}) {
  return (
    <>
      {draft.conflict ? <ConflictNotice onReload={draft.reload} /> : null}
      {draft.saveFailure !== null ? <SaveFailureNotice message={draft.saveFailure} /> : null}
      {draft.checkFailure !== null ? (
        <StateNotice tone="error" title="The check could not run">
          {draft.checkFailure}
        </StateNotice>
      ) : history ? null : (
        <ErrorStrip lines={lines} />
      )}
    </>
  )
}

/**
 * A file view's save bar, at the footer's right: while the shown file has unsaved changes, "Unsaved changes" in the ink,
 * Discard (ghost, which asks first) and Save (with its key, ⌘S, Ctrl S off macOS), which runs what the page's ⌘S
 * runs. While editing with none, Discard and Save stay, disabled; "Saved" shows for a moment after a save, as it does
 * while reading, where nothing else shows. Its buttons are 24px, inside the 28px footer.
 */
export function SaveBar({
  dirty,
  saved,
  editing,
  onDiscard,
  onSave,
}: {
  dirty: boolean
  saved: boolean
  editing: boolean
  onDiscard: () => void
  onSave: () => void
}) {
  if (!dirty && !editing) return <SavedStatus saved={saved} />
  return (
    <span className="flex items-center gap-2">
      {dirty ? <span className="text-foreground">Unsaved changes</span> : <SavedStatus saved={saved} />}
      <Button variant="ghost" size="xs" disabled={!dirty} onClick={onDiscard}>
        Discard
      </Button>
      <Button size="xs" disabled={!dirty} onClick={onSave}>
        Save
        <Kbd className="h-4 bg-primary-foreground/15 text-primary-foreground">{MAC ? "⌘S" : "Ctrl S"}</Kbd>
      </Button>
    </span>
  )
}

/** The page's confirmations: Discard, Save with errors, Reload, leaving the page and Done (`done`, the edit mode's). */
export function DraftDialogs({ draft, done }: { draft: FileDraft; done?: DoneAnswers }) {
  return (
    <ChangeDialogs
      done={done}
      confirm={draft.confirm}
      setConfirm={draft.setConfirm}
      onDiscard={draft.doDiscard}
      onReload={() => void draft.doReload()}
      onLeaveSave={(proceed) => {
        draft.setConfirm(null)
        void draft.save(false).then((ok) => {
          if (ok) proceed()
        })
      }}
    />
  )
}
