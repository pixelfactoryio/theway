/**
 * The `ChangeStore` backed by the folders of a home: `<home>/projects/<key>/changes/<id>` for an active change and
 * `<home>/projects/<key>/changes/archive/<ref>` for an archived one, `<ref>` being `<date>-<id>` for a dated archive.
 */
import { createHash } from "node:crypto";
import { accessSync, constants, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import { CHANGE_FILE } from "../change-text";
import { isDir, isFile, writeAtomic } from "../io";
import { projectDir, projectReason } from "../project";
import { type ArchiveEntry, type ChangeRef, type ChangeStore, type FileRead, StoreError, type WriteResult } from "../store";

/** The SHA-256 of `data`, as hex: a file's version. */
export const sha256 = (data: string | Buffer): string => createHash("sha256").update(data).digest("hex");

/** An archive folder with a date: a date, `-`, then the change's ID. */
const DATED = /^\d{4}-\d{2}-\d{2}-.+/;

/** The Markdown files that come first, in this order. */
const FIRST = ["spec.md", "design.md", "notes.md"];

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function visibleNames(dir: string): string[] {
  try {
    return readdirSync(dir).filter((n) => !n.startsWith("."));
  } catch {
    return [];
  }
}

/** The names matched by the glob `<dir>/*` + `/`: non-hidden directories, symlinks followed. */
function subdirs(dir: string): string[] {
  return visibleNames(dir)
    .filter((n) => isDir(`${dir}/${n}`))
    .sort();
}

/** The active change IDs of the project folder `dir`, sorted (archive excluded). */
export function activeIds(dir: string): string[] {
  return subdirs(`${dir}/changes`).filter((n) => n !== "archive");
}

/** The archive folder names of the project folder `dir`, sorted. */
const archiveDirs = (dir: string): string[] => subdirs(`${dir}/changes/archive`);

/** The names of the Markdown files directly in `dir`: `spec.md`, `design.md`, `notes.md` when present, then the others by name. */
function markdownNames(dir: string): string[] {
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

/** `name` when it can be one path segment; else throws `StoreError` `invalid`. */
function segment(name: string): string {
  if (name === "" || name === "." || name === ".." || name.includes("/") || name.includes("\\")) {
    throw new StoreError("invalid", `invalid change reference '${name}'`);
  }
  return name;
}

const entryOf = (ref: string): ArchiveEntry => (DATED.test(ref) ? { ref, id: ref.slice(11), date: ref.slice(0, 10) } : { ref, id: null, date: null });

/** The `ChangeStore` of the home `home`. */
export function fileStore(home: string): ChangeStore {
  const project = (key: string): string => projectDir(home, key);
  const changesDir = (key: string): string => join(project(key), "changes");

  const dirOf = (key: string, change: ChangeRef): string =>
    change.kind === "active" ? join(changesDir(key), segment(change.id)) : join(changesDir(key), "archive", segment(change.ref));

  /** The folder of a change the store lists, `null` for any other. */
  const listed = (key: string, change: ChangeRef): string | null => {
    const known = change.kind === "active" ? activeIds(project(key)).includes(change.id) : archiveDirs(project(key)).includes(change.ref);
    return known ? dirOf(key, change) : null;
  };

  const archiveRef = (_key: string, id: string, date: string): string => `${date}-${id}`;

  const fileNames = (key: string, change: ChangeRef): string[] => {
    const dir = listed(key, change);
    if (dir === null) return [];
    return [...(isFile(join(dir, CHANGE_FILE)) ? [CHANGE_FILE] : []), ...markdownNames(dir)];
  };

  return {
    projectKeys() {
      const dir = join(home, "projects");
      let names: string[];
      try {
        names = readdirSync(dir);
      } catch {
        return [];
      }
      return names.filter((n) => !n.startsWith(".") && projectReason(n) === "" && isDir(join(dir, n))).sort(byText);
    },

    activeIds: (key) => activeIds(project(key)),

    archived: (key) => archiveDirs(project(key)).map(entryOf),

    exists: (key, change) => listed(key, change) !== null,

    fileNames,

    fileCount(key, change) {
      const dir = listed(key, change);
      if (dir === null) return 0;
      let names: string[];
      try {
        names = readdirSync(dir);
      } catch {
        return 0;
      }
      return names.filter((n) => !n.startsWith(".") && isFile(join(dir, n))).length;
    },

    readFile(key, change, name): FileRead | null {
      if (!fileNames(key, change).includes(name)) return null;
      try {
        const bytes = readFileSync(join(dirOf(key, change), name));
        return { bytes, version: sha256(bytes) };
      } catch {
        return null;
      }
    },

    writeFile(key, id, name, bytes, base): WriteResult {
      const change: ChangeRef = { kind: "active", id };
      if (!fileNames(key, change).includes(name)) throw new StoreError("missing", `${name} of ${id} not found`, null);
      const path = join(dirOf(key, change), name);
      let current: Buffer;
      try {
        current = readFileSync(path);
      } catch {
        return { status: "conflict", version: null };
      }
      const version = sha256(current);
      if (version !== base) return { status: "conflict", version };
      if (current.equals(bytes)) return { status: "unchanged", version };
      accessSync(path, constants.W_OK);
      writeAtomic(path, bytes, statSync(path).mode & 0o777);
      return { status: "written", version: sha256(bytes) };
    },

    archiveRef,

    archive(key, id, date) {
      const src = listed(key, { kind: "active", id });
      if (src === null) {
        let path: string | null = null;
        try {
          path = dirOf(key, { kind: "active", id });
        } catch {
          // An ID that is not one path segment has no folder.
        }
        throw new StoreError("missing", `${path ?? id} not found`, path);
      }
      const ref = archiveRef(key, id, date);
      const dst = dirOf(key, { kind: "archived", ref });
      if (existsSync(dst)) throw new StoreError("exists", `${dst} already exists`, dst);
      mkdirSync(join(changesDir(key), "archive"), { recursive: true });
      renameSync(src, dst);
      return ref;
    },

    updated(key, change) {
      const dir = listed(key, change);
      if (dir === null) throw new StoreError("missing", "change not found", null);
      const file = join(dir, CHANGE_FILE);
      try {
        return statSync(isFile(file) ? file : dir).mtime.toISOString();
      } catch {
        return new Date(0).toISOString();
      }
    },

    dirOf,
  };
}
