import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { effectiveConfig, enabled, type Loaded } from "./config";
import { escaped, thewayHome } from "./io";
import { resolveKey } from "./project";

const PHASES = ["engineering", "develop", "document"] as const;
export type Phase = (typeof PHASES)[number];

const isPhase = (v: string): v is Phase => (PHASES as readonly string[]).includes(v);

/** The phases a standard applies to: its `applies_to`, all three without one, none with a warning when it is invalid or cannot be read. */
function phasesOf(path: string): readonly Phase[] {
  let text: string;
  try {
    text = readFileSync(path, "utf-8");
  } catch {
    process.stderr.write(`theway: warning: ${path}: cannot be read; skipped\n`);
    return [];
  }
  const lines = text.split("\n").map((l) => l.replace(/\s+$/, ""));
  if (lines[0] !== "---") return PHASES;
  const close = lines.indexOf("---", 1);
  if (close === -1) return PHASES;
  const front = lines.slice(1, close);
  const invalid = (): readonly Phase[] => {
    process.stderr.write(`theway: warning: ${path}: applies_to must list engineering, develop and/or document; skipped\n`);
    return [];
  };
  let parsed: unknown;
  try {
    parsed = parse(front.join("\n"), { mapAsMap: true, logLevel: "error" });
  } catch {
    return front.some((l) => /^applies_to:/.test(l)) ? invalid() : PHASES;
  }
  if (parsed === null) return PHASES;
  if (!(parsed instanceof Map)) return invalid();
  if (!parsed.has("applies_to")) return PHASES;
  const values: unknown = parsed.get("applies_to");
  if (!Array.isArray(values) || values.length === 0 || !values.every((v) => typeof v === "string" && isPhase(v))) return invalid();
  return values as Phase[];
}

/** Whether `phase` is a phase; writes the reason line when it is not. */
export function checkPhase(phase: string): phase is Phase {
  if (isPhase(phase)) return true;
  const shown = escaped(phase);
  process.stderr.write(`theway: invalid phase '${shown}': must be engineering, develop or document\n`);
  return false;
}

/**
 * The paths of the enabled standards that apply to a phase, global ones first. Every standard, shipped opt-in or
 * user, applies to the phases of its `applies_to`, all three without one. A global file shadowed by a project file
 * with the same name is dropped for the phases that project file applies to.
 */
export function selectStandards(loaded: Loaded, phase: Phase): string[] {
  const phases = new Map<string, readonly Phase[]>();
  const of = (path: string): readonly Phase[] => {
    let known = phases.get(path);
    if (known === undefined) {
      known = phasesOf(path);
      phases.set(path, known);
    }
    return known;
  };
  return loaded.standards
    .filter((s) => enabled(loaded.config, s.key))
    .filter((s) => of(s.path).includes(phase) && (s.shadowedBy === undefined || !of(s.shadowedBy).includes(phase)))
    .map((s) => s.path);
}

/** `theway standards <engineering|develop|document> [--project <key>]`: the paths `selectStandards` gives, one per line. */
export function cmdStandards(phase: string, override: string | undefined): number {
  const key = resolveKey(override);
  if (key === null) return 1;
  if (!checkPhase(phase)) return 1;

  const result = effectiveConfig(thewayHome(), key, false);
  if ("error" in result) {
    process.stderr.write(`${result.error}\n`);
    return 1;
  }
  process.stdout.write(selectStandards(result, phase).map((p) => `${p}\n`).join(""));
  return 0;
}
