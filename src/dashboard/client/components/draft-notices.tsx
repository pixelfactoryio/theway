import { ChangeDialogs } from "@/components/change-dialogs"
import type { FileDraft } from "@/components/file-draft"
import { ErrorStrip, SavedStatus } from "@/components/file-page"
import { Button } from "@/components/ui/button"
import type { AlertLine } from "@/lib/alert-lines"
import { MOD, shortcutText } from "@/shell/platform"
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
 * History the error alert is hidden. Unsaved edits show in the footer, with `DraftStatus`.
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
 * A footer's save state: `Unsaved · ⌘S to save` (Ctrl+S off macOS) with Discard when `onDiscard` is given, while
 * `dirty`; else Saved for a moment after a save.
 */
export function DraftStatus({ dirty, saved, onDiscard }: { dirty: boolean; saved: boolean; onDiscard?: () => void }) {
  if (!dirty) return <SavedStatus saved={saved} />
  return (
    <span className="flex items-center gap-2">
      <span className="text-foreground">Unsaved · {shortcutText([MOD, "S"])} to save</span>
      {onDiscard !== undefined ? (
        <Button
          variant="link"
          size="xs"
          onClick={onDiscard}
          className="h-auto px-0 text-muted-foreground hover:text-foreground"
        >
          Discard
        </Button>
      ) : null}
    </span>
  )
}

/** The page's confirmations: Discard, Save with errors, Reload and leaving the page. */
export function DraftDialogs({ draft }: { draft: FileDraft }) {
  return (
    <ChangeDialogs
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
