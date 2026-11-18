import { expect, test } from "bun:test"
import { parse } from "regexparam"
import { matchRoute } from "wouter"
import {
  CHANGE_ROUTES,
  decoded,
  isAt,
  leavesChange,
  leavesFile,
  locationOf,
  pageOf,
  ROUTES,
  routeKeyOf,
  routeOf,
  type RouteName,
  to,
} from "../src/dashboard/client/lib/routes"

/** Parameter values a builder must carry through the router unchanged. A `%` followed by two hex digits is excluded. */
const SAMPLES = ["a-b", "a b", "a/b", "a?b", "a#b", "é", "a%b"]

const patternOf = (name: RouteName): string => ROUTES.find((r) => r.name === name)?.pattern as string

/** What the router does with an address: no trailing `?`, the path through `decodeURI`, matched with wouter's parser. */
function routed(pattern: string, address: string): Record<string, string | undefined> | null {
  expect(address.endsWith("?")).toBe(true)
  const [ok, params] = matchRoute(parse, pattern, decodeURI(address.slice(0, -1)))
  return ok ? decoded(params as Record<string, string | undefined>) : null
}

/** The parameters `keys` of `params`. */
const pick = (params: Record<string, string | undefined>, keys: string[]): Record<string, string | undefined> =>
  Object.fromEntries(keys.map((k) => [k, params[k]]))

/** Every builder with parameters, for one sample value: its address, its route, and the patterns it must match. */
const built = (s: string): { address: string; route: RouteName; checks: [string, Record<string, string>][] }[] => [
  { address: to.project(s), route: "project", checks: [[patternOf("project"), { key: s }]] },
  { address: to.group(s), route: "group", checks: [[patternOf("group"), { id: s }]] },
  {
    address: to.change(s, s),
    route: "changes",
    checks: [
      [patternOf("changes"), { key: s }],
      [CHANGE_ROUTES.change, { key: s, id: s }],
    ],
  },
  {
    address: to.change(s, s, s),
    route: "changes",
    checks: [[CHANGE_ROUTES.change, { key: s, id: s, tab: s }]],
  },
  {
    address: to.archived(s, s, s),
    route: "changes",
    checks: [
      [patternOf("changes"), { key: s }],
      [CHANGE_ROUTES.archived, { key: s, dir: s, tab: s }],
    ],
  },
  {
    address: to.file("workflows", null, s, s),
    route: "workflowGlobal",
    checks: [[patternOf("workflowGlobal"), { name: s, tab: s }]],
  },
  {
    address: to.file("workflows", s, s),
    route: "workflowProject",
    checks: [[patternOf("workflowProject"), { key: s, name: s }]],
  },
  {
    address: to.file("prompts", null, s),
    route: "promptGlobal",
    checks: [[patternOf("promptGlobal"), { name: s }]],
  },
  {
    address: to.file("prompts", s, s, s),
    route: "promptProject",
    checks: [[patternOf("promptProject"), { key: s, name: s, tab: s }]],
  },
]

test("every builder's address matches its route through wouter, its parameters decoding to the values built", () => {
  for (const s of SAMPLES) {
    for (const { address, route, checks } of built(s)) {
      for (const [pattern, want] of checks) {
        const params = routed(pattern, address)
        expect([address, pattern, params === null ? null : pick(params, Object.keys(want))]).toEqual([
          address,
          pattern,
          want,
        ])
      }
      expect([address, routeOf(address).name]).toEqual([address, route])
    }
  }
})

test("the builders encode every parameter and end in their search part", () => {
  expect([to.now(), to.projects(), to.workflows(), to.prompts()]).toEqual([
    "/?",
    "/projects?",
    "/workflows?",
    "/prompts?",
  ])
  expect(to.project("-p")).toBe("/-p?")
  expect(to.project("-p", { archive: true })).toBe("/-p?archive")
  expect(to.group("a b")).toBe("/group/a%20b?")
  expect(to.group("g", { archive: true })).toBe("/group/g?archive")
  expect(to.change("-p", "add-a")).toBe("/-p/changes/add-a?")
  expect(to.change("-p", "add-a", "a/b")).toBe("/-p/changes/add-a/a%2Fb?")
  expect(to.archived("-p", "2026-01-01-add-a", "tasks")).toBe("/-p/changes/archive/2026-01-01-add-a/tasks?")
  expect(to.file("workflows", null, "ship")).toBe("/workflows/global/ship?")
  expect(to.file("prompts", "-p", "review", "history")).toBe("/prompts/projects/-p/review/history?")
})

test("the static routes name their own route, not a project's", () => {
  expect(["/", "/projects", "/workflows", "/prompts"].map((p) => routeOf(p).name)).toEqual([
    "now",
    "projects",
    "workflows",
    "prompts",
  ])
  expect(routeOf("/a/b/c/d/e/f").name).toBe("fallback")
})

