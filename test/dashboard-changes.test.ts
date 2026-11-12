import { expect, test } from "bun:test";
import {
  ALL_PROJECTS,
  archivedRows,
  badgeVariant,
  brokenCount,
  type ChangeEntry,
  changeEntries,
  changesRows,
  homeRows,
  notices,
  type Project,
  STATUSES,
  seriesStatus,
  tabCounts,
} from "../src/dashboard/client/lib/changes";
import type { ActiveChange, Status, WorkflowItem } from "../src/dashboard/types";

const change = (id: string, status: Status, series: ActiveChange["series"] = null): ActiveChange => ({
  id,
  files: 1,
  tasks: status === "Invalid" ? { done: 0, total: 0 } : { done: status === "Not started" ? 0 : 1, total: 2 },
  status,
  description: status === "Invalid" ? null : `Do ${id}`,
  error: status === "Invalid" ? "not found" : null,
  series,
});

const project = (key: string, label: string, active: ActiveChange[], extra: Partial<Project> = {}): Project => ({
  key,
  label,
  active,
  archived: [],
  series: [],
  ...extra,
});

/** Two projects, listed by key, whose labels sort the other way. */
const PROJECTS: Project[] = [
  project(
    "k-a",
    "zulu",
    [
      change("fix-b", "In progress"),
      change("add-a", "In progress"),
      change("add-s-02", "In progress", { id: "add-s", ordinal: 2 }),
      change("add-y-01", "In progress", { id: "add-y", ordinal: 1 }),
      change("add-r", "Ready to archive"),
      change("add-n", "Not started"),
      change("add-i", "Invalid"),
    ],
    {
      series: [{ id: "add-s", done: 1, total: 3 }],
      archived: [
        { folder: "2026-01-02-add-old", date: "2026-01-02", id: "add-old" },
        { folder: "2026-03-01-add-new", date: "2026-03-01", id: "add-new" },
      ],
    },
  ),
  project("k-b", "alpha", [change("add-c", "In progress"), change("add-j", "Invalid")], {
    archived: [{ folder: "2026-02-01-add-mid", date: "2026-02-01", id: "add-mid" }],
  }),
];

const ids = (rows: { label: string; change: ActiveChange }[]) => rows.map((r) => `${r.label}/${r.change.id}`);

test("Home rows are the chosen project's In progress changes, ordered by project label then ID, with a member's place in its series, 1 of 1 alone", () => {
  expect(ids(homeRows(PROJECTS, ALL_PROJECTS))).toEqual(["alpha/add-c", "zulu/add-a", "zulu/add-s-02", "zulu/add-y-01", "zulu/fix-b"]);
  expect(ids(homeRows(PROJECTS, "k-a"))).toEqual(["zulu/add-a", "zulu/add-s-02", "zulu/add-y-01", "zulu/fix-b"]);
  expect(ids(homeRows(PROJECTS, "k-b"))).toEqual(["alpha/add-c"]);
  expect(homeRows(PROJECTS, "k-none")).toEqual([]);
  const rows = homeRows(PROJECTS, "k-a");
  expect(rows.map((r) => r.series)).toEqual([null, { ordinal: 2, total: 3 }, { ordinal: 1, total: 1 }, null]);
});

test("the Changes rows are the chosen project's changes of a status, every status for none", () => {
  expect(ids(changesRows(PROJECTS, ALL_PROJECTS, ""))).toEqual([
    "alpha/add-c",
    "alpha/add-j",
    "zulu/add-a",
    "zulu/add-i",
    "zulu/add-n",
    "zulu/add-r",
    "zulu/add-s-02",
    "zulu/add-y-01",
    "zulu/fix-b",
  ]);
  expect(ids(changesRows(PROJECTS, ALL_PROJECTS, "In progress"))).toEqual(["alpha/add-c", "zulu/add-a", "zulu/add-s-02", "zulu/add-y-01", "zulu/fix-b"]);
  expect(ids(changesRows(PROJECTS, ALL_PROJECTS, "Ready to archive"))).toEqual(["zulu/add-r"]);
  expect(ids(changesRows(PROJECTS, ALL_PROJECTS, "Not started"))).toEqual(["zulu/add-n"]);
  expect(ids(changesRows(PROJECTS, ALL_PROJECTS, "Invalid"))).toEqual(["alpha/add-j", "zulu/add-i"]);
  expect(ids(changesRows(PROJECTS, "k-b", "Invalid"))).toEqual(["alpha/add-j"]);
  expect(ids(changesRows(PROJECTS, "k-b", "Ready to archive"))).toEqual([]);
});

