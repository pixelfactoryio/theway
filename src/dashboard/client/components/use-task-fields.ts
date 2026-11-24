import { isolateHistory } from "@codemirror/commands"
import type { Text } from "@codemirror/state"
import { arrayMove } from "@dnd-kit/sortable"
import { useCallback, useLayoutEffect, useRef, useState } from "react"

import { type ChangeEdit, editedChangeText } from "../../../core/change-text"
import type { DescriptionEdit } from "@/components/change-header"
import type { TaskListActions, TaskRow } from "@/components/task-list"
import type { Draft } from "@/drafts/draft-set"
import { differs, fieldEdit, type OpenField, type RowIds, sameField, syncRowIds } from "@/lib/task-fields"

/**
 * The task list and description of a change page, edited in place on the `change.yaml` draft `yaml` (`null` without
 * one): the open field, the rows' ids, the row to focus, the refusal of the last edit and the undo notice of a removed
 * task, with the handlers that apply them to the draft.
 */
export function useTaskFields({
  yaml,
  yamlText,
  tasks,
  description,
}: {
  yaml: Draft | null
  yamlText: string | null
  tasks: readonly { text: string; done: boolean }[]
  description: string | null
}) {
  const lastId = useRef(0)
  /** A new client id of a task row. */
  const newId = useCallback((): string => `task-${++lastId.current}`, [])
  const [undoNote, setUndoNote] = useState<{ n: number; doc: Text } | null>(null)
  const [field, setField] = useState<OpenField | null>(null)

  // Row ids: made when the change loads and on Reload or Discard, carried through the list actions (set by `runEdit`
  // with the edit's text), kept by position after any other change of the draft.
  const epoch = yaml?.epoch ?? 0
  // eslint-disable-next-line react-hooks/refs -- the counter only makes new ids; a discarded render merely skips some
  const [rowIds, setRowIds] = useState<RowIds>(() => ({
    text: yamlText,
    epoch,
    ids: Array.from({ length: tasks.length }, () => newId()),
  }))
  // eslint-disable-next-line react-hooks/refs -- the same counter, making ids for new rows
  const synced = syncRowIds(rowIds, yamlText, epoch, tasks.length, newId)
  if (synced.rowIds !== rowIds) {
    setRowIds(synced.rowIds)
    setField(synced.moveField)
  }
  const ids = synced.rowIds.ids
  const rows: TaskRow[] = tasks.map((t, i) => ({ id: ids[i] as string, text: t.text, done: t.done }))

  const [actionError, setActionError] = useState<string | null>(null)
  const [focus, setFocus] = useState<string | null>(null)

  // The latest field, tasks and row ids, for the event handlers.
  const live = useRef({ field, tasks, description, ids })
  useLayoutEffect(() => {
    live.current = { field, tasks, description, ids }
  })

  /** Applies an edit to the draft as one undo step; a refusal shows in the action-error notice. */
  const runEdit = (edit: ChangeEdit, nextIds?: (ids: string[]) => string[]): boolean => {
    if (yaml === null) return false
    const state = yaml.store.state
    const text = state.sliceDoc()
    const r = editedChangeText(text, edit)
    if ("reason" in r) {
      setActionError(r.reason)
      return false
    }
    if (r.text === text) return true
    if (nextIds !== undefined) {
      // An open task field follows its task through a list action; it closes when its task is gone.
      const next = nextIds(live.current.ids)
      setRowIds({ text: r.text, epoch, ids: next })
      setField((f) => (f !== null && (f.kind === "task" || f.kind === "below") && !next.includes(f.id) ? null : f))
    }
    yaml.store.dispatch({
      changes: { from: 0, to: state.doc.length, insert: r.text },
      annotations: isolateHistory.of("full"),
    })
    return true
  }

  /** Applies a field as Enter does; false when refused. `enter`: the user applied it (focus moves to a new row). */
  const applyField = (f: OpenField, enter: boolean): boolean => {
    const r = fieldEdit(f, live.current.ids, enter, newId)
    if (r.kind === "error") {
      setField(r.field)
      return false
    }
    if (r.kind === "edit") {
      const next = r.nextIds
      if (!runEdit(r.edit, next === undefined ? undefined : () => next)) return false
    }
    setField(null)
    if (r.kind === "edit" && r.focus !== undefined) setFocus(r.focus)
    return true
  }

  /** Opens a field, applying the open one first; false when that is refused (the open one stays). */
  const openField = (next: OpenField): boolean => {
    const f = live.current.field
    if (f !== null) {
      if (sameField(f, next)) return true
      if (!applyField(f, false)) return false
    }
    setField(next)
    return true
  }

  /** Whether the open field holds a text other than the draft's, for the event handlers. */
  const fieldDiffers = useCallback((): boolean => {
    const { field: f, tasks: t, description: d, ids: list } = live.current
    return differs(f, t, d, list)
  }, [])

  /** The field open now, for the event handlers. */
  const currentField = (): OpenField | null => live.current.field

  /**
   * Writes the open field's new text to the draft at once, as a document's text is: a refused text (an empty task, an
   * empty description) shows its refusal and leaves the draft as it was; the first text of a new task adds it, and the
   * field goes on as that task's own (its editor moves into the new row).
   */
  const writeField = (next: OpenField): void => {
    const ids = live.current.ids
    const r = fieldEdit(next, ids, false, newId)
    if (r.kind === "error") {
      setField(r.field)
      return
    }
    if (r.kind === "close") {
      // An add still empty stays open; a field whose row is gone closes.
      setField(next.kind === "add" ? next : null)
      return
    }
    const nextIds = r.nextIds
    if (!runEdit(r.edit, nextIds === undefined ? undefined : () => nextIds)) {
      setField(next)
      return
    }
    const created = nextIds?.find((id) => !ids.includes(id))
    if (created !== undefined) setField({ kind: "task", id: created, value: next.value, error: null })
    else setField(next.kind === "add" ? next : { ...next, error: null })
  }

  const actions: TaskListActions = {
    toggle: (index, done) => void runEdit({ kind: "done", index, done }),
    move: (from, to) => void runEdit({ kind: "move", from, to }, (list) => arrayMove(list, from, to)),
    remove: (index) => {
      if (runEdit({ kind: "remove", index }, (list) => list.filter((_, i) => i !== index)) && yaml !== null) {
        setUndoNote({ n: index + 1, doc: yaml.store.state.doc })
      }
    },
    open: openField,
    change: writeField,
    close: () => setField(null),
  }

  const descriptionEdit: DescriptionEdit | null =
    yaml === null
      ? null
      : {
          field: field?.kind === "description" ? field : null,
          open: (place) => void openField({ kind: "description", value: description ?? "", error: null, place }),
          change: (value) => {
            const f = live.current.field
            writeField({
              kind: "description",
              value,
              error: null,
              place: f?.kind === "description" ? f.place : undefined,
            })
          },
          close: () => setField(null),
        }

  return {
    field,
    rows,
    focus,
    setFocus,
    actionError,
    setActionError,
    undoNote,
    setUndoNote,
    applyField,
    fieldDiffers,
    currentField,
    actions,
    descriptionEdit,
  }
}
