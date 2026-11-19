/**
 * The home's workflow and prompt files as the dashboard reads them: `GET /api/workflows`, `GET /api/prompts` and each
 * file's route. A global file is read with the global folders only; a project's file as that project resolves it.
 */
import { join } from "node:path"
import { isMap as isYamlMap, isScalar, isSeq, LineCounter, type Node, parseDocument } from "yaml"
import { isFile, type Overlay, readBytes } from "../core/io"
import { listPromptFiles, listWorkflowFiles, parsePromptFile, resolveWorkflowFile } from "../core/language"
import {
  FILE_PREFIX,
  matrixOf,
  NAME,
  promptRef,
  runsOnOf,
  VERSION,
  type WorkflowFileItem,
} from "../core/language-schema"
import { warnQuiet } from "../core/output"
import { projectDir } from "../core/project"
import { EXT, type Kind } from "../core/step-files"
import { sha256 } from "../core/store/files"
import { byFile, parseYaml, pathSegments, splitHeader, yamlErrorLine } from "../core/text"
import { joinAnd, markedPath } from "../core/workflow"
import { tildePath } from "./changes"
import { type DashboardContext, knownProject, UNKNOWN_PROJECT } from "./context"
import type { CheckBody, FileBody, FileError, PromptList, PromptRow, Use, WorkflowList, WorkflowRow } from "./contract"
import type { Answer } from "./write"

const AS_ORDER: Use["as"][] = ["step", "on-fail", "value"]

/** The home-relative path of a file: `<kind>/<name>.<ext>` or `projects/<key>/<kind>/<name>.<ext>`. */
const relPath = (kind: Kind, project: string | null, name: string): string =>
  project === null ? `${kind}/${name}${EXT[kind]}` : `projects/${project}/${kind}/${name}${EXT[kind]}`

export const absPath = (ctx: DashboardContext, kind: Kind, project: string | null, name: string): string =>
  project === null
    ? join(ctx.home, kind, `${name}${EXT[kind]}`)
    : join(projectDir(ctx.home, project), kind, `${name}${EXT[kind]}`)

/** A line without the prefix naming its own file. */
const own = (line: string, prefix: string): string => (line.startsWith(prefix) ? line.slice(prefix.length) : line)

/** `items` without repeats, the first occurrence's order kept. */
const unique = (items: string[]): string[] => [...new Set(items)]

/** A workflow file of the home with its check lines, and the workflows of its own context (see `secondDefault`). */
type ListedWorkflow = { name: string; project: string | null; item: WorkflowFileItem; context: WorkflowFileItem[] }

/** Every workflow file of the home: the global ones, then each project's own, each with its check lines. */
function workflowFiles(ctx: DashboardContext): ListedWorkflow[] {
  const global = listWorkflowFiles(ctx.home, null, warnQuiet)
  const out: ListedWorkflow[] = global.map((item) => ({ name: item.name, project: null, item, context: global }))
  for (const key of ctx.store.projectKeys()) {
    const listed = listWorkflowFiles(ctx.home, key, warnQuiet)
    for (const item of listed) {
      if (item.scope === "project") out.push({ name: item.name, project: key, item, context: listed })
    }
  }
  return out.sort(byFile)
}

/**
 * The line `theway workflow` prints when the file `name` of `project` (`null`: a global file) sets `default: true` and
 * so does another workflow of its own context (`context`: the global files for a global file, its project's files and
 * the global ones they leave for a project's), without its `theway: ` prefix; `null` otherwise.
 */
function secondDefault(context: readonly WorkflowFileItem[], project: string | null, name: string): string | null {
  const marked = context.filter((w) => w.default)
  const scope = project === null ? "global" : "project"
  if (marked.length < 2 || !marked.some((w) => w.name === name && w.scope === scope)) return null
  return `${joinAnd(marked.map((w) => markedPath(project, w)))} both set default: true`
}

/** The body of `GET /api/workflows`. */
export function listWorkflows(ctx: DashboardContext): WorkflowList {
  const workflows = workflowFiles(ctx).map(({ name, project, item, context }): WorkflowRow => {
    const second = secondDefault(context, project, name)
    return {
      name,
      project,
      description: item.description,
      default: item.default,
      steps: item.doc === null ? null : item.doc.steps.length,
      runsOn: item.doc === null ? null : runsOnOf(item.doc.steps.map((s) => s.runs_on)),
      errors: [...item.errors.map((l) => own(l, `workflows/${name}.yaml: `)), ...(second === null ? [] : [second])],
    }
  })
  return { folder: tildePath(join(ctx.home, "workflows")), workflows }
}

