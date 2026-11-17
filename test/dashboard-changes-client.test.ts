import { expect, test } from "bun:test"
import {
  type ActiveChange,
  activeRows,
  changeCount,
  changeTabs,
  inlineCode,
  isLinkTarget,
  localDate,
  seriesProgress,
  seriesStatus,
  shownTab,
} from "../src/dashboard/client/lib/changes"
import { fileCountText } from "../src/dashboard/client/lib/files"

const c = (
  id: string,
  status: ActiveChange["status"],
  done = 0,
  total = 0,
  description: string | null = null,
  updated = "2026-01-01T00:00:00.000Z",
): ActiveChange => ({
  id,
  description,
  status,
  done,
  total,
  issues: status === "invalid" ? ["version: must be theway.change/v1beta1"] : [],
  updated,
})

test("a series is Invalid when a member is, Ready or Not started when all are, else In progress", () => {
  expect(seriesStatus([c("a-01", "ready"), c("a-02", "invalid")])).toBe("invalid")
  expect(seriesStatus([c("a-01", "ready"), c("a-02", "ready")])).toBe("ready")
  expect(seriesStatus([c("a-01", "not-started"), c("a-02", "not-started")])).toBe("not-started")
  expect(seriesStatus([c("a-01", "ready"), c("a-02", "not-started")])).toBe("in-progress")
})

test("a series row's progress sums its valid members, null when none is valid", () => {
  expect(seriesProgress([c("a-01", "ready", 3, 3), c("a-02", "in-progress", 1, 4), c("a-03", "invalid")])).toEqual({
    done: 4,
    total: 7,
  })
  expect(seriesProgress([c("a-01", "invalid"), c("a-02", "invalid")])).toBeNull()
})

const ACTIVE = [
  c("add-b", "ready", 2, 2, "Bee"),
  c("add-s-01", "ready", 2, 2, "First", "2026-02-01T00:00:00.000Z"),
  c("add-s-02", "not-started", 0, 3, "Second", "2026-03-01T00:00:00.000Z"),
  c("add-a", "not-started", 0, 1, "Ay"),
  c("add-z", "invalid"),
  c("add-lone-01", "in-progress", 1, 2, "Alone"),
]

test("series of two or more active changes group under one row; the default order is status then ID", () => {
  const rows = activeRows(ACTIVE, "", [])
  expect(rows.map((r) => r.id)).toEqual(["add-z", "add-lone-01", "add-s", "add-a", "add-b"])
  const series = rows.find((r) => r.kind === "series")
  expect(series).toMatchObject({
    status: "in-progress",
    progress: { done: 2, total: 5 },
    updated: "2026-03-01T00:00:00.000Z",
    count: 2,
  })
  expect(series?.kind === "series" ? series.children.map((m) => m.id) : []).toEqual(["add-s-01", "add-s-02"])
  expect(changeCount(rows)).toBe(6)
})

test("the search and the filter keep changes; a narrowed series lists the kept members and keeps its own values", () => {
  const rows = activeRows(ACTIVE, "SECOND", [])
  expect(rows.map((r) => r.id)).toEqual(["add-s"])
  const s = rows[0]
  expect(s?.kind === "series" ? [s.children.map((m) => m.id), s.count, s.status, s.progress] : null).toEqual([
    ["add-s-02"],
    2,
    "in-progress",
    { done: 2, total: 5 },
  ])
  expect(changeCount(rows)).toBe(1)
  expect(activeRows(ACTIVE, "", ["ready"]).map((r) => r.id)).toEqual(["add-s", "add-b"])
  expect(activeRows(ACTIVE, "zzz", [])).toEqual([])
  expect(activeRows(ACTIVE, "ay", ["not-started"]).map((r) => r.id)).toEqual(["add-a"])
})

test("the count reads N changes, or N of M changes while narrowed", () => {
  expect(fileCountText(24, 24, false, "change")).toBe("24 changes")
  expect(fileCountText(1, 1, false, "change")).toBe("1 change")
  expect(fileCountText(3, 24, true, "change")).toBe("3 of 24 changes")
})

test("Updated is the local date", () => {
  const d = new Date(2026, 10, 12, 23, 30)
  expect(localDate(d.toISOString())).toBe("2026-11-12")
})

test("the change page's tabs and its open tab", () => {
  const tabs = changeTabs([{ name: "spec.md" }, { name: "notes.md" }, { name: "tasks.md" }])
  expect(tabs.map((t) => [t.slug, t.label])).toEqual([
    ["spec", "Spec"],
    ["notes", "Notes"],
    ["tasks-md", "Tasks"],
    ["tasks", "Tasks"],
  ])
  expect(shownTab(tabs, undefined).slug).toBe("spec")
  expect(shownTab(tabs, "nope").slug).toBe("spec")
  expect(shownTab(tabs, "tasks").slug).toBe("tasks")
  expect(shownTab(changeTabs([]), undefined).slug).toBe("tasks")
})

test("inline code and link targets", () => {
  expect(inlineCode("run `a b` then `c`.")).toEqual([
    { code: false, text: "run " },
    { code: true, text: "a b" },
    { code: false, text: " then " },
    { code: true, text: "c" },
    { code: false, text: "." },
  ])
  for (const ok of ["https://x", "http://x", "mailto:a@b"]) expect(isLinkTarget(ok)).toBe(true)
  for (const bad of ["javascript:alert(1)", "./other.md", "#a", "ftp://x", undefined])
    expect(isLinkTarget(bad)).toBe(false)
})
