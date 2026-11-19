import { TextField } from "@/components/change-fields"
import { DocTitle } from "@/components/doc-title"
import { LinesAlert } from "@/components/file-page"
import type { ChangeDetail } from "@/lib/changes"
import type { OpenField } from "@/lib/task-fields"

/** The title of the alert of a change that cannot be read. */
export const UNREADABLE = "This change cannot be read"

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
 * A change's title block: its description (its ID when it has none) at 21/29 and 600, its ID in small mono, and the
 * reasons a change that cannot be read gives, no wider than prose. Where the change sits shows in the sidebar, not
 * here. It stands in a `ColumnTitle` above a Markdown file and in the code tab's gutter title above `change.yaml`.
 */
export function ChangeHeading({ change }: { change: ChangeDetail }) {
  const invalid = change.archived === null && change.issues.length > 0
  return (
    <>
      <DocTitle
        title={change.description ?? change.id}
        id={change.description !== null ? change.id : undefined}
        variant="document"
      />
      {invalid ? <LinesAlert lines={change.issues} title={UNREADABLE} className="mt-3 max-w-(--read-width)" /> : null}
    </>
  )
}
