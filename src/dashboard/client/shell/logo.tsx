import { cn } from "cn"
import { RouteIcon } from "lucide-react"

/** theway's logo: the route mark on a solid ink tile, then "theway" in the interface font at 600. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <span
        aria-hidden="true"
        className="flex size-5 shrink-0 items-center justify-center rounded-md bg-foreground text-background"
      >
        <RouteIcon className="size-3" />
      </span>
      <span className="truncate font-semibold text-foreground group-data-[collapsible=icon]:hidden">theway</span>
    </span>
  )
}