/**
 * The prompts a workflow's text uses, as written: a step's `uses` (`step`), its `on-fail` or its on-fail map's `uses`
 * (`on-fail`), a value of its `with`, of its on-fail map's `with` or of its valid `matrix` (`value`). Nothing when the
 * root is not a `theway.workflow/v1beta1` map with a `steps` list.
 */
function usesOf(text: string): { prompt: string; step: number; as: Use["as"] }[] {
  const parsed = parseYaml(text)
  if ("reason" in parsed) return []
  const root = parsed.root
  if (!(root instanceof Map) || root.get("version") !== VERSION || !Array.isArray(root.get("steps"))) return []
  const out: { prompt: string; step: number; as: Use["as"] }[] = []
  ;(root.get("steps") as unknown[]).forEach((raw, i) => {
    if (!(raw instanceof Map)) return
    const step = i + 1
    const add = (v: unknown, as: Use["as"]) => {
      const name = promptRef(v)
      if (name !== null) out.push({ prompt: name, step, as })
    }
    const values = (w: unknown) => {
      if (w instanceof Map) for (const v of w.values()) add(v, "value")
    }
    add(raw.get("uses"), "step")
    const onFail = raw.get("on-fail")
    if (onFail instanceof Map) {
      add(onFail.get("uses"), "on-fail")
      values(onFail.get("with"))
    } else add(onFail, "on-fail")
    values(raw.get("with"))
    const matrix = raw.get("matrix")
    for (const v of matrixOf(matrix instanceof Map ? [...matrix.entries()] : [])?.values ?? []) add(v, "value")
  })
  return out
}

/** The order of `usedBy`: workflow name, a global workflow first, project key, step, then `step`, `on-fail`, `value`. */
const byUse = (a: Use, b: Use): number =>
  byFile({ name: a.workflow, project: a.project }, { name: b.workflow, project: b.project }) ||
  a.step - b.step ||
  AS_ORDER.indexOf(a.as) - AS_ORDER.indexOf(b.as)

/**
 * The uses of every prompt file, by its `<project>/<name>` (`/<name>` for a global one): a global workflow counts for
 * the global prompt of that name, a project's workflow for its project's own prompt of that name, else the global one.
 */
function usesByPrompt(ctx: DashboardContext, prompts: { name: string; project: string | null }[]): Map<string, Use[]> {
  const id = (project: string | null, name: string) => `${project ?? ""}/${name}`
  const listed = new Set(prompts.map((p) => id(p.project, p.name)))
  const out = new Map<string, Use[]>()
  for (const { name, project } of workflowFiles(ctx)) {
    const bytes = readBytes(absPath(ctx, "workflows", project, name))
    if (bytes === null) continue
    for (const u of usesOf(bytes.toString("utf-8"))) {
      const target = project !== null && listed.has(id(project, u.prompt)) ? id(project, u.prompt) : id(null, u.prompt)
      if (!listed.has(target)) continue
      const list = out.get(target) ?? []
      if (!list.some((x) => x.workflow === name && x.project === project && x.step === u.step && x.as === u.as)) {
        list.push({ workflow: name, project, step: u.step, as: u.as })
      }
      out.set(target, list)
    }
  }
  for (const list of out.values()) list.sort(byUse)
  return out
}

/** The workflows whose lines count for a prompt: the global ones for a global prompt, the project's own for a project's. */
function contextWorkflows(ctx: DashboardContext, project: string | null, overlay?: Overlay) {
  return project === null
    ? listWorkflowFiles(ctx.home, null, warnQuiet, overlay)
    : listWorkflowFiles(ctx.home, project, warnQuiet, overlay).filter((w) => w.scope === "project")
}

/** A prompt's check lines: its header errors, then every line of `workflows` about it, its own prefix removed, deduplicated. */
function promptLines(name: string, text: string, workflows: { errors: string[] }[]): string[] {
  const prefix = `prompts/${name}.md: `
  const fromWorkflows = workflows.flatMap((w) =>
    w.errors.filter((l) => l.startsWith(prefix)).map((l) => own(l, prefix)),
  )
  return unique([...parsePromptFile(text).headerErrors, ...fromWorkflows])
}

/** Every prompt file of the home: the global ones, then each project's own, sorted. */
function promptFiles(ctx: DashboardContext): { name: string; project: string | null }[] {
  const out: { name: string; project: string | null }[] = listPromptFiles(ctx.home, null).map((p) => ({
    name: p.name,
    project: null,
  }))
  for (const key of ctx.store.projectKeys()) {
    for (const p of listPromptFiles(ctx.home, key)) if (p.scope === "project") out.push({ name: p.name, project: key })
  }
  return out.sort(byFile)
}

