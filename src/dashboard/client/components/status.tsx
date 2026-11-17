import {
  ArchiveIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CircleDotIcon,
  type LucideIcon,
} from "lucide-react"
import { cn } from "cn"

import { Badge } from "@/components/reui/badge"
import { Progress } from "@/components/ui/progress"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { STATUS_LABEL, type Status } from "@/lib/changes"
import { errorCount } from "@/lib/files"

const VARIANT = {
  invalid: "destructive-light",
  "in-progress": "warning-light",
  "not-started": "outline",
  ready: "success-light",
  archived: "secondary",
} as const

/** Each status's icon, as its badge, its icon alone and the Changes list's status chips show it. */
export const ICON: Record<Status, LucideIcon> = {
  invalid: CircleAlertIcon,
  "in-progress": CircleDotIcon,
  "not-started": CircleDashedIcon,
  ready: CircleCheckIcon,
  archived: ArchiveIcon,
}

/** A status as a badge: its icon, then its label; with `tip`, the text in a tooltip. */
export function StatusBadge({ status, tip }: { status: Status; tip?: string }) {
  const Icon = ICON[status]
  const badge = (
    <Badge variant={VARIANT[status]}>
      <Icon aria-hidden="true" />
      {STATUS_LABEL[status]}
    </Badge>
  )
  if (tip === undefined) return badge
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>{badge}</TooltipTrigger>
      <TooltipContent className="max-w-md">{tip}</TooltipContent>
    </Tooltip>
  )
}

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

/** A status as its mark alone, named and explained by its label. */
export function StatusIcon({ status }: { status: Status }) {
  const label = STATUS_LABEL[status]
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span role="img" aria-label={label} className="inline-flex size-4 shrink-0 items-center justify-center" />
        }
      >
        <StatusMark status={status} />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** The `N errors` badge: `destructive-light`, the Invalid icon, `N errors` (`1 error`), the first line in its tooltip. */
export function ErrorsBadge({ errors }: { errors: readonly string[] }) {
  const badge = (
    <Badge variant="destructive-light" className="tabular-nums">
      <CircleAlertIcon aria-hidden="true" />
      {errorCount(errors.length)}
    </Badge>
  )
  if (errors.length === 0) return null
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>{badge}</TooltipTrigger>
      <TooltipContent className="max-w-md">{errors[0]}</TooltipContent>
    </Tooltip>
  )
}

/**
 * The tasks done as a bar, then `done/total`: the bar `width` wide, green once every task is done, else blue; the count
 * with `countClassName`.
 */
export function TaskProgress({
  done,
  total,
  width,
  countClassName,
}: {
  done: number
  total: number
  width: string
  countClassName: string
}) {
  return (
    <>
      <Progress
        value={total === 0 ? 0 : (done / total) * 100}
        className={cn(
          width,
          total > 0 && done === total
            ? "[&_[data-slot=progress-indicator]]:bg-success"
            : "[&_[data-slot=progress-indicator]]:bg-warning",
        )}
        aria-label={`${done} of ${total} tasks done`}
      />
      <span className={countClassName}>
        {done}/{total}
      </span>
    </>
  )
}

/** A status as the panel header shows it: its mark and label in its colour, flat. */
export function StatusPill({ status }: { status: Status }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-sm font-medium",
        status === "in-progress" && "text-warning",
        status === "ready" && "text-success",
        status === "invalid" && "text-destructive",
        (status === "not-started" || status === "archived") && "text-muted-foreground",
      )}
    >
      <StatusMark status={status} />
      {STATUS_LABEL[status]}
    </span>
  )
}

/** A file's status as the panel header shows it: Valid, or `N errors`, flat. */
export function FileStatusPill({ errors }: { errors: number }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-sm font-medium tabular-nums",
        errors === 0 ? "text-success" : "text-destructive",
      )}
    >
      <StatusMark status={errors === 0 ? "ready" : "invalid"} />
      {errors === 0 ? "Valid" : errorCount(errors)}
    </span>
  )
}
