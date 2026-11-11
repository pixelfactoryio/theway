/** The dashboard API's handlers: each reads the home on every call and returns a status and a JSON body. */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, sep } from "node:path";
import { isDir, isFile, type Overlay, writeAtomic } from "../core/io";
import { listPromptFiles, listWorkflowFiles, parsePromptFile, resolveWorkflowFile } from "../core/language";
import { NAME } from "../core/language-schema";
import { type Change, changeFileCount, checkChange } from "../core/change";
import { activeIds, archiveDirs, filesEndingWith } from "../core/list";
import { changeIdReason } from "../core/path";
import { projectDir, projectReason } from "../core/project";
import { seriesReason } from "../core/validate-id";
import { isVersionId, snapshot, versionsOf, versionText } from "./history";
import { renderInline, renderMarkdown } from "./markdown";
import { byText, projectLabels } from "./projects";
import {
  type ActiveChange,
  type AllChangesResponse,
  type ChangeDetail,
  type ChangeProperties,
  type ChangesResponse,
  type DefaultWorkflow,
  EXT,
  type ErrorResponse,
  type FileDetail,
  type FileSaveResponse,
  type FilesResponse,
  type FileUse,
  type FileValidateResponse,
  type FileVersionResponse,
  type FileVersionsResponse,
  type PromptItem,
  type PromptResolved,
  type SaveInvalid,
  type SeriesMember,
  type SeriesProgress,
  type Status,
  type WorkflowItem,
  type WorkflowResolved,
} from "./types";
import { type EditKind, type FileTarget, GLOBAL_CONTEXT, homeRelative, projectPath, promptUses, readText, targetPath, validateFile } from "./validate";

export { folderOf, labels } from "./projects";

export type Reply<T> = { status: 200 | 400 | 404 | 409 | 413 | 422 | 500; body: T | ErrorResponse };

const ok = <T>(body: T): Reply<T> => ({ status: 200, body });
const bad = (error: string): Reply<never> => ({ status: 400, body: { error } });
const missing = (error: string): Reply<never> => ({ status: 404, body: { error } });

/** An archived change folder: `YYYY-MM-DD-` and a change ID. */
const ARCHIVED = /^([0-9]{4}-[0-9]{2}-[0-9]{2})-(.*)$/;
/** The files shown first in a change, in this order, when present. */
const FIRST = ["spec.md", "design.md", "notes.md"];

/** The series ID and ordinal of a series member ID (`seriesReason` accepts it), else `null`. */
function memberOf(id: string): { id: string; ordinal: number } | null {
  if (seriesReason(id) !== "") return null;
  const at = id.lastIndexOf("-");
  return { id: id.slice(0, at), ordinal: Number(id.slice(at + 1)) };
}

/**
 * The change of the folder `dir` as the dashboard shows it: its tasks, its status, its description and its first error
 * line without the `changes/<id>/change.yaml: ` prefix; `change` is `null` when its `change.yaml` is invalid.
 */
function stateOf(dir: string): { change: Change | null; tasks: { done: number; total: number }; status: Status; description: string | null; error: string | null } {
  const c = checkChange(dir);
  if ("issues" in c) return { change: null, tasks: { done: 0, total: 0 }, status: "Invalid", description: null, error: c.issues[0] as string };
  const done = c.change.tasks.filter((t) => t.done).length;
  const total = c.change.tasks.length;
  const status: Status = done === total ? "Ready to archive" : done === 0 ? "Not started" : "In progress";
  return { change: c.change, tasks: { done, total }, status, description: c.change.description, error: null };
}

/**
 * The folder of a valid, existing project, or the reply that stops the request.
 * `check` validates the route's other params, so every `400` comes before the project's `404`.
 */
function project(home: string, key: string, check: () => Reply<never> | null = () => null): { dir: string } | Reply<never> {
  const reason = projectReason(key);
  if (reason !== "") return bad(`invalid project: ${reason}`);
  const invalid = check();
  if (invalid !== null) return invalid;
  const dir = projectDir(home, key);
  if (!isDir(dir)) return missing("unknown project");
  return { dir };
}

