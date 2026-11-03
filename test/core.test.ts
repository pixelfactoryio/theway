import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

test("standards prints global files before project files, each sorted, a project file replacing a global one for its phases", () => {
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
    [join(g, "alpha.md"), join(g, "review.md"), join(g, "zeta.md"), join(p, "beta.md"), join(p, "tdd.md")]
      .map((l) => `${l}\n`)
      .join(""),
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
  expect(run(dir, "standards", "p", "develop").stdout).toBe(`${join(g, "tdd.md")}\n`);
  put(join(dir, "p", "config.yaml"), "standards:\n  sre:\n    enabled: true\n");
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
  const doc = run(dir, "standards", "p", "document");
  expect([doc.status, doc.stderr]).toEqual([0, ""]);
  expect(doc.stdout).toBe(lines("a-none.md", "e-nokey.md"));
});

test("standards applies applies_to: [document] to document only", () => {
  const dir = home();
  const file = join(dir, "p", "standards", "docs.md");
  put(file, "---\napplies_to: [document]\n---\n");
  for (const [phase, stdout] of [
    ["engineering", ""],
    ["develop", ""],
    ["document", `${file}\n`],
  ] as const) {
    const res = run(dir, "standards", "p", phase);
    expect([phase, res.status, res.stdout, res.stderr]).toEqual([phase, 0, stdout, ""]);
  }
});

