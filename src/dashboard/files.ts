/**
 * The home's workflow and prompt files as the dashboard reads them: `GET /api/workflows`, `GET /api/prompts` and each
 * file's route. A global file is read with the global folders only; a project's file as that project resolves it.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { isMap as isYamlMap, isScalar, isSeq, LineCounter, type Node, parse, parseDocument } from "yaml";
import { isFile } from "../core/io";
import { listPromptFiles, listWorkflowFiles, parsePromptFile, resolveWorkflowFile } from "../core/language";
import { NAME, VERSION } from "../core/language-schema";
import { projectDir } from "../core/project";
import type { Kind } from "../core/step-files";
import { tildePath } from "./changes";
import { projectKeys } from "./projects";

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

const EXT: Record<Kind, string> = { workflows: ".yaml", prompts: ".md" };

/** A `uses`, `on-fail` or value naming a prompt: `prompts/<name>.md`. */
const PROMPT_REF = /^prompts\/([^/]+)\.md$/;

/** A line still starting with a file's prefix: `workflows/<name>.yaml: ` or `prompts/<name>.md: `. */
const FILE_PREFIX = /^(?:workflows\/[^/:\s]+\.yaml|prompts\/[^/:\s]+\.md): /;

const AS_ORDER: Use["as"][] = ["step", "on-fail", "value"];

const noWarn = (): void => undefined;

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Name, then a global file before a project's, then project key. */
const byFile = (a: { name: string; project: string | null }, b: { name: string; project: string | null }): number =>
  byText(a.name, b.name) || (a.project === null ? (b.project === null ? 0 : -1) : b.project === null ? 1 : byText(a.project, b.project));

/** The home-relative path of a file: `<kind>/<name>.<ext>` or `projects/<key>/<kind>/<name>.<ext>`. */
export const relPath = (kind: Kind, project: string | null, name: string): string =>
  project === null ? `${kind}/${name}${EXT[kind]}` : `projects/${project}/${kind}/${name}${EXT[kind]}`;

const absPath = (home: string, kind: Kind, project: string | null, name: string): string =>
  project === null ? join(home, kind, `${name}${EXT[kind]}`) : join(projectDir(home, project), kind, `${name}${EXT[kind]}`);

/** The bytes of a file, `null` when it cannot be read. */
function readBytes(path: string): Buffer | null {
  try {
    return readFileSync(path);
  } catch {
    return null;
  }
}

/** A line without the prefix naming its own file. */
const own = (line: string, prefix: string): string => (line.startsWith(prefix) ? line.slice(prefix.length) : line);

/** `items` without repeats, the first occurrence's order kept. */
const unique = (items: string[]): string[] => [...new Set(items)];

/** Every workflow file of the home: the global ones, then each project's own, each with its check lines. */
function workflowFiles(home: string): { name: string; project: string | null; item: ReturnType<typeof listWorkflowFiles>[number] }[] {
  const out = listWorkflowFiles(home, null, noWarn).map((item) => ({ name: item.name, project: null as string | null, item }));
  for (const key of projectKeys(home)) {
    for (const item of listWorkflowFiles(home, key, noWarn)) {
      if (item.scope === "project") out.push({ name: item.name, project: key, item });
    }
  }
  return out.sort(byFile);
}

/** `agents` or `session` when every step runs there, else `mixed`. */
function runsOnOf(steps: { runs_on: "agents" | "session" }[]): WorkflowRow["runsOn"] {
  const set = new Set(steps.map((s) => s.runs_on));
  return set.size === 1 ? ([...set][0] as "agents" | "session") : "mixed";
}

/** The body of `GET /api/workflows`. */
export function listWorkflows(home: string, userHome: string = homedir()): { folder: string; workflows: WorkflowRow[] } {
  const workflows = workflowFiles(home).map(({ name, project, item }): WorkflowRow => ({
    name,
    project,
    description: item.description,
    default: item.default,
    steps: item.doc === null ? null : item.doc.steps.length,
    runsOn: item.doc === null ? null : runsOnOf(item.doc.steps),
    errors: item.errors.map((l) => own(l, `workflows/${name}.yaml: `)),
  }));
  return { folder: tildePath(join(home, "workflows"), userHome), workflows };
}

