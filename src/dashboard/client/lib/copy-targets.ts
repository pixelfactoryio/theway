/** What the dashboard copies besides what it shows: the run commands, and the search palette's entry. Pure. */

import type { SearchEntry } from "./search"

/** A command to copy: what it does, then the command itself. */
export type RunCommand = { label: string; command: string }

/** What a copy writes (`value`), and what the toast names it (`what`). */
export type CopyTarget = { value: string; what: string }

/** An active change's commands: run it with the default workflow, with agents, and archive it. */
export const changeCommands = (id: string): RunCommand[] => [
  { label: "Run with the default workflow", command: `/theway:workflow ${id}` },
  { label: "Run with agents", command: `/theway:workflow --workflow agents ${id}` },
  { label: "Archive", command: `/theway:archive ${id}` },
]

/** A workflow's command, without its inputs: the user adds them. */
export const workflowCommand = (name: string): RunCommand => ({
  label: "Run this workflow",
  command: `/theway:workflow --workflow ${name}`,
})

/**
 * What ⌘C copies on a palette entry: a change's ID, a workflow's or a prompt's name (the entry's `id` when its name is
 * a description), a project's folder path, or its name when its path is not known (`""` or `"/"`).
 */
export function paletteCopyTarget(entry: Pick<SearchEntry, "kind" | "name" | "id">): CopyTarget {
  const own = entry.id ?? entry.name
  switch (entry.kind) {
    case "change":
      return { value: own, what: "the change ID" }
    case "workflow":
      return { value: own, what: "the workflow name" }
    case "prompt":
      return { value: own, what: "the prompt name" }
    case "project":
      return entry.id === null || entry.id === "" || entry.id === "/"
        ? { value: entry.name, what: "the project name" }
        : { value: entry.id, what: "the folder path" }
  }
}

/** Whether ⌘C copies the palette's entry: no text is selected in its input, so the browser's own copy has none. */
export const copiesEntry = (input: { selectionStart: number | null; selectionEnd: number | null }): boolean =>
  input.selectionStart === input.selectionEnd
