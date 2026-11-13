import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { checkChange } from "../src/core/change";
import {
  type ChangeEdit,
  type ChangeTask,
  changeStatus,
  changeTextErrors,
  checkChangeText,
  editedChangeText,
  REFUSAL,
} from "../src/core/change-text";

const CORE = join(import.meta.dirname, "..", "src", "core");
const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** The module names a source imports, `import type` and re-exports included. */
const importsOf = (file: string): string[] =>
  [...readFileSync(file, "utf-8").matchAll(/^(?:import|export)\b[^;]*?\bfrom\s+"([^"]+)"/gms)].map((m) => m[1] as string);

test("change-text imports only yaml and ./text, and neither has an import from node:", () => {
  expect(importsOf(join(CORE, "change-text.ts")).sort()).toEqual(["./text", "yaml"]);
  expect(importsOf(join(CORE, "text.ts"))).toEqual(["yaml"]);
  // `import type` lines count too.
  expect([...'import type { A } from "node:fs";\nimport { b } from "./x";\n'.matchAll(/^(?:import|export)\b[^;]*?\bfrom\s+"([^"]+)"/gms)].map((m) => m[1])).toEqual(["node:fs", "./x"]);
});

test("parseYaml and escaped live in text.ts and are still exported by language.ts and io.ts", async () => {
  const text = await import("../src/core/text");
  const language = await import("../src/core/language");
  const io = await import("../src/core/io");
  expect(language.parseYaml).toBe(text.parseYaml);
  expect(io.escaped).toBe(text.escaped);
  const change = await import("../src/core/change");
  expect([change.CHANGE_VERSION, change.CHANGE_FILE]).toEqual(["theway.change/v1beta", "change.yaml"]);
});

const v = "version: theway.change/v1beta\n";
const d = "description: Do it\n";
const t = "tasks:\n  - text: a\n";

/** Texts of `change.yaml`, valid and invalid, as `checkChange`'s tests cover them. */
const CASES = [
  "a: [\n",
  "- a\n",
  "",
  `version: theway.change/v1\n${d}${t}`,
  `${v}description: ""\n${t}`,
  `${v}description: "a\\nb"\n${t}`,
  `${v}${d}tasks: []\n`,
  `${v}${d}tasks: a\n`,
  `${v}${d}tasks:\n  - text: a\n  - b\n`,
  `${v}${d}tasks:\n  - text: ""\n`,
  `${v}${d}tasks:\n  - done: true\n`,
  `${v}${d}tasks:\n  - text: a\n    done: "yes"\n`,
  `${v}${d}tasks:\n  - text: a\n    owner: me\n`,
  `${v}${d}${t}phase: 1\n`,
  `${d}${t}`,
  `${v}${t}`,
  `${v}${d}`,
  `phase: 1\nversion: x\n${t}`,
  `${v}${d}tasks:\n  - &t\n    text: one\n  - *t\n`,
  `${v}${d}tasks:\n  - text: a\n    done: true\n  - text: b\n`,
];

test("checkChangeText gives for a text what checkChange gives for a folder holding it", () => {
  const dir = mkdtempSync(join(tmpdir(), "theway-change-text-"));
  dirs.push(dir);
  expect(checkChange(dir)).toEqual({ issues: ["not found"] });
  for (const text of CASES) {
    writeFileSync(join(dir, "change.yaml"), text);
    expect([text, checkChangeText(text)]).toEqual([text, checkChange(dir)]);
  }
});

test("changeTextErrors places each issue on the line of the node its path names", () => {
  const lines = (text: string) => changeTextErrors(text).map((e) => [e.text.startsWith("invalid YAML") ? "invalid YAML" : e.text, e.line]);
  expect(lines(`${v}${d}tasks:\n  - text: a\n`)).toEqual([]);
  expect(lines(`${v}${d}tasks: [\n`)).toEqual([["invalid YAML", 4]]);
  expect(lines("- a\n")).toEqual([["must be a map", null]]);
  expect(lines(`version: x\n${d}${t}`)).toEqual([["version: must be theway.change/v1beta", 1]]);
  expect(lines(`${v}${d}tasks:\n  - text: a\n  - b\n`)).toEqual([["tasks[1]: must be a map", 5]]);
  expect(lines(`${v}${d}tasks:\n  - text: a\n    owner: me\n`)).toEqual([["tasks[0].owner: unknown key", 5]]);
  expect(lines(`${v}${d}tasks:\n  - text: a\n  - done: true\n`)).toEqual([["tasks[1].text: is required", 5]]);
  expect(lines(`${v}${d}${t}phase: 1\n`)).toEqual([["phase: unknown key", 5]]);
  expect(lines(`${d}${t}`)).toEqual([["version: is required", 1]]);
  expect(lines(`${v}${t}`)).toEqual([["description: is required", 1]]);
  expect(lines(`${v}${d}tasks:\n  - text: {k: &a v}\n`)).toEqual([["tasks[0].text: anchors and aliases are not allowed", 4]]);
  expect(lines(`&r\n${v}${d}${t}`)).toEqual([["anchors and aliases are not allowed", null]]);
});

test("changeStatus gives the API slug of each status of an active change", () => {
  const status = (text: string) => changeStatus(checkChangeText(text));
  expect(status("version: x\n")).toBe("invalid");
  expect(status(`${v}${d}tasks:\n  - text: a\n  - text: b\n`)).toBe("not-started");
  expect(status(`${v}${d}tasks:\n  - text: a\n    done: true\n  - text: b\n`)).toBe("in-progress");
  expect(status(`${v}${d}tasks:\n  - text: a\n    done: true\n`)).toBe("ready");
});

/** A file with comments, quoted and plain scalars and a `>-` description; its reprint differs from it. */
const BLOCK = `# A change
version: theway.change/v1beta
description: >-
  Limit requests
  per API key
tasks:
  # the list
  - text: "Add a bucket"   # first
  # above second
  - text: 'Answer 429'
    done: true
  - text: Read the limit
    done: false
  # above fourth
  - text: Document it
# end
`;

/** The same change in flow style. */
const FLOW = `# A change
{version: theway.change/v1beta, description: "Limit requests per API key", tasks: [{text: "Add a bucket"}, {text: 'Answer 429', done: true}, {text: Read the limit, done: false}, {text: Document it}]}
`;

const CRLF = BLOCK.replaceAll("\n", "\r\n");

const TASKS: ChangeTask[] = [
  { text: "Add a bucket", done: false },
  { text: "Answer 429", done: true },
  { text: "Read the limit", done: false },
  { text: "Document it", done: false },
];

/** The comments of a YAML text, in order. */
const commentsOf = (text: string): string[] => [...text.matchAll(/(?:^|[ \t])(#[^\r\n]*)/gm)].map((m) => (m[1] as string).trimEnd());

/** The text an edit gives, failing the test on a refusal. */
function edited(text: string, edit: ChangeEdit): string {
  const r = editedChangeText(text, edit);
  if ("reason" in r) throw new Error(r.reason);
  return r.text;
}

/** The change a text holds, failing the test when it does not pass the check. */
function changeOf(text: string): { description: string; tasks: ChangeTask[] } {
  const c = checkChangeText(text);
  if ("issues" in c) throw new Error(c.issues.join("; "));
  return c.change;
}

const moved = <T>(list: T[], from: number, to: number): T[] => {
  const out = [...list];
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item as T);
  return out;
};

/** Each edit, the tasks it gives and the comments it removes from BLOCK. */
const EDITS: { edit: ChangeEdit; tasks: ChangeTask[]; description?: string; removed?: string[] }[] = [
  { edit: { kind: "done", index: 0, done: true }, tasks: TASKS.map((x, i) => (i === 0 ? { ...x, done: true } : x)) },
  { edit: { kind: "done", index: 1, done: false }, tasks: TASKS.map((x, i) => (i === 1 ? { ...x, done: false } : x)) },
  { edit: { kind: "done", index: 2, done: true }, tasks: TASKS.map((x, i) => (i === 2 ? { ...x, done: true } : x)) },
  { edit: { kind: "done", index: 2, done: false }, tasks: TASKS },
  { edit: { kind: "text", index: 0, text: "Add a bucket per key" }, tasks: TASKS.map((x, i) => (i === 0 ? { ...x, text: "Add a bucket per key" } : x)) },
  { edit: { kind: "text", index: 1, text: "Answer\n429" }, tasks: TASKS.map((x, i) => (i === 1 ? { ...x, text: "Answer\n429" } : x)) },
  { edit: { kind: "text", index: 2, text: "\n \nRead the limit\n\nand the burst\n  \n" }, tasks: TASKS.map((x, i) => (i === 2 ? { ...x, text: "Read the limit\n\nand the burst" } : x)) },
  { edit: { kind: "description", text: "Limit requests per API key and per IP" }, tasks: TASKS, description: "Limit requests per API key and per IP" },
  { edit: { kind: "add", index: 4, text: "Ship it" }, tasks: [...TASKS, { text: "Ship it", done: false }] },
  { edit: { kind: "add", index: 0, text: "Plan\nit", done: true }, tasks: [{ text: "Plan\nit", done: true }, ...TASKS] },
  { edit: { kind: "add", index: 2, text: "Middle" }, tasks: [...TASKS.slice(0, 2), { text: "Middle", done: false }, ...TASKS.slice(2)] },
  { edit: { kind: "move", from: 1, to: 3 }, tasks: moved(TASKS, 1, 3) },
  { edit: { kind: "move", from: 0, to: 2 }, tasks: moved(TASKS, 0, 2) },
  { edit: { kind: "move", from: 3, to: 0 }, tasks: moved(TASKS, 3, 0) },
  { edit: { kind: "remove", index: 0 }, tasks: TASKS.slice(1), removed: ["# first"] },
  { edit: { kind: "remove", index: 1 }, tasks: TASKS.filter((_, i) => i !== 1), removed: ["# above second"] },
  { edit: { kind: "remove", index: 3 }, tasks: TASKS.slice(0, 3), removed: ["# above fourth"] },
];

test("each edit gives the expected change and keeps every comment it does not remove, in block style", () => {
  for (const { edit, tasks, description, removed = [] } of EDITS) {
    const out = edited(BLOCK, edit);
    expect([edit, changeOf(out)]).toEqual([edit, { description: description ?? "Limit requests per API key", tasks }]);
    expect([edit, commentsOf(out).sort()]).toEqual([edit, commentsOf(BLOCK).filter((c) => !removed.includes(c)).sort()]);
    expect(out).not.toContain("done: false\n    done");
    expect(out).toContain("description: >-\n");
  }
});

test("each edit gives the expected change on the same file in flow style, which stays in flow style", () => {
  for (const { edit, tasks, description } of EDITS) {
    const out = edited(FLOW, edit);
    expect([edit, changeOf(out)]).toEqual([edit, { description: description ?? "Limit requests per API key", tasks }]);
    expect([edit, commentsOf(out)]).toEqual([edit, ["# A change"]]);
    expect(out).not.toMatch(/^\s*- /m);
    expect(out).toContain("tasks:");
    expect(out.replace(/^#.*\n/, "").trimStart()).toStartWith("{");
  }
  expect(edited(FLOW, { kind: "add", index: 4, text: "Ship it", done: true })).toContain("{text: Ship it, done: true}");
});

test("each edit of a \\r\\n file gives a text whose every line break is \\r\\n", () => {
  for (const { edit, tasks, description, removed = [] } of EDITS) {
    const out = edited(CRLF, edit);
    expect([edit, /(^|[^\r])\n/.test(out)]).toEqual([edit, false]);
    expect([edit, changeOf(out)]).toEqual([edit, { description: description ?? "Limit requests per API key", tasks }]);
    expect([edit, commentsOf(out).sort()]).toEqual([edit, commentsOf(CRLF).filter((c) => !removed.includes(c)).sort()]);
  }
});

test("comments follow the items: one above a task moves with it, one above the first task stays at the top, a trailing one moves", () => {
  const lines = (text: string) => text.split("\n");
  const after = lines(edited(BLOCK, { kind: "move", from: 1, to: 3 }));
  const at = after.indexOf("  - text: 'Answer 429'");
  expect(after[at - 1]).toBe("  # above second");
  expect(after[after.indexOf("tasks:") + 1]).toBe("  # the list");

  for (const edit of [{ kind: "move", from: 0, to: 2 }, { kind: "remove", index: 0 }] as ChangeEdit[]) {
    const out = lines(edited(BLOCK, edit));
    expect(out[out.indexOf("tasks:") + 1]).toBe("  # the list");
  }
  const first = lines(edited(BLOCK, { kind: "move", from: 0, to: 3 }));
  expect(first.at(first.findIndex((l) => l.includes("Add a bucket")))).toBe('  - text: "Add a bucket" # first');
  expect(first.findIndex((l) => l.includes("Add a bucket"))).toBeGreaterThan(first.indexOf("  - text: Document it"));
});

test("unticking removes the done key, and no edit writes done: false", () => {
  const out = edited(BLOCK, { kind: "done", index: 1, done: false });
  expect(parse(out).tasks[1]).toEqual({ text: "Answer 429" });
  expect(out.match(/done: false/g)?.length).toBe(1);
  const unticked = edited(`${v}${d}tasks:\n  - text: a\n    done: false\n  - text: b\n`, { kind: "done", index: 0, done: false });
  expect(parse(unticked).tasks[0]).toEqual({ text: "a" });
  expect(unticked).not.toContain("done: false");
  for (const { edit } of EDITS) {
    const out = edited(`${v}${d}tasks:\n  - text: a\n  - text: b\n    done: true\n  - text: c\n  - text: e\n  - text: f\n`, edit);
    expect(out).not.toContain("done: false");
  }
});

test("a one-line text set on a plain node stays plain when that reads back equal, else is double-quoted", () => {
  expect(edited(BLOCK, { kind: "text", index: 2, text: "Read the burst" })).toContain("\n  - text: Read the burst\n");
  expect(edited(BLOCK, { kind: "text", index: 2, text: "Read: the burst" })).toContain('\n  - text: "Read: the burst"\n');
  expect(edited(BLOCK, { kind: "text", index: 2, text: "- a list" })).toContain('\n  - text: "- a list"\n');
  expect(edited(BLOCK, { kind: "text", index: 2, text: 'say "hi": now' })).toContain('\n  - text: "say \\"hi\\": now"\n');
  expect(edited(BLOCK, { kind: "text", index: 2, text: 'say "hi" now' })).toContain('\n  - text: say "hi" now\n');
  expect(edited(FLOW, { kind: "text", index: 2, text: "a, b" })).toContain('{text: "a, b", done: false}');
  expect(edited(FLOW, { kind: "text", index: 3, text: 'a "b"' })).toContain("{text: a \"b\"}");
  const plainDescription = `${v}${d}tasks:\n  - text: a\n`;
  expect(edited(plainDescription, { kind: "description", text: 'a: "b"' })).toContain('\ndescription: "a: \\"b\\""\n');
  expect(edited(plainDescription, { kind: "description", text: "Do it now" })).toContain("\ndescription: Do it now\n");
  // A quoted node keeps its quotes.
  expect(edited(BLOCK, { kind: "text", index: 1, text: "Answer 503" })).toContain("\n  - text: 'Answer 503'\n");
  expect(edited(BLOCK, { kind: "text", index: 0, text: "Add one" })).toContain('\n  - text: "Add one" # first\n');
});

test("a task's text of several lines reads back equal on every style of node", () => {
  const text = "First line\nsecond: line\n\nfourth line";
  for (const source of [BLOCK, FLOW, CRLF]) {
    for (const index of [0, 1, 2, 3]) expect(changeOf(edited(source, { kind: "text", index, text })).tasks[index]?.text).toBe(text);
    expect(changeOf(edited(source, { kind: "add", index: 4, text })).tasks[4]?.text).toBe(text);
  }
});

test("an edit that changes no node returns the source text, and so does one whose print equals the source", () => {
  expect(edited(BLOCK, { kind: "done", index: 2, done: true })).not.toBe(BLOCK);
  for (const edit of [
    { kind: "done", index: 0, done: false },
    { kind: "move", from: 1, to: 1 },
    { kind: "done", index: 1, done: true },
    { kind: "text", index: 3, text: "Document it" },
    { kind: "description", text: "Limit requests per API key" },
  ] as ChangeEdit[]) {
    expect([edit, edited(BLOCK, edit)]).toEqual([edit, BLOCK]);
  }
  const plain = `${v}${d}tasks:\n  - text: a\n    done: true\n  - text: b\n`;
  expect(edited(plain, { kind: "move", from: 0, to: 1 })).toBe(`${v}${d}tasks:\n  - text: b\n  - text: a\n    done: true\n`);
  expect(edited(edited(plain, { kind: "move", from: 0, to: 1 }), { kind: "move", from: 1, to: 0 })).toBe(plain);
});

test("editedChangeText refuses each case with its reason, and gives no text", () => {
  const refusals: [string, ChangeEdit, string][] = [
    [BLOCK, { kind: "done", index: 4, done: true }, REFUSAL.position],
    [BLOCK, { kind: "text", index: -1, text: "x" }, REFUSAL.position],
    [BLOCK, { kind: "add", index: 5, text: "x" }, REFUSAL.position],
    [BLOCK, { kind: "move", from: 0, to: 4 }, REFUSAL.position],
    [BLOCK, { kind: "move", from: 1.5, to: 0 }, REFUSAL.position],
    [BLOCK, { kind: "remove", index: 4 }, REFUSAL.position],
    [BLOCK, { kind: "text", index: 0, text: " \n\t" }, REFUSAL.empty],
    [BLOCK, { kind: "add", index: 0, text: "" }, REFUSAL.empty],
    [BLOCK, { kind: "description", text: "  " }, REFUSAL.empty],
    [BLOCK, { kind: "description", text: "one\ntwo" }, REFUSAL.oneLine],
    [BLOCK, { kind: "description", text: "one\rtwo" }, REFUSAL.oneLine],
    [`${v}${d}${t}`, { kind: "remove", index: 0 }, REFUSAL.lastTask],
    ["version: x\n", { kind: "done", index: 0, done: true }, REFUSAL.check],
    [`${v}${d}tasks: [\n`, { kind: "add", index: 0, text: "x" }, REFUSAL.check],
    [`${v}${d}tasks:\n  - &t\n    text: one\n`, { kind: "done", index: 0, done: true }, REFUSAL.check],
  ];
  for (const [source, edit, reason] of refusals) expect([edit, editedChangeText(source, edit)]).toEqual([edit, { reason }]);
  expect(Object.values(REFUSAL).sort()).toEqual(
    ["no task at that position", "text is empty", "description must be one line", "a change keeps at least one task", "change.yaml does not pass the check"].sort(),
  );
});

test("every result passes the check", () => {
  for (const source of [BLOCK, FLOW, CRLF]) for (const { edit } of EDITS) expect("change" in checkChangeText(edited(source, edit))).toBe(true);
});

test("checkChange answers not found when change.yaml is a folder", () => {
  const dir = mkdtempSync(join(tmpdir(), "theway-change-text-"));
  dirs.push(dir);
  mkdirSync(join(dir, "change.yaml"));
  expect(checkChange(dir)).toEqual({ issues: ["not found"] });
});
