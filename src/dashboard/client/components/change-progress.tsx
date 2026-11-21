import { Progress as ProgressPrimitive } from "@base-ui/react/progress"
import { cn } from "cn"

import type { Status } from "@/lib/changes"

/**
 * A change's progress: `done/total` in the secondary ink, tabular, then a 14px ring that fills as its tasks are done:
 * red while invalid, green once every task is done, the accent otherwise. The progressbar is named "Tasks done" and reads
 * its value as `done of total`: the visible count and the ring are presentational.
 */
export function ChangeProgress({
  done,
  total,
  status,
  className,
}: {
  done: number
  total: number
  status: Status
  className?: string
}) {
  const share = total === 0 ? 0 : done / total
  const stroke =
    status === "invalid" ? "stroke-destructive" : total > 0 && done === total ? "stroke-success" : "stroke-primary"
  return (
    <ProgressPrimitive.Root
      value={share * 100}
      aria-label="Tasks done"
      getAriaValueText={() => `${done} of ${total}`}
      className={cn("flex items-center justify-end gap-2", className)}
    >
      <span aria-hidden="true" className="text-muted-foreground tabular-nums">
        {done}/{total}
      </span>
      <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5 shrink-0 -rotate-90 fill-none">
        <circle cx="8" cy="8" r="6" strokeWidth={2} className="stroke-track" />
        {share > 0 ? (
          <circle
            cx="8"
            cy="8"
            r="6"
            strokeWidth={2}
            pathLength={100}
            strokeDasharray={`${share * 100} 100`}
            className={stroke}
          />
        ) : null}
      </svg>
    </ProgressPrimitive.Root>
  )
}
