import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/dashboard/server";

const TOKEN = "ef".repeat(32);
const PORT = 4870;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const KEY = "-p";
const temps: string[] = [];

afterEach(() => {
  for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true });
});

const YAML = "version: theway.change/v1beta\ndescription: Do it\ntasks:\n  - text: one\n";
const SPEC = "# Spec\n\n- [ ] works\n";

/** A temporary home with the project `-p`, its active change `add-a` and the archived `2026-01-01-add-b`. */
function home(): { h: string; dir: string } {
  const h = realpathSync(mkdtempSync(join(tmpdir(), "theway-change-save-")));
  temps.push(h);
  const dir = join(h, "projects", KEY, "changes", "add-a");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "change.yaml"), YAML);
  writeFileSync(join(dir, "spec.md"), SPEC);
  writeFileSync(join(dir, "notes.txt"), "N");
  const archived = join(h, "projects", KEY, "changes", "archive", "2026-01-01-add-b");
  mkdirSync(archived, { recursive: true });
  writeFileSync(join(archived, "change.yaml"), YAML);
  writeFileSync(join(archived, "spec.md"), SPEC);
  mkdirSync(join(h, "projects", "-q", "changes", "add-q"), { recursive: true });
  writeFileSync(join(h, "projects", "-q", "changes", "add-q", "spec.md"), SPEC);
  return { h, dir };
}

const sha = (text: string): string => createHash("sha256").update(text).digest("hex");

type Res = { status: number; body: Record<string, unknown> };

async function put(h: string, path: string, body: unknown, headers: Record<string, string | undefined> = {}): Promise<Res> {
  const all: Record<string, string> = {};
  for (const [k, v] of Object.entries({ Host: `127.0.0.1:${PORT}`, Origin: ORIGIN, "X-Theway-Token": TOKEN, "Content-Type": "application/json", ...headers })) {
    if (v !== undefined) all[k] = v;
  }
  const res = await createApp(h, () => PORT, "", TOKEN).request(`${ORIGIN}${path}`, { method: "PUT", headers: all, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const route = (name: string, id = "add-a", key = KEY) => `/api/projects/${key}/changes/${id}/files/${name}`;

test("a save writes the text when base is the file's version, and answers its new version", async () => {
  const { h, dir } = home();
  const next = `${YAML}  - text: two\n`;
  expect(await put(h, route("change.yaml"), { text: next, base: sha(YAML) })).toEqual({ status: 200, body: { version: sha(next) } });
  expect(readFileSync(join(dir, "change.yaml"), "utf-8")).toBe(next);
  const spec = `${SPEC}- [x] saved\n`;
  expect(await put(h, route("spec.md"), { text: spec, base: sha(SPEC) })).toEqual({ status: 200, body: { version: sha(spec) } });
  expect(readFileSync(join(dir, "spec.md"), "utf-8")).toBe(spec);
  // Atomic: no temp file is left beside it, and no history is kept.
  expect(readdirSync(dir).sort()).toEqual(["change.yaml", "notes.txt", "spec.md"]);
  expect(readdirSync(h).includes("history")).toBe(false);
});

test("a stale base answers 409 with the current version and writes nothing, also when the file holds the text", async () => {
  const { h, dir } = home();
  const stale = sha("old");
  expect(await put(h, route("change.yaml"), { text: "x", base: stale })).toEqual({ status: 409, body: { error: "changed on disk", version: sha(YAML) } });
  expect(await put(h, route("change.yaml"), { text: YAML, base: stale })).toEqual({ status: 409, body: { error: "changed on disk", version: sha(YAML) } });
  expect(readFileSync(join(dir, "change.yaml"), "utf-8")).toBe(YAML);
});

test("the same text with the current base answers 200 and writes nothing", async () => {
  const { h, dir } = home();
  utimesSync(join(dir, "spec.md"), 1000, 1000);
  const before = statSync(join(dir, "spec.md")).mtimeMs;
  expect(await put(h, route("spec.md"), { text: SPEC, base: sha(SPEC) })).toEqual({ status: 200, body: { version: sha(SPEC) } });
  expect(statSync(join(dir, "spec.md")).mtimeMs).toBe(before);
});

test("a save keeps the file's mode", async () => {
  const { h, dir } = home();
  chmodSync(join(dir, "change.yaml"), 0o640);
  const next = YAML.replace("Do it", "Do it now");
  expect((await put(h, route("change.yaml"), { text: next, base: sha(YAML) })).status).toBe(200);
  expect(statSync(join(dir, "change.yaml")).mode & 0o777).toBe(0o640);
});

test("a base that is not a string, or a missing text, answers 400", async () => {
  const { h, dir } = home();
  for (const body of [{ text: YAML, base: null }, { text: YAML }, { text: YAML, base: 1 }, { base: sha(YAML) }, [YAML]]) {
    expect(await put(h, route("change.yaml"), body)).toEqual({ status: 400, body: { error: "invalid body" } });
  }
  expect(readFileSync(join(dir, "change.yaml"), "utf-8")).toBe(YAML);
});

test("unknown targets answer 404 with their error and write nothing", async () => {
  const { h, dir } = home();
  const cases: [string, string][] = [
    [route("change.yaml", "add-a", "-nope"), "unknown project"],
    [route("spec.md", "add-a", `${KEY}%2F..%2F-q`), "unknown project"],
    [route("change.yaml", "add-x"), "unknown change"],
    [route("change.yaml", "2026-01-01-add-b"), "unknown change"],
    [route("spec.md", "archive%2F2026-01-01-add-b"), "unknown change"],
    [route("spec.md", "..%2F..%2F-q%2Fchanges%2Fadd-q"), "unknown change"],
    [route("design.md"), "unknown file"],
    [route("notes.txt"), "unknown file"],
    [route("..%2Fadd-a%2Fspec.md"), "unknown file"],
    [route("%2E%2E%2Fspec.md"), "unknown file"],
    [route("sub%2Fspec.md"), "unknown file"],
    [route(".hidden.md"), "unknown file"],
  ];
  for (const [path, error] of cases) {
    expect([path, await put(h, path, { text: "x", base: sha(SPEC) })]).toEqual([path, { status: 404, body: { error } }]);
  }
  rmSync(join(dir, "change.yaml"));
  expect(await put(h, route("change.yaml"), { text: YAML, base: sha(YAML) })).toEqual({ status: 404, body: { error: "unknown file" } });
  expect(readdirSync(dir).sort()).toEqual(["notes.txt", "spec.md"]);
  expect(readFileSync(join(dir, "spec.md"), "utf-8")).toBe(SPEC);
});

test("the save route is refused without this server's Origin or the token", async () => {
  const { h, dir } = home();
  for (const headers of [{ Origin: undefined }, { Origin: "http://evil.example" }, { "X-Theway-Token": undefined }, { "X-Theway-Token": "ab".repeat(32) }]) {
    expect(await put(h, route("change.yaml"), { text: "x", base: sha(YAML) }, headers)).toEqual({ status: 403, body: { error: "forbidden" } });
  }
  expect((await put(h, route("change.yaml"), { text: "x", base: sha(YAML) }, { "Content-Type": "text/plain" })).status).toBe(415);
  expect(readFileSync(join(dir, "change.yaml"), "utf-8")).toBe(YAML);
});
