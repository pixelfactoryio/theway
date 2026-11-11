/**
 * The validation of a workflow or prompt file's new text: the resolver run over it, held in memory as an overlay,
 * before anything is written.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { isFile, type Overlay } from "../core/io";
import { listWorkflowFiles, resolveWorkflowFile } from "../core/language";
import { projectDir } from "../core/project";
import { projectLabels } from "./projects";
import { EXT, type FileUse, type SourceKind } from "./types";

/** The kinds of file the dashboard reads and writes. */
export type EditKind = SourceKind;

/** The outcome: `ok` when no error line blocks the file. */
export type Validation = { ok: boolean; errors: string[]; warnings: string[] };

/** The project file of a workflow or prompt: `<home>/projects/<key>/<kind>/<name><ext>`. */
export const projectPath = (home: string, key: string, kind: EditKind, name: string): string => join(projectDir(home, key), kind, `${name}${EXT[kind]}`);

/** A file's text, `""` when it cannot be read. */
export function readText(path: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}

/** The resolver's key for a global file: no project can have it, so only the global files are read. */
export const GLOBAL_CONTEXT = ".global";

/**
 * A resolver line with the home's paths as the page shows them, relative to the home: the folder of the global
 * context's project, which no project has, dropped from a `<dir> or <dir>` list, then every `<home>/` removed.
 */
export function homeRelative(home: string, line: string): string {
  const h = home.replace(/\/+$/, "");
  let out = line;
  for (const kind of Object.keys(EXT)) out = out.split(`${join(h, "projects", GLOBAL_CONTEXT, kind)} or `).join("");
  return out.split(`${h}/`).join("");
}

/** A workflow or prompt file addressed by where it lives: the global folder, or one project's folder (`key`). */
export type FileTarget = { scope: "global" | "project"; key: string | null; kind: EditKind; name: string };

/** The path of a file target: `<home>/<kind>/<name><ext>` or `<home>/projects/<key>/<kind>/<name><ext>`. */
export const targetPath = (home: string, t: FileTarget): string =>
  t.scope === "global" ? join(home, t.kind, `${t.name}${EXT[t.kind]}`) : projectPath(home, t.key as string, t.kind, t.name);

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * The uses of the prompt `name` in a workflow file's text, by step then in the order step, on-fail, value: a step's
 * `uses`, its `on-fail` (a value or the map's `uses`), and a `with` or `matrix` value equal to `prompts/<name>.md`,
 * compared as text. None when the text does not parse.
 */
export function promptUses(text: string, name: string): { use: FileUse["use"]; step: number }[] {
  let root: unknown;
  try {
    root = parse(text, { logLevel: "silent" });
  } catch {
    return [];
  }
  const steps = isObject(root) ? root.steps : undefined;
  if (!Array.isArray(steps)) return [];
  const ref = `prompts/${name}.md`;
  const isRef = (v: unknown) => typeof v === "string" && v === ref;
  const out: { use: FileUse["use"]; step: number }[] = [];
  steps.forEach((s, i) => {
    if (!isObject(s)) return;
    const step = i + 1;
    if (isRef(s.uses)) out.push({ use: "step", step });
    const onFail = s["on-fail"];
    if (isRef(onFail) || (isObject(onFail) && isRef(onFail.uses))) out.push({ use: "on-fail", step });
    const values = [
      ...(isObject(s.with) ? Object.values(s.with) : []),
      ...(isObject(s.matrix) ? Object.values(s.matrix).flatMap((v) => (Array.isArray(v) ? v : [])) : []),
      ...(isObject(onFail) && isObject(onFail.with) ? Object.values(onFail.with) : []),
    ];
    if (values.some(isRef)) out.push({ use: "value", step });
  });
  return out;
}

/** The workflow file of a listed workflow of a context: the project's own, or the global one. */
const workflowPath = (home: string, scope: "global" | "project", key: string, name: string): string =>
  scope === "global" ? join(home, "workflows", `${name}.yaml`) : projectPath(home, key, "workflows", name);

/**
 * Validates `text` as the new content of one file, in every context that reads it: a project file in its project's
 * context; a global file in `GLOBAL_CONTEXT`, then in every project (in `projectKeys` order) that has no file of that
 * kind and name. In each context:
 *
 * - a workflow is resolved with the overlay and no input; in another project, a workflow that already failed without
 *   it is only a warning;
 * - a prompt: every workflow of the context that names it (by `uses`, `on-fail` or as a value), and that resolves
 *   without the overlay, is resolved with it.
 *
 * A line from another project's context is prefixed with `<label>: `, and dropped when the same line was already
 * reported without a prefix; warnings follow the same rule.
 */
export function validateFile(home: string, target: FileTarget, text: string): Validation {
  const overlay: Overlay = new Map([[targetPath(home, target), text]]);
  const errors: string[] = [];
  const warnings: string[] = [];
  const plain = { errors: new Set<string>(), warnings: new Set<string>() };
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
    if (target.kind === "workflows") {
      const r = resolveWorkflowFile(home, key, target.name, {}, overlay);
      if ("errors" in r) {
        const before = label === null ? null : resolveWorkflowFile(home, key, target.name, {});
        for (const line of r.errors) report(before === null || !("errors" in before) ? "errors" : "warnings", line);
      }
    } else {
      for (const item of listWorkflowFiles(home, key, () => {})) {
        if (item.error !== undefined) continue;
        if (promptUses(readText(workflowPath(home, item.scope, key, item.name)), target.name).length === 0) continue;
        const r = resolveWorkflowFile(home, key, item.name, {}, overlay);
        if ("errors" in r) for (const line of r.errors) report("errors", line);
      }
    }
  }
  const rel = (line: string) => homeRelative(home, line);
  return { ok: errors.length === 0, errors: errors.map(rel), warnings: warnings.map(rel) };
}
