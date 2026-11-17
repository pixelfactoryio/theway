import { expect, test } from "bun:test"
import {
  collapsedKey,
  isCollapsed,
  monthGroup,
  parseCollapsed,
  withCollapsed,
} from "../src/dashboard/client/lib/collapse"
import {
  fieldValues,
  filterKey,
  filterText,
  isNarrowed,
  listFilterSearch,
  NO_FILTER,
  NONE,
  parseListFilter,
  passes,
  passesAll,
  picks,
  rememberedSearch,
  restoredSearch,
  resultText,
  ruleText,
  rulesKey,
  valueCounts,
} from "../src/dashboard/client/lib/list-filter"

const FIELDS = ["kind", "status", "project"]

test("the address holds q and one key per rule: field=a,b keeps, field!=a,b drops; others are ignored", () => {
  expect(parseListFilter("?q=re+view&kind=step&status!=error,valid&archive&other=x", FIELDS)).toEqual({
    q: "re view",
    rules: [
      { field: "kind", not: false, values: ["step"] },
      { field: "status", not: true, values: ["error", "valid"] },
    ],
  })
  expect(parseListFilter("", FIELDS)).toEqual(NO_FILTER)
  // An empty rule, an unknown field and a broken escape read as nothing, or as written.
  expect(parseListFilter("kind=&nope=1&project=%E0", FIELDS)).toEqual({
    q: "",
    rules: [{ field: "project", not: false, values: ["%E0"] }],
  })
  // A repeated field is two rules, ANDed.
  expect(parseListFilter("kind=step&kind!=reference", FIELDS).rules).toHaveLength(2)
})

test("writing the address keeps the other keys, encodes each value and drops empty rules", () => {
  const filter = {
    q: "a b",
    rules: [
      { field: "project", not: false, values: ["-Users-me-acme", "a,b"] },
      { field: "status", not: true, values: ["error"] },
      { field: "kind", not: false, values: [] },
    ],
  }
  const search = listFilterSearch(filter, FIELDS, "?archive&q=old&kind=step")
  expect(search).toBe("archive&q=a%20b&project=-Users-me-acme,a%2Cb&status!=error")
  expect(parseListFilter(search, FIELDS)).toEqual({ ...filter, rules: filter.rules.slice(0, 2) })
  expect(listFilterSearch(NO_FILTER, FIELDS, "archive")).toBe("archive")
  expect(listFilterSearch(NO_FILTER, FIELDS)).toBe("")
})

test("a rule keeps rows holding any of its values, or (not) none of them; every rule must pass", () => {
  const is = { field: "status", not: false, values: ["a", "b"] }
  const not = { ...is, not: true }
  expect([passes(["a"], is), passes(["c"], is), passes(["c", "b"], is)]).toEqual([true, false, true])
  expect([passes(["a"], not), passes(["c"], not)]).toEqual([false, true])
  const valuesOf = (row: { s: string; k: string }, field: string) => (field === "status" ? [row.s] : [row.k])
  const rules = [is, { field: "kind", not: false, values: ["x"] }]
  expect(passesAll({ s: "a", k: "x" }, rules, valuesOf)).toBe(true)
  expect(passesAll({ s: "a", k: "y" }, rules, valuesOf)).toBe(false)
  expect(passesAll({ s: "a", k: "y" }, rules, valuesOf, "kind")).toBe(true)
  expect(isNarrowed(NO_FILTER)).toBe(false)
  expect(isNarrowed({ q: " ", rules: [] })).toBe(false)
  expect(isNarrowed({ q: "", rules })).toBe(true)
  expect(rulesKey(rules)).toBe("status=a,b&kind=x")
})

test("each value's count applies the other fields' rules, not its own; a row counts once per value", () => {
  const rows = [
    { s: "a", k: ["x"] },
    { s: "a", k: ["y", "y"] },
    { s: "b", k: ["x", "y"] },
  ]
  const valuesOf = (row: (typeof rows)[number], field: string) => (field === "status" ? [row.s] : row.k)
  const rules = [
    { field: "status", not: false, values: ["a"] },
    { field: "kind", not: false, values: ["x"] },
  ]
  expect(Object.fromEntries(valueCounts(rows, "status", rules, valuesOf))).toEqual({ a: 1, b: 1 })
  expect(Object.fromEntries(valueCounts(rows, "kind", rules, valuesOf))).toEqual({ x: 1, y: 1 })
  expect(fieldValues(rows, "kind", valuesOf, (v) => v)).toEqual(["x", "y"])
  expect(fieldValues([{ s: NONE, k: [] }, ...rows], "status", valuesOf, (v) => v)).toEqual(["a", "b", NONE])
})

