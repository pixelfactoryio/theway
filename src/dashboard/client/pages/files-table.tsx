import { cn } from "cn"
import { CircleCheckIcon } from "lucide-react"
import type { ReactNode } from "react"
import { Link } from "wouter"

import { Badge } from "@/components/reui/badge"
import { ErrorsBadge } from "@/components/status"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"

/**
 * A file's name cell: the name, a link, a `default` badge for the default workflow, then its whole description. Both
 * wrap onto more lines when the column is narrow: nothing is cut.
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
    <div className={cn(WRAP, "flex min-h-10 min-w-0 flex-col justify-center gap-0.5")}>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <Link
          href={href}
          onClick={(e) => e.stopPropagation()}
          className="min-w-0 font-medium text-foreground hover:underline"
        >
          {name}
        </Link>
        {isDefault ? <Badge variant="outline">default</Badge> : null}
      </div>
      {description !== null ? <p className="text-muted-foreground">{description}</p> : null}
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

/** The Status column's header: it does not sort, and reads as the sortable headers' buttons do. */
export const STATUS_HEADER = "text-sm font-medium text-foreground"

/** The Status cell: the `Valid` badge, or the `N errors` badge; the errors themselves are on the file's page. */
export function StatusCell({ errors }: { errors: readonly string[] }) {
  if (errors.length === 0) {
    return (
      <Badge variant="success-light">
        <CircleCheckIcon aria-hidden="true" />
        Valid
      </Badge>
    )
  }
  return <ErrorsBadge errors={errors} />
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
