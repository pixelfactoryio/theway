import { cn } from "cn"
import { ArrowDownIcon, ArrowUpIcon, GripVerticalIcon, MoreHorizontalIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { useEffect, useRef, useState, type KeyboardEvent } from "react"

import { type OpenField, TextField } from "@/components/change-fields"
import { Sortable, SortableItem, SortableItemHandle } from "@/components/reui/sortable"
import { TaskText } from "@/components/text"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { taskName } from "@/lib/change-edit"

/** A task row: its client id, its text and its state. */
export type TaskRow = { id: string; text: string; done: boolean }

/** What the list asks of the page. Each list action names tasks by position. */
export type TaskListActions = {
  toggle: (index: number, done: boolean) => void
  move: (from: number, to: number) => void
  remove: (index: number) => void
  /** Opens a field: false when the open one could not be applied first. */
  open: (field: OpenField) => boolean
  change: (field: OpenField | null) => void
  /** Applies the open field as Enter does; false when refused. */
  apply: () => boolean
  cancel: () => void
}

const LAST_TASK = "A change keeps at least one task."

/** A row's menu: Edit, Move up, Move down, Add a task below, then Delete. */
function RowMenu({
  n,
  first,
  last,
  only,
  onEdit,
  onMove,
  onAddBelow,
  onDelete,
}: {
  n: number
  first: boolean
  last: boolean
  only: boolean
  onEdit: () => void
  onMove: (delta: -1 | 1) => void
  onAddBelow: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  // An action that moves the focus elsewhere keeps the menu from giving it back to its button.
  const keep = useRef(false)
  const act = (f: () => void) => () => {
    keep.current = true
    f()
  }
  const remove = (
    <DropdownMenuItem variant="destructive" disabled={only} onClick={act(onDelete)}>
      <Trash2Icon aria-hidden="true" />
      Delete
    </DropdownMenuItem>
  )
  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        if (next) keep.current = false
        setOpen(next)
      }}
    >
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Task ${n} actions`}
            className={cn(
              "shrink-0 opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:opacity-100",
              open && "opacity-100"
            )}
          />
        }
      >
        <MoreHorizontalIcon aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48" finalFocus={() => !keep.current}>
        <DropdownMenuItem onClick={act(onEdit)}>
          <PencilIcon aria-hidden="true" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem disabled={first} onClick={act(() => onMove(-1))}>
          <ArrowUpIcon aria-hidden="true" />
          Move up
        </DropdownMenuItem>
        <DropdownMenuItem disabled={last} onClick={act(() => onMove(1))}>
          <ArrowDownIcon aria-hidden="true" />
          Move down
        </DropdownMenuItem>
        <DropdownMenuItem onClick={act(onAddBelow)}>
          <PlusIcon aria-hidden="true" />
          Add a task below
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {only ? <span title={LAST_TASK}>{remove}</span> : remove}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** One task: a focusable row with its handle, checkbox, number, text (or its field) and menu. */
function Row({
  row,
  index,
  count,
  field,
  actions,
  focusRow,
}: {
  row: TaskRow
  index: number
  count: number
  field: OpenField | null
  actions: TaskListActions
  focusRow: (id: string) => void
}) {
  const n = index + 1
  const editing = field?.kind === "task" && field.id === row.id ? field : null
  const edit = () => actions.open({ kind: "task", id: row.id, value: row.text, error: null })
  const move = (delta: -1 | 1) => {
    const to = index + delta
    if (to < 0 || to >= count) return
    actions.move(index, to)
    focusRow(row.id)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    if (event.key === "Enter" && !event.altKey) {
      event.preventDefault()
      edit()
    } else if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault()
      move(event.key === "ArrowUp" ? -1 : 1)
    }
  }
  return (
    <SortableItem
      value={row.id}
      role="listitem"
      tabIndex={0}
      aria-roledescription="task"
      aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
      aria-label={taskName(n, row.text, row.done)}
      data-task-id={row.id}
      onKeyDown={onKeyDown}
      className={cn(
        "group/row flex items-start gap-2 rounded-md border-b py-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        index === count - 1 && "border-b-0"
      )}
    >
      <SortableItemHandle
        render={<button type="button" aria-label={`Drag task ${n}`} />}
        className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 outline-none group-hover/row:opacity-100 group-focus-within/row:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <GripVerticalIcon aria-hidden="true" className="size-4" />
      </SortableItemHandle>
      <Checkbox checked={row.done} onCheckedChange={(next) => actions.toggle(index, next === true)} aria-label={`Task ${n} done`} className="mt-0.5" />
      <span className="w-6 shrink-0 text-right text-sm text-muted-foreground tabular-nums">{n}.</span>
      <div className="min-w-0 flex-1">
        {editing !== null ? (
          <TextField
            multiline
            label={`Task ${n}`}
            value={editing.value}
            error={editing.error}
            onChange={(value) => actions.change({ ...editing, value, error: null })}
            onApply={() => {
              if (actions.apply()) focusRow(row.id)
            }}
            onCancel={() => {
              actions.cancel()
              focusRow(row.id)
            }}
          />
        ) : (
          <div
            onClick={edit}
            className={cn(
              "-mx-1 cursor-text rounded-sm px-1 text-sm whitespace-pre-line transition-colors hover:bg-muted",
              row.done && "text-muted-foreground"
            )}
          >
            <TaskText text={row.text} />
          </div>
        )}
      </div>
      <RowMenu
        n={n}
        first={index === 0}
        last={index === count - 1}
        only={count === 1}
        onEdit={edit}
        onMove={move}
        onAddBelow={() => actions.open({ kind: "below", id: row.id, value: "", error: null })}
        onDelete={() => {
          actions.remove(index)
          const next = index + 1 < count ? index : index - 1
          if (next >= 0) focusRow(`#${next}`)
        }}
      />
    </SortableItem>
  )
}

