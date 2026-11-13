/** The projects of a home as the dashboard lists them: key, label and number of active changes. */
import { readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { isDir } from "../core/io";
import { activeIds } from "../core/list";
import { keyOf, projectDir, projectReason } from "../core/project";

/** One project of `GET /api/projects`. */
export type Project = { key: string; label: string; active: number };

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The project keys of a home, sorted: the non-hidden folders of its `projects/` whose name is a valid key. */
export function projectKeys(home: string): string[] {
  const dir = join(home, "projects");
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names.filter((n) => !n.startsWith(".") && projectReason(n) === "" && isDir(join(dir, n))).sort(byText);
}

/** The subfolder names of `dir`; none when it cannot be read. */
function subfolders(dir: string): string[] {
  try {
    return readdirSync(dir).filter((n) => isDir(join(dir, n)));
  } catch {
    return [];
  }
}

/**
 * The folder whose project key is `key`, found depth first from `dir`: at each level, the subfolders whose `-` + key of
 * their name starts what is left of the key, longest match first, backtracking to the next shorter one when a branch
 * ends before the key is used up. `null` when no folder uses it all.
 */
export function folderOf(key: string, dir = "/", rest = key): string | null {
  if (rest === "") return dir;
  const matches = subfolders(dir)
    .map((name) => ({ name, part: `-${keyOf(name)}` }))
    .filter(({ part }) => rest.startsWith(part))
    .sort((a, b) => b.part.length - a.part.length || byText(a.name, b.name));
  for (const { name, part } of matches) {
    const found = folderOf(key, join(dir, name), rest.slice(part.length));
    if (found !== null) return found;
  }
  return null;
}

/**
 * The fallback label of each key: the key without the longest prefix all keys share that ends in `-`; with one key, the
 * key without its leading `-`. A label that would be empty is the key.
 */
function prefixLabels(keys: string[]): string[] {
  if (keys.length === 1) {
    const only = keys[0] as string;
    return [only.replace(/^-/, "") || only];
  }
  let common = keys[0] ?? "";
  for (const key of keys) {
    while (!key.startsWith(common)) common = common.slice(0, -1);
  }
  const cut = common.lastIndexOf("-") + 1;
  return keys.map((key) => key.slice(cut) || key);
}

/**
 * The label of each key: the name of its project's folder; the fallback label when the folder is not found or another
 * project's folder has the same name.
 */
export function labels(keys: string[], find: (key: string) => string | null = folderOf): string[] {
  const fallback = prefixLabels(keys);
  const names = keys.map((key) => {
    const folder = find(key);
    return folder === null || folder === "/" ? null : basename(folder);
  });
  return keys.map((_, i) => {
    const name = names[i];
    if (name === null || name === undefined || names.filter((n) => n === name).length > 1) return fallback[i] as string;
    return name;
  });
}

/** Every project of a home, sorted by key, with its label and its number of active changes. */
export function projects(home: string): Project[] {
  const keys = projectKeys(home);
  const names = labels(keys);
  return keys.map((key, i) => ({ key, label: names[i] as string, active: activeIds(projectDir(home, key)).length }));
}
