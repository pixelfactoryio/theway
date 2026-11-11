import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { removeIfEmpty } from "../src/core/io";
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

/** A `change.yaml` with one task per entry of `done`, ticked when true. */
function changeYaml(done: boolean[]): string {
  const tasks = done.map((d, i) => `  - text: task ${i + 1}\n${d ? "    done: true\n" : ""}`).join("");
  return `version: theway.change/v1beta\ndescription: Do the thing\ntasks:\n${tasks}`;
}

const EXAMPLE = `version: theway.change/v1beta
description: Limit requests per API key with a token bucket
tasks:
  - text: Add a token bucket per API key, kept in memory
    done: true
  - text: Answer 429 with a \`Retry-After\` header when the bucket is empty
  - text: Read the limit and the burst from the settings
`;

test("change prints the change of a valid change.yaml as JSON, tasks numbered from 1", () => {
  const dir = home();
  const folder = join(dir, "projects", "p", "changes", "add-x");
  put(join(folder, "change.yaml"), EXAMPLE);
  const res = run(dir, "change", "--project", "p", "add-x");
  expect([res.status, res.stderr]).toEqual([0, ""]);
  expect(JSON.parse(res.stdout)).toEqual({
    id: "add-x",
    dir: folder,
    description: "Limit requests per API key with a token bucket",
    tasks: [
      { n: 1, text: "Add a token bucket per API key, kept in memory", done: true },
      { n: 2, text: "Answer 429 with a `Retry-After` header when the bucket is empty", done: false },
      { n: 3, text: "Read the limit and the burst from the settings", done: false },
    ],
  });
});

test("change prints one error line per broken rule and exits 1 with nothing on stdout", () => {
  const dir = home();
  const file = join(dir, "projects", "p", "changes", "add-x", "change.yaml");
  const v = "version: theway.change/v1beta\n";
  const d = "description: Do it\n";
  const t = "tasks:\n  - text: a\n";
  const cases: [string | null, string[]][] = [
    [null, ["not found"]],
    ["a: [\n", ["invalid YAML: "]],
    ["- a\n", ["must be a map"]],
    ["", ["must be a map"]],
    [`version: theway.change/v1\n${d}${t}`, ["version: must be theway.change/v1beta"]],
    [`${v}description: ""\n${t}`, ["description: must be a non-empty string on one line"]],
    [`${v}description: "a\\nb"\n${t}`, ["description: must be a non-empty string on one line"]],
    [`${v}${d}tasks: []\n`, ["tasks: must be a list with at least one task"]],
    [`${v}${d}tasks: a\n`, ["tasks: must be a list with at least one task"]],
    [`${v}${d}tasks:\n  - text: a\n  - b\n`, ["tasks[1]: must be a map"]],
    [`${v}${d}tasks:\n  - text: ""\n`, ["tasks[0].text: must be a non-empty string"]],
    [`${v}${d}tasks:\n  - done: true\n`, ["tasks[0].text: is required"]],
    [`${v}${d}tasks:\n  - text: a\n    done: "yes"\n`, ["tasks[0].done: must be true or false"]],
    [`${v}${d}tasks:\n  - text: a\n    owner: me\n`, ["tasks[0].owner: unknown key"]],
    [`${v}${d}${t}phase: 1\n`, ["phase: unknown key"]],
    [`${d}${t}`, ["version: is required"]],
    [`${v}${t}`, ["description: is required"]],
    [`${v}${d}`, ["tasks: is required"]],
    [`phase: 1\nversion: x\n${t}`, ["phase: unknown key", "version: must be theway.change/v1beta", "description: is required"]],
  ];
  for (const [text, issues] of cases) {
    rmSync(file, { force: true });
    if (text !== null) put(file, text);
    const res = run(dir, "change", "--project", "p", "add-x");
    expect([res.status, res.stdout]).toEqual([1, ""]);
    const lines = res.stderr.trimEnd().split("\n");
    expect(lines.length).toBe(issues.length);
    issues.forEach((issue, i) => expect(lines[i]).toStartWith(`theway: changes/add-x/change.yaml: ${issue}`));
    if (!issues[0]?.startsWith("invalid YAML")) expect(res.stderr).toBe(issues.map((i) => `theway: changes/add-x/change.yaml: ${i}\n`).join(""));
  }
});

