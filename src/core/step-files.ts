import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { Loaded, Warn } from "./config";
import { isFile, NAME } from "./io";
import { projectDir } from "./project";

/** The kinds of named files the resolver reads: workflows and steps as `.yaml`, prompts as `.md`. */
export type Kind = "workflows" | "steps" | "prompts";
const EXT: Record<Kind, string> = { workflows: ".yaml", steps: ".yaml", prompts: ".md" };

/** The project folder and the global folder of `kind`. */
export const dirsOf = (home: string, key: string, kind: Kind): [string, string] => [join(projectDir(home, key), kind), join(home, kind)];

/** The folders searched for `kind`, for an error line: `<project dir> or <global dir>`. */
export const searched = (home: string, key: string, kind: Kind): string => dirsOf(home, key, kind).join(" or ");

/** The file of `name` of `kind`: the project one if it is a file, else the global one, else `null`. */
export function fileOf(home: string, key: string, kind: Kind, name: string): string | null {
  for (const dir of dirsOf(home, key, kind)) {
    const path = join(dir, `${name}${EXT[kind]}`);
    if (isFile(path)) return path;
  }
  return null;
}

/**
 * The valid names of the regular `kind` files directly in `dir`, `.default` copies left out, sorted; `rejected` is
 * called, in sorted order, with the path of each such file whose stem is not a valid name.
 */
export function namesIn(dir: string, kind: Kind, rejected?: (path: string) => void): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const ext = EXT[kind];
  const out: string[] = [];
  for (const n of entries.sort()) {
    if (!n.endsWith(ext) || n.endsWith(`.default${ext}`) || !isFile(join(dir, n))) continue;
    const stem = n.slice(0, -ext.length);
    if (NAME.test(stem)) out.push(stem);
    else rejected?.(join(dir, n));
  }
  return out.sort();
}

/** The step names that resolve for a project, sorted; `gate` is reserved and never one. */
export function knownSteps(home: string, key: string): string[] {
  const [own, global] = dirsOf(home, key, "steps");
  return [...new Set([...namesIn(own, "steps"), ...namesIn(global, "steps")])].filter((n) => n !== "gate").sort();
}

/** The Levenshtein distance of two strings. */
function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min((prev[j] as number) + 1, (cur[j - 1] as number) + 1, (prev[j - 1] as number) + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length] as number;
}

/**
 * The suffix of an unknown-name line: `; did you mean '<x>'?` for the nearest known name within edit distance 2
 * (the first in `known` order on a tie), else the valid set in parentheses, ` (<noun>: a, b)`.
 */
export function suggest(wanted: string, known: string[], noun: string): string {
  let best: string | null = null;
  let bestDistance = 3;
  for (const k of known) {
    const d = distance(wanted, k);
    if (d < bestDistance) {
      best = k;
      bestDistance = d;
    }
  }
  if (best !== null) return `; did you mean '${best}'?`;
  return ` (${noun}: ${known.join(", ")})`;
}

/**
 * Warns, once per config file and step, about a `workflow.defaults.<step>` naming no step that resolves for the
 * project; the resolver drops its values.
 */
export function warnUnknownDefaults(home: string, key: string, loaded: Loaded, warn: Warn): void {
  const known = knownSteps(home, key);
  for (const layer of loaded.defaults) {
    for (const step of layer.steps.keys()) {
      if (known.includes(step)) continue;
      warn(
        layer.file,
        `workflow.defaults.${step}: no step '${step}' in ${searched(home, key, "steps")}${suggest(step, known, "steps")}`,
      );
    }
  }
}
