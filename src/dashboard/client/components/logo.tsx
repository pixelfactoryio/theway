import { cn } from "cn"
import { RouteIcon } from "lucide-react"

/** theway's logo: the route mark in the brand amber on its tint, then "theway" in the UI font. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <span
        aria-hidden="true"
        className="flex size-5 shrink-0 items-center justify-center rounded-sm bg-brand/15 text-brand"
      >
        <RouteIcon className="size-3.5" />
      </span>
      <span className="text-sm font-semibold tracking-tight">theway</span>
    </span>
  )
}
