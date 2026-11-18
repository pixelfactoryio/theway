import { cn } from "cn"
import { CircleAlertIcon } from "lucide-react"

import { TextField } from "@/components/change-fields"
import { DOC_COLUMN, PROSE_COLUMN } from "@/components/doc-frame"
import { DocTitle } from "@/components/doc-title"
import { Alert, AlertDescription, AlertTitle } from "@/components/reui/alert"
import type { ChangeDetail } from "@/lib/changes"
import type { OpenField } from "@/lib/task-fields"

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
 * The top of a change's content, the title of the document below it and in its column: its description (its ID when
 * it has none) at 36/44 and 700, above the document's h1, its ID in small mono, and the reasons a change that cannot
 * be read gives. Where the change sits shows in the sidebar, not here. The document below gives the space under it.
 */
export function ChangeTitle({ change, className }: { change: ChangeDetail; className?: string }) {
  const invalid = change.archived === null && change.issues.length > 0
  return (
    <div className={cn("shrink-0 pt-10", DOC_COLUMN, className)}>
      <div className={PROSE_COLUMN}>
        <DocTitle
          title={change.description ?? change.id}
          id={change.description !== null ? change.id : undefined}
          variant="document"
        />
        {invalid ? <IssuesAlert issues={change.issues} className="mt-3" /> : null}
      </div>
    </div>
  )
}
