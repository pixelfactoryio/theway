import { readFileSync } from "node:fs";
import { effectiveConfig, enabled } from "./config";
import { thewayHome } from "./io";
import { invalidSegments } from "./path";

const PHASES = ["engineering", "develop", "document"] as const;
type Phase = (typeof PHASES)[number];

/** The phases a user standard's `applies_to` can name; it never applies to `document`. */
const USER_PHASES = ["engineering", "develop"] as const;
type UserPhase = (typeof USER_PHASES)[number];

/** The phases a shipped opt-in standard applies to, whatever its content. */
const OPT_IN_PHASES: readonly Phase[] = ["engineering", "document"];

const isPhase = (v: string): v is Phase => (PHASES as readonly string[]).includes(v);
const isUserPhase = (v: string): v is UserPhase => (USER_PHASES as readonly string[]).includes(v);

/** The phases a file's `applies_to` lists, or `null` when its value or form is invalid. */
function parseList(first: string, rest: string[]): UserPhase[] | null {
  let values: string[];
  if (first !== "") {
    const flow = /^\[(.*)\]$/.exec(first);
    if (flow === null) return null;
    values = (flow[1] ?? "").split(",").map((v) => v.trim());
  } else {
    values = [];
    for (const line of rest) {
      const item = /^\s+-\s+(.*)$/.exec(line);
      if (item === null) break;
      values.push((item[1] ?? "").trim());
    }
  }
  if (values.length === 0 || !values.every(isUserPhase)) return null;
  return values as UserPhase[];
}

/** The phases a user standard applies to: its `applies_to`, both without one, both with a warning when it is invalid, none with a warning when it cannot be read. */
function phasesOf(path: string): readonly Phase[] {
  let text: string;
  try {
    text = readFileSync(path, "utf-8");
  } catch {
    process.stderr.write(`theway: warning: ${path}: cannot be read; skipped\n`);
    return [];
  }
  const lines = text.split("\n").map((l) => l.replace(/\s+$/, ""));
  if (lines[0] !== "---") return USER_PHASES;
  const close = lines.indexOf("---", 1);
  if (close === -1) return USER_PHASES;
  const front = lines.slice(1, close);
  const at = front.findIndex((l) => /^applies_to:/.test(l));
  if (at === -1) return USER_PHASES;
  const phases = parseList((front[at] ?? "").slice("applies_to:".length).trim(), front.slice(at + 1));
  if (phases === null) {
    process.stderr.write(`theway: warning: ${path}: applies_to must list engineering and/or develop; applied to both\n`);
    return USER_PHASES;
  }
  return phases;
}

/**
 * `theway standards <project> <engineering|develop|document>`: the enabled standards that apply, global ones first.
 * Shipped opt-in standards apply to `engineering` and `document`, user standards to the phases of their `applies_to`.
 */
export function cmdStandards(project: string, phase: string): number {
  if (invalidSegments([["project", project]])) return 1;
  if (!isPhase(phase)) {
    const shown = phase.replaceAll("\n", "\\n").replaceAll("\r", "\\r");
    process.stderr.write(`theway: invalid phase '${shown}': must be engineering, develop or document\n`);
    return 1;
  }

  const result = effectiveConfig(thewayHome(), project, false);
  if ("error" in result) {
    process.stderr.write(`${result.error}\n`);
    return 1;
  }
  let out = "";
  for (const s of result.standards) {
    if (!enabled(result.config, s.key)) continue;
    if (s.optIn ? OPT_IN_PHASES.includes(phase) : phase !== "document" && phasesOf(s.path).includes(phase)) {
      out += `${s.path}\n`;
    }
  }
  process.stdout.write(out);
  return 0;
}
