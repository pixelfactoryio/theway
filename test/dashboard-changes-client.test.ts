import { expect, test } from "bun:test";
import {
  type ActiveChange,
  activeRows,
  archivedRows,
  changeCount,
  changeTabs,
  countText,
  inlineCode,
  keepSeriesOpen,
  isLinkTarget,
  localDate,
  nextTask,
  parseQuery,
  queryString,
  rowFraction,
  runCommand,
  SERIES_CLOSED,
  seriesProgress,
  seriesStatus,
  shownPage,
  shownSeriesOpen,
  shownTab,
  sortRows,
  statusCounts,
  switchView,
} from "../src/dashboard/client/lib/changes";

const c = (id: string, status: ActiveChange["status"], done = 0, total = 0, description: string | null = null, updated = "2026-01-01T00:00:00.000Z"): ActiveChange => ({
  id,
  description,
  status,
  done,
  total,
  issues: status === "invalid" ? ["version: must be theway.change/v1beta"] : [],
  updated,
});

test("a series is Invalid when a member is, Ready or Not started when all are, else In progress", () => {
  expect(seriesStatus([c("a-01", "ready"), c("a-02", "invalid")])).toBe("invalid");
  expect(seriesStatus([c("a-01", "ready"), c("a-02", "ready")])).toBe("ready");
  expect(seriesStatus([c("a-01", "not-started"), c("a-02", "not-started")])).toBe("not-started");
  expect(seriesStatus([c("a-01", "ready"), c("a-02", "not-started")])).toBe("in-progress");
});

test("a series row's progress sums its valid members, null when none is valid", () => {
  expect(seriesProgress([c("a-01", "ready", 3, 3), c("a-02", "in-progress", 1, 4), c("a-03", "invalid")])).toEqual({ done: 4, total: 7 });
  expect(seriesProgress([c("a-01", "invalid"), c("a-02", "invalid")])).toBeNull();
});

const ACTIVE = [
  c("add-b", "ready", 2, 2, "Bee"),
  c("add-s-01", "ready", 2, 2, "First", "2026-02-01T00:00:00.000Z"),
  c("add-s-02", "not-started", 0, 3, "Second", "2026-03-01T00:00:00.000Z"),
  c("add-a", "not-started", 0, 1, "Ay"),
  c("add-z", "invalid"),
  c("add-lone-01", "in-progress", 1, 2, "Alone"),
];

test("series of two or more active changes group under one row; the default order is status then ID", () => {
  const rows = activeRows(ACTIVE, "", []);
  expect(rows.map((r) => r.id)).toEqual(["add-z", "add-lone-01", "add-s", "add-a", "add-b"]);
  const series = rows.find((r) => r.kind === "series");
  expect(series).toMatchObject({ status: "in-progress", progress: { done: 2, total: 5 }, updated: "2026-03-01T00:00:00.000Z", count: 2 });
  expect(series?.kind === "series" ? series.children.map((m) => m.id) : []).toEqual(["add-s-01", "add-s-02"]);
  expect(changeCount(rows)).toBe(6);
});

test("the search and the filter keep changes; a narrowed series lists the kept members and keeps its own values", () => {
  const rows = activeRows(ACTIVE, "SECOND", []);
  expect(rows.map((r) => r.id)).toEqual(["add-s"]);
  const s = rows[0];
  expect(s?.kind === "series" ? [s.children.map((m) => m.id), s.count, s.status, s.progress] : null).toEqual([["add-s-02"], 2, "in-progress", { done: 2, total: 5 }]);
  expect(changeCount(rows)).toBe(1);
  expect(activeRows(ACTIVE, "", ["ready"]).map((r) => r.id)).toEqual(["add-s", "add-b"]);
  expect(activeRows(ACTIVE, "zzz", [])).toEqual([]);
  expect(activeRows(ACTIVE, "ay", ["not-started"]).map((r) => r.id)).toEqual(["add-a"]);
});

test("a narrowing opens every series it keeps, whenever it applies; cleared, the series are as they were", () => {
  const whole = activeRows(ACTIVE, "", []);
  const narrowed = activeRows(ACTIVE, "", ["not-started"]);
  expect(shownSeriesOpen(SERIES_CLOSED, "", whole)).toEqual({});
  let state = keepSeriesOpen(SERIES_CLOSED, "", { "add-s": true });
  // A filter applied after the table loaded.
  expect(shownSeriesOpen(state, "|not-started", narrowed)).toEqual({ "add-s": true });
  state = keepSeriesOpen(state, "|not-started", { "add-s": false });
  expect(shownSeriesOpen(state, "|not-started", narrowed)).toEqual({ "add-s": false });
  // Another narrowing opens them again.
  expect(shownSeriesOpen(state, "sec|not-started", narrowed)).toEqual({ "add-s": true });
  // Cleared: the state of the whole view, untouched by the narrowing's.
  expect(shownSeriesOpen(state, "", whole)).toEqual({ "add-s": true });
  expect(shownSeriesOpen(keepSeriesOpen(SERIES_CLOSED, "q|", true), "", whole)).toEqual({});
});

