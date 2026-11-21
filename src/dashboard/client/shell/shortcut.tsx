import { cn } from "cn"

import { Kbd, KbdGroup } from "@/components/ui/kbd"

/**
 * A key cap: 20px, `text-xs` (14px) Inter in the secondary ink, a hairline outline on the panel's colour, 4px corners, so it stays
 * a cap on a highlighted row as on the sidebar's ground. In a tooltip, the shipped inverted cap.
 */
const CAP = "border bg-background font-normal in-data-[slot=tooltip-content]:border-transparent"

/** A shortcut's keys, one key cap each (`[MOD, "K"]`: ⌘ K on macOS, Ctrl K elsewhere). */
export function Shortcut({ keys, className }: { keys: readonly string[]; className?: string }) {
  return (
    <KbdGroup className={cn("shrink-0", className)}>
      {keys.map((k) => (
        <Kbd key={k} className={CAP}>
          {k}
        </Kbd>
      ))}
    </KbdGroup>
  )
}
