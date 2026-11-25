import { Clock3Icon, FileTextIcon, LayoutGridIcon, type LucideIcon, WorkflowIcon } from "lucide-react"
import { createContext, type RefObject, useEffect, useRef } from "react"
import { useLocation } from "wouter"

import { to } from "@/lib/routes"
import { ALT, MOD } from "@/shell/platform"

/** The dialog the shell shows over the page: the shortcut sheet or a New file dialog. */
export type ShellDialog = "shortcuts" | "new-workflow" | "new-prompt" | null

/**
 * The page header's copy, which the `C` key runs: the header's copy button registers it while it is mounted (on a
 * change's, a workflow's or a prompt's page), `null` on every other page. `null` outside the shell.
 */
export const HeaderCopyContext = createContext<RefObject<(() => void) | null> | null>(null)

/** The pages G and a key goes to, as the shortcuts, the sheet and the search list them, with the sidebar's icon. */
export const GO_TO: readonly { key: string; label: string; icon: LucideIcon; href: () => string }[] = [
  { key: "n", label: "Now", icon: Clock3Icon, href: () => to.now() },
  { key: "a", label: "All projects", icon: LayoutGridIcon, href: () => to.projects() },
  { key: "w", label: "Workflows", icon: WorkflowIcon, href: () => to.workflows() },
  { key: "p", label: "Prompts", icon: FileTextIcon, href: () => to.prompts() },
]

/** Every shortcut of the dashboard, as the sheet lists them: by the place they work in. */
export const SHORTCUTS: { title: string; rows: { keys: string[]; action: string }[] }[] = [
  {
    title: "Anywhere",
    rows: [
      { keys: [MOD, "K"], action: "Open Search: go to anything, run an action" },
      { keys: [MOD, "P"], action: "Open Search (also inside an editor)" },
      { keys: [MOD, "S"], action: "Save the page's unsaved files" },
      { keys: [MOD, "B"], action: "Show or hide the sidebar (outside an editor)" },
      ...GO_TO.map((g) => ({ keys: ["G", g.key.toUpperCase()], action: `Go to ${g.label}` })),
      { keys: ["C"], action: "Copy the page's ID or name" },
      { keys: ["?"], action: "Show these shortcuts" },
    ],
  },
  {
    title: "Search",
    rows: [{ keys: [MOD, "C"], action: "Copy the highlighted entry's ID" }],
  },
  {
    title: "Lists",
    rows: [
      { keys: ["↑", "↓"], action: "Move in a list (J and K too)" },
      { keys: ["Enter"], action: "Open the item" },
      { keys: [ALT, "Click"], action: "On a band: collapse or expand every group" },
      { keys: [ALT, "↑", "↓"], action: "Move the task that has the focus" },
    ],
  },
  {
    title: "Markdown editor",
    rows: [
      { keys: [MOD, "B"], action: "Bold" },
      { keys: [MOD, "I"], action: "Italic" },
      { keys: [MOD, "E"], action: "Code" },
      { keys: [MOD, "K"], action: "Link" },
    ],
  },
  {
    title: "Workflow canvas",
    rows: [
      { keys: [MOD, "0"], action: "Fit to view" },
      { keys: [MOD, "="], action: "Zoom in" },
      { keys: [MOD, "-"], action: "Zoom out" },
    ],
  },
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
 * Now, All projects, Workflows or Prompts, ↑/↓ (or J/K) move in the list holding the focus, C runs the page header's
 * copy (`headerCopy`, nothing when the page has none). `dialogs` is the shell's dialog state: no key acts while a
 * dialog is shown.
 */
export function useGlobalKeys(
  dialogs: { dialog: ShellDialog; open: (d: ShellDialog) => void },
  headerCopy: RefObject<(() => void) | null>,
): void {
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
      if (key === "c") {
        const copy = headerCopy.current
        if (copy !== null) {
          event.preventDefault()
          copy()
        }
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
  }, [dialogs, navigate, headerCopy])
}
