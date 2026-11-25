import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { DIALOG_TITLE } from "@/components/ui-classes"
import type { Confirm } from "@/drafts/use-drafts"
import { saveWithErrors } from "@/lib/edit"
import { countOf } from "@/lib/list-filter"

/** The answers of the "Save your changes?" dialog that Done asks (`useEditMode`), and where the focus goes after it. */
export type DoneAnswers = {
  discard: () => void
  save: () => void
  /** Where the focus goes when a dialog closes: an element, or `true` for where it was. */
  finalFocus: () => HTMLElement | true
}

/**
 * The page's confirmations: Discard, Reload, Save with errors, leaving the page, and Done with unsaved changes. Each
 * says what it asks in its title, what follows in one line under it, and names its actions; the safe one first, the
 * one asked for last.
 */
export function ChangeDialogs({
  confirm,
  setConfirm,
  onDiscard,
  onReload,
  onLeaveSave,
  done,
}: {
  confirm: Confirm | null
  setConfirm: (c: Confirm | null) => void
  onDiscard: (file: string) => void
  onReload: (file: string) => void
  onLeaveSave: (proceed: () => void) => void
  /** The page's edit mode's answers to Done. */
  done?: DoneAnswers
}) {
  const close = () => {
    if (confirm?.kind === "errors") confirm.answer(false)
    setConfirm(null)
  }
  return (
    <AlertDialog open={confirm !== null} onOpenChange={(next) => (next ? undefined : close())}>
      <AlertDialogContent finalFocus={done === undefined ? true : () => done.finalFocus()}>
        {confirm?.kind === "discard" || confirm?.kind === "reload" ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className={DIALOG_TITLE}>Discard unsaved changes?</AlertDialogTitle>
              <AlertDialogDescription>
                {confirm.kind === "discard" ? (
                  <>
                    Your unsaved edits to <span className="font-mono text-xs text-foreground">{confirm.name}</span> are
                    dropped.
                  </>
                ) : (
                  <>
                    Your unsaved edits to <span className="font-mono text-xs text-foreground">{confirm.name}</span> are
                    dropped and the file is loaded as it is on disk.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep editing</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setConfirm(null)
                  if (confirm.kind === "discard") onDiscard(confirm.name)
                  else onReload(confirm.name)
                }}
              >
                {confirm.kind === "discard" ? "Discard" : "Reload"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : confirm?.kind === "errors" ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className={DIALOG_TITLE}>{saveWithErrors(confirm.n)}</AlertDialogTitle>
              <AlertDialogDescription>The file is written as it is, errors included.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  confirm.answer(true)
                  setConfirm(null)
                }}
              >
                Save anyway
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : confirm?.kind === "leave" ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className={DIALOG_TITLE}>Leave with unsaved changes?</AlertDialogTitle>
              <AlertDialogDescription>Save them before you leave, or discard them.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep editing</AlertDialogCancel>
              <Button
                variant="outline"
                onClick={() => {
                  setConfirm(null)
                  confirm.proceed()
                }}
              >
                Discard
              </Button>
              <AlertDialogAction onClick={() => onLeaveSave(confirm.proceed)}>Save and leave</AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : confirm?.kind === "done" && done !== undefined ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className={DIALOG_TITLE}>Save your changes?</AlertDialogTitle>
              <AlertDialogDescription>
                Your unsaved edits to {countOf(confirm.n, "file")} are kept until you save or discard them.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep editing</AlertDialogCancel>
              <Button variant="outline" onClick={done.discard}>
                Discard
              </Button>
              <AlertDialogAction onClick={done.save}>Save</AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : null}
      </AlertDialogContent>
    </AlertDialog>
  )
}
