import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StoreError } from "../src/core/store";
import { fileStore, sha256 } from "../src/core/store/files";

const KEY = "-p";
const temps: string[] = [];

afterEach(() => {
  for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true });
});

function home(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "theway-store-")));
  temps.push(dir);
  return dir;
}

const changes = (h: string, key = KEY): string => join(h, "projects", key, "changes");

function put(path: string, text: string): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text);
}

const sha = (text: string): string => createHash("sha256").update(text).digest("hex");

/** The `StoreError` code a call throws, or the value it returns. */
function codeOf(f: () => unknown): unknown {
  try {
    return f();
  } catch (e) {
    return e instanceof StoreError ? e.code : e;
  }
}

const active = (id: string) => ({ kind: "active", id }) as const;
const archived = (ref: string) => ({ kind: "archived", ref }) as const;

test("projectKeys lists the non-hidden project folders whose name is a valid key, sorted", () => {
  const h = home();
  expect(fileStore(h).projectKeys()).toEqual([]);
  for (const n of ["-b", "-a", ".hidden", "ab"]) mkdirSync(join(h, "projects", n), { recursive: true });
  put(join(h, "projects", "-file"), "x");
  expect(fileStore(h).projectKeys()).toEqual(["-a", "-b", "ab"]);
});

test("activeIds and archived list the change folders; an archive entry is dated when its name starts with a date", () => {
  const h = home();
  const s = fileStore(h);
  expect([s.activeIds(KEY), s.archived(KEY)]).toEqual([[], []]);
  for (const n of ["add-b", "add-a", ".hidden", "archive/2026-01-02-add-x-01", "archive/2025-12-01-add-y", "archive/not-dated", "archive/.hidden"]) {
    mkdirSync(join(changes(h), n), { recursive: true });
  }
  put(join(changes(h), "notes.md"), "x");
  put(join(changes(h), "archive", "2026-01-03-file"), "x");
  expect(s.activeIds(KEY)).toEqual(["add-a", "add-b"]);
  expect(s.archived(KEY)).toEqual([
    { ref: "2025-12-01-add-y", id: "add-y", date: "2025-12-01" },
    { ref: "2026-01-02-add-x-01", id: "add-x-01", date: "2026-01-02" },
    { ref: "not-dated", id: null, date: null },
  ]);
  expect([s.exists(KEY, active("add-a")), s.exists(KEY, active("archive")), s.exists(KEY, active("add-z"))]).toEqual([true, false, false]);
  expect([s.exists(KEY, archived("not-dated")), s.exists(KEY, archived("2026-01-03-file"))]).toEqual([true, false]);
});

test("fileNames lists change.yaml then the Markdown files; fileCount counts regular, non-hidden files", () => {
  const h = home();
  const s = fileStore(h);
  const dir = join(changes(h), "add-a");
  for (const n of ["change.yaml", "zeta.md", "notes.md", "Beta.md", "spec.md", "readme.txt", ".hidden.md", ".hidden"]) put(join(dir, n), n);
  mkdirSync(join(dir, "folder.md"));
  mkdirSync(join(dir, "sub"));
  expect(s.fileNames(KEY, active("add-a"))).toEqual(["change.yaml", "spec.md", "notes.md", "Beta.md", "zeta.md"]);
  expect(s.fileCount(KEY, active("add-a"))).toBe(6);
  rmSync(join(dir, "change.yaml"));
  expect(s.fileNames(KEY, active("add-a"))[0]).toBe("spec.md");
  put(join(changes(h), "archive", "2026-01-01-add-b", "spec.md"), "S");
  expect(s.fileNames(KEY, archived("2026-01-01-add-b"))).toEqual(["spec.md"]);
  expect(s.fileCount(KEY, archived("2026-01-01-add-b"))).toBe(1);
});

test("readFile gives a listed file's bytes and version, null for an absent, unlisted or unreadable file", () => {
  const h = home();
  const s = fileStore(h);
  put(join(changes(h), "add-a", "change.yaml"), "Y");
  put(join(changes(h), "add-a", "notes.txt"), "N");
  const read = s.readFile(KEY, active("add-a"), "change.yaml");
  expect([read?.bytes.toString("utf-8"), read?.version]).toEqual(["Y", sha("Y")]);
  expect(sha256(Buffer.from("Y"))).toBe(sha("Y"));
  expect(s.readFile(KEY, active("add-a"), "spec.md")).toBeNull();
  expect(s.readFile(KEY, active("add-a"), "notes.txt")).toBeNull();
  expect(s.readFile(KEY, active("add-x"), "change.yaml")).toBeNull();
});

test.skipIf(process.getuid?.() === 0)("readFile is null on a file it cannot read", () => {
  const h = home();
  const file = join(changes(h), "add-a", "spec.md");
  put(file, "S");
  chmodSync(file, 0o000);
  try {
    expect(fileStore(h).readFile(KEY, active("add-a"), "spec.md")).toBeNull();
  } finally {
    chmodSync(file, 0o644);
  }
});

test("writeFile writes on the current base, keeps the mode, writes nothing for the same bytes and reports a conflict", () => {
  const h = home();
  const s = fileStore(h);
  const file = join(changes(h), "add-a", "change.yaml");
  put(file, "one");
  chmodSync(file, 0o640);
  expect(s.writeFile(KEY, "add-a", "change.yaml", Buffer.from("two"), sha("one"))).toEqual({ status: "written", version: sha("two") });
  expect(readFileSync(file, "utf-8")).toBe("two");
  expect(statSync(file).mode & 0o777).toBe(0o640);
  expect(readdirSync(join(changes(h), "add-a"))).toEqual(["change.yaml"]);

  utimesSync(file, 1000, 1000);
  expect(s.writeFile(KEY, "add-a", "change.yaml", Buffer.from("two"), sha("two"))).toEqual({ status: "unchanged", version: sha("two") });
  expect(statSync(file).mtimeMs).toBe(1000000);

  expect(s.writeFile(KEY, "add-a", "change.yaml", Buffer.from("three"), sha("one"))).toEqual({ status: "conflict", version: sha("two") });
  expect(readFileSync(file, "utf-8")).toBe("two");

  expect(codeOf(() => s.writeFile(KEY, "add-x", "change.yaml", Buffer.from("x"), sha("two")))).toBe("missing");
  expect(codeOf(() => s.writeFile(KEY, "add-a", "spec.md", Buffer.from("x"), sha("two")))).toBe("missing");
});

