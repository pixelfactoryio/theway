import type { ReactNode } from "react"
import { Link } from "wouter"

import { Badge } from "@/components/reui/badge"
import { ErrorsBadge, StatusMark } from "@/components/status"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"

/**
 * A file's name cell, as a change row's head: the name in mono, a link, with a `default` badge for the default
 * workflow, and its description under it in muted, each on one line, cut at the column's edge.
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
    <div className="flex min-w-0 flex-col">
      <div className="flex min-w-0 items-center gap-2">
        <Link
          href={href}
          onClick={(e) => e.stopPropagation()}
          className="min-w-0 truncate font-mono text-sm text-foreground hover:underline"
        >
          {name}
        </Link>
        {isDefault ? <Badge variant="outline">default</Badge> : null}
      </div>
      {description !== null ? <p className="truncate text-sm text-muted-foreground">{description}</p> : null}
    </div>
  )
}

/**
 * Text that wraps inside a grid cell: the grid's resizable columns keep each cell on one line, cut at its edge, so a cell's
 * own element takes normal wrapping back, breaking a long word rather than overflowing.
 */
export const WRAP = "whitespace-normal wrap-break-word"

/** A cell's text, wrapping onto more lines when its column is narrow. */
export function Wrapped({ children }: { children: ReactNode }) {
  return <span className={WRAP}>{children}</span>
}

/**
 * The Status cell: the status mark and `Valid`, as the file's panel header shows it, or the `N errors` badge; the
 * errors themselves are on the file's page.
 */
export function StatusCell({ errors }: { errors: readonly string[] }) {
  if (errors.length === 0) {
    return (
      <span className="inline-flex items-center gap-2">
        <StatusMark status="ready" />
        Valid
      </span>
    )
  }
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
    <Empty className="py-12">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>
          Add a {kind} file to <code className="font-mono">{folder}/</code>.
        </EmptyDescription>
      </EmptyHeader>
      {action !== undefined ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  )
}
