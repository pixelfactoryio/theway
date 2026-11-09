/** The dashboard API's handlers: each reads the home on every call and returns a status and a JSON body. */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Warn } from "../core/config";
import { isDir, isFile, writeAtomic } from "../core/io";
import { activeIds, archiveDirs, filesEndingWith, taskCounts } from "../core/list";
import { changeIdReason } from "../core/path";
import { projectDir, projectReason } from "../core/project";
import { NAME, type Out, type WorkflowDoc } from "../core/schema";
import { dirsOf, fileOf, namesIn } from "../core/step-files";
import { listSteps, listWorkflows, resolveWorkflow } from "../core/workflow";
import { renderMarkdown } from "./markdown";
import { byText, projectLabels } from "./projects";
import type {
  ActiveChange,
  AllChangesResponse,
  ChangeDetail,
  ChangeProperties,
  ChangesResponse,
  ErrorResponse,
  ProjectsResponse,
  PromptItem,
  RenderedPrompt,
  RevertResponse,
  SaveConflict,
  SaveInvalid,
  SaveResponse,
  SeriesMember,
  SeriesProgress,
  SourceFile,
  Status,
  StepsResponse,
  ValidateResponse,
  Warning,
  WorkflowDetail,
  WorkflowFailure,
  WorkflowsResponse,
} from "./types";
import { type Candidate, type EditKind, projectPath, validateSet } from "./validate";

export { folderOf, labels } from "./projects";

export type Reply<T> = { status: 200 | 400 | 404 | 409 | 413 | 422 | 500; body: T | ErrorResponse };

const ok = <T>(body: T): Reply<T> => ({ status: 200, body });
const bad = (error: string): Reply<never> => ({ status: 400, body: { error } });
const missing = (error: string): Reply<never> => ({ status: 404, body: { error } });
const unresolved = (error: string, warnings: Warning[]): Reply<WorkflowFailure> => ({ status: 422, body: { error, warnings } });

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

