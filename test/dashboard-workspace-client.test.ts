import { expect, test } from "bun:test"
import type { ActiveChange, ChangeList, DashboardSettings, Project } from "../src/dashboard/contract"
import { NONE, passesAll, valueCounts } from "../src/dashboard/client/lib/list-filter"
import {
  allEntries,
  countOf,
  entryOf,
  groupId,
  inProgressCount,
  pinnedEntries,
  PROJECT_FIELDS,
  projectValues,
  recentEntries,
  renamed,
  suggestions,
  toDo,
  togglePin,
  ungrouped,
  withGroup,
  withoutProject,
  withProjectIn,
} from "../src/dashboard/client/lib/workspace"

const project = (key: string, label: string, active = 0): Project => ({ key, label, active, path: null })
const PROJECTS = [
  project("-a", "acme", 2),
  project("-ad", "acme-docs", 1),
  project("-as", "acme.site", 0),
  project("-w", "web", 3),
  project("-x", "xy-one"),
  project("-y", "xy-two"),
]
const settings = (rest: Partial<DashboardSettings> = {}): DashboardSettings => ({
  pinned: [],
  groups: [],
  recent: [],
  dismissed: [],
  ...rest,
})
const GROUPED = settings({ groups: [{ id: "acme", name: "Acme", projects: ["-a", "-ad", "-gone"] }] })

test("an entry names a project or a group, with its keys, open count and page; a gone one is null", () => {
  expect(entryOf("project:-w", PROJECTS, GROUPED)).toEqual({
    id: "project:-w",
    kind: "project",
    label: "web",
    keys: ["-w"],
    open: 3,
    href: "/-w?",
  })
  // A group's keys leave out the projects no longer listed.
  expect(entryOf("group:acme", PROJECTS, GROUPED)).toEqual({
    id: "group:acme",
    kind: "group",
    label: "Acme",
    keys: ["-a", "-ad"],
    open: 3,
    href: "/group/acme?",
  })
  expect(entryOf("project:-gone", PROJECTS, GROUPED)).toBeNull()
  expect(entryOf("group:nope", PROJECTS, GROUPED)).toBeNull()
  expect(entryOf("other", PROJECTS, GROUPED)).toBeNull()
})

test("pinned entries keep their order; recent ones leave out the pinned, at most five", () => {
  const s = settings({
    ...GROUPED,
    pinned: ["project:-w", "group:acme", "project:-gone"],
    recent: ["group:acme", "project:-x", "project:-y", "project:-as", "project:-gone", "project:-w"],
  })
  expect(pinnedEntries(PROJECTS, s).map((e) => e.id)).toEqual(["project:-w", "group:acme"])
  expect(recentEntries(PROJECTS, s).map((e) => e.id)).toEqual(["project:-x", "project:-y", "project:-as"])
  expect(recentEntries(PROJECTS, s, 2).map((e) => e.id)).toEqual(["project:-x", "project:-y"])
})

test("All projects lists each group, then each project in no group, by label", () => {
  expect(allEntries(PROJECTS, GROUPED).map((e) => e.id)).toEqual([
    "group:acme",
    "project:-as",
    "project:-w",
    "project:-x",
    "project:-y",
  ])
})

test("a suggestion groups ungrouped projects sharing a first word of 3 letters or more, unless dismissed", () => {
  expect(suggestions(PROJECTS, settings())).toEqual([{ name: "acme", keys: ["-a", "-ad", "-as"], key: "-a|-ad|-as" }])
  // "xy" is too short; a grouped project is left out, and one left alone is no group.
  expect(suggestions(PROJECTS, GROUPED)).toEqual([])
  expect(suggestions(PROJECTS, settings({ dismissed: ["-a|-ad|-as"] }))).toEqual([])
})

test("a group's id comes from its name, made unique", () => {
  expect(groupId("Acme Corp!", [])).toBe("acme-corp")
  expect(groupId("acme", ["acme", "acme-2"])).toBe("acme-3")
  expect(groupId("!!!", [])).toBe("group")
})

