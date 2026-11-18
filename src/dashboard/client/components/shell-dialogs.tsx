import { NewFileDialog } from "@/components/new-file"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useDialog } from "@/shell/dialogs"
import { SHORTCUTS } from "@/shell/keys"
import { Shortcut } from "@/shell/shortcut"

/** The shell's dialogs: the shortcut sheet, New workflow and New prompt. */
export function ShellDialogs() {
  const { dialog, open: openDialog } = useDialog()
  const close = (open: boolean) => {
    if (!open) openDialog(null)
  }
  return (
    <>
      <Dialog open={dialog === "shortcuts"} onOpenChange={close}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
            <DialogDescription>Single keys work outside text fields and editors.</DialogDescription>
          </DialogHeader>
          <dl className="flex flex-col">
            {SHORTCUTS.map((s) => (
              <div
                key={s.action}
                className="flex items-center justify-between gap-4 border-b py-2 text-sm last:border-b-0"
              >
                <dt>{s.action}</dt>
                <dd>
                  <Shortcut keys={s.keys} />
                </dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>
      <NewFileDialog kind="workflows" open={dialog === "new-workflow"} onOpenChange={close} />
      <NewFileDialog kind="prompts" open={dialog === "new-prompt"} onOpenChange={close} />
    </>
  )
}
