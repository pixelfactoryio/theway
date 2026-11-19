import { PanelRightIcon } from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { panelToggleLabel } from "@/lib/panel"
import { PanelPortal } from "@/shell/panel"

export { usePanelOpen } from "@/shell/panel"

/** The tab strip's toggle of a record page's panel: `Hide panel` or `Show panel`. */
export function PanelToggle({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const label = panelToggleLabel(open)
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-pressed={open}
            aria-label={label}
            className="text-muted-foreground"
            onClick={() => onOpenChange(!open)}
          />
        }
      >
        <PanelRightIcon aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/**
 * A record page's body: the main area, and the panel named `name`, which the shell shows in its right column (docked
 * from 1280px, over the page below).
 */
export function RecordBody({ name, panel, children }: { name: string; panel: ReactNode; children: ReactNode }) {
  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      <PanelPortal name={name}>{panel}</PanelPortal>
    </>
  )
}
