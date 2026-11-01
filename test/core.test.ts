import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { changeIdReason, projectReason } from "../src/core/path";
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
    [standaloneReason("fixes-x"), "must start with a verb prefix: add-, update-, refactor-, remove- or fix-"],
    [standaloneReason("add-x"), ""],
    [standaloneReason("fix-login-crash"), ""],
    [seriesReason("fix-login-crash-01"), ""],
    [seriesReason("refactor-next-cleanup-01"), ""],
  ];
  for (const [actual, expected] of cases) expect(actual).toBe(expected);
});

/** Runs the CLI with only HOME, PATH, XDG_CONFIG_HOME and the given THEWAY_HOME set. */
function runPath(root: string, opts: { env?: string; pointer?: string }, ...args: string[]) {
  const config = join(root, "config");
  if (opts.pointer !== undefined) put(join(config, "theway", "home"), `${opts.pointer}\n`);
  return spawnSync("node", [CLI, "path", ...args], {
    encoding: "utf-8",
    env: {
      HOME: join(root, "home"),
      PATH: process.env.PATH,
      XDG_CONFIG_HOME: config,
      ...(opts.env !== undefined ? { THEWAY_HOME: opts.env } : {}),
    },
  });
}

test("path resolves the home from env, then the pointer, then ~/.theway", () => {
  const root = home();
  const cases: [{ env?: string; pointer?: string }, string, string][] = [
    [{ env: "/env/home" }, "/env/home", "env"],
    [{ pointer: "/pointer/home" }, "/pointer/home", "pointer"],
    [{ env: "/same", pointer: "/same" }, "/same", "env"],
    [{}, join(root, "home", ".theway"), "default"],
  ];
  for (const [opts, expected, source] of cases) {
    rmSync(join(root, "config"), { recursive: true, force: true });
    const res = runPath(root, opts, "--verbose");
    expect(res.status).toBe(0);
    expect(res.stdout).toBe(`${expected}\n`);
    expect(res.stderr).toBe(`theway: home ${expected} (from ${source})\n`);
  }
});

test("path ignores an empty THEWAY_HOME and an empty pointer", () => {
  const root = home();
  const res = runPath(root, { env: "", pointer: "  " });
  expect(res.stdout).toBe(`${join(root, "home", ".theway")}\n`);
  expect(res.stderr).toBe("");
});

test("path warns when THEWAY_HOME and the pointer differ, naming both sources, and prints the env value", () => {
  const root = home();
  const res = runPath(root, { env: "/env/home", pointer: "/pointer/home" });
  expect(res.status).toBe(0);
  expect(res.stdout).toBe("/env/home\n");
  const lines = res.stderr.trimEnd().split("\n");
  expect(lines.length).toBe(1);
  expect(lines[0]).toContain("/env/home (from env)");
  expect(lines[0]).toContain("/pointer/home (from pointer)");
});

test("path prints the project and change folders on one stdout line", () => {
  const root = home();
  expect(runPath(root, { env: "/h" }, "proj").stdout).toBe("/h/proj\n");
  const res = runPath(root, { env: "/h" }, "proj", "add-x");
  expect(res.status).toBe(0);
  expect(res.stdout).toBe("/h/proj/changes/add-x\n");
  expect(res.stderr).toBe("");
  const verbose = runPath(root, { pointer: "/p" }, "proj", "add-x", "--verbose");
  expect(verbose.stdout).toBe("/p/proj/changes/add-x\n");
  expect(verbose.stderr).toBe("theway: home /p (from pointer)\n");
});

const CHANGE_ID_REASON = "must be lowercase letters and digits in words separated by single hyphens";
const PROJECT_REASON = 'must be letters, digits, ".", "_" or "-", not starting with "." or "-"';
const LONG_REASON = "must be at most 200 characters";