/** The active changes of the project folder `pdir`, sorted by ID, and the archived ones, newest first. */
function changesOf(pdir: string): ChangesResponse {
  const active = activeIds(pdir).map((id): ActiveChange => {
    const dir = join(pdir, "changes", id);
    const { tasks, status, description, error } = stateOf(dir);
    return { id, files: changeFileCount(dir), tasks, status, description, error, series: memberOf(id) };
  });
  const archived = archiveDirs(pdir)
    .reverse()
    .map((folder) => {
      const m = ARCHIVED.exec(folder);
      return m !== null && changeIdReason(m[2] as string) === "" ? { folder, date: m[1] as string, id: m[2] as string } : { folder, date: null, id: null };
    });
  return { active, archived };
}

/** Every member of every series of a project: its active member changes and its archived `YYYY-MM-DD-<member>` folders. */
function seriesMembers(pdir: string): Map<string, (SeriesMember & { done: boolean })[]> {
  const out = new Map<string, (SeriesMember & { done: boolean })[]>();
  const add = (id: string, folder: string | null, done: boolean) => {
    const m = memberOf(id);
    if (m === null) return;
    const members = out.get(m.id) ?? [];
    members.push({ ordinal: m.ordinal, id, folder, done });
    out.set(m.id, members);
  };
  for (const id of activeIds(pdir)) add(id, null, stateOf(join(pdir, "changes", id)).status === "Ready to archive");
  for (const folder of archiveDirs(pdir)) {
    const m = ARCHIVED.exec(folder);
    if (m !== null && changeIdReason(m[2] as string) === "") add(m[2] as string, folder, true);
  }
  for (const members of out.values()) members.sort((a, b) => a.ordinal - b.ordinal || byText(a.folder ?? "", b.folder ?? ""));
  return out;
}

/** The progress of each series of two or more members of a project, sorted by series ID. */
function seriesProgress(pdir: string): SeriesProgress[] {
  return [...seriesMembers(pdir)]
    .filter(([, members]) => members.length >= 2)
    .sort(([a], [b]) => byText(a, b))
    .map(([id, members]) => ({ id, done: members.filter((m) => m.done).length, total: members.length }));
}

/** `GET /api/v1/changes`: the number of projects, and the changes and series progress of each project that has a change. */
export function allChanges(home: string): Reply<AllChangesResponse> {
  const list = projectLabels(home);
  const projects = list.flatMap(({ key, label }) => {
    const dir = projectDir(home, key);
    const { active, archived } = changesOf(dir);
    if (active.length === 0 && archived.length === 0) return [];
    return [{ key, label, active, archived, series: seriesProgress(dir) }];
  });
  return ok({ total: list.length, projects });
}

/** The properties of the change `id`, in the project folder `pdir`. */
function propertiesOf(pdir: string, id: string): ChangeProperties {
  const m = memberOf(id);
  if (m === null) return { series: null };
  const members = (seriesMembers(pdir).get(m.id) ?? []).map(({ ordinal, id, folder }) => ({ ordinal, id, folder }));
  return { series: { id: m.id, ordinal: m.ordinal, total: members.length, members } };
}

/**
 * The workflow `theway workflow` with no name uses for the project `key`, as `defaultName` of `core/workflow` chooses
 * it: the one file among the project's and the global ones it does not hide that sets `default: true`; `null` when
 * none or several do.
 */
function defaultWorkflowOf(home: string, key: string): DefaultWorkflow | null {
  const marked = listWorkflowFiles(home, key, () => {}).filter((w) => w.default);
  if (marked.length !== 1) return null;
  const w = marked[0] as { name: string; scope: "global" | "project" };
  return { scope: w.scope, key: w.scope === "project" ? key : null, name: w.name };
}

/**
 * The detail of the change folder `dir`: its state, its tasks rendered inline, the default workflow of an active
 * change, and every `.md` file rendered, `spec.md`, `design.md` and `notes.md` first.
 */
function detail(home: string, key: string, pdir: string, dir: string, id: string, archived: boolean): ChangeDetail {
  const names = filesEndingWith(dir, ".md").sort(byText);
  const ordered = [...FIRST.filter((n) => names.includes(n)), ...names.filter((n) => !FIRST.includes(n))];
  const { change, tasks, status, description, error } = stateOf(dir);
  return {
    id,
    archived,
    status,
    description,
    error,
    tasks,
    taskItems: change === null ? [] : change.tasks.map((t) => ({ html: renderInline(t.text), done: t.done })),
    defaultWorkflow: archived ? null : defaultWorkflowOf(home, key),
    files: ordered.map((name) => ({ name, html: renderMarkdown(readFileSync(join(dir, name), "utf-8")) })),
    properties: propertiesOf(pdir, id),
  };
}