test("standards lists a file with an invalid applies_to for no phase, with a warning", () => {
  const dir = home();
  const file = join(dir, "p", "standards", "x.md");
  put(file, "---\napplies_to: [review]\n---\n");
  for (const phase of ["engineering", "develop", "document"]) {
    const res = run(dir, "standards", "p", phase);
    expect(res.status).toBe(0);
    expect(res.stdout).toBe("");
    expect(res.stderr).toBe(`theway: warning: ${file}: applies_to must list engineering, develop and/or document; skipped\n`);
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

test("standards exits 1 for an invalid project or an invalid phase", () => {
  const dir = home();
  put(join(dir, "standards", "g.md"), "x\n");
  const cases: [string[], string][] = [
    [["a/b", "develop"], `theway: invalid project 'a/b': ${PROJECT_REASON}\n`],
    [["..", "develop"], `theway: invalid project '..': ${PROJECT_REASON}\n`],
    [["", "develop"], "theway: invalid project '': must not be empty\n"],
    [["p", "review"], "theway: invalid phase 'review': must be engineering, develop or document\n"],
  ];
  for (const [args, stderr] of cases) {
    const res = run(dir, "standards", ...args);
    expect(res.status).toBe(1);
    expect(res.stdout).toBe("");
    expect(res.stderr).toBe(stderr);
  }
});

test("standards lists only the global standards for the projects data, templates and standards", () => {
  const dir = home();
  const g = join(dir, "standards");
  put(join(g, "g.md"), "x\n");
  put(join(g, "sre.md"), "# sre\n");
  put(join(dir, "config.yaml"), "standards:\n  sre:\n    enabled: true\n");
  for (const project of ["data", "templates", "standards"]) {
    put(join(dir, project, "standards", "own.md"), "x\n");
    const eng = run(dir, "standards", project, "engineering");
    expect([eng.status, eng.stdout, eng.stderr]).toEqual([0, `${join(g, "g.md")}\n${join(g, "sre.md")}\n`, ""]);
    const doc = run(dir, "standards", project, "document");
    expect([doc.status, doc.stdout, doc.stderr]).toEqual([0, `${join(g, "g.md")}\n${join(g, "sre.md")}\n`, ""]);
  }
});

test("standards lists the enabled opt-in and user standards per phase, from the global and the project config", () => {
  const dir = home();
  const g = join(dir, "standards");
  const p = join(dir, "p", "standards");
  for (const name of ["interaction.md", "develop.md", "tamm-framework.md", "core-principles.md", "sre.md", "quality.md"]) {
    put(join(g, name), "---\napplies_to: [develop]\n---\n");
  }
  put(join(g, "alpha.md"), "---\napplies_to: [engineering]\n---\n");
  put(join(g, "dev.md"), "---\napplies_to: [develop]\n---\n");
  put(join(g, "off.md"), "x\n");
  put(join(p, "beta.md"), "x\n");
  put(join(p, "gamma.md"), "x\n");
  put(
    join(dir, "config.yaml"),
    "standards:\n  core_principles:\n    enabled: true\n  web_development:\n    enabled: true\n  quality:\n    enabled: true\n  off:\n    enabled: false\n",
  );
  put(join(dir, "p", "config.yaml"), "standards:\n  quality:\n    enabled: false\n  sre:\n    enabled: true\n  gamma:\n    enabled: false\n");
  const lines = (...paths: string[]) => paths.map((l) => `${l}\n`).join("");
  const cases: [string, string, string][] = [
    ["p", "engineering", lines(join(g, "alpha.md"), join(p, "beta.md"))],
    ["p", "develop", lines(join(g, "core-principles.md"), join(g, "dev.md"), join(g, "sre.md"), join(p, "beta.md"))],
    ["p", "document", lines(join(p, "beta.md"))],
    ["other", "engineering", lines(join(g, "alpha.md"))],
    ["other", "develop", lines(join(g, "core-principles.md"), join(g, "dev.md"), join(g, "quality.md"))],
    ["other", "document", ""],
  ];
  for (const [project, phase, stdout] of cases) {
    const res = run(dir, "standards", project, phase);
    expect([project, phase, res.status, res.stdout, res.stderr]).toEqual([project, phase, 0, stdout, ""]);
  }
});

test("standards takes a project sre.md as a user standard that the sre switch turns on, replacing the global one for its phases", () => {
  const dir = home();
  put(join(dir, "config.yaml"), readFileSync(join(import.meta.dirname, "..", "plugin", "home", "config.yaml"), "utf-8"));
  put(join(dir, "standards", "sre.md"), "# global sre\n");
  const own = join(dir, "p", "standards", "sre.md");
  put(own, "---\napplies_to: [develop]\n---\n");
  for (const phase of ["engineering", "develop", "document"]) {
    expect(run(dir, "standards", "p", phase).stdout).toBe("");
  }
  put(join(dir, "p", "config.yaml"), "standards:\n  sre:\n    enabled: true\n");
  expect(run(dir, "standards", "p", "develop").stdout).toBe(`${own}\n`);
  expect(run(dir, "standards", "p", "engineering").stdout).toBe(`${join(dir, "standards", "sre.md")}\n`);
  expect(run(dir, "standards", "p", "document").stdout).toBe(`${join(dir, "standards", "sre.md")}\n`);
  expect(run(dir, "standards", "other", "document").stdout).toBe("");
});

test("a project sre.md shadowing the global opt-in sre.md stays off with an empty config.yaml until the switch is on", () => {
  const dir = home();
  const global = join(dir, "standards", "sre.md");
  const own = join(dir, "p", "standards", "sre.md");
  put(join(dir, "config.yaml"), "");
  put(global, "# global sre\n");
  put(own, "---\napplies_to: [develop]\n---\n# project sre\n");
  for (const phase of ["engineering", "develop", "document"]) {
    const res = run(dir, "standards", "p", phase);
    expect([phase, res.status, res.stdout, res.stderr]).toEqual([phase, 0, "", ""]);
  }
  const off = run(dir, "config", "p");
  expect([off.status, off.stdout, off.stderr]).toEqual([0, effective(), ""]);
  put(join(dir, "p", "config.yaml"), "standards:\n  sre:\n    enabled: true\n");
  for (const [phase, stdout] of [
    ["engineering", `${global}\n`],
    ["develop", `${own}\n`],
    ["document", `${global}\n`],
  ] as const) {
    const res = run(dir, "standards", "p", phase);
    expect([phase, res.status, res.stdout, res.stderr]).toEqual([phase, 0, stdout, ""]);
  }
});

test("standards applies the defaults with no config.yaml: opt-in off, user on", () => {
  const dir = home();
  const g = join(dir, "standards");
  put(join(g, "sre.md"), "x\n");
  put(join(g, "tdd.md"), "x\n");
  for (const [phase, stdout] of [
    ["engineering", `${join(g, "tdd.md")}\n`],
    ["develop", `${join(g, "tdd.md")}\n`],
    ["document", `${join(g, "tdd.md")}\n`],
  ] as const) {
    const res = run(dir, "standards", "p", phase);
    expect([res.status, res.stdout, res.stderr]).toEqual([0, stdout, ""]);
  }
});

test("standards lists the enabled opt-in standards without frontmatter for every phase", () => {
  const dir = home();
  const g = join(dir, "standards");
  const names = ["core-principles.md", "quality.md", "sre.md", "web-development.md"];
  for (const name of names) put(join(g, name), `# ${name}\n`);
  put(
    join(dir, "config.yaml"),
    "standards:\n  core_principles:\n    enabled: true\n  sre:\n    enabled: true\n  web_development:\n    enabled: true\n  quality:\n    enabled: true\n",
  );
  const all = names.map((n) => `${join(g, n)}\n`).join("");
  for (const phase of ["engineering", "develop", "document"]) {
    const res = run(dir, "standards", "p", phase);
    expect([phase, res.status, res.stdout, res.stderr]).toEqual([phase, 0, all, ""]);
  }
});

test("standards lists an opt-in standard with applies_to: [develop] for develop only", () => {
  const dir = home();
  const sre = join(dir, "standards", "sre.md");
  put(sre, "---\napplies_to: [develop]\n---\n# sre\n");
  put(join(dir, "config.yaml"), "standards:\n  sre:\n    enabled: true\n");
  for (const [phase, stdout] of [
    ["engineering", ""],
    ["develop", `${sre}\n`],
    ["document", ""],
  ] as const) {
    const res = run(dir, "standards", "p", phase);
    expect([phase, res.status, res.stdout, res.stderr]).toEqual([phase, 0, stdout, ""]);
  }
});

test("standards replaces an enabled global sre.md by a project sre.md with applies_to: [develop] for develop only", () => {
  const dir = home();
  const global = join(dir, "standards", "sre.md");
  const own = join(dir, "p", "standards", "sre.md");
  put(global, "# global sre\n");
  put(own, "---\napplies_to: [develop]\n---\n# project sre\n");
  put(join(dir, "config.yaml"), "standards:\n  sre:\n    enabled: true\n");
  for (const [phase, stdout] of [
    ["engineering", `${global}\n`],
    ["develop", `${own}\n`],
    ["document", `${global}\n`],
  ] as const) {
    const res = run(dir, "standards", "p", phase);
    expect([phase, res.status, res.stdout, res.stderr]).toEqual([phase, 0, stdout, ""]);
  }
});

test("standards exits 1 with config's message for invalid YAML in either config", () => {
  const dir = home();
  put(join(dir, "standards", "tdd.md"), "x\n");
  put(join(dir, "p", "config.yaml"), "engineering:\n  review_rounds: 1\n  review_rounds: 2\n");
  const res = run(dir, "standards", "p", "engineering");
  expect([res.status, res.stdout, res.stderr]).toEqual([
    1,
    "",
    "theway: p/config.yaml: invalid YAML: Map keys must be unique at line 3, column 3\n",
  ]);
  put(join(dir, "config.yaml"), "a: [1\n");
  const bad = run(dir, "standards", "other", "develop");
  expect([bad.status, bad.stdout, bad.stderr]).toEqual([
    1,
    "",
    "theway: config.yaml: invalid YAML: Flow sequence in block collection must be sufficiently indented and end with a ] at line 2, column 1\n",
  ]);
});

/** The effective config `theway config` prints, from the defaults with `over` replacing leaves. */
function effective(over: Record<string, string> = {}, user: [string, boolean][] = []): string {
  const v = (key: string, d: string): string => over[key] ?? d;
  return [
    "standards:",
    "  core_principles:",
    `    enabled: ${v("standards.core_principles.enabled", "false")}`,
    "  sre:",
    `    enabled: ${v("standards.sre.enabled", "false")}`,
    "  web_development:",
    `    enabled: ${v("standards.web_development.enabled", "false")}`,
    "  quality:",
    `    enabled: ${v("standards.quality.enabled", "false")}`,
    ...user.flatMap(([key, on]) => [`  ${key}:`, `    enabled: ${on}`]),
    "engineering:",
    "  review:",
    `    rounds: ${v("engineering.review.rounds", "1")}`,
    `    model: ${v("engineering.review.model", "opus")}`,
    "workflow:",
    "  defaults:",
    "    implement:",
    `      model: ${v("workflow.defaults.implement.model", "opus")}`,
    "    review:",
    `      rounds: ${v("workflow.defaults.review.rounds", "1")}`,
    "      lenses:",
    ...v("workflow.defaults.review.lenses", "conformance,correctness")
      .split(",")
      .map((lens) => `        - ${lens}`),
    `      model: ${v("workflow.defaults.review.model", "opus")}`,
    `      fix_model: ${v("workflow.defaults.review.fix_model", "opus")}`,
    "    pr:",
    `      ci_attempts: ${v("workflow.defaults.pr.ci_attempts", "2")}`,
    `      model: ${v("workflow.defaults.pr.model", "sonnet")}`,
    `      fix_model: ${v("workflow.defaults.pr.fix_model", "opus")}`,
    "    agent:",
    `      model: ${v("workflow.defaults.agent.model", "sonnet")}`,
    "",
  ].join("\n");
}

test("config prints the global values, defaults for the keys it lacks, every key in schema order", () => {
  const dir = home();
  put(
    join(dir, "config.yaml"),
    "# c\nworkflow:\n  defaults:\n    pr:\n      model: opus\n    review:\n      lenses: [security, correctness]\nstandards:\n  sre:\n    enabled: true\nengineering:\n  review:\n    rounds: 0\n",
  );
  const res = run(dir, "config", "p");
  expect([res.status, res.stderr]).toEqual([0, ""]);
  expect(res.stdout).toBe(
    effective({
      "workflow.defaults.pr.model": "opus",
      "workflow.defaults.review.lenses": "security,correctness",
      "standards.sre.enabled": "true",
      "engineering.review.rounds": "0",
    }),
  );
});

test("config lets a project file override keys of every section, nested models included", () => {
  const dir = home();
  put(
    join(dir, "config.yaml"),
    "engineering:\n  review:\n    rounds: 3\n    model: sonnet\nworkflow:\n  defaults:\n    pr:\n      ci_attempts: 5\n    review:\n      lenses: [conformance]\n",
  );
  put(
    join(dir, "p", "config.yaml"),
    "standards:\n  quality:\n    enabled: true\nengineering:\n  review:\n    model: opus\nworkflow:\n  defaults:\n    pr:\n      ci_attempts: 1\n    implement:\n      model: sonnet\n",
  );
  const res = run(dir, "config", "p");
  expect([res.status, res.stderr]).toEqual([0, ""]);
  expect(res.stdout).toBe(
    effective({
      "standards.quality.enabled": "true",
      "engineering.review.rounds": "3",
      "engineering.review.model": "opus",
      "workflow.defaults.pr.ci_attempts": "1",
      "workflow.defaults.implement.model": "sonnet",
      "workflow.defaults.review.lenses": "conformance",
    }),
  );
  expect(run(dir, "config", "other").stdout).toBe(
    effective({
      "engineering.review.rounds": "3",
      "engineering.review.model": "sonnet",
      "workflow.defaults.pr.ci_attempts": "5",
      "workflow.defaults.review.lenses": "conformance",
    }),
  );
});

test("config falls back from an invalid project value to the global one, and from an invalid global value to the default", () => {
  const dir = home();
  put(
    join(dir, "config.yaml"),
    "engineering:\n  review:\n    rounds: -1\nworkflow:\n  defaults:\n    pr:\n      ci_attempts: 4\n    review:\n      rounds: 3\n      model: gpt\n",
  );
  put(
    join(dir, "p", "config.yaml"),
    "workflow:\n  defaults:\n    pr:\n      ci_attempts: 0\n    review:\n      rounds: [1]\n      lenses: []\nstandards:\n  sre:\n    enabled: yes\n",
  );
  const res = run(dir, "config", "p");
  expect(res.status).toBe(0);
  expect(res.stdout).toBe(effective({ "workflow.defaults.pr.ci_attempts": "4", "workflow.defaults.review.rounds": "3" }));
  expect(res.stderr).toBe(
    [
      "theway: warning: config.yaml: engineering.review.rounds must be a non-negative integer; ignored",
      "theway: warning: config.yaml: workflow.defaults.review.model must be opus, sonnet or haiku; ignored",
      "theway: warning: p/config.yaml: workflow.defaults.pr.ci_attempts must be a positive integer; ignored",
      "theway: warning: p/config.yaml: workflow.defaults.review.rounds must be a positive integer; ignored",
      "theway: warning: p/config.yaml: workflow.defaults.review.lenses must be a non-empty list of names without duplicates; ignored",
      "theway: warning: p/config.yaml: standards.sre.enabled must be true or false; ignored",
      "",
    ].join("\n"),
  );
});

test("config warns about the removed workflow keys as unknown keys and keeps the defaults", () => {
  const dir = home();
  put(
    join(dir, "config.yaml"),
    "workflow:\n  review_rounds: 2\n  ci_attempts: 3\n  open_pr: false\n  models:\n    implementer: sonnet\n  defaults:\n    review:\n      lenses: [a, a]\n      extra: 1\n    deploy:\n      model: opus\n",
  );
  const res = run(dir, "config", "p");
  expect([res.status, res.stdout]).toEqual([0, effective()]);
  expect(res.stderr).toBe(
    [
      "theway: warning: config.yaml: unknown key workflow.review_rounds; ignored",
      "theway: warning: config.yaml: unknown key workflow.ci_attempts; ignored",
      "theway: warning: config.yaml: unknown key workflow.open_pr; ignored",
      "theway: warning: config.yaml: unknown key workflow.models; ignored",
      "theway: warning: config.yaml: workflow.defaults.review.lenses must be a non-empty list of names without duplicates; ignored",
      "theway: warning: config.yaml: unknown key workflow.defaults.review.extra; ignored",
      "theway: warning: config.yaml: unknown key workflow.defaults.deploy; ignored",
      "",
    ].join("\n"),
  );
});

test("config warns about the removed engineering keys as unknown keys and keeps the defaults", () => {
  const dir = home();
  put(join(dir, "config.yaml"), "engineering:\n  review_rounds: 2\n");
  put(join(dir, "p", "config.yaml"), "engineering:\n  models:\n    critic: sonnet\n");
  const res = run(dir, "config", "p");
  expect([res.status, res.stdout]).toEqual([0, effective()]);
  expect(res.stderr).toBe(
    [
      "theway: warning: config.yaml: unknown key engineering.review_rounds; ignored",
      "theway: warning: p/config.yaml: unknown key engineering.models; ignored",
      "",
    ].join("\n"),
  );
});

test("config accepts haiku as a model with no warning", () => {
  const dir = home();
  put(join(dir, "config.yaml"), "engineering:\n  review:\n    model: haiku\nworkflow:\n  defaults:\n    agent:\n      model: haiku\n");
  const res = run(dir, "config", "p");
  expect([res.status, res.stderr]).toEqual([0, ""]);
  expect(res.stdout).toBe(effective({ "engineering.review.model": "haiku", "workflow.defaults.agent.model": "haiku" }));
});

test("config ignores an unknown key once at its highest level, a section that is not a map, and a root that is not a map", () => {
  const dir = home();
  put(join(dir, "config.yaml"), "changes:\n  a: 1\n  b: 2\nengineering:\n  extra: 1\n  review: opus\n");
  put(join(dir, "p", "config.yaml"), "- workflow\n");
  const res = run(dir, "config", "p");
  expect(res.status).toBe(0);
  expect(res.stdout).toBe(effective());
  expect(res.stderr).toBe(
    [
      "theway: warning: config.yaml: unknown key changes; ignored",
      "theway: warning: config.yaml: unknown key engineering.extra; ignored",
      "theway: warning: config.yaml: engineering.review must be a map; ignored",
      "theway: warning: p/config.yaml: not a map; ignored",
      "",
    ].join("\n"),
  );
});

test("config takes an empty or comment-only file as contributing nothing", () => {
  for (const [global, project] of [
    ["", "# only a comment\n"],
    ["# only a comment\n", ""],
  ]) {
    const dir = home();
    put(join(dir, "config.yaml"), global as string);
    put(join(dir, "p", "config.yaml"), project as string);
    const res = run(dir, "config", "p");
    expect([res.status, res.stdout, res.stderr]).toEqual([0, effective(), ""]);
  }
});

test("config exits 1 with nothing on stdout for an invalid project, a missing global file or invalid YAML", () => {
  const missing = home();
  const cases: [string, string, string][] = [
    [missing, "../x", `theway: invalid project '../x': must be letters, digits, ".", "_" or "-", not starting with "." or "-"\n`],
    [missing, "p", `theway: config.yaml not found in ${missing}; run npx --yes @pixelfactoryio/theway@latest install, then /reload-plugins\n`],
  ];
  const badGlobal = home();
  put(join(badGlobal, "config.yaml"), "a: [1\n");
  put(join(badGlobal, "p", "config.yaml"), "engineering:\n  review:\n    rounds: 2\n");
  cases.push([
    badGlobal,
    "p",
    "theway: config.yaml: invalid YAML: Flow sequence in block collection must be sufficiently indented and end with a ] at line 2, column 1\n",
  ]);
  const badProject = home();
  put(join(badProject, "config.yaml"), "engineering:\n  review:\n    rounds: 2\n");
  put(join(badProject, "p", "config.yaml"), "engineering:\n  review_rounds: 1\n  review_rounds: 2\n");
  cases.push([
    badProject,
    "p",
    "theway: p/config.yaml: invalid YAML: Map keys must be unique at line 3, column 3\n",
  ]);
  for (const [dir, project, stderr] of cases) {
    const res = run(dir, "config", project);
    expect([res.status, res.stdout, res.stderr]).toEqual([1, "", stderr]);
  }
});

test.skipIf(process.getuid?.() === 0)("config exits 1 with nothing on stdout for a project file that cannot be read", () => {
  const dir = home();
  put(join(dir, "config.yaml"), "engineering:\n  review:\n    rounds: 2\n");
  put(join(dir, "p", "config.yaml"), "engineering:\n  review:\n    rounds: 3\n");
  chmodSync(join(dir, "p", "config.yaml"), 0o000);
  const res = run(dir, "config", "p");
  expect([res.status, res.stdout, res.stderr]).toEqual([1, "", "theway: p/config.yaml: cannot be read\n"]);
});

test("config prints only its own warning for a value yaml warns about", () => {
  const dir = home();
  put(join(dir, "config.yaml"), "standards:\n  sre:\n    enabled: !foo false\n");
  const res = run(dir, "config", "p");
  expect([res.status, res.stdout, res.stderr]).toEqual([
    0,
    effective(),
    "theway: warning: config.yaml: standards.sre.enabled must be true or false; ignored\n",
  ]);
});

test("config rejects a non-integer number for an integer key", () => {
  const dir = home();
  put(join(dir, "config.yaml"), "engineering:\n  review:\n    rounds: 1.5\nworkflow:\n  defaults:\n    pr:\n      ci_attempts: 2.5\n");
  const res = run(dir, "config", "p");
  expect(res.status).toBe(0);
  expect(res.stdout).toBe(effective());
  expect(res.stderr).toBe(
    [
      "theway: warning: config.yaml: engineering.review.rounds must be a non-negative integer; ignored",
      "theway: warning: config.yaml: workflow.defaults.pr.ci_attempts must be a positive integer; ignored",
      "",
    ].join("\n"),
  );
});

test("config lists every switchable standard after the opt-in keys, with its effective value and its warnings", () => {
  const dir = home();
  const g = join(dir, "standards");
  put(join(dir, ".shipped.json"), `${JSON.stringify({ "standards/shipped.md": "x" })}\n`);
  for (const name of ["interaction.md", "develop.md", "tamm-framework.md", "sre.md", "shipped.md", "tdd.default.md"]) {
    put(join(g, name), "x\n");
  }
  for (const name of ["zeta.md", "alpha.md", "tdd.md", "a-b.md", "a_b.md"]) put(join(g, name), "x\n");
  put(join(g, "bad.md"), "---\napplies_to: [review]\n---\n");
  put(join(dir, "p", "standards", "beta.md"), "x\n");
  put(
    join(dir, "config.yaml"),
    "standards:\n  zeta:\n    enabled: false\n  nofile:\n    enabled: true\n  develop:\n    enabled: true\n",
  );
  put(
    join(dir, "p", "config.yaml"),
    "standards:\n  tdd:\n    enabled: false\n  sre:\n    enabled: true\n  interaction:\n    enabled: false\n  missing:\n    enabled: false\n",
  );
  const res = run(dir, "config", "p");
  expect(res.status).toBe(0);
  expect(res.stdout).toBe(
    effective({ "standards.sre.enabled": "true" }, [
      ["a_b", true],
      ["alpha", true],
      ["bad", true],
      ["beta", true],
      ["tdd", false],
      ["zeta", false],
    ]),
  );
  expect(res.stderr).toBe(
    [
      "theway: warning: config.yaml: standards.nofile has no standard file; ignored",
      "theway: warning: config.yaml: standards.develop cannot be switched; ignored",
      "theway: warning: p/config.yaml: standards.interaction cannot be switched; ignored",
      "theway: warning: p/config.yaml: standards.missing has no standard file; ignored",
      "",
    ].join("\n"),
  );
  const other = run(dir, "config", "other");
  expect(other.status).toBe(0);
  expect(other.stdout).toBe(
    effective({}, [
      ["a_b", true],
      ["alpha", true],
      ["bad", true],
      ["tdd", true],
      ["zeta", false],
    ]),
  );
});

test("config lists no project standards for the projects data, templates and standards", () => {
  const dir = home();
  put(join(dir, "standards", "g.md"), "x\n");
  put(join(dir, "config.yaml"), "");
  for (const project of ["data", "templates", "standards"]) {
    put(join(dir, project, "standards", "own.md"), "x\n");
    put(join(dir, project, "config.yaml"), "standards:\n  g:\n    enabled: false\n  own:\n    enabled: true\n");
    const res = run(dir, "config", project);
    expect(res.status).toBe(0);
    expect(res.stdout).toBe(effective({}, [["g", false]]));
    expect(res.stderr).toBe(`theway: warning: ${join(project, "config.yaml")}: standards.own has no standard file; ignored\n`);
  }
});

test("a project file with a core name is a user standard that the project config switches", () => {
  const dir = home();
  const g = join(dir, "standards");
  for (const name of ["interaction.md", "develop.md", "tamm-framework.md"]) put(join(g, name), "x\n");
  const own = join(dir, "p", "standards", "develop.md");
  put(own, "---\napplies_to: [develop]\n---\n");
  put(join(dir, "config.yaml"), "");
  const on = run(dir, "config", "p");
  expect([on.status, on.stdout, on.stderr]).toEqual([0, effective({}, [["develop", true]]), ""]);
  expect(run(dir, "standards", "p", "develop").stdout).toBe(`${own}\n`);
  put(join(dir, "p", "config.yaml"), "standards:\n  develop:\n    enabled: false\n");
  const off = run(dir, "config", "p");
  expect([off.status, off.stdout, off.stderr]).toEqual([0, effective({}, [["develop", false]]), ""]);
  const res = run(dir, "standards", "p", "develop");
  expect([res.status, res.stdout, res.stderr]).toEqual([0, "", ""]);
  put(join(dir, "q", "config.yaml"), "standards:\n  develop:\n    enabled: false\n");
  const other = run(dir, "config", "q");
  expect([other.status, other.stdout, other.stderr]).toEqual([
    0,
    effective(),
    "theway: warning: q/config.yaml: standards.develop cannot be switched; ignored\n",
  ]);
});

test("standards does not list the global spec-review.md and spec-investigation.md, which .shipped.json does not list", () => {
  const dir = home();
  const g = join(dir, "standards");
  put(join(dir, ".shipped.json"), "{}\n");
  for (const name of ["spec-review.md", "spec-investigation.md", "own.md"]) put(join(g, name), "x\n");
  put(join(dir, "config.yaml"), "");
  const res = run(dir, "standards", "p", "engineering");
  expect([res.status, res.stdout, res.stderr]).toEqual([0, `${join(g, "own.md")}\n`, ""]);
});

test("standards named like Object.prototype keys are listed and switched like any other", () => {
  const dir = home();
  const g = join(dir, "standards");
  const names = ["__proto__.md", "constructor.md", "toString.md"];
  for (const name of names) put(join(g, name), "x\n");
  put(join(dir, "config.yaml"), "");
  const on = run(dir, "config", "p");
  expect([on.status, on.stdout, on.stderr]).toEqual([
    0,
    effective({}, [
      ["__proto__", true],
      ["constructor", true],
      ["toString", true],
    ]),
    "",
  ]);
  const all = run(dir, "standards", "p", "engineering");
  expect([all.status, all.stdout, all.stderr]).toEqual([0, names.map((n) => `${join(g, n)}\n`).join(""), ""]);
  put(join(dir, "config.yaml"), "standards:\n  __proto__:\n    enabled: false\n");
  const off = run(dir, "config", "p");
  expect([off.status, off.stdout, off.stderr]).toEqual([
    0,
    effective({}, [
      ["__proto__", false],
      ["constructor", true],
      ["toString", true],
    ]),
    "",
  ]);
  const res = run(dir, "standards", "p", "engineering");
  expect([res.status, res.stdout, res.stderr]).toEqual([0, `${join(g, "constructor.md")}\n${join(g, "toString.md")}\n`, ""]);
});

test("a user standard sharing an opt-in key defaults to false with it", () => {
  const dir = home();
  const g = join(dir, "standards");
  put(join(g, "web-development.md"), "x\n");
  const own = join(g, "web_development.md");
  put(own, "x\n");
  put(join(dir, "config.yaml"), "");
  const res = run(dir, "config", "p");
  expect([res.status, res.stdout, res.stderr]).toEqual([0, effective(), ""]);
  expect(run(dir, "standards", "p", "engineering").stdout).toBe("");
  put(join(dir, "config.yaml"), "standards:\n  web_development:\n    enabled: true\n");
  expect(run(dir, "standards", "p", "engineering").stdout).toBe(`${join(g, "web-development.md")}\n${own}\n`);
});

test("context prints home, change_dir, standards and config in that order, matching path, standards and config", () => {
  const dir = home();
  put(join(dir, "config.yaml"), "engineering:\n  review:\n    rounds: 3\n");
  put(join(dir, "standards", "tdd.md"), "# tdd\n");
  const res = run(dir, "context", "p", "develop", "add-x");
  expect(res.status).toBe(0);
  const doc = Bun.YAML.parse(res.stdout) as Record<string, unknown>;
  expect(Object.keys(doc)).toEqual(["home", "change_dir", "standards", "config"]);
  expect(doc.home).toBe(run(dir, "path").stdout.trim());
  expect(doc.change_dir).toBe(run(dir, "path", "p", "add-x").stdout.trim());
  expect(doc.standards).toEqual(run(dir, "standards", "p", "develop").stdout.split("\n").filter((l) => l !== ""));
  expect(doc.standards).toEqual([join(dir, "standards", "tdd.md")]);
  expect(doc.config).toEqual(Bun.YAML.parse(run(dir, "config", "p").stdout));
});

test("context has no change_dir without a change id and prints standards: [] when none apply", () => {
  const dir = home();
  put(join(dir, "config.yaml"), "");
  put(join(dir, "standards", "tdd.md"), "---\napplies_to: [develop]\n---\n# tdd\n");
  const res = run(dir, "context", "p", "document");
  expect(res.status).toBe(0);
  expect(res.stdout).toStartWith(`home: ${dir}\nstandards: []\nconfig:\n`);
  expect(Object.keys(Bun.YAML.parse(res.stdout) as object)).toEqual(["home", "standards", "config"]);
});

test("context writes config's warnings once and exits 1 on the missing config, an invalid project, phase or change id", () => {
  const dir = home();
  const missing = run(dir, "context", "p", "engineering");
  expect(missing.status).toBe(1);
  expect(missing.stdout).toBe("");
  expect(missing.stderr).toBe(
    `theway: config.yaml not found in ${dir}; run npx --yes @pixelfactoryio/theway@latest install, then /reload-plugins\n`,
  );
  put(join(dir, "config.yaml"), "bogus: 1\n");
  const warned = run(dir, "context", "p", "engineering");
  expect(warned.status).toBe(0);
  expect(warned.stderr).toBe("theway: warning: config.yaml: unknown key bogus; ignored\n");
  for (const [args, line] of [
    [["Bad/p", "develop"], "theway: invalid project 'Bad/p': "],
    [["p", "deploy"], "theway: invalid phase 'deploy': must be engineering, develop or document\n"],
    [["p", "develop", "Add_X"], "theway: invalid change id 'Add_X': "],
  ] as const) {
    const res = run(dir, "context", ...args);
    expect(res.status).toBe(1);
    expect(res.stdout).toBe("");
    expect(res.stderr).toStartWith(line);
  }
});

test("authority prints the Authority section of interaction.md, else of interaction.default.md, else exits 1", () => {
  const dir = home();
  const kept = join(dir, "standards", "interaction.md");
  const shipped = join(dir, "standards", "interaction.default.md");
  const noSection = `theway: no ## Authority section in ${kept} or interaction.default.md; run npx --yes @pixelfactoryio/theway@latest install, then /reload-plugins\n`;
  const none = run(dir, "authority");
  expect(none.status).toBe(1);
  expect(none.stderr).toBe(noSection);
  put(shipped, "# I\n\n## Authority\n\n- shipped\n");
  expect(run(dir, "authority").stdout).toBe("## Authority\n\n- shipped\n");
  put(kept, "# I\n\n## Reporting\n\n- r\n");
  expect(run(dir, "authority").stdout).toBe("## Authority\n\n- shipped\n");
  put(kept, "# I\n\n## Authority\n\n- kept\n- two\n\n\n## Next\n\nz\n");
  const res = run(dir, "authority");
  expect(res.status).toBe(0);
  expect(res.stdout).toBe("## Authority\n\n- kept\n- two\n");
  put(kept, "# I\n\n## Authority\n- last\n\n");
  expect(run(dir, "authority").stdout).toBe("## Authority\n- last\n");
  rmSync(shipped);
  put(kept, "# I\n");
  expect(run(dir, "authority").stderr).toBe(noSection);
});

test("next-id continues after the highest active or archived ordinal of the exact series", () => {
  const dir = home();
  expect(run(dir, "next-id", "p", "add-thing").stdout).toBe("add-thing-01\n");
  const changes = join(dir, "p", "changes");
  mkdirSync(join(changes, "add-thing-01"), { recursive: true });
  mkdirSync(join(changes, "archive", "2026-01-01-add-thing-03"), { recursive: true });
  mkdirSync(join(changes, "add-other-thing-09"), { recursive: true });
  mkdirSync(join(changes, "archive", "2026-01-01-add-other-thing-08"), { recursive: true });
  put(join(changes, "add-thing-12"), "a file, not a member\n");
  const res = run(dir, "next-id", "p", "add-thing", "--count", "2");
  expect(res.status).toBe(0);
  expect(res.stdout).toBe("add-thing-04\nadd-thing-05\n");
  expect(run(dir, "next-id", "p", "add-thing-07").stdout).toBe("add-thing-04\n");
  expect(run(dir, "next-id", "p", "add-thing", "--count", "3").stdout).toBe("add-thing-04\nadd-thing-05\nadd-thing-06\n");
});

test("next-id exits 1 on an invalid series id, a bad --count and past -99", () => {
  const dir = home();
  const bad = run(dir, "next-id", "p", "Add-thing");
  expect(bad.status).toBe(1);
  expect(bad.stdout).toBe("");
  expect(bad.stderr).toBe("invalid change id 'Add-thing': uppercase letters are not allowed; use lowercase kebab-case\n");
  const ordinal = run(dir, "next-id", "p", "add-thing-01-02");
  expect(ordinal.status).toBe(1);
  expect(ordinal.stderr).toBe("invalid change id 'add-thing-01': ends in a number (-01); a series id cannot end in a number\n");
  const number = run(dir, "next-id", "p", "add-thing-7");
  expect(number.status).toBe(1);
  expect(number.stderr).toBe("invalid change id 'add-thing-7': ends in a number (-7); a series id cannot end in a number\n");
  const twoDigits = run(dir, "next-id", "p", "add-thing-42-05");
  expect(twoDigits.stderr).toBe("invalid change id 'add-thing-42': ends in a number (-42); a series id cannot end in a number\n");
  for (const res of [bad, ordinal, number, twoDigits]) expect(res.stderr).not.toContain("--series");
  expect(run(dir, "next-id", "Bad/p", "add-thing").stderr).toStartWith("theway: invalid project 'Bad/p': ");
  for (const count of ["0", "-1", "1.5", "x"]) {
    const res = run(dir, "next-id", "p", "add-thing", "--count", count);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("must be a positive integer");
  }
  mkdirSync(join(dir, "p", "changes", "add-thing-98"), { recursive: true });
  expect(run(dir, "next-id", "p", "add-thing").stdout).toBe("add-thing-99\n");
  const past = run(dir, "next-id", "p", "add-thing", "--count", "2");
  expect(past.status).toBe(1);
  expect(past.stdout).toBe("");
  expect(past.stderr).toBe("theway: series add-thing would go past -99\n");
});

/**
 * A home with an empty global config, the two convention standards, the two shipped lenses, and a `develop.yaml`
 * holding the steps of the shipped `agents.yaml`.
 */
function workflowHome(): string {
  const dir = home();
  put(join(dir, "config.yaml"), "");
  put(join(dir, "standards", "commits.md"), "# commits\n");
  put(join(dir, "standards", "git-host.md"), "# git host\n");
  put(join(dir, "lenses", "conformance.md"), "# conformance\n");
  put(join(dir, "lenses", "correctness.md"), "# correctness\n");
  put(join(dir, "workflows", "develop.yaml"), "steps:\n  - implement:\n  - review:\n  - pr:\n");
  return dir;
}

/** The `develop` workflow `theway workflow` prints for a home with the default config. */
function developJson(dir: string, file = join(dir, "workflows", "develop.yaml"), name = "develop"): string {
  const doc = {
    name,
    file,
    commits: join(dir, "standards", "commits.md"),
    git_host: join(dir, "standards", "git-host.md"),
    steps: [
      { step: "implement", agents: true, model: "opus" },
      {
        step: "review",
        agents: true,
        rounds: 1,
        lenses: [
          { name: "conformance", path: join(dir, "lenses", "conformance.md") },
          { name: "correctness", path: join(dir, "lenses", "correctness.md") },
        ],
        model: "opus",
        fix_model: "opus",
      },
      { step: "pr", agents: true, ci_attempts: 2, model: "sonnet", fix_model: "opus" },
    ],
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

test("workflow prints develop with every field from the defaults when no file sets default: true", () => {
  const dir = workflowHome();
  const res = run(dir, "workflow", "p");
  expect([res.status, res.stdout, res.stderr]).toEqual([0, developJson(dir), ""]);
  expect(run(dir, "workflow", "p", "develop").stdout).toBe(developJson(dir));
});

test("workflow fills every field in table order, an agent step included, and keeps the fields a step sets", () => {
  const dir = workflowHome();
  put(join(dir, "lenses", "security.md"), "# security\n");
  put(
    join(dir, "workflows", "full.yaml"),
    [
      "steps:",
      "  - implement: {model: sonnet}",
      "  - review: {fix_model: haiku, lenses: [security], rounds: 2}",
      "  - agent: {prompt: Add a changelog entry., name: changelog}",
      "  - pr: {}",
      "",
    ].join("\n"),
  );
  const res = run(dir, "workflow", "p", "full");
  expect([res.status, res.stderr]).toEqual([0, ""]);
  expect(res.stdout).toBe(
    `${JSON.stringify(
      {
        name: "full",
        file: join(dir, "workflows", "full.yaml"),
        commits: join(dir, "standards", "commits.md"),
        git_host: join(dir, "standards", "git-host.md"),
        steps: [
          { step: "implement", agents: true, model: "sonnet" },
          {
            step: "review",
            agents: true,
            rounds: 2,
            lenses: [{ name: "security", path: join(dir, "lenses", "security.md") }],
            model: "opus",
            fix_model: "haiku",
          },
          { step: "agent", agents: true, name: "changelog", prompt: "Add a changelog entry.", model: "sonnet" },
          { step: "pr", agents: true, ci_attempts: 2, model: "sonnet", fix_model: "opus" },
        ],
      },
      null,
      2,
    )}\n`,
  );
});

test("workflow takes absent fields from the project workflow.defaults over the global ones over the built-in values", () => {
  const dir = workflowHome();
  put(
    join(dir, "config.yaml"),
    "workflow:\n  defaults:\n    review:\n      rounds: 3\n      model: sonnet\n    pr:\n      ci_attempts: 4\n",
  );
  put(join(dir, "p", "config.yaml"), "workflow:\n  defaults:\n    review:\n      rounds: 2\n      lenses: [correctness]\n");
  const res = run(dir, "workflow", "p");
  expect([res.status, res.stderr]).toEqual([0, ""]);
  const doc = JSON.parse(res.stdout) as { steps: Record<string, unknown>[] };
  expect(doc.steps[1]).toEqual({
    step: "review",
    agents: true,
    rounds: 2,
    lenses: [{ name: "correctness", path: join(dir, "lenses", "correctness.md") }],
    model: "sonnet",
    fix_model: "opus",
  });
  expect(doc.steps[2]).toEqual({ step: "pr", agents: true, ci_attempts: 4, model: "sonnet", fix_model: "opus" });
  const other = JSON.parse(run(dir, "workflow", "other").stdout) as { steps: Record<string, unknown>[] };
  expect((other.steps[1] as { rounds: number }).rounds).toBe(3);
});

test("workflow <name> takes the project file over the global one, and exits 1 when neither exists", () => {
  const dir = workflowHome();
  put(join(dir, "workflows", "quick.yaml"), "steps:\n  - implement:\n");
  expect(JSON.parse(run(dir, "workflow", "p", "quick").stdout).file).toBe(join(dir, "workflows", "quick.yaml"));
  put(join(dir, "p", "workflows", "quick.yaml"), "steps:\n  - implement: {model: haiku}\n");
  const res = run(dir, "workflow", "p", "quick");
  expect([res.status, res.stderr]).toEqual([0, ""]);
  expect(JSON.parse(res.stdout)).toEqual({
    name: "quick",
    file: join(dir, "p", "workflows", "quick.yaml"),
    commits: join(dir, "standards", "commits.md"),
    git_host: join(dir, "standards", "git-host.md"),
    steps: [{ step: "implement", agents: true, model: "haiku" }],
  });
  const missing = run(dir, "workflow", "p", "nope");
  expect([missing.status, missing.stdout, missing.stderr]).toEqual([
    1,
    "",
    `theway: no workflow 'nope' in ${join(dir, "p", "workflows")} or ${join(dir, "workflows")}\n`,
  ]);
});

test("workflow exits 1 on an invalid name, an invalid project and a missing config.yaml, and prints config warnings", () => {
  const dir = workflowHome();
  for (const [args, line] of [
    [["p", "Bad_Name"], "theway: invalid workflow name 'Bad_Name'\n"],
    [["p", "a--b"], "theway: invalid workflow name 'a--b'\n"],
    [["../x"], `theway: invalid project '../x': must be letters, digits, ".", "_" or "-", not starting with "." or "-"\n`],
  ] as const) {
    const res = run(dir, "workflow", ...args);
    expect([res.status, res.stdout, res.stderr]).toEqual([1, "", line]);
  }
  put(join(dir, "config.yaml"), "workflow:\n  open_pr: false\n");
  const warned = run(dir, "workflow", "p");
  expect([warned.status, warned.stdout, warned.stderr]).toEqual([
    0,
    developJson(dir),
    "theway: warning: config.yaml: unknown key workflow.open_pr; ignored\n",
  ]);
  rmSync(join(dir, "config.yaml"));
  const res = run(dir, "workflow", "p");
  expect([res.status, res.stdout, res.stderr]).toEqual([
    1,
    "",
    `theway: config.yaml not found in ${dir}; run npx --yes @pixelfactoryio/theway@latest install, then /reload-plugins\n`,
  ]);
});

test("workflow picks the project's default: true file, else the global one not shadowed by a project file, else develop", () => {
  const dir = workflowHome();
  const one = "default: true\nsteps:\n  - implement:\n";
  put(join(dir, "workflows", "global-one.yaml"), one);
  put(join(dir, "workflows", "plain.yaml"), "default: false\nsteps:\n  - implement:\n");
  expect(JSON.parse(run(dir, "workflow", "p").stdout).file).toBe(join(dir, "workflows", "global-one.yaml"));
  put(join(dir, "p", "workflows", "mine.yaml"), one);
  expect(JSON.parse(run(dir, "workflow", "p").stdout).file).toBe(join(dir, "p", "workflows", "mine.yaml"));
  expect(JSON.parse(run(dir, "workflow", "other").stdout).file).toBe(join(dir, "workflows", "global-one.yaml"));
  rmSync(join(dir, "p", "workflows", "mine.yaml"));
  put(join(dir, "p", "workflows", "global-one.yaml"), "steps:\n  - implement:\n");
  const res = run(dir, "workflow", "p");
  expect([res.status, res.stdout, res.stderr]).toEqual([0, developJson(dir), ""]);
  put(join(dir, "p", "workflows", "develop.yaml"), "steps:\n  - implement:\n  - review:\n  - pr:\n");
  expect(run(dir, "workflow", "p").stdout).toBe(developJson(dir, join(dir, "p", "workflows", "develop.yaml")));
});

test("workflow exits 1 naming every file that sets default: true in the folder it reads", () => {
  const dir = workflowHome();
  const one = "default: true\nsteps:\n  - implement:\n";
  put(join(dir, "workflows", "b.yaml"), one);
  put(join(dir, "workflows", "a.yaml"), one);
  const two = run(dir, "workflow", "p");
  expect([two.status, two.stdout, two.stderr]).toEqual([1, "", "theway: workflows/a.yaml and workflows/b.yaml both set default: true\n"]);
  for (const n of ["z", "m", "c"]) put(join(dir, "p", "workflows", `${n}.yaml`), one);
  const three = run(dir, "workflow", "p");
  expect(three.stderr).toBe("theway: p/workflows/c.yaml, p/workflows/m.yaml and p/workflows/z.yaml both set default: true\n");
  expect(run(dir, "workflow", "p", "a").status).toBe(0);
});

test("workflow validates every file of the folder it reads for the default, and skips a shadowed global file", () => {
  const dir = workflowHome();
  put(join(dir, "workflows", "broken.yaml"), "steps: []\n");
  const res = run(dir, "workflow", "p");
  expect([res.status, res.stdout, res.stderr]).toEqual([1, "", "theway: workflows/broken.yaml: steps must be a non-empty list\n"]);
  put(join(dir, "p", "workflows", "broken.yaml"), "steps:\n  - implement:\n");
  expect([run(dir, "workflow", "p").status, run(dir, "workflow", "p").stdout]).toEqual([0, developJson(dir)]);
  put(join(dir, "p", "workflows", "aaa.yaml"), "steps:\n  - review:\n");
  put(join(dir, "p", "workflows", "zzz.yaml"), "default: true\nsteps:\n  - implement:\n");
  expect(run(dir, "workflow", "p").stderr).toBe("theway: p/workflows/aaa.yaml: steps[0] must be implement\n");
  expect(run(dir, "workflow", "p", "zzz").status).toBe(0);
});

test("workflow skips .default.yaml copies and warns about invalid stems only while it scans a folder", () => {
  const dir = workflowHome();
  put(join(dir, "workflows", "develop.default.yaml"), "default: true\nsteps: bad\n");
  put(join(dir, "workflows", "Bad_Name.yaml"), "default: true\nsteps: bad\n");
  put(join(dir, "workflows", "x.yml"), "default: true\n");
  put(join(dir, "p", "workflows", "also bad.yaml"), "default: true\n");
  put(join(dir, "p", "workflows", "notes.md"), "x\n");
  mkdirSync(join(dir, "p", "workflows", "dir.yaml"));
  const res = run(dir, "workflow", "p");
  expect([res.status, res.stdout]).toEqual([0, developJson(dir)]);
  expect(res.stderr).toBe(
    [
      "theway: warning: p/workflows/also bad.yaml: not a valid workflow name; ignored",
      "theway: warning: workflows/Bad_Name.yaml: not a valid workflow name; ignored",
      "",
    ].join("\n"),
  );
  const named = run(dir, "workflow", "p", "develop");
  expect([named.status, named.stderr]).toEqual([0, ""]);
});

test("workflow reads no project folder for a shared project name", () => {
  const dir = workflowHome();
  put(join(dir, "standards", "workflows", "mine.yaml"), "default: true\nsteps:\n  - review:\n");
  put(join(dir, "lenses", "lenses", "conformance.md"), "# own\n");
  const res = run(dir, "workflow", "lenses");
  expect([res.status, res.stdout, res.stderr]).toEqual([0, developJson(dir), ""]);
  expect(run(dir, "workflow", "standards").stdout).toBe(developJson(dir));
});

test("workflow names only the global folder in its errors for a shared project name", () => {
  const dir = workflowHome();
  const missing = run(dir, "workflow", "lenses", "nope");
  expect([missing.status, missing.stdout, missing.stderr]).toEqual([
    1,
    "",
    `theway: no workflow 'nope' in ${join(dir, "workflows")}\n`,
  ]);
  put(join(dir, "workflows", "sec.yaml"), "steps:\n  - implement:\n  - review: {lenses: [security]}\n");
  const lens = run(dir, "workflow", "standards", "sec");
  expect([lens.status, lens.stdout, lens.stderr]).toEqual([
    1,
    "",
    `theway: workflows/sec.yaml: steps[1].review lens 'security' has no file in ${join(dir, "lenses")}\n`,
  ]);
});

test("workflow takes a project lens over the global one, and exits 1 for a lens with no file", () => {
  const dir = workflowHome();
  put(join(dir, "p", "lenses", "correctness.md"), "# mine\n");
  const doc = JSON.parse(run(dir, "workflow", "p").stdout) as { steps: { lenses?: { path: string }[] }[] };
  expect(doc.steps[1]?.lenses?.map((l) => l.path)).toEqual([
    join(dir, "lenses", "conformance.md"),
    join(dir, "p", "lenses", "correctness.md"),
  ]);
  put(join(dir, "workflows", "sec.yaml"), "steps:\n  - implement:\n  - review: {lenses: [correctness, security, other]}\n");
  const res = run(dir, "workflow", "p", "sec");
  expect([res.status, res.stdout, res.stderr]).toEqual([
    1,
    "",
    `theway: workflows/sec.yaml: steps[1].review lens 'security' has no file in ${join(dir, "p", "lenses")} or ${join(dir, "lenses")}\n`,
  ]);
  put(join(dir, "config.yaml"), "workflow:\n  defaults:\n    review:\n      lenses: [missing]\n");
  expect(run(dir, "workflow", "p").stderr).toBe(
    `theway: workflows/develop.yaml: steps[1].review lens 'missing' has no file in ${join(dir, "p", "lenses")} or ${join(dir, "lenses")}\n`,
  );
});

test("workflow exits 1 with the first validation error of a file, in the documented order", () => {
  const dir = workflowHome();
  const head = "steps:\n  - implement:\n";
  const cases: [string, string][] = [
    ["a: [1\n", "invalid YAML: Flow sequence in block collection must be sufficiently indented and end with a ] at line 2, column 1"],
    ["steps: 1\nsteps: 2\n", "invalid YAML: Map keys must be unique at line 2, column 1"],
    ["", "not a map"],
    ["- implement\n", "not a map"],
    ["steps: x\nname: y\nother: z\n", "unknown key name"],
    ["default: yes\nsteps:\n  - implement:\n", "default must be true or false"],
    ["default: true\n", "steps must be a non-empty list"],
    ["steps: {implement: {}}\n", "steps must be a non-empty list"],
    ["steps: []\n", "steps must be a non-empty list"],
    ["steps:\n  - implement\n", "steps[0] must be one of implement, review, agent, pr"],
    ["steps:\n  - {implement: {}, pr: {}}\n", "steps[0] must be one of implement, review, agent, pr"],
    [`${head}  - deploy: {}\n`, "steps[1] must be one of implement, review, agent, pr"],
    [`${head}  - review: [1]\n`, "steps[1].review must be a map"],
    [`${head}  - review: x\n`, "steps[1].review must be a map"],
    [`${head}  - review: {rounds: 0, extra: 1, other: 2}\n`, "steps[1].review.extra is not a field of review"],
    [`${head}  - pr: {model: opus, ci_attempts: 0}\n`, "steps[1].pr.ci_attempts must be a positive integer"],
    [`${head}  - review: {rounds: 1.5}\n`, "steps[1].review.rounds must be a positive integer"],
    ["steps:\n  - implement: {model: gpt}\n", "steps[0].implement.model must be opus, sonnet or haiku"],
    [`${head}  - review: {fix_model: Opus}\n`, "steps[1].review.fix_model must be opus, sonnet or haiku"],
    [`${head}  - review: {lenses: []}\n`, "steps[1].review.lenses must be a non-empty list of names without duplicates"],
    [`${head}  - review: {lenses: [a, a]}\n`, "steps[1].review.lenses must be a non-empty list of names without duplicates"],
    [`${head}  - review: {lenses: [Bad]}\n`, "steps[1].review.lenses must be a non-empty list of names without duplicates"],
    [`${head}  - agent: {name: Change Log, prompt: x}\n`, "steps[1].agent.name must be a name (lowercase letters, digits and -)"],
    [`${head}  - agent: {name: x, prompt: ""}\n`, "steps[1].agent.prompt must be a non-empty string"],
    [`${head}  - agent: {name: x, prompt: 3}\n`, "steps[1].agent.prompt must be a non-empty string"],
    [`${head}  - agent:\n`, "steps[1].agent.name is required"],
    [`${head}  - agent: {prompt: x}\n`, "steps[1].agent.name is required"],
    [`${head}  - agent: {name: x}\n`, "steps[1].agent.prompt is required"],
    ["steps:\n  - review:\n  - implement:\n", "steps[0] must be implement"],
    ["steps:\n  - review: {rounds: 0}\n", "steps[0].review.rounds must be a positive integer"],
    [`${head}  - implement:\n`, "steps[1]: implement may appear only once"],
    [`${head}  - pr:\n  - review:\n`, "steps[1]: pr must be the last step"],
    [`${head}  - pr:\n  - pr:\n`, "steps[1]: pr must be the last step"],
    [`${head}  - review: {lenses: [nope]}\n  - pr: {bad: 1}\n`, `steps[1].review lens 'nope' has no file in ${join(dir, "p", "lenses")} or ${join(dir, "lenses")}`],
    [`${head}  - pr: {}\n  - review: {bad: 1}\n`, "steps[1]: pr must be the last step"],
  ];
  for (const [text, reason] of cases) {
    put(join(dir, "workflows", "w.yaml"), text);
    const res = run(dir, "workflow", "p", "w");
    expect([text, res.status, res.stdout, res.stderr]).toEqual([text, 1, "", `theway: workflows/w.yaml: ${reason}\n`]);
  }
}, 30_000);

test.skipIf(process.getuid?.() === 0)("workflow exits 1 for a workflow file that cannot be read", () => {
  const dir = workflowHome();
  put(join(dir, "p", "workflows", "w.yaml"), "steps:\n  - implement:\n");
  chmodSync(join(dir, "p", "workflows", "w.yaml"), 0o000);
  const res = run(dir, "workflow", "p", "w");
  expect([res.status, res.stdout, res.stderr]).toEqual([1, "", "theway: p/workflows/w.yaml: cannot be read\n"]);
});

/** A home holding the shipped config, convention standards, workflows and lenses. */
function shippedHome(): string {
  const dir = home();
  const shipped = join(import.meta.dirname, "..", "plugin", "home");
  for (const rel of [
    "config.yaml",
    "standards/commits.md",
    "standards/git-host.md",
    "workflows/develop.yaml",
    "workflows/agents.yaml",
    "lenses/conformance.md",
    "lenses/correctness.md",
  ]) {
    put(join(dir, rel), readFileSync(join(shipped, rel), "utf-8"));
  }
  return dir;
}

test("workflow prints the shipped agents for a home holding the shipped config, workflows and lenses", () => {
  const dir = shippedHome();
  const res = run(dir, "workflow", "theway", "agents");
  expect([res.status, res.stdout, res.stderr]).toEqual([0, developJson(dir, join(dir, "workflows", "agents.yaml"), "agents"), ""]);
});

test("workflow resolves the shipped develop, the fallback default, to one inline implement step", () => {
  const dir = shippedHome();
  const doc = {
    name: "develop",
    file: join(dir, "workflows", "develop.yaml"),
    commits: join(dir, "standards", "commits.md"),
    git_host: join(dir, "standards", "git-host.md"),
    steps: [{ step: "implement", agents: false }],
  };
  const res = run(dir, "workflow", "theway");
  expect([res.status, res.stdout, res.stderr]).toEqual([0, `${JSON.stringify(doc, null, 2)}\n`, ""]);
  expect(run(dir, "workflow", "theway", "develop").stdout).toBe(res.stdout);
});

test("workflow gives every step its own agents, else the top-level one, else true, and inline steps no models", () => {
  const dir = workflowHome();
  put(
    join(dir, "workflows", "mixed.yaml"),
    [
      "agents: false",
      "steps:",
      "  - implement:",
      "  - review: {agents: true, model: sonnet}",
      "  - review: {rounds: 2}",
      "  - agent: {name: notes, prompt: Write the notes.}",
      "  - pr: {agents: true}",
      "",
    ].join("\n"),
  );
  const res = run(dir, "workflow", "p", "mixed");
  expect([res.status, res.stderr]).toEqual([0, ""]);
  const lensList = [
    { name: "conformance", path: join(dir, "lenses", "conformance.md") },
    { name: "correctness", path: join(dir, "lenses", "correctness.md") },
  ];
  expect(JSON.parse(res.stdout).steps).toEqual([
    { step: "implement", agents: false },
    { step: "review", agents: true, rounds: 1, lenses: lensList, model: "sonnet", fix_model: "opus" },
    { step: "review", agents: false, rounds: 2, lenses: lensList },
    { step: "agent", agents: false, name: "notes", prompt: "Write the notes." },
    { step: "pr", agents: true, ci_attempts: 2, model: "sonnet", fix_model: "opus" },
  ]);
  expect(Object.keys(JSON.parse(res.stdout).steps[2])).toEqual(["step", "agents", "rounds", "lenses"]);
  put(join(dir, "workflows", "on.yaml"), "agents: true\nsteps:\n  - implement: {agents: false}\n  - pr:\n");
  expect(JSON.parse(run(dir, "workflow", "p", "on").stdout).steps).toEqual([
    { step: "implement", agents: false },
    { step: "pr", agents: true, ci_attempts: 2, model: "sonnet", fix_model: "opus" },
  ]);
  put(join(dir, "config.yaml"), "workflow:\n  defaults:\n    implement:\n      model: haiku\n");
  expect(JSON.parse(run(dir, "workflow", "p", "on").stdout).steps[0]).toEqual({ step: "implement", agents: false });
});

test("workflow exits 1 for agents that is not a boolean and for an inline step that sets a model, in the documented order", () => {
  const dir = workflowHome();
  const head = "steps:\n  - implement:\n";
  const cases: [string, string][] = [
    ["agents: no\nsteps: x\n", "agents must be true or false"],
    ["default: 1\nagents: 1\n", "default must be true or false"],
    ["agents: 1\nsteps: []\n", "agents must be true or false"],
    ["steps:\n  - implement: {agents: 1}\n", "steps[0].implement.agents must be true or false"],
    ["steps:\n  - implement: {agents: 1, x: 1}\n", "steps[0].implement.x is not a field of implement"],
    ["steps:\n  - implement: {agents: false, model: opus}\n", "steps[0].implement.model has no effect when the step runs inline (agents: false)"],
    ["agents: false\nsteps:\n  - implement: {model: opus}\n", "steps[0].implement.model has no effect when the step runs inline (agents: false)"],
    ["agents: false\nsteps:\n  - implement: {model: gpt}\n", "steps[0].implement.model must be opus, sonnet or haiku"],
    [`agents: false\n${head}  - review: {fix_model: opus, model: opus}\n`, "steps[1].review.fix_model has no effect when the step runs inline (agents: false)"],
    [`agents: false\n${head}  - pr: {fix_model: opus}\n`, "steps[1].pr.fix_model has no effect when the step runs inline (agents: false)"],
    [`agents: false\n${head}  - agent: {model: haiku}\n`, "steps[1].agent.model has no effect when the step runs inline (agents: false)"],
    [`${head}  - agent: {agents: false, model: haiku}\n`, "steps[1].agent.model has no effect when the step runs inline (agents: false)"],
    [`agents: false\n${head}  - implement: {model: opus}\n`, "steps[1].implement.model has no effect when the step runs inline (agents: false)"],
  ];
  for (const [text, reason] of cases) {
    put(join(dir, "workflows", "w.yaml"), text);
    const res = run(dir, "workflow", "p", "w");
    expect([text, res.status, res.stdout, res.stderr]).toEqual([text, 1, "", `theway: workflows/w.yaml: ${reason}\n`]);
  }
}, 30_000);

test("workflow prints commits and git_host after file, each the project file over the global one", () => {
  const dir = workflowHome();
  const keys = Object.keys(JSON.parse(run(dir, "workflow", "p").stdout));
  expect(keys).toEqual(["name", "file", "commits", "git_host", "steps"]);
  put(join(dir, "p", "standards", "commits.md"), "# mine\n");
  const own = JSON.parse(run(dir, "workflow", "p").stdout);
  expect([own.commits, own.git_host]).toEqual([join(dir, "p", "standards", "commits.md"), join(dir, "standards", "git-host.md")]);
  put(join(dir, "p", "standards", "git-host.md"), "# GitLab\n");
  expect(JSON.parse(run(dir, "workflow", "p").stdout).git_host).toBe(join(dir, "p", "standards", "git-host.md"));
  expect(JSON.parse(run(dir, "workflow", "other").stdout).commits).toBe(join(dir, "standards", "commits.md"));
  put(join(dir, "standards", "standards", "commits.md"), "# shared\n");
  expect(JSON.parse(run(dir, "workflow", "standards").stdout).commits).toBe(join(dir, "standards", "commits.md"));
});

test("workflow exits 1 when a global convention standard is missing, after the workflow file is validated", () => {
  const dir = workflowHome();
  put(join(dir, "p", "standards", "commits.md"), "# mine\n");
  put(join(dir, "p", "standards", "git-host.md"), "# mine\n");
  const line = (file: string) =>
    `theway: ${join(dir, "standards", file)} not found; run npx --yes @pixelfactoryio/theway@latest install, then /reload-plugins\n`;
  rmSync(join(dir, "standards", "git-host.md"));
  const host = run(dir, "workflow", "p");
  expect([host.status, host.stdout, host.stderr]).toEqual([1, "", line("git-host.md")]);
  rmSync(join(dir, "standards", "commits.md"));
  const commits = run(dir, "workflow", "p");
  expect([commits.status, commits.stdout, commits.stderr]).toEqual([1, "", line("commits.md")]);
  put(join(dir, "workflows", "w.yaml"), "steps: []\n");
  const invalid = run(dir, "workflow", "p", "w");
  expect([invalid.status, invalid.stdout, invalid.stderr]).toEqual([1, "", "theway: workflows/w.yaml: steps must be a non-empty list\n"]);
  rmSync(join(dir, "workflows", "w.yaml"));
  put(join(dir, "config.yaml"), "workflow:\n  open_pr: false\n");
  expect(run(dir, "workflow", "p").stderr).toBe(`theway: warning: config.yaml: unknown key workflow.open_pr; ignored\n${line("commits.md")}`);
});

test("commits.md and git-host.md are never standards of theway context from either folder, and cannot be switched", () => {
  const dir = home();
  put(join(dir, "config.yaml"), "standards:\n  commits:\n    enabled: true\n  git_host:\n    enabled: false\n");
  put(join(dir, ".shipped.json"), "{}\n");
  for (const f of ["commits.md", "git-host.md", "mine.md"]) {
    put(join(dir, "standards", f), "# x\n");
    put(join(dir, "p", "standards", f), "# x\n");
  }
  for (const phase of ["engineering", "develop", "document"]) {
    const res = run(dir, "context", "p", phase);
    expect(res.status).toBe(0);
    expect(res.stdout).not.toContain("commits.md");
    expect(res.stdout).not.toContain("git-host.md");
    expect(res.stdout).toContain(join(dir, "p", "standards", "mine.md"));
  }
  const config = run(dir, "config", "p");
  expect(config.stdout).not.toMatch(/commits|git_host/);
  expect(config.stderr).toBe(
    [
      "theway: warning: config.yaml: standards.commits cannot be switched; ignored",
      "theway: warning: config.yaml: standards.git_host cannot be switched; ignored",
      "",
    ].join("\n"),
  );
});