/** `GET /api/v1/projects`: every project with its active and archived counts, and the initially selected one. */
export function projects(home: string, current: string | null): Reply<ProjectsResponse> {
  const all = projectLabels(home);
  const list = all.map(({ key, label }) => {
    const dir = projectDir(home, key);
    return { key, label, active: activeIds(dir).length, archived: archiveDirs(dir).length };
  });
  const initial = current !== null && all.some((p) => p.key === current) ? current : (all[0]?.key ?? null);
  return ok({ initial, projects: list });
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

/** `GET /api/v1/projects/{key}/changes`: the active changes, sorted by ID, and the archived ones, newest first. */
export function changes(home: string, key: string): Reply<ChangesResponse> {
  const p = project(home, key);
  if ("status" in p) return p;
  return ok(changesOf(p.dir));
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

/** `GET /api/v1/projects/{key}/workflows`: every workflow and the warnings resolving them gave. */
export function workflows(home: string, key: string): Reply<WorkflowsResponse> {
  const p = project(home, key);
  if ("status" in p) return p;
  const warnings: Warning[] = [];
  const collect: Warn = (file, text) => {
    warnings.push({ file, text });
  };
  const result = listWorkflows(home, key, collect);
  if ("error" in result) return ok({ error: result.error, defaultName: null, defaultError: null, workflows: [], warnings });
  return ok({ ...result, warnings });
}

/** Every prompt path an `Out` list names, in document order, into `into`. */
function promptPaths(nodes: Out[], into: Set<string>): void {
  for (const node of nodes) {
    if ("agent" in node) for (const p of node.agent.prompt) into.add(p);
    else if ("parallel" in node) for (const a of node.parallel) for (const p of a.agent.prompt) into.add(p);
    else if ("loop" in node) promptPaths(node.loop.do, into);
    else if ("do" in node) promptPaths(node.do, into);
  }
}

/** Every distinct prompt path of a resolved workflow, rendered; `{ error }` for one that cannot be read. */
function renderPrompts(doc: WorkflowDoc): Record<string, RenderedPrompt> {
  const paths = new Set<string>();
  for (const entry of doc.steps) if ("do" in entry) promptPaths(entry.do, paths);
  const out: Record<string, RenderedPrompt> = {};
  for (const path of paths) {
    try {
      out[path] = { html: renderMarkdown(readFileSync(path, "utf-8")) };
    } catch (e) {
      out[path] = { error: `cannot read ${path}: ${(e as NodeJS.ErrnoException).code ?? String(e)}` };
    }
  }
  return out;
}

/**
 * `GET /api/v1/projects/{key}/workflows/{name}`: one workflow resolved, with its file's text and its prompts rendered.
 * The prompts read are only the paths the resolver gives; the client never sends one.
 */
export function workflow(home: string, key: string, name: string): Reply<WorkflowDetail | WorkflowFailure> {
  const p = project(home, key, () => (NAME.test(name) ? null : bad(`invalid workflow name '${name}'`)));
  if ("status" in p) return p;
  const listed: Warning[] = [];
  const list = listWorkflows(home, key, (file, text) => {
    listed.push({ file, text });
  });
  if ("error" in list) return unresolved(list.error, listed);
  const item = list.workflows.find((w) => w.name === name);
  if (item === undefined) return missing("unknown workflow");
  const warnings: Warning[] = [];
  const result = resolveWorkflow(home, key, name, (file, text) => {
    warnings.push({ file, text });
  });
  if ("error" in result) return unresolved(result.error, warnings);
  const doc = result.doc;
  return ok({
    workflow: doc,
    default: item.default === true,
    source: { path: doc.file, text: readFileSync(doc.file, "utf-8") },
    prompts: renderPrompts(doc),
    warnings,
  });
}

// ---- The editor's sources and writes ----

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

/** `GET /api/v1/projects/{key}/sources/{kind}/{name}`: the file `fileOf` resolves, with the hash of the project copy. */
export function source(home: string, key: string, kind: string, name: string): Reply<SourceFile> {
  const p = project(home, key, () => {
    const reason = editReason(kind, name);
    return reason === "" ? null : bad(reason);
  });
  if ("status" in p) return p;
  const k = kind as EditKind;
  const path = fileOf(home, key, k, name);
  if (path === null) return missing(`unknown ${k === "workflows" ? "workflow" : "step"}`);
  const own = projectPath(home, key, k, name);
  return ok({
    kind: k,
    name,
    origin: path === own ? "project" : "global",
    path,
    text: readFileSync(path, "utf-8"),
    projectPath: own,
    sha256: hashOf(own),
    globalPath: isFile(join(home, k, `${name}.yaml`)) ? join(home, k, `${name}.yaml`) : null,
  });
}

/** `GET /api/v1/projects/{key}/steps`: every step, sorted, with its description and params, or its error line. */
export function steps(home: string, key: string): Reply<StepsResponse> {
  const p = project(home, key);
  if ("status" in p) return p;
  const result = listSteps(home, key, () => {});
  if ("error" in result) return { status: 422, body: { error: result.error } };
  return ok(result);
}

/** `GET /api/v1/projects/{key}/prompts`: the prompt names of the project's folder, sorted, then the global ones it does not hold. */
export function prompts(home: string, key: string): Reply<PromptItem[]> {
  const p = project(home, key);
  if ("status" in p) return p;
  const [ownDir, globalDir] = dirsOf(home, key, "prompts");
  const own = namesIn(ownDir, "prompts");
  return ok([
    ...own.map((name) => ({ name, origin: "project" as const })),
    ...namesIn(globalDir, "prompts")
      .filter((n) => !own.includes(n))
      .map((name) => ({ name, origin: "global" as const })),
  ]);
}

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * The files of a validate or save body, checked: a list of `{ kind, name, text }` (and `base` with `withBase`), no
 * file twice, each text at most `MAX_TEXT` bytes; `text: null` only with `nullable`.
 */
function filesOf(body: unknown, withBase: boolean, nullable: boolean): (Candidate & { base: string | null })[] | Reply<never> {
  const files = isObject(body) ? body.files : undefined;
  if (!Array.isArray(files) || files.length === 0) return bad("files must be a non-empty list");
  const out: (Candidate & { base: string | null })[] = [];
  const seen = new Set<string>();
  for (const [i, f] of files.entries()) {
    if (!isObject(f)) return bad(`files[${i}] must be an object`);
    const { kind, name, text, base } = f;
    if (typeof kind !== "string" || typeof name !== "string") return bad(`files[${i}]: kind and name must be strings`);
    const reason = editReason(kind, name);
    if (reason !== "") return bad(`files[${i}]: ${reason}`);
    if (seen.has(`${kind}/${name}`)) return bad(`files[${i}]: ${kind}/${name} is given twice`);
    seen.add(`${kind}/${name}`);
    if (!(typeof text === "string" || (nullable && text === null))) return bad(`files[${i}].text must be a string${nullable ? " or null" : ""}`);
    if (typeof text === "string" && Buffer.byteLength(text, "utf-8") > MAX_TEXT) return tooLarge();
    if (withBase && !(base === null || (typeof base === "string" && HEX.test(base)))) return bad(`files[${i}].base must be a sha256 or null`);
    out.push({ kind: kind as EditKind, name, text: text as string | null, base: withBase ? (base as string | null) : null });
  }
  return out;
}

/** `POST /api/v1/projects/{key}/validate`: the candidate set validated, and the named workflow resolved with it. */
export function validate(home: string, key: string, body: unknown): Reply<ValidateResponse> {
  const p = project(home, key);
  if ("status" in p) return p;
  const files = filesOf(body, false, true);
  if ("status" in files) return files;
  const workflow = isObject(body) ? body.workflow : undefined;
  if (workflow !== undefined && (typeof workflow !== "string" || !NAME.test(workflow))) return bad("workflow must be a workflow name");
  return ok(validateSet(home, key, files, workflow as string | undefined));
}

/**
 * `PUT /api/v1/projects/{key}/sources`: each file written to the project folder, in request order, when every `base`
 * still matches the project copy and the set validates. A file whose project copy already holds its text is not written.
 */
export function save(home: string, key: string, body: unknown): Reply<SaveResponse | SaveConflict | SaveInvalid | { error: string; written: string[] }> {
  const p = project(home, key);
  if ("status" in p) return p;
  const files = filesOf(body, true, false);
  if ("status" in files) return files;
  const targets = files.map((f) => projectPath(home, key, f.kind, f.name));
  const conflicts = targets.filter((t, i) => hashOf(t) !== files[i]?.base);
  if (conflicts.length > 0) return { status: 409, body: { error: "changed on disk", conflicts } };
  const result = validateSet(home, key, files);
  if (!result.ok) return { status: 422, body: { errors: result.errors, warnings: result.warnings } };
  const written: string[] = [];
  const sha256: Record<string, string> = {};
  try {
    for (const [i, target] of targets.entries()) {
      const text = files[i]?.text as string;
      sha256[target] = createHash("sha256").update(text, "utf-8").digest("hex");
      if (isFile(target) && readFileSync(target, "utf-8") === text) continue;
      mkdirSync(dirname(target), { recursive: true });
      writeAtomic(target, text);
      written.push(target);
    }
  } catch (e) {
    return { status: 500, body: { error: e instanceof Error ? e.message : String(e), written } };
  }
  return ok({ written, sha256 });
}

/** `DELETE /api/v1/projects/{key}/sources/{kind}/{name}?base=<hex>`: the project copy removed, when `base` matches and nothing breaks. */
export function revert(home: string, key: string, kind: string, name: string, base: string | undefined): Reply<RevertResponse | SaveConflict | SaveInvalid> {
  const p = project(home, key, () => {
    const reason = editReason(kind, name);
    if (reason !== "") return bad(reason);
    return base !== undefined && HEX.test(base) ? null : bad("base must be the sha256 of the project copy");
  });
  if ("status" in p) return p;
  const k = kind as EditKind;
  const target = projectPath(home, key, k, name);
  const current = hashOf(target);
  if (current === null) return missing("no project copy");
  if (current !== base) return { status: 409, body: { error: "changed on disk", conflicts: [target] } };
  const result = validateSet(home, key, [{ kind: k, name, text: null }]);
  if (!result.ok) return { status: 422, body: { errors: result.errors, warnings: result.warnings } };
  rmSync(target);
  return ok({ deleted: target });
}