/** `GET /api/v1/projects/{key}/changes/{id}`: an active change. */
export function change(home: string, key: string, id: string): Reply<ChangeDetail> {
  const p = project(home, key, () => {
    const reason = changeIdReason(id);
    return reason === "" ? null : bad(`invalid change id: ${reason}`);
  });
  if ("status" in p) return p;
  if (!activeIds(p.dir).includes(id)) return missing("unknown change");
  return ok(detail(home, key, p.dir, join(p.dir, "changes", id), id, false));
}

/** `GET /api/v1/projects/{key}/archive/{folder}`: an archived change. */
export function archivedChange(home: string, key: string, folder: string): Reply<ChangeDetail> {
  const m = ARCHIVED.exec(folder);
  const p = project(home, key, () => {
    if (m === null) return bad("invalid archive folder: must be YYYY-MM-DD- followed by a change id");
    const reason = changeIdReason(m[2] as string);
    return reason === "" ? null : bad(`invalid archive folder: change id ${reason}`);
  });
  if ("status" in p) return p;
  if (!archiveDirs(p.dir).includes(folder)) return missing("unknown archived change");
  return ok(detail(home, key, p.dir, join(p.dir, "changes", "archive", folder), (m as RegExpExecArray)[2] as string, true));
}

// ---- Workflow and prompt files, addressed by where they live ----

/** The most bytes one file text of a validate or save may hold. */
export const MAX_TEXT = 256 * 1024;
const KINDS = Object.keys(EXT) as EditKind[];
const HEX = /^[0-9a-f]{64}$/;
const tooLarge = (): Reply<never> => ({ status: 413, body: { error: "too large" } });

