import { join, relative } from "node:path";
import { warnLoud } from "./config";
import { escaped, invalidName, thewayHome } from "./io";
import { listWorkflowFiles, resolveWorkflowFile, v1Line } from "./language";
import type { ResolvedWorkflow } from "./language-schema";
import { projectDir, resolveKey } from "./project";

/**
 * The `--input <name>=<value>` options as a record, or the line that refuses one: a value without `=`, an empty name,
 * or a name given twice.
 */
function parseInputs(given: string[]): Record<string, string> | { error: string } {
  const out: Record<string, string> = {};
  for (const raw of given) {
    const at = raw.indexOf("=");
    if (at <= 0) return { error: `theway: --input ${escaped(raw)}: must be <name>=<value>` };
    const name = raw.slice(0, at);
    if (Object.hasOwn(out, name)) return { error: `theway: --input ${escaped(name)}: given twice` };
    out[name] = raw.slice(at + 1);
  }
  return out;
}

/** `a`, `a and b`, `a, b and c`. */
const joinAnd = (items: string[]) =>
  items.length === 1 ? (items[0] as string) : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/**
 * The name of the workflow a run without a name uses: the one `theway.workflow/v1beta` file of the project and the
 * home (a project file hiding the global one) that sets `default: true`; or the lines that refuse: the v1 error of each
 * v1 file when none sets it and v1 files are left, else that none sets it, or that several do.
 */
function defaultName(home: string, key: string): { name: string } | { error: string } {
  const listed = listWorkflowFiles(home, key, warnLoud);
  const marked = listed.filter((w) => w.default);
  if (marked.length === 0) {
    const v1 = listed.filter((w) => w.error === v1Line(`workflows/${w.name}.yaml`));
    if (v1.length > 0) return { error: v1.map((w) => `theway: ${w.error}`).join("\n") };
    return { error: "theway: no workflow sets default: true" };
  }
  if (marked.length > 1) {
    const files = marked.map((w) => relative(home, join(w.scope === "project" ? projectDir(home, key) : home, "workflows", `${w.name}.yaml`)));
    return { error: `theway: ${joinAnd(files)} both set default: true` };
  }
  return { name: (marked[0] as { name: string }).name };
}

/**
 * The resolved document without its bulky text, for a session to pass on: no prompt text, no description, no `with` as
 * written. A step keeps its `uses`, `file`, `runs_on`, `model`, `matrix`, `tries` and `index`; a run its `label` and
 * `with`; an `on_fail` its `uses`, `file`, `model`, `label` and `with`.
 */
export function compactWorkflow(doc: ResolvedWorkflow) {
  return {
    name: doc.name,
    file: doc.file,
    resolved: doc.resolved,
    runs_on: doc.runs_on,
    inputs: doc.inputs,
    steps: doc.steps.map((s) => ({
      index: s.index,
      uses: s.uses,
      file: s.file,
      runs_on: s.runs_on,
      model: s.model,
      matrix: s.matrix,
      runs: s.runs.map((r) => ({ label: r.label, with: r.with })),
      on_fail:
        s.on_fail === null
          ? null
          : { uses: s.on_fail.uses, file: s.on_fail.file, model: s.on_fail.model, label: s.on_fail.label, with: s.on_fail.with },
      tries: s.tries,
    })),
  };
}

/**
 * `theway workflow [<name>] [--project <key>] [--input <name>=<value>]… [--compact]`: one `theway.workflow/v1beta` workflow,
 * checked and resolved, as JSON; the one that sets `default: true` when no name is given. `--compact` prints it without
 * its prompt text (`compactWorkflow`).
 */
export function cmdWorkflow(wanted: string | undefined, override: string | undefined, given: string[] = [], compact = false): number {
  const key = resolveKey(override);
  if (key === null) return 1;
  if (invalidName("workflow", wanted)) return 1;
  const home = thewayHome();
  const inputs = parseInputs(given);
  if ("error" in inputs) {
    process.stderr.write(`${inputs.error}\n`);
    return 1;
  }
  let name = wanted;
  if (name === undefined) {
    const chosen = defaultName(home, key);
    if ("error" in chosen) {
      process.stderr.write(`${chosen.error}\n`);
      return 1;
    }
    name = chosen.name;
  }
  const resolved = resolveWorkflowFile(home, key, name, inputs);
  if ("errors" in resolved) {
    process.stderr.write(resolved.errors.map((e) => `theway: ${e}\n`).join(""));
    return 1;
  }
  process.stdout.write(`${JSON.stringify(compact ? compactWorkflow(resolved.doc) : resolved.doc, null, 2)}\n`);
  return 0;
}
