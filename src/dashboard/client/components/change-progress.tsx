import { Progress as ProgressPrimitive } from "@base-ui/react/progress"
import { cn } from "cn"

import { ProgressIndicator, ProgressTrack } from "@/components/ui/progress"
import type { Status } from "@/lib/changes"

/**
 * A change's progress: a 96px bar, then `done/total`. Red while invalid, green once every task is done, amber
 * otherwise. `trackClassName` and `labelClassName` add to the bar's and the label's classes.
 */
export function ChangeProgress({
  done,
  total,
  status,
  trackClassName,
  labelClassName,
}: {
  done: number
  total: number
  status: Status
  trackClassName?: string
  labelClassName?: string
}) {
  const colour = status === "invalid" ? "bg-destructive" : total > 0 && done === total ? "bg-success" : "bg-warning"
  return (
    <ProgressPrimitive.Root value={total === 0 ? 0 : (done / total) * 100} className="flex items-center gap-2">
      <ProgressTrack className={cn("w-24 shrink-0", trackClassName)}>
        <ProgressIndicator className={colour} />
      </ProgressTrack>
      <span className={cn("font-mono text-xs text-muted-foreground tabular-nums", labelClassName)}>
        {done}/{total}
      </span>
    </ProgressPrimitive.Root>
  )
}
