import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seriesReason, standaloneReason } from "../src/core/validate-id";

const CLI = join(import.meta.dirname, "..", "dist", "theway.js");
const homes: string[] = [];

function home(): string {
  const dir = mkdtempSync(join(tmpdir(), "theway-core-"));
  homes.push(dir);
  return dir;
}

function put(path: string, text: string): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text);
}

function run(dir: string, ...args: string[]) {
  return spawnSync("node", [CLI, ...args], {
    encoding: "utf-8",
    env: { ...process.env, THEWAY_HOME: dir },
  });
}

afterEach(() => {
  for (const d of homes.splice(0)) rmSync(d, { recursive: true, force: true });
});

test("list and archive agree on a last task line without a newline", () => {
  const dir = home();
  put(join(dir, "p", "changes", "add-x", "tasks.md"), "- [x] 1. a\n- [ ] Ready to archive\n- [ ] 2. b");
  expect(run(dir, "list", "p").stdout).toContain("1/2 tasks done");
  const res = run(dir, "archive", "p", "add-x");
  expect(res.status).toBe(1);
  expect(res.stderr).toContain("3:- [ ] 2. b");
  expect(res.stderr).not.toContain("Ready to archive");
});

test("archive refuses an id already archived today", () => {
  const dir = home();
  const spec = join(dir, "p", "changes", "add-y", "spec.md");
  put(spec, "# y\n");
  expect(run(dir, "archive", "p", "add-y").status).toBe(0);
  put(spec, "# y\n");
  const res = run(dir, "archive", "p", "add-y");
  expect(res.status).toBe(1);
  expect(res.stderr).toContain("already exists — not archiving.");
  expect(existsSync(spec)).toBe(true);
});

test("theway init is an unknown command and exits 1", () => {
  const r = run(home(), "init", "src");
  expect(r.status).toBe(1);
  expect(r.stderr).toContain("error: unknown command 'init'");
});

test("list prints the active and archived changes of a project", () => {
  const dir = home();
  const spec = "# Spec Analysis: Alpha\n\n**Problem:** Alpha problem.\n";
  const changes = join(dir, "p", "changes");
  put(join(changes, "add-alpha", "spec.md"), spec);
  put(join(changes, "add-alpha", "tasks.md"), "- [x] 1. a\n- [x] 2. b\n- [ ] 3. c\n");
  put(join(changes, "update-beta", "spec.md"), spec);
  put(join(changes, "archive", "2026-01-10-add-gamma", "spec.md"), spec);
  const res = run(dir, "list", "p");
  expect(res.status).toBe(0);
  expect(res.stdout).toBe(
    "theway changes — p\n\nActive changes\n\n  add-alpha            2 files   2/3 tasks done\n  update-beta          1 files   0/0 tasks done\n\nArchived changes (1)\n\n  2026-01-10-add-gamma\n\nSummary: 2 active change(s), 1 archived.\n",
  );
});

test("validate-id reasons", () => {
  const cases: [string, string][] = [
    [
      seriesReason("add-user-auth-a"),
      "letter suffix (-a) is not allowed; series members end in a two-digit ordinal (-NN, e.g. -01)",
    ],
    [standaloneReason("Add-x"), "uppercase letters are not allowed; use lowercase kebab-case"],
    [standaloneReason("add-x-01"), "ends in an ordinal (-01) but is not a series member; drop it or pass --series"],
    [seriesReason("add-x-1"), "series member must end in a zero-padded two-digit ordinal (-NN, e.g. -01)"],
    [seriesReason("add-x-00"), "series ordinal must start at 01, not 00"],
    [seriesReason("add-x-01-02"), "double ordinal (-01-02); a series member carries exactly one -NN"],
    [seriesReason("add-x-001"), "series member must end in a zero-padded two-digit ordinal (-NN, e.g. -01)"],
    [standaloneReason("add_x"), "underscores are not allowed; use kebab-case (-)"],
    [standaloneReason("fix-x"), "must start with a verb prefix: add-, update-, refactor- or remove-"],
    [standaloneReason("add-x"), ""],
    [seriesReason("refactor-next-cleanup-01"), ""],
  ];
  for (const [actual, expected] of cases) expect(actual).toBe(expected);
});
