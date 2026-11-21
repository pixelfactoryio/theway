import { NewFileDialog } from "@/components/new-file"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DIALOG_TITLE } from "@/components/ui-classes"
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
        <DialogContent className="max-h-[calc(100svh-2rem)] gap-0 overflow-y-auto p-0 sm:max-w-2xl">
          <DialogHeader className="gap-1 px-6 pt-5 pb-4">
            <DialogTitle className={DIALOG_TITLE}>Keyboard shortcuts</DialogTitle>
            <DialogDescription>Single keys work outside text fields and editors.</DialogDescription>
          </DialogHeader>
          {/* Two columns from 640px: the groups flow from one to the other, none cut in two. */}
          <div className="gap-8 border-t px-6 pt-2 pb-6 sm:columns-2">
            {SHORTCUTS.map((group) => (
              <section key={group.title} className="break-inside-avoid pt-3">
                <h3 className="flex h-6 items-center text-xs text-muted-foreground">{group.title}</h3>
                <dl className="flex flex-col">
                  {group.rows.map((s) => (
                    <div
                      key={s.action}
                      className="flex min-h-9 items-center justify-between gap-4 border-b border-rule py-2 last:border-b-0"
                    >
                      <dt>{s.action}</dt>
                      <dd>
                        <Shortcut keys={s.keys} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <NewFileDialog kind="workflows" open={dialog === "new-workflow"} onOpenChange={close} />
      <NewFileDialog kind="prompts" open={dialog === "new-prompt"} onOpenChange={close} />
    </>
  )
}