/** One project with a series of three active members, a lone member of another series, an invalid change and two archived ones. */
const G: Project[] = [
  project(
    "k-s",
    "acme",
    [
      change("add-q-01", "Ready to archive", { id: "add-q", ordinal: 1 }),
      change("add-q-02", "In progress", { id: "add-q", ordinal: 2 }),
      change("add-q-03", "Not started", { id: "add-q", ordinal: 3 }),
      change("add-z-03", "In progress", { id: "add-z", ordinal: 3 }),
      change("fix-b", "Invalid"),
    ],
    {
      series: [
        { id: "add-q", done: 0, total: 3 },
        { id: "add-z", done: 2, total: 3 },
      ],
      archived: [
        { folder: "2026-03-01-add-z-01", date: "2026-03-01", id: "add-z-01" },
        { folder: "2026-03-02-add-z-02", date: "2026-03-02", id: "add-z-02" },
      ],
    },
  ),
];

/** The short name of `acme`. */
const N = new Map([["acme", "tower"]]);

/** An entry as `series <id>` or `<change id>`. */
const names = (entries: ChangeEntry[]) => entries.map((e) => (e.kind === "series" ? `series ${e.id}` : e.row.change.id));

test("the entries of a tab group a series of two or more changes into one entry holding all its members", () => {
  const entries = changeEntries(G, ALL_PROJECTS, "In progress", "", N);
  expect(names(entries)).toEqual(["series add-q", "add-z-03"]);
  const [series, lone] = entries;
  if (series?.kind !== "series" || lone?.kind !== "change") throw new Error("unexpected entries");
  expect(series.key).toBe("k-s");
  expect(series.label).toBe("acme");
  expect(series.id).toBe("add-q");
  expect(series.members.map((r) => r.change.id)).toEqual(["add-q-01", "add-q-02", "add-q-03"]);
  expect(series.tasks).toEqual({ done: 2, total: 6 });
  expect(series.status).toBe("In progress");
  expect(lone.row.series).toEqual({ ordinal: 3, total: 3 });

  expect(names(changeEntries(G, ALL_PROJECTS, "Not started", "", N))).toEqual(["series add-q"]);
  expect(names(changeEntries(G, ALL_PROJECTS, "Ready to archive", "", N))).toEqual(["series add-q"]);
  expect(names(changeEntries(G, ALL_PROJECTS, "Invalid", "", N))).toEqual(["fix-b"]);
  expect(names(changeEntries(G, ALL_PROJECTS, "All", "", N))).toEqual(["series add-q", "add-z-03", "fix-b"]);
});

test("the search lists an entry holding a matching change, by ID, description, project label or short name", () => {
  expect(names(changeEntries(G, ALL_PROJECTS, "All", "Q-02", N))).toEqual(["series add-q"]);
  expect(names(changeEntries(G, ALL_PROJECTS, "All", " tower ", N))).toEqual(["series add-q", "add-z-03", "fix-b"]);
  expect(names(changeEntries(G, ALL_PROJECTS, "All", "acme", N))).toEqual(["series add-q", "add-z-03", "fix-b"]);
  expect(names(changeEntries(G, ALL_PROJECTS, "All", "do add-z", N))).toEqual(["add-z-03"]);
  expect(changeEntries(G, ALL_PROJECTS, "All", "nope", N)).toEqual([]);
  expect(changeEntries(G, ALL_PROJECTS, "In progress", "add-q-01", N)).toEqual([]);
  const ready = changeEntries(G, ALL_PROJECTS, "Ready to archive", "add-q-01", N);
  expect(names(ready)).toEqual(["series add-q"]);
  expect(ready[0]?.kind === "series" ? ready[0].members.map((r) => r.change.id) : []).toEqual(["add-q-01", "add-q-02", "add-q-03"]);
});

