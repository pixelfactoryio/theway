/**
 * The versions of a workflow or step file: the text each dashboard save replaced, kept under `<home>/history/` as
 * `<ts>-<sha12>.yaml`, the newest `HISTORY_LIMIT` per file.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { isDir, isFile, writeAtomic } from "../core/io";
import type { FileVersion } from "./types";
import type { FileTarget } from "./validate";

/** The most versions kept per file. */
export const HISTORY_LIMIT = 20;
/** A version's ID: its `<ts>-<sha12>` file name without `.yaml`. */
export const VERSION_ID = /^\d{8}T\d{9}Z-[0-9a-f]{12}$/;
/** The ID that names a global file's shipped text. */
export const SHIPPED = "shipped";

/** The history folder of a file: `<home>/history/global/<kind>/<name>/` or `<home>/history/projects/<key>/<kind>/<name>/`. */
export const historyDir = (home: string, t: FileTarget): string =>
  t.scope === "global" ? join(home, "history", "global", t.kind, t.name) : join(home, "history", "projects", t.key as string, t.kind, t.name);

/** The shipped text's path of a global file: `<home>/<kind>/<name>.default.yaml`; `null` for a project file. */
const shippedPath = (home: string, t: FileTarget): string | null => (t.scope === "global" ? join(home, t.kind, `${t.name}.default.yaml`) : null);

/** `date` as a `<ts>`: its ISO form without `-`, `:` and `.`. */
const stampOf = (date: Date): string => date.toISOString().replace(/[-:.]/g, "");

/** The time a `<ts>` stands for. */
const dateOf = (ts: string): Date =>
  new Date(`${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(9, 11)}:${ts.slice(11, 13)}:${ts.slice(13, 15)}.${ts.slice(15, 18)}Z`);

/** The version IDs in `dir`, oldest first; a missing folder throws. */
const idsIn = (dir: string): string[] =>
  readdirSync(dir)
    .filter((f) => f.endsWith(".yaml") && VERSION_ID.test(f.slice(0, -".yaml".length)))
    .map((f) => f.slice(0, -".yaml".length))
    .sort();

/**
 * Keeps the bytes of the file at `path` as a version of `target`, unless the newest version holds the same sha256, then
 * removes all but the newest `HISTORY_LIMIT`. A version's `<ts>` is `now`'s, or the newest one's plus 1 ms when `now`'s
 * is not later. Throws on any error, so the caller does not write the file.
 */
export function snapshot(home: string, target: FileTarget, path: string, now: Date = new Date()): void {
  const bytes = readFileSync(path);
  const sha12 = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
  const dir = historyDir(home, target);
  mkdirSync(dir, { recursive: true });
  const ids = idsIn(dir);
  const newest = ids[ids.length - 1];
  if (newest !== undefined && newest.endsWith(`-${sha12}`)) return;
  let ts = stampOf(now);
  if (newest !== undefined) {
    const last = newest.slice(0, newest.indexOf("-"));
    if (ts <= last) ts = stampOf(new Date(dateOf(last).getTime() + 1));
  }
  const id = `${ts}-${sha12}`;
  writeAtomic(join(dir, `${id}.yaml`), bytes);
  for (const old of [...ids, id].slice(0, -HISTORY_LIMIT)) rmSync(join(dir, `${old}.yaml`), { force: true });
}

/** The versions of `target`, newest first, `[]` without a folder; and whether a global file has its shipped text. */
export function versionsOf(home: string, target: FileTarget): { versions: FileVersion[]; shipped: boolean } {
  const dir = historyDir(home, target);
  const ids = isDir(dir) ? idsIn(dir).reverse() : [];
  const shipped = shippedPath(home, target);
  return {
    versions: ids.map((id) => ({ id, at: dateOf(id.slice(0, id.indexOf("-"))).toISOString() })),
    shipped: shipped !== null && isFile(shipped),
  };
}

/** The text of the version `id` of `target`, `null` when there is none; `id` is `shipped` or matches `VERSION_ID`. */
export function versionText(home: string, target: FileTarget, id: string): string | null {
  const path = id === SHIPPED ? shippedPath(home, target) : join(historyDir(home, target), `${id}.yaml`);
  if (path === null || !isFile(path)) return null;
  return readFileSync(path, "utf-8");
}

/** Whether `id` names a version: `shipped` or the `<ts>-<sha12>` form. */
export const isVersionId = (id: string): boolean => id === SHIPPED || VERSION_ID.test(id);
