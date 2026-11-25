import { useEffect, useRef } from "react"

import { ItemHeading } from "@/components/doc-frame"
import { EditPencil } from "@/components/edit-mode"
import { LinesAlert } from "@/components/file-page"
import { MarkdownField } from "@/components/markdown-field"
import { type ChangeDetail, ownDescription } from "@/lib/changes"
import type { OpenField } from "@/lib/task-fields"

/** The title of the alert of a change that cannot be read. */
export const UNREADABLE = "This change cannot be read"

/**
 * The description's in-place editing: the open field, how to open it (in the title or in Details), its writes, its
 * close (a click elsewhere), Enter (applies) and Esc (cancels), and where its button takes the focus back after them.
 */
export type DescriptionEdit = {
  field: (OpenField & { kind: "description" }) | null
  open: (place: "title" | "panel") => void
  change: (value: string) => void
  close: () => void
  enter: () => void
  cancel: () => void
  /** The button that takes the focus back, once. */
  focus: "title" | "panel" | null
  focused: () => void
}

/** A description that only repeats its change's ID, as Details gives it: said once, in the secondary ink. */
export function SameAsId() {
  return <span className="text-muted-foreground">Same as the ID</span>
}

/** The description's field: the shared Markdown field on one line, written to the draft as it is typed. */
function DescriptionInput({
  edit,
  field,
  scale,
}: {
  edit: DescriptionEdit
  field: OpenField & { kind: "description" }
  scale: "field" | "title"
}) {
  return (
    <MarkdownField
      oneLine
      autoFocus
      scale={scale}
      label="Description"
      value={field.value}
      error={field.error}
      onChange={edit.change}
      onEnter={edit.enter}
      onLeave={edit.cancel}
      onBlur={edit.close}
    />
  )
}

/**
 * The description in the panel's Details, while the page's title does not show it (it has none, or it only repeats the
 * change's `id`): `SameAsId`, or `–` when it cannot be edited; a click on it, or on the pencil after it, edits it in
 * place.
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
  const button = useRef<HTMLButtonElement>(null)
  // Whichever of the title and this button shows the description takes the focus back.
  const refocus = edit !== null && edit.focus !== null && edit.field === null
  useEffect(() => {
    if (!refocus || button.current === null) return
    button.current.focus()
    edit?.focused()
  })
  if (edit === null || description === null) return <span className="text-muted-foreground">–</span>
  if (edit.field !== null && edit.field.place === "panel")
    return <DescriptionInput edit={edit} field={edit.field} scale="field" />
  return (
    <span className="flex min-w-0 items-start gap-1">
      <button
        ref={button}
        type="button"
        aria-label={`Description: ${description}. Edit`}
        onClick={() => edit.open("panel")}
        className="-mx-1 min-w-0 cursor-text rounded-sm px-1 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
      >
        {ownDescription(description, id) === null && description.trim() !== "" ? <SameAsId /> : description}
      </button>
      <EditPencil label="Edit the description" onClick={() => edit.open("panel")} />
    </span>
  )
}

/**
 * Whether Details names the description: while the page's title does not show it, or while it is edited there.
 */
export const descriptionInDetails = (
  change: { description: string | null; id: string },
  edit: DescriptionEdit | null,
) => ownDescription(change.description, change.id) === null || edit?.field?.place === "panel"

/**
 * A change's title, above every file of its page: its description (none when it has none or it only repeats the ID:
 * the ID stands once, in the header's path), then the reasons a change that cannot be read gives, no wider than prose.
 * With `edit`, a click on the title or on its pencil edits it in place.
 */
export function ChangeHeading({ change, edit = null }: { change: ChangeDetail; edit?: DescriptionEdit | null }) {
  const invalid = change.archived === null && change.issues.length > 0
  const field = edit?.field?.place === "title" ? edit.field : null
  return (
    <ItemHeading
      title={ownDescription(change.description, change.id)}
      field={edit !== null && field !== null ? <DescriptionInput edit={edit} field={field} scale="title" /> : undefined}
      onEdit={edit !== null ? () => edit.open("title") : undefined}
      focusEdit={edit !== null && edit.focus !== null && edit.field === null}
      onEditFocused={edit?.focused}
    >
      {invalid ? <LinesAlert lines={change.issues} title={UNREADABLE} place="bare" className="mt-3" /> : null}
    </ItemHeading>
  )
}
