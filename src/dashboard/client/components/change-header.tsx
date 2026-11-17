import { CircleAlertIcon } from "lucide-react"
import type { ReactNode } from "react"

import { type OpenField, TextField } from "@/components/change-fields"
import { Badge } from "@/components/reui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/reui/alert"
import { OneLine } from "@/components/text"
import type { ChangeDetail } from "@/lib/changes"

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
        <h1 className="truncate text-xl font-semibold tracking-tight">{change.id}</h1>
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

/** The description in the panel's Details: its text, which a click turns into a one-line field; `–` when it cannot be edited. */
export function DescriptionField({ description, edit }: { description: string | null; edit: DescriptionEdit | null }) {
  if (edit === null || description === null) return <span className="text-muted-foreground">–</span>
  if (edit.field !== null) {
    return (
      <TextField
        multiline={false}
        label="Description"
        value={edit.field.value}
        error={edit.field.error}
        onChange={edit.change}
        onApply={edit.apply}
        onCancel={edit.cancel}
      />
    )
  }
  return (
    <button
      type="button"
      aria-label={`Description: ${description}. Edit`}
      onClick={edit.open}
      className="-mx-1 cursor-text rounded-sm px-1 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
    >
      {description}
    </button>
  )
}

/**
 * The top of a change's content: its description as the title (its ID when it has none), its ID in small mono, and
 * the reasons a change that cannot be read gives. Where the change sits shows in the sidebar, not here.
 */
export function ChangeTitle({ change }: { change: ChangeDetail }) {
  const invalid = change.archived === null && change.issues.length > 0
  return (
    <div className="shrink-0 px-14 pt-6 pb-4">
      <h1 className="max-w-[47.5rem] text-title font-semibold tracking-tight">{change.description ?? change.id}</h1>
      {change.description !== null ? (
        <p className="mt-0.5 font-mono text-xs text-muted-foreground">{change.id}</p>
      ) : null}
      {invalid ? <IssuesAlert issues={change.issues} className="mt-3 max-w-[80ch]" /> : null}
    </div>
  )
}