/** The name a value names when it is a prompt reference, else `null`. */
function promptRef(v: unknown): string | null {
  const m = typeof v === "string" ? PROMPT_REF.exec(v) : null;
  return m !== null && NAME.test(m[1] as string) ? (m[1] as string) : null;
}

/**
 * The prompts a workflow's text uses, as written: a step's `uses` (`step`), its `on-fail` or its on-fail map's `uses`
 * (`on-fail`), a value of its `with`, of its on-fail map's `with` or of its `matrix` (`value`). Nothing when the root
 * is not a `theway.workflow/v1beta` map with a `steps` list.
 */
export function usesOf(text: string): { prompt: string; step: number; as: Use["as"] }[] {
  let root: unknown;
  try {
    root = parse(text, { mapAsMap: true, logLevel: "error" });
  } catch {
    return [];
  }
  if (!(root instanceof Map) || root.get("version") !== VERSION || !Array.isArray(root.get("steps"))) return [];
  const out: { prompt: string; step: number; as: Use["as"] }[] = [];
  (root.get("steps") as unknown[]).forEach((raw, i) => {
    if (!(raw instanceof Map)) return;
    const step = i + 1;
    const add = (v: unknown, as: Use["as"]) => {
      const name = promptRef(v);
      if (name !== null) out.push({ prompt: name, step, as });
    };
    const values = (w: unknown) => {
      if (w instanceof Map) for (const v of w.values()) add(v, "value");
    };
    add(raw.get("uses"), "step");
    const onFail = raw.get("on-fail");
    if (onFail instanceof Map) {
      add(onFail.get("uses"), "on-fail");
      values(onFail.get("with"));
    } else add(onFail, "on-fail");
    values(raw.get("with"));
    const matrix = raw.get("matrix");
    if (matrix instanceof Map) {
      for (const v of matrix.values()) {
        if (Array.isArray(v)) for (const x of v) add(x, "value");
        else add(v, "value");
      }
    }
  });
  return out;
}

/** The order of `usedBy`: workflow name, a global workflow first, project key, step, then `step`, `on-fail`, `value`. */
const byUse = (a: Use, b: Use): number =>
  byFile({ name: a.workflow, project: a.project }, { name: b.workflow, project: b.project }) ||
  a.step - b.step ||
  AS_ORDER.indexOf(a.as) - AS_ORDER.indexOf(b.as);

/**
 * The uses of every prompt file, by its `<project>/<name>` (`/<name>` for a global one): a global workflow counts for
 * the global prompt of that name, a project's workflow for its project's own prompt of that name, else the global one.
 */
function usesByPrompt(home: string, prompts: { name: string; project: string | null }[]): Map<string, Use[]> {
  const id = (project: string | null, name: string) => `${project ?? ""}/${name}`;
  const listed = new Set(prompts.map((p) => id(p.project, p.name)));
  const out = new Map<string, Use[]>();
  for (const { name, project } of workflowFiles(home)) {
    const bytes = readBytes(absPath(home, "workflows", project, name));
    if (bytes === null) continue;
    for (const u of usesOf(bytes.toString("utf-8"))) {
      const target = project !== null && listed.has(id(project, u.prompt)) ? id(project, u.prompt) : id(null, u.prompt);
      if (!listed.has(target)) continue;
      const list = out.get(target) ?? [];
      if (!list.some((x) => x.workflow === name && x.project === project && x.step === u.step && x.as === u.as)) {
        list.push({ workflow: name, project, step: u.step, as: u.as });
      }
      out.set(target, list);
    }
  }
  for (const list of out.values()) list.sort(byUse);
  return out;
}

/** The workflows whose lines count for a prompt: the global ones for a global prompt, the project's own for a project's. */
function contextWorkflows(home: string, project: string | null) {
  return project === null ? listWorkflowFiles(home, null, noWarn) : listWorkflowFiles(home, project, noWarn).filter((w) => w.scope === "project");
}

