import { readFileSync } from "node:fs";
import { effectiveConfig, enabled, type Loaded } from "./config";
import { escaped, thewayHome } from "./io";
import { error, print, warning, warnQuiet } from "./output";
import { resolveKey } from "./project";
import { parseYaml } from "./text";

const PHASES = ["engineering", "develop", "document"] as const;
export type Phase = (typeof PHASES)[number];

const isPhase = (v: string): v is Phase => (PHASES as readonly string[]).includes(v);

/**
 * The phases a standard applies to: its `applies_to`, all three without one; none, with the warning message, when it is
 * invalid or cannot be read.
 */
function phasesOf(path: string): { phases: readonly Phase[]; warning: string | null } {
  let text: string;
  try {
    text = readFileSync(path, "utf-8");
  } catch {
    return { phases: [], warning: `${path}: cannot be read; skipped` };
  }
  const all = { phases: PHASES, warning: null };
  const lines = text.split("\n").map((l) => l.replace(/\s+$/, ""));
  if (lines[0] !== "---") return all;
  const close = lines.indexOf("---", 1);
  if (close === -1) return all;
  const front = lines.slice(1, close);
  const invalid = { phases: [], warning: `${path}: applies_to must list engineering, develop and/or document; skipped` };
  const read = parseYaml(front.join("\n"));
  if ("reason" in read) return front.some((l) => /^applies_to:/.test(l)) ? invalid : all;
  const parsed = read.root;
  if (parsed === null) return all;
  if (!(parsed instanceof Map)) return invalid;
  if (!parsed.has("applies_to")) return all;
  const values: unknown = parsed.get("applies_to");
  if (!Array.isArray(values) || values.length === 0 || !values.every((v) => typeof v === "string" && isPhase(v))) return invalid;
  return { phases: values as Phase[], warning: null };
}

/** The message `invalid phase '<phase>': …` when `phase` is not a phase; `null` when it is one. */
export function checkPhase(phase: string): string | null {
  if (isPhase(phase)) return null;
  const shown = escaped(phase);
  return `invalid phase '${shown}': must be engineering, develop or document`;
}

/**
 * The paths of the enabled standards that apply to a phase, global ones first, and one warning per standard whose
 * `applies_to` is invalid or cannot be read, in the order they are first read. Every standard, shipped opt-in or user,
 * applies to the phases of its `applies_to`, all three without one. A global file shadowed by a project file with the
 * same name is dropped for the phases that project file applies to.
 */
export function selectStandards(loaded: Loaded, phase: Phase): { paths: string[]; warnings: string[] } {
  const phases = new Map<string, readonly Phase[]>();
  const warnings: string[] = [];
  const of = (path: string): readonly Phase[] => {
    let known = phases.get(path);
    if (known === undefined) {
      const read = phasesOf(path);
      if (read.warning !== null) warnings.push(read.warning);
      known = read.phases;
      phases.set(path, known);
    }
    return known;
  };
  const paths = loaded.standards
    .filter((s) => enabled(loaded.config, s.key))
    .filter((s) => of(s.path).includes(phase) && (s.shadowedBy === undefined || !of(s.shadowedBy).includes(phase)))
    .map((s) => s.path);
  return { paths, warnings };
}

/** `theway standards <engineering|develop|document> [--project <key>]`: the paths `selectStandards` gives, one per line. */
export function cmdStandards(phase: string, override: string | undefined): number {
  const resolved = resolveKey(override);
  if ("error" in resolved) return error(resolved.error);
  if (resolved.warning !== null) warning(resolved.warning);
  const invalid = checkPhase(phase);
  if (invalid !== null) return error(invalid);

  const result = effectiveConfig(thewayHome(), resolved.key, warnQuiet);
  if ("error" in result) return error(result.error);
  const selected = selectStandards(result, phase as Phase);
  for (const w of selected.warnings) warning(w);
  print(selected.paths.map((p) => `${p}\n`).join(""));
  return 0;
}