test("task done ticks the named tasks, keeps the rest of the file's text and refuses an unknown number without writing", () => {
  const dir = home();
  const file = join(dir, "projects", "p", "changes", "add-x", "change.yaml");
  const long = "Read the limit and the burst from the settings, then document both of them in the README of the service";
  const text = `version: theway.change/v1beta
# The work, in order.
description: Limit requests per API key
tasks:
  - text: '${long}'
  - text: Answer 429 with a \`Retry-After\` header
  - text: "Keep the bucket in memory"
`;
  put(file, text);
  const bad = run(dir, "task", "done", "--project", "p", "add-x", "9");
  expect([bad.status, bad.stdout, bad.stderr]).toEqual([1, "", "theway: changes/add-x/change.yaml: task 9: no such task (1 to 3)\n"]);
  const partial = run(dir, "task", "done", "--project", "p", "add-x", "1", "9");
  expect(partial.status).toBe(1);
  expect(run(dir, "task", "done", "--project", "p", "add-x", "0").stderr).toBe("theway: changes/add-x/change.yaml: task 0: no such task (1 to 3)\n");
  expect(readFileSync(file, "utf-8")).toBe(text);

  const res = run(dir, "task", "done", "--project", "p", "add-x", "2", "3");
  expect([res.status, res.stdout, res.stderr]).toEqual([0, "2/3 tasks done\n", ""]);
  expect(readFileSync(file, "utf-8")).toBe(
    text
      .replace("header\n", "header\n    done: true\n")
      .replace('"Keep the bucket in memory"\n', '"Keep the bucket in memory"\n    done: true\n'),
  );
  const again = run(dir, "task", "done", "--project", "p", "add-x", "2", "3");
  expect([again.status, again.stdout]).toEqual([0, "2/3 tasks done\n"]);

  put(file, "version: x\n");
  const invalid = run(dir, "task", "done", "--project", "p", "add-x", "1");
  expect([invalid.status, invalid.stderr]).toEqual([
    1,
    "theway: changes/add-x/change.yaml: version: must be theway.change/v1beta\ntheway: changes/add-x/change.yaml: description: is required\ntheway: changes/add-x/change.yaml: tasks: is required\n",
  ]);
  expect(readFileSync(file, "utf-8")).toBe("version: x\n");
});

test("change and task done validate the project and the change id", () => {
  const dir = home();
  for (const args of [["change"], ["task", "done"]]) {
    const extra = args[0] === "task" ? ["1"] : [];
    expect(run(dir, ...args, "--project", "a/b", "add-x", ...extra).stderr).toBe(`theway: invalid project 'a/b': ${PROJECT_REASON}\n`);
    expect(run(dir, ...args, "--project", "p", "..", ...extra).stderr).toBe(`theway: invalid change id '..': ${CHANGE_ID_REASON}\n`);
  }
  const help = run(dir, "task");
  expect(help.stderr).toContain("Usage: theway task");
});

test("archive refuses open tasks and an invalid change.yaml, and archives either with --force", () => {
  const dir = home();
  const changes = join(dir, "projects", "p", "changes");
  put(join(changes, "add-x", "change.yaml"), changeYaml([true, false]).replace("task 2", ">-\n      task 2\n      second line"));
  const res = run(dir, "archive", "--project", "p", "add-x");
  expect([res.status, res.stdout]).toEqual([1, ""]);
  expect(res.stderr).toBe("Error: add-x has open tasks — not archiving.\n2. task 2 second line\nTick them with theway task done, or re-run with --force.\n");
  const forced = run(dir, "archive", "--project", "p", "add-x", "--force");
  expect(forced.status).toBe(0);
  expect(forced.stderr).toBe("WARNING: archiving with open tasks (--force):\n2. task 2 second line\n");

  put(join(changes, "add-y", "spec.md"), "# y\n");
  const invalid = run(dir, "archive", "--project", "p", "add-y");
  expect([invalid.status, invalid.stdout]).toEqual([1, ""]);
  expect(invalid.stderr).toBe("Error: add-y has an invalid change.yaml — not archiving.\nchanges/add-y/change.yaml: not found\nFix it, or re-run with --force.\n");
  const forcedInvalid = run(dir, "archive", "--project", "p", "add-y", "--force");
  expect([forcedInvalid.status, forcedInvalid.stderr]).toEqual([0, "WARNING: archiving with an invalid change.yaml (--force)\n"]);
  expect(existsSync(join(changes, "add-y"))).toBe(false);

  put(join(changes, "add-z", "change.yaml"), changeYaml([true]));
  const done = run(dir, "archive", "--project", "p", "add-z");
  expect([done.status, done.stderr]).toEqual([0, ""]);
  expect(done.stdout).toStartWith(`Archived: ${join(changes, "archive")}/`);
});