/** A prompt's check lines: its header errors, then every line of `workflows` about it, its own prefix removed, deduplicated. */
function promptLines(name: string, text: string, workflows: { errors: string[] }[]): string[] {
  const prefix = `prompts/${name}.md: `;
  const fromWorkflows = workflows.flatMap((w) => w.errors.filter((l) => l.startsWith(prefix)).map((l) => own(l, prefix)));
  return unique([...parsePromptFile(text).headerErrors, ...fromWorkflows]);
}

/** Every prompt file of the home: the global ones, then each project's own, sorted. */
function promptFiles(home: string): { name: string; project: string | null }[] {
  const out: { name: string; project: string | null }[] = listPromptFiles(home, null).map((p) => ({ name: p.name, project: null }));
  for (const key of projectKeys(home)) {
    for (const p of listPromptFiles(home, key)) if (p.scope === "project") out.push({ name: p.name, project: key });
  }
  return out.sort(byFile);
}

/** The body of `GET /api/prompts`. */
export function listPrompts(home: string, userHome: string = homedir()): { folder: string; prompts: PromptRow[] } {
  const files = promptFiles(home);
  const uses = usesByPrompt(home, files);
  const workflows = new Map<string | null, ReturnType<typeof contextWorkflows>>();
  const workflowsOf = (project: string | null) => {
    if (!workflows.has(project)) workflows.set(project, contextWorkflows(home, project));
    return workflows.get(project) as ReturnType<typeof contextWorkflows>;
  };
  const prompts = files.map(({ name, project }): PromptRow => {
    const usedBy = uses.get(`${project ?? ""}/${name}`) ?? [];
    const bytes = readBytes(absPath(home, "prompts", project, name));
    if (bytes === null) {
      return { name, project, description: null, model: null, header: false, inputs: [], errors: ["cannot be read"], usedBy };
    }
    const text = bytes.toString("utf-8");
    const { header } = parsePromptFile(text);
    return {
      name,
      project,
      description: header !== null && header.description !== "" ? header.description : null,
      model: header?.model ?? null,
      header: header !== null,
      inputs:
        header === null
          ? []
          : Object.entries(header.inputs).map(([n, d]) => ({ name: n, required: d.required, default: d.default, description: d.description })),
      errors: promptLines(name, text, workflowsOf(project)),
      usedBy,
    };
  });
  return { folder: tildePath(join(home, "prompts"), userHome), prompts };
}

/** The segments of a line's path (its text before the first `: `): keys and list indexes, as far as they read. */
export function pathSegments(path: string): (string | number)[] {
  const out: (string | number)[] = [];
  const re = /\[(\d+)\]|\.?([^.[\]]+)/y;
  let m: RegExpExecArray | null;
  while (re.lastIndex < path.length && (m = re.exec(path)) !== null) {
    out.push(m[1] !== undefined ? Number(m[1]) : (m[2] as string));
  }
  return out;
}

/**
 * The line (from 1) of the deepest segment of `segments` present in `text`'s YAML: a key's line, or for a list index
 * the line of that item's `-`; `null` when not even the first segment is present.
 */
export function lineOfPath(text: string, segments: (string | number)[]): number | null {
  const counter = new LineCounter();
  const doc = parseDocument(text, { lineCounter: counter, logLevel: "silent" });
  let node: unknown = doc.contents;
  let line: number | null = null;
  for (const seg of segments) {
    if (typeof seg === "string" && isYamlMap(node)) {
      const pair = node.items.find((p) => isScalar(p.key) && String(p.key.value) === seg);
      const key = pair?.key as Node | undefined;
      if (pair === undefined || key?.range === undefined || key.range === null) break;
      line = counter.linePos(key.range[0]).line;
      node = pair.value;
    } else if (typeof seg === "number" && isSeq(node)) {
      const item = node.items[seg] as Node | null | undefined;
      if (item === undefined) break;
      line = dashLine(text, counter, item, node as Node);
      node = item;
    } else break;
  }
  return line;
}

