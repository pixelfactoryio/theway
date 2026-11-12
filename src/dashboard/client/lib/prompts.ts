/** What the Prompts pages compute from the API: the table's rows, the "Used by" texts and the "Applies to" text. Pure: no DOM, no JSX. */
import type { FileUse, PromptItem } from "../../types";
import { ALL_PROJECTS } from "./changes";

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The rows of a tab of the Prompts table: the step prompts (`step`: a file whose item has `step` or an `error`, a broken
 * step prompt) or the reference files, global ones and the chosen project's (every file for `ALL_PROJECTS`), ordered by
 * name, then global before project, then by project label.
 */
export const promptRows = (prompts: readonly PromptItem[], chosen: string, step: boolean): PromptItem[] =>
  prompts
    .filter((p) => (p.step || p.error !== null) === step && (chosen === ALL_PROJECTS || p.scope === "global" || p.key === chosen))
    .sort((a, b) => byText(a.name, b.name) || byText(a.scope, b.scope) || byText(a.label ?? "", b.label ?? ""));

/** A use of a prompt in words: `<workflow> · step N`, `<workflow> · on-fail of step N` or `<workflow> · value in step N`. */
export function usageText(u: Pick<FileUse, "name" | "use" | "step">): string {
  switch (u.use) {
    case "step":
      return `${u.name} · step ${u.step}`;
    case "on-fail":
      return `${u.name} · on-fail of step ${u.step}`;
    case "value":
      return `${u.name} · value in step ${u.step}`;
  }
}

/**
 * Where a file applies: `All projects` for a global file, with `, overridden in <labels>` when projects override it;
 * `<label> only` for a project file, with `, overrides the global file` when it does. Each label is printed as its
 * name in `names`, the label itself when it has none.
 */
export function appliesText(
  f: { scope: "global" | "project"; key: string | null; label: string | null },
  overriddenBy: readonly { label: string }[] = [],
  overrides = false,
  names: ReadonlyMap<string, string> = new Map(),
): string {
  const named = (label: string): string => names.get(label) ?? label;
  if (f.scope === "global") return overriddenBy.length === 0 ? "All projects" : `All projects, overridden in ${overriddenBy.map((p) => named(p.label)).join(", ")}`;
  const only = `${f.label === null ? (f.key ?? "") : named(f.label)} only`;
  return overrides ? `${only}, overrides the global file` : only;
}
