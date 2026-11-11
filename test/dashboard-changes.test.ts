import { expect, test } from "bun:test";
import { ALL_PROJECTS, archivedRows, badgeVariant, changesRows, homeRows, notices, type Project, STATUSES } from "../src/dashboard/client/lib/changes";
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

test("the archived rows are the chosen project's archived changes, newest first", () => {
  expect(archivedRows(PROJECTS, ALL_PROJECTS).map((r) => r.archived.folder)).toEqual(["2026-03-01-add-new", "2026-02-01-add-mid", "2026-01-02-add-old"]);
  expect(archivedRows(PROJECTS, "k-b").map((r) => r.archived.folder)).toEqual(["2026-02-01-add-mid"]);
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

test("each status has its badge variant", () => {
  expect(STATUSES.map((s) => [s, badgeVariant(s)])).toEqual([
    ["Not started", "secondary"],
    ["In progress", "default"],
    ["Ready to archive", "success"],
    ["Invalid", "destructive"],
  ]);
});
