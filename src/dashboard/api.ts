/** The dashboard API's handlers: each reads the home on every call and returns a status and a JSON body. */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Warn } from "../core/config";
import { isDir } from "../core/io";
import { activeIds, archiveDirs, filesEndingWith, taskCounts } from "../core/list";
import { changeIdReason } from "../core/path";
import { projectDir, projectReason } from "../core/project";
import { listWorkflows } from "../core/workflow";
import { renderMarkdown } from "./markdown";
import type { ActiveChange, ChangeDetail, ChangesResponse, ErrorResponse, ProjectsResponse, Status, WorkflowsResponse } from "./types";

export type Reply<T> = { status: 200 | 400 | 404; body: T | ErrorResponse };

const ok = <T>(body: T): Reply<T> => ({ status: 200, body });
const bad = (error: string): Reply<never> => ({ status: 400, body: { error } });
const missing = (error: string): Reply<never> => ({ status: 404, body: { error } });

/** An archived change folder: `YYYY-MM-DD-` and a change ID. */
const ARCHIVED = /^([0-9]{4}-[0-9]{2}-[0-9]{2})-(.*)$/;
/** A series member: the series ID and a two-digit ordinal. */
const MEMBER = /^(.+)-([0-9]{2})$/;
/** The files shown first in a change, in this order, when present. */
const FIRST = ["spec.md", "tasks.md", "design.md"];

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The status of a change with `done` of `total` numbered tasks done. */
export function statusOf(done: number, total: number): Status {
  if (total === 0) return "No tasks";
  if (done === total) return "Ready to archive";
  if (done === 0) return "Not started";
  return "In progress";
}

/** The project keys of a home, sorted: its `projects/` folder names that are valid keys. */
function projectKeys(home: string): string[] {
  const dir = join(home, "projects");
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names.filter((n) => projectReason(n) === "" && isDir(join(dir, n))).sort(byText);
}

/**
 * The label of each key: with two or more keys, the key without the longest prefix common to all keys that ends in
 * `-`; with one, the key without its leading `-`. A label that would be empty is the key.
 */
export function labels(keys: string[]): string[] {
  if (keys.length === 1) {
    const only = keys[0] as string;
    return [only.replace(/^-/, "") || only];
  }
  let common = keys[0] ?? "";
  for (const key of keys) {
    while (!key.startsWith(common)) common = common.slice(0, -1);
  }
  const cut = common.lastIndexOf("-") + 1;
  return keys.map((key) => key.slice(cut) || key);
}

/** `GET /api/v1/projects`: every project with its active and archived counts, and the initially selected one. */
export function projects(home: string, current: string | null): Reply<ProjectsResponse> {
  const keys = projectKeys(home);
  const names = labels(keys);
  const list = keys.map((key, i) => {
    const dir = projectDir(home, key);
    return { key, label: names[i] as string, active: activeIds(dir).length, archived: archiveDirs(dir).length };
  });
  const initial = current !== null && keys.includes(current) ? current : (keys[0] ?? null);
  return ok({ initial, projects: list });
}

/** The folder of a valid, existing project, or the reply that stops the request. */
function project(home: string, key: string): { dir: string } | Reply<never> {
  const reason = projectReason(key);
  if (reason !== "") return bad(`invalid project: ${reason}`);
  const dir = projectDir(home, key);
  if (!isDir(dir)) return missing("unknown project");
  return { dir };
}

/** `GET /api/v1/projects/{key}/changes`: the active changes, sorted by ID, and the archived ones, newest first. */
export function changes(home: string, key: string): Reply<ChangesResponse> {
  const p = project(home, key);
  if ("status" in p) return p;
  const active = activeIds(p.dir).map((id): ActiveChange => {
    const dir = join(p.dir, "changes", id);
    const [done, total] = taskCounts(dir);
    const member = MEMBER.exec(id);
    return {
      id,
      files: filesEndingWith(dir, ".md").length,
      tasks: { done, total },
      status: statusOf(done, total),
      series: member === null ? null : { id: member[1] as string, ordinal: Number(member[2]) },
    };
  });
  const archived = archiveDirs(p.dir)
    .reverse()
    .map((folder) => {
      const m = ARCHIVED.exec(folder);
      return m !== null && changeIdReason(m[2] as string) === "" ? { folder, date: m[1] as string, id: m[2] as string } : { folder, date: null, id: null };
    });
  return ok({ active, archived });
}

/** The detail of the change folder `dir`: its tasks and every `.md` file rendered, `spec.md`, `tasks.md` and `design.md` first. */
function detail(dir: string, id: string, archived: boolean): ChangeDetail {
  const names = filesEndingWith(dir, ".md").sort(byText);
  const ordered = [...FIRST.filter((n) => names.includes(n)), ...names.filter((n) => !FIRST.includes(n))];
  const [done, total] = taskCounts(dir);
  return {
    id,
    archived,
    tasks: { done, total },
    files: ordered.map((name) => ({ name, html: renderMarkdown(readFileSync(join(dir, name), "utf-8")) })),
  };
}

/** `GET /api/v1/projects/{key}/changes/{id}`: an active change. */
export function change(home: string, key: string, id: string): Reply<ChangeDetail> {
  const p = project(home, key);
  if ("status" in p) return p;
  const reason = changeIdReason(id);
  if (reason !== "") return bad(`invalid change id: ${reason}`);
  if (!activeIds(p.dir).includes(id)) return missing("unknown change");
  return ok(detail(join(p.dir, "changes", id), id, false));
}

/** `GET /api/v1/projects/{key}/archive/{folder}`: an archived change. */
export function archivedChange(home: string, key: string, folder: string): Reply<ChangeDetail> {
  const p = project(home, key);
  if ("status" in p) return p;
  const m = ARCHIVED.exec(folder);
  if (m === null) return bad("invalid archive folder: must be YYYY-MM-DD- followed by a change id");
  const reason = changeIdReason(m[2] as string);
  if (reason !== "") return bad(`invalid archive folder: change id ${reason}`);
  if (!archiveDirs(p.dir).includes(folder)) return missing("unknown archived change");
  return ok(detail(join(p.dir, "changes", "archive", folder), m[2] as string, true));
}

/** `GET /api/v1/projects/{key}/workflows`: every workflow and the warnings resolving them gave. */
export function workflows(home: string, key: string): Reply<WorkflowsResponse> {
  const p = project(home, key);
  if ("status" in p) return p;
  const warnings: { file: string; text: string }[] = [];
  const collect: Warn = (file, text) => {
    warnings.push({ file, text });
  };
  const result = listWorkflows(home, key, collect);
  if ("error" in result) return ok({ error: result.error, defaultName: null, defaultError: null, workflows: [], warnings });
  return ok({ ...result, warnings });
}
