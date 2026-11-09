/**
 * The validation of a workflow or step file's new text: the resolver run over it, held in memory as an overlay, before
 * anything is written.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import type { Warn } from "../core/config";
import { isFile, type Overlay } from "../core/io";
import { projectDir } from "../core/project";
import { listWorkflows, resolveStepFile, resolveWorkflow } from "../core/workflow";
import { projectLabels } from "./projects";

/** The kinds of file the editor writes. */
export type EditKind = "workflows" | "steps";

/** The outcome: `ok` when no error line blocks the file. */
export type Validation = { ok: boolean; errors: string[]; warnings: string[] };

/** The project file of a workflow or step: `<home>/projects/<key>/<kind>/<name>.yaml`. */
export const projectPath = (home: string, key: string, kind: EditKind, name: string): string => join(projectDir(home, key), kind, `${name}.yaml`);

/** The step names the `steps` entries of a workflow file's text name; none when it does not parse. */
export function stepsNamed(text: string): string[] {
  let root: unknown;
  try {
    root = parse(text, { logLevel: "silent" });
  } catch {
    return [];
  }
  const steps = (root as { steps?: unknown } | null)?.steps;
  if (!Array.isArray(steps)) return [];
  return steps.flatMap((e) => (e !== null && typeof e === "object" && !Array.isArray(e) ? Object.keys(e) : []));
}

/** A file's text, `""` when it cannot be read. */
export function readText(path: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}

/** The resolver's key for a global file: no project can have it, so only the global files and config are read. */
export const GLOBAL_CONTEXT = ".global";

/** A workflow or step file addressed by where it lives: the global folder, or one project's folder (`key`). */
export type FileTarget = { scope: "global" | "project"; key: string | null; kind: EditKind; name: string };

/** The path of a file target: `<home>/<kind>/<name>.yaml` or `<home>/projects/<key>/<kind>/<name>.yaml`. */
export const targetPath = (home: string, t: FileTarget): string =>
  t.scope === "global" ? join(home, t.kind, `${t.name}.yaml`) : projectPath(home, t.key as string, t.kind, t.name);

/**
 * Validates `text` as the new content of one file, in every context that reads it: a project file in its project's
 * context; a global file in `GLOBAL_CONTEXT`, then in every project (in `projectKeys` order) that has no file of that
 * kind and name. In each context:
 *
 * - a config that does not load is the context's only line: it blocks in the file's own context, and is a warning
 *   `<label>: <line>` in another project's;
 * - a workflow is resolved with the overlay (in another project, a workflow that already failed without it is only a
 *   warning), then the default (a default that already failed is a warning `default: <error>`);
 * - a step is resolved with the overlay, then every workflow that resolves and names it.
 *
 * A line from another project's context is prefixed with `<label>: `, and dropped when the same line was already
 * reported without a prefix; warnings follow the same rule.
 */
export function validateFile(home: string, target: FileTarget, text: string): Validation {
  const overlay: Overlay = new Map([[targetPath(home, target), text]]);
  const errors: string[] = [];
  const warnings: string[] = [];
  const plain = { errors: new Set<string>(), warnings: new Set<string>() };
  const quiet: Warn = () => {};
  const contexts: { key: string; label: string | null }[] =
    target.scope === "project"
      ? [{ key: target.key as string, label: null }]
      : [
          { key: GLOBAL_CONTEXT, label: null },
          ...projectLabels(home).filter(({ key }) => !isFile(projectPath(home, key, target.kind, target.name))),
        ];

  for (const { key, label } of contexts) {
    const report = (into: "errors" | "warnings", line: string) => {
      const list = into === "errors" ? errors : warnings;
      if (label === null) {
        plain[into].add(line);
        if (!list.includes(line)) list.push(line);
      } else if (!plain[into].has(line) && !list.includes(`${label}: ${line}`)) {
        list.push(`${label}: ${line}`);
      }
    };
    const warn: Warn = (file, t) => report("warnings", `${file}: ${t}`);
    const listed = listWorkflows(home, key, quiet);
    if ("error" in listed) {
      report(label === null ? "errors" : "warnings", listed.error);
      continue;
    }
    if (target.kind === "workflows") {
      const r = resolveWorkflow(home, key, target.name, warn, overlay);
      if ("error" in r) {
        const before = label === null ? null : resolveWorkflow(home, key, target.name, quiet);
        report(before === null || !("error" in before) ? "errors" : "warnings", r.error);
      }
      const d = resolveWorkflow(home, key, undefined, warn, overlay);
      if ("error" in d) {
        if ("error" in resolveWorkflow(home, key, undefined, quiet)) report("warnings", `default: ${d.error}`);
        else report("errors", d.error);
      }
    } else {
      const r = resolveStepFile(home, key, target.name, warn, overlay);
      if ("error" in r) report("errors", r.error);
      for (const item of listed.workflows) {
        if (item.error !== undefined || !stepsNamed(readText(item.file)).includes(target.name)) continue;
        const w = resolveWorkflow(home, key, item.name, warn, overlay);
        if ("error" in w) report("errors", w.error);
      }
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}
