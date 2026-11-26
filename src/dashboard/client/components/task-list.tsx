import { cn } from "cn"

import { TaskText } from "@/components/text"
import { Checkbox } from "@/components/ui/checkbox"
import { splitTask } from "@/lib/change-edit"

/**
 * A task's text: its number line (`Next` after it on the first task not done), then its lead and its whole detail.
 */
function TaskBody({
  n,
  next,
  lead,
  detail,
  done,
}: {
  n: number
  next: boolean
  lead: string
  detail: string
  done: boolean
}) {
  return (
    <>
      <div className="mb-1 flex h-(--text-xs--line-height) items-center gap-2 font-mono text-xs text-muted-foreground tabular-nums">
        <span>{n}</span>
        {next ? (
          <span className="inline-flex h-(--text-xs--line-height) items-center rounded-sm border px-1 font-sans font-medium text-foreground">
            Next
          </span>
        ) : null}
      </div>
      <div className={cn("text-md font-medium", done ? "text-muted-foreground" : "text-foreground")}>
        <TaskText text={lead} />
      </div>
      {detail !== "" ? (
        <div className="mt-1 text-md whitespace-pre-line text-muted-foreground">
          <TaskText text={detail} />
        </div>
      ) : null}
    </>
  )
}

/**
 * A change's task list, read-only on every page: the tasks change only in `change.yaml`. Every task in order, each its
 * disabled checkbox, its number, its lead and its whole detail; with `markNext` (an active change), `Next` on the
 * first task not done. Nothing to click.
 */
export function TaskList({
  rows,
  markNext = false,
}: {
  rows: readonly { text: string; done: boolean }[]
  markNext?: boolean
}) {
  const next = markNext ? rows.findIndex((r) => !r.done) : -1
  return (
    <ol aria-label="Tasks" className="flex flex-col">
      {rows.map((row, i) => {
        const n = i + 1
        const { lead, detail } = splitTask(row.text)
        return (
          <li key={String(i)} className="flex items-start gap-3 border-t border-rule px-4 py-3">
            <span className="mt-5 flex h-(--text-md--line-height) shrink-0 items-center">
              <Checkbox checked={row.done} disabled aria-label={`Task ${n} done`} />
            </span>
            <div className="min-w-0 flex-1">
              <TaskBody n={n} next={i === next} lead={lead} detail={detail} done={row.done} />
            </div>
          </li>
        )
      })}
    </ol>
  )
}
