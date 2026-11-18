import { ChevronRightIcon } from "lucide-react"
import type { ReactNode } from "react"

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Kbd } from "@/components/ui/kbd"
import { collapsedKey, isCollapsed, withCollapsed } from "@/lib/collapse"
import { COLLAPSED } from "@/lib/preferences"
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
 * One group of a grouped list: its band, full width, one surface step above the page and sticky under the page's top
 * row, then its rows while open. The band is one button (chevron, `mark`, `label`, the muted `count`) that toggles the
 * group; with Alt held it asks `onToggle` to toggle every group of the page. `actions` sit at the band's right, outside
 * the button.
 */
export function GroupBand({
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
  count?: number
  open: boolean
  /** The group asked open (`open`), with `all` when Alt was held. */
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
      <h2 className="sticky top-0 z-10 flex h-9 items-center bg-band text-sm">
        <CollapsibleTrigger className="group/band flex h-full min-w-0 flex-1 items-center gap-2 px-6 text-left font-medium transition-colors outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
          <ChevronRightIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground transition-transform group-data-panel-open/band:rotate-90"
          />
          {mark}
          <span className="truncate">{label}</span>
          {count !== undefined ? <span className="font-normal text-muted-foreground tabular-nums">{count}</span> : null}
        </CollapsibleTrigger>
        {actions}
      </h2>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  )
}

/** The hint under a grouped list: Alt and a click on a band toggles every group. */
export function CollapseHint() {
  return (
    <p className="px-6 pt-4 pb-8 text-xs text-muted-foreground">
      <Kbd>Alt</Kbd>-click a header to collapse or expand all
    </p>
  )
}
