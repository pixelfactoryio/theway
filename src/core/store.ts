/**
 * The port in front of theway's change data: the projects of a home, their active and archived changes and those
 * changes' files. Callers address a project by key, a change by `ChangeRef` and a file by name, never by path;
 * `dirOf` is the one exit from a key to a folder. It has no runtime import, so any module can import it.
 */

/** An active change by ID, or an archived one by its opaque reference (never parsed by a caller). */
export type ChangeRef = { kind: "active"; id: string } | { kind: "archived"; ref: string };

/**
 * One archived change. It is dated when its reference names a date and the change's ID; otherwise `id` and `date` are
 * both `null`.
 */
export type ArchiveEntry = { ref: string; id: string | null; date: string | null };

/** A file's bytes and its version: the SHA-256 of the bytes, as hex. */
export type FileRead = { bytes: Buffer; version: string };

/** What a compare-and-swap write did: `conflict` carries the current version, `null` when the file cannot be read. */
export type WriteResult = { status: "written" | "unchanged"; version: string } | { status: "conflict"; version: string | null };

/** Why the store refused a call: an unknown change or file, something at the destination, an invalid ID or reference. */
export class StoreError extends Error {
  constructor(
    readonly code: "missing" | "exists" | "invalid",
    message: string,
    readonly path: string | null = null,
  ) {
    super(message);
    this.name = "StoreError";
  }
}

/**
 * Synchronous access to the change data of a home. An `id`, `ref` or file `name` is accepted only when the store lists
 * it itself (`activeIds`, `archived`, `fileNames`); any other is treated as absent.
 */
export interface ChangeStore {
  /** The project keys, sorted. */
  projectKeys(): string[];
  /** The active change IDs of the project, sorted. */
  activeIds(key: string): string[];
  /** Every archived change of the project, dated or not, sorted by `ref`. */
  archived(key: string): ArchiveEntry[];
  exists(key: string, change: ChangeRef): boolean;
  /** `change.yaml` when present, then the Markdown files: `spec.md`, `design.md`, `notes.md` first, the others by name. */
  fileNames(key: string, change: ChangeRef): string[];
  /** The number of regular, non-hidden files directly in the change; `0` when it cannot be read. */
  fileCount(key: string, change: ChangeRef): number;
  /** A listed file's bytes and version, `null` when it is absent or cannot be read. */
  readFile(key: string, change: ChangeRef, name: string): FileRead | null;
  /**
   * Replaces the file `name` of the active change `id` with `bytes` when its current version is `base`, keeping its
   * mode; equal bytes write nothing. The compare and the replace are not atomic together: a write that lands between
   * the read and the replace is lost. Throws the underlying `Error` of a write that fails, and refuses a read-only file.
   */
  writeFile(key: string, id: string, name: string, bytes: Buffer, base: string): WriteResult;
  /** The reference the archive of the change `id` on `date` (`YYYY-MM-DD`) gets. */
  archiveRef(key: string, id: string, date: string): string;
  /**
   * Moves the active change `id` to the archive and returns its reference. Throws `StoreError` `missing` or `exists`,
   * else the underlying `Error`.
   */
  archive(key: string, id: string, date: string): string;
  /** The modification time of `change.yaml`, or of the change when it has none, as an ISO string. */
  updated(key: string, change: ChangeRef): string;
  /** The absolute folder of the change, whether or not it exists; agents work in it. */
  dirOf(key: string, change: ChangeRef): string;
}
