/** The changes of a project as the dashboard reads them: `GET /api/projects/:key/changes` and one change's page. */
import { homedir } from "node:os";
import { sep } from "node:path";
import { CHANGE_FILE, checkRead } from "../core/change";
import { changeStatus } from "../core/change-text";
import type { ArchiveEntry, ChangeRef, ChangeStore } from "../core/store";
import { type ActiveChange, type ArchivedChange, type ChangeDetail, type ChangeList, type ChangeTask, MEMBER, type SeriesMember } from "./contract";

/** A dated archive entry: the only kind the dashboard lists. */
type Dated = ArchiveEntry & { id: string; date: string };

/** The dated archive entries of a project, oldest first. */
export const datedArchives = (store: ChangeStore, key: string): Dated[] =>
  store.archived(key).filter((e): e is Dated => e.id !== null && e.date !== null);

/** The state of a change read through the store: its status, description, tasks, counts and issues. */
function readState(
  store: ChangeStore,
  key: string,
  change: ChangeRef,
): {
  status: ActiveChange["status"];
  description: string | null;
  tasks: ChangeTask[];
  done: number;
  total: number;
  issues: string[];
} {
  const c = checkRead(store.readFile(key, change, CHANGE_FILE));
  const status = changeStatus(c);
  if ("issues" in c) return { status, description: null, tasks: [], done: 0, total: 0, issues: c.issues };
  const done = c.change.tasks.filter((t) => t.done).length;
  return { status, description: c.change.description, tasks: c.change.tasks, done, total: c.change.tasks.length, issues: [] };
}

/** One active change of the project `key`, as the list route gives it. */
export function activeRow(store: ChangeStore, key: string, id: string): ActiveChange {
  const change = { kind: "active", id } as const;
  const s = readState(store, key, change);
  return {
    id,
    description: s.description,
    status: s.status,
    done: s.done,
    total: s.total,
    issues: s.issues,
    updated: store.updated(key, change),
  };
}

const archivedRow = (e: Dated): ArchivedChange => ({ dir: e.ref, id: e.id, date: e.date });

/** The body of `GET /api/projects/:key/changes`: active by ID, archived newest first. */
export function listChanges(store: ChangeStore, key: string): ChangeList {
  const active = store.activeIds(key).map((id) => activeRow(store, key, id));
  const archived = datedArchives(store, key).reverse().map(archivedRow);
  return { active, archived };
}

/** `path` with `home` written `~` when the path is under it, else the path unchanged. */
export function tildePath(path: string, home: string = homedir()): string {
  if (home === "" || home === sep) return path;
  const base = home.endsWith(sep) ? home.slice(0, -1) : home;
  if (path === base) return "~";
  return path.startsWith(`${base}${sep}`) ? `~${path.slice(base.length)}` : path;
}

/** The Markdown files of a change, in `fileNames` order, each with its text and version; one that cannot be read is left out. */
function markdownFiles(store: ChangeStore, key: string, change: ChangeRef): { name: string; text: string; version: string }[] {
  return store
    .fileNames(key, change)
    .filter((name) => name !== CHANGE_FILE)
    .flatMap((name) => {
      const read = store.readFile(key, change, name);
      return read === null ? [] : [{ name, text: read.bytes.toString("utf-8"), version: read.version }];
    });
}

/**
 * The series of the change `id` in the project `key`, `null` unless the ID ends in `-NN`: one member per ordinal from
 * `01` to the highest found among the active and dated archived changes; an active change fills an ordinal before
 * archived ones, and the last archived one in the store's order before earlier ones.
 */
export function seriesOf(store: ChangeStore, key: string, id: string): ChangeDetail["series"] {
  const m = MEMBER.exec(id);
  if (m === null) return null;
  const seriesId = m[1] as string;
  const ordinalOf = (changeId: string): number | null => {
    const mm = MEMBER.exec(changeId);
    return mm !== null && mm[1] === seriesId ? Number(mm[2]) : null;
  };
  const active = new Map<number, string>();
  for (const a of store.activeIds(key)) {
    const n = ordinalOf(a);
    if (n !== null) active.set(n, a);
  }
  const archived = new Map<number, Dated>();
  for (const e of datedArchives(store, key)) {
    const n = ordinalOf(e.id);
    if (n !== null) archived.set(n, e);
  }
  const highest = Math.max(0, ...active.keys(), ...archived.keys());
  const members: SeriesMember[] = [];
  for (let n = 1; n <= highest; n++) {
    const ordinal = String(n).padStart(2, "0");
    const a = active.get(n);
    const e = archived.get(n);
    if (a !== undefined) {
      const row = activeRow(store, key, a);
      members.push({ ordinal, id: a, active: a, archived: null, status: row.status, done: row.done, total: row.total });
    } else if (e !== undefined) {
      members.push({ ordinal, id: e.id, active: null, archived: e.ref, status: "archived", done: null, total: null });
    } else {
      members.push({ ordinal, id: `${seriesId}-${ordinal}`, active: null, archived: null, status: null, done: null, total: null });
    }
  }
  return { id: seriesId, members };
}

/** The page of the active change `id`, or of the dated archive entry `archive` when given. */
export function changeDetail(store: ChangeStore, key: string, id: string, archive: Dated | null = null, home: string = homedir()): ChangeDetail {
  const change: ChangeRef = archive === null ? { kind: "active", id } : { kind: "archived", ref: archive.ref };
  const s = readState(store, key, change);
  const files = markdownFiles(store, key, change);
  let changeFile: ChangeDetail["changeFile"] = null;
  if (archive === null) {
    const read = store.readFile(key, change, CHANGE_FILE);
    changeFile = read === null ? null : { text: read.bytes.toString("utf-8"), version: read.version };
  }
  return {
    id,
    archived: archive === null ? null : archive.date,
    ref: archive === null ? null : archive.ref,
    description: s.description,
    status: archive === null ? s.status : "archived",
    done: s.done,
    total: s.total,
    issues: s.issues,
    tasks: s.tasks,
    updated: store.updated(key, change),
    folder: tildePath(store.dirOf(key, change), home),
    files: archive === null ? files : files.map(({ name, text }) => ({ name, text })),
    ...(archive === null ? { changeFile } : {}),
    series: seriesOf(store, key, id),
  };
}
