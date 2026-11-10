import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { edit, isDirty, redo, startDraft, undo } from "../src/dashboard/client/files/draft";

const SHIPPED_HOME = join(import.meta.dirname, "..", "plugin", "home");
const shipped = (rel: string) => readFileSync(join(SHIPPED_HOME, rel), "utf-8");

test("a draft takes three edits, two undos and one redo, and is dirty until its text is again the start", () => {
  let d = startDraft("a", "sha", false);
  expect(isDirty(d)).toBe(false);
  d = edit(edit(edit(d, "b"), "c"), "d");
  d = redo(undo(undo(d)));
  expect(d.text).toBe("c");
  expect(isDirty(d)).toBe(true);
  d = undo(d);
  expect(d.text).toBe("b");
  d = undo(d);
  expect(d.text).toBe("a");
  expect(isDirty(d)).toBe(false);
  expect(edit(d, "a")).toBe(d);
  expect(isDirty(startDraft("a", null, true))).toBe(true);
});

test("a restored version is one undoable edit that keeps its text byte for byte", () => {
  const current = shipped("workflows/agents.yaml");
  const versionText = "version: 1\nsteps:\n  - review: {rounds:   2}   # kept\n";
  const d = edit(startDraft(current, "a".repeat(64), false), versionText);
  expect(d.text).toBe(versionText);
  expect([d.start, d.base, d.isNew, d.undo, isDirty(d)]).toEqual([current, "a".repeat(64), false, [current], true]);
  expect(undo(d).text).toBe(current);
});

test("the undo stack keeps the newest 100 texts", () => {
  let d = startDraft("0", null, false);
  for (let i = 1; i <= 150; i++) d = edit(d, String(i));
  expect(d.undo.length).toBe(100);
  expect(d.undo[0]).toBe("50");
});
