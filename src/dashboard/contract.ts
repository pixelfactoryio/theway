/**
 * The bodies of the dashboard's HTTP API, declared once for the server and the client. It imports only a type, from a
 * module with no `node:` import, so the client bundle can import it.
 */
import type { ChangeTask } from "../core/change-text";

export type { ChangeTask } from "../core/change-text";

/** The status of an active change, or `archived`. */
export type Status = "invalid" | "in-progress" | "not-started" | "ready" | "archived";

/** One active change of `GET /api/projects/:key/changes`. */
export type ActiveChange = {
  id: string;
  description: string | null;
  status: Exclude<Status, "archived">;
  done: number;
  total: number;
  issues: string[];
  updated: string;
};

/** One archived change of `GET /api/projects/:key/changes`. */
export type ArchivedChange = { dir: string; id: string; date: string };

/** The body of `GET /api/projects/:key/changes`: active by ID, archived newest first. */
export type ChangeList = { active: ActiveChange[]; archived: ArchivedChange[] };

/** One ordinal of a series. `archived` is the archive reference of an archived member, opaque to the client. */
export type SeriesMember = {
  ordinal: string;
  /** The member's change ID; for an empty ordinal, the ID it would have. */
  id: string;
  active: string | null;
  archived: string | null;
  status: Status | null;
  done: number | null;
  total: number | null;
};

/** The body of `GET /api/projects/:key/changes/:id` and `…/changes/archive/:dir`. */
export type ChangeDetail = {
  id: string;
  /** The date of an archived change, `null` when active. */
  archived: string | null;
  /** The archive reference of an archived change (its `…/changes/archive/:dir`), `null` when active. */
  ref: string | null;
  description: string | null;
  status: Status;
  done: number;
  total: number;
  issues: string[];
  tasks: ChangeTask[];
  /** The modification time of `change.yaml`, or of the folder when the file is missing, as an ISO string. */
  updated: string;
  folder: string;
  /** Each file's `version` (the SHA-256 of its bytes) on an active change only. */
  files: { name: string; text: string; version?: string }[];
  /** On an active change only: its `change.yaml`, `null` when it has none. */
  changeFile?: { text: string; version: string } | null;
  series: { id: string; members: SeriesMember[] } | null;
};

/** A series member's ID: the series ID, `-`, then a two-digit ordinal. */
export const MEMBER = /^(.+)-(\d{2})$/;

/** One row of `GET /api/workflows`. */
export type WorkflowRow = {
  name: string;
  project: string | null;
  description: string | null;
  default: boolean;
  steps: number | null;
  runsOn: "agents" | "session" | "mixed" | null;
  errors: string[];
};

/** The body of `GET /api/workflows`. */
export type WorkflowList = { folder: string; workflows: WorkflowRow[] };

/** One use of a prompt by a workflow file, as written. */
export type Use = { workflow: string; project: string | null; step: number; as: "step" | "on-fail" | "value" };

/** One input of a prompt's header, in the header's order. */
export type PromptInputRow = { name: string; required: boolean; default: string | null; description: string };

/** One row of `GET /api/prompts`. */
export type PromptRow = {
  name: string;
  project: string | null;
  description: string | null;
  model: string | null;
  header: boolean;
  inputs: PromptInputRow[];
  errors: string[];
  usedBy: Use[];
};

/** The body of `GET /api/prompts`. */
export type PromptList = { folder: string; prompts: PromptRow[] };

/** A check line of a file, with the line of the file it names (from 1), `null` when it names none. */
export type FileError = { text: string; line: number | null };

/** The body of a file route. */
export type FileBody = {
  name: string;
  project: string | null;
  path: string;
  text: string;
  version: string;
  errors: FileError[];
  usedBy?: Use[];
};

/** The body of `POST /api/check`: the draft's lines, and for a prompt its header fields. */
export type CheckBody = { errors: FileError[] } & Partial<Pick<PromptRow, "header" | "description" | "model" | "inputs">>;

/** One project of `GET /api/projects`: its key, label, number of active changes and folder (`null` when not found). */
export type Project = { key: string; label: string; active: number; path: string | null };

/** The body of `GET /api/projects`. */
export type ProjectList = { projects: Project[]; start: string | null };

/** One version of `GET …/history`. */
export type Version = { id: string; at: string; added: number; removed: number };

/** The body of `GET …/history`: the versions, newest first. */
export type VersionList = { versions: Version[] };

/** The body of `GET …/history/:id`. */
export type VersionText = { text: string };