test("pageOf and routeKeyOf of every builder's address", () => {
  const cases: [string, ReturnType<typeof pageOf>, string | null][] = [
    [to.now(), null, null],
    [to.projects(), null, "projects"],
    [to.workflows(), null, "workflows"],
    [to.prompts(), null, "prompts"],
    [to.project("-p"), null, "-p"],
    [to.project("-p", { archive: true }), null, "-p"],
    [to.group("g"), null, null],
    [to.group("g", { archive: true }), null, null],
    [to.change("-p", "add-a"), { kind: "change", key: "-p", id: "add-a" }, "-p"],
    [to.change("-p", "add-a", "spec"), { kind: "change", key: "-p", id: "add-a" }, "-p"],
    [to.archived("-p", "2026-01-01-add-a"), { kind: "archived", key: "-p", dir: "2026-01-01-add-a" }, "-p"],
    [to.archived("-p", "2026-01-01-add-a", "tasks"), { kind: "archived", key: "-p", dir: "2026-01-01-add-a" }, "-p"],
    [to.file("workflows", null, "x"), { kind: "file", fileKind: "workflows", project: null, name: "x" }, null],
    [to.file("workflows", "-p", "x", "yaml"), { kind: "file", fileKind: "workflows", project: "-p", name: "x" }, null],
    [to.file("prompts", null, "x", "history"), { kind: "file", fileKind: "prompts", project: null, name: "x" }, null],
    [to.file("prompts", "-p", "x"), { kind: "file", fileKind: "prompts", project: "-p", name: "x" }, null],
  ]
  for (const [address, page, key] of cases) {
    expect([address, pageOf(address), routeKeyOf(address)]).toEqual([address, page, key])
  }
  for (const s of SAMPLES) {
    expect(pageOf(to.change(s, s, s))).toEqual({ kind: "change", key: s, id: s })
    expect(pageOf(to.file("prompts", s, s, s))).toEqual({ kind: "file", fileKind: "prompts", project: s, name: s })
    expect(routeKeyOf(to.project(s))).toBe(s)
  }
})

test("an address's location is the decodeURI of its path; isAt holds for it and its sub-tabs, not for a sibling", () => {
  for (const s of SAMPLES) {
    for (const { address } of built(s)) {
      expect(locationOf(address)).toBe(decodeURI(address.slice(0, -1)))
      expect(locationOf(`#${address}`)).toBe(decodeURI(address.slice(0, -1)))
    }
    const page = to.change("-p", s)
    expect(isAt(locationOf(page), page)).toBe(true)
    expect(isAt(locationOf(to.change("-p", s, "spec")), page)).toBe(true)
    expect(isAt(locationOf(to.change("-p", `${s}c`)), page)).toBe(false)
    const file = to.file("prompts", s, s)
    expect(isAt(locationOf(to.file("prompts", s, s, "history")), file)).toBe(true)
    expect(isAt(locationOf(to.file("prompts", s, "other")), file)).toBe(false)
  }
})

test("only another project, another change or another kind of page leaves a change page", () => {
  const page = { key: "-p", id: "add-a" }
  for (const target of [
    "/-p/changes/add-a",
    "/-p/changes/add-a?",
    "/-p/changes/add-a/spec?",
    "/-p/changes/add-a/tasks?x=1",
    "#/-p/changes/add-a/",
  ]) {
    expect([target, leavesChange(page, target)]).toEqual([target, false])
  }
  for (const target of [
    "/-q/changes/add-a?",
    "/-p/changes/add-b?",
    "/-p/changes?",
    "/-p/changes/archive/2026-01-01-add-a?",
    "/workflows?",
    "/",
  ]) {
    expect([target, leavesChange(page, target)]).toEqual([target, true])
  }
})

test("a target leaves a file page when its kind, its global or projects/<key> part, or its name differs", () => {
  const page = { fileKind: "workflows" as const, project: "a", name: "x" }
  for (const same of [
    "/workflows/projects/a/x",
    "/workflows/projects/a/x/yaml",
    "/workflows/projects/a/x/history?q=1",
    "/workflows/projects/a/x?",
  ]) {
    expect([same, leavesFile(page, same)]).toEqual([same, false])
  }
  for (const other of [
    "/workflows/projects/b/x",
    "/workflows/global/x",
    "/prompts/projects/a/x",
    "/workflows/projects/a/y",
    "/workflows?",
    "/",
    "/a/changes",
  ]) {
    expect([other, leavesFile(page, other)]).toEqual([other, true])
  }
  expect(leavesFile({ fileKind: "prompts", project: null, name: "x" }, "/prompts/global/x/preview")).toBe(false)
  expect(pageOf("/prompts/global/x/history")).toEqual({ kind: "file", fileKind: "prompts", project: null, name: "x" })
  expect(pageOf("/prompts")).toBeNull()
})
