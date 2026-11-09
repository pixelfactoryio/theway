/** The projects of a home: their keys and the labels the dashboard shows for them. */
import { readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { isDir } from "../core/io";
import { keyOf, projectReason } from "../core/project";

export const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The project keys of a home, sorted: its `projects/` folder names that are valid keys. */
export function projectKeys(home: string): string[] {
  const dir = join(home, "projects");
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names.filter((n) => projectReason(n) === "" && isDir(join(dir, n))).sort(byText);
}

/**
 * The folder whose project key is `key`, found by walking the file system from `dir`: each level follows the
 * subfolders whose `-` + key of their name starts the rest of the key, longest first; `null` when none consumes it all.
 */
export function folderOf(key: string, dir = "/", rest = key): string | null {
  if (rest === "") return dir;
  let names: string[];
  try {
    names = readdirSync(dir).sort(byText);
  } catch {
    return null;
  }
  // The longest match first, so `revecto-docs` wins over `revecto` and its own `docs` subfolder.
  const matches = names
    .map((name) => ({ name, part: `-${keyOf(name)}` }))
    .filter(({ part }) => rest.startsWith(part) && (rest.length === part.length || rest[part.length] === "-"))
    .sort((a, b) => b.part.length - a.part.length || byText(a.name, b.name));
  for (const { name, part } of matches) {
    const after = rest.slice(part.length);
    const path = join(dir, name);
    if (!isDir(path)) continue;
    const found = folderOf(key, path, after);
    if (found !== null) return found;
  }
  return null;
}

/**
 * The fallback label of each key: with two or more keys, the key without the longest prefix common to all keys that
 * ends in `-`; with one, the key without its leading `-`. A label that would be empty is the key.
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
 * The label of each key: the name of its project folder (`folderOf`), or `<parent>/<name>` when two projects share a
 * name; the `prefixLabels` label when its folder cannot be found.
 */
export function labels(keys: string[], find: (key: string) => string | null = folderOf): string[] {
  const fallback = prefixLabels(keys);
  const folders = keys.map((key) => find(key));
  const names = folders.map((f) => (f === null ? null : basename(f)));
  return keys.map((_, i) => {
    const folder = folders[i];
    const name = names[i];
    if (folder === null || folder === undefined || !name) return fallback[i] as string;
    const shared = names.filter((n) => n === name).length > 1;
    return shared ? `${basename(dirname(folder))}/${name}` : name;
  });
}

/** Every project of a home, in `projectKeys` order, with its label. */
export function projectLabels(home: string): { key: string; label: string }[] {
  const keys = projectKeys(home);
  const names = labels(keys);
  return keys.map((key, i) => ({ key, label: names[i] as string }));
}
