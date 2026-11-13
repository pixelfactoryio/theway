import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  blockAt,
  keptIds,
  leavesChange,
  linked,
  moved,
  oneLine,
  prefixed,
  shortcutTip,
  taskBox,
  taskBoxColumn,
  taskName,
  unsavedTitle,
  wrapped,
} from "../src/dashboard/client/lib/change-edit";

const CLIENT = join(import.meta.dirname, "..", "src", "dashboard", "client");

test("only another project, another change or another kind of page leaves a change page", () => {
  const page = { key: "-p", id: "add-a" };
  for (const target of ["/-p/changes/add-a", "/-p/changes/add-a?", "/-p/changes/add-a/spec?", "/-p/changes/add-a/tasks?x=1", "#/-p/changes/add-a/"]) {
    expect([target, leavesChange(page, target)]).toEqual([target, false]);
  }
  for (const target of ["/-q/changes/add-a?", "/-p/changes/add-b?", "/-p/changes?", "/-p/changes/archive/2026-01-01-add-a?", "/workflows?", "/"]) {
    expect([target, leavesChange(page, target)]).toEqual([target, true]);
  }
});

test("row ids are kept by position for the first min(old, new) tasks, the rest new", () => {
  let n = 0;
  const make = () => `n${++n}`;
  expect(keptIds(["a", "b", "c"], 2, make)).toEqual(["a", "b"]);
  expect(keptIds(["a", "b"], 4, make)).toEqual(["a", "b", "n1", "n2"]);
  expect(keptIds([], 1, make)).toEqual(["n3"]);
  expect(moved(["a", "b", "c", "d"], 1, 3)).toEqual(["a", "c", "d", "b"]);
  expect(moved(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
});

test("a task row's name, a one-line description and the unsaved bar's title", () => {
  expect(taskName(3, "Ship it", false)).toBe("Task 3: Ship it");
  expect(taskName(1, "Plan", true)).toBe("Task 1, done: Plan");
  expect(oneLine("a\nb\r\n\r\nc\rd")).toBe("a b c d");
  expect(unsavedTitle("spec.md")).toBe("Unsaved changes in spec.md");
});

test("a Markdown checkbox flips the first [ ], [x] or [X] of its line and nothing else", () => {
  expect(taskBoxColumn("- [ ] works")).toBe(2);
  expect(taskBoxColumn("  * [X] done [ ] not")).toBe(4);
  expect(taskBoxColumn("1. [x] a")).toBe(3);
  expect(taskBoxColumn("- plain [y]")).toBe(-1);
  expect([taskBox(true), taskBox(false)]).toEqual(["[x]", "[ ]"]);
});

const apply = (doc: string, r: { from: number; to: number; insert: string; anchor: number; head: number }) => ({
  text: doc.slice(0, r.from) + r.insert + doc.slice(r.to),
  selected: [r.anchor, r.head],
});

test("Bold, Italic and Code wrap the selection, insert the pair at an empty one, and unwrap a wrapped one", () => {
  expect(apply("say hi", wrapped("say hi", 4, 6, "**"))).toEqual({ text: "say **hi**", selected: [6, 8] });
  expect(apply("say ", wrapped("say ", 4, 4, "_"))).toEqual({ text: "say __", selected: [5, 5] });
  expect(apply("a **b** c", wrapped("a **b** c", 2, 7, "**"))).toEqual({ text: "a b c", selected: [2, 3] });
  expect(apply("a `b` c", wrapped("a `b` c", 3, 4, "`"))).toEqual({ text: "a b c", selected: [2, 3] });
  expect(apply("x", linked("x", 0, 1))).toEqual({ text: "[x](https://)", selected: [1, 2] });
  expect(apply("", linked("", 0, 0))).toEqual({ text: "[](https://)", selected: [1, 1] });
});

test("a line prefix is removed only when every selected line has it, else added to the lines that lack it", () => {
  expect(prefixed(["a", "## b"], "heading")).toEqual(["## a", "## b"]);
  expect(prefixed(["## a", "## b"], "heading")).toEqual(["a", "b"]);
  expect(prefixed(["a", "- b"], "bullet")).toEqual(["- a", "- b"]);
  expect(prefixed(["- [ ] a", "b"], "task")).toEqual(["- [ ] a", "- [ ] b"]);
  expect(prefixed(["- [ ] a", "- [ ] b"], "task")).toEqual(["a", "b"]);
  expect(prefixed(["a", "b", "7. c"], "numbered")).toEqual(["1. a", "2. b", "7. c"]);
  expect(prefixed(["12. a", "3. b"], "numbered")).toEqual(["a", "b"]);
});

test("the preview's block of a line is the last in document order at or before it", () => {
  expect(blockAt([1, 3, 7, 12], 8)).toBe(2);
  expect(blockAt([1, 3, 7, 12], 1)).toBe(0);
  expect(blockAt([3, 7], 2)).toBe(-1);
  expect(blockAt([1, 5, 2, 9], 4)).toBe(2);
  expect([shortcutTip("Bold", "B", true), shortcutTip("Bold", "B", false)]).toEqual(["Bold (⌘B)", "Bold (Ctrl+B)"]);
});

test("the formatting keys take precedence, prevent the default and stop the event; no sonner, no toast", () => {
  const editor = readFileSync(join(CLIENT, "components", "markdown-editor.tsx"), "utf-8");
  expect(editor).toContain("Prec.highest(");
  expect(editor).toContain("preventDefault: true, stopPropagation: true");
  for (const key of ["Mod-b", "Mod-i", "Mod-e", "Mod-k"]) expect(editor).toContain(`"${key}"`);
  const page = readFileSync(join(CLIENT, "pages", "change.tsx"), "utf-8");
  expect(page).toContain("isolateHistory.of(\"full\")");
  expect(page).not.toMatch(/sonner|toast/);
  expect(page).not.toContain("doc.toString()");
});

test("the client imports the check and the edits from src/core/change-text", () => {
  const page = readFileSync(join(CLIENT, "pages", "change.tsx"), "utf-8");
  expect(page).toMatch(/from "\.\.\/\.\.\/\.\.\/core\/change-text"/);
  for (const name of ["checkChangeText", "changeTextErrors", "changeStatus", "editedChangeText"]) expect(page).toContain(name);
});
