import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { ActiveChange, ChangeList, DashboardSettings, Project } from "../src/dashboard/contract"
import { activeRows } from "../src/dashboard/client/lib/changes"
import { NONE, passesAll, valueCounts } from "../src/dashboard/client/lib/list-filter"
import {
  allEntries,
  archiveMonths,
  countOf,
  entryOf,
  groupId,
  inProgress,
  inProgressCount,
  listsOpenRow,
  located,
  noneLoaded,
  notStarted,
  pinnedEntries,
  PROJECT_FIELDS,
  projectTree,
  projectValues,
  recentEntries,
  renamed,
  suggestions,
  toDo,
  togglePin,
  treeRows,
  regrouped,
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

test("to do leaves out Ready; In progress and Not started count their rows, a series as a whole once", () => {
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
  // All projects counts as Now and the sidebar do, over the projects of the row.
  const other: ChangeList = { active: [change("add-d", "in-progress")], archived: [] }
  expect(
    inProgress(
      new Map([
        ["-a", list],
        ["-b", other],
      ]),
      ["-a", "-b", "-none"],
    ),
  ).toBe(3)
  // Not started: add-c; the series add-s is In progress as a whole, so its Not started member is not counted. A series
  // none of whose members has started counts once.
  const fresh: ChangeList = {
    active: [change("add-t-01", "not-started"), change("add-t-02", "not-started"), change("add-u", "ready")],
    archived: [],
  }
  expect(
    notStarted(
      new Map([
        ["-a", list],
        ["-b", fresh],
      ]),
      ["-a", "-b", "-none"],
    ),
  ).toBe(2)
})

test("an archive month counts the month, not the rows listed when the list is cut", () => {
  const archived = (id: string, date: string) => ({ key: "-a", a: { id, dir: `${date}-${id}`, date, updated: date } })
  const all = [
    archived("add-e", "2026-11-12"),
    archived("add-d", "2026-11-03"),
    archived("add-c", "2026-11-01"),
    archived("add-b", "2026-10-20"),
    archived("add-a", "2026-10-02"),
  ]
  const months = archiveMonths(all.slice(0, 4), all)
  expect(months.map((m) => [m.id, m.rows.length, m.total])).toEqual([
    ["archive:2026-11", 3, 3],
    ["archive:2026-10", 1, 2],
  ])
  // Uncut, a month's total is its rows.
  expect(archiveMonths(all).map((m) => [m.rows.length, m.total])).toEqual([
    [3, 3],
    [2, 2],
  ])
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

test("a change grid lists a series with its members as sub-rows, under its project; a change has none", () => {
  const rows = activeRows(
    [change("add-a", "in-progress"), change("add-s-01", "ready"), change("add-s-02", "not-started")],
    "",
  )
  const tree = treeRows(rows.map((row) => ({ key: "-a", label: "acme", row })))
  const series = tree.find((r) => r.row.kind === "series")
  expect(series?.subRows.map((m) => [m.key, m.label, m.row.kind, m.row.id, m.subRows])).toEqual([
    ["-a", "acme", "change", "add-s-01", []],
    ["-a", "acme", "change", "add-s-02", []],
  ])
  expect(tree.find((r) => r.row.id === "add-a")?.subRows).toEqual([])
})

test("All projects lists a group with its kept projects as sub-rows, and a project alone with none", () => {
  const [group, solo] = allEntries(PROJECTS, GROUPED)
  if (group === undefined || solo === undefined) throw new Error("entries missing")
  const rows = projectTree([
    { e: group, keys: ["-ad"] },
    { e: solo, keys: solo.keys },
  ])
  expect(rows.map((r) => [r.id, r.key, r.keys])).toEqual([
    ["group:acme", null, ["-ad"]],
    [solo.id, solo.keys[0], solo.keys],
  ])
  expect(rows[0]?.subRows.map((m) => [m.id, m.key, m.keys, m.entry.id, m.subRows])).toEqual([
    ["group:acme/-ad", "-ad", ["-ad"], "group:acme", []],
  ])
  expect(rows[1]?.subRows).toEqual([])
})

test("Now, the project and group pages and All projects list their rows with the one list kit", () => {
  const client = join(import.meta.dirname, "..", "src", "dashboard", "client")
  const read = (...path: string[]) => readFileSync(join(client, ...path), "utf-8")
  const pages = ["pages/workspace/now.tsx", "pages/workspace/scope.tsx", "pages/workspace/projects.tsx"]
  // No page draws a list, a row or a band of its own: the kit's head, rows and sections do.
  for (const file of [...pages, "components/workspace-rows.tsx", "components/workspace-bands.tsx"])
    expect([file, /<(ul|li|table)\b/.test(read(file))]).toEqual([file, false])
  for (const page of pages) expect([page, read(page).includes("<ListHead")]).toEqual([page, true])
  expect(read("pages/workspace/projects.tsx")).toContain("<ListRow")
  expect(read("components/workspace-bands.tsx")).toContain("<ListRow")
  // A page of sections is walked as one list, across its bands.
  for (const page of ["pages/workspace/now.tsx", "pages/workspace/scope.tsx"])
    expect([page, /<NavList>\s*<Sections /.test(read(page))]).toEqual([page, true])
  // The column head sticks at the top of the list, the bands under it.
  expect(read("components/list-kit.tsx")).toMatch(/className="sticky top-0 z-20 flex h-8 /)
  expect(read("components/group-band.tsx")).toMatch(/className="sticky top-8 z-10 bg-background px-2 pt-2"/)
})

test("a change list draws the progress column only when it lists an open change as a row", () => {
  const rows = (...statuses: ActiveChange["status"][]) =>
    located(
      new Map([["-a", { active: statuses.map((s, i) => change(`add-${"abc"[i]}`, s)), archived: [] }]]),
      [project("-a", "acme", statuses.length)],
      "",
    )
  // A project's page lists Ready to archive as rows; Now counts it by project.
  expect([listsOpenRow(rows("ready"), false), listsOpenRow(rows("ready"), true)]).toEqual([true, false])
  expect(listsOpenRow(rows("ready", "not-started"), true)).toBe(true)
  // A list of archived changes alone has no open row.
  expect([listsOpenRow([], false), listsOpenRow([], true)]).toEqual([false, false])
})

test("Now shows the load error alone only when no change list could be read", () => {
  // Some lists failed and none came back; none failed; some failed but others came back.
  expect([noneLoaded(1, 0), noneLoaded(0, 0), noneLoaded(1, 2)]).toEqual([true, false, false])
})

test("undoing an ungroup puts the group back at its place with its pins and recents, its projects not grouped since", () => {
  const before = settings({
    groups: [
      { id: "a", name: "A", projects: ["-a"] },
      { id: "g", name: "G", projects: ["-x", "-w"] },
      { id: "z", name: "Z", projects: ["-z"] },
    ],
    pinned: ["project:-q", "group:g", "project:-r"],
    recent: ["group:g"],
  })
  const after = withProjectIn(ungrouped(before, "g"), "a", "-w")
  const back = regrouped(after, before, "g")
  expect(back.groups.map((g) => [g.id, g.projects])).toEqual([
    ["a", ["-a", "-w"]],
    ["g", ["-x"]],
    ["z", ["-z"]],
  ])
  expect(back.pinned).toEqual(["project:-q", "group:g", "project:-r"])
  expect(back.recent).toEqual(["group:g"])
  // Once back, a second undo changes nothing.
  expect(regrouped(back, before, "g")).toBe(back)
})
