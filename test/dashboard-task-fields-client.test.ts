import { expect, test } from "bun:test"
import {
  DESCRIPTION_EMPTY,
  differs,
  fieldEdit,
  type OpenField,
  type RowIds,
  sameField,
  syncRowIds,
  TASK_EMPTY,
} from "../src/dashboard/client/lib/task-fields"

/** An id maker counting from `start`: `n1`, `n2`, … */
const ids = (start = 0) => {
  let n = start
  return () => `n${++n}`
}

const IDS = ["a", "b", "c"]

test("fieldEdit one-lines a description and refuses an empty one", () => {
  const f: OpenField = { kind: "description", value: "First\nsecond\r\nthird", error: null }
  expect(fieldEdit(f, IDS, true, ids())).toEqual({
    kind: "edit",
    edit: { kind: "description", text: "First second third" },
  })
  const empty: OpenField = { kind: "description", value: " \n ", error: null }
  expect(fieldEdit(empty, IDS, true, ids())).toEqual({ kind: "error", field: { ...empty, error: DESCRIPTION_EMPTY } })
})

test("fieldEdit closes an empty add and appends a new row for an add", () => {
  expect(fieldEdit({ kind: "add", value: "  " }, IDS, true, ids())).toEqual({ kind: "close" })
  expect(fieldEdit({ kind: "add", value: "Write it" }, IDS, true, ids())).toEqual({
    kind: "edit",
    edit: { kind: "add", index: 3, text: "Write it" },
    nextIds: ["a", "b", "c", "n1"],
  })
})

test("fieldEdit edits a task's text, its row focused only on Enter, and refuses an empty task", () => {
  expect(fieldEdit({ kind: "task", id: "b", value: "New text", error: null }, IDS, true, ids())).toEqual({
    kind: "edit",
    edit: { kind: "text", index: 1, text: "New text" },
    focus: "b",
  })
  expect(fieldEdit({ kind: "task", id: "b", value: "New text", error: null }, IDS, false, ids())).toEqual({
    kind: "edit",
    edit: { kind: "text", index: 1, text: "New text" },
  })
  const empty: OpenField = { kind: "task", id: "b", value: " ", error: null }
  expect(fieldEdit(empty, IDS, true, ids())).toEqual({ kind: "error", field: { ...empty, error: TASK_EMPTY } })
  const emptyBelow: OpenField = { kind: "below", id: "b", value: "", error: null }
  expect(fieldEdit(emptyBelow, IDS, true, ids())).toEqual({
    kind: "error",
    field: { ...emptyBelow, error: TASK_EMPTY },
  })
})

test("fieldEdit inserts a row below its own, focused only on Enter", () => {
  const f: OpenField = { kind: "below", id: "a", value: "Between", error: null }
  expect(fieldEdit(f, IDS, true, ids())).toEqual({
    kind: "edit",
    edit: { kind: "add", index: 1, text: "Between" },
    nextIds: ["a", "n1", "b", "c"],
    focus: "n1",
  })
  expect(fieldEdit(f, IDS, false, ids())).toEqual({
    kind: "edit",
    edit: { kind: "add", index: 1, text: "Between" },
    nextIds: ["a", "n1", "b", "c"],
  })
})

test("fieldEdit closes a task or below field whose row is gone", () => {
  expect(fieldEdit({ kind: "task", id: "x", value: "Text", error: null }, IDS, true, ids())).toEqual({ kind: "close" })
  expect(fieldEdit({ kind: "below", id: "x", value: "", error: null }, IDS, true, ids())).toEqual({ kind: "close" })
})

test("syncRowIds keeps the held ids while the text and epoch are unchanged", () => {
  const held: RowIds = { text: "t", epoch: 1, ids: ["a", "b"] }
  const field: OpenField = { kind: "task", id: "a", value: "", error: null }
  const r = syncRowIds(held, "t", 1, 2, ids())
  expect(r.rowIds).toBe(held)
  expect(r.moveField(field)).toBe(field)
})

