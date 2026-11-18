import { CircleAlertIcon } from "lucide-react"
import { cn } from "cn"

import { Badge } from "@/components/reui/badge"
import { STATUS_LABEL, type Status } from "@/lib/changes"
import { errorCount } from "@/lib/files"

/**
 * A status as its mark: an 8px square drawn in CSS. Hollow for Not started, half filled for In progress, filled for
 * Ready to archive and Invalid, dim for Archived.
 */
export function StatusMark({ status, className }: { status: Status; className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-status={status}
      className={cn(
        "inline-block size-2 shrink-0 rounded-[2px] border-[1.5px]",
        status === "not-started" && "border-muted-foreground",
        status === "in-progress" && "border-warning bg-[linear-gradient(90deg,var(--warning)_50%,transparent_50%)]",
        status === "ready" && "border-success bg-success",
        status === "invalid" && "border-destructive bg-destructive",
        status === "archived" && "border-muted-foreground/60 bg-muted-foreground/60",
        className,
      )}
    />
  )
}

/** The `N errors` badge: `destructive-light`, the Invalid icon, `N errors` (`1 error`); nothing when there is none. */
export function ErrorsBadge({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <Badge variant="destructive-light" className="tabular-nums">
      <CircleAlertIcon aria-hidden="true" />
      {errorCount(count)}
    </Badge>
  )
}

/**
 * A status as the panel header shows it: its mark and label in its colour, flat. `label` replaces the status's own, as
 * a file's Valid or `N errors`.
 */
export function StatusPill({ status, label }: { status: Status; label?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-sm font-medium tabular-nums",
        status === "in-progress" && "text-warning",
        status === "ready" && "text-success",
        status === "invalid" && "text-destructive",
        (status === "not-started" || status === "archived") && "text-muted-foreground",
      )}
    >
      <StatusMark status={status} />
      {label ?? STATUS_LABEL[status]}
    </span>
  )
}