test("the empty state names the filters; the result line counts what is kept", () => {
  const label = (v: string) => ({ step: "Step prompt", error: "Has errors", valid: "Valid" })[v] ?? v
  expect(ruleText({ field: "kind", not: false, values: ["step"] }, "Kind", label)).toBe("Kind is Step prompt")
  expect(ruleText({ field: "s", not: false, values: ["error", "valid"] }, "Status", label)).toBe(
    "Status is any of Has errors, Valid",
  )
  expect(ruleText({ field: "s", not: true, values: ["valid"] }, "Status", label)).toBe("Status is not Valid")
  expect(ruleText({ field: "s", not: true, values: ["error", "valid"] }, "Status", label)).toBe(
    "Status is none of Has errors, Valid",
  )
  const filter = {
    q: " rev ",
    rules: [
      { field: "kind", not: false, values: ["step"] },
      { field: "gone", not: false, values: ["x"] },
    ],
  }
  const fieldLabel = (f: string) => ({ kind: "Kind" })[f] ?? f
  expect(filterText(filter, { field: fieldLabel, value: (_, v) => label(v) })).toBe(
    "“rev” and Kind is Step prompt and gone is x",
  )
  expect([resultText(3, 42, "prompt"), resultText(1, 1, "workflow")]).toEqual(["3 of 42 prompts", "1 of 1 workflow"])
})

test("each list page remembers its filter under its own key, without the address' other keys", () => {
  expect([filterKey("now"), filterKey("project:-Users-me-acme"), filterKey("group:acme")]).toEqual([
    "theway-filter:now",
    "theway-filter:project:-Users-me-acme",
    "theway-filter:group:acme",
  ])
  expect(rememberedSearch("?archive&status=archived&q=a+b&other=x", FIELDS)).toBe("q=a%20b&status=archived")
  expect(rememberedSearch("?archive&q=%20&kind=", FIELDS)).toBeNull()
  expect(rememberedSearch("", FIELDS)).toBeNull()
})

test("a page opened with no filter in its address takes the remembered one; a filter in the address wins", () => {
  const stored = "q=rev&status=in-progress,ready"
  expect(restoredSearch("", stored, FIELDS)).toBe("q=rev&status=in-progress,ready")
  expect(restoredSearch("?", stored, FIELDS)).toBe("q=rev&status=in-progress,ready")
  // The address' other keys stay first, as the bar writes them.
  expect(restoredSearch("?archive", stored, FIELDS)).toBe("archive&q=rev&status=in-progress,ready")
  // The address has a filter: it wins.
  expect(restoredSearch("?kind=step", stored, FIELDS)).toBeNull()
  expect(restoredSearch("?q=x", stored, FIELDS)).toBeNull()
  // Nothing remembered, or nothing that narrows (Clear forgets it).
  expect(restoredSearch("", null, FIELDS)).toBeNull()
  expect(restoredSearch("", "other=x&q=", FIELDS)).toBeNull()
  // A remembered key the page no longer filters on is dropped.
  expect(restoredSearch("", "gone=x&kind=step", FIELDS)).toBe("kind=step")
})

test("Now lists the archive only when an is rule on Status picks Archived", () => {
  expect(picks([{ field: "status", not: false, values: ["in-progress", "archived"] }], "status", "archived")).toBe(true)
  expect(picks([{ field: "status", not: true, values: ["archived"] }], "status", "archived")).toBe(false)
  expect(picks([{ field: "status", not: true, values: ["ready"] }], "status", "archived")).toBe(false)
  expect(picks([{ field: "project", not: false, values: ["archived"] }], "status", "archived")).toBe(false)
  expect(picks([], "status", "archived")).toBe(false)
})

test("collapsed groups are kept per page; a group with no choice takes its default", () => {
  expect(collapsedKey("project:-Users-me-acme")).toBe("theway-collapsed:project:-Users-me-acme")
  expect(parseCollapsed(null)).toEqual({})
  expect(parseCollapsed("not json")).toEqual({})
  expect(parseCollapsed("[true]")).toEqual({})
  expect(parseCollapsed('{"ready":false,"x":"yes","in-progress":true}')).toEqual({ ready: false, "in-progress": true })
  const choices = parseCollapsed('{"ready":false}')
  expect([isCollapsed(choices, "ready", true), isCollapsed(choices, "archive:2026-10", true)]).toEqual([false, true])
  expect(isCollapsed(choices, "invalid")).toBe(false)
  expect(withCollapsed(choices, ["invalid", "ready"], true)).toEqual({ ready: true, invalid: true })
  expect(monthGroup("2026-11-03T10:00:00Z")).toBe("archive:2026-11")
})
