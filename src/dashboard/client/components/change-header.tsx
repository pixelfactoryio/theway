import { ItemHeading } from "@/components/doc-frame"
import { Dash, LinesAlert } from "@/components/file-page"
import { type ChangeDetail, ownDescription } from "@/lib/changes"

/** The title of the alert of a change that cannot be read. */
export const UNREADABLE = "This change cannot be read"

/** A description that only repeats its change's ID, as Details gives it: said once, in the secondary ink. */
export function SameAsId() {
  return <span className="text-muted-foreground">Same as the ID</span>
}

/**
 * The description in the panel's Details, read-only (it is edited in `change.yaml`): the text, `SameAsId` when it only
 * repeats the change's ID, or `–` when it has none.
 */
export function ChangeDescription({ change }: { change: { description: string | null; id: string } }) {
  const { description, id } = change
  if (description === null || description.trim() === "") return <Dash />
  return ownDescription(description, id) === null ? <SameAsId /> : <span>{description}</span>
}

/**
 * Above every file of a change's page: no title (the header's path names the change and the file's own text is what is
 * read), only the reasons an active change that cannot be read gives, no wider than prose.
 */
export function ChangeHeading({ change }: { change: ChangeDetail }) {
  const invalid = change.archived === null && change.issues.length > 0
  if (!invalid) return null
  return (
    <ItemHeading title={null}>
      <LinesAlert lines={change.issues} title={UNREADABLE} place="bare" />
    </ItemHeading>
  )
}
