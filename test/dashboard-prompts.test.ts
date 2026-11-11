import { expect, test } from "bun:test";
import { ALL_PROJECTS } from "../src/dashboard/client/lib/changes";
import { appliesText, promptRows, usageText } from "../src/dashboard/client/lib/prompts";
import type { PromptItem } from "../src/dashboard/types";

const item = (name: string, step: boolean, key: string | null = null): PromptItem => ({
  scope: key === null ? "global" : "project",
  key,
  label: key === null ? null : `label-${key}`,
  kind: "prompts",
  name,
  path: `/h/${name}.md`,
  description: step ? `Do ${name}` : null,
  step,
  model: step ? "opus" : null,
  usedBy: [],
  error: null,
});

/** Global files and two projects' own, in the files list's order: global first, then each project's. */
const PROMPTS: PromptItem[] = [
  item("review", true),
  item("triage", true),
  item("change", false),
  item("review", true, "b"),
  item("mine", true, "a"),
  item("notes", false, "a"),
  item("change", false, "b"),
];

const rows = (items: PromptItem[]) => items.map((p) => `${p.key ?? "global"}/${p.name}`);

test("the Step prompts and Reference files rows hold every file for All projects, by name then global first", () => {
  expect(rows(promptRows(PROMPTS, ALL_PROJECTS, true))).toEqual(["a/mine", "global/review", "b/review", "global/triage"]);
  expect(rows(promptRows(PROMPTS, ALL_PROJECTS, false))).toEqual(["global/change", "b/change", "a/notes"]);
});

test("the rows of one project are the global files and that project's own", () => {
  expect(rows(promptRows(PROMPTS, "a", true))).toEqual(["a/mine", "global/review", "global/triage"]);
  expect(rows(promptRows(PROMPTS, "a", false))).toEqual(["global/change", "a/notes"]);
  expect(rows(promptRows(PROMPTS, "b", true))).toEqual(["global/review", "b/review", "global/triage"]);
  expect(rows(promptRows(PROMPTS, "b", false))).toEqual(["global/change", "b/change"]);
});

test("a file with a header error is a step prompt, not a reference file", () => {
  const broken: PromptItem = { ...item("broken", false), error: "model: must be one of opus, sonnet, haiku" };
  expect(rows(promptRows([...PROMPTS, broken], ALL_PROJECTS, true))).toEqual(["global/broken", "a/mine", "global/review", "b/review", "global/triage"]);
  expect(rows(promptRows([...PROMPTS, broken], ALL_PROJECTS, false))).toEqual(["global/change", "b/change", "a/notes"]);
});

test("a use reads as its workflow and its step, on-fail or value", () => {
  expect(usageText({ name: "agents", use: "step", step: 4 })).toBe("agents · step 4");
  expect(usageText({ name: "agents", use: "on-fail", step: 4 })).toBe("agents · on-fail of step 4");
  expect(usageText({ name: "agents", use: "value", step: 3 })).toBe("agents · value in step 3");
});

test("Applies to reads All projects or <label> only, with what overrides it or what it overrides", () => {
  expect(appliesText(item("review", true))).toBe("All projects");
  expect(appliesText(item("review", true), [{ label: "my-app" }, { label: "api" }])).toBe("All projects, overridden in my-app, api");
  expect(appliesText(item("mine", true, "a"))).toBe("label-a only");
  expect(appliesText(item("review", true, "b"), [], true)).toBe("label-b only, overrides the global file");
});
