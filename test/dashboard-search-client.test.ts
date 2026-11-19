import { expect, test } from "bun:test"
import type { ActiveChange, ChangeList } from "../src/dashboard/client/lib/changes"
import type { PromptRow, WorkflowRow } from "../src/dashboard/client/lib/files"
import type { Project } from "../src/dashboard/client/lib/projects"
import { type SearchInput, searchGroups } from "../src/dashboard/client/lib/search"

const active = (id: string, description: string | null): ActiveChange => ({
  id,
  description,
  status: "in-progress",
  done: 1,
  total: 2,
  issues: [],
  updated: "2026-11-01T00:00:00Z",
})

const workflow = (name: string, project: string | null): WorkflowRow => ({
  name,
  project,
  description: null,
  default: false,
  steps: 1,
  runsOn: "agents",
  errors: [],
})

const prompt = (name: string, project: string | null): PromptRow => ({
  name,
  project,
  description: null,
  model: null,
  header: true,
  inputs: [],
  errors: [],
  usedBy: [],
})

const project = (key: string, label: string, n: number): Project => ({ key, label, active: n, path: null })

const changes: ChangeList = {
  active: [active("add-x", "Add X"), active("fix-y", null)],
  archived: [{ dir: "2026-10-30-add-w", id: "add-w", date: "2026-10-30", updated: "2026-10-30T12:00:00.000Z" }],
}

const label = (key: string): string => (key === "-k" ? "kt" : key)

const input = (rest: Partial<SearchInput> = {}): SearchInput => ({
  changes: [{ key: "-k", list: changes }],
  workflows: [workflow("agents", null), workflow("ship", "-k")],
  prompts: [prompt("review", null), prompt("local", "-k")],
  projects: [project("-z", "web", 3), project("-k", "kt", 2)],
  label,
  ...rest,
})

test("the groups are Changes, Workflows, Prompts, Projects with their hrefs", () => {
  const groups = searchGroups(input())
  expect(groups.map((g) => g.heading)).toEqual(["Changes", "Workflows", "Prompts", "Projects"])
  expect(groups[0]?.entries).toEqual([
    { value: "change:-k/add-x", label: "add-x", detail: "Add X · kt", href: "/-k/changes/add-x?" },
    { value: "change:-k/fix-y", label: "fix-y", detail: "kt", href: "/-k/changes/fix-y?" },
    {
      value: "archived:-k/2026-10-30-add-w",
      label: "add-w",
      detail: "kt · archived 2026-10-30",
      href: "/-k/changes/archive/2026-10-30-add-w?",
    },
  ])
  expect(groups[1]?.entries).toEqual([
    { value: "workflow:global/agents", label: "agents", detail: "All projects", href: "/workflows/global/agents?" },
    { value: "workflow:-k/ship", label: "ship", detail: "kt only", href: "/workflows/projects/-k/ship?" },
  ])
  expect(groups[2]?.entries).toEqual([
    { value: "prompt:global/review", label: "review", detail: "All projects", href: "/prompts/global/review?" },
    { value: "prompt:-k/local", label: "local", detail: "kt only", href: "/prompts/projects/-k/local?" },
  ])
  // Projects by label.
  expect(groups[3]?.entries).toEqual([
    { value: "project:-k", label: "kt", detail: "2 active", href: "/-k?" },
    { value: "project:-z", label: "web", detail: "3 active", href: "/-z?" },
  ])
})

test("every project's changes are listed, active ones first, each naming its project", () => {
  const other: ChangeList = { active: [active("add-q", "Add Q")], archived: [] }
  const entries = searchGroups(
    input({
      changes: [
        { key: "-k", list: changes },
        { key: "-z", list: other },
      ],
    }),
  )[0]?.entries
  expect(entries?.map((e) => e.value)).toEqual([
    "change:-k/add-x",
    "change:-k/fix-y",
    "change:-z/add-q",
    "archived:-k/2026-10-30-add-w",
  ])
  expect(entries?.[2]).toEqual({
    value: "change:-z/add-q",
    label: "add-q",
    detail: "Add Q · -z",
    href: "/-z/changes/add-q?",
  })
  expect(searchGroups(input({ changes: [] })).map((g) => g.heading)).toEqual(["Workflows", "Prompts", "Projects"])
})

test("a list still loading or empty gives no group", () => {
  expect(searchGroups(input({ changes: [], prompts: undefined })).map((g) => g.heading)).toEqual([
    "Workflows",
    "Projects",
  ])
  expect(
    searchGroups(
      input({ changes: [{ key: "-k", list: { active: [], archived: [] } }], workflows: [], projects: [] }),
    ).map((g) => g.heading),
  ).toEqual(["Prompts"])
  expect(searchGroups(input({ changes: [], workflows: undefined, prompts: undefined, projects: undefined }))).toEqual(
    [],
  )
})