test("archive refuses an id already archived today", () => {
  const dir = home();
  const spec = join(dir, "projects", "p", "changes", "add-y", "change.yaml");
  put(spec, changeYaml([true]));
  expect(run(dir, "archive", "--project", "p", "add-y").status).toBe(0);
  put(spec, changeYaml([true]));
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
  put(join(changes, "add-alpha", "change.yaml"), changeYaml([true, false, false]));
  put(join(changes, "add-alpha", "notes.txt"), "n\n");
  put(join(changes, "add-alpha", ".hidden"), "h\n");
  mkdirSync(join(changes, "add-alpha", "sub"));
  put(join(changes, "update-beta", "spec.md"), spec);
  put(join(changes, "update-gone", "change.yaml"), "version: x\ndescription: d\ntasks: [{text: a}]\n");
  put(join(changes, "archive", "2026-01-10-add-gamma", "spec.md"), spec);
  const res = run(dir, "list", "--project", "p");
  expect(res.status).toBe(0);
  expect(res.stdout).toBe(
    "theway changes — p\n\nActive changes\n\n  add-alpha            3 files   1/3 tasks done\n  update-beta          1 files   invalid: not found\n  update-gone          1 files   invalid: version: must be theway.change/v1beta\n\nArchived changes (1)\n\n  2026-01-10-add-gamma\n\nSummary: 3 active change(s), 1 archived.\n",
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
  put(join(data, "projects", "p", "changes", "add-x", "change.yaml"), changeYaml([true]));
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
    "",
  ].join("\n");
}

test("config prints the global values, defaults for the keys it lacks, every key in schema order", () => {
  const dir = home();
  put(join(dir, "config.yaml"), "# c\nstandards:\n  sre:\n    enabled: true\n");
  const res = run(dir, "config", "--project", "p");
  expect([res.status, res.stderr]).toEqual([0, ""]);
  expect(res.stdout).toBe(effective({ "standards.sre.enabled": "true" }));
});

test("config warns about the retired workflow key as an unknown key, whatever its value, and keeps the defaults", () => {
  for (const text of ["workflow:\n  defaults: {}\n", "workflow:\n  defaults:\n    review:\n      rounds: 2\n  review_rounds: 2\n"]) {
    const dir = home();
    put(join(dir, "config.yaml"), text);
    const res = run(dir, "config", "--project", "p");
    expect([res.status, res.stdout, res.stderr]).toEqual([0, effective(), "theway: warning: config.yaml: unknown key workflow; ignored\n"]);
  }
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
  put(join(dir, "config.yaml"), "changes:\n  a: 1\n  b: 2\nstandards: opus\n");
  put(join(dir, "projects", "p", "config.yaml"), "- standards\n");
  const res = run(dir, "config", "--project", "p");
  expect(res.status).toBe(0);
  expect(res.stdout).toBe(effective());
  expect(res.stderr).toBe(
    [
      "theway: warning: config.yaml: unknown key changes; ignored",
      "theway: warning: config.yaml: standards must be a map; ignored",
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

test("standards does not list the global interaction.md, develop.md and authority.md, which .shipped.json does not list", () => {
  const dir = home();
  const g = join(dir, "standards");
  put(join(dir, ".shipped.json"), "{}\n");
  for (const name of ["interaction.md", "develop.md", "authority.md", "own.md"]) put(join(g, name), "x\n");
  put(join(dir, "config.yaml"), "");
  const res = run(dir, "standards", "--project", "p", "engineering");
  expect([res.status, res.stdout, res.stderr]).toEqual([0, `${join(g, "own.md")}\n`, ""]);
});

test("context engineering lists no authority.md, with and without it in .shipped.json", () => {
  const dir = home();
  const g = join(dir, "standards");
  put(join(g, "authority.md"), "# Authority\n");
  put(join(dir, "config.yaml"), "");
  for (const manifest of ["{}\n", `${JSON.stringify({ "standards/authority.md": "x" })}\n`]) {
    put(join(dir, ".shipped.json"), manifest);
    const res = run(dir, "context", "--project", "p", "engineering");
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("standards: []\n");
    expect(res.stdout).not.toContain("authority.md");
  }
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

test("authority prints authority.md whole, else authority.default.md, else exits 1", () => {
  const dir = home();
  const kept = join(dir, "standards", "authority.md");
  const shipped = join(dir, "standards", "authority.default.md");
  const missing = `theway: no ${kept}; run npx --yes @pixelfactoryio/theway@latest install, then /reload-plugins\n`;
  const none = run(dir, "authority");
  expect([none.status, none.stdout, none.stderr]).toEqual([1, "", missing]);
  put(shipped, "# Authority\n\n- shipped\n");
  expect(run(dir, "authority").stdout).toBe("# Authority\n\n- shipped\n");
  put(kept, "# Authority\n\n- kept\n\n## More\n\n- two\n\n\n");
  const res = run(dir, "authority");
  expect([res.status, res.stdout, res.stderr]).toEqual([0, "# Authority\n\n- kept\n\n## More\n\n- two\n", ""]);
  put(kept, "- last");
  expect(run(dir, "authority").stdout).toBe("- last\n");
  rmSync(kept);
  rmSync(shipped);
  expect(run(dir, "authority").stderr).toBe(missing);
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
  put(join(dir, "projects", key, "changes", "add-x", "change.yaml"), changeYaml([true]));
  expect(runIn(cwd, dir, "list").stdout).toStartWith(`theway changes — ${key}\n\nActive changes\n\n  add-x `);
  expect(runIn(cwd, dir, "path", "add-x").stdout).toBe(`${join(dir, "projects", key, "changes", "add-x")}\n`);
  const res = runIn(cwd, dir, "archive", "add-x");
  expect(res.status).toBe(0);
  expect(res.stdout).toStartWith(`Archived: ${join(dir, "projects", key, "changes", "archive")}/`);
});

test("removeIfEmpty removes only an empty folder and never follows a symlink", () => {
  const dir = home();
  const empty = join(dir, "empty");
  mkdirSync(empty);
  const full = join(dir, "full");
  put(join(full, "f"), "x");
  const target = join(dir, "target");
  mkdirSync(target);
  const link = join(dir, "link");
  symlinkSync(target, link);
  expect(removeIfEmpty(join(dir, "missing"))).toBe(true);
  expect(removeIfEmpty(empty)).toBe(true);
  expect(existsSync(empty)).toBe(false);
  expect(removeIfEmpty(full)).toBe(false);
  expect(removeIfEmpty(join(full, "f"))).toBe(false);
  expect(removeIfEmpty(link)).toBe(false);
  expect(lstatSync(link).isSymbolicLink()).toBe(true);
  expect(existsSync(target)).toBe(true);
});

// ---- theway.workflow/v1beta ----

const FIXTURE_HOME = join(import.meta.dirname, "..", "plugin", "home");

/** A home whose `workflows/` and `prompts/` are copies of the shipped ones in `plugin/home/`. */
function fixtureHome(): string {
  const dir = home();
  for (const folder of ["workflows", "prompts"]) {
    for (const f of readdirSync(join(FIXTURE_HOME, folder))) put(join(dir, folder, f), readFileSync(join(FIXTURE_HOME, folder, f), "utf-8"));
  }
  return dir;
}

type V1betaRun = { label: string; with: Record<string, string>; prompt: string };
type V1betaStep = {
  uses: string;
  file: string;
  runs: V1betaRun[];
  on_fail: { uses: string; with: Record<string, string>; prompt: string } | null;
  tries: number | null;
};
type V1betaDoc = { resolved: boolean; inputs: Record<string, { value: string | null }>; steps: V1betaStep[] };

const v1beta = (dir: string, ...args: string[]) => run(dir, "workflow", "--project", "p", ...args);
const v1betaDoc = (dir: string, ...args: string[]): V1betaDoc => JSON.parse(v1beta(dir, ...args).stdout) as V1betaDoc;

test("v1beta: agents without --input prints resolved false, six steps, the review matrix and the triage on-fail", () => {
  const dir = fixtureHome();
  const res = v1beta(dir, "agents");
  expect([res.status, res.stderr]).toEqual([0, ""]);
  const doc = JSON.parse(res.stdout) as V1betaDoc;
  expect(doc.resolved).toBe(false);
  expect(doc.inputs.change?.value).toBeNull();
  expect(doc.steps.map((s) => s.uses)).toEqual([
    "prompts/branch.md",
    "prompts/implement.md",
    "prompts/review.md",
    "prompts/triage.md",
    "prompts/open-pr.md",
    "prompts/ci.md",
  ]);
  expect(doc.steps[2]?.runs.map((r) => r.label)).toEqual(["3.review[prompts/conformance.md]", "3.review[prompts/correctness.md]"]);
  expect([doc.steps[3]?.on_fail?.uses, doc.steps[3]?.tries]).toEqual(["prompts/fix-review.md", 1]);
  expect(doc.steps[1]?.runs[0]?.prompt).toContain("${{ inputs.change }}");
});

test("v1beta: agents with --input substitutes every reference theway knows and keeps the lens as written", () => {
  const dir = fixtureHome();
  const doc = v1betaDoc(dir, "agents", "--input", "change=add-foo");
  expect(doc.resolved).toBe(true);
  expect(doc.inputs.change?.value).toBe("add-foo");
  const substituted = JSON.stringify(doc.steps.map((s) => [s.runs, s.on_fail]));
  expect(substituted).not.toContain("${{ inputs.");
  expect(substituted).not.toContain("${{ matrix.");
  expect(doc.steps[1]?.runs[0]?.prompt).toContain("add-foo");
  expect(doc.steps[2]?.runs[0]?.prompt).toContain("prompts/conformance.md");
  expect(doc.steps[2]?.runs[1]?.prompt).toContain("prompts/correctness.md");
  expect(doc.steps[3]?.on_fail?.with).toEqual({ change: "add-foo" });
});

test("v1beta: the resolved agents workflow matches test/fixtures/agents-resolved.json", () => {
  const dir = fixtureHome();
  const res = v1beta(dir, "agents", "--input", "change=add-foo");
  expect(res.status).toBe(0);
  const expected = readFileSync(join(import.meta.dirname, "fixtures", "agents-resolved.json"), "utf-8").replaceAll("<home>", dir);
  expect(res.stdout).toBe(expected);
});

test("v1beta: --compact prints the resolved workflow without prompt text, descriptions or the as-written with", () => {
  const dir = fixtureHome();
  const res = v1beta(dir, "agents", "--input", "change=add-foo", "--compact");
  expect([res.status, res.stderr]).toEqual([0, ""]);
  const doc = JSON.parse(res.stdout) as Record<string, unknown> & { steps: Record<string, unknown>[] };
  const full = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "agents-resolved.json"), "utf-8").replaceAll("<home>", dir));
  expect(Object.keys(doc)).toEqual(["name", "file", "resolved", "runs_on", "inputs", "steps"]);
  expect([doc.name, doc.file, doc.resolved, doc.runs_on, doc.inputs]).toEqual([full.name, full.file, true, "agents", full.inputs]);
  expect(doc.steps.map((s) => Object.keys(s))).toEqual(
    doc.steps.map(() => ["index", "uses", "file", "runs_on", "model", "matrix", "runs", "on_fail", "tries"]),
  );
  expect(doc.steps[1]).toEqual({
    index: 1,
    uses: "prompts/implement.md",
    file: join(dir, "prompts", "implement.md"),
    runs_on: "agents",
    model: "opus",
    matrix: null,
    runs: [{ label: "2.implement", with: { change: "add-foo", commit: "yes" } }],
    on_fail: null,
    tries: null,
  });
  expect(doc.steps[2]?.runs).toEqual([
    { label: "3.review[prompts/conformance.md]", with: { change: "add-foo", lens: "prompts/conformance.md" } },
    { label: "3.review[prompts/correctness.md]", with: { change: "add-foo", lens: "prompts/correctness.md" } },
  ]);
  expect(doc.steps[3]?.on_fail).toEqual({
    uses: "prompts/fix-review.md",
    file: join(dir, "prompts", "fix-review.md"),
    model: "opus",
    label: "4.fix-review",
    with: { change: "add-foo" },
  });
  expect(res.stdout).not.toContain('"prompt"');
  expect(JSON.stringify(doc.steps)).not.toContain('"description"');
  expect(res.stdout.length).toBeLessThan(full.steps.length * 1000);
});

test("v1beta: --compact checks the workflow as without it", () => {
  const dir = fixtureHome();
  for (const args of [["agents", "--input", "nope=1"], ["agents", "--input", "change=Bad ID"], ["missing"]]) {
    const plain = v1beta(dir, ...args);
    const compact = v1beta(dir, ...args, "--compact");
    expect(plain.status).toBe(1);
    expect([compact.status, compact.stderr, compact.stdout]).toEqual([1, plain.stderr, ""]);
  }
  const unresolved = JSON.parse(v1beta(dir, "agents", "--compact").stdout) as V1betaDoc;
  expect([unresolved.resolved, unresolved.inputs.change?.value]).toEqual([false, null]);
});

test("v1beta: prompt files with CRLF line endings or a leading BOM resolve like their LF version", () => {
  const dir = fixtureHome();
  const lf = v1beta(dir, "agents", "--input", "change=add-foo");
  expect([lf.status, lf.stderr]).toEqual([0, ""]);
  const prompts = join(dir, "prompts");
  const originals = readdirSync(prompts).map((f) => [join(prompts, f), readFileSync(join(prompts, f), "utf-8")] as const);
  for (const rewrite of [(t: string) => t.replaceAll("\n", "\r\n"), (t: string) => `﻿${t}`]) {
    for (const [path, text] of originals) put(path, rewrite(text));
    const res = v1beta(dir, "agents", "--input", "change=add-foo");
    expect([res.status, res.stderr, res.stdout]).toEqual([0, "", lf.stdout]);
  }
});

test("v1beta: workflow --help shows no default for --input", () => {
  const res = run(home(), "workflow", "--help");
  expect(res.status).toBe(0);
  expect(res.stdout).toContain("--input <name=value>");
  expect(res.stdout).not.toContain("(default: [])");
});

test("v1beta: other ${{ … }} text in a prompt body is kept as written", () => {
  const dir = fixtureHome();
  const ci = join(dir, "prompts", "ci.md");
  put(ci, `${readFileSync(ci, "utf-8")}\nThe commit is \${{ github.sha }}.\n`);
  const res = v1beta(dir, "agents", "--input", "change=add-foo");
  expect(res.status).toBe(0);
  const doc = JSON.parse(res.stdout) as V1betaDoc;
  expect(doc.steps[5]?.runs[0]?.prompt).toContain("${{ github.sha }}");
});

test("v1beta: develop, engineering and engineering-light resolve", () => {
  const dir = fixtureHome();
  for (const name of ["develop", "engineering", "engineering-light"]) {
    expect([name, v1beta(dir, name).status]).toEqual([name, 0]);
  }
  const develop = v1betaDoc(dir, "develop", "--input", "change=add-foo");
  expect(develop.steps[0]?.runs[0]?.with).toEqual({ change: "add-foo", commit: "no" });
});

test("v1beta: --input refuses an invalid change ID and an undeclared input", () => {
  const dir = fixtureHome();
  const bad = v1beta(dir, "agents", "--input", "change=Bad_ID");
  expect(bad.status).toBe(1);
  expect(bad.stderr.startsWith("theway: --input change:")).toBe(true);
  const nope = v1beta(dir, "agents", "--input", "nope=x");
  expect(nope.status).toBe(1);
  expect(nope.stderr).toContain("theway: --input nope: workflows/agents.yaml declares no such input\n");
});

test("workflow with no name resolves the one workflow that sets default: true, the shipped develop", () => {
  const dir = fixtureHome();
  const res = v1beta(dir);
  expect([res.status, res.stderr]).toEqual([0, ""]);
  expect((JSON.parse(res.stdout) as { name: string }).name).toBe("develop");
  const given = v1beta(dir, "--input", "change=add-foo");
  expect([given.status, given.stderr]).toEqual([0, ""]);
  expect(given.stdout).toBe(v1beta(dir, "develop", "--input", "change=add-foo").stdout);
  const own = join(dir, "projects", "p", "workflows", "develop.yaml");
  put(own, readFileSync(join(dir, "workflows", "develop.yaml"), "utf-8").replace("default: true\n", ""));
  const none = v1beta(dir);
  expect([none.status, none.stdout, none.stderr]).toEqual([1, "", "theway: no workflow sets default: true\n"]);
});

test("workflow with no name exits 1 naming both files when two workflows set default: true", () => {
  const dir = fixtureHome();
  const agents = join(dir, "workflows", "agents.yaml");
  put(agents, readFileSync(agents, "utf-8").replace("inputs:\n", "default: true\ninputs:\n"));
  const res = v1beta(dir);
  expect([res.status, res.stdout, res.stderr]).toEqual([1, "", "theway: workflows/agents.yaml and workflows/develop.yaml both set default: true\n"]);
  rmSync(agents);
  put(join(dir, "projects", "p", "workflows", "mine.yaml"), readFileSync(join(dir, "workflows", "develop.yaml"), "utf-8"));
  const own = v1beta(dir);
  expect([own.status, own.stdout, own.stderr]).toEqual([
    1,
    "",
    "theway: workflows/develop.yaml and projects/p/workflows/mine.yaml both set default: true\n",
  ]);
});

test("workflow exits 1 on a v1 file with the line naming the new version, and the other workflows still resolve", () => {
  const dir = fixtureHome();
  put(join(dir, "workflows", "old.yaml"), "version: theway.workflow/v1\ndescription: Old\nsteps:\n  - implement:\n");
  const old = v1beta(dir, "old");
  expect([old.status, old.stdout, old.stderr]).toEqual([
    1,
    "",
    "theway: workflows/old.yaml: theway.workflow/v1 is no longer read: rewrite it as theway.workflow/v1beta\n",
  ]);
  const agents = v1beta(dir, "agents");
  expect([agents.status, agents.stderr]).toEqual([0, ""]);
});

test("workflow with no name names the v1 files when no v1beta workflow sets default: true, and never takes a v1 file as the default", () => {
  const dir = fixtureHome();
  const develop = join(dir, "workflows", "develop.yaml");
  // A kept v1 develop.yaml, with the v1beta text beside it as develop.default.yaml.
  put(join(dir, "workflows", "develop.default.yaml"), readFileSync(develop, "utf-8"));
  put(develop, "version: theway.workflow/v1\ndescription: Old develop\nsteps:\n  - implement:\n");
  const none = v1beta(dir);
  expect([none.status, none.stdout, none.stderr]).toEqual([
    1,
    "",
    "theway: workflows/develop.yaml: theway.workflow/v1 is no longer read: rewrite it as theway.workflow/v1beta\n",
  ]);
  // A v1 file with default: true is not a default: the v1beta one still runs, with no "both set" error.
  put(join(dir, "workflows", "old.yaml"), "version: theway.workflow/v1\ndefault: true\ndescription: Old\nsteps:\n  - implement:\n");
  put(join(dir, "workflows", "mine.yaml"), readFileSync(join(dir, "workflows", "develop.default.yaml"), "utf-8"));
  const one = v1beta(dir);
  expect([one.status, one.stderr]).toEqual([0, ""]);
  expect((JSON.parse(one.stdout) as { name: string }).name).toBe("mine");
});

test("steps is no longer a command", () => {
  const res = run(home(), "steps");
  expect(res.status).toBe(1);
  expect(res.stderr).toBe("error: unknown command 'steps'\n");
});

const T_HEAD = `version: theway.workflow/v1beta
description: t
inputs:
  change: {description: c, required: true, type: change}
runs-on: agents
`;
const OPEN_PR = "  - uses: prompts/open-pr.md\n    with:\n      change: ${{ inputs.change }}\n";

/** Writes `workflows/t.yaml` and runs `theway workflow t`. */
function tWorkflow(dir: string, text: string) {
  put(join(dir, "workflows", "t.yaml"), text);
  return v1beta(dir, "t");
}

/** Replaces `from` by `to` in the fixture prompt `name`. */
function editPrompt(dir: string, name: string, from: string, to: string): void {
  const path = join(dir, "prompts", `${name}.md`);
  const text = readFileSync(path, "utf-8");
  expect(text).toContain(from);
  put(path, text.replace(from, to));
}

test("v1beta: each mistake gives one line naming its place, and nothing on stdout", () => {
  const cases: [string, string, ((dir: string) => void)?][] = [
    [`${T_HEAD}steps:\n  - uses: prompts/nope.md\n`, "workflows/t.yaml: steps[0].uses: "],
    [`${T_HEAD}steps:\n${OPEN_PR}    on-fail: prompts/nope.md\n    tries: 1\n`, "workflows/t.yaml: steps[0].on-fail: "],
    [`${T_HEAD}steps:\n${OPEN_PR}      nope: x\n`, "workflows/t.yaml: steps[0].with: prompts/open-pr.md declares no input nope"],
    [`${T_HEAD}steps:\n  - uses: prompts/open-pr.md\n`, "workflows/t.yaml: steps[0].with: required input change is not set"],
    [`${T_HEAD}steps:\n  - uses: prompts/open-pr.md\n    with:\n      change: \${{ inputs.nope }}\n`, "workflows/t.yaml: steps[0].with: ${{ inputs.nope }}"],
    [
      `${T_HEAD}steps:\n  - uses: prompts/review.md\n    with:\n      change: \${{ inputs.change }}\n      lens: \${{ matrix.lens }}\n`,
      "workflows/t.yaml: steps[0].with: ${{ matrix.lens }}",
    ],
    [
      `${T_HEAD}steps:\n  - uses: prompts/triage.md\n    matrix:\n      lens: [a]\n    with:\n      change: \${{ inputs.change }}\n    on-fail:\n      uses: prompts/fix-review.md\n      with:\n        change: \${{ matrix.lens }}\n    tries: 1\n`,
      "workflows/t.yaml: steps[0].on-fail.with: ${{ matrix.lens }}",
    ],
    [`${T_HEAD}steps:\n${OPEN_PR}`, "prompts/open-pr.md: body: ${{ inputs.nope }}", (dir) => editPrompt(dir, "open-pr", "# Open the PR", "# Open the PR ${{ inputs.nope }}")],
    [`${T_HEAD}steps:\n${OPEN_PR}    on-fail: prompts/fix-ci.md\n`, "workflows/t.yaml: steps[0].on-fail: "],
    [`${T_HEAD}steps:\n${OPEN_PR}    tries: 1\n`, "workflows/t.yaml: steps[0].tries: "],
    [`${T_HEAD}steps:\n${OPEN_PR}    on-fail: prompts/fix-ci.md\n    tries: 0\n`, "workflows/t.yaml: steps[0].tries: "],
    [`${T_HEAD}steps:\n${OPEN_PR}    on-fail: prompts/fix-ci.md\n    tries: 11\n`, "workflows/t.yaml: steps[0].tries: "],
    [`${T_HEAD}steps:\n${OPEN_PR}    foo: 1\n`, "workflows/t.yaml: steps[0].foo: "],
    [`${T_HEAD}steps:\n  - with:\n      change: x\n`, "workflows/t.yaml: steps[0]: uses is required"],
    [`${T_HEAD}steps: []\n`, "workflows/t.yaml: steps: "],
    [`${T_HEAD}steps:\n${OPEN_PR}    matrix:\n      a: [x]\n      b: [y]\n`, "workflows/t.yaml: steps[0].matrix: "],
    [`${T_HEAD}steps:\n${OPEN_PR}    matrix:\n      a: []\n`, "workflows/t.yaml: steps[0].matrix: "],
    [
      `${T_HEAD}steps:\n  - uses: prompts/review.md\n    matrix:\n      lens: [x]\n      other: [y]\n    with:\n      change: \${{ inputs.change }}\n      lens: \${{ matrix.lens }}\n`,
      "workflows/t.yaml: steps[0].matrix: must be a map with exactly one key",
    ],
    [
      `${T_HEAD}steps:\n  - uses: prompts/review.md\n    matrix:\n      lens: []\n    with:\n      change: \${{ inputs.change }}\n      lens: \${{ matrix.other }}\n`,
      "workflows/t.yaml: steps[0].matrix: lens must be a non-empty list of strings",
    ],
    [`${T_HEAD}steps:\n  - uses: prompts/branch.md\n    with:\n      change: \${{ inputs.change }}\n`, "workflows/t.yaml: steps[0].model: "],
    [`${T_HEAD.replace("description: t\n", "")}steps:\n${OPEN_PR}`, "workflows/t.yaml: description: "],
    [`${T_HEAD.replace("runs-on: agents\n", "")}steps:\n${OPEN_PR}`, "workflows/t.yaml: runs-on: "],
    [`${T_HEAD.replace("runs-on: agents\n", "runs-on: cloud\n")}steps:\n${OPEN_PR}`, "workflows/t.yaml: runs-on: "],
    [`${T_HEAD}steps:\n  - uses: prompts/conformance.md\n`, "prompts/conformance.md: header: "],
    [`${T_HEAD}steps:\n${OPEN_PR}`, "prompts/open-pr.md: foo: unknown key", (dir) => editPrompt(dir, "open-pr", "model: sonnet\n", "model: sonnet\nfoo: 1\n")],
    [
      `${T_HEAD}steps:\n${OPEN_PR}`,
      "prompts/open-pr.md: inputs.change: ",
      (dir) => editPrompt(dir, "open-pr", "    required: true\n", "    required: true\n    default: x\n"),
    ],
  ];
  for (const [text, place, setup] of cases) {
    const dir = fixtureHome();
    setup?.(dir);
    const res = tWorkflow(dir, text);
    const lines = res.stderr.split("\n").filter((l) => l !== "");
    expect([place, res.status, res.stdout, lines.length]).toEqual([place, 1, "", 1]);
    expect(lines[0]?.startsWith(`theway: ${place}`)).toBe(true);
  }
});

test("v1beta: two mistakes in one file give two lines, in file order", () => {
  const dir = fixtureHome();
  const res = tWorkflow(dir, `${T_HEAD}steps:\n${OPEN_PR}    tries: 0\n    on-fail: prompts/fix-ci.md\n${OPEN_PR}    foo: 1\n`);
  expect(res.status).toBe(1);
  expect(res.stderr).toBe("theway: workflows/t.yaml: steps[0].tries: must be an integer from 1 to 10\ntheway: workflows/t.yaml: steps[1].foo: unknown key\n");
});

test("v1beta: a required prompt input written empty or null is not set, never a type error", () => {
  for (const value of [' ""', ""]) {
    const dir = fixtureHome();
    const res = tWorkflow(dir, `${T_HEAD}steps:\n  - uses: prompts/open-pr.md\n    with:\n      change:${value}\n`);
    expect([res.status, res.stdout, res.stderr]).toEqual([1, "", "theway: workflows/t.yaml: steps[0].with: required input change is not set\n"]);
  }
});

test("v1beta: an optional prompt input written empty or null is the empty string, not its default", () => {
  for (const value of [' ""', ""]) {
    const dir = fixtureHome();
    const path = join(dir, "workflows", "develop.yaml");
    const text = readFileSync(path, "utf-8");
    expect(text).toContain('commit: "no"');
    put(path, text.replace('commit: "no"', `commit:${value}`));
    const doc = v1betaDoc(dir, "develop", "--input", "change=add-foo");
    expect(doc.steps[0]?.runs[0]?.with).toEqual({ change: "add-foo", commit: "" });
  }
});

test("v1beta: a required workflow input given empty is not given", () => {
  const dir = fixtureHome();
  const res = v1beta(dir, "engineering-light", "--input", "request=");
  expect([res.status, res.stdout, res.stderr]).toEqual([1, "", "theway: --input request: required input is not given\n"]);
  const change = v1beta(dir, "agents", "--input", "change=");
  expect([change.status, change.stdout, change.stderr]).toEqual([1, "", "theway: --input change: required input is not given\n"]);
});

test("v1beta: the default of a change input must be a valid change ID", () => {
  const dir = fixtureHome();
  const head = T_HEAD.replace("{description: c, required: true, type: change}", "{description: c, default: Bad_ID, type: change}");
  const res = tWorkflow(dir, `${head}steps:\n${OPEN_PR}`);
  expect([res.status, res.stdout]).toEqual([1, ""]);
  expect(res.stderr).toBe("theway: workflows/t.yaml: inputs.change: default must be lowercase letters and digits in words separated by single hyphens\n");
});

test("v1beta: a name or key with a newline stays on one error line", () => {
  const dir = fixtureHome();
  const input = v1beta(dir, "agents", "--input", "no\npe=x");
  expect([input.status, input.stderr.split("\n")[0]]).toEqual([1, "theway: --input no\\npe: workflows/agents.yaml declares no such input"]);
  const res = tWorkflow(dir, `${T_HEAD}"fo\\no": 1\nsteps:\n${OPEN_PR}      "ba\\nr": x\n    "ba\\nz": 1\n`);
  expect(res.status).toBe(1);
  expect(res.stderr).toBe(
    [
      "theway: workflows/t.yaml: fo\\no: unknown key",
      "theway: workflows/t.yaml: steps[0].with: prompts/open-pr.md declares no input ba\\nr",
      "theway: workflows/t.yaml: steps[0].ba\\nz: unknown key",
      "",
    ].join("\n"),
  );
});

test("v1beta: a project copy of a prompt replaces the global one for that project only", () => {
  const dir = fixtureHome();
  const own = join(dir, "projects", "p", "prompts", "review.md");
  put(own, readFileSync(join(dir, "prompts", "review.md"), "utf-8").replace("# Review", "# Project review"));
  const mine = v1betaDoc(dir, "agents", "--input", "change=add-foo").steps[2] as V1betaStep;
  expect([mine.file, mine.runs[0]?.prompt.startsWith("# Project review")]).toEqual([own, true]);
  const other = JSON.parse(run(dir, "workflow", "--project", "q", "agents", "--input", "change=add-foo").stdout) as V1betaDoc;
  expect([other.steps[2]?.file, other.steps[2]?.runs[0]?.prompt.startsWith("# Review")]).toEqual([join(dir, "prompts", "review.md"), true]);
});

test("v1beta: NAME, MODELS and PARAM are defined in language-schema only; schema re-exports them", async () => {
  const schema = await import("../src/core/schema");
  const language = await import("../src/core/language-schema");
  expect([schema.NAME, schema.MODELS, schema.PARAM]).toEqual([language.NAME, language.MODELS, language.PARAM]);
  expect(schema.NAME).toBe(language.NAME);
  const text = readFileSync(join(import.meta.dirname, "..", "src", "core", "schema.ts"), "utf-8");
  expect(text).not.toMatch(/export const (NAME|MODELS|PARAM)\b/);
  expect(text).toContain('export { MODELS, NAME, PARAM } from "./language-schema";');
  const { resolveWorkflowFile, parsePromptFile } = await import("../src/core/language");
  expect([typeof resolveWorkflowFile, typeof parsePromptFile]).toEqual(["function", "function"]);
});

test("v1beta: listWorkflowFiles lists the four workflows, and a v1 file with its error", async () => {
  const { listWorkflowFiles } = await import("../src/core/language");
  const dir = fixtureHome();
  const warned: string[] = [];
  const before = listWorkflowFiles(dir, "p", (f, t) => warned.push(`${f}: ${t}`));
  expect(before).toEqual([
    { name: "agents", scope: "global", description: "Implement, review and open the PR through agents", default: false },
    { name: "develop", scope: "global", description: "The tasks done inline in your session, on the working tree, nothing committed", default: true },
    { name: "engineering", scope: "global", description: "Investigate a request and write its spec and tasks, then review them", default: false },
    { name: "engineering-light", scope: "global", description: "A short spec and 1 to 3 tasks, reviewed by one grounding critic", default: false },
  ]);
  put(join(dir, "workflows", "old.yaml"), "version: theway.workflow/v1\ndescription: Old\nsteps:\n  - implement:\n");
  const after = listWorkflowFiles(dir, "p", (f, t) => warned.push(`${f}: ${t}`));
  expect(after.filter((w) => w.name !== "old")).toEqual(before);
  expect(after.find((w) => w.name === "old")).toEqual({
    name: "old",
    scope: "global",
    description: "Old",
    default: false,
    error: "workflows/old.yaml: theway.workflow/v1 is no longer read: rewrite it as theway.workflow/v1beta",
  });
  expect(warned).toEqual([]);
});

test("v1beta: listPromptFiles marks exactly the prompts the workflows use as steps", async () => {
  const { listPromptFiles } = await import("../src/core/language");
  const dir = fixtureHome();
  const items = listPromptFiles(dir, "p");
  expect(items.map((p) => p.name)).toEqual(readdirSync(join(FIXTURE_HOME, "prompts")).map((f) => f.slice(0, -".md".length)).sort());
  const steps = ["branch", "ci", "fix-ci", "fix-review", "fix-spec", "implement", "open-pr", "review", "scaffold", "scaffold-light", "spec-review", "spec-triage", "triage"];
  expect(items.filter((p) => p.step).map((p) => p.name)).toEqual(steps);
  for (const p of items) expect([p.name, p.scope, p.description === null]).toEqual([p.name, "global", !steps.includes(p.name)]);
});