test("a change alone is a change entry with its place in its series, 1 of 1 alone, ordered by project label then ID", () => {
  const entries = changeEntries(PROJECTS, ALL_PROJECTS, "In progress", "", new Map());
  expect(entries.every((e) => e.kind === "change")).toBe(true);
  const rows = entries.flatMap((e) => (e.kind === "change" ? [e.row] : []));
  expect(ids(rows)).toEqual(["alpha/add-c", "zulu/add-a", "zulu/add-s-02", "zulu/add-y-01", "zulu/fix-b"]);
  expect(rows.map((r) => r.series)).toEqual([null, null, { ordinal: 2, total: 3 }, { ordinal: 1, total: 1 }, null]);
  expect(changeEntries(PROJECTS, "k-b", "Invalid", "", new Map()).flatMap((e) => (e.kind === "change" ? [`${e.row.label}/${e.row.change.id}`] : []))).toEqual(["alpha/add-j"]);
  expect(changeEntries(PROJECTS, "k-none", "In progress", "", new Map())).toEqual([]);
});

test("a series whose members are all invalid has no tasks and is Invalid", () => {
  const invalid = [project("k-v", "v", [change("add-v-01", "Invalid", { id: "add-v", ordinal: 1 }), change("add-v-02", "Invalid", { id: "add-v", ordinal: 2 })])];
  const entries = changeEntries(invalid, ALL_PROJECTS, "All", "", new Map());
  expect(entries.length).toBe(1);
  const [series] = entries;
  if (series?.kind !== "series") throw new Error("expected a series entry");
  expect(series.tasks).toBeNull();
  expect(series.status).toBe("Invalid");
});

test("each tab counts the changes it lists, under the search", () => {
  expect(tabCounts(G, ALL_PROJECTS, "", N)).toEqual({ "In progress": 2, "Not started": 1, "Ready to archive": 1, Invalid: 1, All: 5, Archived: 2 });
  expect(tabCounts(G, ALL_PROJECTS, "q-0", N)).toEqual({ "In progress": 1, "Not started": 1, "Ready to archive": 1, Invalid: 0, All: 3, Archived: 0 });
  expect(tabCounts(G, ALL_PROJECTS, "add-z", N)).toEqual({ "In progress": 1, "Not started": 0, "Ready to archive": 0, Invalid: 0, All: 1, Archived: 2 });
  expect(tabCounts(G, "k-none", "", N)).toEqual({ "In progress": 0, "Not started": 0, "Ready to archive": 0, Invalid: 0, All: 0, Archived: 0 });
});

test("a series is Invalid when a member is, else Ready to archive or Not started when all are, else In progress", () => {
  expect(seriesStatus(["Ready to archive", "Ready to archive"])).toBe("Ready to archive");
  expect(seriesStatus(["Not started", "Not started"])).toBe("Not started");
  expect(seriesStatus(["Ready to archive", "Not started"])).toBe("In progress");
  expect(seriesStatus(["In progress", "Invalid"])).toBe("Invalid");
});

test("the archived rows are the chosen project's archived changes, newest first", () => {
  expect(archivedRows(PROJECTS, ALL_PROJECTS).map((r) => r.archived.folder)).toEqual(["2026-03-01-add-new", "2026-02-01-add-mid", "2026-01-02-add-old"]);
  expect(archivedRows(PROJECTS, "k-b").map((r) => r.archived.folder)).toEqual(["2026-02-01-add-mid"]);
  expect(archivedRows(G, ALL_PROJECTS, "z-02", N).map((r) => r.archived.folder)).toEqual(["2026-03-02-add-z-02"]);
  expect(archivedRows(G, ALL_PROJECTS, "tower", N).map((r) => r.archived.folder)).toEqual(["2026-03-02-add-z-02", "2026-03-01-add-z-01"]);
});

