import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isFile, thewayHome } from "./io";
import { readManifest } from "./init";
import { invalidSegments } from "./path";

const PHASES = ["engineering", "develop"] as const;
type Phase = (typeof PHASES)[number];

/** Project names whose folder under the home holds theway's own files, or the folder the old layout kept its standards in. */
const SHARED = new Set(["data", "templates", "standards"]);

/** The names of the regular `.md` files directly in `dir`, sorted; none when it is missing. */
function mdFiles(dir: string): string[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names.filter((n) => n.endsWith(".md") && isFile(join(dir, n))).sort();
}

const isPhase = (v: string): v is Phase => (PHASES as readonly string[]).includes(v);

/** The phases a file's `applies_to` lists, or `null` when its value or form is invalid. */
function parseList(first: string, rest: string[]): Phase[] | null {
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
  if (values.length === 0 || !values.every(isPhase)) return null;
  return values as Phase[];
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
  if (lines[0] !== "---") return PHASES;
  const close = lines.indexOf("---", 1);
  if (close === -1) return PHASES;
  const front = lines.slice(1, close);
  const at = front.findIndex((l) => /^applies_to:/.test(l));
  if (at === -1) return PHASES;
  const phases = parseList((front[at] ?? "").slice("applies_to:".length).trim(), front.slice(at + 1));
  if (phases === null) {
    process.stderr.write(`theway: warning: ${path}: applies_to must list engineering and/or develop; applied to both\n`);
    return PHASES;
  }
  return phases;
}

/**
 * `theway standards <project> <engineering|develop>`: the user standards that apply, global ones first.
 * `<home>/standards/` is shared with the files install ships there: a name `.shipped.json` lists as `standards/<name>`,
 * and any `*.default.md` copy, is theway's, not a user standard.
 */
export function cmdStandards(project: string, phase: string): number {
  if (invalidSegments([["project", project]])) return 1;
  if (SHARED.has(project)) {
    process.stderr.write(
      `theway: project '${project}' shares its folder with theway's own files; no user standards are read for it\n`,
    );
    return 1;
  }
  if (!isPhase(phase)) {
    const shown = phase.replaceAll("\n", "\\n").replaceAll("\r", "\\r");
    process.stderr.write(`theway: invalid phase '${shown}': must be engineering or develop\n`);
    return 1;
  }

  const home = thewayHome();
  const globalDir = join(home, "standards");
  const projectDir = join(home, project, "standards");
  const projectNames = mdFiles(projectDir);
  const shipped = readManifest(home) ?? {};
  const candidates = [
    ...mdFiles(globalDir)
      .filter((n) => !(`standards/${n}` in shipped) && !n.endsWith(".default.md"))
      .filter((n) => !projectNames.includes(n))
      .map((n) => join(globalDir, n)),
    ...projectNames.map((n) => join(projectDir, n)),
  ];
  let out = "";
  for (const path of candidates) if (phasesOf(path).includes(phase)) out += `${path}\n`;
  process.stdout.write(out);
  return 0;
}
