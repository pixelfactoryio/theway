import { useEffect, useRef } from "react"
import { useLocation } from "wouter"

import { to } from "@/lib/routes"
import { MOD } from "@/shell/platform"

/** The dialog the shell shows over the page: the shortcut sheet or a New file dialog. */
export type ShellDialog = "shortcuts" | "new-workflow" | "new-prompt" | null

/** The pages G and a key goes to, as the shortcuts, the sheet and the search list them. */
export const GO_TO: readonly { key: string; label: string; href: () => string }[] = [
  { key: "n", label: "Now", href: () => to.now() },
  { key: "a", label: "All projects", href: () => to.projects() },
  { key: "w", label: "Workflows", href: () => to.workflows() },
  { key: "p", label: "Prompts", href: () => to.prompts() },
]

/** Every shortcut of the dashboard, as the sheet lists them. */
export const SHORTCUTS: { keys: string[]; action: string }[] = [
  { keys: [MOD, "K"], action: "Open the palette: go to anything, run an action" },
  { keys: [MOD, "P"], action: "Open the palette (also inside an editor)" },
  { keys: [MOD, "S"], action: "Save the page's unsaved files" },
  { keys: [MOD, "B"], action: "Show or hide the sidebar (outside an editor)" },
  { keys: ["↑", "↓"], action: "Move in a list (J and K too)" },
  { keys: ["Enter"], action: "Open the item" },
  ...GO_TO.map((g) => ({ keys: ["G", g.key.toUpperCase()], action: `Go to ${g.label}` })),
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
 * Now, All projects, Workflows or Prompts, ↑/↓ (or J/K) move in the list holding the focus. `dialogs` is the shell's
 * dialog state: no key acts while a dialog is shown.
 */
export function useGlobalKeys(dialogs: { dialog: ShellDialog; open: (d: ShellDialog) => void }): void {
  const [, navigate] = useLocation()
  const pendingG = useRef<number>(0)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) return
      if (dialogs.dialog !== null) return
      const key = event.key
      if (key === "?") {
        event.preventDefault()
        dialogs.open("shortcuts")
        return
      }
      if (Date.now() - pendingG.current < 1000) {
        pendingG.current = 0
        const target = GO_TO.find((g) => g.key === key)?.href() ?? null
        if (target !== null) {
          event.preventDefault()
          navigate(target)
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
  }, [dialogs, navigate])
}
