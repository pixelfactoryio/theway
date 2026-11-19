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
        <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className={DIALOG_TITLE}>Keyboard shortcuts</DialogTitle>
            <DialogDescription>Single keys work outside text fields and editors.</DialogDescription>
          </DialogHeader>
          {/* Two columns from 640px: the groups flow from one to the other, none cut in two. */}
          <div className="gap-8 sm:columns-2">
            {SHORTCUTS.map((group) => (
              <section key={group.title} className="mb-4 break-inside-avoid last:mb-0">
                <h3 className="pb-1 text-xs font-medium text-muted-foreground">{group.title}</h3>
                <dl className="flex flex-col">
                  {group.rows.map((s) => (
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
