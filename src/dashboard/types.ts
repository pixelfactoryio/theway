/** The dashboard API's response shapes, shared by the server and the browser client. */
import type { StepItem, WorkflowDoc, WorkflowList } from "../core/schema";

/** A change's progress over its numbered tasks. */
export type Status = "No tasks" | "Not started" | "In progress" | "Ready to archive";

export type Tasks = { done: number; total: number };

/** `GET /api/v1/projects`. */
export type ProjectsResponse = {
  initial: string | null;
  projects: { key: string; label: string; active: number; archived: number }[];
};

/** An active change: its `.md` file count, its tasks, its status and, for an ID ending in `-NN`, its series. */
export type ActiveChange = {
  id: string;
  files: number;
  tasks: Tasks;
  status: Status;
  series: { id: string; ordinal: number } | null;
};

/** An archived change folder; `date` and `id` are `null` when the folder name is not `YYYY-MM-DD-<id>`. */
export type ArchivedChange = { folder: string; date: string | null; id: string | null };

/** `GET /api/v1/projects/{key}/changes`. */
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

/** A change's PR link and, for an ID ending in `-NN`, its series with every member, sorted by ordinal. */
export type ChangeProperties = {
  pr: string | null;
  series: { id: string; ordinal: number; total: number; members: SeriesMember[] } | null;
};

/** `GET /api/v1/projects/{key}/changes/{id}` and `GET /api/v1/projects/{key}/archive/{folder}`. */
export type ChangeDetail = { id: string; archived: boolean; tasks: Tasks; files: { name: string; html: string }[]; properties: ChangeProperties };

/** `GET /api/v1/projects/{key}/workflows`; `error` is the line that stops loading the config, with an empty list. */
export type WorkflowsResponse = WorkflowList & { warnings: Warning[]; error?: string };

/** A warning resolving a project's workflows: the file, relative to the home, and its text. */
export type Warning = { file: string; text: string };

/** A prompt file rendered as HTML, or why it could not be read. */
export type RenderedPrompt = { html: string } | { error: string };

/**
 * `GET /api/v1/projects/{key}/workflows/{name}`: the resolved workflow, whether it is the default one, its file's
 * text, every distinct prompt it names rendered, and the warnings resolving it gave.
 */
export type WorkflowDetail = {
  workflow: WorkflowDoc;
  default: boolean;
  source: { path: string; text: string };
  prompts: Record<string, RenderedPrompt>;
  warnings: Warning[];
};

/** The `422` body of `GET /api/v1/projects/{key}/workflows/{name}`: the line that stops resolving it, and the warnings. */
export type WorkflowFailure = { error: string; warnings: Warning[] };

/** Every error response. */
export type ErrorResponse = { error: string };

/** The kinds of file the editor reads and writes. */
export type SourceKind = "workflows" | "steps";

/**
 * `GET /api/v1/projects/{key}/sources/{kind}/{name}`: the file the resolver reads (`path`, project or global), its text,
 * the project file a save writes (`projectPath`) and the sha256 of its bytes, `null` when there is no project copy;
 * `globalPath` is the global file of that name, `null` when there is none (a project copy then has no Revert to global).
 */
export type SourceFile = {
  kind: SourceKind;
  name: string;
  origin: "project" | "global";
  path: string;
  text: string;
  projectPath: string;
  sha256: string | null;
  globalPath: string | null;
};

/** `GET /api/v1/projects/{key}/steps`. */
export type StepsResponse = StepItem[];

/** One item of `GET /api/v1/projects/{key}/prompts`. */
export type PromptItem = { name: string; origin: "project" | "global" };

/** `POST /api/v1/projects/{key}/validate`: `workflow` is the named workflow resolved with the candidate texts. */
export type ValidateResponse = { ok: boolean; errors: string[]; warnings: string[]; workflow?: WorkflowDoc };

/** One file of a validate body; `text: null` deletes the project copy. */
export type ValidateFile = { kind: SourceKind; name: string; text: string | null };

/** One file of a save body: `base` is the `sha256` the source was loaded with. */
export type SaveFile = { kind: SourceKind; name: string; text: string; base: string | null };

/** `PUT /api/v1/projects/{key}/sources`: the paths written and the sha256 of every target. */
export type SaveResponse = { written: string[]; sha256: Record<string, string> };

/** The `409` body of a save or revert. */
export type SaveConflict = { error: "changed on disk"; conflicts: string[] };

/** The `422` body of a save or revert. */
export type SaveInvalid = { errors: string[]; warnings: string[] };

/** `DELETE /api/v1/projects/{key}/sources/{kind}/{name}`. */
export type RevertResponse = { deleted: string };
