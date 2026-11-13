/**
 * The dashboard's writes: a file saved or created under `<home>/workflows`, `<home>/prompts` or the same two folders of
 * a project, the text it replaces kept as a version under `<home>/history/`, and those versions listed, read and
 * restored; and a file of an active change saved in place. Every path is built from a listed project key, a listed
 * change, a listed file name, a name matching `NAME` and a version id matching its pattern, never taken from the request.
 */
import { createHash } from "node:crypto";
import { accessSync, constants, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { diffLines } from "diff";
import { CHANGE_FILE } from "../core/change-text";
import { isFile, writeAtomic } from "../core/io";
import { NAME } from "../core/language-schema";
import { activeIds } from "../core/list";
import { projectDir } from "../core/project";
import type { Kind } from "../core/step-files";
import { markdownNames } from "./changes";
import { absPath } from "./files";
import { projectKeys } from "./projects";

/** How many versions a file keeps: the newest. */
export const KEPT = 20;

/** A version's file name: `YYYYMMDDTHHMMSSmmmZ-<first 12 hex characters of the text's SHA-256>`. */
export const VERSION_ID = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z-[0-9a-f]{12}$/;

/** What a write route answers. */
export type Answer = { status: number; body: unknown };

/** One version of `GET …/history`. */
export type VersionRow = { id: string; at: string; added: number; removed: number };

const sha256 = (data: string | Buffer): string => createHash("sha256").update(data).digest("hex");

/** The bytes of a file, `null` when it cannot be read. */
function readBytes(path: string): Buffer | null {
  try {
    return readFileSync(path);
  } catch {
    return null;
  }
}

/** The answer refusing an unlisted project or an invalid name, `null` when both are valid. */
function refused(home: string, project: string | null, name: string): Answer | null {
  if (project !== null && !projectKeys(home).includes(project)) return { status: 404, body: { error: "unknown project" } };
  if (!NAME.test(name)) return { status: 404, body: { error: "unknown file" } };
  return null;
}

/** The folder of a file's versions: `<home>/history/global/<kind>/<name>` or `<home>/history/projects/<key>/<kind>/<name>`. */
const historyDir = (home: string, kind: Kind, project: string | null, name: string): string =>
  project === null ? join(home, "history", "global", kind, name) : join(home, "history", "projects", project, kind, name);

/** The version ids of a folder, newest first: its files whose name matches the pattern. */
function versionIds(dir: string): string[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((n) => VERSION_ID.test(n) && isFile(join(dir, n)))
    .sort()
    .reverse();
}

/** A version id's time stamp: `YYYYMMDDTHHMMSSmmmZ` of a date. */
const stampOf = (date: Date): string => date.toISOString().replace(/[-:.]/g, "");

/** The date a version id names. */
function dateOf(id: string): Date {
  const m = VERSION_ID.exec(id) as RegExpExecArray;
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.${m[7]}Z`);
}

/**
 * Keeps `text` as the newest version of the file, then drops all but the `KEPT` newest. The time is now, or 1ms after
 * the newest version when that is not earlier, so the names keep the order of the saves.
 */
function keepVersion(dir: string, text: Buffer): void {
  mkdirSync(dir, { recursive: true });
  const newest = versionIds(dir)[0];
  let at = new Date();
  if (newest !== undefined && dateOf(newest).getTime() >= at.getTime()) at = new Date(dateOf(newest).getTime() + 1);
  writeAtomic(join(dir, `${stampOf(at)}-${sha256(text).slice(0, 12)}`), text);
  for (const old of versionIds(dir).slice(KEPT)) rmSync(join(dir, old), { force: true });
}

/**
 * Writes `text` to the file `name` of `kind` in the global folder (`project` `null`) or the project's own, when its
 * current version is `base` (`null`: the file is absent). The `base` check comes first; the same text writes nothing
 * and keeps no version; otherwise the replaced text is kept as a version and the file written atomically, its folder
 * created when missing.
 */
export function writeFile(home: string, kind: Kind, project: string | null, name: string, text: string, base: string | null): Answer {
  const refusal = refused(home, project, name);
  if (refusal !== null) return refusal;
  const path = absPath(home, kind, project, name);
  const exists = isFile(path);
  const current = exists ? readBytes(path) : null;
  if (exists && current === null) return { status: 500, body: { error: "cannot be read" } };
  const version = current === null ? null : sha256(current);
  if (base === null && version !== null) return { status: 409, body: { error: "file exists", version } };
  if (version !== base) return { status: 409, body: { error: "changed on disk", version } };
  const bytes = Buffer.from(text, "utf-8");
  if (current !== null && current.equals(bytes)) return { status: 200, body: { version } };
  if (current !== null) keepVersion(historyDir(home, kind, project, name), current);
  mkdirSync(dirname(path), { recursive: true });
  writeAtomic(path, bytes);
  return { status: 200, body: { version: sha256(bytes) } };
}

/** The number of lines of a diff part's value. */
const lineCount = (value: string): number => value.split("\n").length - (value.endsWith("\n") ? 1 : 0);

/** `GET /api/<kind>/<file>/history`: the versions, newest first, each with its line counts against the one before it. */
export function listVersions(home: string, kind: Kind, project: string | null, name: string): Answer {
  const refusal = refused(home, project, name);
  if (refusal !== null) return refusal;
  const dir = historyDir(home, kind, project, name);
  const ids = versionIds(dir);
  const texts = ids.map((id) => readBytes(join(dir, id))?.toString("utf-8") ?? "");
  const versions: VersionRow[] = ids.map((id, i) => {
    let added = 0;
    let removed = 0;
    for (const part of diffLines(texts[i + 1] ?? "", texts[i] as string)) {
      if (part.added) added += lineCount(part.value);
      else if (part.removed) removed += lineCount(part.value);
    }
    return { id, at: dateOf(id).toISOString(), added, removed };
  });
  return { status: 200, body: { versions } };
}

/** The text of the version `id`, or the answer refusing it. */
function versionText(home: string, kind: Kind, project: string | null, name: string, id: string): { text: string } | Answer {
  const refusal = refused(home, project, name);
  if (refusal !== null) return refusal;
  const dir = historyDir(home, kind, project, name);
  if (!VERSION_ID.test(id) || !versionIds(dir).includes(id)) return { status: 404, body: { error: "unknown version" } };
  const bytes = readBytes(join(dir, id));
  if (bytes === null) return { status: 500, body: { error: "cannot be read" } };
  return { text: bytes.toString("utf-8") };
}

/** `GET /api/<kind>/<file>/history/:id`. */
export function readVersion(home: string, kind: Kind, project: string | null, name: string, id: string): Answer {
  const read = versionText(home, kind, project, name, id);
  return "text" in read ? { status: 200, body: { text: read.text } } : read;
}

/** `POST /api/<kind>/<file>/history/:id/restore`: the version's text written as `PUT` writes it. */
export function restoreVersion(home: string, kind: Kind, project: string | null, name: string, id: string, base: string | null): Answer {
  const read = versionText(home, kind, project, name, id);
  return "text" in read ? writeFile(home, kind, project, name, read.text, base) : read;
}

/**
 * `PUT /api/projects/:key/changes/:id/files/:name`: writes `text` to the file `name` of the active change `id` when its
 * current version is `base`. `name` is `change.yaml` or one of the change's listed Markdown files, and must exist. The
 * `base` check comes first; the same text writes nothing; otherwise the file is written atomically, keeping its mode.
 */
export function writeChangeFile(home: string, key: string, id: string, name: string, text: string, base: string): Answer {
  if (!projectKeys(home).includes(key)) return { status: 404, body: { error: "unknown project" } };
  const project = projectDir(home, key);
  if (!activeIds(project).includes(id)) return { status: 404, body: { error: "unknown change" } };
  const dir = join(project, "changes", id);
  const listed = name === CHANGE_FILE ? isFile(join(dir, CHANGE_FILE)) : markdownNames(dir).includes(name);
  if (!listed) return { status: 404, body: { error: "unknown file" } };
  const path = join(dir, name);
  const current = readBytes(path);
  if (current === null) return { status: 500, body: { error: "cannot be read" } };
  const version = sha256(current);
  if (version !== base) return { status: 409, body: { error: "changed on disk", version } };
  const bytes = Buffer.from(text, "utf-8");
  if (current.equals(bytes)) return { status: 200, body: { version } };
  try {
    accessSync(path, constants.W_OK);
    writeAtomic(path, bytes, statSync(path).mode & 0o777);
  } catch (e) {
    return { status: 500, body: { error: `cannot write: ${e instanceof Error ? e.message : String(e)}` } };
  }
  return { status: 200, body: { version: sha256(bytes) } };
}
