/** The dashboard API's response shapes, shared by the server and the browser client. */
import type { WorkflowDoc, WorkflowList } from "../core/schema";

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

/** `GET /api/v1/projects/{key}/changes/{id}` and `GET /api/v1/projects/{key}/archive/{folder}`. */
export type ChangeDetail = { id: string; archived: boolean; tasks: Tasks; files: { name: string; html: string }[] };

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
