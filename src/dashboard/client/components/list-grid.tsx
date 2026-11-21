import type { ColumnDef } from "@tanstack/react-table"
import { SearchIcon, XIcon } from "lucide-react"
import { type ReactNode, useLayoutEffect, useMemo, useState } from "react"
import { cn } from "cn"

import type { DataGridFeatures } from "@/components/reui/data-grid/data-grid"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Skeleton } from "@/components/ui/skeleton"

export const cellSkeleton = (width: string): ReactNode => <Skeleton className={`h-5 ${width}`} />

/**
 * The header of a column that does not sort: its title as text, in the headers' size and ink (`text-xs`, the third
 * ink), on the edge its cells keep. The shipped header draws a button for it, which does nothing. A block, so it is
 * centred in the row as a sortable header's button is, on one line with it.
 */
export function ColumnLabel({ children }: { children: ReactNode }) {
  return <span className="block text-xs font-normal whitespace-nowrap text-subtle-foreground">{children}</span>
}

/**
 * A sortable header's button in the headers' size and ink (12px, the secondary ink, at 400), without its 1px border,
 * so its title starts on its cells' edge: the shipped header steps back by the button's padding alone.
 */
export const SORT_HEADER = "border-0 text-xs font-normal text-muted-foreground"

/** A right-aligned column's header: a label ends on its cells' edge, a sortable header's arrow does. */
export const HEADER_END = "text-right [&>div]:-me-2 [&>div]:justify-end"

/**
 * A list's frame around its grid, the row anatomy of the lists (`list-kit`): the header row 32px high over its
 * hairline, the rows 40px on one line with no rule between them, every cell's text in the secondary ink (the name's
 * link takes the ink), and the panel's 16px left gutter on the first column. No rule between columns: at rest a short
 * 8px tick in the head marks a column's resize edge; pointed at, the edge's full line shows in the focus ring's blue,
 * as the panel's edge does.
 */
export const LIST_FRAME = cn(
  "[&_th]:h-8 [&_tr>:first-child]:ps-4",
  "[&_td]:h-10 [&_td]:py-0 [&_td]:whitespace-nowrap [&_td]:text-muted-foreground",
  "[&_[data-slot=data-grid-table-resize-handle]]:before:inset-y-3",
  "[&_[data-slot=data-grid-table-resize-handle]:hover]:before:inset-y-0 [&_[data-slot=data-grid-table-resize-handle]:hover]:before:bg-ring",
)

/**
 * A grid list in the list kit's anatomy (`list-kit.tsx`, with `LIST_FRAME`): the row of column titles sticks at the
 * top; each row has the hover fill, and the focused head's fill and inset ring on the whole row (a head carries
 * `data-nav-item`).
 */
export const LIST_ROWS = {
  headerSticky: "sticky top-0 z-20 bg-background",
  bodyRow:
    "hover:bg-accent has-[[data-nav-item]:focus-visible]:bg-accent has-[[data-nav-item]:focus-visible]:ring-2 has-[[data-nav-item]:focus-visible]:ring-ring has-[[data-nav-item]:focus-visible]:ring-inset",
} as const

/**
 * The most width a list's columns take, its two 24px gutters included: the reading room of a document (`--read-wide`)
 * for the lists of changes and projects, 80rem for the lists of files, which hold more columns.
 */
export const LIST_CAP = { changes: "max-w-[calc(var(--read-wide)+3rem)]", files: "max-w-[calc(80rem+3rem)]" } as const

/**
 * The room a list's page has past `cap` (a class of `LIST_CAP`), in pixels, and the sizer that measures it: a block
 * of no height, as wide as its parent up to the cap, to put first in the element the list's grids fill.
 */
export function useSpare(cap: string): { spare: number; sizer: ReactNode } {
  // Kept in the state: the sizer mounts with the list, which a page may draw after an empty or failed state.
  const [el, setEl] = useState<HTMLDivElement | null>(null)
  const [spare, setSpare] = useState(0)
  useLayoutEffect(() => {
    const parent = el?.parentElement
    if (el === null || parent === null || parent === undefined) return
    const measure = () => setSpare(Math.max(0, parent.clientWidth - el.offsetWidth))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(parent)
    observer.observe(el)
    return () => observer.disconnect()
  }, [el])
  const sizer = useMemo(() => <div ref={setEl} aria-hidden="true" className={cn("h-0", cap)} />, [cap])
  return { spare, sizer }
}

/**
 * The empty last column of a capped list, as wide as the room past the cap (none when there is no room): the list's
 * columns stop at the cap, on the left, while its rows, their hover fill and the header's rule reach the page's edge.
 */
export const spareColumn = <T extends object>(spare: number): ColumnDef<DataGridFeatures, T>[] =>
  spare > 0
    ? [
        {
          id: "spare",
          header: "",
          cell: () => null,
          size: spare,
          minSize: 0,
          enableSorting: false,
          enableResizing: false,
          meta: { headerClassName: "p-0", cellClassName: "p-0" },
        },
      ]
    : []

/**
 * A grid's scroll root: the grid container. The scroll area's own wrapper is made a flex column so the area takes the
 * height left and its viewport scrolls the header row and the rows.
 */
export function GridFrame({ children }: { children: ReactNode }) {
  return (
    <div
      data-scroll-root
      className="flex min-h-0 flex-1 flex-col [&>div]:flex [&>div]:min-h-0 [&>div]:flex-1 [&>div]:flex-col"
    >
      {children}
    </div>
  )
}

export const SCROLL_AREA = "min-h-0 flex-1"

/**
 * A list's foot, the same on every list page: 32px of room under the last row, inside the list's scroll root. A
 * grouped list's hint stands in it.
 */
export function ListFoot({ children }: { children?: ReactNode }) {
  return <div className="pb-8">{children}</div>
}

/** A table's search field: `label` is its placeholder and accessible name. */
export function SearchField({
  value,
  onChange,
  label,
  className,
}: {
  value: string
  onChange: (value: string) => void
  label: string
  className?: string
}) {
  return (
    <InputGroup className={cn("w-full sm:w-64", className)}>
      <InputGroupAddon align="inline-start">
        <SearchIcon aria-hidden="true" />
      </InputGroupAddon>
      <InputGroupInput
        placeholder={label}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value !== "" ? (
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" aria-label="Clear search" onClick={() => onChange("")}>
            <XIcon aria-hidden="true" />
          </InputGroupButton>
        </InputGroupAddon>
      ) : null}
    </InputGroup>
  )
}
