import { CircleAlertIcon } from "lucide-react"
import type { ReactNode } from "react"

import { type OpenField, TextField } from "@/components/change-fields"
import { Badge } from "@/components/reui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/reui/alert"
import { StatusBadge, TaskProgress } from "@/components/status"
import { OneLine } from "@/components/text"
import { type ChangeDetail, localDate } from "@/lib/changes"

/** The issues of a change that cannot be read, in a destructive alert. */
export function IssuesAlert({ issues, className }: { issues: string[]; className?: string }) {
  return (
    <Alert variant="destructive" className={className}>
      <CircleAlertIcon aria-hidden="true" />
      <AlertTitle>This change cannot be read</AlertTitle>
      <AlertDescription>
        {issues.map((issue, i) => (
          <span key={i} className="font-mono text-xs">
            {issue}
          </span>
        ))}
      </AlertDescription>
    </Alert>
  )
}

/** One item of the status row: its label, then its value. */
function StatusItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-2">{children}</dd>
    </div>
  )
}

/** The row under the title: Status, Tasks with its bar (not on an Invalid change), and Updated, or Archived. */
function StatusRow({ change, invalid }: { change: ChangeDetail; invalid: boolean }) {
  const { done, total } = change
  return (
    <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
      <StatusItem label="Status">
        <StatusBadge status={change.status} />
      </StatusItem>
      {invalid ? null : (
        <StatusItem label="Tasks">
          <TaskProgress done={done} total={total} width="w-16" countClassName="tabular-nums" />
        </StatusItem>
      )}
      {change.archived === null ? (
        <StatusItem label="Updated">
          <span className="tabular-nums">{localDate(change.updated)}</span>
        </StatusItem>
      ) : (
        <StatusItem label="Archived">
          <span className="tabular-nums">{change.archived}</span>
        </StatusItem>
      )}
    </dl>
  )
}

/** The description's in-place editing: the open field, or how to open it. */
export type DescriptionEdit = {
  field: (OpenField & { kind: "description" }) | null
  open: () => void
  change: (value: string) => void
  apply: () => void
  cancel: () => void
}

export function Header({
  change,
  column,
  edit,
}: {
  change: ChangeDetail
  column: boolean
  edit: DescriptionEdit | null
}) {
  const invalid = change.archived === null && change.issues.length > 0
  const body = (
    <div className={column ? "mx-auto w-full max-w-4xl" : "w-full shrink-0"}>
      <div className="flex w-full flex-col gap-1 px-4 pt-6 pb-4">
        <h1 className="truncate text-lg font-semibold tracking-tight">{change.id}</h1>
        {invalid || change.description === null ? null : edit === null ? (
          <OneLine text={change.description} className="max-w-[80ch] text-sm text-muted-foreground" />
        ) : edit.field !== null ? (
          <div className="max-w-[80ch]">
            <TextField
              multiline={false}
              label="Description"
              value={edit.field.value}
              error={edit.field.error}
              onChange={edit.change}
              onApply={edit.apply}
              onCancel={edit.cancel}
            />
          </div>
        ) : (
          <button
            type="button"
            aria-label={`Description: ${change.description}. Edit`}
            onClick={edit.open}
            className="-mx-1 max-w-[80ch] cursor-text rounded-sm px-1 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <OneLine text={change.description} className="text-sm text-muted-foreground" />
          </button>
        )}
        <StatusRow change={change} invalid={invalid} />
        {invalid ? <IssuesAlert issues={change.issues} className="mt-2 max-w-[80ch]" /> : null}
      </div>
    </div>
  )
  return column ? (
    <div className="w-full shrink-0 overflow-hidden [scrollbar-gutter:stable_both-edges]">{body}</div>
  ) : (
    body
  )
}

/** A tab's label with the unsaved dot after it. */
export function TabLabel({ children, dirty }: { children: ReactNode; dirty: boolean }) {
  return (
    <>
      {children}
      {dirty ? (
        <span role="img" aria-label="unsaved changes" className="size-2 shrink-0 rounded-full bg-foreground" />
      ) : null}
    </>
  )
}

/** The Tasks tab's count: `done/total`, `–` while the change does not pass the check. */
export function TaskCount({ change }: { change: ChangeDetail }) {
  return (
    <Badge variant="secondary" className="tabular-nums">
      {change.issues.length > 0 ? "–" : `${change.done}/${change.total}`}
    </Badge>
  )
}
