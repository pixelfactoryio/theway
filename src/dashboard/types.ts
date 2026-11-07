/** The dashboard API's response shapes, shared by the server and the browser client. */
import type { WorkflowList } from "../core/schema";

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
export type WorkflowsResponse = WorkflowList & { warnings: { file: string; text: string }[]; error?: string };

/** Every error response. */
export type ErrorResponse = { error: string };
