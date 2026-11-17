import { useEffect, useRef, useSyncExternalStore } from "react"
import { useLocation } from "wouter"

import { NewFileDialog } from "@/components/new-file"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { MAC } from "@/shell/platform"

/** The dialog the shell shows over the page: the shortcut sheet or a New file dialog. */
type ShellDialog = "shortcuts" | "new-workflow" | "new-prompt" | null

let shown: ShellDialog = null
const listeners = new Set<() => void>()

/** Opens one of the shell's dialogs; `null` closes it. */
export function openDialog(dialog: ShellDialog): void {
  shown = dialog
  for (const l of listeners) l()
}

const subscribe = (l: () => void): (() => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

const MOD = MAC ? "⌘" : "Ctrl"

/** Every shortcut of the dashboard, as the sheet lists them. */
export const SHORTCUTS: { keys: string[]; action: string }[] = [
  { keys: [MOD, "K"], action: "Open the palette: go to anything, run an action" },
  { keys: [MOD, "P"], action: "Open the palette (also inside an editor)" },
  { keys: [MOD, "S"], action: "Save the page's unsaved files" },
  { keys: [MOD, "B"], action: "Show or hide the sidebar (outside an editor)" },
  { keys: ["↑", "↓"], action: "Move in a list (J and K too)" },
  { keys: ["Enter"], action: "Open the item" },
  { keys: ["G", "N"], action: "Go to Now" },
  { keys: ["G", "A"], action: "Go to All projects" },
  { keys: ["G", "W"], action: "Go to Workflows" },
  { keys: ["G", "P"], action: "Go to Prompts" },
  { keys: ["?"], action: "Show these shortcuts" },
]

/** Whether a key event comes from a text field or an editor, where single keys type text. */
function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || target.closest("input, textarea, select, [contenteditable], .cm-editor") !== null
}

/** The next or previous item of the list holding the focus, or the sidebar's first item when none has it. */
function moveInList(delta: 1 | -1): boolean {
  const active = document.activeElement
  const list = active instanceof HTMLElement ? active.closest<HTMLElement>("[data-nav-list]") : null
  if (list === null) {
    const first = document.querySelector<HTMLElement>("[data-nav-list] [data-nav-item]")
    if (first === null) return false
    first.focus()
    return true
  }
  const items = [...list.querySelectorAll<HTMLElement>("[data-nav-item]")].filter((e) => e.offsetParent !== null)
  const at = items.indexOf(active as HTMLElement)
  const next = items[Math.min(items.length - 1, Math.max(0, (at < 0 ? -1 : at) + delta))]
  next?.focus()
  return next !== undefined
}

/**
 * The shell's single-key shortcuts, outside text fields and editors: `?` opens the sheet, G then N, A, W or P goes to
 * Now, All projects, Workflows or Prompts, ↑/↓ (or J/K) move in the list holding the focus.
 */
export function useGlobalKeys(): void {
  const [, navigate] = useLocation()
  const pendingG = useRef<number>(0)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) return
      if (shown !== null) return
      const key = event.key
      if (key === "?") {
        event.preventDefault()
        openDialog("shortcuts")
        return
      }
      if (Date.now() - pendingG.current < 1000) {
        pendingG.current = 0
        const to = { n: "/?", a: "/projects?", w: "/workflows?", p: "/prompts?" }[key] ?? null
        if (to !== null) {
          event.preventDefault()
          navigate(to)
        }
        return
      }
      if (key === "g") {
        pendingG.current = Date.now()
        return
      }
      if (key === "ArrowDown" || key === "j") {
        if (moveInList(1)) event.preventDefault()
      } else if (key === "ArrowUp" || key === "k") {
        if (moveInList(-1)) event.preventDefault()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [navigate])
}

/** The shell's dialogs: the shortcut sheet, New workflow and New prompt. */
export function ShellDialogs() {
  const dialog = useSyncExternalStore(subscribe, () => shown)
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
                  <KbdGroup>
                    {s.keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </KbdGroup>
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
