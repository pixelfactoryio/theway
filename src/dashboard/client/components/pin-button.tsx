import { cn } from "cn"
import { StarIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

/**
 * The star that pins a project or a group to the sidebar, or unpins it: filled in the ink while pinned, an outline in
 * the secondary ink otherwise, seen at rest. The same on a list's row and in a page's header.
 */
export function PinButton({ pinned, label, onToggle }: { pinned: boolean; label: string; onToggle: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-pressed={pinned}
      aria-label={pinned ? `Unpin ${label}` : `Pin ${label}`}
      onClick={onToggle}
      className={cn("aria-pressed:bg-transparent", pinned ? "text-foreground" : "text-muted-foreground")}
    >
      <StarIcon aria-hidden="true" className={cn("size-3.5", pinned && "fill-current")} />
    </Button>
  )
}
