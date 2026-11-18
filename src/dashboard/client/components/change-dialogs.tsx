import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { saveWithErrors } from "@/lib/edit"

/** The confirmation open on the page. */
export type Confirm =
  | { kind: "discard"; name: string }
  | { kind: "reload"; name: string }
  | { kind: "errors"; n: number; answer: (yes: boolean) => void }
  | { kind: "leave"; proceed: () => void }

/** The page's confirmations: Discard, Reload, Save with errors, and leaving the page. */
export function ChangeDialogs({
  confirm,
  setConfirm,
  onDiscard,
  onReload,
  onLeaveSave,
}: {
  confirm: Confirm | null
  setConfirm: (c: Confirm | null) => void
  onDiscard: (file: string) => void
  onReload: (file: string) => void
  onLeaveSave: (proceed: () => void) => void
}) {
  const close = () => {
    if (confirm?.kind === "errors") confirm.answer(false)
    setConfirm(null)
  }
  return (
    <AlertDialog open={confirm !== null} onOpenChange={(next) => (next ? undefined : close())}>
      <AlertDialogContent>
        {confirm?.kind === "discard" || confirm?.kind === "reload" ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
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
              <AlertDialogTitle>{saveWithErrors(confirm.n)}</AlertDialogTitle>
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
              <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
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
              <AlertDialogAction onClick={() => onLeaveSave(confirm.proceed)}>Save</AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : null}
      </AlertDialogContent>
    </AlertDialog>
  )
}
