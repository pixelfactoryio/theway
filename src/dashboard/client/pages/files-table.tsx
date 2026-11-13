import { useMemo, type ReactNode } from "react"
import { Link, useLocation, useSearch } from "wouter"

import { Badge } from "@/components/reui/badge"
import { ErrorsBadge } from "@/components/status"
import { OneLine } from "@/components/text"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { type FilesQuery, filesQueryString, parseFilesQuery } from "@/lib/files"

/** A table's state in the address (`q`, and `kind` on Prompts), and the navigation that changes it. */
export function useFilesQuery(section: "workflows" | "prompts"): [FilesQuery, (next: FilesQuery, replace?: boolean) => void] {
  const search = useSearch()
  const [, navigate] = useLocation()
  const query = useMemo(() => parseFilesQuery(search), [search])
  const set = (next: FilesQuery, replace = false) => navigate(`/${section}?${filesQueryString(next)}`, { replace })
  return [query, set]
}

/** The toolbar above a table: its controls, then the count at the right. */
export function FilesToolbar({ children, count }: { children: ReactNode; count: string | null }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
      {children}
      <span className="ml-auto text-sm text-muted-foreground tabular-nums" aria-live="polite">
        {count}
      </span>
    </div>
  )
}

/** A file's name cell: the name, a link, a `default` badge for the default workflow, then its description. */
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
    <div className="flex min-h-10 min-w-0 flex-col justify-center">
      <div className="flex min-w-0 items-center gap-2">
        <Link href={href} onClick={(e) => e.stopPropagation()} className="truncate font-medium text-foreground hover:underline">
          {name}
        </Link>
        {isDefault ? <Badge variant="outline">default</Badge> : null}
      </div>
      {description !== null ? <OneLine text={description} className="text-muted-foreground" /> : null}
    </div>
  )
}

/** The Status cell: "Valid", or the series' `N errors` badge. */
export function StatusCell({ errors }: { errors: readonly string[] }) {
  if (errors.length === 0) return <span className="text-muted-foreground">Valid</span>
  return <ErrorsBadge errors={errors} />
}

/** A missing value: `–` in the secondary colour. */
export const None = () => <span className="text-muted-foreground">–</span>

/** A home with no file of the section, with the section's New button (`outline`). */
export function NoFile({ title, kind, folder, action }: { title: string; kind: string; folder: string; action?: ReactNode }) {
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

/** A search (or filter) that keeps no file. */
export function NoFileMatch({ title, clear }: { title: string; clear: () => void }) {
  return (
    <Empty className="py-12">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>Nothing matches the search.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" onClick={clear}>
          Clear
        </Button>
      </EmptyContent>
    </Empty>
  )
}
