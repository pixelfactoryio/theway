import { expect, test } from "bun:test";
import { ALL_PROJECTS } from "../src/dashboard/client/lib/changes";
import { appliesText, nameTag, overridersOf, promptRows, usageText, userName } from "../src/dashboard/client/lib/prompts";
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
  const agents = { scope: "global" as const, key: null, label: null, name: "agents" };
  const none = new Map<string, string>();
  expect(usageText({ ...agents, use: "step", step: 4 }, [agents], none)).toBe("agents · step 4");
  expect(usageText({ ...agents, use: "on-fail", step: 4 }, [agents], none)).toBe("agents · on-fail of step 4");
  expect(usageText({ ...agents, use: "value", step: 3 }, [agents], none)).toBe("agents · value in step 3");
});

test("Applies to reads All projects or <label> only, with what overrides it or what it overrides", () => {
  expect(appliesText(item("review", true))).toBe("All projects");
  expect(appliesText(item("review", true), [{ label: "my-app" }, { label: "api" }])).toBe("All projects except my-app, api");
  expect(appliesText(item("mine", true, "a"))).toBe("label-a only");
  expect(appliesText(item("review", true, "b"), [], true)).toBe("label-b only, overrides the global file");
  const names = new Map([
    ["label-a", "a-name"],
    ["my-app", "app"],
  ]);
  expect(appliesText(item("mine", true, "a"), [], false, names)).toBe("a-name only");
  expect(appliesText(item("review", true), [{ label: "my-app" }, { label: "api" }], false, names)).toBe("All projects except app, api");
});

test("a project file's name takes its project's short name only beside a file of the same name from another scope", () => {
  const names = new Map([["label-a", "my-api"]]);
  const G = { scope: "global" as const, key: null, label: null, name: "agents" };
  const A = { scope: "project" as const, key: "a", label: "label-a", name: "agents" };
  const B = { scope: "global" as const, key: null, label: null, name: "broken" };
  expect(nameTag(A, [G, A, B], names)).toBe("my-api");
  expect(userName(A, [G, A, B], names)).toBe("agents (my-api)");
  expect(userName(G, [G, A, B], names)).toBe("agents");
  expect(nameTag(G, [G, A, B], names)).toBeNull();
  expect(userName(A, [A, B], names)).toBe("agents");
  const C = { scope: "project" as const, key: "c", label: "label-c", name: "agents" };
  expect(nameTag(C, [G, C], names)).toBe("label-c");
  const U = [
    { ...G, use: "step" as const, step: 4 },
    { ...A, use: "step" as const, step: 4 },
  ];
  expect(usageText(U[1] as (typeof U)[number], U, names)).toBe("agents (my-api) · step 4");
  expect(usageText(U[0] as (typeof U)[number], U, names)).toBe("agents · step 4");
});

test("overridersOf gives the project items of a global item's name in list order, and none for a project item", () => {
  expect(overridersOf(item("review", true), PROMPTS)).toEqual([{ key: "b", label: "label-b" }]);
  const both = [...PROMPTS, item("review", true, "a")];
  expect(overridersOf(item("review", true), both)).toEqual([
    { key: "b", label: "label-b" },
    { key: "a", label: "label-a" },
  ]);
  expect(overridersOf(item("review", true, "b"), both)).toEqual([]);
  expect(overridersOf(item("triage", true), both)).toEqual([]);
});
