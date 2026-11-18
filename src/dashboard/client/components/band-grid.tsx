import type {
  ColumnDef,
  ColumnSizingState,
  ColumnVisibilityState,
  ExpandedState,
  OnChangeFn,
  Row,
} from "@tanstack/react-table"
import { useTable } from "@tanstack/react-table"
import { useState } from "react"

import { COLUMN_DEFAULTS, PAGE } from "@/components/file-list"
import { DataGrid, dataGridFeatures, type DataGridFeatures } from "@/components/reui/data-grid/data-grid"
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table"

/**
 * Columns resized by dragging a header's edge, live. The header does not stick: the band above it does, and the grids
 * flow in the page's scroll.
 */
const LAYOUT = {
  columnsResizable: true,
  columnsResizeMode: "onChange",
  headerSticky: false,
  // The rows keep the lists' look: no divider between them.
  rowBorder: false,
} as const

/**
 * The rows' frame: the lists' 24px left gutter on the first column (each column set gives its last its right one), the
 * lists' hover fill, and the focused head's fill and inset ring on its whole row. Wider than the page, the grid scrolls
 * sideways.
 */
const FRAME = "overflow-x-auto [&_tr>:first-child]:ps-6"
const CLASS_NAMES = {
  bodyRow:
    "hover:bg-accent/40 has-[[data-nav-item]:focus-visible]:bg-accent has-[[data-nav-item]:focus-visible]:ring-2 has-[[data-nav-item]:focus-visible]:ring-ring has-[[data-nav-item]:focus-visible]:ring-inset",
} as const

export type BandGridProps<T extends object> = {
  rows: readonly T[]
  columns: ColumnDef<DataGridFeatures, T>[]
  getRowId: (row: T) => string
  getSubRows?: (row: T) => T[] | undefined
  /** The page's column sizes, shared by every grid of the page so their columns line up and resize together. */
  columnSizing: ColumnSizingState
  onColumnSizingChange: OnChangeFn<ColumnSizingState>
  /** The rows opened; without it the grid keeps its own, every row closed at first. */
  expanded?: ExpandedState
  onExpandedChange?: OnChangeFn<ExpandedState>
  columnVisibility?: ColumnVisibilityState
  /** A click in a row outside its head, its toggle and its actions. */
  onRowClick?: (row: Row<DataGridFeatures, T>) => void
  /** The list's accessible name. */
  label: string
}

/**
 * One list of a page on the data grid: the rows of a band, or a page's rows without bands. Its header row names the
 * columns, which resize by their edge; a row with sub-rows lists them beneath it while open. The rows' heads carry
 * `data-nav-item`, walked by J/K inside the grid's `data-nav-list`.
 */
export function BandGrid<T extends object>({
  rows,
  columns,
  getRowId,
  getSubRows,
  columnSizing,
  onColumnSizingChange,
  expanded,
  onExpandedChange,
  columnVisibility,
  onRowClick,
  label,
}: BandGridProps<T>) {
  const [ownExpanded, setOwnExpanded] = useState<ExpandedState>({})
  const table = useTable({
    features: dataGridFeatures,
    columns,
    defaultColumn: COLUMN_DEFAULTS,
    data: rows as T[],
    getRowId: (row) => getRowId(row),
    getSubRows,
    state: {
      pagination: PAGE,
      columnSizing,
      expanded: expanded ?? ownExpanded,
      ...(columnVisibility !== undefined ? { columnVisibility } : {}),
    },
    manualPagination: true,
    // The rows are rebuilt on every render of the page; their IDs are stable, so a row stays open through them.
    autoResetExpanded: false,
    onColumnSizingChange,
    onExpandedChange: onExpandedChange ?? setOwnExpanded,
  })

  return (
    <DataGrid<DataGridFeatures, T>
      table={table}
      recordCount={rows.length}
      tableLayout={LAYOUT}
      tableClassNames={CLASS_NAMES}
      onRowClick={onRowClick && ((row) => onRowClick(table.getRow(getRowId(row), true)))}
    >
      <div data-nav-list="" role="group" aria-label={label} className={FRAME}>
        <DataGridTable />
      </div>
    </DataGrid>
  )
}
