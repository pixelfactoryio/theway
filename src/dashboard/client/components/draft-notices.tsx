import { CircleAlertIcon, TriangleAlertIcon } from "lucide-react"

import { ChangeDialogs } from "@/components/change-dialogs"
import type { FileDraft } from "@/components/file-draft"
import { ErrorStrip, SavedStatus, STRIP } from "@/components/file-page"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/reui/alert"
import { Button } from "@/components/ui/button"
import type { AlertLine } from "@/lib/alert-lines"
import { MOD, shortcutText } from "@/shell/platform"

/** The strip shown when the file changed on disk since it was opened, with Reload. */
export function ConflictNotice({ onReload }: { onReload: () => void }) {
  return (
    <Alert variant="warning" className={STRIP}>
      <TriangleAlertIcon aria-hidden="true" />
      <AlertTitle>This file changed on disk since you opened it.</AlertTitle>
      <AlertAction>
        <Button variant="outline" size="xs" onClick={onReload}>
          Reload
        </Button>
      </AlertAction>
    </Alert>
  )
}

/** The strip shown when the last save failed, with the reason. */
export function SaveFailureNotice({ message }: { message: string }) {
  return (
    <Alert variant="destructive" className={STRIP}>
      <CircleAlertIcon aria-hidden="true" />
      <AlertTitle>The file could not be saved</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
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
        <Alert variant="destructive" className={STRIP}>
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>The check could not run</AlertTitle>
          <AlertDescription>{draft.checkFailure}</AlertDescription>
        </Alert>
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
        <button
          type="button"
          onClick={onDiscard}
          className="rounded-sm text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          Discard
        </button>
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
