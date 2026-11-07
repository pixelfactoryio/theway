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

/** The step names a workflow file's `steps` entries name, read from disk; none when it does not parse. */
function stepsNamed(file: string): string[] {
  let root: unknown;
  try {
    root = parse(readFileSync(file, "utf-8"), { logLevel: "silent" });
  } catch {
    return [];
  }
  const steps = (root as { steps?: unknown } | null)?.steps;
  if (!Array.isArray(steps)) return [];
  return steps.flatMap((e) => (e !== null && typeof e === "object" && !Array.isArray(e) ? Object.keys(e) : []));
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
        if (edited.has(item.name) || !stepsNamed(item.file).some((s) => steps.has(s))) continue;
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
