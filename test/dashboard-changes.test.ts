import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { tildePath } from "../src/dashboard/changes";
import { createApp } from "../src/dashboard/server";

const TOKEN = "ab".repeat(32);
const KEY = "-p";
const temps: string[] = [];

afterEach(() => {
  for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true });
});

function home(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "theway-changes-")));
  temps.push(dir);
  mkdirSync(join(dir, "projects", KEY, "changes", "archive"), { recursive: true });
  return dir;
}

const changes = (h: string): string => join(h, "projects", KEY, "changes");

const yaml = (description: string, done: boolean[]): string =>
  `version: theway.change/v1beta\ndescription: ${description}\ntasks:\n${done.map((d, i) => `  - text: Task ${i + 1}\n    done: ${d}\n`).join("")}`;

/** A change folder under `changes/` (or `changes/archive/`) with its `change.yaml` and Markdown files. */
function change(h: string, name: string, changeYaml: string | null, files: Record<string, string> = {}): string {
  const dir = join(changes(h), name);
  mkdirSync(dir, { recursive: true });
  if (changeYaml !== null) writeFileSync(join(dir, "change.yaml"), changeYaml);
  for (const [f, text] of Object.entries(files)) writeFileSync(join(dir, f), text);
  return dir;
}

const app = (h: string) => createApp(h, () => 4870, "", TOKEN);
async function get(h: string, path: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await app(h).request(`http://127.0.0.1:4870${path}`, { headers: { Host: "127.0.0.1:4870" } });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

test("GET …/changes lists the active changes by ID with their status, and the archived ones newest first", async () => {
  const h = home();
  const valid = change(h, "add-b", yaml("Bee", [true, false, false]));
  change(h, "add-a", yaml("Ay", [false]));
  change(h, "add-c", yaml("Sea", [true, true]));
  change(h, "add-d", "version: nope\n");
  const bare = change(h, "add-e", null);
  change(h, "archive/2026-01-02-add-x-01", yaml("X", [true]));
  change(h, "archive/2026-03-04-add-y", null, { "tasks.md": "- [x] old\n" });
  change(h, "archive/not-dated", null);
  const when = new Date("2026-11-12T10:00:00.000Z");
  utimesSync(join(valid, "change.yaml"), when, when);

  const { status, body } = await get(h, `/api/projects/${KEY}/changes`);
  expect(status).toBe(200);
  const active = body.active as { id: string; updated: string }[];
  expect(active.map((a) => a.id)).toEqual(["add-a", "add-b", "add-c", "add-d", "add-e"]);
  expect(active[1]).toEqual({ id: "add-b", description: "Bee", status: "in-progress", done: 1, total: 3, issues: [], updated: when.toISOString() });
  expect(active[0]).toMatchObject({ status: "not-started", done: 0, total: 1 });
  expect(active[2]).toMatchObject({ status: "ready", done: 2, total: 2 });
  expect(active[3]).toMatchObject({ description: null, status: "invalid", done: 0, total: 0 });
  expect((active[3] as unknown as { issues: string[] }).issues).toEqual(["version: must be theway.change/v1beta", "description: is required", "tasks: is required"]);
  // No `change.yaml`: the folder's own modification time.
  expect(active[4]).toMatchObject({ status: "invalid", issues: ["not found"], updated: statSync(bare).mtime.toISOString() });
  expect(body.archived).toEqual([
    { dir: "2026-03-04-add-y", id: "add-y", date: "2026-03-04" },
    { dir: "2026-01-02-add-x-01", id: "add-x-01", date: "2026-01-02" },
  ]);
});

test("GET …/changes/:id gives the change, its tasks, its Markdown files in order, its folder and its series", async () => {
  const h = home();
  const dir = change(h, "add-x-03", yaml("Third", [true, false]), {
    "notes.md": "N",
    "zeta.md": "Z",
    "Beta.md": "B",
    "alpha.md": "A",
    "spec.md": "S",
    "design.md": "D",
    ".hidden.md": "H",
    "readme.txt": "T",
  });
  mkdirSync(join(dir, "folder.md"));
  change(h, "add-x-05", yaml("Fifth", [true]));
  change(h, "archive/2026-01-01-add-x-01", yaml("First", [true]));

  const { status, body } = await get(h, `/api/projects/${KEY}/changes/add-x-03`);
  expect(status).toBe(200);
  expect(body).toEqual({
    id: "add-x-03",
    archived: null,
    description: "Third",
    status: "in-progress",
    done: 1,
    total: 2,
    issues: [],
    tasks: [
      { text: "Task 1", done: true },
      { text: "Task 2", done: false },
    ],
    folder: dir,
    files: ["spec.md", "design.md", "notes.md", "alpha.md", "Beta.md", "zeta.md"].map((name) => ({ name, text: name[0]?.toUpperCase() })),
    series: {
      id: "add-x",
      members: [
        { ordinal: "01", active: null, archived: "2026-01-01-add-x-01", status: "archived", done: null, total: null },
        { ordinal: "02", active: null, archived: null, status: null, done: null, total: null },
        { ordinal: "03", active: "add-x-03", archived: null, status: "in-progress", done: 1, total: 2 },
        { ordinal: "04", active: null, archived: null, status: null, done: null, total: null },
        { ordinal: "05", active: "add-x-05", archived: null, status: "ready", done: 1, total: 1 },
      ],
    },
  });
});

test("an Invalid change has no description, tasks or counts, and its issues unchanged", async () => {
  const h = home();
  change(h, "add-bad", "version: theway.change/v1beta\ndescription: ok\ntasks: []\n", { "spec.md": "S" });
  const { body } = await get(h, `/api/projects/${KEY}/changes/add-bad`);
  expect(body).toMatchObject({
    description: null,
    status: "invalid",
    done: 0,
    total: 0,
    tasks: [],
    issues: ["tasks: must be a list with at least one task"],
    series: null,
  });
});

test("GET …/changes/archive/:dir gives an archived change; one with only a tasks.md has issues and a tasks-md file", async () => {
  const h = home();
  const valid = change(h, "archive/2026-02-03-add-z-02", yaml("Zed", [true, true]), { "spec.md": "S" });
  const old = change(h, "archive/2025-12-01-add-old", null, { "tasks.md": "- [x] done\n" });

  const a = await get(h, `/api/projects/${KEY}/changes/archive/2026-02-03-add-z-02`);
  expect(a.status).toBe(200);
  expect(a.body).toMatchObject({
    id: "add-z-02",
    archived: "2026-02-03",
    description: "Zed",
    status: "archived",
    done: 2,
    total: 2,
    issues: [],
    folder: valid,
    files: [{ name: "spec.md", text: "S" }],
    series: {
      id: "add-z",
      members: [
        { ordinal: "01", active: null, archived: null, status: null, done: null, total: null },
        { ordinal: "02", active: null, archived: "2026-02-03-add-z-02", status: "archived", done: null, total: null },
      ],
    },
  });

  const b = await get(h, `/api/projects/${KEY}/changes/archive/2025-12-01-add-old`);
  expect(b.body).toEqual({
    id: "add-old",
    archived: "2025-12-01",
    description: null,
    status: "archived",
    done: 0,
    total: 0,
    issues: ["not found"],
    tasks: [],
    folder: old,
    files: [{ name: "tasks.md", text: "- [x] done\n" }],
    series: null,
  });
});

test("a series ordinal is filled by its active folder before archived ones, else by the newest archive folder", async () => {
  const h = home();
  change(h, "add-s-01", yaml("Active one", [false]));
  change(h, "archive/2026-05-01-add-s-01", yaml("Archived one", [true]));
  change(h, "archive/2026-01-01-add-s-02", yaml("Old two", [true]));
  change(h, "archive/2026-06-01-add-s-02", yaml("New two", [true]));
  change(h, "archive/2026-03-01-add-s-02", yaml("Mid two", [true]));
  change(h, "add-s-03", yaml("Three", [false]));

  const { body } = await get(h, `/api/projects/${KEY}/changes/add-s-03`);
  expect((body.series as { members: unknown[] }).members).toEqual([
    { ordinal: "01", active: "add-s-01", archived: null, status: "not-started", done: 0, total: 1 },
    { ordinal: "02", active: null, archived: "2026-06-01-add-s-02", status: "archived", done: null, total: null },
    { ordinal: "03", active: "add-s-03", archived: null, status: "not-started", done: 0, total: 1 },
  ]);
});

test("unknown targets answer 404 with their error, encoded / and .. included", async () => {
  const h = home();
  change(h, "add-a", yaml("A", [false]));
  change(h, "archive/2026-01-01-add-b", yaml("B", [true]));
  change(h, "archive/undated-add-c", yaml("C", [true]));
  mkdirSync(join(h, "projects", "-q", "changes"), { recursive: true });

  const cases: [string, string][] = [
    ["/api/projects/-nope/changes", "unknown project"],
    ["/api/projects/-nope/changes/add-a", "unknown project"],
    ["/api/projects/-nope/changes/archive/2026-01-01-add-b", "unknown project"],
    [`/api/projects/${KEY}%2F..%2F-q/changes`, "unknown project"],
    ["/api/projects/%2E%2E%2F-q/changes", "unknown project"],
    [`/api/projects/..%2Fprojects%2F${KEY}/changes/add-a`, "unknown project"],
    [`/api/projects/${KEY}/changes/add-x`, "unknown change"],
    [`/api/projects/${KEY}/changes/archive`, "unknown change"],
    [`/api/projects/${KEY}/changes/%2E%2E%2Fadd-a`, "unknown change"],
    [`/api/projects/${KEY}/changes/archive%2F2026-01-01-add-b`, "unknown change"],
    [`/api/projects/${KEY}/changes/..%2F..%2F${KEY}%2Fchanges%2Fadd-a`, "unknown change"],
    [`/api/projects/${KEY}/changes/archive/2026-01-01-add-x`, "unknown archive folder"],
    [`/api/projects/${KEY}/changes/archive/undated-add-c`, "unknown archive folder"],
    [`/api/projects/${KEY}/changes/archive/%2E%2E%2F..%2Fadd-a`, "unknown archive folder"],
    [`/api/projects/${KEY}/changes/archive/..%2F..%2Fchanges%2Fadd-a`, "unknown archive folder"],
    [`/api/projects/${KEY}/changes/archive/2026-01-01-add-b%2F..%2F..%2Fadd-a`, "unknown archive folder"],
  ];
  for (const [path, error] of cases) {
    const { status, body } = await get(h, path);
    expect([path, status, body]).toEqual([path, 404, { error }]);
  }
  // A segment that is only an encoded `..` is resolved by URL parsing before routing, so it never reaches a route.
  for (const path of ["/api/projects/%2E%2E/changes", `/api/projects/${KEY}/changes/%2E%2E`, `/api/projects/${KEY}/changes/archive/%2E%2E`]) {
    const { status, body } = await get(h, path);
    expect([path, status, body]).toEqual([path, 404, { error: "not found" }]);
  }
});

test("the folder is written with ~ when under the user's home directory", () => {
  expect(tildePath("/home/me/.theway/projects/-p/changes/add-a", "/home/me")).toBe("~/.theway/projects/-p/changes/add-a");
  expect(tildePath("/home/me", "/home/me")).toBe("~");
  expect(tildePath("/home/media/x", "/home/me")).toBe("/home/media/x");
  expect(tildePath("/srv/theway/x", "/home/me/")).toBe("/srv/theway/x");
  expect(tildePath("/home/me/x", "/home/me/")).toBe("~/x");
});