const workflow = (name: string, key: string | null, error: string | null): WorkflowItem => ({
  kind: "workflows",
  scope: key === null ? "global" : "project",
  key,
  label: key,
  name,
  path: `/h/${name}.yaml`,
  description: null,
  default: false,
  error,
  errors: error === null ? 0 : 1,
  steps: null,
  runsOn: null,
});

test("Home's notices name one workflow that cannot run, count several, and count the invalid changes", () => {
  const none = [project("k-a", "a", [change("add-a", "In progress")])];
  expect(notices(none, [workflow("ok", null, null)], ALL_PROJECTS)).toEqual([]);

  const one = [project("k-a", "a", [change("add-a", "Invalid")])];
  expect(notices(one, [workflow("broken", null, "workflows/broken.yaml: bad"), workflow("ok", null, null)], ALL_PROJECTS)).toEqual([
    { text: "broken cannot run.", link: "Open it", href: "/workflows/global/broken" },
    { text: "1 change has an invalid change.yaml.", link: "See changes", href: "/changes" },
  ]);
  expect(notices(one, [workflow("mine", "k-a", "bad")], "k-a")[0]).toEqual({
    text: "mine cannot run.",
    link: "Open it",
    href: "/workflows/projects/k-a/mine",
  });

  const two = [project("k-a", "a", [change("add-a", "Invalid"), change("add-b", "Invalid")]), project("k-b", "b", [change("add-c", "Invalid")])];
  const broken = [workflow("g", null, "bad"), workflow("pa", "k-a", "bad"), workflow("pb", "k-b", "bad")];
  expect(notices(two, broken, "k-a")).toEqual([
    { text: "2 workflows cannot run.", link: "See workflows", href: "/workflows" },
    { text: "2 changes have an invalid change.yaml.", link: "See changes", href: "/changes" },
  ]);
  expect(notices(two, broken, ALL_PROJECTS)[0]?.text).toBe("3 workflows cannot run.");
  expect(notices(two, broken, ALL_PROJECTS)[1]?.text).toBe("3 changes have an invalid change.yaml.");
  // A project's own broken workflow does not count for another project; the global one does.
  expect(notices(two, broken, "k-b")).toEqual([
    { text: "2 workflows cannot run.", link: "See workflows", href: "/workflows" },
    { text: "1 change has an invalid change.yaml.", link: "See changes", href: "/changes" },
  ]);
  expect(notices(two, [workflow("pa", "k-a", "bad")], "k-b")).toEqual([{ text: "1 change has an invalid change.yaml.", link: "See changes", href: "/changes" }]);
});

test("the workflows that cannot run count the global ones and the chosen project's, every project's for all", () => {
  const broken = [workflow("g", null, "bad"), workflow("pa", "k-a", "bad"), workflow("pb", "k-b", "bad")];
  expect(brokenCount(broken, "k-a")).toBe(2);
  expect(brokenCount(broken, ALL_PROJECTS)).toBe(3);
  expect(brokenCount(broken, "k-b")).toBe(2);
  expect(brokenCount([workflow("pa", "k-a", "bad")], "k-b")).toBe(0);
  expect(brokenCount([workflow("ok", null, null)], ALL_PROJECTS)).toBe(0);
  expect(brokenCount([workflow("broken", null, "bad"), workflow("ok", null, null)], ALL_PROJECTS)).toBe(1);
});

test("each status has its badge variant", () => {
  expect(STATUSES.map((s) => [s, badgeVariant(s)])).toEqual([
    ["Not started", "invert-light"],
    ["In progress", "primary-light"],
    ["Ready to archive", "success-light"],
    ["Invalid", "destructive-light"],
  ]);
});
