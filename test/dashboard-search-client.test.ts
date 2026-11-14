import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ActiveChange, ChangeList } from "../src/dashboard/client/lib/changes";
import type { PromptRow, WorkflowRow } from "../src/dashboard/client/lib/files";
import type { Project } from "../src/dashboard/client/lib/projects";
import { type SearchInput, searchGroups } from "../src/dashboard/client/lib/search";

const active = (id: string, description: string | null): ActiveChange => ({
  id,
  description,
  status: "in-progress",
  done: 1,
  total: 2,
  issues: [],
  updated: "2026-11-01T00:00:00Z",
});

const workflow = (name: string, project: string | null): WorkflowRow => ({
  name,
  project,
  description: null,
  default: false,
  steps: 1,
  runsOn: "agents",
  errors: [],
});

const prompt = (name: string, project: string | null): PromptRow => ({
  name,
  project,
  description: null,
  model: null,
  header: true,
  inputs: [],
  errors: [],
  usedBy: [],
});

const project = (key: string, label: string, n: number): Project => ({ key, label, active: n, path: null });

const changes: ChangeList = {
  active: [active("add-x", "Add X"), active("fix-y", null)],
  archived: [{ dir: "2026-10-30-add-w", id: "add-w", date: "2026-10-30" }],
};

const label = (key: string): string => (key === "-k" ? "kt" : key);

const input = (rest: Partial<SearchInput> = {}): SearchInput => ({
  key: "-k",
  changes,
  workflows: [workflow("agents", null), workflow("ship", "-k")],
  prompts: [prompt("review", null), prompt("local", "-k")],
  projects: [project("-z", "revecto", 3), project("-k", "kt", 2)],
  label,
  ...rest,
});

test("the groups are Changes, Workflows, Prompts, Projects with their hrefs", () => {
  const groups = searchGroups(input());
  expect(groups.map((g) => g.heading)).toEqual(["Changes", "Workflows", "Prompts", "Projects"]);
  expect(groups[0]?.entries).toEqual([
    { value: "change:add-x", label: "add-x", detail: "Add X", href: "/-k/changes/add-x?" },
    { value: "change:fix-y", label: "fix-y", detail: "", href: "/-k/changes/fix-y?" },
    { value: "archived:2026-10-30-add-w", label: "add-w", detail: "Archived 2026-10-30", href: "/-k/changes/archive/2026-10-30-add-w?" },
  ]);
  expect(groups[1]?.entries).toEqual([
    { value: "workflow:global/agents", label: "agents", detail: "All projects", href: "/workflows/global/agents?" },
    { value: "workflow:-k/ship", label: "ship", detail: "kt only", href: "/workflows/projects/-k/ship?" },
  ]);
  expect(groups[2]?.entries).toEqual([
    { value: "prompt:global/review", label: "review", detail: "All projects", href: "/prompts/global/review?" },
    { value: "prompt:-k/local", label: "local", detail: "kt only", href: "/prompts/projects/-k/local?" },
  ]);
  // Projects by label.
  expect(groups[3]?.entries).toEqual([
    { value: "project:-k", label: "kt", detail: "2 active", href: "/-k?" },
    { value: "project:-z", label: "revecto", detail: "3 active", href: "/-z?" },
  ]);
});

test("a null key gives no Changes group", () => {
  expect(searchGroups(input({ key: null })).map((g) => g.heading)).toEqual(["Workflows", "Prompts", "Projects"]);
});

test("a list still loading or empty gives no group", () => {
  expect(searchGroups(input({ changes: undefined, prompts: undefined })).map((g) => g.heading)).toEqual(["Workflows", "Projects"]);
  expect(searchGroups(input({ changes: { active: [], archived: [] }, workflows: [], projects: [] })).map((g) => g.heading)).toEqual([
    "Prompts",
  ]);
  expect(searchGroups(input({ key: null, changes: undefined, workflows: undefined, prompts: undefined, projects: undefined }))).toEqual([]);
});

test("lib/search.ts imports no @/ path", () => {
  const text = readFileSync(join(import.meta.dirname, "..", "src", "dashboard", "client", "lib", "search.ts"), "utf-8");
  expect([...text.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]).filter((i) => i?.startsWith("@/"))).toEqual([]);
});
