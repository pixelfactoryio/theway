import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { thewayHome } from "./io";

const KEY = /^[A-Za-z0-9-]{1,200}$/;

/** Why `v` is not a valid project key, `""` when it is one. */
export function projectReason(v: string): string {
  return KEY.test(v) ? "" : 'must be letters, digits and "-", at most 200 characters';
}

/** The trimmed stdout of `git rev-parse <flag>` in the current directory, `null` when git fails or is missing. */
function revParse(flag: string): string | null {
  const res = spawnSync("git", ["rev-parse", flag], {
    cwd: process.cwd(),
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (res.error !== undefined || res.status !== 0) return null;
  return res.stdout.trim();
}

/**
 * The project root: the main repository's root from a repository, any of its subfolders or a linked worktree; the
 * worktree root of a bare repository or a separate git dir; the current directory outside git. Physical path.
 */
export function projectRoot(): string {
  const cwd = process.cwd();
  let root = cwd;
  const common = revParse("--git-common-dir");
  if (common !== null) {
    const dir = resolve(cwd, common);
    if (basename(dir) === ".git") root = dirname(dir);
    else {
      const top = revParse("--show-toplevel");
      root = top !== null && top !== "" ? resolve(cwd, top) : cwd;
    }
  }
  try {
    return realpathSync(root);
  } catch {
    return root;
  }
}

/** The key of a project root: its absolute path with every character outside `[A-Za-z0-9]` replaced by `-`. */
export const keyOf = (root: string): string => root.replace(/[^A-Za-z0-9]/g, "-");

/** The folder of a project under the home. */
export const projectDir = (home: string, key: string): string => join(home, "projects", key);

/**
 * The project key: `override` once validated, else the key derived from the current directory. Writes the error line
 * and returns `null` when the override is invalid or the derived key is longer than 200 characters.
 */
export function resolveKey(override: string | undefined): string | null {
  if (override !== undefined) {
    const reason = projectReason(override);
    if (reason === "") return override;
    const shown = override.replaceAll("\n", "\\n").replaceAll("\r", "\\r");
    process.stderr.write(`theway: invalid project '${shown}': ${reason}\n`);
    return null;
  }
  const root = projectRoot();
  const key = keyOf(root);
  if (key.length > 200) {
    process.stderr.write(`theway: project key for ${root} is longer than 200 characters; pass --project <key>\n`);
    return null;
  }
  return key;
}

/** `theway project [--project <key>]`: the project key and folder. */
export function cmdProject(override: string | undefined): number {
  const key = resolveKey(override);
  if (key === null) return 1;
  process.stdout.write(`key: ${key}\ndir: ${projectDir(thewayHome(), key)}\n`);
  return 0;
}
