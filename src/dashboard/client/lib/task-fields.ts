/** The task list's open field and row ids on a change page, as plain transitions. Pure: no React, no DOM. */
import type { ChangeEdit } from "../../../core/change-text"
import { keptIds, oneLine } from "./change-edit"

/** The text field open on a change page: at most one at a time. */
export type OpenField =
  | { kind: "task"; id: string; value: string; error: string | null }
  | { kind: "below"; id: string; value: string; error: string | null }
  | { kind: "add"; value: string }
  /** The description, edited in the page's title (`title`) or, while the title does not show it, in Details. */
  | { kind: "description"; value: string; error: string | null; place?: "title" | "panel" }

/** The refusals the page shows under a field. */
export const TASK_EMPTY = "A task cannot be empty."
export const DESCRIPTION_EMPTY = "A description is one non-empty line."

/** The row ids of the tasks of a `change.yaml` text, for the draft's epoch. */
export type RowIds = { text: string | null; epoch: number; ids: string[] }

/** Whether the open field `f` holds a text other than the draft's `tasks` and `description`, rows by `ids`. */
export function differs(
  f: OpenField | null,
  tasks: readonly { text: string }[],
  description: string | null,
  ids: readonly string[],
): boolean {
  if (f === null) return false
  if (f.kind === "add" || f.kind === "below") return f.value !== ""
  if (f.kind === "description") return f.value !== description
  return f.value !== tasks[ids.indexOf(f.id)]?.text
}

/**
 * The row ids for the draft's `text` and `epoch`, from the ones held: unchanged while both are, new ids on a new epoch
 * (a load, a Reload or a Discard), else kept by position (`keptIds`). `moveField` gives the open field after the sync:
 * a task field keeps its position, and is `null` once its position is gone.
 */
export function syncRowIds(
  rowIds: RowIds,
  text: string | null,
  epoch: number,
  taskCount: number,
  newId: () => string,
): { rowIds: RowIds; moveField: (field: OpenField | null) => OpenField | null } {
  if (rowIds.epoch === epoch && rowIds.text === text) return { rowIds, moveField: (f) => f }
  const previous = rowIds.ids
  const next =
    rowIds.epoch !== epoch ? Array.from({ length: taskCount }, () => newId()) : keptIds(previous, taskCount, newId)
  return {
    rowIds: { text, epoch, ids: next },
    moveField: (f) => {
      if (f === null || (f.kind !== "task" && f.kind !== "below") || next.includes(f.id)) return f
      const i = previous.indexOf(f.id)
      return i >= 0 && i < next.length ? { ...f, id: next[i] as string } : null
    },
  }
}

/**
 * What applying a field does: show its refusal (`error`, the field with it), close it (`close`), or edit the draft
 * (`edit`), with the row ids after the edit (`nextIds`) when it adds a row, and the row to focus (`focus`).
 */
export type FieldEdit =
  | { kind: "error"; field: OpenField }
  | { kind: "close" }
  | { kind: "edit"; edit: ChangeEdit; nextIds?: string[]; focus?: string }

/**
 * Applying the field `field` over the rows `ids`, as Enter does: a description is one-lined, and empty is refused; an
 * empty add closes, an add appends a new row; an empty task is refused; `below` inserts a new row after its own,
 * focused when `enter` (the user applied it); a field whose row is gone closes. `newId` makes a new row's id.
 */
export function fieldEdit(field: OpenField, ids: readonly string[], enter: boolean, newId: () => string): FieldEdit {
  if (field.kind === "description") {
    const value = oneLine(field.value)
    if (value.trim() === "") return { kind: "error", field: { ...field, error: DESCRIPTION_EMPTY } }
    return { kind: "edit", edit: { kind: "description", text: value } }
  }
  if (field.kind === "add") {
    if (field.value.trim() === "") return { kind: "close" }
    const id = newId()
    return { kind: "edit", edit: { kind: "add", index: ids.length, text: field.value }, nextIds: [...ids, id] }
  }
  const index = ids.indexOf(field.id)
  if (index === -1) return { kind: "close" }
  if (field.value.trim() === "") return { kind: "error", field: { ...field, error: TASK_EMPTY } }
  if (field.kind === "task") return { kind: "edit", edit: { kind: "text", index, text: field.value } }
  const id = newId()
  return {
    kind: "edit",
    edit: { kind: "add", index: index + 1, text: field.value },
    nextIds: [...ids.slice(0, index + 1), id, ...ids.slice(index + 1)],
    ...(enter ? { focus: id } : {}),
  }
}

/** Whether `next` is the field already open (`open`): the same kind, and for a task field the same row. */
export const sameField = (open: OpenField, next: OpenField): boolean =>
  open.kind === next.kind &&
  (open.kind === "add" || open.kind === "description" || ("id" in next && open.id === next.id))
