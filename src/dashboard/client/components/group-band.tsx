import { cn } from "cn"
import { ChevronDownIcon } from "lucide-react"
import type { ReactNode } from "react"

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { collapsedKey, isCollapsed, withCollapsed } from "@/lib/collapse"
import { COLLAPSED } from "@/lib/preferences"
import { ALT } from "@/shell/platform"
import { Shortcut } from "@/shell/shortcut"
import { useStored } from "@/shell/storage"

/** A page's collapsed groups, kept in this browser per page; `page` names the page (`now`, `project:<key>`, …). */
export function useCollapsed(page: string): {
  /** Whether `group` is collapsed: as last chosen on this page, else `byDefault`. */
  collapsed: (group: string, byDefault?: boolean) => boolean
  /** Collapses (or opens) `groups`, and keeps the choice. */
  set: (groups: readonly string[], collapsed: boolean) => void
} {
  // Another page in the same component (a project's page to another's) reads that page's choices.
  const [choices, setChoices] = useStored(collapsedKey(page), COLLAPSED)
  return {
    collapsed: (group, byDefault = false) => isCollapsed(choices, group, byDefault),
    set: (groups, collapsed) => setChoices(withCollapsed(choices, groups, collapsed)),
  }
}

/**
 * One section of a list: its band, a filled bar with 6px corners on the panel's 8px inset, sticky under the
 * list's column head; then its rows while open. The band is one button: the status `mark` where rows keep
 * theirs, the `label` in the ink at 600, the `count` in the secondary ink,
 * and a caret at the right that turns while the section is closed. With Alt held it asks `onToggle` to toggle every
 * section of the page. `actions` sit at the band's right, outside the button.
 */
export function SectionBand({
  label,
  mark,
  count,
  open,
  onToggle,
  actions,
  children,
}: {
  label: ReactNode
  mark?: ReactNode
  count?: number | string
  open: boolean
  /** The section asked open (`open`), with `all` when Alt was held. */
  onToggle: (open: boolean, all: boolean) => void
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <Collapsible
      open={open}
      onOpenChange={(next, details) => onToggle(next, (details.event as Partial<MouseEvent>).altKey === true)}
      render={<section />}
    >
      <h2 className="sticky top-8 z-10 bg-background px-2 pt-2">
        <span className="mb-1 flex h-9 items-center rounded-md bg-band">
          <CollapsibleTrigger className="group/band flex h-full min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left transition-colors outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
            {mark}
            <span className="truncate font-semibold">{label}</span>
            {count !== undefined ? <span className="shrink-0 text-muted-foreground tabular-nums">{count}</span> : null}
            <ChevronDownIcon
              aria-hidden="true"
              className={cn(
                "ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform",
                !open && "-rotate-90",
              )}
            />
          </CollapsibleTrigger>
          {actions}
        </span>
      </h2>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  )
}

/** The hint under a sectioned list, in its `ListFoot`: Alt and a click on a band toggles every group. */
export function CollapseHint() {
  return (
    <p className="px-4 pt-4 text-xs text-muted-foreground">
      <Shortcut keys={[ALT]} />
      -click a band to collapse or expand every group
    </p>
  )
}
