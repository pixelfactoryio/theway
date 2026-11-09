/** The dashboard API's handlers: each reads the home on every call and returns a status and a JSON body. */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Warn } from "../core/config";
import { isDir, isFile, writeAtomic } from "../core/io";
import { activeIds, archiveDirs, filesEndingWith, taskCounts } from "../core/list";
import { changeIdReason } from "../core/path";
import { projectDir, projectReason } from "../core/project";
import { NAME, type StepItem, type WorkflowItem } from "../core/schema";
import { namesIn } from "../core/step-files";
import { listSteps, listWorkflows, resolveStepFile, resolveWorkflow } from "../core/workflow";
import { isVersionId, snapshot, versionsOf, versionText } from "./history";
import { renderMarkdown } from "./markdown";
import { byText, projectLabels } from "./projects";
import type {
  ActiveChange,
  AllChangesResponse,
  ChangeDetail,
  ChangeProperties,
  ChangesResponse,
  ErrorResponse,
  FileDetail,
  FileItem,
  FileSaveResponse,
  FilesResponse,
  FileUse,
  FileValidateResponse,
  FileVersionResponse,
  FileVersionsResponse,
  SaveInvalid,
  SeriesMember,
  SeriesProgress,
  Status,
  Warning,
} from "./types";
import { type EditKind, type FileTarget, GLOBAL_CONTEXT, projectPath, readText, stepsNamed, targetPath, validateFile } from "./validate";

export { folderOf, labels } from "./projects";

export type Reply<T> = { status: 200 | 400 | 404 | 409 | 413 | 422 | 500; body: T | ErrorResponse };

const ok = <T>(body: T): Reply<T> => ({ status: 200, body });
const bad = (error: string): Reply<never> => ({ status: 400, body: { error } });
const missing = (error: string): Reply<never> => ({ status: 404, body: { error } });

/** An archived change folder: `YYYY-MM-DD-` and a change ID. */
const ARCHIVED = /^([0-9]{4}-[0-9]{2}-[0-9]{2})-(.*)$/;
/** A series member: the series ID and a two-digit ordinal. */
const MEMBER = /^(.+)-([0-9]{2})$/;
/** The files shown first in a change, in this order, when present. */
const FIRST = ["spec.md", "tasks.md", "design.md"];

/** The status of a change with `done` of `total` numbered tasks done. */
export function statusOf(done: number, total: number): Status {
  if (total === 0) return "No tasks";
  if (done === total) return "Ready to archive";
  if (done === 0) return "Not started";
  return "In progress";
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
  const archived = archiveDirs(pdir)
    .reverse()
    .map((folder) => {
      const m = ARCHIVED.exec(folder);
      return m !== null && changeIdReason(m[2] as string) === "" ? { folder, date: m[1] as string, id: m[2] as string } : { folder, date: null, id: null };
    });
  return { active, archived };
}

