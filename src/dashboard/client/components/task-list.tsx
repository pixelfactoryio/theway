import { cn } from "cn"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronRightIcon,
  GripVerticalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"
import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react"

import { TextField } from "@/components/change-fields"
import { ReorderMenu } from "@/components/reorder-menu"
import { Sortable, SortableItem, SortableItemHandle } from "@/components/reui/sortable"
import { TaskText } from "@/components/text"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { splitTask, taskName } from "@/lib/change-edit"
import type { OpenField } from "@/lib/task-fields"

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

/**
 * A task's text: its number line (`Next` after it on the first task not done), then its lead and its detail (cut at
 * three lines while `clamped`). With `onEdit`, a click on the text edits it; `field`, when given, takes the text's place.
 */
function TaskBody({
  n,
  next,
  lead,
  detail,
  done,
  clamped,
  onEdit,
  field,
}: {
  n: number
  next: boolean
  lead: string
  detail: string
  done: boolean
  clamped: boolean
  onEdit?: () => void
  field?: ReactNode
}) {
  const text = (
    <>
      <div className={cn("text-md font-medium", done ? "text-muted-foreground" : "text-foreground")}>
        <TaskText text={lead} />
      </div>
      {detail !== "" ? (
        <div className={cn("mt-1 text-md whitespace-pre-line text-muted-foreground", clamped && "line-clamp-3")}>
          <TaskText text={detail} />
        </div>
      ) : null}
    </>
  )
  return (
    <>
      <div className="mb-1 flex h-4 items-center gap-2 font-mono text-xs text-muted-foreground tabular-nums">
        <span>{n}</span>
        {next ? (
          <span className="inline-flex h-4 items-center rounded-sm border px-1 font-sans font-medium text-foreground">
            Next
          </span>
        ) : null}
      </div>
      {field !== undefined ? (
        field
      ) : onEdit !== undefined ? (
        <div onClick={onEdit} className="-mx-1 cursor-text rounded-sm px-1 transition-colors hover:bg-accent/40">
          {text}
        </div>
      ) : (
        text
      )}
    </>
  )
}

/** One task: a focusable row with its handle, checkbox, number, text (or its field) and menu. */
function Row({
  row,
  index,
  count,
  next,
  field,
  actions,
  focusRow,
}: {
  row: TaskRow
  index: number
  count: number
  /** Whether it is the first task not done, shown in full. */
  next: boolean
  field: OpenField | null
  actions: TaskListActions
  focusRow: (id: string) => void
}) {
  const n = index + 1
  const [more, setMore] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  // A menu action that moves the focus elsewhere keeps the menu from giving it back to its button.
  const keepFocus = useRef(false)
  const act = (f: () => void) => () => {
    keepFocus.current = true
    f()
  }
  const { lead, detail } = splitTask(row.text)
  const clamped = !next && !more
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
      className="group/row relative flex items-start gap-3 border-t border-rule py-3 pr-2 pl-4 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      <SortableItemHandle
        render={<button type="button" aria-label={`Drag task ${n}`} />}
        className="absolute top-8 left-0.5 flex h-(--text-md--line-height) w-3 items-center justify-center text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <GripVerticalIcon aria-hidden="true" className="size-3.5" />
      </SortableItemHandle>
      {/* Level with the lead's first line: under the number line, as tall as the lead's line. */}
      <span className="mt-5 flex h-(--text-md--line-height) shrink-0 items-center">
        <Checkbox
          checked={row.done}
          onCheckedChange={(next) => actions.toggle(index, next === true)}
          aria-label={`Task ${n} done`}
        />
      </span>
      <div className="min-w-0 flex-1">
        <TaskBody
          n={n}
          next={next}
          lead={lead}
          detail={detail}
          done={row.done}
          clamped={clamped}
          onEdit={edit}
          field={
            editing !== null ? (
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
            ) : undefined
          }
        />
        {editing === null && detail.length > 220 && !next ? (
          <Button variant="link" size="xs" onClick={() => setMore(!more)} className="mt-1 h-auto px-0 text-link">
            {more ? "Show less" : "Show more"}
          </Button>
        ) : null}
      </div>
      <ReorderMenu
        label={`Task ${n} actions`}
        size="icon-sm"
        triggerClassName="shrink-0 text-muted-foreground hover:text-foreground"
        contentClassName="w-48"
        open={menuOpen}
        onOpenChange={(open) => {
          if (open) keepFocus.current = false
          setMenuOpen(open)
        }}
        finalFocus={() => !keepFocus.current}
        items={[
          { label: "Edit", icon: <PencilIcon aria-hidden="true" />, onSelect: act(edit) },
          {
            label: "Move up",
            icon: <ArrowUpIcon aria-hidden="true" />,
            disabled: index === 0,
            onSelect: act(() => move(-1)),
          },
          {
            label: "Move down",
            icon: <ArrowDownIcon aria-hidden="true" />,
            disabled: index === count - 1,
            onSelect: act(() => move(1)),
          },
          {
            label: "Add a task below",
            icon: <PlusIcon aria-hidden="true" />,
            onSelect: act(() => actions.open({ kind: "below", id: row.id, value: "", error: null })),
          },
          "separator",
          {
            label: "Delete",
            icon: <Trash2Icon aria-hidden="true" />,
            destructive: true,
            disabled: count === 1,
            title: count === 1 ? LAST_TASK : undefined,
            onSelect: act(() => {
              actions.remove(index)
              const next = index + 1 < count ? index : index - 1
              if (next >= 0) focusRow(`#${next}`)
            }),
          },
        ]}
      />
    </SortableItem>
  )
}