test("path exits 1 with one reason for an invalid project or change id", () => {
  const root = home();
  const long = "a".repeat(201);
  const cases: [string[], string][] = [
    [[""], "theway: invalid project '': must not be empty\n"],
    [["a/b"], `theway: invalid project 'a/b': ${PROJECT_REASON}\n`],
    [["."], `theway: invalid project '.': ${PROJECT_REASON}\n`],
    [[".."], `theway: invalid project '..': ${PROJECT_REASON}\n`],
    [[".hidden"], `theway: invalid project '.hidden': ${PROJECT_REASON}\n`],
    [["--", "-p"], `theway: invalid project '-p': ${PROJECT_REASON}\n`],
    [["a b"], `theway: invalid project 'a b': ${PROJECT_REASON}\n`],
    [["a\\b"], `theway: invalid project 'a\\b': ${PROJECT_REASON}\n`],
    [[long], `theway: invalid project '${long}': ${LONG_REASON}\n`],
    [["p", ""], "theway: invalid change id '': must not be empty\n"],
    [["p", "x/y"], `theway: invalid change id 'x/y': ${CHANGE_ID_REASON}\n`],
    [["p", "."], `theway: invalid change id '.': ${CHANGE_ID_REASON}\n`],
    [["p", ".."], `theway: invalid change id '..': ${CHANGE_ID_REASON}\n`],
    [["p", "Add-X"], `theway: invalid change id 'Add-X': ${CHANGE_ID_REASON}\n`],
    [["p", "add--x"], `theway: invalid change id 'add--x': ${CHANGE_ID_REASON}\n`],
    [["p", "--", "-add"], `theway: invalid change id '-add': ${CHANGE_ID_REASON}\n`],
    [["p", "add-"], `theway: invalid change id 'add-': ${CHANGE_ID_REASON}\n`],
    [["p", "add_x"], `theway: invalid change id 'add_x': ${CHANGE_ID_REASON}\n`],
    [["p", long], `theway: invalid change id '${long}': ${LONG_REASON}\n`],
  ];
  for (const [args, stderr] of cases) {
    const res = runPath(root, { env: "/h" }, ...args);
    expect(res.status).toBe(1);
    expect(res.stdout).toBe("");
    expect(res.stderr).toBe(stderr);
  }
});

test("path accepts allowlisted project and change id names", () => {
  const root = home();
  const res = runPath(root, { env: "/h" }, "My_Repo.v2", "add-x-01");
  expect(res.status).toBe(0);
  expect(res.stdout).toBe("/h/My_Repo.v2/changes/add-x-01\n");
  expect(res.stderr).toBe("");
});

test("changeIdReason and projectReason reject a NUL byte and accept allowlisted names", () => {
  expect(changeIdReason("a\u0000b")).toBe(CHANGE_ID_REASON);
  expect(projectReason("a\u0000b")).toBe(PROJECT_REASON);
  expect(changeIdReason("add-x-01")).toBe("");
  expect(projectReason("My_Repo.v2")).toBe("");
  expect(changeIdReason("a".repeat(200))).toBe("");
  expect(projectReason("a".repeat(200))).toBe("");
});

test("list reads the home the pointer names when THEWAY_HOME is unset", () => {
  const root = home();
  const data = join(root, "data");
  put(join(data, "p", "changes", "add-x", "tasks.md"), "- [x] 1. a\n");
  put(join(root, "config", "theway", "home"), `${data}\n`);
  const res = spawnSync("node", [CLI, "list", "p"], {
    encoding: "utf-8",
    env: { HOME: join(root, "home"), PATH: process.env.PATH, XDG_CONFIG_HOME: join(root, "config") },
  });
  expect(res.stdout).toContain("add-x                1 files   1/1 tasks done");
});

test("list and archive exit 1 with the path reason for an invalid project or change id", () => {
  const dir = home();
  const cases: [string[], string][] = [];
  for (const v of ["a/b", ".", ".."]) {
    cases.push([["list", v], `theway: invalid project '${v}': ${PROJECT_REASON}\n`]);
    cases.push([["archive", v, "add-x"], `theway: invalid project '${v}': ${PROJECT_REASON}\n`]);
    cases.push([["archive", "p", v], `theway: invalid change id '${v}': ${CHANGE_ID_REASON}\n`]);
  }
  for (const [args, stderr] of cases) {
    const res = run(dir, ...args);
    expect(res.status).toBe(1);
    expect(res.stdout).toBe("");
    expect(res.stderr).toBe(stderr);
  }
});

