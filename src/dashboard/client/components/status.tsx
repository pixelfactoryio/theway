import { CircleAlertIcon } from "lucide-react"
import { cn } from "cn"

import { Badge } from "@/components/reui/badge"
import { STATUS_LABEL, type Status } from "@/lib/changes"
import { errorCount } from "@/lib/files"

/**
 * A status as its 14px icon, drawn in SVG: a grey dashed ring for Not started, an amber ring half filled for In
 * progress, a red disc with a cross for Invalid, a green disc with a check for Ready to archive, and the same check on
 * a grey disc for Archived. The statuses are the only colour of a list besides the blue of a selection.
 */
export function StatusMark({ status, className }: { status: Status; className?: string }) {
  const tone =
    status === "invalid"
      ? "text-destructive"
      : status === "in-progress"
        ? "text-warning"
        : status === "ready"
          ? "text-success"
          : "text-muted-foreground"
  return (
    <svg
      aria-hidden="true"
      data-status={status}
      viewBox="0 0 16 16"
      className={cn("size-3.5 shrink-0 fill-none stroke-current", tone, className)}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {status === "not-started" ? <circle cx="8" cy="8" r="5.75" strokeDasharray="2.4 1.95" /> : null}
      {status === "in-progress" ? (
        <>
          <circle cx="8" cy="8" r="5.75" />
          <path d="M8 4.5a3.5 3.5 0 0 1 0 7z" className="fill-current stroke-none" />
        </>
      ) : null}
      {status === "invalid" ? (
        <>
          <circle cx="8" cy="8" r="6.5" className="fill-current stroke-none" />
          <path d="m5.9 5.9 4.2 4.2M10.1 5.9l-4.2 4.2" className="stroke-background" />
        </>
      ) : null}
      {status === "ready" || status === "archived" ? (
        <>
          <circle cx="8" cy="8" r="6.5" className="fill-current stroke-none" />
          <path d="m5.4 8.2 1.8 1.8 3.4-3.6" className="stroke-background" />
        </>
      ) : null}
    </svg>
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
 * A status as the panel header shows it, flat: its mark in the colour and its label at 500 in the colour's text step
 * (AA on the card, light and dark), no tint and no outline; a status without colour in the secondary ink. `label`
 * replaces the status's own, as a file's Valid or `N errors`.
 */
export function StatusPill({ status, label }: { status: Status; label?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-2 text-xs font-medium whitespace-nowrap tabular-nums",
        PILL[status],
      )}
    >
      <StatusMark status={status} />
      {label ?? STATUS_LABEL[status]}
    </span>
  )
}

const PILL = {
  "in-progress": "text-warning-foreground dark:text-warning",
  ready: "text-success-foreground dark:text-success",
  invalid: "text-destructive-foreground dark:text-destructive",
  "not-started": "text-muted-foreground",
  archived: "text-muted-foreground",
} as const satisfies Record<Status, string>
