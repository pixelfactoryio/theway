/** The step prompts the step picker and the on-fail select offer. Pure: no React, no DOM. */
import { fileMatches, type PromptRow } from "./files"

// ---------------------------------------------------------------------------------------------------------------------
// The step picker

/** The step prompts of a workflow's context: the project's own, and the global ones no project prompt hides. */
export function contextPrompts(
  prompts: readonly PromptRow[],
  project: string | null,
): { own: PromptRow[]; global: PromptRow[] } {
  const byName = (a: PromptRow, b: PromptRow) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  const steps = prompts.filter((p) => p.header)
  const own = project === null ? [] : steps.filter((p) => p.project === project).sort(byName)
  // Every project prompt hides the global one of its name, step prompt or not: `prompts/<name>.md` resolves to it.
  const hidden = new Set(project === null ? [] : prompts.filter((p) => p.project === project).map((p) => p.name))
  const global = steps.filter((p) => p.project === null && !hidden.has(p.name)).sort(byName)
  return { own, global }
}

/** The picker's groups for the typed text: the rows whose name or description holds it, ignoring case, in name order. */
export function pickerGroups(
  prompts: readonly PromptRow[],
  project: string | null,
  q: string,
): { own: PromptRow[]; global: PromptRow[] } {
  const { own, global } = contextPrompts(prompts, project)
  const keep = (p: PromptRow) => fileMatches(p, q)
  return { own: own.filter(keep), global: global.filter(keep) }
}

/** The names the `on-fail` select offers: each step prompt of the context, in name order. */
export function stepPromptNames(prompts: readonly PromptRow[], project: string | null): string[] {
  const { own, global } = contextPrompts(prompts, project)
  return [...new Set([...own, ...global].map((p) => p.name))].sort()
}