test("archive cannot move a folder outside the data home", () => {
  const root = home();
  const data = join(root, "home");
  mkdirSync(data, { recursive: true });
  const victim = join(root, "outside", "changes", "victim");
  mkdirSync(victim, { recursive: true });
  const res = run(data, "archive", "..", "victim");
  expect(res.status).toBe(1);
  expect(existsSync(victim)).toBe(true);
});

test("standards prints nothing and exits 0 for missing and empty folders", () => {
  const dir = home();
  for (const phase of ["engineering", "develop"]) {
    const res = run(dir, "standards", "p", phase);
    expect([res.status, res.stdout, res.stderr]).toEqual([0, "", ""]);
  }
  mkdirSync(join(dir, "standards"), { recursive: true });
  mkdirSync(join(dir, "p", "standards"), { recursive: true });
  for (const phase of ["engineering", "develop"]) {
    const res = run(dir, "standards", "p", phase);
    expect([res.status, res.stdout, res.stderr]).toEqual([0, "", ""]);
  }
});

test("standards prints global files before project files, each sorted, a project file replacing a global one", () => {
  const dir = home();
  const g = join(dir, "standards");
  const p = join(dir, "p", "standards");
  put(join(g, "zeta.md"), "# z\n");
  put(join(g, "alpha.md"), "# a\n");
  put(join(g, "tdd.md"), "# global tdd\n");
  put(join(g, "review.md"), "# global review\n");
  put(join(p, "tdd.md"), "# project tdd\n");
  put(join(p, "review.md"), "---\napplies_to: [develop]\n---\n# project review\n");
  put(join(p, "beta.md"), "# b\n");
  const eng = run(dir, "standards", "p", "engineering");
  expect(eng.status).toBe(0);
  expect(eng.stderr).toBe("");
  expect(eng.stdout).toBe(
    [join(g, "alpha.md"), join(g, "zeta.md"), join(p, "beta.md"), join(p, "tdd.md")].map((l) => `${l}\n`).join(""),
  );
  const dev = run(dir, "standards", "p", "develop");
  expect(dev.stdout).toBe(
    [join(g, "alpha.md"), join(g, "zeta.md"), join(p, "beta.md"), join(p, "review.md"), join(p, "tdd.md")]
      .map((l) => `${l}\n`)
      .join(""),
  );
  expect(run(dir, "standards", "other", "engineering").stdout).toBe(
    [join(g, "alpha.md"), join(g, "review.md"), join(g, "tdd.md"), join(g, "zeta.md")].map((l) => `${l}\n`).join(""),
  );
});

test("standards skips the files install ships into the global folder and their .default.md copies", () => {
  const dir = home();
  const g = join(dir, "standards");
  put(join(dir, ".shipped.json"), `${JSON.stringify({ "standards/sre.md": "x", "templates/spec-template.md": "y" })}\n`);
  put(join(g, "sre.md"), "# shipped\n");
  put(join(g, "sre.default.md"), "# shipped default\n");
  put(join(g, "develop.default.md"), "# another default copy\n");
  put(join(g, "tdd.md"), "# yours\n");
  for (const phase of ["engineering", "develop"]) {
    const res = run(dir, "standards", "p", phase);
    expect([res.status, res.stdout, res.stderr]).toEqual([0, `${join(g, "tdd.md")}\n`, ""]);
  }
  put(join(dir, "p", "standards", "sre.md"), "# project sre\n");
  expect(run(dir, "standards", "p", "develop").stdout).toBe(`${join(g, "tdd.md")}\n${join(dir, "p", "standards", "sre.md")}\n`);
});