test.skipIf(process.getuid?.() === 0)("writeFile throws the native error on a read-only file and leaves it as it was", () => {
  const h = home();
  const file = join(changes(h), "add-a", "spec.md");
  put(file, "S");
  chmodSync(file, 0o444);
  let message = "";
  try {
    fileStore(h).writeFile(KEY, "add-a", "spec.md", Buffer.from("T"), sha("S"));
  } catch (e) {
    message = (e as Error).message;
  }
  expect(message).toStartWith("EACCES: permission denied, access '");
  expect(readFileSync(file, "utf-8")).toBe("S");
  expect(statSync(file).mode & 0o777).toBe(0o444);
});

test("archive moves an active change to its reference, and refuses a missing change or a taken destination", () => {
  const h = home();
  const s = fileStore(h);
  put(join(changes(h), "add-a", "change.yaml"), "Y");
  expect(s.archiveRef(KEY, "add-a", "2026-11-14")).toBe("2026-11-14-add-a");
  expect(codeOf(() => s.archive(KEY, "add-x", "2026-11-14"))).toBe("missing");

  put(join(changes(h), "archive", "2026-11-13-add-a"), "a file");
  let error: StoreError | null = null;
  try {
    s.archive(KEY, "add-a", "2026-11-13");
  } catch (e) {
    error = e as StoreError;
  }
  expect([error?.code, error?.path]).toEqual(["exists", join(changes(h), "archive", "2026-11-13-add-a")]);
  expect(existsSync(join(changes(h), "add-a"))).toBe(true);

  expect(s.archive(KEY, "add-a", "2026-11-14")).toBe("2026-11-14-add-a");
  expect(existsSync(join(changes(h), "add-a"))).toBe(false);
  expect(readFileSync(join(changes(h), "archive", "2026-11-14-add-a", "change.yaml"), "utf-8")).toBe("Y");
  expect(s.archived(KEY).map((e) => e.ref)).toEqual(["2026-11-14-add-a"]);

  // The archive folder is created when missing.
  put(join(changes(h, "-q"), "add-b", "spec.md"), "S");
  expect(s.archive("-q", "add-b", "2026-11-14")).toBe("2026-11-14-add-b");
});

test("updated is the mtime of change.yaml, else of the folder", () => {
  const h = home();
  const s = fileStore(h);
  const dir = join(changes(h), "add-a");
  put(join(dir, "change.yaml"), "Y");
  const when = new Date("2026-11-12T10:00:00.000Z");
  utimesSync(join(dir, "change.yaml"), when, when);
  expect(s.updated(KEY, active("add-a"))).toBe(when.toISOString());
  rmSync(join(dir, "change.yaml"));
  const folder = new Date("2026-10-01T08:00:00.000Z");
  utimesSync(dir, folder, folder);
  expect(s.updated(KEY, active("add-a"))).toBe(folder.toISOString());
  expect(codeOf(() => s.updated(KEY, active("add-x")))).toBe("missing");
});

test("dirOf is the change's folder, existing or not, and refuses an ID or reference that is not one segment", () => {
  const h = home();
  const s = fileStore(h);
  expect(s.dirOf(KEY, active("add-a"))).toBe(join(changes(h), "add-a"));
  expect(s.dirOf(KEY, archived("2026-01-01-add-b"))).toBe(join(changes(h), "archive", "2026-01-01-add-b"));
  for (const bad of ["", ".", "..", "a/b", "a\\b"]) {
    expect([bad, codeOf(() => s.dirOf(KEY, active(bad)))]).toEqual([bad, "invalid"]);
    expect([bad, codeOf(() => s.dirOf(KEY, archived(bad)))]).toEqual([bad, "invalid"]);
  }
});

test("an ID or reference that leaves its folder is absent", () => {
  const h = home();
  const s = fileStore(h);
  put(join(changes(h), "add-a", "change.yaml"), "Y");
  put(join(changes(h), "archive", "2026-01-01-add-b", "spec.md"), "S");
  const outside = archived("2026-01-01-add-b/../../add-a");
  const nested = active("archive/2026-01-01-add-b");
  for (const change of [outside, nested]) {
    expect(s.exists(KEY, change)).toBe(false);
    expect(s.fileNames(KEY, change)).toEqual([]);
    expect(s.fileCount(KEY, change)).toBe(0);
    expect(s.readFile(KEY, change, "change.yaml")).toBeNull();
    expect(s.readFile(KEY, change, "spec.md")).toBeNull();
    expect(codeOf(() => s.updated(KEY, change))).toBe("missing");
  }
  expect(s.readFile(KEY, active("add-a"), "../add-a/change.yaml")).toBeNull();
  expect(codeOf(() => s.writeFile(KEY, "archive/2026-01-01-add-b", "spec.md", Buffer.from("x"), sha("S")))).toBe("missing");
  expect(codeOf(() => s.archive(KEY, "../-p/changes/add-a", "2026-11-14"))).toBe("missing");
  expect(existsSync(join(changes(h), "add-a", "change.yaml"))).toBe(true);
});
