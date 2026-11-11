/** The dashboard API's response shapes, shared by the server and the browser client. */
import type { PromptHeader, ResolvedWorkflow } from "../core/language-schema";

/** A change's progress over its tasks, or `Invalid` when its `change.yaml` is missing or invalid. */
export type Status = "Not started" | "In progress" | "Ready to archive" | "Invalid";

export type Tasks = { done: number; total: number };

/**
 * An active change: its file count, its tasks, its status, its description (`null` when invalid), its `change.yaml`'s
 * first error (`null` when valid) and, for a series member ID, its series.
 */
export type ActiveChange = {
  id: string;
  files: number;
  tasks: Tasks;
  status: Status;
  description: string | null;
  error: string | null;
  series: { id: string; ordinal: number } | null;
};

/** An archived change folder; `date` and `id` are `null` when the folder name is not `YYYY-MM-DD-<id>`. */
export type ArchivedChange = { folder: string; date: string | null; id: string | null };

/** A project's active changes, sorted by ID, and its archived ones, newest first. */
export type ChangesResponse = { active: ActiveChange[]; archived: ArchivedChange[] };

/** The progress of a series of two or more members: `done` counts the archived members and the active ones ready to archive. */
export type SeriesProgress = { id: string; done: number; total: number };

/** `GET /api/v1/changes`: `total` is the number of projects; `projects` holds those with an active or archived change. */
export type AllChangesResponse = {
  total: number;
  projects: { key: string; label: string; active: ActiveChange[]; archived: ArchivedChange[]; series: SeriesProgress[] }[];
};

/** A member of a series: `folder` is its archive folder name, `null` for an active member. */
export type SeriesMember = { ordinal: number; id: string; folder: string | null };

/** For a series member ID, its series with every member, sorted by ordinal; `total` is the member count. */
export type ChangeProperties = {
  series: { id: string; ordinal: number; total: number; members: SeriesMember[] } | null;
};

/** A task of a change: its text rendered as inline Markdown, and whether it is done. */
export type TaskItem = { html: string; done: boolean };

/** The workflow a run of `theway workflow` with no name uses for a project; `key` is `null` for a global file. */
export type DefaultWorkflow = { scope: "global" | "project"; key: string | null; name: string };

/**
 * `GET /api/v1/projects/{key}/changes/{id}` and `GET /api/v1/projects/{key}/archive/{folder}`: `taskItems` is `[]`
 * for an invalid change, `defaultWorkflow` `null` for an archived one or when no single workflow sets `default: true`.
 */
export type ChangeDetail = {
  id: string;
  archived: boolean;
  status: Status;
  description: string | null;
  error: string | null;
  tasks: Tasks;
  taskItems: TaskItem[];
  defaultWorkflow: DefaultWorkflow | null;
  files: { name: string; html: string }[];
  properties: ChangeProperties;
};

/** Every error response. */
export type ErrorResponse = { error: string };

/** The kinds of file the Workflows page reads: workflows and prompts. */
export type SourceKind = "workflows" | "prompts";

/** The extension of each kind's files. */
export const EXT: Record<SourceKind, string> = { workflows: ".yaml", prompts: ".md" };

/** The `422` body of a save. */
export type SaveInvalid = { errors: string[]; warnings: string[] };

/** A workflow or prompt file, addressed by where it lives; `key` and `label` are `null` for a global file, `path` is absolute. */
type FileBase = {
  scope: "global" | "project";
  key: string | null;
  label: string | null;
  name: string;
  path: string;
  description: string | null;
};

/**
 * A workflow file: whether it is the default, the first error line when it does not resolve, and the number of its
 * error lines; its step count and how many steps run on each of `session` and `agents` (`null` when it does not resolve).
 */
export type WorkflowItem = FileBase & {
  kind: "workflows";
  default: boolean;
  error: string | null;
  errors: number;
  steps: number | null;
  runsOn: { session: number; agents: number } | null;
};

/** A workflow that uses a prompt, as the files list names it. */
export type PromptUser = { scope: "global" | "project"; key: string | null; label: string | null; name: string };

/**
 * A prompt file: `step` when it has a header that passes the header rules; its header's `model` (`null` for none); the
 * workflows that use it, each once, in files-list order; and its first header rule error (`null` for none).
 */
export type PromptItem = FileBase & { kind: "prompts"; step: boolean; model: string | null; usedBy: PromptUser[]; error: string | null };

export type FileItem = WorkflowItem | PromptItem;

/**
 * `GET /api/v1/files`: the home as shown (`~/…` under the user's home, else absolute), every project, then every global
 * workflow and prompt file, then each project's own.
 */
export type FilesResponse = { home: string; projects: { key: string; label: string }[]; workflows: WorkflowItem[]; prompts: PromptItem[] };

/**
 * A workflow file that names a prompt: in a step's `uses` (`step`), in its `on-fail` (`on-fail`), or as a `with` or
 * `matrix` value (`value`); `step` is the 1-based position of that step.
 */
export type FileUse = {
  scope: "global" | "project";
  key: string | null;
  label: string | null;
  name: string;
  use: "step" | "on-fail" | "value";
  step: number;
};

/** A workflow's resolved document with no input given, or its error lines. */
export type WorkflowResolved = { doc: ResolvedWorkflow } | { errors: string[] };

/** A prompt's header and its header rule errors, and its body rendered. */
export type PromptResolved = { header: PromptHeader | null; headerErrors: string[]; html: string };

/** What a file's text resolves to, by kind. */
export type Resolved = WorkflowResolved | PromptResolved;

/**
 * `GET /api/v1/files/global/{kind}/{name}` and `GET /api/v1/files/projects/{key}/{kind}/{name}`: the file's text and
 * the sha256 of its bytes, its resolved form in its own context, the projects whose own file of that name overrides a
 * global one, whether a project file overrides a global one, and the workflow files that name a prompt.
 */
export type FileDetail = ((WorkflowItem & { resolved: WorkflowResolved }) | (Omit<PromptItem, "usedBy"> & { resolved: PromptResolved })) & {
  text: string;
  sha256: string;
  overriddenBy: { key: string; label: string }[];
  overrides: boolean;
  usedBy: FileUse[];
};

/** `POST …/files/…/{kind}/{name}/validate`. */
export type FileValidateResponse = { ok: boolean; errors: string[]; warnings: string[] };

/** `PUT …/files/…/{kind}/{name}`: the path written and the sha256 of its text. */
export type FileSaveResponse = { path: string; sha256: string };

/** A saved version of a file: its ID and the ISO time it was taken. */
export type FileVersion = { id: string; at: string };

/** `GET …/files/…/{kind}/{name}/versions`: the versions, newest first, and whether a global file has its shipped text. */
export type FileVersionsResponse = { versions: FileVersion[]; shipped: boolean };

/** `GET …/files/…/{kind}/{name}/versions/{id}`: the version's text, and what it resolves to as the file detail builds it. */
export type FileVersionResponse = { text: string; resolved: Resolved };