test("syncRowIds keeps ids by position on another text, new ones for added rows", () => {
  expect(syncRowIds({ text: "t", epoch: 1, ids: ["a", "b"] }, "u", 1, 3, ids()).rowIds).toEqual({
    text: "u",
    epoch: 1,
    ids: ["a", "b", "n1"],
  })
  expect(syncRowIds({ text: "t", epoch: 1, ids: ["a", "b", "c"] }, "u", 1, 2, ids()).rowIds).toEqual({
    text: "u",
    epoch: 1,
    ids: ["a", "b"],
  })
})

test("syncRowIds makes new ids on a new epoch", () => {
  expect(syncRowIds({ text: "t", epoch: 1, ids: ["a", "b"] }, "t", 2, 2, ids()).rowIds).toEqual({
    text: "t",
    epoch: 2,
    ids: ["n1", "n2"],
  })
})

test("syncRowIds moves the open task field by position and closes it when its position is gone", () => {
  const r = syncRowIds({ text: "t", epoch: 1, ids: ["a", "b", "c"] }, "t", 2, 2, ids())
  const task: OpenField = { kind: "task", id: "b", value: "x", error: null }
  expect(r.moveField(task)).toEqual({ ...task, id: "n2" })
  const below: OpenField = { kind: "below", id: "a", value: "", error: null }
  expect(r.moveField(below)).toEqual({ ...below, id: "n1" })
  expect(r.moveField({ kind: "task", id: "c", value: "x", error: null })).toBeNull()
  expect(r.moveField({ kind: "task", id: "z", value: "x", error: null })).toBeNull()
  const add: OpenField = { kind: "add", value: "x" }
  expect(r.moveField(add)).toBe(add)
  const description: OpenField = { kind: "description", value: "x", error: null }
  expect(r.moveField(description)).toBe(description)
  expect(r.moveField(null)).toBeNull()
  // A field whose id the new ids still hold stays as it is.
  const kept = syncRowIds({ text: "t", epoch: 1, ids: ["a", "b"] }, "u", 1, 1, ids())
  const onA: OpenField = { kind: "task", id: "a", value: "x", error: null }
  expect(kept.moveField(onA)).toBe(onA)
})

test("differs compares the open field with the draft", () => {
  const tasks = [{ text: "One" }, { text: "Two" }]
  expect(differs(null, tasks, "D", ["a", "b"])).toBe(false)
  expect(differs({ kind: "add", value: "" }, tasks, "D", ["a", "b"])).toBe(false)
  expect(differs({ kind: "add", value: "x" }, tasks, "D", ["a", "b"])).toBe(true)
  expect(differs({ kind: "below", id: "a", value: "", error: null }, tasks, "D", ["a", "b"])).toBe(false)
  expect(differs({ kind: "below", id: "a", value: "x", error: null }, tasks, "D", ["a", "b"])).toBe(true)
  expect(differs({ kind: "description", value: "D", error: null }, tasks, "D", ["a", "b"])).toBe(false)
  expect(differs({ kind: "description", value: "E", error: null }, tasks, "D", ["a", "b"])).toBe(true)
  expect(differs({ kind: "task", id: "b", value: "Two", error: null }, tasks, "D", ["a", "b"])).toBe(false)
  expect(differs({ kind: "task", id: "b", value: "Three", error: null }, tasks, "D", ["a", "b"])).toBe(true)
})

test("sameField matches the same kind, and a task field on the same row", () => {
  expect(sameField({ kind: "add", value: "a" }, { kind: "add", value: "b" })).toBe(true)
  expect(
    sameField({ kind: "description", value: "a", error: null }, { kind: "description", value: "b", error: null }),
  ).toBe(true)
  expect(
    sameField({ kind: "task", id: "a", value: "", error: null }, { kind: "task", id: "a", value: "x", error: null }),
  ).toBe(true)
  expect(
    sameField({ kind: "task", id: "a", value: "", error: null }, { kind: "task", id: "b", value: "", error: null }),
  ).toBe(false)
  expect(
    sameField({ kind: "task", id: "a", value: "", error: null }, { kind: "below", id: "a", value: "", error: null }),
  ).toBe(false)
  expect(sameField({ kind: "add", value: "" }, { kind: "description", value: "", error: null })).toBe(false)
})
