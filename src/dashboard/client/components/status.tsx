import {
  ArchiveIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CircleDotIcon,
  type LucideIcon,
} from "lucide-react"

import { Badge } from "@/components/reui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { STATUS_LABEL, type Status } from "@/lib/changes"

const VARIANT = {
  invalid: "destructive-light",
  "in-progress": "info-light",
  "not-started": "outline",
  ready: "success-light",
  archived: "secondary",
} as const

const ICON: Record<Status, LucideIcon> = {
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

/** A status as its icon alone, named and explained by its label. */
export function StatusIcon({ status }: { status: Status }) {
  const Icon = ICON[status]
  const label = STATUS_LABEL[status]
  return (
    <Tooltip>
      <TooltipTrigger render={<span role="img" aria-label={label} className="inline-flex shrink-0" />}>
        <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