/** The body of `GET /api/prompts`. */
export function listPrompts(ctx: DashboardContext): PromptList {
  const files = promptFiles(ctx)
  const uses = usesByPrompt(ctx, files)
  const workflows = new Map<string | null, ReturnType<typeof contextWorkflows>>()
  const workflowsOf = (project: string | null) => {
    if (!workflows.has(project)) workflows.set(project, contextWorkflows(ctx, project))
    return workflows.get(project) as ReturnType<typeof contextWorkflows>
  }
  const prompts = files.map(({ name, project }): PromptRow => {
    const usedBy = uses.get(`${project ?? ""}/${name}`) ?? []
    const bytes = readBytes(absPath(ctx, "prompts", project, name))
    if (bytes === null) {
      return {
        name,
        project,
        description: null,
        model: null,
        header: false,
        inputs: [],
        errors: ["cannot be read"],
        usedBy,
      }
    }
    const text = bytes.toString("utf-8")
    const { header, description, model, inputs } = promptHeader(text)
    return {
      name,
      project,
      description,
      model,
      header,
      inputs,
      errors: promptLines(name, text, workflowsOf(project)),
      usedBy,
    }
  })
  return { folder: tildePath(join(ctx.home, "prompts")), prompts }
}

/**
 * The line (from 1) of the deepest segment of `segments` present in `text`'s YAML: a key's line, or for a list index
 * the line of that item's `-`; `null` when not even the first segment is present.
 */
export function lineOfPath(text: string, segments: (string | number)[]): number | null {
  const counter = new LineCounter()
  const doc = parseDocument(text, { lineCounter: counter, logLevel: "silent" })
  let node: unknown = doc.contents
  let line: number | null = null
  for (const seg of segments) {
    if (typeof seg === "string" && isYamlMap(node)) {
      const pair = node.items.find((p) => isScalar(p.key) && String(p.key.value) === seg)
      const key = pair?.key as Node | undefined
      if (pair === undefined || key?.range === undefined || key.range === null) break
      line = counter.linePos(key.range[0]).line
      node = pair.value
    } else if (typeof seg === "number" && isSeq(node)) {
      const item = node.items[seg] as Node | null | undefined
      if (item === undefined) break
      line = dashLine(text, counter, item, node as Node)
      node = item
    } else break
  }
  return line
}