/** The sha256 of a file's bytes, hex; `null` when it is not a file. */
function hashOf(path: string): string | null {
  if (!isFile(path)) return null;
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** Why `kind` and `name` do not name a file, `""` when they do. */
function editReason(kind: string, name: string): string {
  if (!(KINDS as readonly string[]).includes(kind)) return `invalid kind '${kind}': must be ${KINDS.join(" or ")}`;
  if (!NAME.test(name)) return `invalid ${kind === "workflows" ? "workflow" : "prompt"} name '${name}'`;
  return "";
}

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

/** A body that is not valid JSON, as the server passes it to the file routes. */
export const NOT_JSON: unique symbol = Symbol("not JSON");

/**
 * The context, path and labels a file's routes work with; or the reply that stops the request. `check` validates the
 * route's other params, so every `400` comes before the project's `404`.
 */
function fileTarget(
  home: string,
  scope: "global" | "project",
  key: string | null,
  kind: string,
  name: string,
  check: () => Reply<never> | null = () => null,
): { target: FileTarget; context: string; label: string | null } | Reply<never> {
  if (scope === "project" && projectReason(key as string) !== "") return bad(`invalid project: ${projectReason(key as string)}`);
  const reason = editReason(kind, name);
  if (reason !== "") return bad(reason);
  const invalid = check();
  if (invalid !== null) return invalid;
  const target: FileTarget = { scope, key: scope === "global" ? null : key, kind: kind as EditKind, name };
  if (scope === "global") return { target, context: GLOBAL_CONTEXT, label: null };
  const found = projectLabels(home).find((p) => p.key === key);
  if (found === undefined || !isDir(projectDir(home, key as string))) return missing("unknown project");
  return { target, context: key as string, label: found.label };
}

/** Where the files of one context live: the global folder (`key` `null`) or a project's own. */
type Place = { scope: "global" | "project"; key: string | null; label: string | null };

const contextOf = (p: Place): string => (p.scope === "global" ? GLOBAL_CONTEXT : (p.key as string));
const pathOf = (home: string, p: Place, kind: EditKind, name: string): string =>
  p.scope === "global" ? join(home, kind, `${name}${EXT[kind]}`) : projectPath(home, p.key as string, kind, name);

/** The workflow items of one place: the files of its own folder, each resolved in its context with no input. */
function workflowItems(home: string, p: Place): WorkflowItem[] {
  return listWorkflowFiles(home, contextOf(p), () => {})
    .filter((w) => w.scope === p.scope)
    .map((w) => ({
      ...p,
      kind: "workflows",
      name: w.name,
      path: pathOf(home, p, "workflows", w.name),
      description: w.description,
      default: w.default,
      error: w.error === undefined ? null : homeRelative(home, w.error),
    }));
}

/** The prompt items of one place: the files of its own folder. */
function promptItems(home: string, p: Place): PromptItem[] {
  return listPromptFiles(home, contextOf(p))
    .filter((f) => f.scope === p.scope)
    .map((f) => ({ ...p, kind: "prompts", name: f.name, path: pathOf(home, p, "prompts", f.name), description: f.description, step: f.step }));
}

/** The global place, then each project's, in `projectKeys` order. */
const placesOf = (all: { key: string; label: string }[]): Place[] => [
  { scope: "global", key: null, label: null },
  ...all.map(({ key, label }): Place => ({ scope: "project", key, label })),
];

/** A path as the page shows it: `~` for the user's home and `~/<rest>` under it, else as given. */
export function tildePath(path: string, user = homedir()): string {
  if (user === "" || user === sep) return path;
  if (path === user) return "~";
  return path.startsWith(`${user}${sep}`) ? `~/${path.slice(user.length + 1)}` : path;
}

/** `GET /api/v1/files`: the home as shown, every project, then every workflow and prompt file, global ones first. */
export function files(home: string): Reply<FilesResponse> {
  const all = projectLabels(home);
  const places = placesOf(all);
  return ok({ home: tildePath(home), projects: all, workflows: places.flatMap((p) => workflowItems(home, p)), prompts: places.flatMap((p) => promptItems(home, p)) });
}

/** The uses of the prompt `name` by the workflows `items` of a context, one item per workflow, step and kind of use. */
function usesIn(home: string, context: string, items: { name: string; scope: "global" | "project" }[], name: string, label: string | null): FileUse[] {
  return items.flatMap((w) => {
    const place: Place = w.scope === "global" ? { scope: "global", key: null, label: null } : { scope: "project", key: context, label };
    return promptUses(readText(pathOf(home, place, "workflows", w.name)), name).map((u): FileUse => ({ ...place, name: w.name, ...u }));
  });
}

/**
 * The workflow files that name the prompt `name`, in file-list order: for a global prompt, the global workflow files
 * and those of each project that has no prompt file of that name; for a project prompt, the global workflow files the
 * project does not have as its own, then the project's.
 */
function usedBy(home: string, target: FileTarget, all: { key: string; label: string }[]): FileUse[] {
  if (target.scope === "global") {
    return [
      ...usesIn(home, GLOBAL_CONTEXT, listWorkflowFiles(home, GLOBAL_CONTEXT, () => {}), target.name, null),
      ...all
        .filter(({ key }) => !isFile(projectPath(home, key, "prompts", target.name)))
        .flatMap(({ key, label }) =>
          usesIn(
            home,
            key,
            listWorkflowFiles(home, key, () => {}).filter((w) => w.scope === "project"),
            target.name,
            label,
          ),
        ),
    ];
  }
  const key = target.key as string;
  const listed = listWorkflowFiles(home, key, () => {});
  const label = all.find((p) => p.key === key)?.label ?? null;
  return usesIn(home, key, [...listed.filter((w) => w.scope === "global"), ...listed.filter((w) => w.scope === "project")], target.name, label);
}

/** A prompt's text resolved: its header, its header rule errors and its body rendered. */
function promptResolved(text: string): PromptResolved {
  const { header, headerErrors, body } = parsePromptFile(text);
  return { header, headerErrors, html: renderMarkdown(body) };
}

/** A workflow resolved in `context` with no input; `overlay` holds a version's text. */
function workflowResolved(home: string, context: string, name: string, overlay?: Overlay): WorkflowResolved {
  const r = resolveWorkflowFile(home, context, name, {}, overlay);
  return "errors" in r ? { errors: r.errors.map((l) => homeRelative(home, l)) } : r;
}

/** `GET /api/v1/files/global/{kind}/{name}` and `GET /api/v1/files/projects/{key}/{kind}/{name}`: one file with its resolved form and reach. */
export function file(home: string, scope: "global" | "project", key: string | null, kind: string, name: string): Reply<FileDetail> {
  const t = fileTarget(home, scope, key, kind, name);
  if ("status" in t) return t;
  const { target, context, label } = t;
  const path = targetPath(home, target);
  const sha256 = hashOf(path);
  if (sha256 === null) return missing("not found");
  const all = projectLabels(home);
  const place: Place = { scope, key: target.key, label };
  const text = readFileSync(path, "utf-8");
  const common = {
    text,
    sha256,
    overriddenBy: scope === "global" ? all.filter(({ key: k }) => isFile(projectPath(home, k, target.kind, name))) : [],
    overrides: scope === "project" && isFile(join(home, target.kind, `${name}${EXT[target.kind]}`)),
  };
  if (target.kind === "workflows") {
    const item = workflowItems(home, place).find((w) => w.name === name) as WorkflowItem;
    return ok({ ...item, ...common, resolved: workflowResolved(home, context, name), usedBy: [] });
  }
  const item = promptItems(home, place).find((p) => p.name === name) as PromptItem;
  return ok({ ...item, ...common, resolved: promptResolved(text), usedBy: usedBy(home, target, all) });
}

/** The text of a file validate or save body, checked; with `withBase`, its `base` too. */
function textOf(body: unknown, withBase: boolean): { text: string; base: string | null } | Reply<never> {
  if (body === NOT_JSON) return bad("invalid JSON");
  const text = isObject(body) ? body.text : undefined;
  if (typeof text !== "string") return bad("text must be a string");
  if (Buffer.byteLength(text, "utf-8") > MAX_TEXT) return tooLarge();
  if (!withBase) return { text, base: null };
  const base = (body as Record<string, unknown>).base;
  if (!(base === null || (typeof base === "string" && HEX.test(base)))) return bad("base must be a sha256 or null");
  return { text, base };
}

/** `POST …/files/global/{kind}/{name}/validate` and `POST …/files/projects/{key}/{kind}/{name}/validate`: `text` validated in every context that reads the file. */
export function validateFileText(home: string, scope: "global" | "project", key: string | null, kind: string, name: string, body: unknown): Reply<FileValidateResponse> {
  const t = fileTarget(home, scope, key, kind, name);
  if ("status" in t) return t;
  const b = textOf(body, false);
  if ("status" in b) return b;
  const { ok: valid, errors, warnings } = validateFile(home, t.target, b.text);
  return ok({ ok: valid, errors, warnings });
}

/**
 * `PUT …/files/global/{kind}/{name}` and `PUT …/files/projects/{key}/{kind}/{name}`: `text` written to the file's own
 * path when `base` still matches it and it validates; a file that already holds `text` is not written. The text an
 * existing file held is kept as a version first; a version that cannot be kept stops the save.
 */
export function saveFile(home: string, scope: "global" | "project", key: string | null, kind: string, name: string, body: unknown): Reply<FileSaveResponse | SaveInvalid> {
  const t = fileTarget(home, scope, key, kind, name);
  if ("status" in t) return t;
  const b = textOf(body, true);
  if ("status" in b) return b;
  const path = targetPath(home, t.target);
  if (hashOf(path) !== b.base) return { status: 409, body: { error: "changed on disk" } };
  const result = validateFile(home, t.target, b.text);
  if (!result.ok) return { status: 422, body: { errors: result.errors, warnings: result.warnings } };
  try {
    if (!(isFile(path) && readFileSync(path, "utf-8") === b.text)) {
      if (isFile(path)) snapshot(home, t.target, path);
      mkdirSync(dirname(path), { recursive: true });
      writeAtomic(path, b.text);
    }
  } catch (e) {
    return { status: 500, body: { error: e instanceof Error ? e.message : String(e) } };
  }
  return ok({ path, sha256: createHash("sha256").update(b.text, "utf-8").digest("hex") });
}

/** `GET …/files/global/{kind}/{name}/versions` and `GET …/files/projects/{key}/{kind}/{name}/versions`: the file's versions, newest first. */
export function fileVersions(home: string, scope: "global" | "project", key: string | null, kind: string, name: string): Reply<FileVersionsResponse> {
  const t = fileTarget(home, scope, key, kind, name);
  if ("status" in t) return t;
  return ok(versionsOf(home, t.target));
}

/**
 * `GET …/files/global/{kind}/{name}/versions/{id}` and `GET …/files/projects/{key}/{kind}/{name}/versions/{id}`: one
 * version's text and what it resolves to, built as the file detail builds it; `shipped` names a global file's shipped
 * text.
 */
export function fileVersion(home: string, scope: "global" | "project", key: string | null, kind: string, name: string, id: string): Reply<FileVersionResponse> {
  const t = fileTarget(home, scope, key, kind, name, () => (isVersionId(id) ? null : bad("invalid version id")));
  if ("status" in t) return t;
  const text = versionText(home, t.target, id);
  if (text === null) return missing("unknown version");
  const resolved =
    t.target.kind === "workflows" ? workflowResolved(home, t.context, name, new Map([[targetPath(home, t.target), text]])) : promptResolved(text);
  return ok({ text, resolved });
}
