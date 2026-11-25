import { redo, redoDepth, undo, undoDepth } from "@codemirror/commands"
import { cn } from "cn"
import { Redo2Icon, Undo2Icon } from "lucide-react"
import { type ReactNode, useSyncExternalStore } from "react"

import { runEditing } from "@/components/code-view"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { PILL_TAB } from "@/components/ui-classes"
import type { DraftStore } from "@/drafts/draft-store"
import { Shortcut } from "@/shell/shortcut"

/** A toolbar strip's row: 40px between hairlines, its controls 2px apart, on the panel's colour (the canvas's, the editing strip's). */
export const TOOLBAR_ROW = "flex h-10 shrink-0 items-center gap-0.5 border-y bg-background px-3 text-muted-foreground"

/** A layout toggle, as a pill tab: the pressed one on the blue tint. */
export const LAYOUT_PILL = cn(
  PILL_TAB,
  "border hover:bg-transparent aria-pressed:border-transparent aria-pressed:bg-selected aria-pressed:text-foreground",
)

/**
 * A toolbar strip's button: ghost, in the secondary ink, its tooltip naming it with its keys. With `keepFocus`, a
 * mouse down on it does not take the focus, so an editor keeps its selection.
 */
export function ToolbarButton({
  tip,
  keys,
  label,
  disabled = false,
  size = "icon-sm",
  keepFocus = false,
  onClick,
  children,
}: {
  tip: string
  keys?: string[]
  label: string
  disabled?: boolean
  size?: "icon-sm" | "sm"
  keepFocus?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size={size}
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
            onMouseDown={keepFocus ? (event) => event.preventDefault() : undefined}
            className="text-muted-foreground hover:text-foreground"
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>
        {tip}
        {keys !== undefined ? <Shortcut keys={keys} /> : null}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * The Undo and Redo buttons: they act on the draft's state through its dispatch, in either mode (`runEditing`), and
 * update on every transaction. `after` runs after each (the editing strip gives the editor the focus back).
 */
export function HistoryButtons({
  store,
  keepFocus = false,
  after,
}: {
  store: DraftStore
  keepFocus?: boolean
  after?: () => void
}) {
  const state = useSyncExternalStore(store.subscribe, store.getState)
  const run = (command: typeof undo) => {
    runEditing(store, command)
    after?.()
  }
  return (
    <>
      <ToolbarButton
        tip="Undo"
        label="Undo"
        keepFocus={keepFocus}
        disabled={undoDepth(state) === 0}
        onClick={() => run(undo)}
      >
        <Undo2Icon aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        tip="Redo"
        label="Redo"
        keepFocus={keepFocus}
        disabled={redoDepth(state) === 0}
        onClick={() => run(redo)}
      >
        <Redo2Icon aria-hidden="true" />
      </ToolbarButton>
    </>
  )
}