/** The line of a list item's `-`: the first `-` found going back from the item's start. */
function dashLine(text: string, counter: LineCounter, item: Node | null, list: Node): number | null {
  const start = item?.range?.[0] ?? list.range?.[0];
  if (start === undefined) return null;
  let i = start - 1;
  while (i >= 0 && /\s/.test(text[i] as string)) i -= 1;
  return counter.linePos(text[i] === "-" ? i : start).line;
}

/** The line of the YAML parser's error in `text`, `null` when it parses. */
function yamlErrorLine(text: string): number | null {
  try {
    parse(text, { mapAsMap: true, logLevel: "error" });
    return null;
  } catch (e) {
    return (e as { linePos?: { line: number }[] }).linePos?.[0]?.line ?? null;
  }
}

/** The line of a workflow's check line, its own prefix already removed. */
export function workflowLine(text: string, line: string): number | null {
  if (FILE_PREFIX.test(line) || line.startsWith("version: ")) return null;
  if (line.startsWith("invalid YAML")) return yamlErrorLine(text);
  const at = line.indexOf(": ");
  if (at === -1) return null;
  return lineOfPath(text, pathSegments(line.slice(0, at)));
}

/** The line of a prompt's check line, its own prefix already removed: a header key's line in the whole file. */
export function promptLine(text: string, line: string): number | null {
  if (line === "cannot be read" || line.startsWith("body:") || line.startsWith("header:")) return null;
  const at = line.indexOf(": ");
  if (at === -1) return null;
  const lines = text.replace(/^﻿/, "").replaceAll("\r\n", "\n").split("\n");
  if (lines[0] !== "---") return null;
  const end = lines.findIndex((l, i) => i > 0 && l === "---");
  if (end === -1) return null;
  const found = lineOfPath(lines.slice(1, end).join("\n"), pathSegments(line.slice(0, at)));
  return found === null ? null : found + 1;
}

/** What a file route answers: its body, or the status and error. */
export type FileAnswer = { status: 200; body: FileBody } | { status: 404 | 500; body: { error: string } };

/** The file `name` of `kind` in the global folder (`project` `null`) or in the project's own folder. */
function readListed(home: string, kind: Kind, project: string | null, name: string): { bytes: Buffer } | FileAnswer {
  if (project !== null && !projectKeys(home).includes(project)) return { status: 404, body: { error: "unknown project" } };
  if (!NAME.test(name)) return { status: 404, body: { error: "unknown file" } };
  const path = absPath(home, kind, project, name);
  if (!isFile(path)) return { status: 404, body: { error: "unknown file" } };
  const bytes = readBytes(path);
  if (bytes === null) return { status: 500, body: { error: "cannot be read" } };
  return { bytes };
}

const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

/** `GET /api/workflows/global/:name` and `…/projects/:key/:name`. */
export function workflowFile(home: string, project: string | null, name: string): FileAnswer {
  const read = readListed(home, "workflows", project, name);
  if ("status" in read) return read;
  const text = read.bytes.toString("utf-8");
  const result = resolveWorkflowFile(home, project, name, {});
  const lines = "errors" in result ? result.errors.map((l) => own(l, `workflows/${name}.yaml: `)) : [];
  return {
    status: 200,
    body: {
      name,
      project,
      path: relPath("workflows", project, name),
      text,
      version: sha256(read.bytes),
      errors: lines.map((l) => ({ text: l, line: workflowLine(text, l) })),
    },
  };
}

/** `GET /api/prompts/global/:name` and `…/projects/:key/:name`. */
export function promptFile(home: string, project: string | null, name: string): FileAnswer {
  const read = readListed(home, "prompts", project, name);
  if ("status" in read) return read;
  const text = read.bytes.toString("utf-8");
  const lines = promptLines(name, text, contextWorkflows(home, project));
  const usedBy = usesByPrompt(home, promptFiles(home)).get(`${project ?? ""}/${name}`) ?? [];
  return {
    status: 200,
    body: {
      name,
      project,
      path: relPath("prompts", project, name),
      text,
      version: sha256(read.bytes),
      errors: lines.map((l) => ({ text: l, line: promptLine(text, l) })),
      usedBy,
    },
  };
}