/** What an active change's list takes. */
type EditableProps = {
  readOnly?: false
  rows: readonly TaskRow[]
  field: OpenField | null
  actions: TaskListActions
  focus: string | null
  onFocused: () => void
  focusRow: (target: string) => void
}

/** What an archived change's list takes: its tasks alone. */
type ReadOnlyProps = { readOnly: true; rows: readonly { text: string; done: boolean }[] }

/**
 * A change's task list. Editable (an active change's): see `EditableList`. `readOnly` (an archived change's): every
 * task in order, each its disabled checkbox, its number, its lead and its whole detail; nothing to click.
 */
export function TaskList(props: EditableProps | ReadOnlyProps) {
  return props.readOnly === true ? <ReadOnlyList rows={props.rows} /> : <EditableList {...props} />
}

/** The read-only list: an ordered list of the tasks, no fold, no handle, no menu, no add row. */
function ReadOnlyList({ rows }: { rows: ReadOnlyProps["rows"] }) {
  return (
    <ol aria-label="Tasks" className="flex flex-col">
      {rows.map((row, i) => {
        const n = i + 1
        const { lead, detail } = splitTask(row.text)
        return (
          <li key={String(i)} className="flex items-start gap-3 border-t border-rule px-4 py-3">
            <span className="mt-5 flex h-(--text-md--line-height) shrink-0 items-center">
              <Checkbox checked={row.done} disabled aria-label={`Task ${n} done`} />
            </span>
            <div className="min-w-0 flex-1">
              <TaskBody n={n} next={false} lead={lead} detail={detail} done={row.done} clamped={false} />
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * The task list of an active change, a view of the `change.yaml` draft: one row per task, rows reordered by dragging
 * their handle, from their menu or with Alt and the arrows, then the add row. `focus` names the row to focus next: an
 * id, or `#<index>` for the row at that position.
 */
function EditableList({ rows, field, actions, focus, onFocused, focusRow }: EditableProps) {
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
  const [showDone, setShowDone] = useState(false)
  const next = rows.findIndex((r) => !r.done)
  const doneCount = rows.filter((r) => r.done).length
  // Folded, the done tasks are left out; every action still names tasks by their position in the whole list.
  const shown = rows.map((row, i) => ({ row, i })).filter(({ row }) => showDone || !row.done)

  return (
    <div ref={list}>
      {doneCount > 0 ? (
        <button
          type="button"
          aria-expanded={showDone}
          onClick={() => setShowDone(!showDone)}
          className="flex h-8 w-full items-center gap-2 border-t border-rule px-4 text-xs text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          <ChevronRightIcon className={cn("size-3 transition-transform", showDone && "rotate-90")} aria-hidden="true" />
          {doneCount} done
        </button>
      ) : null}
      <Sortable
        value={shown.map((s) => s.row)}
        onValueChange={() => undefined}
        getItemValue={(r) => r.id}
        onMove={({ activeIndex, overIndex }) => {
          const from = shown[activeIndex]?.i
          const to = shown[overIndex]?.i
          if (from === undefined || to === undefined) return
          const id = rows[from]?.id
          actions.move(from, to)
          if (id !== undefined) focusRow(id)
        }}
        strategy="vertical"
        role="list"
        aria-label="Tasks"
        className="flex flex-col"
      >
        {shown.flatMap(({ row, i }) => {
          const out = [
            <Row
              key={row.id}
              row={row}
              index={i}
              count={rows.length}
              next={i === next}
              field={field}
              actions={actions}
              focusRow={focusRow}
            />,
          ]
          if (below !== null && below.id === row.id) {
            out.push(
              <div
                key={`below-${row.id}`}
                role="listitem"
                className="flex items-start gap-3 border-t border-rule py-3 pr-2 pl-4"
              >
                <Checkbox disabled aria-hidden="true" tabIndex={-1} className="mt-2" />
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
              </div>,
            )
          }
          return out
        })}
        <div role="listitem" className="flex items-center gap-3 border-t border-rule py-2 pr-2 pl-4">
          <PlusIcon className="size-4 text-muted-foreground" aria-hidden="true" />
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
