/** The changes of a project as the dashboard reads them: `GET /api/projects/:key/changes` and one change's page. */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, sep } from "node:path";
import { CHANGE_FILE, checkChange } from "../core/change";
import { changeStatus } from "../core/change-text";
import { isFile } from "../core/io";
import { activeIds, archiveDirs } from "../core/list";
import { type ActiveChange, type ArchivedChange, type ChangeDetail, type ChangeList, type ChangeTask, MEMBER, type SeriesMember } from "./contract";

/** An archive folder the dashboard lists: a date, `-`, then the change's ID. */
const ARCHIVE_DIR = /^\d{4}-\d{2}-\d{2}-.+/;

/** The Markdown files that come first, in this order. */
const FIRST = ["spec.md", "design.md", "notes.md"];

const changesDir = (projectDir: string): string => join(projectDir, "changes");

/** The archive folders of a project the list route lists, oldest first. */
export const listedArchiveDirs = (projectDir: string): string[] => archiveDirs(projectDir).filter((d) => ARCHIVE_DIR.test(d));

/** The state of a change folder read through `checkChange`: its status, description, tasks, counts and issues. */
function readState(dir: string): {
  status: ActiveChange["status"];
  description: string | null;
  tasks: ChangeTask[];
  done: number;
  total: number;
  issues: string[];
} {
  const c = checkChange(dir);
  const status = changeStatus(c);
  if ("issues" in c) return { status, description: null, tasks: [], done: 0, total: 0, issues: c.issues };
  const done = c.change.tasks.filter((t) => t.done).length;
  return { status, description: c.change.description, tasks: c.change.tasks, done, total: c.change.tasks.length, issues: [] };
}

/** The SHA-256 of a file's bytes, as hex: the version a save is made against. */
export const versionOf = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

/** The modification time of `change.yaml`, or of the folder when the file is missing, as an ISO string. */
function updatedOf(dir: string): string {
  const file = join(dir, CHANGE_FILE);
  try {
    return statSync(isFile(file) ? file : dir).mtime.toISOString();
  } catch {
    return new Date(0).toISOString();
  }
}

/** One active change of the project folder `projectDir`, as the list route gives it. */
export function activeRow(projectDir: string, id: string): ActiveChange {
  const dir = join(changesDir(projectDir), id);
  const s = readState(dir);
  return {
    id,
    description: s.description,
    status: s.status,
    done: s.done,
    total: s.total,
    issues: s.issues,
    updated: updatedOf(dir),
  };
}

const archivedRow = (dir: string): ArchivedChange => ({ dir, id: dir.slice(11), date: dir.slice(0, 10) });

/** The body of `GET /api/projects/:key/changes`: active by ID, archived newest first. */
export function listChanges(projectDir: string): ChangeList {
  const active = activeIds(projectDir).map((id) => activeRow(projectDir, id));
  const archived = listedArchiveDirs(projectDir)
    .sort()
    .reverse()
    .map(archivedRow);
  return { active, archived };
}

/** `path` with `home` written `~` when the path is under it, else the path unchanged. */
export function tildePath(path: string, home: string = homedir()): string {
  if (home === "" || home === sep) return path;
  const base = home.endsWith(sep) ? home.slice(0, -1) : home;
  if (path === base) return "~";
  return path.startsWith(`${base}${sep}`) ? `~${path.slice(base.length)}` : path;
}

/** The names of the Markdown files directly in `dir`: `spec.md`, `design.md`, `notes.md` when present, then the others by name. */
export function markdownNames(dir: string): string[] {
  let names: string[];
  try {
    names = readdirSync(dir).filter((n) => n.endsWith(".md") && !n.startsWith(".") && isFile(join(dir, n)));
  } catch {
    return [];
  }
  const first = FIRST.filter((n) => names.includes(n));
  const rest = names.filter((n) => !FIRST.includes(n)).sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
  return [...first, ...rest];
}

/** A file's text and version, `null` when it cannot be read. */
function readVersioned(path: string): { text: string; version: string } | null {
  try {
    const bytes = readFileSync(path);
    return { text: bytes.toString("utf-8"), version: versionOf(bytes) };
  } catch {
    return null;
  }
}

/** The Markdown files of `markdownNames`, each with its text and version. */
function markdownFiles(dir: string): { name: string; text: string; version: string }[] {
  return markdownNames(dir).flatMap((name) => {
    const read = readVersioned(join(dir, name));
    return read === null ? [] : [{ name, ...read }];
  });
}

/**
 * The series of the change `id` in the project folder `projectDir`, `null` unless the ID ends in `-NN`: one member per
 * ordinal from `01` to the highest found among the active and listed archived changes; an active folder fills an
 * ordinal before archived ones, and the newest archive folder before older ones.
 */
export function seriesOf(projectDir: string, id: string): ChangeDetail["series"] {
  const m = MEMBER.exec(id);
  if (m === null) return null;
  const seriesId = m[1] as string;
  const ordinalOf = (changeId: string): number | null => {
    const mm = MEMBER.exec(changeId);
    return mm !== null && mm[1] === seriesId ? Number(mm[2]) : null;
  };
  const active = new Map<number, string>();
  for (const a of activeIds(projectDir)) {
    const n = ordinalOf(a);
    if (n !== null) active.set(n, a);
  }
  const archived = new Map<number, string>();
  for (const d of listedArchiveDirs(projectDir)) {
    const n = ordinalOf(d.slice(11));
    if (n !== null && (archived.get(n) ?? "") < d) archived.set(n, d);
  }
  const highest = Math.max(0, ...active.keys(), ...archived.keys());
  const members: SeriesMember[] = [];
  for (let n = 1; n <= highest; n++) {
    const ordinal = String(n).padStart(2, "0");
    const a = active.get(n);
    const d = archived.get(n);
    if (a !== undefined) {
      const row = activeRow(projectDir, a);
      members.push({ ordinal, active: a, archived: null, status: row.status, done: row.done, total: row.total });
    } else if (d !== undefined) {
      members.push({ ordinal, active: null, archived: d, status: "archived", done: null, total: null });
    } else {
      members.push({ ordinal, active: null, archived: null, status: null, done: null, total: null });
    }
  }
  return { id: seriesId, members };
}

/** The page of the active change `id`, or of the archive folder `archiveDir` when given. */
export function changeDetail(projectDir: string, id: string, archiveDir: string | null = null, home: string = homedir()): ChangeDetail {
  const dir = archiveDir === null ? join(changesDir(projectDir), id) : join(changesDir(projectDir), "archive", archiveDir);
  const s = readState(dir);
  return {
    id,
    archived: archiveDir === null ? null : archiveDir.slice(0, 10),
    description: s.description,
    status: archiveDir === null ? s.status : "archived",
    done: s.done,
    total: s.total,
    issues: s.issues,
    tasks: s.tasks,
    updated: updatedOf(dir),
    folder: tildePath(dir, home),
    files: archiveDir === null ? markdownFiles(dir) : markdownFiles(dir).map(({ name, text }) => ({ name, text })),
    ...(archiveDir === null ? { changeFile: isFile(join(dir, CHANGE_FILE)) ? readVersioned(join(dir, CHANGE_FILE)) : null } : {}),
    series: seriesOf(projectDir, id),
  };
}
