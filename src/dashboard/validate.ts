/**
 * The validation of a candidate set of project workflow and step files: the resolver run over the candidate texts, held
 * in memory as an overlay, before anything is written.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import type { Warn } from "../core/config";
import { isFile, type Overlay } from "../core/io";
import { projectDir } from "../core/project";
import type { WorkflowDoc } from "../core/schema";
import { listWorkflows, resolveStepFile, resolveWorkflow } from "../core/workflow";
import { projectLabels } from "./projects";

/** The kinds of file the editor writes. */
export type EditKind = "workflows" | "steps";

/** One candidate file: its new text, or `null` to delete the project copy. */
export type Candidate = { kind: EditKind; name: string; text: string | null };

/** The outcome: `ok` when no error line blocks the set; `workflow` the named workflow resolved with the overlay. */
export type Validation = { ok: boolean; errors: string[]; warnings: string[]; workflow?: WorkflowDoc };

/** The project file of a candidate, the only path an overlay ever holds. */
export const projectPath = (home: string, key: string, kind: EditKind, name: string): string => join(projectDir(home, key), kind, `${name}.yaml`);

/** The overlay of a candidate set: each project path to its text, or `null`. */
export function overlayOf(home: string, key: string, files: Candidate[]): Overlay {
  return new Map(files.map((f) => [projectPath(home, key, f.kind, f.name), f.text]));
}

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

/**
 * Validates a candidate set:
 *
 * 1. each `workflows` entry resolved by name with the overlay (a `null` one only when a global file of its name
 *    exists), and each `steps` entry with a text resolved as `theway steps <name>` does;
 * 2. every workflow that resolved without the overlay and names an overlaid step, resolved again with it;
 * 3. with a `workflows` entry, the project's default resolved with the overlay.
 *
 * Any error line blocks, except a workflow of 2 or a default that already failed without the overlay: those are
 * warnings, `<name>: <error>` and `default: <error>`. The resolver's warnings are returned as `<file>: <text>`.
 */
export function validateSet(home: string, key: string, files: Candidate[], workflow?: string): Validation {
  const overlay = overlayOf(home, key, files);
  const errors: string[] = [];
  const warnings: string[] = [];
  const warn: Warn = (file, text) => {
    const line = `${file}: ${text}`;
    if (!warnings.includes(line)) warnings.push(line);
  };
  const quiet: Warn = () => {};
  const error = (line: string) => {
    if (!errors.includes(line)) errors.push(line);
  };

  for (const f of files) {
    if (f.kind === "workflows") {
      if (f.text === null && !isFile(join(home, "workflows", `${f.name}.yaml`))) continue;
      const r = resolveWorkflow(home, key, f.name, warn, overlay);
      if ("error" in r) error(r.error);
    } else if (f.text !== null) {
      const r = resolveStepFile(home, key, f.name, warn, overlay);
      if ("error" in r) error(r.error);
    }
  }

  const steps = new Set(files.filter((f) => f.kind === "steps").map((f) => f.name));
  const edited = new Set(files.filter((f) => f.kind === "workflows").map((f) => f.name));
  if (steps.size > 0) {
    const before = listWorkflows(home, key, quiet);
    if ("error" in before) {
      error(before.error);
    } else {
      for (const item of before.workflows) {
        if (edited.has(item.name) || !stepsNamed(readText(item.file)).some((s) => steps.has(s))) continue;
        const r = resolveWorkflow(home, key, item.name, warn, overlay);
        if (!("error" in r)) continue;
        if (item.error === undefined) error(r.error);
        else warn(item.name, r.error);
      }
    }
  }

  if (edited.size > 0) {
    const r = resolveWorkflow(home, key, undefined, warn, overlay);
    if ("error" in r) {
      if ("error" in resolveWorkflow(home, key, undefined, quiet)) warn("default", r.error);
      else error(r.error);
    }
  }

  const out: Validation = { ok: errors.length === 0, errors, warnings };
  if (workflow !== undefined) {
    const r = resolveWorkflow(home, key, workflow, quiet, overlay);
    if ("doc" in r) out.workflow = r.doc;
  }
  return out;
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