test("grouping takes the projects out of any other group and drops a group left empty", () => {
  const s = withGroup(settings({ groups: [{ id: "old", name: "Old", projects: ["-x"] }] }), " New ", ["-x", "-y"])
  expect(s.groups).toEqual([{ id: "new", name: "New", projects: ["-x", "-y"] }])
  const moved = withProjectIn(
    settings({
      groups: [
        { id: "a", name: "A", projects: ["-a", "-w"] },
        { id: "b", name: "B", projects: ["-x"] },
      ],
    }),
    "b",
    "-w",
  )
  expect(moved.groups).toEqual([
    { id: "a", name: "A", projects: ["-a"] },
    { id: "b", name: "B", projects: ["-x", "-w"] },
  ])
})

test("removing the last project of a group, or ungrouping it, drops its pin and its recent entry", () => {
  const s = settings({
    groups: [{ id: "g", name: "G", projects: ["-x"] }],
    pinned: ["group:g", "project:-w"],
    recent: ["group:g"],
  })
  for (const next of [withoutProject(s, "-x"), ungrouped(s, "g")]) {
    expect(next.groups).toEqual([])
    expect(next.pinned).toEqual(["project:-w"])
    expect(next.recent).toEqual([])
  }
})

test("renaming trims the name; pinning toggles at the end", () => {
  expect(renamed(GROUPED, "acme", "  Acme Inc ").groups[0]?.name).toBe("Acme Inc")
  const pinned = togglePin(settings({ pinned: ["project:-a"] }), "project:-w")
  expect(pinned.pinned).toEqual(["project:-a", "project:-w"])
  expect(togglePin(pinned, "project:-a").pinned).toEqual(["project:-w"])
})

const change = (id: string, status: ActiveChange["status"]): ActiveChange => ({
  id,
  description: null,
  status,
  done: 0,
  total: 1,
  issues: [],
  updated: "2026-11-16T00:00:00Z",
})

test("to do leaves out Ready; In progress counts a series In progress as a whole once", () => {
  const list: ChangeList = {
    active: [
      change("add-a", "in-progress"),
      change("add-b", "ready"),
      change("add-c", "not-started"),
      change("add-s-01", "ready"),
      change("add-s-02", "not-started"),
    ],
    archived: [],
  }
  expect(toDo(list)).toBe(3)
  expect(toDo(undefined)).toBe(0)
  // add-a, and the series add-s (one Ready, one Not started: In progress).
  expect(inProgressCount(list)).toBe(2)
})

test("countOf writes the noun singular for one and plural otherwise", () => {
  expect(countOf(1, "project")).toBe("1 project")
  expect(countOf(0, "project")).toBe("0 projects")
  expect(countOf(3, "group")).toBe("3 groups")
})

test("All projects filters a project by its group (none as (none)) and by its pin, its own or its group's", () => {
  expect(PROJECT_FIELDS).toEqual(["group", "pinned"])
  const s = settings({ groups: GROUPED.groups, pinned: ["group:acme", "project:-w"] })
  const values = (key: string, field: string) => projectValues(s, key, field)
  expect(values("-ad", "group")).toEqual(["acme"])
  expect(values("-w", "group")).toEqual([NONE])
  // A grouped project is pinned through its group; one in no group by its own pin.
  expect(["-a", "-w", "-x"].map((k) => values(k, "pinned"))).toEqual([["yes"], ["yes"], ["no"]])
  expect(values("-a", "other")).toEqual([])
  const keys = PROJECTS.map((p) => p.key)
  const notPinned = [{ field: "pinned", not: false, values: ["no"] }]
  expect(keys.filter((k) => passesAll(k, notPinned, values))).toEqual(["-as", "-x", "-y"])
  // Each Group value counts the projects the Pinned rule keeps: Acme's are pinned through it.
  expect(valueCounts(keys, "group", notPinned, values)).toEqual(new Map([[NONE, 3]]))
})