/** Every member of every series of a project: its active `<series>-NN` changes and its archived `YYYY-MM-DD-<series>-NN` folders. */
function seriesMembers(pdir: string): Map<string, (SeriesMember & { done: boolean })[]> {
  const out = new Map<string, (SeriesMember & { done: boolean })[]>();
  const add = (id: string, folder: string | null, done: boolean) => {
    const m = MEMBER.exec(id);
    if (m === null) return;
    const series = m[1] as string;
    const members = out.get(series) ?? [];
    members.push({ ordinal: Number(m[2]), id, folder, done });
    out.set(series, members);
  };
  for (const id of activeIds(pdir)) {
    const [done, total] = taskCounts(join(pdir, "changes", id));
    add(id, null, statusOf(done, total) === "Ready to archive");
  }
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

/** A PR link token: `https://` and no whitespace, quote, angle bracket or closing bracket. */
const PR_URL = /^https:\/\/[^\s<>"')\]]+/;
/** A spec's series line: `**Series:** <id> — NN of TOTAL`. */
const SERIES_LINE = /^\*\*Series:\*\*\s+(\S+)\s+—\s+([0-9]+)\s+of\s+([0-9]+)\b/;

/** The PR link of a change folder: the first `https://` token of the first `**PR:**` line of its `tasks.md`; `null` otherwise. */
function prOf(dir: string): string | null {
  const path = join(dir, "tasks.md");
  if (!isFile(path)) return null;
  const line = readFileSync(path, "utf-8")
    .split("\n")
    .find((l) => l.startsWith("**PR:**"));
  if (line === undefined) return null;
  for (const token of line.slice("**PR:**".length).split(/\s+/)) {
    const m = PR_URL.exec(token);
    if (m === null) continue;
    const url = m[0].replace(/[.,;:]+$/, "");
    return url.length > "https://".length ? url : null;
  }
  return null;
}

/** The series total a spec states: from its `**Series:**` line among the first three non-empty lines after its H1. */
function statedTotal(dir: string, series: string): number | null {
  const path = join(dir, "spec.md");
  if (!isFile(path)) return null;
  const lines = readFileSync(path, "utf-8").split("\n");
  const h1 = lines.findIndex((l) => l.startsWith("# "));
  if (h1 === -1) return null;
  for (const l of lines.slice(h1 + 1).filter((l) => l.trim() !== "").slice(0, 3)) {
    const m = SERIES_LINE.exec(l);
    if (m !== null && m[1] === series) return Number(m[3]);
  }
  return null;
}

/** The properties of the change `id` whose folder is `dir`, in the project folder `pdir`. */
function propertiesOf(pdir: string, dir: string, id: string): ChangeProperties {
  const m = MEMBER.exec(id);
  if (m === null) return { pr: prOf(dir), series: null };
  const series = m[1] as string;
  const members = (seriesMembers(pdir).get(series) ?? []).map(({ ordinal, id, folder }) => ({ ordinal, id, folder }));
  return { pr: prOf(dir), series: { id: series, ordinal: Number(m[2]), total: statedTotal(dir, series) ?? members.length, members } };
}

/** The detail of the change folder `dir`: its tasks and every `.md` file rendered, `spec.md`, `tasks.md` and `design.md` first. */
function detail(pdir: string, dir: string, id: string, archived: boolean): ChangeDetail {
  const names = filesEndingWith(dir, ".md").sort(byText);
  const ordered = [...FIRST.filter((n) => names.includes(n)), ...names.filter((n) => !FIRST.includes(n))];
  const [done, total] = taskCounts(dir);
  return {
    id,
    archived,
    tasks: { done, total },
    files: ordered.map((name) => ({ name, html: renderMarkdown(readFileSync(join(dir, name), "utf-8")) })),
    properties: propertiesOf(pdir, dir, id),
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
  return ok(detail(p.dir, join(p.dir, "changes", id), id, false));
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
  return ok(detail(p.dir, join(p.dir, "changes", "archive", folder), (m as RegExpExecArray)[2] as string, true));
}

// ---- Workflow and step files, addressed by where they live ----

/** The most bytes one file text of a validate or save may hold. */
export const MAX_TEXT = 256 * 1024;
const KINDS: readonly EditKind[] = ["workflows", "steps"];
const HEX = /^[0-9a-f]{64}$/;
const tooLarge = (): Reply<never> => ({ status: 413, body: { error: "too large" } });

/** The sha256 of a file's bytes, hex; `null` when it is not a file. */
function hashOf(path: string): string | null {
  if (!isFile(path)) return null;
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** Why `kind` and `name` do not name an editable file, `""` when they do. */
function editReason(kind: string, name: string): string {
  if (!(KINDS as readonly string[]).includes(kind)) return `invalid kind '${kind}': must be workflows or steps`;
  if (!NAME.test(name)) return `invalid ${kind === "workflows" ? "workflow" : "step"} name '${name}'`;
  if (kind === "steps" && name === "gate") return "gate is reserved for the gate entry";
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

/** The items of the files of one context: `names` of `kind`, with their description, default and error from that context's list. */
function itemsOf(home: string, context: string, scope: "global" | "project", key: string | null, label: string | null, kind: EditKind, names: string[]): FileItem[] {
  const result = kind === "workflows" ? listWorkflows(home, context, () => {}) : listSteps(home, context, () => {});
  const listed: { error: string } | (WorkflowItem | StepItem)[] = "error" in result ? result : Array.isArray(result) ? result : result.workflows;
  const base = scope === "global" ? join(home, kind) : join(projectDir(home, key as string), kind);
  return names.map((name): FileItem => {
    const item: FileItem = { scope, key, label, kind, name, path: join(base, `${name}.yaml`), description: null, default: false, error: null };
    if ("error" in listed) return { ...item, error: listed.error };
    const found = listed.find((i) => i.name === name);
    if (found === undefined) return item;
    if ("error" in found && found.error !== undefined) return { ...item, error: found.error };
    return { ...item, description: "description" in found ? (found.description ?? null) : null, default: kind === "workflows" && (found as WorkflowItem).default === true };
  });
}

/** The names of the `kind` files directly in `dir`; `gate` is never a step file. */
const fileNames = (dir: string, kind: EditKind): string[] => namesIn(dir, kind).filter((n) => kind === "workflows" || n !== "gate");

/** Every file item of `kind`: the global ones, then each project's own, projects in `projectKeys` order. */
function fileItems(home: string, kind: EditKind, all: { key: string; label: string }[]): FileItem[] {
  return [
    ...itemsOf(home, GLOBAL_CONTEXT, "global", null, null, kind, fileNames(join(home, kind), kind)),
    ...all.flatMap(({ key, label }) => itemsOf(home, key, "project", key, label, kind, fileNames(join(projectDir(home, key), kind), kind))),
  ];
}

/** `GET /api/v1/files`: every project, then every workflow and step file, global ones first. */
export function files(home: string): Reply<FilesResponse> {
  const all = projectLabels(home);
  return ok({ projects: all, workflows: fileItems(home, "workflows", all), steps: fileItems(home, "steps", all) });
}

/**
 * The workflow files that name the step `name`, in file-list order: for a global step, the global workflow files and
 * those of each project that has no step file of that name; for a project step, the global workflow files the project
 * does not have as its own, then the project's.
 */
function usedBy(home: string, target: FileTarget, all: { key: string; label: string }[]): FileUse[] {
  const uses = (dir: string) => fileNames(dir, "workflows").filter((w) => stepsNamed(readText(join(dir, `${w}.yaml`))).includes(target.name));
  const globalDir = join(home, "workflows");
  if (target.scope === "global") {
    return [
      ...uses(globalDir).map((name): FileUse => ({ scope: "global", key: null, label: null, name })),
      ...all
        .filter(({ key }) => !isFile(projectPath(home, key, "steps", target.name)))
        .flatMap(({ key, label }) => uses(join(projectDir(home, key), "workflows")).map((name): FileUse => ({ scope: "project", key, label, name }))),
    ];
  }
  const key = target.key as string;
  const ownDir = join(projectDir(home, key), "workflows");
  const own = fileNames(ownDir, "workflows");
  const label = all.find((p) => p.key === key)?.label ?? null;
  return [
    ...uses(globalDir)
      .filter((n) => !own.includes(n))
      .map((name): FileUse => ({ scope: "global", key: null, label: null, name })),
    ...uses(ownDir).map((name): FileUse => ({ scope: "project", key, label, name })),
  ];
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
  const item = itemsOf(home, context, scope, target.key, label, target.kind, [name])[0] as FileItem;
  const warnings: Warning[] = [];
  const collect: Warn = (file, text) => {
    warnings.push({ file, text });
  };
  const resolved = target.kind === "workflows" ? resolveWorkflow(home, context, name, collect) : resolveStepFile(home, context, name, collect);
  return ok({
    ...item,
    text: readFileSync(path, "utf-8"),
    sha256,
    resolved,
    warnings,
    overriddenBy: scope === "global" ? all.filter(({ key: k }) => isFile(projectPath(home, k, target.kind, name))) : [],
    overrides: scope === "project" && isFile(join(home, target.kind, `${name}.yaml`)),
    usedBy: target.kind === "steps" ? usedBy(home, target, all) : [],
  });
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

/** `GET …/files/global/{kind}/{name}/versions/{id}` and `GET …/files/projects/{key}/{kind}/{name}/versions/{id}`: one version's text; `shipped` names a global file's shipped text. */
export function fileVersion(home: string, scope: "global" | "project", key: string | null, kind: string, name: string, id: string): Reply<FileVersionResponse> {
  const t = fileTarget(home, scope, key, kind, name, () => (isVersionId(id) ? null : bad("invalid version id")));
  if ("status" in t) return t;
  const text = versionText(home, t.target, id);
  return text === null ? missing("unknown version") : ok({ text });
}