/**
 * The task list of an active change, a view of the `change.yaml` draft: one row per task, rows reordered by dragging
 * their handle, from their menu or with Alt and the arrows, then the add row. `focus` names the row to focus next: an
 * id, or `#<index>` for the row at that position.
 */
export function TaskList({
  rows,
  field,
  actions,
  focus,
  onFocused,
  focusRow,
}: {
  rows: readonly TaskRow[]
  field: OpenField | null
  actions: TaskListActions
  focus: string | null
  onFocused: () => void
  focusRow: (target: string) => void
}) {
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (focus === null || list.current === null) return
    const items = [...list.current.querySelectorAll<HTMLElement>("[data-task-id]")]
    const node = focus.startsWith("#") ? items[Number(focus.slice(1))] : items.find((i) => i.dataset.taskId === focus)
    node?.focus()
    onFocused()
  })

  const below = field?.kind === "below" ? field : null
  const add = field?.kind === "add" ? field.value : ""

  return (
    <div ref={list}>
    <Sortable
      value={rows as TaskRow[]}
      onValueChange={() => undefined}
      getItemValue={(r) => r.id}
      onMove={({ activeIndex, overIndex }) => {
        const id = rows[activeIndex]?.id
        actions.move(activeIndex, overIndex)
        if (id !== undefined) focusRow(id)
      }}
      strategy="vertical"
      role="list"
      aria-label="Tasks"
      className="flex max-w-[80ch] flex-col"
    >
      {rows.flatMap((row, i) => {
        const out = [<Row key={row.id} row={row} index={i} count={rows.length} field={field} actions={actions} focusRow={focusRow} />]
        if (below !== null && below.id === row.id) {
          out.push(
            <div key={`below-${row.id}`} role="listitem" className="flex items-start gap-2 border-b py-2 ps-7">
              <Checkbox disabled aria-hidden="true" tabIndex={-1} className="mt-2" />
              <span className="w-6 shrink-0" />
              <div className="min-w-0 flex-1">
                <TextField
                  multiline
                  label="New task"
                  value={below.value}
                  error={below.error}
                  onChange={(value) => actions.change({ ...below, value, error: null })}
                  onApply={() => void actions.apply()}
                  onCancel={() => {
                    actions.cancel()
                    focusRow(row.id)
                  }}
                />
              </div>
            </div>
          )
        }
        return out
      })}
      <div role="listitem" className="flex items-center gap-2 py-2">
        <span className="size-5 shrink-0" />
        <Checkbox disabled aria-hidden="true" tabIndex={-1} />
        <span className="w-6 shrink-0" />
        <Input
          value={add}
          placeholder="Add a task"
          aria-label="Add a task"
          onChange={(event) => {
            const value = event.target.value
            if (field !== null && field.kind !== "add" && !actions.open({ kind: "add", value })) return
            actions.change(value === "" ? null : { kind: "add", value })
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault()
              if (add.trim() !== "") actions.apply()
            } else if (event.key === "Escape" && field?.kind === "add") {
              event.preventDefault()
              actions.change(null)
            }
          }}
          className="h-7 flex-1 rounded-sm border-0 bg-transparent px-1 shadow-none dark:bg-transparent"
        />
      </div>
    </Sortable>
    </div>
  )
}
