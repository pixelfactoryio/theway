import type {
  ColumnDef,
  ColumnSizingState,
  ColumnVisibilityState,
  ExpandedState,
  OnChangeFn,
  Row,
} from "@tanstack/react-table"
import { useTable } from "@tanstack/react-table"
import { cn } from "cn"
import { useState } from "react"

import { COLUMN_DEFAULTS, PAGE } from "@/components/file-list"
import { LIST_FRAME, LIST_ROWS } from "@/components/list-grid"
import { DataGrid, dataGridFeatures, type DataGridFeatures } from "@/components/reui/data-grid/data-grid"
import { DataGridTable, DataGridTableHeader } from "@/components/reui/data-grid/data-grid-table"

/**
 * Columns resized by dragging a header's edge, live. The header does not stick: a band does, and the grids flow in the
 * page's scroll.
 */
const LAYOUT = {
  columnsResizable: true,
  columnsResizeMode: "onChange",
  headerSticky: false,
  // The rows keep the lists' look: no divider between them.
  rowBorder: false,
} as const

/**
 * The rows of a band, under the page's one header row: the grid keeps its own header for assistive technology only,
 * out of the layout, with the space the grid leaves under a header.
 */
const ROWS_ONLY = "[&_thead]:sr-only [&_[data-slot=data-grid-table-body-spacer]]:hidden"

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
  /**
   * What the grid draws: its header row over its rows (the default), the header row alone (`head`, the one a page of
   * bands shows above its first band), or the rows alone (`rows`, a band's).
   */
  part?: "all" | "head" | "rows"
}

/**
 * One list of a page on the data grid: a page's rows under their header row, or, on a page of bands, the page's header
 * row and each band's rows. The header row names the columns, which resize by their edge; it scrolls with the page. A
 * row with sub-rows lists them beneath it while open. The rows' heads carry `data-nav-item`, walked by J/K inside the
 * grid's `data-nav-list`. Wider than the page, the grid scrolls sideways.
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
  part = "all",
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
      tableClassNames={LIST_ROWS}
      onRowClick={onRowClick && ((row) => onRowClick(table.getRow(getRowId(row), true)))}
    >
      {part === "head" ? (
        // Each band's grid names its own columns to assistive technology: this row is the one that is seen.
        <div aria-hidden="true" className={cn(LIST_FRAME, "overflow-x-auto")}>
          <DataGridTableHeader />
        </div>
      ) : (
        <div
          data-nav-list=""
          role="group"
          aria-label={label}
          className={cn(LIST_FRAME, "overflow-x-auto", part === "rows" && ROWS_ONLY)}
        >
          <DataGridTable />
        </div>
      )}
    </DataGrid>
  )
}
