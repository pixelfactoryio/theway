import type { ReactNode } from "react"
import { Link } from "wouter"

import { ID_LEAD, IdName, RowChip, RowId } from "@/components/list-kit"
import { ErrorsBadge, StatusMark } from "@/components/status"
import { errorCount } from "@/lib/files"
import { StateBlock } from "@/shell/state"

/**
 * A file's name cell, as a list's row reads (`list-kit`): on one line, what the file does (its description) in the ink,
 * then its name as the ID chip (`RowId`), and a `default` chip for the default workflow; a file
 * with no description leads with its name's chip (`IdName`). The lead is the row's link (`data-nav-item`, walked by
 * J/K and the arrows, Cmd/Ctrl and a click opening a new tab); the row's whole surface opens it too. In a narrow
 * column the lead gives way first, then the name's chip, never under 10 characters.
 */
export function NameCell({
  href,
  name,
  description,
  isDefault = false,
}: {
  href: string
  name: string
  description: string | null
  isDefault?: boolean
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Link
        href={href}
        data-nav-item=""
        onClick={(e) => e.stopPropagation()}
        className={`min-w-0 truncate rounded-sm font-medium text-foreground outline-none ${ID_LEAD}`}
      >
        {description ?? <IdName>{name}</IdName>}
      </Link>
      {description !== null ? <RowId>{name}</RowId> : null}
      {isDefault ? <RowChip>default</RowChip> : null}
    </div>
  )
}

/**
 * A cell's text, on one line like every cell of a list, cut at its column's edge: the grid's resizable columns are
 * dragged wider to read it whole.
 */
export const WRAP = "block min-w-0 truncate"

/** A cell's text, cut at its column's edge. */
export function Wrapped({ children }: { children: ReactNode }) {
  return <span className={WRAP}>{children}</span>
}

/**
 * A file's status, the first cell of its row: the status icon, a green check when the file is valid, the red Invalid
 * mark when it has errors, named for assistive technology (`Valid`, `N errors`).
 */
export function StatusCell({ errors }: { errors: readonly string[] }) {
  const valid = errors.length === 0
  return (
    <span role="img" aria-label={valid ? "Valid" : errorCount(errors.length)}>
      <StatusMark status={valid ? "ready" : "invalid"} />
    </span>
  )
}

/** A file's errors after its name: the `N errors` badge, nothing when it has none (the errors are on its page). */
export function ErrorsCell({ errors }: { errors: readonly string[] }) {
  return <ErrorsBadge count={errors.length} />
}

/** A home with no file of the section, with the section's New button (`outline`). */
export function NoFile({
  title,
  kind,
  folder,
  action,
}: {
  title: string
  kind: string
  folder: string
  action?: ReactNode
}) {
  return (
    <StateBlock size="page" title={title} action={action}>
      Add a {kind} file to <code className="font-mono text-xs">{folder}/</code>.
    </StateBlock>
  )
}
