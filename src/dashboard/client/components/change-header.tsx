import { TextField } from "@/components/change-fields"
import { ItemHeading } from "@/components/doc-frame"
import { LinesAlert } from "@/components/file-page"
import { type ChangeDetail, ownDescription } from "@/lib/changes"
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

/** A description that only repeats its change's ID, as Details gives it: said once, in the secondary ink. */
export function SameAsId() {
  return <span className="text-muted-foreground">Same as the ID</span>
}

/**
 * The description in the panel's Details: its text (`SameAsId` when it only repeats the change's `id`), which a click
 * turns into a one-line field; `–` when it cannot be edited.
 */
export function DescriptionField({
  description,
  id,
  edit,
}: {
  description: string | null
  id: string
  edit: DescriptionEdit | null
}) {
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
      {ownDescription(description, id) === null && description.trim() !== "" ? <SameAsId /> : description}
    </button>
  )
}

/**
 * A change's title, above every file of its page: its description (none when it has none or it only repeats the ID:
 * the ID stands once, in the header's path), then the reasons a change that cannot be read gives, no wider than prose.
 */
export function ChangeHeading({ change }: { change: ChangeDetail }) {
  const invalid = change.archived === null && change.issues.length > 0
  return (
    <ItemHeading title={ownDescription(change.description, change.id)}>
      {invalid ? <LinesAlert lines={change.issues} title={UNREADABLE} place="bare" className="mt-3" /> : null}
    </ItemHeading>
  )
}
