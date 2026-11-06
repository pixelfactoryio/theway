import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { changeIdReason } from "../src/core/path";
import { projectReason } from "../src/core/project";
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
  put(join(dir, "projects", "p", "changes", "add-x", "tasks.md"), "- [x] 1. a\n- [ ] Ready to archive\n- [ ] 2. b");
  expect(run(dir, "list", "--project", "p").stdout).toContain("1/2 tasks done");
  const res = run(dir, "archive", "--project", "p", "add-x");
  expect(res.status).toBe(1);
  expect(res.stderr).toContain("3:- [ ] 2. b");
  expect(res.stderr).not.toContain("Ready to archive");
});

test("archive refuses an id already archived today", () => {
  const dir = home();
  const spec = join(dir, "projects", "p", "changes", "add-y", "spec.md");
  put(spec, "# y\n");
  expect(run(dir, "archive", "--project", "p", "add-y").status).toBe(0);
  put(spec, "# y\n");
  const res = run(dir, "archive", "--project", "p", "add-y");
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
  const changes = join(dir, "projects", "p", "changes");
  put(join(changes, "add-alpha", "spec.md"), spec);
  put(join(changes, "add-alpha", "tasks.md"), "- [x] 1. a\n- [x] 2. b\n- [ ] 3. c\n");
  put(join(changes, "update-beta", "spec.md"), spec);
  put(join(changes, "archive", "2026-01-10-add-gamma", "spec.md"), spec);
  const res = run(dir, "list", "--project", "p");
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

test("path prints the home without a change id and the change folder with one, on one stdout line", () => {
  const root = home();
  expect(runPath(root, { env: "/h" }).stdout).toBe("/h\n");
  expect(runPath(root, { env: "/h" }, "--project", "proj").stdout).toBe("/h\n");
  const res = runPath(root, { env: "/h" }, "--project", "proj", "add-x");
  expect(res.status).toBe(0);
  expect(res.stdout).toBe("/h/projects/proj/changes/add-x\n");
  expect(res.stderr).toBe("");
  const verbose = runPath(root, { pointer: "/p" }, "--project", "proj", "add-x", "--verbose");
  expect(verbose.stdout).toBe("/p/projects/proj/changes/add-x\n");
  expect(verbose.stderr).toBe("theway: home /p (from pointer)\n");
});

const CHANGE_ID_REASON = "must be lowercase letters and digits in words separated by single hyphens";
const PROJECT_REASON = 'must be letters, digits and "-", at most 200 characters';
const LONG_REASON = "must be at most 200 characters";

test("path exits 1 with one reason for an invalid project or change id", () => {
  const root = home();
  const long = "a".repeat(201);
  const cases: [string[], string][] = [
    [["--project", ""], `theway: invalid project '': ${PROJECT_REASON}\n`],
    [["--project", "a/b"], `theway: invalid project 'a/b': ${PROJECT_REASON}\n`],
    [["--project", "."], `theway: invalid project '.': ${PROJECT_REASON}\n`],
    [["--project", ".."], `theway: invalid project '..': ${PROJECT_REASON}\n`],
    [["--project", "a_b"], `theway: invalid project 'a_b': ${PROJECT_REASON}\n`],
    [["--project", "a b"], `theway: invalid project 'a b': ${PROJECT_REASON}\n`],
    [["--project", "a\\b"], `theway: invalid project 'a\\b': ${PROJECT_REASON}\n`],
    [["--project", long], `theway: invalid project '${long}': ${PROJECT_REASON}\n`],
    [["--project", "a/b", "add-x"], `theway: invalid project 'a/b': ${PROJECT_REASON}\n`],
    [["--project", "a/b", "Add-X"], `theway: invalid project 'a/b': ${PROJECT_REASON}\n`],
    [["--project", "p", ""], "theway: invalid change id '': must not be empty\n"],
    [["--project", "p", "x/y"], `theway: invalid change id 'x/y': ${CHANGE_ID_REASON}\n`],
    [["--project", "p", "."], `theway: invalid change id '.': ${CHANGE_ID_REASON}\n`],
    [["--project", "p", ".."], `theway: invalid change id '..': ${CHANGE_ID_REASON}\n`],
    [["--project", "p", "Add-X"], `theway: invalid change id 'Add-X': ${CHANGE_ID_REASON}\n`],
    [["--project", "p", "add--x"], `theway: invalid change id 'add--x': ${CHANGE_ID_REASON}\n`],
    [["--project", "p", "--", "-add"], `theway: invalid change id '-add': ${CHANGE_ID_REASON}\n`],
    [["--project", "p", "add-"], `theway: invalid change id 'add-': ${CHANGE_ID_REASON}\n`],
    [["--project", "p", "add_x"], `theway: invalid change id 'add_x': ${CHANGE_ID_REASON}\n`],
    [["--project", "p", long], `theway: invalid change id '${long}': ${LONG_REASON}\n`],
  ];
  for (const [args, stderr] of cases) {
    const res = runPath(root, { env: "/h" }, ...args);
    expect(res.status).toBe(1);
    expect(res.stdout).toBe("");
    expect(res.stderr).toBe(stderr);
  }
});

test("path treats a single argument as a change id of the project", () => {
  const root = home();
  const res = runPath(root, { env: "/h" }, "--project", "My-Repo-v2", "theway");
  expect(res.status).toBe(0);
  expect(res.stdout).toBe("/h/projects/My-Repo-v2/changes/theway\n");
  expect(res.stderr).toBe("");
});

test("changeIdReason and projectReason reject a NUL byte and accept allowlisted names", () => {
  expect(changeIdReason("a\u0000b")).toBe(CHANGE_ID_REASON);
  expect(projectReason("a\u0000b")).toBe(PROJECT_REASON);
  expect(changeIdReason("add-x-01")).toBe("");
  expect(projectReason("-Users-me-My-Repo-v2")).toBe("");
  expect(projectReason("My_Repo.v2")).toBe(PROJECT_REASON);
  expect(changeIdReason("a".repeat(200))).toBe("");
  expect(projectReason("a".repeat(200))).toBe("");
  expect(projectReason("a".repeat(201))).toBe(PROJECT_REASON);
});

test("list reads the home the pointer names when THEWAY_HOME is unset", () => {
  const root = home();
  const data = join(root, "data");
  put(join(data, "projects", "p", "changes", "add-x", "tasks.md"), "- [x] 1. a\n");
  put(join(root, "config", "theway", "home"), `${data}\n`);
  const res = spawnSync("node", [CLI, "list", "--project", "p"], {
    encoding: "utf-8",
    env: { HOME: join(root, "home"), PATH: process.env.PATH, XDG_CONFIG_HOME: join(root, "config") },
  });
  expect(res.stdout).toContain("add-x                1 files   1/1 tasks done");
});

test("list and archive exit 1 with the path reason for an invalid project or change id", () => {
  const dir = home();
  const cases: [string[], string][] = [];
  for (const v of ["a/b", ".", ".."]) {
    cases.push([["list", "--project", v], `theway: invalid project '${v}': ${PROJECT_REASON}\n`]);
    cases.push([["archive", "--project", v, "add-x"], `theway: invalid project '${v}': ${PROJECT_REASON}\n`]);
    cases.push([["archive", "--project", "p", v], `theway: invalid change id '${v}': ${CHANGE_ID_REASON}\n`]);
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
  const res = run(data, "archive", "--project", "..", "victim");
  expect(res.status).toBe(1);
  expect(existsSync(victim)).toBe(true);
});

test("standards prints nothing and exits 0 for missing and empty folders", () => {
  const dir = home();
  for (const phase of ["engineering", "develop"]) {
    const res = run(dir, "standards", "--project", "p", phase);
    expect([res.status, res.stdout, res.stderr]).toEqual([0, "", ""]);
  }
  mkdirSync(join(dir, "standards"), { recursive: true });
  mkdirSync(join(dir, "projects", "p", "standards"), { recursive: true });
  for (const phase of ["engineering", "develop"]) {
    const res = run(dir, "standards", "--project", "p", phase);
    expect([res.status, res.stdout, res.stderr]).toEqual([0, "", ""]);
  }
});

test("standards prints global files before project files, each sorted, a project file replacing a global one for its phases", () => {
  const dir = home();
  const g = join(dir, "standards");
  const p = join(dir, "projects", "p", "standards");
  put(join(g, "zeta.md"), "# z\n");
  put(join(g, "alpha.md"), "# a\n");
  put(join(g, "tdd.md"), "# global tdd\n");
  put(join(g, "review.md"), "# global review\n");
  put(join(p, "tdd.md"), "# project tdd\n");
  put(join(p, "review.md"), "---\napplies_to: [develop]\n---\n# project review\n");
  put(join(p, "beta.md"), "# b\n");
  const eng = run(dir, "standards", "--project", "p", "engineering");
  expect(eng.status).toBe(0);
  expect(eng.stderr).toBe("");
  expect(eng.stdout).toBe(
    [join(g, "alpha.md"), join(g, "review.md"), join(g, "zeta.md"), join(p, "beta.md"), join(p, "tdd.md")]
      .map((l) => `${l}\n`)
      .join(""),
  );
  const dev = run(dir, "standards", "--project", "p", "develop");
  expect(dev.stdout).toBe(
    [join(g, "alpha.md"), join(g, "zeta.md"), join(p, "beta.md"), join(p, "review.md"), join(p, "tdd.md")]
      .map((l) => `${l}\n`)
      .join(""),
  );
  expect(run(dir, "standards", "--project", "other", "engineering").stdout).toBe(
    [join(g, "alpha.md"), join(g, "review.md"), join(g, "tdd.md"), join(g, "zeta.md")].map((l) => `${l}\n`).join(""),
  );
});

test("standards skips the files install ships into the global folder and their .default.md copies", () => {
  const dir = home();
  const g = join(dir, "standards");
  put(join(dir, ".shipped.json"), `${JSON.stringify({ "standards/sre.md": "x", "templates/tech-stack-template.md": "y" })}\n`);
  put(join(g, "sre.md"), "# shipped\n");
  put(join(g, "sre.default.md"), "# shipped default\n");
  put(join(g, "develop.default.md"), "# another default copy\n");
  put(join(g, "tdd.md"), "# yours\n");
  for (const phase of ["engineering", "develop"]) {
    const res = run(dir, "standards", "--project", "p", phase);
    expect([res.status, res.stdout, res.stderr]).toEqual([0, `${join(g, "tdd.md")}\n`, ""]);
  }
  put(join(dir, "projects", "p", "standards", "sre.md"), "# project sre\n");
  expect(run(dir, "standards", "--project", "p", "develop").stdout).toBe(`${join(g, "tdd.md")}\n`);
  put(join(dir, "projects", "p", "config.yaml"), "standards:\n  sre:\n    enabled: true\n");
  expect(run(dir, "standards", "--project", "p", "develop").stdout).toBe(`${join(g, "tdd.md")}\n${join(dir, "projects", "p", "standards", "sre.md")}\n`);
});

test("standards applies applies_to: none, both, a flow list of one phase, a block list of one phase", () => {
  const dir = home();
  const p = join(dir, "projects", "p", "standards");
  put(join(p, "a-none.md"), "# no frontmatter\n");
  put(join(p, "b-both.md"), "---\napplies_to: [engineering, develop]\n---\n");
  put(join(p, "c-flow-eng.md"), "---\ntitle: x\napplies_to: [engineering]\n---\n");
  put(join(p, "d-block-dev.md"), "---\napplies_to:\n  - develop\nother: y\n---\n");
  put(join(p, "e-nokey.md"), "---\ntitle: x\n---\n");
  const lines = (...names: string[]) => names.map((n) => `${join(p, n)}\n`).join("");
  const eng = run(dir, "standards", "--project", "p", "engineering");
  expect([eng.status, eng.stderr]).toEqual([0, ""]);
  expect(eng.stdout).toBe(lines("a-none.md", "b-both.md", "c-flow-eng.md", "e-nokey.md"));
  const dev = run(dir, "standards", "--project", "p", "develop");
  expect([dev.status, dev.stderr]).toEqual([0, ""]);
  expect(dev.stdout).toBe(lines("a-none.md", "b-both.md", "d-block-dev.md", "e-nokey.md"));
  const doc = run(dir, "standards", "--project", "p", "document");
  expect([doc.status, doc.stderr]).toEqual([0, ""]);
  expect(doc.stdout).toBe(lines("a-none.md", "e-nokey.md"));
});

test("standards applies applies_to: [document] to document only", () => {
  const dir = home();
  const file = join(dir, "projects", "p", "standards", "docs.md");
  put(file, "---\napplies_to: [document]\n---\n");
  for (const [phase, stdout] of [
    ["engineering", ""],
    ["develop", ""],
    ["document", `${file}\n`],
  ] as const) {
    const res = run(dir, "standards", "--project", "p", phase);
    expect([phase, res.status, res.stdout, res.stderr]).toEqual([phase, 0, stdout, ""]);
  }
});

test("standards lists a file with an invalid applies_to for no phase, with a warning", () => {
  const dir = home();
  const file = join(dir, "projects", "p", "standards", "x.md");
  put(file, "---\napplies_to: [review]\n---\n");
  for (const phase of ["engineering", "develop", "document"]) {
    const res = run(dir, "standards", "--project", "p", phase);
    expect(res.status).toBe(0);
    expect(res.stdout).toBe("");
    expect(res.stderr).toBe(`theway: warning: ${file}: applies_to must list engineering, develop and/or document; skipped\n`);
  }
});

test("standards accepts any YAML list form of applies_to: quoted, with a trailing comment, a block list with a comment", () => {
  const dir = home();
  const p = join(dir, "projects", "p", "standards");
  put(join(p, "a-quoted.md"), '---\napplies_to: ["develop"]\n---\n');
  put(join(p, "b-comment.md"), "---\napplies_to: [develop] # comment\n---\n");
  put(join(p, "c-block.md"), "---\napplies_to:\n  # the phases\n  - develop\n---\n");
  put(join(p, "d-crlf.md"), "---\r\napplies_to: [develop]\r\n---\r\n");
  put(join(p, "e-empty.md"), "---\n---\n");
  const lines = (...names: string[]) => names.map((n) => `${join(p, n)}\n`).join("");
  const dev = run(dir, "standards", "--project", "p", "develop");
  expect([dev.status, dev.stdout, dev.stderr]).toEqual([0, lines("a-quoted.md", "b-comment.md", "c-block.md", "d-crlf.md", "e-empty.md"), ""]);
  for (const phase of ["engineering", "document"]) {
    const res = run(dir, "standards", "--project", "p", phase);
    expect([phase, res.status, res.stdout, res.stderr]).toEqual([phase, 0, lines("e-empty.md"), ""]);
  }
});

test("standards warns on invalid YAML front matter that sets applies_to, and applies one that does not to every phase", () => {
  const dir = home();
  const p = join(dir, "projects", "p", "standards");
  const bad = join(p, "a-bad.md");
  put(bad, "---\napplies_to: [develop\n---\n");
  put(join(p, "b-nokey.md"), "---\ntitle: a: b\n---\n");
  for (const phase of ["engineering", "develop", "document"]) {
    const res = run(dir, "standards", "--project", "p", phase);
    expect([phase, res.status, res.stdout, res.stderr]).toEqual([
      phase,
      0,
      `${join(p, "b-nokey.md")}\n`,
      `theway: warning: ${bad}: applies_to must list engineering, develop and/or document; skipped\n`,
    ]);
  }
});

test.skipIf(process.getuid?.() === 0)("standards skips an unreadable file with a warning and lists the others", () => {
  const dir = home();
  const p = join(dir, "projects", "p", "standards");
  put(join(p, "a.md"), "x\n");
  put(join(p, "b.md"), "x\n");
  put(join(p, "c.md"), "x\n");
  chmodSync(join(p, "b.md"), 0o000);
  for (const phase of ["engineering", "develop"]) {
    const res = run(dir, "standards", "--project", "p", phase);
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
  put(join(dir, "projects", "p", "standards", "sub", "nested.md"), "x\n");
  put(join(dir, "projects", "p", "standards", "keep.md"), "x\n");
  const res = run(dir, "standards", "--project", "p", "develop");
  expect([res.status, res.stdout, res.stderr]).toEqual([0, `${join(dir, "projects", "p", "standards", "keep.md")}\n`, ""]);
});

test("standards exits 1 for an invalid project or an invalid phase", () => {
  const dir = home();
  put(join(dir, "standards", "g.md"), "x\n");
  const cases: [string[], string][] = [
    [["--project", "a/b", "develop"], `theway: invalid project 'a/b': ${PROJECT_REASON}\n`],
    [["--project", "..", "develop"], `theway: invalid project '..': ${PROJECT_REASON}\n`],
    [["--project", "", "develop"], `theway: invalid project '': ${PROJECT_REASON}\n`],
    [["--project", "a/b", "review"], `theway: invalid project 'a/b': ${PROJECT_REASON}\n`],
    [["--project", "p", "review"], "theway: invalid phase 'review': must be engineering, develop or document\n"],
  ];
  for (const [args, stderr] of cases) {
    const res = run(dir, "standards", ...args);
    expect(res.status).toBe(1);
    expect(res.stdout).toBe("");
    expect(res.stderr).toBe(stderr);
  }
});

test("standards reads a project named data, templates or standards from its own folder under projects/", () => {
  const dir = home();
  const g = join(dir, "standards");
  put(join(g, "g.md"), "x\n");
  for (const project of ["data", "templates", "standards"]) {
    const own = join(dir, "projects", project, "standards", "own.md");
    put(own, "x\n");
    put(join(dir, project, "standards", "old.md"), "x\n");
    const eng = run(dir, "standards", "--project", project, "engineering");
    expect([eng.status, eng.stdout, eng.stderr]).toEqual([0, `${join(g, "g.md")}\n${own}\n`, ""]);
  }
});

test("standards lists the enabled opt-in and user standards per phase, from the global and the project config", () => {
  const dir = home();
  const g = join(dir, "standards");
  const p = join(dir, "projects", "p", "standards");
  for (const name of ["interaction.md", "develop.md", "core-principles.md", "sre.md", "quality.md"]) {
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
  put(join(dir, "projects", "p", "config.yaml"), "standards:\n  quality:\n    enabled: false\n  sre:\n    enabled: true\n  gamma:\n    enabled: false\n");
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
    const res = run(dir, "standards", "--project", project, phase);
    expect([project, phase, res.status, res.stdout, res.stderr]).toEqual([project, phase, 0, stdout, ""]);
  }
});

test("standards takes a project sre.md as a user standard that the sre switch turns on, replacing the global one for its phases", () => {
  const dir = home();
  put(join(dir, "config.yaml"), readFileSync(join(import.meta.dirname, "..", "plugin", "home", "config.yaml"), "utf-8"));
  put(join(dir, "standards", "sre.md"), "# global sre\n");
  const own = join(dir, "projects", "p", "standards", "sre.md");
  put(own, "---\napplies_to: [develop]\n---\n");
  for (const phase of ["engineering", "develop", "document"]) {
    expect(run(dir, "standards", "--project", "p", phase).stdout).toBe("");
  }
  put(join(dir, "projects", "p", "config.yaml"), "standards:\n  sre:\n    enabled: true\n");
  expect(run(dir, "standards", "--project", "p", "develop").stdout).toBe(`${own}\n`);
  expect(run(dir, "standards", "--project", "p", "engineering").stdout).toBe(`${join(dir, "standards", "sre.md")}\n`);
  expect(run(dir, "standards", "--project", "p", "document").stdout).toBe(`${join(dir, "standards", "sre.md")}\n`);
  expect(run(dir, "standards", "--project", "other", "document").stdout).toBe("");
});

test("a project sre.md shadowing the global opt-in sre.md stays off with an empty config.yaml until the switch is on", () => {
  const dir = home();
  const global = join(dir, "standards", "sre.md");
  const own = join(dir, "projects", "p", "standards", "sre.md");
  put(join(dir, "config.yaml"), "");
  put(global, "# global sre\n");
  put(own, "---\napplies_to: [develop]\n---\n# project sre\n");
  for (const phase of ["engineering", "develop", "document"]) {
    const res = run(dir, "standards", "--project", "p", phase);
    expect([phase, res.status, res.stdout, res.stderr]).toEqual([phase, 0, "", ""]);
  }
  const off = run(dir, "config", "--project", "p");
  expect([off.status, off.stdout, off.stderr]).toEqual([0, effective(), ""]);
  put(join(dir, "projects", "p", "config.yaml"), "standards:\n  sre:\n    enabled: true\n");
  for (const [phase, stdout] of [
    ["engineering", `${global}\n`],
    ["develop", `${own}\n`],
    ["document", `${global}\n`],
  ] as const) {
    const res = run(dir, "standards", "--project", "p", phase);
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
    const res = run(dir, "standards", "--project", "p", phase);
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
    const res = run(dir, "standards", "--project", "p", phase);
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
    const res = run(dir, "standards", "--project", "p", phase);
    expect([phase, res.status, res.stdout, res.stderr]).toEqual([phase, 0, stdout, ""]);
  }
});

test("standards replaces an enabled global sre.md by a project sre.md with applies_to: [develop] for develop only", () => {
  const dir = home();
  const global = join(dir, "standards", "sre.md");
  const own = join(dir, "projects", "p", "standards", "sre.md");
  put(global, "# global sre\n");
  put(own, "---\napplies_to: [develop]\n---\n# project sre\n");
  put(join(dir, "config.yaml"), "standards:\n  sre:\n    enabled: true\n");
  for (const [phase, stdout] of [
    ["engineering", `${global}\n`],
    ["develop", `${own}\n`],
    ["document", `${global}\n`],
  ] as const) {
    const res = run(dir, "standards", "--project", "p", phase);
    expect([phase, res.status, res.stdout, res.stderr]).toEqual([phase, 0, stdout, ""]);
  }
});

test("standards exits 1 with config's message for invalid YAML in either config", () => {
  const dir = home();
  put(join(dir, "standards", "tdd.md"), "x\n");
  put(join(dir, "projects", "p", "config.yaml"), "standards:\n  sre: 1\n  sre: 2\n");
  const res = run(dir, "standards", "--project", "p", "engineering");
  expect([res.status, res.stdout, res.stderr]).toEqual([
    1,
    "",
    "theway: projects/p/config.yaml: invalid YAML: Map keys must be unique at line 3, column 3\n",
  ]);
  put(join(dir, "config.yaml"), "a: [1\n");
  const bad = run(dir, "standards", "--project", "other", "develop");
  expect([bad.status, bad.stdout, bad.stderr]).toEqual([
    1,
    "",
    "theway: config.yaml: invalid YAML: Flow sequence in block collection must be sufficiently indented and end with a ] at line 2, column 1\n",
  ]);
});

/** The effective config `theway config` prints, from the defaults with `over` replacing leaves and `defaults` the workflow.defaults lines. */
function effective(over: Record<string, string> = {}, user: [string, boolean][] = [], defaults: string[] = ["  defaults: {}"]): string {
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
    "workflow:",
    ...defaults,
    "",
  ].join("\n");
}

/** Copies the shipped step files into a home, so that workflow.defaults names steps that resolve. */
function seedSteps(dir: string): void {
  for (const n of ["implement", "review", "pr"]) {
    put(join(dir, "steps", `${n}.yaml`), readFileSync(join(import.meta.dirname, "..", "plugin", "home", "steps", `${n}.yaml`), "utf-8"));
  }
}

test("config prints the global values, defaults for the keys it lacks, every key in schema order", () => {
  const dir = home();
  seedSteps(dir);
  put(
    join(dir, "config.yaml"),
    "# c\nworkflow:\n  defaults:\n    pr:\n      model: opus\n    review:\n      lenses: [security, correctness]\nstandards:\n  sre:\n    enabled: true\n",
  );
  const res = run(dir, "config", "--project", "p");
  expect([res.status, res.stderr]).toEqual([0, ""]);
  expect(res.stdout).toBe(
    effective({ "standards.sre.enabled": "true" }, [], [
      "  defaults:",
      "    pr:",
      "      model: opus",
      "    review:",
      "      lenses:",
      "        - security",
      "        - correctness",
    ]),
  );
});

test("config merges workflow.defaults per param, the project file over the global one, and prints {} when no file sets any", () => {
  const dir = home();
  seedSteps(dir);
  put(join(dir, "config.yaml"), "");
  expect(run(dir, "config", "--project", "p").stdout).toBe(effective());
  put(
    join(dir, "config.yaml"),
    "workflow:\n  defaults:\n    pr:\n      ci_attempts: 5\n      model: haiku\n    review:\n      lenses: [conformance]\n",
  );
  put(
    join(dir, "projects", "p", "config.yaml"),
    "standards:\n  quality:\n    enabled: true\nworkflow:\n  defaults:\n    pr:\n      ci_attempts: 1\n    implement:\n      model: sonnet\n",
  );
  const res = run(dir, "config", "--project", "p");
  expect([res.status, res.stderr]).toEqual([0, ""]);
  expect(res.stdout).toBe(
    effective({ "standards.quality.enabled": "true" }, [], [
      "  defaults:",
      "    pr:",
      "      ci_attempts: 1",
      "      model: haiku",
      "    review:",
      "      lenses:",
      "        - conformance",
      "    implement:",
      "      model: sonnet",
    ]),
  );
  expect(run(dir, "config", "--project", "other").stdout).toBe(
    effective({}, [], [
      "  defaults:",
      "    pr:",
      "      ci_attempts: 5",
      "      model: haiku",
      "    review:",
      "      lenses:",
      "        - conformance",
    ]),
  );
});

test("config warns about a workflow.defaults value of another shape and drops it, and about a step that does not resolve", () => {
  const dir = home();
  seedSteps(dir);
  put(
    join(dir, "config.yaml"),
    "workflow:\n  defaults:\n    pr:\n      ci_attempts: 1.5\n    review: 3\n    reviews:\n      rounds: 2\n    deploy:\n      model: opus\n    agent:\n      model: sonnet\n",
  );
  put(join(dir, "projects", "p", "config.yaml"), "workflow:\n  defaults:\n    review:\n      lenses: [a, a]\n      rounds: {x: 1}\n      model: opus\n");
  const res = run(dir, "config", "--project", "p");
  expect(res.status).toBe(0);
  expect(res.stdout).toBe(
    effective({}, [], [
      "  defaults:",
      "    pr: {}",
      "    review:",
      "      model: opus",
    ]),
  );
  const steps = `${join(dir, "projects", "p", "steps")} or ${join(dir, "steps")}`;
  const list = "a non-empty list of names without duplicates";
  expect(res.stderr).toBe(
    [
      `theway: warning: config.yaml: workflow.defaults.pr.ci_attempts must be a string, an integer, a boolean or ${list}; ignored`,
      "theway: warning: config.yaml: workflow.defaults.review must be a map; ignored",
      `theway: warning: projects/p/config.yaml: workflow.defaults.review.lenses must be a string, an integer, a boolean or ${list}; ignored`,
      `theway: warning: projects/p/config.yaml: workflow.defaults.review.rounds must be a string, an integer, a boolean or ${list}; ignored`,
      `theway: warning: config.yaml: workflow.defaults.reviews: no step 'reviews' in ${steps}; did you mean 'review'?; ignored`,
      `theway: warning: config.yaml: workflow.defaults.deploy: no step 'deploy' in ${steps} (steps: implement, pr, review); ignored`,
      `theway: warning: config.yaml: workflow.defaults.agent: no step 'agent' in ${steps} (steps: implement, pr, review); ignored`,
      "",
    ].join("\n"),
  );
});

test("config warns about the removed workflow keys as unknown keys and keeps the defaults", () => {
  const dir = home();
  put(join(dir, "config.yaml"), "workflow:\n  review_rounds: 2\n  ci_attempts: 3\n  open_pr: false\n  models:\n    implementer: sonnet\n");
  const res = run(dir, "config", "--project", "p");
  expect([res.status, res.stdout]).toEqual([0, effective()]);
  expect(res.stderr).toBe(
    [
      "theway: warning: config.yaml: unknown key workflow.review_rounds; ignored",
      "theway: warning: config.yaml: unknown key workflow.ci_attempts; ignored",
      "theway: warning: config.yaml: unknown key workflow.open_pr; ignored",
      "theway: warning: config.yaml: unknown key workflow.models; ignored",
      "",
    ].join("\n"),
  );
});

test("config warns about the removed engineering section and the retired engineering standards as unknown, and keeps the defaults", () => {
  const dir = home();
  put(join(dir, "config.yaml"), "engineering:\n  review:\n    rounds: 2\n    model: sonnet\n");
  put(
    join(dir, "projects", "p", "config.yaml"),
    "standards:\n  tamm_framework:\n    enabled: true\n  spec_review:\n    enabled: true\n  spec_investigation:\n    enabled: false\n",
  );
  const res = run(dir, "config", "--project", "p");
  expect([res.status, res.stdout]).toEqual([0, effective()]);
  expect(res.stderr).toBe(
    [
      "theway: warning: config.yaml: unknown key engineering; ignored",
      "theway: warning: projects/p/config.yaml: standards.tamm_framework has no standard file; ignored",
      "theway: warning: projects/p/config.yaml: standards.spec_review has no standard file; ignored",
      "theway: warning: projects/p/config.yaml: standards.spec_investigation has no standard file; ignored",
      "",
    ].join("\n"),
  );
});

test("config ignores an unknown key once at its highest level, a section that is not a map, and a root that is not a map", () => {
  const dir = home();
  put(join(dir, "config.yaml"), "changes:\n  a: 1\n  b: 2\nworkflow:\n  extra: 1\n  defaults: opus\n");
  put(join(dir, "projects", "p", "config.yaml"), "- workflow\n");
  const res = run(dir, "config", "--project", "p");
  expect(res.status).toBe(0);
  expect(res.stdout).toBe(effective());
  expect(res.stderr).toBe(
    [
      "theway: warning: config.yaml: unknown key changes; ignored",
      "theway: warning: config.yaml: unknown key workflow.extra; ignored",
      "theway: warning: config.yaml: workflow.defaults must be a map; ignored",
      "theway: warning: projects/p/config.yaml: not a map; ignored",
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
    put(join(dir, "projects", "p", "config.yaml"), project as string);
    const res = run(dir, "config", "--project", "p");
    expect([res.status, res.stdout, res.stderr]).toEqual([0, effective(), ""]);
  }
});

test("config exits 1 with nothing on stdout for an invalid project, a missing global file or invalid YAML", () => {
  const missing = home();
  const cases: [string, string, string][] = [
    [missing, "../x", `theway: invalid project '../x': ${PROJECT_REASON}\n`],
    [missing, "p", `theway: config.yaml not found in ${missing}; run npx --yes @pixelfactoryio/theway@latest install, then /reload-plugins\n`],
  ];
  const badGlobal = home();
  put(join(badGlobal, "config.yaml"), "a: [1\n");
  put(join(badGlobal, "projects", "p", "config.yaml"), "standards:\n  sre:\n    enabled: true\n");
  cases.push([
    badGlobal,
    "p",
    "theway: config.yaml: invalid YAML: Flow sequence in block collection must be sufficiently indented and end with a ] at line 2, column 1\n",
  ]);
  const badProject = home();
  put(join(badProject, "config.yaml"), "standards:\n  sre:\n    enabled: true\n");
  put(join(badProject, "projects", "p", "config.yaml"), "standards:\n  sre: 1\n  sre: 2\n");
  cases.push([
    badProject,
    "p",
    "theway: projects/p/config.yaml: invalid YAML: Map keys must be unique at line 3, column 3\n",
  ]);
  for (const [dir, project, stderr] of cases) {
    const res = run(dir, "config", "--project", project);
    expect([res.status, res.stdout, res.stderr]).toEqual([1, "", stderr]);
  }
});

test.skipIf(process.getuid?.() === 0)("config exits 1 with nothing on stdout for a project file that cannot be read", () => {
  const dir = home();
  put(join(dir, "config.yaml"), "standards:\n  sre:\n    enabled: true\n");
  put(join(dir, "projects", "p", "config.yaml"), "standards:\n  sre:\n    enabled: false\n");
  chmodSync(join(dir, "projects", "p", "config.yaml"), 0o000);
  const res = run(dir, "config", "--project", "p");
  expect([res.status, res.stdout, res.stderr]).toEqual([1, "", "theway: projects/p/config.yaml: cannot be read\n"]);
});

test("config prints only its own warning for a value yaml warns about", () => {
  const dir = home();
  put(join(dir, "config.yaml"), "standards:\n  sre:\n    enabled: !foo false\n");
  const res = run(dir, "config", "--project", "p");
  expect([res.status, res.stdout, res.stderr]).toEqual([
    0,
    effective(),
    "theway: warning: config.yaml: standards.sre.enabled must be true or false; ignored\n",
  ]);
});

test("config lists every switchable standard after the opt-in keys, with its effective value and its warnings", () => {
  const dir = home();
  const g = join(dir, "standards");
  put(join(dir, ".shipped.json"), `${JSON.stringify({ "standards/shipped.md": "x" })}\n`);
  for (const name of ["interaction.md", "develop.md", "sre.md", "shipped.md", "tdd.default.md"]) {
    put(join(g, name), "x\n");
  }
  for (const name of ["zeta.md", "alpha.md", "tdd.md", "a-b.md", "a_b.md"]) put(join(g, name), "x\n");
  put(join(g, "bad.md"), "---\napplies_to: [review]\n---\n");
  put(join(dir, "projects", "p", "standards", "beta.md"), "x\n");
  put(
    join(dir, "config.yaml"),
    "standards:\n  zeta:\n    enabled: false\n  nofile:\n    enabled: true\n  develop:\n    enabled: true\n",
  );
  put(
    join(dir, "projects", "p", "config.yaml"),
    "standards:\n  tdd:\n    enabled: false\n  sre:\n    enabled: true\n  interaction:\n    enabled: false\n  missing:\n    enabled: false\n",
  );
  const res = run(dir, "config", "--project", "p");
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
      "theway: warning: projects/p/config.yaml: standards.interaction cannot be switched; ignored",
      "theway: warning: projects/p/config.yaml: standards.missing has no standard file; ignored",
      "",
    ].join("\n"),
  );
  const other = run(dir, "config", "--project", "other");
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

test("config reads a project named data, templates or standards from its own folder under projects/", () => {
  const dir = home();
  put(join(dir, "standards", "g.md"), "x\n");
  put(join(dir, "config.yaml"), "");
  for (const project of ["data", "templates", "standards"]) {
    put(join(dir, "projects", project, "standards", "own.md"), "x\n");
    put(join(dir, "projects", project, "config.yaml"), "standards:\n  g:\n    enabled: false\n  own:\n    enabled: false\n  gone:\n    enabled: true\n");
    const res = run(dir, "config", "--project", project);
    expect(res.status).toBe(0);
    expect(res.stdout).toBe(effective({}, [["g", false], ["own", false]]));
    expect(res.stderr).toBe(`theway: warning: projects/${project}/config.yaml: standards.gone has no standard file; ignored\n`);
  }
});

test("a project file with a core name is a user standard that the project config switches", () => {
  const dir = home();
  const g = join(dir, "standards");
  for (const name of ["interaction.md", "develop.md"]) put(join(g, name), "x\n");
  const own = join(dir, "projects", "p", "standards", "develop.md");
  put(own, "---\napplies_to: [develop]\n---\n");
  put(join(dir, "config.yaml"), "");
  const on = run(dir, "config", "--project", "p");
  expect([on.status, on.stdout, on.stderr]).toEqual([0, effective({}, [["develop", true]]), ""]);
  expect(run(dir, "standards", "--project", "p", "develop").stdout).toBe(`${own}\n`);
  put(join(dir, "projects", "p", "config.yaml"), "standards:\n  develop:\n    enabled: false\n");
  const off = run(dir, "config", "--project", "p");
  expect([off.status, off.stdout, off.stderr]).toEqual([0, effective({}, [["develop", false]]), ""]);
  const res = run(dir, "standards", "--project", "p", "develop");
  expect([res.status, res.stdout, res.stderr]).toEqual([0, "", ""]);
  put(join(dir, "projects", "q", "config.yaml"), "standards:\n  develop:\n    enabled: false\n");
  const other = run(dir, "config", "--project", "q");
  expect([other.status, other.stdout, other.stderr]).toEqual([
    0,
    effective(),
    "theway: warning: projects/q/config.yaml: standards.develop cannot be switched; ignored\n",
  ]);
});

test("standards does not list the global interaction.md and develop.md, which .shipped.json does not list", () => {
  const dir = home();
  const g = join(dir, "standards");
  put(join(dir, ".shipped.json"), "{}\n");
  for (const name of ["interaction.md", "develop.md", "own.md"]) put(join(g, name), "x\n");
  put(join(dir, "config.yaml"), "");
  const res = run(dir, "standards", "--project", "p", "engineering");
  expect([res.status, res.stdout, res.stderr]).toEqual([0, `${join(g, "own.md")}\n`, ""]);
});

test("standards named like Object.prototype keys are listed and switched like any other", () => {
  const dir = home();
  const g = join(dir, "standards");
  const names = ["__proto__.md", "constructor.md", "toString.md"];
  for (const name of names) put(join(g, name), "x\n");
  put(join(dir, "config.yaml"), "");
  const on = run(dir, "config", "--project", "p");
  expect([on.status, on.stdout, on.stderr]).toEqual([
    0,
    effective({}, [
      ["__proto__", true],
      ["constructor", true],
      ["toString", true],
    ]),
    "",
  ]);
  const all = run(dir, "standards", "--project", "p", "engineering");
  expect([all.status, all.stdout, all.stderr]).toEqual([0, names.map((n) => `${join(g, n)}\n`).join(""), ""]);
  put(join(dir, "config.yaml"), "standards:\n  __proto__:\n    enabled: false\n");
  const off = run(dir, "config", "--project", "p");
  expect([off.status, off.stdout, off.stderr]).toEqual([
    0,
    effective({}, [
      ["__proto__", false],
      ["constructor", true],
      ["toString", true],
    ]),
    "",
  ]);
  const res = run(dir, "standards", "--project", "p", "engineering");
  expect([res.status, res.stdout, res.stderr]).toEqual([0, `${join(g, "constructor.md")}\n${join(g, "toString.md")}\n`, ""]);
});

test("a user standard sharing an opt-in key defaults to false with it", () => {
  const dir = home();
  const g = join(dir, "standards");
  put(join(g, "web-development.md"), "x\n");
  const own = join(g, "web_development.md");
  put(own, "x\n");
  put(join(dir, "config.yaml"), "");
  const res = run(dir, "config", "--project", "p");
  expect([res.status, res.stdout, res.stderr]).toEqual([0, effective(), ""]);
  expect(run(dir, "standards", "--project", "p", "engineering").stdout).toBe("");
  put(join(dir, "config.yaml"), "standards:\n  web_development:\n    enabled: true\n");
  expect(run(dir, "standards", "--project", "p", "engineering").stdout).toBe(`${join(g, "web-development.md")}\n${own}\n`);
});

test("context prints home, project, project_dir, change_dir, standards and config in that order, matching path, project, standards and config", () => {
  const dir = home();
  put(join(dir, "config.yaml"), "standards:\n  sre:\n    enabled: false\n");
  put(join(dir, "standards", "tdd.md"), "# tdd\n");
  const res = run(dir, "context", "--project", "p", "develop", "add-x");
  expect(res.status).toBe(0);
  const doc = Bun.YAML.parse(res.stdout) as Record<string, unknown>;
  expect(Object.keys(doc)).toEqual(["home", "project", "project_dir", "change_dir", "standards", "config"]);
  expect(doc.home).toBe(run(dir, "path").stdout.trim());
  expect(`key: ${doc.project}\ndir: ${doc.project_dir}\n`).toBe(run(dir, "project", "--project", "p").stdout);
  expect(doc.project_dir).toBe(join(dir, "projects", "p"));
  expect(doc.change_dir).toBe(run(dir, "path", "--project", "p", "add-x").stdout.trim());
  expect(doc.standards).toEqual(run(dir, "standards", "--project", "p", "develop").stdout.split("\n").filter((l) => l !== ""));
  expect(doc.standards).toEqual([join(dir, "standards", "tdd.md")]);
  expect(doc.config).toEqual(Bun.YAML.parse(run(dir, "config", "--project", "p").stdout));
});

test("context has no change_dir without a change id and prints standards: [] when none apply", () => {
  const dir = home();
  put(join(dir, "config.yaml"), "");
  put(join(dir, "standards", "tdd.md"), "---\napplies_to: [develop]\n---\n# tdd\n");
  const res = run(dir, "context", "--project", "p", "document");
  expect(res.status).toBe(0);
  expect(res.stdout).toStartWith(`home: ${dir}\nproject: p\nproject_dir: ${join(dir, "projects", "p")}\nstandards: []\nconfig:\n`);
  expect(Object.keys(Bun.YAML.parse(res.stdout) as object)).toEqual(["home", "project", "project_dir", "standards", "config"]);
});

test("context writes config's warnings once and exits 1 on the missing config, an invalid project, phase or change id", () => {
  const dir = home();
  const missing = run(dir, "context", "--project", "p", "engineering");
  expect(missing.status).toBe(1);
  expect(missing.stdout).toBe("");
  expect(missing.stderr).toBe(
    `theway: config.yaml not found in ${dir}; run npx --yes @pixelfactoryio/theway@latest install, then /reload-plugins\n`,
  );
  put(join(dir, "config.yaml"), "bogus: 1\n");
  const warned = run(dir, "context", "--project", "p", "engineering");
  expect(warned.status).toBe(0);
  expect(warned.stderr).toBe("theway: warning: config.yaml: unknown key bogus; ignored\n");
  for (const [args, line] of [
    [["--project", "Bad/p", "develop"], "theway: invalid project 'Bad/p': "],
    [["--project", "Bad/p", "deploy"], "theway: invalid project 'Bad/p': "],
    [["--project", "p", "deploy"], "theway: invalid phase 'deploy': must be engineering, develop or document\n"],
    [["--project", "p", "deploy", "Add_X"], "theway: invalid phase 'deploy': "],
    [["--project", "p", "develop", "Add_X"], "theway: invalid change id 'Add_X': "],
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
  expect(run(dir, "next-id", "--project", "p", "add-thing").stdout).toBe("add-thing-01\n");
  const changes = join(dir, "projects", "p", "changes");
  mkdirSync(join(changes, "add-thing-01"), { recursive: true });
  mkdirSync(join(changes, "archive", "2026-01-01-add-thing-03"), { recursive: true });
  mkdirSync(join(changes, "add-other-thing-09"), { recursive: true });
  mkdirSync(join(changes, "archive", "2026-01-01-add-other-thing-08"), { recursive: true });
  put(join(changes, "add-thing-12"), "a file, not a member\n");
  const res = run(dir, "next-id", "--project", "p", "add-thing", "--count", "2");
  expect(res.status).toBe(0);
  expect(res.stdout).toBe("add-thing-04\nadd-thing-05\n");
  expect(run(dir, "next-id", "--project", "p", "add-thing-07").stdout).toBe("add-thing-04\n");
  expect(run(dir, "next-id", "--project", "p", "add-thing", "--count", "3").stdout).toBe("add-thing-04\nadd-thing-05\nadd-thing-06\n");
});

test("next-id exits 1 on an invalid series id, a bad --count and past -99", () => {
  const dir = home();
  const bad = run(dir, "next-id", "--project", "p", "Add-thing");
  expect(bad.status).toBe(1);
  expect(bad.stdout).toBe("");
  expect(bad.stderr).toBe("invalid change id 'Add-thing': uppercase letters are not allowed; use lowercase kebab-case\n");
  const ordinal = run(dir, "next-id", "--project", "p", "add-thing-01-02");
  expect(ordinal.status).toBe(1);
  expect(ordinal.stderr).toBe("invalid change id 'add-thing-01': ends in a number (-01); a series id cannot end in a number\n");
  const number = run(dir, "next-id", "--project", "p", "add-thing-7");
  expect(number.status).toBe(1);
  expect(number.stderr).toBe("invalid change id 'add-thing-7': ends in a number (-7); a series id cannot end in a number\n");
  const twoDigits = run(dir, "next-id", "--project", "p", "add-thing-42-05");
  expect(twoDigits.stderr).toBe("invalid change id 'add-thing-42': ends in a number (-42); a series id cannot end in a number\n");
  for (const res of [bad, ordinal, number, twoDigits]) expect(res.stderr).not.toContain("--series");
  expect(run(dir, "next-id", "--project", "Bad/p", "add-thing").stderr).toStartWith("theway: invalid project 'Bad/p': ");
  for (const count of ["0", "-1", "1.5", "x"]) {
    const res = run(dir, "next-id", "--project", "p", "add-thing", "--count", count);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("must be a positive integer");
  }
  mkdirSync(join(dir, "projects", "p", "changes", "add-thing-98"), { recursive: true });
  expect(run(dir, "next-id", "--project", "p", "add-thing").stdout).toBe("add-thing-99\n");
  const past = run(dir, "next-id", "--project", "p", "add-thing", "--count", "2");
  expect(past.status).toBe(1);
  expect(past.stdout).toBe("");
  expect(past.stderr).toBe("theway: series add-thing would go past -99\n");
});

const SHIPPED_HOME = join(import.meta.dirname, "..", "plugin", "home");
const shippedText = (rel: string) => readFileSync(join(SHIPPED_HOME, rel), "utf-8");
const WF_HEAD = "version: theway.workflow/v1\n";
const STEP_HEAD = "version: theway.step/v1\n";
const PROMPTS = ["implement", "reviewer", "conformance", "correctness", "verdicts", "triage", "fix", "fix-check", "open-pr", "ci-wait", "ci-diagnose", "ci-fix"];

/**
 * A home with an empty global config, the two convention standards, the shipped steps and prompts, and a
 * `develop.yaml` holding the steps of the shipped `agents.yaml`.
 */
function workflowHome(): string {
  const dir = home();
  put(join(dir, "config.yaml"), "");
  put(join(dir, "standards", "commits.md"), "# commits\n");
  put(join(dir, "standards", "git-host.md"), "# git host\n");
  for (const n of ["implement", "review", "pr"]) put(join(dir, "steps", `${n}.yaml`), shippedText(`steps/${n}.yaml`));
  for (const n of PROMPTS) put(join(dir, "prompts", `${n}.md`), `# ${n}\n`);
  put(join(dir, "workflows", "develop.yaml"), `${WF_HEAD}steps:\n  - implement:\n  - review:\n  - pr:\n`);
  return dir;
}

/** A home holding the shipped config, convention standards, workflows, steps and prompts. */
function shippedHome(): string {
  const dir = home();
  for (const rel of ["config.yaml", "standards/commits.md", "standards/git-host.md"]) put(join(dir, rel), shippedText(rel));
  for (const folder of ["workflows", "steps", "prompts"]) {
    for (const f of readdirSync(join(SHIPPED_HOME, folder))) put(join(dir, folder, f), shippedText(`${folder}/${f}`));
  }
  return dir;
}

/** The fixture of the shipped `engineering` workflow, with `<home>` replaced by `dir`. */
const engineeringJson = (dir: string): string =>
  `${JSON.stringify(JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "engineering-workflow.json"), "utf-8").replaceAll("<home>", dir)), null, 2)}\n`;

/** The fixture of the shipped `agents` workflow, with `<home>` replaced by `dir`, its file by `file` and its description by `description`. */
function agentsJson(dir: string, file = join(dir, "workflows", "agents.yaml"), name = "agents", description?: string | null): string {
  const doc = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "agents-workflow.json"), "utf-8").replaceAll("<home>", dir));
  return `${JSON.stringify({ ...doc, name, description: description === undefined ? doc.description : description, file }, null, 2)}\n`;
}

type Doc = { description: string | null; steps: Record<string, unknown>[]; pushes: boolean; working_tree: boolean };
const workflowDoc = (dir: string, ...args: string[]): Doc => JSON.parse(run(dir, "workflow", "--project", "p", ...args).stdout) as Doc;

test("workflow prints the shipped agents, matching the fixture: foreach expanded, absolute prompts, every field filled and pushes", () => {
  const dir = shippedHome();
  const res = run(dir, "workflow", "--project", "theway", "agents");
  expect([res.status, res.stdout, res.stderr]).toEqual([0, agentsJson(dir), ""]);
  const doc = JSON.parse(res.stdout);
  expect(Object.keys(doc)).toEqual(["name", "description", "file", "input", "commits", "git_host", "pushes", "working_tree", "steps"]);
  expect([doc.pushes, doc.working_tree]).toEqual([true, false]);
  expect(doc.description).toBe("Implement, review and open the PR through agents");
});

test("workflow prints description null for a file without one, and the description a file sets", () => {
  const dir = workflowHome();
  put(join(dir, "workflows", "plain.yaml"), `${WF_HEAD}steps:\n  - implement:\n`);
  expect(workflowDoc(dir, "plain").description).toBeNull();
  put(join(dir, "workflows", "said.yaml"), `${WF_HEAD}description: Implement only\nsteps:\n  - implement:\n`);
  expect(workflowDoc(dir, "said").description).toBe("Implement only");
});

test("workflow prints the shipped engineering workflows: input request, nothing pushed, scaffold inline and spec-review through agents", () => {
  const dir = shippedHome();
  const res = run(dir, "workflow", "--project", "theway", "engineering");
  expect([res.status, res.stdout, res.stderr]).toEqual([0, engineeringJson(dir), ""]);
  const doc = JSON.parse(res.stdout);
  expect([doc.input, doc.pushes, doc.working_tree]).toEqual(["request", false, false]);
  expect(doc.steps.map((s: { id: string; agents: boolean }) => [s.id, s.agents])).toEqual([
    ["scaffold", false],
    ["spec-review", true],
  ]);
  const light = run(dir, "workflow", "--project", "theway", "engineering-light");
  expect([light.status, light.stderr]).toEqual([0, ""]);
  const lightDoc = JSON.parse(light.stdout);
  expect([lightDoc.input, lightDoc.pushes, lightDoc.working_tree]).toEqual(["request", false, false]);
  expect(lightDoc.steps[0].do[0].agent).toEqual({
    name: "scaffold-light",
    label: "scaffold-light:scaffold-light",
    prompt: ["tamm-framework", "spec-investigation", "scaffold-rules", "light-spec-template", "tasks-template", "scaffold-light"].map((n) =>
      join(dir, "prompts", `${n}.md`),
    ),
    returns: "scaffold",
    access: "spec",
  });
  // The light review: one grounding critic, and the escalation message as the block.
  const review = JSON.parse(JSON.stringify(doc.steps[1]));
  review.params.lenses = { value: ["grounding"], from: "workflows/engineering-light.yaml steps[1]" };
  const message = "escalated: run /theway:engineering <change-id>: <request> without --light";
  review.params.on_decision = { value: message, from: "workflows/engineering-light.yaml steps[1]" };
  review.do[0].loop.do[0].parallel = review.do[0].loop.do[0].parallel.slice(0, 1);
  review.do[0].loop.do[3].block = message;
  expect(lightDoc.steps[1]).toEqual(review);
  // workflow.defaults.spec-review sets the rounds.
  put(join(dir, "projects", "theway", "config.yaml"), "workflow:\n  defaults:\n    spec-review: {rounds: 2}\n");
  const two = JSON.parse(run(dir, "workflow", "--project", "theway", "engineering").stdout);
  expect([two.steps[1].params.rounds, two.steps[1].do[0].loop.max]).toEqual([{ value: 2, from: "projects/theway/config.yaml" }, 2]);
});

test("workflow resolves the shipped develop, the fallback default, to one inline work agent: a working-tree workflow", () => {
  const dir = shippedHome();
  const res = run(dir, "workflow", "--project", "theway");
  expect([res.status, res.stderr]).toEqual([0, ""]);
  const doc = JSON.parse(res.stdout);
  expect([doc.name, doc.pushes, doc.working_tree]).toEqual(["develop", false, true]);
  expect(doc.steps).toEqual([
    {
      id: "implement",
      step: "implement",
      agents: false,
      file: join(dir, "steps", "implement.yaml"),
      description: "Implement the change's tasks as its spec says",
      params: {},
      do: [
        {
          agent: {
            name: "implement",
            label: "implement:implement",
            prompt: [join(dir, "prompts", "implement.md")],
            returns: "work",
            access: "commit",
          },
        },
      ],
    },
  ]);
  expect(run(dir, "workflow", "--project", "theway", "develop").stdout).toBe(res.stdout);
});

test("workflow prints develop when no file sets default: true", () => {
  const dir = workflowHome();
  const res = run(dir, "workflow", "--project", "p");
  expect([res.status, res.stdout, res.stderr]).toEqual([0, agentsJson(dir, join(dir, "workflows", "develop.yaml"), "develop", null), ""]);
});

test("workflow takes each param from the entry, else the project config, else the global config, else the step file, and prints from", () => {
  const dir = workflowHome();
  put(join(dir, "config.yaml"), "workflow:\n  defaults:\n    review:\n      rounds: 3\n      model: sonnet\n      fix_model: haiku\n    pr:\n      ci_attempts: 4\n");
  put(join(dir, "projects", "p", "config.yaml"), "workflow:\n  defaults:\n    review:\n      rounds: 2\n      lenses: [correctness]\n");
  put(join(dir, "workflows", "w.yaml"), `${WF_HEAD}steps:\n  - implement:\n  - review: {fix_model: opus}\n  - pr:\n`);
  const res = run(dir, "workflow", "--project", "p", "w");
  expect([res.status, res.stderr]).toEqual([0, ""]);
  const steps = JSON.parse(res.stdout).steps;
  expect(steps[1].params).toEqual({
    rounds: { value: 2, from: "projects/p/config.yaml" },
    lenses: { value: ["correctness"], from: "projects/p/config.yaml" },
    model: { value: "sonnet", from: "config.yaml" },
    fix_model: { value: "opus", from: "workflows/w.yaml steps[1]" },
  });
  expect(steps[2].params.ci_attempts).toEqual({ value: 4, from: "config.yaml" });
  expect(steps[2].params.model).toEqual({ value: "sonnet", from: "steps/pr.yaml" });
  const loop = steps[1].do[0].loop;
  expect(loop.max).toBe(2);
  expect(loop.do[0].parallel.map((n: { agent: { name: string; model: string } }) => [n.agent.name, n.agent.model])).toEqual([["correctness", "sonnet"]]);
  // The fix agent's model field references fix_model; the others inherit model.
  expect(loop.do[2].do.map((n: { agent: { name: string; model: string } }) => [n.agent.name, n.agent.model])).toEqual([
    ["fix", "opus"],
    ["fix-check", "sonnet"],
  ]);
  expect(JSON.parse(run(dir, "workflow", "--project", "other", "w").stdout).steps[1].params.rounds).toEqual({ value: 3, from: "config.yaml" });
});

test("workflow warns about a config default of another kind or an undeclared param, and falls back to the next source", () => {
  const dir = workflowHome();
  put(join(dir, "config.yaml"), "workflow:\n  defaults:\n    review:\n      rounds: 3\n      fix_model: [a]\n");
  put(join(dir, "projects", "p", "config.yaml"), "workflow:\n  defaults:\n    review:\n      rounds: two\n      round: 2\n      extra: x\n");
  const res = run(dir, "workflow", "--project", "p");
  expect(res.status).toBe(0);
  const review = JSON.parse(res.stdout).steps[1];
  expect([review.params.rounds, review.params.fix_model]).toEqual([
    { value: 3, from: "config.yaml" },
    { value: "opus", from: "steps/review.yaml" },
  ]);
  expect(res.stderr).toBe(
    [
      "theway: warning: config.yaml: workflow.defaults.review.fix_model must be a string; ignored",
      "theway: warning: projects/p/config.yaml: workflow.defaults.review.rounds must be an integer; ignored",
      "theway: warning: projects/p/config.yaml: workflow.defaults.review.round is not a param of review; did you mean 'rounds'?; ignored",
      "theway: warning: projects/p/config.yaml: workflow.defaults.review.extra is not a param of review (params: rounds, lenses, model, fix_model); ignored",
      "",
    ].join("\n"),
  );
});

test("workflow warns about a config default for a step that does not resolve, and about a reserved steps/gate.yaml", () => {
  const dir = workflowHome();
  put(join(dir, "config.yaml"), "workflow:\n  defaults:\n    agent:\n      model: sonnet\n    reveiw:\n      rounds: 2\n    implement: x\n");
  put(join(dir, "projects", "p", "steps", "gate.yaml"), `${STEP_HEAD}description: x\ndo:\n  - agent: {returns: work}\n`);
  const res = run(dir, "workflow", "--project", "p");
  expect([res.status, res.stdout]).toEqual([0, agentsJson(dir, join(dir, "workflows", "develop.yaml"), "develop", null)]);
  const steps = `${join(dir, "projects", "p", "steps")} or ${join(dir, "steps")}`;
  expect(res.stderr).toBe(
    [
      "theway: warning: config.yaml: workflow.defaults.implement must be a map; ignored",
      "theway: warning: projects/p/steps/gate.yaml: gate is reserved for the gate entry; ignored",
      `theway: warning: config.yaml: workflow.defaults.agent: no step 'agent' in ${steps} (steps: implement, pr, review); ignored`,
      `theway: warning: config.yaml: workflow.defaults.reveiw: no step 'reveiw' in ${steps}; did you mean 'review'?; ignored`,
      "",
    ].join("\n"),
  );
  expect(run(dir, "steps", "--project", "p").stderr).toBe(res.stderr);
});

test("workflow gives repeated entries the ids <id>-2, <id>-3 and their agents those labels, and runs a gate inline", () => {
  const dir = workflowHome();
  put(
    join(dir, "workflows", "w.yaml"),
    `${WF_HEAD}steps:\n  - implement:\n  - review:\n  - gate: Review again?\n  - review: {rounds: 2}\n  - gate: Open the PR?\n  - review:\n  - pr:\n`,
  );
  const res = run(dir, "workflow", "--project", "p", "w");
  expect([res.status, res.stderr]).toEqual([0, ""]);
  const steps = JSON.parse(res.stdout).steps;
  expect(steps.map((s: { id: string }) => s.id)).toEqual(["implement", "review", "gate", "review-2", "gate-2", "review-3", "pr"]);
  expect(steps[2]).toEqual({ id: "gate", gate: "Review again?", agents: false });
  expect(steps[3].do[0].loop.do[0].parallel[0].agent.label).toBe("review-2:conformance");
  expect(steps[5].do[0].loop.do[1].do[0].agent.label).toBe("review-3:triage");
});

test("workflow skips a generated id or agent name that a step or prompt already holds", () => {
  const dir = workflowHome();
  for (const n of ["a", "a-2", "review-2"]) put(join(dir, "prompts", `${n}.md`), `# ${n}\n`);
  put(join(dir, "steps", "review-2.yaml"), `${STEP_HEAD}description: x\ndo:\n  - agent: {returns: findings, prompt: [a, a, a-2]}\n`);
  put(join(dir, "steps", "names.yaml"), `${STEP_HEAD}description: x\ndo:\n  - foreach: [a, a, a-2]\n    do: [agent: {returns: findings, prompt: "\${item}"}]\n`);
  put(join(dir, "workflows", "w.yaml"), `${WF_HEAD}steps:\n  - review:\n  - review:\n  - review-2:\n  - names:\n`);
  const res = run(dir, "workflow", "--project", "p", "w");
  expect([res.status, res.stderr]).toEqual([0, ""]);
  const steps = JSON.parse(res.stdout).steps;
  expect(steps.map((s: { id: string }) => s.id)).toEqual(["review", "review-3", "review-2", "names"]);
  expect(steps[1].do[0].loop.do[0].parallel[0].agent.label).toBe("review-3:conformance");
  expect(steps[2].do[0].agent.label).toBe("review-2:a-2");
  expect(steps[3].do.map((n: { agent: { name: string } }) => n.agent.name)).toEqual(["a", "a-3", "a-2"]);
});

test("workflow gives every step its own agents, else the top-level one, else true, and inline agents no model", () => {
  const dir = workflowHome();
  put(join(dir, "config.yaml"), "workflow:\n  defaults:\n    implement:\n      model: haiku\n");
  put(join(dir, "workflows", "mixed.yaml"), `${WF_HEAD}agents: false\nsteps:\n  - implement:\n  - review: {agents: true}\n  - review: {rounds: 2}\n  - pr: {agents: true}\n`);
  const res = run(dir, "workflow", "--project", "p", "mixed");
  expect([res.status, res.stderr]).toEqual([0, ""]);
  const doc = JSON.parse(res.stdout);
  expect(doc.steps.map((s: { agents: boolean }) => s.agents)).toEqual([false, true, false, true]);
  expect(doc.steps[0].params).toEqual({});
  expect(doc.steps[0].do[0].agent.model).toBeUndefined();
  expect(doc.steps[1].do[0].loop.do[0].parallel[0].agent.model).toBe("opus");
  // An inline step prints no param that sets a model.
  expect(Object.keys(doc.steps[2].params)).toEqual(["rounds", "lenses"]);
  expect(doc.steps[2].do[0].loop.do[2].do[0].agent.model).toBeUndefined();
  expect([doc.pushes, doc.working_tree]).toEqual([true, false]);
  put(join(dir, "workflows", "on.yaml"), `${WF_HEAD}agents: true\nsteps:\n  - implement: {agents: false}\n`);
  expect(workflowDoc(dir, "on").working_tree).toBe(true);
  put(join(dir, "workflows", "two.yaml"), `${WF_HEAD}agents: false\nsteps:\n  - implement:\n  - implement:\n`);
  expect(workflowDoc(dir, "two").working_tree).toBe(false);
  put(join(dir, "workflows", "agent.yaml"), `${WF_HEAD}steps:\n  - implement:\n`);
  expect([workflowDoc(dir, "agent").working_tree, workflowDoc(dir, "agent").pushes]).toEqual([false, false]);
});

test("workflow <name> takes the project file over the global one, and exits 1 when neither exists", () => {
  const dir = workflowHome();
  put(join(dir, "workflows", "quick.yaml"), `${WF_HEAD}steps:\n  - implement:\n`);
  expect(JSON.parse(run(dir, "workflow", "--project", "p", "quick").stdout).file).toBe(join(dir, "workflows", "quick.yaml"));
  put(join(dir, "projects", "p", "workflows", "quick.yaml"), `${WF_HEAD}steps:\n  - implement: {model: haiku}\n`);
  const res = run(dir, "workflow", "--project", "p", "quick");
  expect([res.status, res.stderr]).toEqual([0, ""]);
  const doc = JSON.parse(res.stdout);
  expect(doc.file).toBe(join(dir, "projects", "p", "workflows", "quick.yaml"));
  expect(doc.steps[0].do[0].agent.model).toBe("haiku");
  const missing = run(dir, "workflow", "--project", "p", "nope");
  expect([missing.status, missing.stdout, missing.stderr]).toEqual([
    1,
    "",
    `theway: no workflow 'nope' in ${join(dir, "projects", "p", "workflows")} or ${join(dir, "workflows")}\n`,
  ]);
});

test("workflow takes a project step and prompt over the global ones", () => {
  const dir = workflowHome();
  put(join(dir, "projects", "p", "prompts", "correctness.md"), "# mine\n");
  put(join(dir, "projects", "p", "steps", "implement.yaml"), `${STEP_HEAD}description: Mine\ndo:\n  - agent: {returns: work, prompt: correctness}\n`);
  const doc = workflowDoc(dir);
  expect(doc.steps[0]).toMatchObject({ file: join(dir, "projects", "p", "steps", "implement.yaml"), description: "Mine", params: {} });
  expect((doc.steps[0].do as { agent: { prompt: string[]; model: string } }[])[0]?.agent).toMatchObject({
    prompt: [join(dir, "projects", "p", "prompts", "correctness.md")],
    model: "sonnet",
  });
});

test("workflow exits 1 on an invalid name, an invalid project and a missing config.yaml, and prints config warnings", () => {
  const dir = workflowHome();
  for (const [args, line] of [
    [["--project", "p", "Bad_Name"], "theway: invalid workflow name 'Bad_Name'\n"],
    [["--project", "p", "a--b"], "theway: invalid workflow name 'a--b'\n"],
    [["--project", "../x"], `theway: invalid project '../x': ${PROJECT_REASON}\n`],
    [["--project", "../x", "Bad_Name"], `theway: invalid project '../x': ${PROJECT_REASON}\n`],
  ] as const) {
    const res = run(dir, "workflow", ...args);
    expect([res.status, res.stdout, res.stderr]).toEqual([1, "", line]);
  }
  put(join(dir, "config.yaml"), "workflow:\n  open_pr: false\n");
  const warned = run(dir, "workflow", "--project", "p");
  expect([warned.status, warned.stderr]).toEqual([0, "theway: warning: config.yaml: unknown key workflow.open_pr; ignored\n"]);
  rmSync(join(dir, "config.yaml"));
  const res = run(dir, "workflow", "--project", "p");
  expect([res.status, res.stdout, res.stderr]).toEqual([
    1,
    "",
    `theway: config.yaml not found in ${dir}; run npx --yes @pixelfactoryio/theway@latest install, then /reload-plugins\n`,
  ]);
});

test("workflow picks the project's default: true file, else the global one not shadowed by a project file, else develop", () => {
  const dir = workflowHome();
  const one = `${WF_HEAD}default: true\nsteps:\n  - implement:\n`;
  const file = (d: string) => JSON.parse(run(dir, "workflow", "--project", d).stdout).file;
  put(join(dir, "workflows", "global-one.yaml"), one);
  put(join(dir, "workflows", "plain.yaml"), `${WF_HEAD}default: false\nsteps:\n  - implement:\n`);
  expect(file("p")).toBe(join(dir, "workflows", "global-one.yaml"));
  put(join(dir, "projects", "p", "workflows", "mine.yaml"), one);
  expect(file("p")).toBe(join(dir, "projects", "p", "workflows", "mine.yaml"));
  expect(file("other")).toBe(join(dir, "workflows", "global-one.yaml"));
  rmSync(join(dir, "projects", "p", "workflows", "mine.yaml"));
  put(join(dir, "projects", "p", "workflows", "global-one.yaml"), `${WF_HEAD}steps:\n  - implement:\n`);
  expect(file("p")).toBe(join(dir, "workflows", "develop.yaml"));
  put(join(dir, "projects", "p", "workflows", "develop.yaml"), `${WF_HEAD}steps:\n  - implement:\n  - review:\n  - pr:\n`);
  expect(run(dir, "workflow", "--project", "p").stdout).toBe(agentsJson(dir, join(dir, "projects", "p", "workflows", "develop.yaml"), "develop", null));
});

test("workflow exits 1 naming every file that sets default: true in the folder it reads", () => {
  const dir = workflowHome();
  const one = `${WF_HEAD}default: true\nsteps:\n  - implement:\n`;
  put(join(dir, "workflows", "b.yaml"), one);
  put(join(dir, "workflows", "a.yaml"), one);
  const two = run(dir, "workflow", "--project", "p");
  expect([two.status, two.stdout, two.stderr]).toEqual([1, "", "theway: workflows/a.yaml and workflows/b.yaml both set default: true\n"]);
  for (const n of ["z", "m", "c"]) put(join(dir, "projects", "p", "workflows", `${n}.yaml`), one);
  const three = run(dir, "workflow", "--project", "p");
  expect(three.stderr).toBe("theway: projects/p/workflows/c.yaml, projects/p/workflows/m.yaml and projects/p/workflows/z.yaml both set default: true\n");
  expect(run(dir, "workflow", "--project", "p", "a").status).toBe(0);
});

test("workflow validates every file of the folder it reads for the default, and skips a shadowed global file", () => {
  const dir = workflowHome();
  put(join(dir, "workflows", "broken.yaml"), `${WF_HEAD}steps: []\n`);
  const res = run(dir, "workflow", "--project", "p");
  expect([res.status, res.stdout, res.stderr]).toEqual([1, "", "theway: workflows/broken.yaml: steps must be a non-empty list\n"]);
  put(join(dir, "projects", "p", "workflows", "broken.yaml"), `${WF_HEAD}steps:\n  - implement:\n`);
  expect(run(dir, "workflow", "--project", "p").status).toBe(0);
  put(join(dir, "projects", "p", "workflows", "aaa.yaml"), `${WF_HEAD}steps:\n  - pr:\n  - review:\n`);
  put(join(dir, "projects", "p", "workflows", "zzz.yaml"), `${WF_HEAD}default: true\nsteps:\n  - implement:\n`);
  expect(run(dir, "workflow", "--project", "p").stderr).toBe("theway: projects/p/workflows/aaa.yaml: steps[0]: a pushing step must be the last step\n");
  expect(run(dir, "workflow", "--project", "p", "zzz").status).toBe(0);
});

test("workflow skips .default.yaml copies and warns about invalid stems only while it scans a folder", () => {
  const dir = workflowHome();
  put(join(dir, "workflows", "develop.default.yaml"), "default: true\nsteps: bad\n");
  put(join(dir, "workflows", "Bad_Name.yaml"), "default: true\nsteps: bad\n");
  put(join(dir, "workflows", "x.yml"), "default: true\n");
  put(join(dir, "projects", "p", "workflows", "also bad.yaml"), "default: true\n");
  put(join(dir, "projects", "p", "workflows", "notes.md"), "x\n");
  mkdirSync(join(dir, "projects", "p", "workflows", "dir.yaml"));
  const res = run(dir, "workflow", "--project", "p");
  expect(res.status).toBe(0);
  expect(res.stderr).toBe(
    [
      "theway: warning: projects/p/workflows/also bad.yaml: not a valid workflow name; ignored",
      "theway: warning: workflows/Bad_Name.yaml: not a valid workflow name; ignored",
      "",
    ].join("\n"),
  );
  const named = run(dir, "workflow", "--project", "p", "develop");
  expect([named.status, named.stderr]).toEqual([0, ""]);
});

test("workflow reads a project named steps, prompts or standards from projects/, never theway's own folders", () => {
  const dir = workflowHome();
  put(join(dir, "standards", "workflows", "mine.yaml"), `${WF_HEAD}default: true\nsteps:\n  - review:\n`);
  put(join(dir, "steps", "steps", "implement.yaml"), "bad\n");
  put(join(dir, "prompts", "prompts", "implement.md"), "# old\n");
  for (const project of ["steps", "prompts", "standards"]) {
    const res = run(dir, "workflow", "--project", project);
    expect([res.status, res.stderr]).toEqual([0, ""]);
    expect(JSON.parse(res.stdout).steps[0].do[0].agent.prompt).toEqual([join(dir, "prompts", "implement.md")]);
  }
  const mine = join(dir, "projects", "standards", "workflows", "mine.yaml");
  put(mine, `${WF_HEAD}default: true\nsteps:\n  - implement:\n`);
  expect(JSON.parse(run(dir, "workflow", "--project", "standards").stdout).file).toBe(mine);
});

/** The error line `theway workflow w` exits 1 with, for a workflow file `text`. */
function workflowError(dir: string, text: string): string {
  put(join(dir, "workflows", "w.yaml"), text);
  const res = run(dir, "workflow", "--project", "p", "w");
  expect([text, res.status, res.stdout]).toEqual([text, 1, ""]);
  return res.stderr;
}

test("workflow exits 1 with the first error of a workflow file, in the documented order", () => {
  const dir = workflowHome();
  const head = `${WF_HEAD}steps:\n  - implement:\n`;
  const steps = `${join(dir, "projects", "p", "steps")} or ${join(dir, "steps")}`;
  const cases: [string, string][] = [
    ["a: [1\n", "invalid YAML: Flow sequence in block collection must be sufficiently indented and end with a ] at line 2, column 1"],
    ["steps: 1\nsteps: 2\n", "invalid YAML: Map keys must be unique at line 2, column 1"],
    ["", "not a map"],
    ["- implement\n", "not a map"],
    ["steps: x\nname: y\n", "version is required (theway.workflow/v1)"],
    ["version: theway.workflow/v2\nname: y\n", "version must be theway.workflow/v1"],
    ["version: theway.step/v1\n", "version must be theway.workflow/v1"],
    [`${WF_HEAD}steps: x\nname: y\nother: z\n`, "unknown key name"],
    [`${WF_HEAD}$schema: x\nsteps: x\n`, "unknown key $schema"],
    [`${WF_HEAD}description: ""\nsteps:\n  - implement:\n`, "description must be a non-empty string"],
    [`${WF_HEAD}description: "\${x}"\nsteps:\n  - implement:\n`, "description does not take a reference"],
    [`${WF_HEAD}default: yes\nsteps:\n  - implement:\n`, "default must be true or false"],
    [`${WF_HEAD}agents: no\nsteps: x\n`, "agents must be true or false"],
    [`${WF_HEAD}steps: x\nagents: no\n`, "steps must be a non-empty list"],
    [`${WF_HEAD}default: true\n`, "steps must be a non-empty list"],
    [`${WF_HEAD}steps: []\n`, "steps must be a non-empty list"],
    [`${WF_HEAD}steps:\n  - implement\n`, "steps[0] must be a map with one key: a step name or gate"],
    [`${WF_HEAD}steps:\n  - {implement: {}, pr: {}}\n`, "steps[0] must be a map with one key: a step name or gate"],
    [`${head}  - deploy: {}\n`, `steps[1]: no step 'deploy' in ${steps} (steps: implement, pr, review)`],
    [`${head}  - reviews:\n`, `steps[1]: no step 'reviews' in ${steps}; did you mean 'review'?`],
    [`${head}  - agent: {name: x, prompt: y}\n`, `steps[1]: no step 'agent' in ${steps} (steps: implement, pr, review)`],
    [`${head}  - Review:\n`, `steps[1]: no step 'Review' in ${steps}; did you mean 'review'?`],
    [`${head}  - gate:\n  - pr:\n`, "steps[1].gate must be a non-empty question"],
    [`${head}  - gate: {q: x}\n  - pr:\n`, "steps[1].gate must be a non-empty question"],
    [`${head}  - review: [1]\n`, "steps[1].review must be a map"],
    [`${head}  - review: {round: 2, extra: 1}\n`, "steps[1].review.round is not a param of review; did you mean 'rounds'?"],
    [`${head}  - review: {extra: 1}\n`, "steps[1].review.extra is not a param of review (params: rounds, lenses, model, fix_model)"],
    [`${head}  - review: {agents: 1, x: 1}\n`, "steps[1].review.x is not a param of review (params: rounds, lenses, model, fix_model)"],
    [`${head}  - review: {agents: 1}\n`, "steps[1].review.agents must be true or false"],
    [`${head}  - review: {rounds: two}\n`, "steps[1].review.rounds must be an integer"],
    [`${head}  - review: {rounds: 1.5}\n`, "steps[1].review.rounds must be an integer"],
    [`${head}  - review: {model: 1}\n`, "steps[1].review.model must be a string"],
    [`${head}  - review: {lenses: []}\n`, "steps[1].review.lenses must be a non-empty list of names without duplicates"],
    [`${head}  - review: {lenses: [a, a]}\n`, "steps[1].review.lenses must be a non-empty list of names without duplicates"],
    [`${head}  - review: {lenses: conformance}\n`, "steps[1].review.lenses must be a non-empty list of names without duplicates"],
    [`${WF_HEAD}steps:\n  - implement: {agents: false, model: opus}\n`, "steps[0].implement.model has no effect when the step runs inline (agents: false)"],
    [`${WF_HEAD}agents: false\nsteps:\n  - implement: {model: opus}\n`, "steps[0].implement.model has no effect when the step runs inline (agents: false)"],
    [`${WF_HEAD}agents: false\n${head.slice(WF_HEAD.length)}  - review: {fix_model: opus}\n`, "steps[1].review.fix_model has no effect when the step runs inline (agents: false)"],
    [`${head}  - pr:\n  - review:\n`, "steps[1]: a pushing step must be the last step"],
    [`${head}  - pr:\n  - pr:\n`, "steps[2]: only one step may push"],
    [`${head}  - gate: Open the PR?\n`, "steps[1]: a gate cannot be the last step"],
    [`${WF_HEAD}steps:\n  - gate: Start?\n`, "steps[0]: a gate cannot be the last step"],
  ];
  for (const [text, reason] of cases) expect(workflowError(dir, text)).toBe(`theway: workflows/w.yaml: ${reason}\n`);
}, 60_000);

test("workflow exits 1 on the rules of each input, with the agent's path", () => {
  const dir = workflowHome();
  put(join(dir, "prompts", "x.md"), "# x\n");
  put(join(dir, "steps", "s.yaml"), `${STEP_HEAD}description: Scaffold\ndo:\n  - agent: {prompt: x, returns: scaffold}\n`);
  put(
    join(dir, "steps", "e.yaml"),
    `${STEP_HEAD}description: Edit\ndo:\n  - agent: {prompt: x, returns: findings}\n  - agent: {prompt: x, returns: verdicts}\n  - when: confirmed\n    do:\n      - agent: {prompt: x, returns: edits}\n  - when: decision\n    block: true\n`,
  );
  put(join(dir, "steps", "a.yaml"), `${STEP_HEAD}description: Audit\ndo:\n  - agent: {prompt: x, returns: findings, access: spec}\n`);
  const req = `${WF_HEAD}input: request\nsteps:\n`;
  const cases: [string, string][] = [
    [`${WF_HEAD}input: other\nsteps:\n  - implement:\n`, "input must be changes or request"],
    [`${req}  - s:\ndefault: true\n`, "default: true is only for an input: changes workflow"],
    [`${req}  - implement:\n`, "steps[0]: an input: request workflow starts with a step whose first agent returns scaffold"],
    [`${req}  - gate: Go?\n  - s:\n`, "steps[0]: an input: request workflow starts with a step whose first agent returns scaffold"],
    [`${req}  - e:\n`, "steps[0]: an input: request workflow starts with a step whose first agent returns scaffold"],
    [`${req}  - s:\n  - s:\n`, "steps[1]: only one agent may return scaffold"],
    [`${req}  - s:\n  - implement:\n`, "steps[1]: do[0].agent: access commit is not allowed in an input: request workflow"],
    [`${req}  - s:\n  - pr:\n`, "steps[1]: do[0].agent: access push is not allowed in an input: request workflow"],
    [`${WF_HEAD}steps:\n  - s:\n`, "steps[0]: do[0].agent: returns scaffold and access spec are only for an input: request workflow"],
    [`${WF_HEAD}steps:\n  - implement:\n  - e:\n`, "steps[1]: do[2].when.do[0].agent: returns edits and access spec are only for an input: request workflow"],
    [`${WF_HEAD}input: changes\nsteps:\n  - a:\n`, "steps[0]: do[0].agent: access spec is only for an input: request workflow"],
  ];
  for (const [text, reason] of cases) expect(workflowError(dir, text)).toBe(`theway: workflows/w.yaml: ${reason}\n`);
  put(join(dir, "workflows", "w.yaml"), `${req}  - s:\n  - e:\n  - a:\n  - gate: More?\n  - e:\n`);
  const ok = run(dir, "workflow", "--project", "p", "w");
  expect([ok.status, ok.stderr]).toEqual([0, ""]);
  const doc = JSON.parse(ok.stdout);
  expect([doc.input, doc.pushes, doc.working_tree]).toEqual(["request", false, false]);
  expect(doc.steps[1].do[3]).toEqual({ when: ["decision"], block: true });
  expect(doc.steps[1].do[2].do[0].agent.access).toBe("spec");
}, 60_000);

test("workflow names the value's origin on an error after substitution: the workflow entry, a config file or the step default", () => {
  const dir = workflowHome();
  const head = `${WF_HEAD}steps:\n  - implement:\n`;
  expect(workflowError(dir, `${head}  - review: {rounds: 0}\n`)).toBe(
    "theway: steps/review.yaml: do[0].loop.max must be a positive integer (value from workflows/w.yaml steps[1])\n",
  );
  expect(workflowError(dir, `${head}  - review: {fix_model: gpt}\n`)).toBe(
    "theway: steps/review.yaml: do[0].loop.do[2].when.do[0].agent.model must be one of opus, sonnet, haiku (value from workflows/w.yaml steps[1])\n",
  );
  expect(workflowError(dir, `${head}  - review: {lenses: [conformance, securty]}\n`)).toBe(
    `theway: steps/review.yaml: do[0].loop.do[0].foreach[item=securty].do[0].agent.prompt: prompt 'securty' has no file in ${join(dir, "projects", "p", "prompts")} or ${join(dir, "prompts")} (value from workflows/w.yaml steps[1])\n`,
  );
  put(join(dir, "projects", "p", "config.yaml"), "workflow:\n  defaults:\n    review:\n      model: gpt\n");
  expect(workflowError(dir, `${head}  - review:\n`)).toBe(
    "theway: steps/review.yaml: do[0].loop.do[0].foreach[item=conformance].do[0].agent.model must be one of opus, sonnet, haiku (value from projects/p/config.yaml)\n",
  );
  rmSync(join(dir, "projects", "p", "config.yaml"));
  put(join(dir, "prompts", "audit.md"), "# audit\n");
  put(join(dir, "steps", "audit.yaml"), `${STEP_HEAD}description: x\nparams:\n  model: {default: gpt, description: x}\ndo:\n  - agent: {returns: findings}\n`);
  expect(workflowError(dir, `${WF_HEAD}steps:\n  - audit:\n`)).toBe("theway: steps/audit.yaml: do[0].agent.model must be one of opus, sonnet, haiku (value from params.model)\n");
});

/** The error line `theway workflow w` exits 1 with, for a step file `x.yaml` holding `body` after its version and description. */
function stepError(dir: string, body: string, entry = "x:"): string {
  put(join(dir, "steps", "x.yaml"), `${STEP_HEAD}description: Test\n${body}`);
  return workflowError(dir, `${WF_HEAD}steps:\n  - ${entry}\n`).replace(/^theway: steps\/x\.yaml: /, "");
}

test("workflow exits 1 with the first error of a step file, in the documented order", () => {
  const dir = workflowHome();
  put(join(dir, "prompts", "x.md"), "# x\n");
  const prompts = `${join(dir, "projects", "p", "prompts")} or ${join(dir, "prompts")}`;
  const set = (text: string) => {
    put(join(dir, "steps", "x.yaml"), text);
    return workflowError(dir, `${WF_HEAD}steps:\n  - x:\n`);
  };
  expect(set("a: [1\n")).toBe(
    "theway: steps/x.yaml: invalid YAML: Flow sequence in block collection must be sufficiently indented and end with a ] at line 2, column 1\n",
  );
  expect(set(`${STEP_HEAD}description: x\ndo:\n  - agent: {returns: work, model: \${model}}\n`)).toMatch(
    /^theway: steps\/x\.yaml: invalid YAML: .*; quote \$\{…\} references, for example model: "\$\{model\}"\n$/,
  );
  expect(set("- x\n")).toBe("theway: steps/x.yaml: not a map\n");
  expect(set("description: x\nother: 1\n")).toBe("theway: steps/x.yaml: version is required (theway.step/v1)\n");
  expect(set("version: theway.workflow/v1\n")).toBe("theway: steps/x.yaml: version must be theway.step/v1\n");
  expect(set(`${STEP_HEAD}other: 1\n`)).toBe("theway: steps/x.yaml: unknown key other\n");
  expect(set(`${STEP_HEAD}do:\n  - agent: {returns: work}\n`)).toBe("theway: steps/x.yaml: description must be a non-empty string\n");
  expect(set(`${STEP_HEAD}description: ""\n`)).toBe("theway: steps/x.yaml: description must be a non-empty string\n");
  expect(set(`${STEP_HEAD}description: "\${x}"\n`)).toBe("theway: steps/x.yaml: description does not take a reference\n");
  const cases: [string, string][] = [
    ["", "do must be a non-empty list"],
    ["do: []\n", "do must be a non-empty list"],
    ["params:\n  agents: {default: 1, description: x}\ndo: []\n", "params.agents: agents and item are reserved"],
    ["params:\n  item: {default: 1, description: x}\n", "params.item: agents and item are reserved"],
    ["params:\n  Rounds: {default: 1, description: x}\n", "params.Rounds must be a param name (lowercase letters, digits and _, starting with a letter)"],
    ["params:\n  rounds: 1\n", "params.rounds must be {default, description}"],
    ["params:\n  rounds: {default: 1}\n", "params.rounds must be {default, description}"],
    ["params:\n  rounds: {default: 1, description: x, extra: 1}\n", "params.rounds must be {default, description}"],
    ["params:\n  rounds: {default: 1.5, description: x}\n", `params.rounds.default must be a string, an integer, a boolean or a non-empty list of names without duplicates`],
    ["params:\n  rounds: {default: [a, a], description: x}\n", `params.rounds.default must be a string, an integer, a boolean or a non-empty list of names without duplicates`],
    ['params:\n  rounds: {default: "${x}", description: x}\n', "params.rounds.default does not take a reference"],
    ["do:\n  - x\n", "do[0] must have exactly one of agent, foreach, loop, when"],
    ["do:\n  - {}\n", "do[0] must have exactly one of agent, foreach, loop, when"],
    ["do:\n  - {agent: {returns: work}, loop: {}}\n", "do[0] must have exactly one of agent, foreach, loop, when"],
    ["do:\n  - gate: Continue?\n", "do[0]: gate is a workflow entry; a step cannot ask the user"],
    ["do:\n  - parallel: []\n", "do[0]: parallel is output only; write foreach: … with parallel: true"],
    ["do:\n  - agent: {returns: work, name: y}\n", "do[0].agent.name is not a field of agent (fields: prompt, returns, model, access)"],
    ["do:\n  - agent: {returns: work}\n    model: opus\n", "do[0].model is not a field of agent (fields: prompt, returns, model, access)"],
    ["do:\n  - agent:\n", "do[0].agent.returns is required (one of work, findings, verdicts, resolutions, pr, ci, diagnosis, scaffold, edits)"],
    ["do:\n  - agent: {returns: nope}\n", "do[0].agent.returns must be one of work, findings, verdicts, resolutions, pr, ci, diagnosis, scaffold, edits"],
    ["do:\n  - agent: {returns: work, model: gpt}\n", "do[0].agent.model must be one of opus, sonnet, haiku"],
    ["do:\n  - agent: {returns: work, access: write}\n", "do[0].agent.access must be read, commit, push or spec"],
    ["do:\n  - agent: {returns: work, prompt: []}\n", "do[0].agent.prompt must be a name or a non-empty list of names"],
    ["do:\n  - agent: {returns: work, prompt: Bad}\n", "do[0].agent.prompt must be a name or a non-empty list of names"],
    ["do:\n  - agent: {returns: work, access: read}\n", "do[0].agent.access must be commit or push for returns: work"],
    ["do:\n  - agent: {returns: pr, access: commit}\n", "do[0].agent.access must be push for returns: pr"],
    ["do:\n  - agent: {returns: work, prompt: nope}\n", `do[0].agent.prompt: prompt 'nope' has no file in ${prompts}`],
    ['do:\n  - agent: {returns: "${kind}"}\n', "do[0].agent.returns does not take a reference"],
    ['do:\n  - agent: {returns: work, access: "${a}"}\n', "do[0].agent.access does not take a reference"],
    ['do:\n  - agent: {returns: work, model: "${modle}"}\n', "do[0].agent.model: ${modle} is not a param of x; x declares no params"],
    [
      'params:\n  model: {default: opus, description: x}\ndo:\n  - agent: {returns: work, model: "${modle}"}\n',
      "do[0].agent.model: ${modle} is not a param of x; did you mean 'model'?",
    ],
    ['do:\n  - agent: {returns: work, prompt: "${item}"}\n', "do[0].agent.prompt: ${item} outside foreach"],
    ['do:\n  - agent: {returns: work, prompt: "x-${item}"}\n', "do[0].agent.prompt: ${…} must be the whole value; there is no string templating"],
    ['do:\n  - agent: {returns: work, prompt: [x, "${a}${b}"]}\n', "do[0].agent.prompt[1]: ${…} must be the whole value; there is no string templating"],
    ["do:\n  - foreach: [a]\n    do:\n      - foreach: [b]\n        do: []\n", "do[0].foreach[item=a].do[0].foreach: no foreach inside a foreach"],
    ["do:\n  - foreach: x\n    do: []\n", "do[0].foreach must be a non-empty list of names"],
    ["do:\n  - foreach: []\n    do: [agent: {returns: findings}]\n", "do[0].foreach must be a non-empty list of names"],
    ["do:\n  - foreach: []\n    parallel: true\n    do: [agent: {returns: findings}]\n", "do[0].foreach must be a non-empty list of names"],
    ["do:\n  - foreach: [x]\n    parallel: yes\n    do: []\n", "do[0].foreach.parallel must be true or false"],
    ["do:\n  - foreach: [x]\n", "do[0].foreach.do is required (a non-empty list)"],
    ["do:\n  - foreach: [x]\n    do: []\n", "do[0].foreach[item=x].do must be a non-empty list"],
    ["do:\n  - foreach: [x]\n    each: 1\n    do: []\n", "do[0].foreach.each is not a field of foreach (fields: parallel, do)"],
    [
      "do:\n  - foreach: [x]\n    parallel: true\n    do:\n      - agent: {returns: work}\n",
      "do[0].foreach: a parallel foreach may hold only agents with access: read",
    ],
    [
      "do:\n  - foreach: [x]\n    parallel: true\n    do:\n      - loop: {max: 1, until: more, exhausted: continue, do: [agent: {returns: findings}]}\n",
      "do[0].foreach: a parallel foreach may hold only agents with access: read",
    ],
    ["do:\n  - loop: {max: 1, until: more, exhausted: continue, do: [loop: {}]}\n", "do[0].loop.do[0].loop: no loop inside a loop"],
    ["do:\n  - loop: {until: more, exhausted: continue, do: []}\n", "do[0].loop.max is required (a positive integer)"],
    ["do:\n  - loop: {max: 0, until: more, exhausted: continue, do: []}\n", "do[0].loop.max must be a positive integer"],
    ['do:\n  - loop: {max: "2", until: more, exhausted: continue, do: []}\n', "do[0].loop.max must be a positive integer"],
    ["do:\n  - loop: {max: 1, exhausted: continue, do: []}\n", "do[0].loop.until is required (one of findings, no-findings, confirmed, no-confirmed, green, red, fixable, more, decision, no-decision)"],
    ["do:\n  - loop: {max: 1, until: done, exhausted: continue, do: []}\n", "do[0].loop.until must be one of findings, no-findings, confirmed, no-confirmed, green, red, fixable, more, decision, no-decision"],
    [
      "do:\n  - loop: {max: 1, until: more, do: []}\n",
      "do[0].loop.exhausted is required (continue or fail); say what happens when the loop ends without until",
    ],
    ["do:\n  - loop: {max: 1, until: more, exhausted: stop, do: []}\n", "do[0].loop.exhausted must be continue or fail"],
    ["do:\n  - loop: {max: 1, until: more, exhausted: fail}\n", "do[0].loop.do is required (a non-empty list)"],
    ["do:\n  - loop: {max: 1, until: more, exhausted: fail, do: [], every: 1}\n", "do[0].loop.every is not a field of loop (fields: max, until, exhausted, do)"],
    ['do:\n  - loop: {max: 1, until: "${x}", exhausted: fail, do: []}\n', "do[0].loop.until does not take a reference"],
    ["do:\n  - when: more\n    do: [agent: {returns: work}]\n", "do[0].when: more outside a loop"],
    ["do:\n  - when: done\n    do: []\n", "do[0].when must be one of findings, no-findings, confirmed, no-confirmed, green, red, fixable, more, decision, no-decision"],
    ["do:\n  - agent: {returns: findings}\n  - when: findings\n", "do[1].when: when needs exactly one of do, fail or block"],
    ["do:\n  - agent: {returns: findings}\n  - when: findings\n    fail: true\n    do: [agent: {returns: work}]\n", "do[1].when: when needs exactly one of do, fail or block"],
    ["do:\n  - agent: {returns: findings}\n  - when: findings\n    fail: true\n    block: true\n", "do[1].when: when needs exactly one of do, fail or block"],
    ["do:\n  - agent: {returns: findings}\n  - when: findings\n    block: false\n", "do[1].when.block must be true or a non-empty string"],
    ['do:\n  - agent: {returns: findings}\n  - when: findings\n    block: ""\n', "do[1].when.block must be true or a non-empty string"],
    [
      "params:\n  n: {default: 2, description: x}\ndo:\n  - agent: {returns: findings}\n  - when: findings\n    block: \"${n}\"\n",
      "do[1].when.block must be true or a non-empty string (value from params.n)",
    ],
    ['do:\n  - agent: {returns: findings}\n  - when: findings\n    block: "stop ${n}"\n', "do[1].when.block: ${…} must be the whole value; there is no string templating"],
    ["do:\n  - agent: {returns: scaffold, access: read}\n", "do[0].agent.access must be spec for returns: scaffold"],
    ["do:\n  - agent: {returns: findings}\n  - agent: {returns: verdicts}\n  - agent: {returns: edits, access: commit}\n", "do[2].agent.access must be spec for returns: edits"],
    ["do:\n  - agent: {returns: edits}\n", "do[0].agent: returns edits needs an earlier verdicts agent in this step"],
    ["do:\n  - agent: {returns: work, access: spec}\n", "do[0].agent.access must be commit or push for returns: work"],
    ["do:\n  - when: decision\n    block: true\n", "do[0].when: decision needs an earlier verdicts agent in this step"],
    ["do:\n  - agent: {returns: findings}\n  - when: findings\n    fail: false\n", "do[1].when.fail must be true"],
    ["do:\n  - agent: {returns: findings}\n  - when: findings\n    then: []\n", "do[1].when.then is not a field of when (fields: do, fail, block)"],
    ["do:\n  - when: findings\n    fail: true\n", "do[0].when: findings needs an earlier findings agent in this step"],
    ["do:\n  - when: [findings, red]\n    fail: true\n  - agent: {returns: findings}\n", "do[0].when: findings needs an earlier findings agent in this step"],
    ["do:\n  - agent: {returns: findings}\n  - when: [findings, red]\n    fail: true\n", "do[1].when: red needs an earlier ci agent in this step"],
    ["do:\n  - agent: {returns: verdicts}\n", "do[0].agent: returns verdicts needs an earlier findings agent in this step"],
    ["do:\n  - agent: {returns: findings}\n  - agent: {returns: resolutions}\n", "do[1].agent: returns resolutions needs an earlier verdicts agent in this step"],
    [
      "do:\n  - agent: {returns: findings}\n  - agent: {returns: verdicts}\n  - agent: {returns: resolutions}\n",
      "do[2].agent: returns resolutions needs an earlier work agent in this step",
    ],
    ["do:\n  - agent: {returns: diagnosis}\n", "do[0].agent: returns diagnosis needs an earlier ci agent in this step"],
    [
      "do:\n  - foreach: [x, y]\n    parallel: true\n    do:\n      - agent: {returns: findings}\n  - when: findings\n    fail: true\n",
      "",
    ],
    [
      "do:\n  - agent: {returns: ci}\n  - loop: {max: 2, until: green, exhausted: fail, do: [when: red, do: [agent: {returns: work}]]}\n",
      "do[1].loop.do[0].when: red needs an earlier ci agent in this step",
    ],
    [
      "do:\n  - loop:\n      max: 2\n      until: fixable\n      exhausted: continue\n      do: [agent: {returns: ci}]\n",
      "do[0].loop.until: fixable needs an earlier diagnosis agent in this step",
    ],
    [
      "do:\n  - loop: {max: 2, until: green, exhausted: continue, do: [agent: {returns: ci}]}\n  - when: red\n    fail: true\n",
      "do[1].when: red is set only inside the loop at do[0].loop; use exhausted: fail",
    ],
  ];
  for (const [body, reason] of cases) {
    if (reason === "") {
      put(join(dir, "steps", "x.yaml"), `${STEP_HEAD}description: Test\n${body}`);
      put(join(dir, "workflows", "w.yaml"), `${WF_HEAD}steps:\n  - x:\n`);
      expect([body, run(dir, "workflow", "--project", "p", "w").status]).toEqual([body, 0]);
      continue;
    }
    expect([body, stepError(dir, body)]).toEqual([body, `${reason}\n`]);
  }
}, 120_000);

test("workflow warns about a loop with exhausted: fail whose work agent is not guarded by more", () => {
  const dir = workflowHome();
  put(join(dir, "prompts", "lint.md"), "# lint\n");
  put(join(dir, "prompts", "lint-fix.md"), "# fix\n");
  const step = (guard: string) =>
    `${STEP_HEAD}description: Lint\ndo:\n  - loop:\n      max: 3\n      until: no-findings\n      exhausted: fail\n      do:\n        - agent: {prompt: lint, returns: findings}\n        - when: ${guard}\n          do:\n            - agent: {prompt: lint-fix, returns: work}\n`;
  put(join(dir, "steps", "lint.yaml"), step("findings"));
  put(join(dir, "workflows", "w.yaml"), `${WF_HEAD}steps:\n  - lint:\n`);
  const res = run(dir, "workflow", "--project", "p", "w");
  expect([res.status, res.stderr]).toEqual([
    0,
    "theway: warning: steps/lint.yaml: do[0].loop: exhausted: fail with a work agent not guarded by more; its last fix is never checked (guard it with when: [findings, more]); ignored\n",
  ]);
  put(join(dir, "steps", "lint.yaml"), step("[findings, more]"));
  expect(run(dir, "workflow", "--project", "p", "w").stderr).toBe("");
});

test("workflow runs a user step from a single prompt, and a failing audit", () => {
  const dir = workflowHome();
  put(join(dir, "prompts", "changelog.md"), "# changelog\n");
  put(join(dir, "prompts", "security-audit.md"), "# audit\n");
  put(join(dir, "steps", "changelog.yaml"), `${STEP_HEAD}description: Add this change to CHANGELOG.md\ndo:\n  - agent: {returns: work}\n`);
  put(
    join(dir, "steps", "security-audit.yaml"),
    `${STEP_HEAD}description: Fail the change on any security finding\nparams:\n  model: {default: opus, description: The auditor}\ndo:\n  - agent: {returns: findings}\n  - when: findings\n    fail: true\n`,
  );
  put(join(dir, "workflows", "w.yaml"), `${WF_HEAD}steps:\n  - implement:\n  - changelog:\n  - security-audit:\n  - gate: Open the PR?\n  - pr:\n`);
  const res = run(dir, "workflow", "--project", "p", "w");
  expect([res.status, res.stderr]).toEqual([0, ""]);
  const steps = JSON.parse(res.stdout).steps;
  expect(steps[1].do).toEqual([
    {
      agent: {
        name: "changelog",
        label: "changelog:changelog",
        prompt: [join(dir, "prompts", "changelog.md")],
        returns: "work",
        access: "commit",
        model: "sonnet",
      },
    },
  ]);
  expect(steps[2].do[1]).toEqual({ when: ["findings"], fail: true });
  expect(steps[2].do[0].agent.model).toBe("opus");
});

test("workflow prints commits and git_host after file, each the project file over the global one", () => {
  const dir = workflowHome();
  put(join(dir, "projects", "p", "standards", "commits.md"), "# mine\n");
  const own = JSON.parse(run(dir, "workflow", "--project", "p").stdout);
  expect([own.commits, own.git_host]).toEqual([join(dir, "projects", "p", "standards", "commits.md"), join(dir, "standards", "git-host.md")]);
  put(join(dir, "projects", "p", "standards", "git-host.md"), "# GitLab\n");
  expect(JSON.parse(run(dir, "workflow", "--project", "p").stdout).git_host).toBe(join(dir, "projects", "p", "standards", "git-host.md"));
  expect(JSON.parse(run(dir, "workflow", "--project", "other").stdout).commits).toBe(join(dir, "standards", "commits.md"));
});

test("workflow exits 1 when a global convention standard is missing, after the workflow file is validated", () => {
  const dir = workflowHome();
  put(join(dir, "projects", "p", "standards", "commits.md"), "# mine\n");
  put(join(dir, "projects", "p", "standards", "git-host.md"), "# mine\n");
  const line = (file: string) =>
    `theway: ${join(dir, "standards", file)} not found; run npx --yes @pixelfactoryio/theway@latest install, then /reload-plugins\n`;
  rmSync(join(dir, "standards", "git-host.md"));
  const host = run(dir, "workflow", "--project", "p");
  expect([host.status, host.stdout, host.stderr]).toEqual([1, "", line("git-host.md")]);
  rmSync(join(dir, "standards", "commits.md"));
  const commits = run(dir, "workflow", "--project", "p");
  expect([commits.status, commits.stdout, commits.stderr]).toEqual([1, "", line("commits.md")]);
  put(join(dir, "workflows", "w.yaml"), `${WF_HEAD}steps: []\n`);
  const invalid = run(dir, "workflow", "--project", "p", "w");
  expect([invalid.status, invalid.stdout, invalid.stderr]).toEqual([1, "", "theway: workflows/w.yaml: steps must be a non-empty list\n"]);
});

test.skipIf(process.getuid?.() === 0)("workflow exits 1 for a workflow file that cannot be read", () => {
  const dir = workflowHome();
  put(join(dir, "projects", "p", "workflows", "w.yaml"), `${WF_HEAD}steps:\n  - implement:\n`);
  chmodSync(join(dir, "projects", "p", "workflows", "w.yaml"), 0o000);
  const res = run(dir, "workflow", "--project", "p", "w");
  expect([res.status, res.stdout, res.stderr]).toEqual([1, "", "theway: projects/p/workflows/w.yaml: cannot be read\n"]);
});

test("steps lists the steps with origin, description and each param's effective value and description, project first", () => {
  const dir = shippedHome();
  put(join(dir, "projects", "p", "config.yaml"), "workflow:\n  defaults:\n    review:\n      rounds: 2\n");
  put(join(dir, "projects", "p", "steps", "pr.yaml"), `${STEP_HEAD}description: My PR\ndo:\n  - agent: {prompt: open-pr, returns: pr}\n`);
  put(join(dir, "steps", "broken.yaml"), "description: x\n");
  put(join(dir, "steps", "pr.default.yaml"), "x\n");
  const res = run(dir, "steps", "--project", "p");
  expect(res.status).toBe(0);
  expect(res.stdout).toBe(
    [
      "implement  global  Implement the change's tasks as its spec says",
      "    model=opus  The implementer",
      "pr  project  My PR",
      "review  global  Review the diff through each lens, triage the findings, fix the confirmed ones and check the fixes",
      "    rounds=2  Maximum review rounds",
      "    lenses=conformance,correctness  One reviewer per lens, by prompt name",
      "    model=opus  The reviewers, the triage and the fix check",
      "    fix_model=opus  The fix agent of each round",
      "scaffold  global  Investigate the request and write the change's spec, tasks and design",
      "    model=opus  The scaffolder when the step runs through agents",
      "scaffold-light  global  Investigate a small request and write its light spec and tasks, or escalate",
      "    model=opus  The scaffolder when the step runs through agents",
      "spec-review  global  Review the change's spec through each lens, triage, fix the confirmed findings and stop on a decision",
      "    rounds=1  Maximum review rounds",
      "    lenses=grounding,implementability  One critic per lens, by prompt name",
      "    model=opus  The critics, the triage and the fix agent",
      "    on_decision=open question  The message a confirmed decision stops the run with",
      "",
    ].join("\n"),
  );
  expect(res.stderr).toBe("theway: warning: steps/broken.yaml: version is required (theway.step/v1); ignored\n");
});

test("steps <name> prints the step object of theway workflow, and exits 1 for an unknown or invalid step", () => {
  const dir = shippedHome();
  const res = run(dir, "steps", "--project", "theway", "review");
  expect([res.status, res.stderr]).toEqual([0, ""]);
  const review = JSON.parse(agentsJson(dir)).steps[1];
  expect(JSON.parse(res.stdout)).toEqual(review);
  const steps = `${join(dir, "projects", "theway", "steps")} or ${join(dir, "steps")}`;
  for (const [name, line] of [
    ["nope", `theway: no step 'nope' in ${steps} (steps: implement, pr, review, scaffold, scaffold-light, spec-review)\n`],
    ["revew", `theway: no step 'revew' in ${steps}; did you mean 'review'?\n`],
    ["Bad", "theway: invalid step name 'Bad'\n"],
  ] as const) {
    const r = run(dir, "steps", "--project", "theway", name);
    expect([r.status, r.stdout, r.stderr]).toEqual([1, "", line]);
  }
  put(join(dir, "steps", "pr.yaml"), `${STEP_HEAD}description: x\ndo:\n  - agent: {returns: pr, access: read}\n`);
  const bad = run(dir, "steps", "--project", "theway", "pr");
  expect([bad.status, bad.stdout, bad.stderr]).toEqual([1, "", "theway: steps/pr.yaml: do[0].agent.access must be push for returns: pr\n"]);
});

test("commits.md and git-host.md are never standards of theway context from either folder, and cannot be switched", () => {
  const dir = home();
  put(join(dir, "config.yaml"), "standards:\n  commits:\n    enabled: true\n  git_host:\n    enabled: false\n");
  put(join(dir, ".shipped.json"), "{}\n");
  for (const f of ["commits.md", "git-host.md", "mine.md"]) {
    put(join(dir, "standards", f), "# x\n");
    put(join(dir, "projects", "p", "standards", f), "# x\n");
  }
  for (const phase of ["engineering", "develop", "document"]) {
    const res = run(dir, "context", "--project", "p", phase);
    expect(res.status).toBe(0);
    expect(res.stdout).not.toContain("commits.md");
    expect(res.stdout).not.toContain("git-host.md");
    expect(res.stdout).toContain(join(dir, "projects", "p", "standards", "mine.md"));
  }
  const config = run(dir, "config", "--project", "p");
  expect(config.stdout).not.toMatch(/commits|git_host/);
  expect(config.stderr).toBe(
    [
      "theway: warning: config.yaml: standards.commits cannot be switched; ignored",
      "theway: warning: config.yaml: standards.git_host cannot be switched; ignored",
      "",
    ].join("\n"),
  );
});

/** The environment of a child that runs git in `cwd`: every `GIT_*` variable removed. */
function gitFreeEnv(dir: string): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env, THEWAY_HOME: dir };
  for (const k of Object.keys(env)) if (k.startsWith("GIT_")) delete env[k];
  return env;
}

function runIn(cwd: string, dir: string, ...args: string[]) {
  return spawnSync("node", [CLI, ...args], { cwd, encoding: "utf-8", env: gitFreeEnv(dir) });
}

function git(cwd: string, ...args: string[]): void {
  const res = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf-8", env: gitFreeEnv("") });
  if (res.status !== 0) throw new Error(res.stderr);
}

const keyFor = (root: string): string => root.replace(/[^A-Za-z0-9]/g, "-");

test("project derives one key for a repository, its subfolder and a linked worktree", () => {
  const dir = home();
  const tmp = realpathSync(home());
  const main = join(tmp, "my.repo");
  mkdirSync(join(main, "sub"), { recursive: true });
  git(main, "init", "-q");
  git(main, "commit", "-q", "--allow-empty", "-m", "init");
  git(main, "worktree", "add", "-q", join(tmp, "wt"));
  const key = keyFor(main);
  const expected = `key: ${key}\ndir: ${join(dir, "projects", key)}\n`;
  for (const cwd of [main, join(main, "sub"), join(tmp, "wt")]) {
    const res = runIn(cwd, dir, "project");
    expect([res.status, res.stdout, res.stderr]).toEqual([0, expected, ""]);
  }
  expect(key).toMatch(/^[A-Za-z0-9-]+-my-repo$/);
});

test("project derives the key from the current directory outside git", () => {
  const dir = home();
  const cwd = join(realpathSync(home()), "not_git");
  mkdirSync(cwd, { recursive: true });
  const key = keyFor(cwd);
  const res = runIn(cwd, dir, "project");
  expect([res.status, res.stdout, res.stderr]).toEqual([0, `key: ${key}\ndir: ${join(dir, "projects", key)}\n`, ""]);
});

test("project takes --project over the derived key and exits 1 for an invalid or too long key", () => {
  const dir = home();
  const ok = run(dir, "project", "--project", "abc-1");
  expect([ok.status, ok.stdout, ok.stderr]).toEqual([0, `key: abc-1\ndir: ${join(dir, "projects", "abc-1")}\n`, ""]);
  const bad = run(dir, "project", "--project", "a/b");
  expect([bad.status, bad.stdout, bad.stderr]).toEqual([1, "", `theway: invalid project 'a/b': ${PROJECT_REASON}\n`]);
  const long = "a".repeat(201);
  const over = run(dir, "project", "--project", long);
  expect([over.status, over.stdout, over.stderr]).toEqual([1, "", `theway: invalid project '${long}': ${PROJECT_REASON}\n`]);
  let cwd = realpathSync(home());
  while (cwd.length <= 200) cwd = join(cwd, "d".repeat(40));
  mkdirSync(cwd, { recursive: true });
  for (const args of [["project"], ["list"], ["path", "add-x"], ["context", "develop", "Add_X"]]) {
    const res = runIn(cwd, dir, ...args);
    expect([res.status, res.stdout, res.stderr]).toEqual([
      1,
      "",
      `theway: project key for ${cwd} is longer than 200 characters; pass --project <key>\n`,
    ]);
  }
  const given = runIn(cwd, dir, "project", "--project", "abc-1");
  expect(given.stdout).toBe(`key: abc-1\ndir: ${join(dir, "projects", "abc-1")}\n`);
});

test("list, path and archive without --project use the derived key's folder under projects/", () => {
  const dir = home();
  const cwd = realpathSync(home());
  git(cwd, "init", "-q");
  const key = keyFor(cwd);
  put(join(dir, "projects", key, "changes", "add-x", "spec.md"), "# x\n");
  expect(runIn(cwd, dir, "list").stdout).toStartWith(`theway changes — ${key}\n\nActive changes\n\n  add-x `);
  expect(runIn(cwd, dir, "path", "add-x").stdout).toBe(`${join(dir, "projects", key, "changes", "add-x")}\n`);
  const res = runIn(cwd, dir, "archive", "add-x");
  expect(res.status).toBe(0);
  expect(res.stdout).toStartWith(`Archived: ${join(dir, "projects", key, "changes", "archive")}/`);
});