test("the Status filter counts the active changes of each status among those the search keeps", () => {
  expect(statusCounts(ACTIVE, "")).toEqual({ invalid: 1, "in-progress": 1, "not-started": 2, ready: 2 });
  expect(statusCounts(ACTIVE, "add-s")).toEqual({ invalid: 0, "in-progress": 0, "not-started": 1, ready: 1 });
});

test("a column sort orders rows by their own values, ties by ID, Invalid lowest on progress", () => {
  const rows = activeRows(ACTIVE, "", []);
  expect(sortRows(rows, { column: "progress", desc: false }).map((r) => r.id)).toEqual(["add-z", "add-a", "add-s", "add-lone-01", "add-b"]);
  expect(sortRows(rows, { column: "change", desc: true }).map((r) => r.id)).toEqual(["add-z", "add-s", "add-lone-01", "add-b", "add-a"]);
  expect(sortRows(rows, { column: "updated", desc: true })[0]?.id).toBe("add-s");
  expect(rowFraction(rows[0] as never)).toBe(-1);
});

test("the count reads N changes, or N of M changes while narrowed", () => {
  expect(countText(24, 24, false)).toBe("24 changes");
  expect(countText(1, 1, false)).toBe("1 change");
  expect(countText(3, 24, true)).toBe("3 of 24 changes");
});

test("the archived search matches the ID only", () => {
  const archived = [{ dir: "2026-01-01-add-x", id: "add-x", date: "2026-01-01" }];
  expect(archivedRows(archived, "ADD-X")).toHaveLength(1);
  expect(archivedRows(archived, "2026")).toHaveLength(0);
});

test("the address holds view, q, status, page and size, each absent at its default", () => {
  expect(parseQuery("")).toEqual({ view: "active", q: "", statuses: [], page: 1, size: 25 });
  expect(parseQuery("?view=archived&q=a+b&status=ready,invalid,bogus&page=2&size=50")).toEqual({
    view: "archived",
    q: "a b",
    statuses: ["invalid", "ready"],
    page: 2,
    size: 50,
  });
  for (const page of ["0", "-1", "1.5", "x", ""]) expect(parseQuery(`page=${page}`).page).toBe(1);
  for (const size of ["7", "0", "x"]) expect(parseQuery(`size=${size}`).size).toBe(25);
  expect(queryString({ view: "active", q: "", statuses: [], page: 1, size: 25 })).toBe("");
  expect(queryString({ view: "active", q: "x", statuses: ["in-progress", "invalid"], page: 1, size: 25 })).toBe("q=x&status=invalid,in-progress");
  expect(queryString({ view: "archived", q: "", statuses: [], page: 3, size: 100 })).toBe("view=archived&page=3&size=100");
  expect(switchView({ view: "active", q: "x", statuses: ["ready"], page: 1, size: 50 }, "archived")).toEqual({
    view: "archived",
    q: "x",
    statuses: [],
    page: 1,
    size: 50,
  });
});

test("a page past the end shows the last page", () => {
  expect(shownPage(9, 62, 25)).toBe(2);
  expect(shownPage(2, 62, 25)).toBe(1);
  expect(shownPage(3, 0, 25)).toBe(0);
});

test("Updated is the local date", () => {
  const d = new Date(2026, 10, 12, 23, 30);
  expect(localDate(d.toISOString())).toBe("2026-11-12");
});

test("the change page's tabs, its open tab, its next task and its command", () => {
  const tabs = changeTabs([{ name: "spec.md" }, { name: "notes.md" }, { name: "tasks.md" }]);
  expect(tabs.map((t) => [t.slug, t.label])).toEqual([
    ["spec", "Spec"],
    ["notes", "Notes"],
    ["tasks-md", "Tasks"],
    ["tasks", "Tasks"],
  ]);
  expect(shownTab(tabs, undefined).slug).toBe("spec");
  expect(shownTab(tabs, "nope").slug).toBe("spec");
  expect(shownTab(tabs, "tasks").slug).toBe("tasks");
  expect(shownTab(changeTabs([]), undefined).slug).toBe("tasks");
  expect(nextTask([{ text: "a", done: true }, { text: "b", done: false }])).toEqual({ n: 2, text: "b" });
  expect(nextTask([{ text: "a", done: true }])).toBeNull();
  expect(runCommand({ id: "x", status: "ready", done: 2, total: 2 }).command).toBe("/theway:archive x");
  expect(runCommand({ id: "x", status: "in-progress", done: 1, total: 2 }).command).toBe("/theway:workflow x");
  expect(runCommand({ id: "x", status: "invalid", done: 0, total: 0 }).command).toBe("/theway:workflow x");
});

test("inline code and link targets", () => {
  expect(inlineCode("run `a b` then `c`.")).toEqual([
    { code: false, text: "run " },
    { code: true, text: "a b" },
    { code: false, text: " then " },
    { code: true, text: "c" },
    { code: false, text: "." },
  ]);
  for (const ok of ["https://x", "http://x", "mailto:a@b"]) expect(isLinkTarget(ok)).toBe(true);
  for (const bad of ["javascript:alert(1)", "./other.md", "#a", "ftp://x", undefined]) expect(isLinkTarget(bad)).toBe(false);
});
