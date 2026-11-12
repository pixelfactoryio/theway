/**
 * What the Prompts and Workflows pages compute from the API: the table's rows, a project file's short name beside its
 * name, the "Used by" texts and the "Applies to" text. Pure: no DOM, no JSX.
 */
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

/** A workflow or prompt file, or a use of one, as the names below read it. */
type Named = { scope: "global" | "project"; key: string | null; label: string | null; name: string };

/**
 * The short name of a project file's project, to show beside its name: `null` for a global file, or when nothing in
 * `shown` (the list the place renders) has the same name from another scope; else its label's name in `names`, else its
 * label, else its key.
 */
export function nameTag(f: Named, shown: readonly Named[], names: ReadonlyMap<string, string>): string | null {
  if (f.scope === "global") return null;
  if (!shown.some((o) => o.name === f.name && (o.scope !== f.scope || o.key !== f.key))) return null;
  return (f.label === null ? undefined : names.get(f.label)) ?? f.label ?? f.key ?? "";
}

/** A file's name, followed by `(<short name>)` when `nameTag` gives one. */
export function userName(f: Named, shown: readonly Named[], names: ReadonlyMap<string, string>): string {
  const tag = nameTag(f, shown, names);
  return tag === null ? f.name : `${f.name} (${tag})`;
}

/**
 * A use of a prompt in words: its workflow's `userName`, then ` · step N`, ` · on-fail of step N` or
 * ` · value in step N`.
 */
export function usageText(u: Named & Pick<FileUse, "use" | "step">, shown: readonly Named[], names: ReadonlyMap<string, string>): string {
  const name = userName(u, shown, names);
  switch (u.use) {
    case "step":
      return `${name} · step ${u.step}`;
    case "on-fail":
      return `${name} · on-fail of step ${u.step}`;
    case "value":
      return `${name} · value in step ${u.step}`;
  }
}

/**
 * The projects that override a global item: each project item of `items` with its name, in `items` order, as
 * `appliesText` takes them; `[]` for a project item.
 */
export function overridersOf(item: Named, items: readonly Named[]): { key: string; label: string }[] {
  if (item.scope !== "global") return [];
  return items.filter((i) => i.scope === "project" && i.name === item.name).map((i) => ({ key: i.key ?? "", label: i.label ?? i.key ?? "" }));
}

/**
 * Where a file applies: `All projects` for a global file, `All projects except <names>` when projects override it;
 * `<name> only` for a project file, with `, overrides the global file` when it does. Each label is printed as its
 * name in `names`, the label itself when it has none.
 */
export function appliesText(
  f: { scope: "global" | "project"; key: string | null; label: string | null },
  overriddenBy: readonly { label: string }[] = [],
  overrides = false,
  names: ReadonlyMap<string, string> = new Map(),
): string {
  const named = (label: string): string => names.get(label) ?? label;
  if (f.scope === "global") return overriddenBy.length === 0 ? "All projects" : `All projects except ${overriddenBy.map((p) => named(p.label)).join(", ")}`;
  const only = `${f.label === null ? (f.key ?? "") : named(f.label)} only`;
  return overrides ? `${only}, overrides the global file` : only;
}
