import { CircleAlertIcon } from "lucide-react"

import { type OpenField, TextField } from "@/components/change-fields"
import { Alert, AlertDescription, AlertTitle } from "@/components/reui/alert"
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
      {change.description !== null ? <p className="mt-1 font-mono text-xs text-muted-foreground">{change.id}</p> : null}
      {invalid ? <IssuesAlert issues={change.issues} className="mt-3 max-w-[80ch]" /> : null}
    </div>
  )
}