test("standards applies applies_to: none, both, a flow list of one phase, a block list of one phase", () => {
  const dir = home();
  const p = join(dir, "p", "standards");
  put(join(p, "a-none.md"), "# no frontmatter\n");
  put(join(p, "b-both.md"), "---\napplies_to: [engineering, develop]\n---\n");
  put(join(p, "c-flow-eng.md"), "---\ntitle: x\napplies_to: [engineering]\n---\n");
  put(join(p, "d-block-dev.md"), "---\napplies_to:\n  - develop\nother: y\n---\n");
  put(join(p, "e-nokey.md"), "---\ntitle: x\n---\n");
  const lines = (...names: string[]) => names.map((n) => `${join(p, n)}\n`).join("");
  const eng = run(dir, "standards", "p", "engineering");
  expect([eng.status, eng.stderr]).toEqual([0, ""]);
  expect(eng.stdout).toBe(lines("a-none.md", "b-both.md", "c-flow-eng.md", "e-nokey.md"));
  const dev = run(dir, "standards", "p", "develop");
  expect([dev.status, dev.stderr]).toEqual([0, ""]);
  expect(dev.stdout).toBe(lines("a-none.md", "b-both.md", "d-block-dev.md", "e-nokey.md"));
});

test("standards applies an invalid applies_to to both phases with a warning", () => {
  const dir = home();
  const file = join(dir, "p", "standards", "x.md");
  put(file, "---\napplies_to: [review]\n---\n");
  for (const phase of ["engineering", "develop"]) {
    const res = run(dir, "standards", "p", phase);
    expect(res.status).toBe(0);
    expect(res.stdout).toBe(`${file}\n`);
    expect(res.stderr).toBe(
      `theway: warning: ${file}: applies_to must list engineering and/or develop; applied to both\n`,
    );
  }
});

test.skipIf(process.getuid?.() === 0)("standards skips an unreadable file with a warning and lists the others", () => {
  const dir = home();
  const p = join(dir, "p", "standards");
  put(join(p, "a.md"), "x\n");
  put(join(p, "b.md"), "x\n");
  put(join(p, "c.md"), "x\n");
  chmodSync(join(p, "b.md"), 0o000);
  for (const phase of ["engineering", "develop"]) {
    const res = run(dir, "standards", "p", phase);
    expect(res.status).toBe(0);
    expect(res.stdout).toBe(`${join(p, "a.md")}\n${join(p, "c.md")}\n`);
    expect(res.stderr).toBe(`theway: warning: ${join(p, "b.md")}: cannot be read; skipped\n`);
  }
});

test("standards ignores subfolders and non-.md files", () => {
  const dir = home();
  put(join(dir, "standards", "notes.txt"), "x\n");
  put(join(dir, "standards", "sub", "nested.md"), "x\n");
  mkdirSync(join(dir, "standards", "dir.md"), { recursive: true });
  put(join(dir, "p", "standards", "sub", "nested.md"), "x\n");
  put(join(dir, "p", "standards", "keep.md"), "x\n");
  const res = run(dir, "standards", "p", "develop");
  expect([res.status, res.stdout, res.stderr]).toEqual([0, `${join(dir, "p", "standards", "keep.md")}\n`, ""]);
});

test("standards exits 1 for an invalid project, a shared folder or an invalid phase", () => {
  const dir = home();
  put(join(dir, "standards", "g.md"), "x\n");
  const cases: [string[], string][] = [
    [["a/b", "develop"], `theway: invalid project 'a/b': ${PROJECT_REASON}\n`],
    [["..", "develop"], `theway: invalid project '..': ${PROJECT_REASON}\n`],
    [["", "develop"], "theway: invalid project '': must not be empty\n"],
    [
      ["data", "develop"],
      "theway: project 'data' shares its folder with theway's own files; no user standards are read for it\n",
    ],
    [
      ["templates", "engineering"],
      "theway: project 'templates' shares its folder with theway's own files; no user standards are read for it\n",
    ],
    [
      ["standards", "develop"],
      "theway: project 'standards' shares its folder with theway's own files; no user standards are read for it\n",
    ],
    [["p", "review"], "theway: invalid phase 'review': must be engineering or develop\n"],
  ];
  for (const [args, stderr] of cases) {
    const res = run(dir, "standards", ...args);
    expect(res.status).toBe(1);
    expect(res.stdout).toBe("");
    expect(res.stderr).toBe(stderr);
  }
});
