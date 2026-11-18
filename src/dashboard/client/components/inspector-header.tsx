import { cn } from "cn"
import type { ReactNode } from "react"

import { IconTile } from "@/components/reui/icon-tile"
import { type Tone, toneTile } from "@/components/workflow-card"

/**
 * An inspector panel's header: the icon in its tone's tile, a muted caption over the title (in the code font when
 * `mono`), and `action` at the end. `align="start"` tops the tile with the caption.
 */
export function InspectorHeader({
  tone,
  icon,
  caption,
  title,
  mono = false,
  action,
  align = "center",
}: {
  tone: Tone
  icon: ReactNode
  caption?: ReactNode
  title: string
  mono?: boolean
  action?: ReactNode
  align?: "center" | "start"
}) {
  return (
    <div className={cn("flex gap-3", align === "start" ? "items-start" : "items-center")}>
      <IconTile size="sm" {...toneTile(tone)}>
        {icon}
      </IconTile>
      <div className="flex min-w-0 flex-1 flex-col">
        {caption !== undefined ? <span className="text-xs text-muted-foreground">{caption}</span> : null}
        <h2 className={cn("truncate text-sm font-medium", mono && "font-mono")}>{title}</h2>
      </div>
      {action}
    </div>
  )
}