/** The line of a list item's `-`: the first `-` found going back from the item's start, over whitespace and comments. */
function dashLine(text: string, counter: LineCounter, item: Node | null, list: Node): number | null {
  const start = item?.range?.[0] ?? list.range?.[0]
  if (start === undefined) return null
  let i = start - 1
  for (;;) {
    while (i >= 0 && /\s/.test(text[i] as string)) i -= 1
    if (i < 0 || text[i] === "-") break
    // On a comment's text: go back to before its `#` (at the line's start or after whitespace).
    const lineStart = text.lastIndexOf("\n", i) + 1
    const hash = text.slice(lineStart, i + 1).search(/(?:^|\s)#/)
    if (hash === -1) break
    i = lineStart + hash + (text[lineStart + hash] === "#" ? 0 : 1) - 1
  }
  return counter.linePos(i >= 0 && text[i] === "-" ? i : start).line
}

/** The line of a workflow's check line, its own prefix already removed. */
function workflowLine(text: string, line: string): number | null {
  if (FILE_PREFIX.test(line) || line.startsWith("version: ")) return null
  if (line.startsWith("invalid YAML")) return yamlErrorLine(text)
  const at = line.indexOf(": ")
  if (at === -1) return null
  return lineOfPath(text, pathSegments(line.slice(0, at)))
}

/** The line of a prompt's check line, its own prefix already removed: a header key's line in the whole file. */
function promptLine(text: string, line: string): number | null {
  if (line === "cannot be read" || line.startsWith("body:") || line.startsWith("header:")) return null
  const at = line.indexOf(": ")
  if (at === -1) return null
  const { lines, end } = splitHeader(text)
  if (end === -1) return null
  const found = lineOfPath(lines.slice(1, end).join("\n"), pathSegments(line.slice(0, at)))
  return found === null ? null : found + 1
}

/** The answer refusing an unlisted project or an invalid name, `null` when both are valid. */
export function refused(ctx: DashboardContext, project: string | null, name: string): Answer<never> | null {
  if (project !== null && !knownProject(ctx, project)) return UNKNOWN_PROJECT
  if (!NAME.test(name)) return { status: 404, body: { error: "unknown file" } }
  return null
}

/** The file `name` of `kind` in the global folder (`project` `null`) or in the project's own folder. */
function readListed(
  ctx: DashboardContext,
  kind: Kind,
  project: string | null,
  name: string,
): { bytes: Buffer } | Answer<FileBody> {
  const refusal = refused(ctx, project, name)
  if (refusal !== null) return refusal
  const path = absPath(ctx, kind, project, name)
  if (!isFile(path)) return { status: 404, body: { error: "unknown file" } }
  const bytes = readBytes(path)
  if (bytes === null) return { status: 500, body: { error: "cannot be read" } }
  return { bytes }
}

/**
 * The check lines of the workflow `name` of `project` (`null`: global) if it held `text`, each on its line: the lines of
 * `resolveWorkflowFile` without the file's own prefix, then the second-default line on the `default` key's line. With
 * `overlay`, the files it holds are read from it.
 */
function workflowErrors(
  ctx: DashboardContext,
  project: string | null,
  name: string,
  text: string,
  overlay?: Overlay,
): FileError[] {
  const result = resolveWorkflowFile(ctx.home, project, name, {}, overlay)
  const lines = "errors" in result ? result.errors.map((l) => own(l, `workflows/${name}.yaml: `)) : []
  const out = lines.map((l) => ({ text: l, line: workflowLine(text, l) }))
  const second = secondDefault(listWorkflowFiles(ctx.home, project, warnQuiet, overlay), project, name)
  if (second !== null) out.push({ text: second, line: lineOfPath(text, ["default"]) })
  return out
}

/** The check lines of the prompt `name` of `project` if it held `text`, each on its line; `overlay` as in `workflowErrors`. */
function promptErrors(
  ctx: DashboardContext,
  project: string | null,
  name: string,
  text: string,
  overlay?: Overlay,
): FileError[] {
  return promptLines(name, text, contextWorkflows(ctx, project, overlay)).map((l) => ({
    text: l,
    line: promptLine(text, l),
  }))
}

/** The header fields a row of `GET /api/prompts` gives for a prompt holding `text`. */
function promptHeader(text: string): Pick<PromptRow, "header" | "description" | "model" | "inputs"> {
  const { header } = parsePromptFile(text)
  return {
    header: header !== null,
    description: header !== null && header.description !== "" ? header.description : null,
    model: header?.model ?? null,
    inputs:
      header === null
        ? []
        : Object.entries(header.inputs).map(([n, d]) => ({
            name: n,
            required: d.required,
            default: d.default,
            description: d.description,
          })),
  }
}

/** `GET /api/workflows/global/:name` and `…/projects/:key/:name`. */
export function workflowFile(ctx: DashboardContext, project: string | null, name: string): Answer<FileBody> {
  const read = readListed(ctx, "workflows", project, name)
  if ("status" in read) return read
  const text = read.bytes.toString("utf-8")
  return {
    status: 200,
    body: {
      name,
      project,
      path: relPath("workflows", project, name),
      text,
      version: sha256(read.bytes),
      errors: workflowErrors(ctx, project, name, text),
    },
  }
}

/** `GET /api/prompts/global/:name` and `…/projects/:key/:name`. */
export function promptFile(ctx: DashboardContext, project: string | null, name: string): Answer<FileBody> {
  const read = readListed(ctx, "prompts", project, name)
  if ("status" in read) return read
  const text = read.bytes.toString("utf-8")
  const usedBy = usesByPrompt(ctx, promptFiles(ctx)).get(`${project ?? ""}/${name}`) ?? []
  return {
    status: 200,
    body: {
      name,
      project,
      path: relPath("prompts", project, name),
      text,
      version: sha256(read.bytes),
      errors: promptErrors(ctx, project, name, text),
      usedBy,
    },
  }
}

/**
 * `POST /api/check`: the lines the file route would give if the file `name` of `kind` held `text`, read through an
 * overlay that holds it at the file's path; nothing is written.
 */
export function checkDraft(
  ctx: DashboardContext,
  kind: Kind,
  project: string | null,
  name: string,
  text: string,
): Answer<CheckBody> {
  const refusal = refused(ctx, project, name)
  if (refusal !== null) return refusal
  const overlay: Overlay = new Map([[absPath(ctx, kind, project, name), text]])
  if (kind === "workflows") return { status: 200, body: { errors: workflowErrors(ctx, project, name, text, overlay) } }
  return { status: 200, body: { errors: promptErrors(ctx, project, name, text, overlay), ...promptHeader(text) } }
}
