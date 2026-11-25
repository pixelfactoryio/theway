import { BlockType, type EditorView } from "@codemirror/view"
import { cn } from "cn"
import { CheckIcon, PencilIcon } from "lucide-react"
import {
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"

import type { DoneAnswers } from "@/components/change-dialogs"
import { Button } from "@/components/ui/button"
import type { DraftStore } from "@/drafts/draft-store"
import type { Confirm } from "@/drafts/use-drafts"
import { HeaderEditContext } from "@/shell/keys"

/** A page's edit mode, from `useEditMode`. */
export type EditMode = {
  /** The page is editing: its shown file is editable. */
  editing: boolean
  /** The shown view holds a file's text, which the mode applies to: only then is the Edit/Done control shown. */
  available: boolean
  /** Enters editing: the caret at the point `at` (a double-click's), else at the first line in view. */
  enter: (at?: { x: number; y: number }) => void
  /** Returns to reading, asking first while the page holds unsaved changes. */
  done: () => void
  /** A Markdown file is shown as its source (Source), not formatted (Live): only while editing. */
  source: boolean
  setSource: (source: boolean) => void
  /** Takes the Edit/Done button, which gets the focus back after Done. */
  bindButton: (button: HTMLButtonElement | null) => void
  /** The answers of the "Save your changes?" dialog, for `ChangeDialogs`. */
  answers: DoneAnswers
}

/**
 * The start of the first line in view in `view`: the first line of text that starts at or under the top of its scroll
 * root (or of the editor, when lower), so the caret shows and no drawn block (a hidden title, a table, a code block)
 * turns to its source under it; the line at the top when none does.
 */
function firstLineInView(view: EditorView): number {
  const root = view.dom.closest<HTMLElement>("[data-scroll-root]") ?? view.scrollDOM
  const box = root.getBoundingClientRect()
  const top = Math.max(box.top, view.contentDOM.getBoundingClientRect().top) - view.documentTop
  const bottom = box.bottom - view.documentTop
  const first = view.lineBlockAtHeight(top + 1)
  let block = first
  while ((block.top < top || block.type !== BlockType.Text) && block.to < view.state.doc.length) {
    const next = view.lineBlockAt(block.to + 1)
    if (next.top >= bottom) break
    block = next
  }
  if (block.top < top || block.type !== BlockType.Text) block = first
  return view.state.doc.lineAt(Math.min(block.from, view.state.doc.length)).from
}

/** How long after the dialog's answer its focus return may come: its close transition, 100ms, with room. */
const DIALOG_CLOSE_MS = 1000

/**
 * A page's reading and editing modes. A page opens reading; Edit (the control, the `E` key, a double-click on the text)
 * enters editing, and Done (the control, Esc) returns to reading, asking "Save your changes?" (`ChangeDialogs`, through
 * the page's `setConfirm`) while the page holds unsaved changes: Keep editing, Discard (`discardAll`) or Save (`save`,
 * which stays in editing when it answers false). A view that holds no file's text (`available` false) ends editing
 * without asking; the drafts stay. `store` is the shown file's draft, whose view takes the focus on entering.
 */
export function useEditMode({
  available,
  store,
  setConfirm,
  dirtyCount,
  save,
  discardAll,
}: {
  available: boolean
  store: DraftStore | null
  setConfirm: (c: Confirm | null) => void
  /** The number of the page's files with unsaved changes. */
  dirtyCount: () => number
  /** Writes every unsaved file of the page, asking "Save anyway" when one has errors; true once all are written. */
  save: () => Promise<boolean>
  /** Drops every unsaved change of the page, without asking. */
  discardAll: () => void
}): EditMode {
  const [shown, setShown] = useState(false)
  // A view with no text ends editing without asking.
  if (shown && !available) setShown(false)
  const editing = shown && available
  const [source, setSource] = useState(false)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  // Where the caret goes once the editor is in editing, and whether the button takes the focus after Done.
  const caret = useRef<number | null>(null)
  const focusButton = useRef(false)
  // When the dialog's Discard or Save returned to reading: the dialog's own focus return, as it closes just after,
  // goes to the button too. A later dialog's (a Save that ended once its dialog had closed) does not.
  const dialogToButton = useRef(0)

  const latest = useRef({ store, dirtyCount, save, discardAll, editing, available })
  useLayoutEffect(() => {
    latest.current = { store, dirtyCount, save, discardAll, editing, available }
  })

  const enter = useCallback((at?: { x: number; y: number }) => {
    const { store: s, editing: e, available: a } = latest.current
    if (e || !a) return
    const view = s?.view ?? null
    // Taken before the switch: the strip and the reflow of entering move the text.
    caret.current = view === null ? null : ((at !== undefined ? view.posAtCoords(at) : null) ?? firstLineInView(view))
    setSource(false)
    setShown(true)
  }, [])

  const finish = useCallback((fromDialog: boolean) => {
    focusButton.current = true
    dialogToButton.current = fromDialog ? Date.now() : 0
    setShown(false)
  }, [])

  const done = useCallback(() => {
    if (!latest.current.editing) return
    const n = latest.current.dirtyCount()
    if (n === 0) finish(false)
    else setConfirm({ kind: "done", n })
  }, [finish, setConfirm])

  // After the views' own effects, which put their state in editing: the caret, then the focus, without scrolling.
  useEffect(() => {
    if (editing && caret.current !== null) {
      const view = latest.current.store?.view ?? null
      const at = caret.current
      caret.current = null
      if (view === null) return
      view.dispatch({ selection: { anchor: Math.min(at, view.state.doc.length) } })
      view.focus()
    } else if (!editing && focusButton.current) {
      focusButton.current = false
      buttonRef.current?.focus({ preventScroll: true })
    }
  }, [editing])

  const answers: DoneAnswers = {
    discard: () => {
      setConfirm(null)
      latest.current.discardAll()
      finish(true)
    },
    save: () => {
      setConfirm(null)
      void latest.current.save().then((ok) => {
        if (ok) finish(true)
      })
    },
    // Back to the Edit button once reading again; else (Keep editing, a save still running or refused) where it was.
    finalFocus: () => {
      const recent = Date.now() - dialogToButton.current < DIALOG_CLOSE_MS
      dialogToButton.current = 0
      return recent && buttonRef.current !== null ? buttonRef.current : true
    },
  }

  const bindButton = useCallback((button: HTMLButtonElement | null) => {
    buttonRef.current = button
  }, [])

  return { editing, available, enter, done, source: editing && source, setSource, bindButton, answers }
}

/**
 * The view tabs' Edit/Done control, at the right of the row while the shown view holds a file's text: an outline `sm`
 * button, Edit (`E`) while reading, Done (Esc) while editing. Edit registers itself for the `E` key (`HeaderEditContext`).
 */
export function EditControl({ mode }: { mode: EditMode }) {
  const triggerRef = useContext(HeaderEditContext)
  const { editing, available, enter, done, bindButton } = mode
  // Again after each render, so the registered Edit is this render's.
  useEffect(() => {
    if (triggerRef === null) return
    triggerRef.current = editing || !available ? null : () => enter()
    return () => {
      triggerRef.current = null
    }
  })
  if (!available) return null
  return (
    <Button
      ref={bindButton}
      variant="outline"
      size="sm"
      aria-keyshortcuts={editing ? "Escape" : "E"}
      onClick={() => (editing ? done() : enter())}
    >
      {editing ? <CheckIcon aria-hidden="true" /> : <PencilIcon aria-hidden="true" />}
      {editing ? "Done" : "Edit"}
    </Button>
  )
}

/**
 * The handlers an editor's container takes for the mode: a double-click on the text while reading enters editing with
 * the caret where it was made; Esc while editing, when the editor left it unhandled (a code view's search closes
 * first), is Done.
 */
export function modeHandlers(mode: EditMode) {
  return {
    onDoubleClick: (event: MouseEvent<HTMLElement>) => {
      if (mode.editing || !(event.target instanceof Element) || event.target.closest(".cm-content") === null) return
      mode.enter({ x: event.clientX, y: event.clientY })
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key !== "Escape" || !mode.editing || event.defaultPrevented) return
      event.preventDefault()
      // The dialog Done may open listens for Escape on the document: this one must not reach it and close it.
      event.stopPropagation()
      mode.done()
    },
  }
}

/**
 * The pencil of an in-place field (a change's title, its description in Details, a task's text): a ghost `icon-xs`
 * button in the secondary ink, shown at rest, that opens the field as a click on its text does.
 */
export function EditPencil({ label, onClick, className }: { label: string; onClick: () => void; className?: string }) {
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      onClick={onClick}
      className={cn("shrink-0 text-muted-foreground hover:text-foreground", className)}
    >
      <PencilIcon aria-hidden="true" />
    </Button>
  )
}
