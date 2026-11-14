/**
 * Writes `dist/licenses/THIRD-PARTY-NOTICES.txt`: the licence of every package bundled into the dashboard client and
 * the CLI (read from the build's bun metafiles) and of the packages `globals.css` imports. Run last in `build`.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const METAFILES = ["src/dashboard/generated/app.meta.json", "src/dashboard/generated/cli.meta.json"];
const GLOBALS_CSS = join(ROOT, "src", "dashboard", "client", "styles", "globals.css");
const NOTICES = join(ROOT, "dist", "licenses", "THIRD-PARTY-NOTICES.txt");
const NO_LICENCE_FILE = "No licence file is included in the package.";
const SEPARATOR = "-".repeat(80);

/** A failure the script reports as `third-party-notices: <name>: <reason>`. */
class NoticeError extends Error {
  constructor(name: string, reason: string) {
    super(`third-party-notices: ${name}: ${reason}`);
  }
}

/** The package a path or specifier names: the segment after its last `node_modules/`, two when scoped. */
function packageName(path: string): string {
  const at = path.lastIndexOf("node_modules/");
  const parts = (at === -1 ? path : path.slice(at + "node_modules/".length)).split("/");
  return parts[0].startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0];
}

/** The sorted names of the packages of both bundles and of the `@import`/`@plugin` specifiers of `globals.css`. */
export function collectPackages(): string[] {
  const names = new Set<string>();
  for (const file of METAFILES) {
    const path = join(ROOT, file);
    if (!existsSync(path)) throw new NoticeError(file, "metafile not found, run the build first");
    const meta = JSON.parse(readFileSync(path, "utf-8")) as { inputs: Record<string, unknown> };
    for (const input of Object.keys(meta.inputs)) {
      if (input.includes("node_modules/")) names.add(packageName(input));
    }
  }
  const css = readFileSync(GLOBALS_CSS, "utf-8");
  for (const m of css.matchAll(/^@(?:import|plugin)\s+["']([^"']+)["']/gm)) names.add(packageName(m[1]));
  return [...names].sort();
}

/** The licence file of a package root: the first by name of its regular files that look like one. */
function licenceFile(dir: string): string | undefined {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((n) => {
      const lower = n.toLowerCase();
      return ["license", "licence", "copying"].some((p) => lower.startsWith(p)) || lower.endsWith("license.txt");
    })
    .sort()[0];
}

/** The notice block of one package: its header line, a blank line, then its licence text. */
function block(name: string): string {
  const dir = join(ROOT, "node_modules", name);
  const manifest = join(dir, "package.json");
  if (!existsSync(manifest)) throw new NoticeError(name, "package.json not found");
  const pkg = JSON.parse(readFileSync(manifest, "utf-8")) as { version: string; license?: string };
  const file = licenceFile(dir);
  const text = file ? readFileSync(join(dir, file), "utf-8").trimEnd() : NO_LICENCE_FILE;
  return `${name}@${pkg.version} — ${pkg.license}\n\n${text}`;
}

if (import.meta.main) {
  try {
    const notices = collectPackages().map(block).join(`\n\n${SEPARATOR}\n\n`);
    mkdirSync(join(ROOT, "dist", "licenses"), { recursive: true });
    writeFileSync(NOTICES, `${notices}\n`, "utf-8");
  } catch (err) {
    if (!(err instanceof NoticeError)) throw err;
    console.error(err.message);
    process.exit(1);
  }
}
