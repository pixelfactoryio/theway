/** The home's workflow and prompt files as the Workflows and Prompts pages show them. Pure: no React, no DOM. */
import type { PromptRow, Use, WorkflowRow } from "../../contract"
import { byText, splitHeader } from "../../../core/text"
import { countOf, NONE } from "./list-filter"

export { byFile } from "../../../core/text"
export type { CheckBody, FileBody, FileError, PromptInputRow, PromptRow, Use, WorkflowRow } from "../../contract"
export {
  CheckBodySchema,
  ErrorBodySchema,
  FileBodySchema,
  PromptListSchema,
  SavedSchema,
  VersionListSchema,
  VersionTextSchema,
  WorkflowListSchema,
} from "../../contract"

/** The kinds of the Prompts page's Kind filter, in its order. */
export const KINDS = ["step", "reference"] as const
export type PromptKind = (typeof KINDS)[number]

export const KIND_LABEL: Record<PromptKind, string> = { step: "Step prompt", reference: "Reference file" }

/** A prompt's kind: Step prompt when it has a header, even one with errors. */
export const kindOf = (row: { header: boolean }): PromptKind => (row.header ? "step" : "reference")

/** Whether a file's name or description holds `q`, ignoring case; every file when `q` is empty. */
export function fileMatches(file: { name: string; description?: string | null }, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (needle === "") return true
  return file.name.toLowerCase().includes(needle) || (file.description ?? "").toLowerCase().includes(needle)
}

/** The filter fields of the Prompts page, in the bar's order. */
export const PROMPT_FIELDS = ["kind", "applies", "model", "usedBy", "status"] as const

/** The filter fields of the Workflows page, in the bar's order. */
export const WORKFLOW_FIELDS = ["applies", "runsOn", "default", "usesPrompt", "status"] as const

/** The Applies to value of a global file. */
export const GLOBAL = "global"

/** A workflow or prompt file as a filter value: its name, then `~<project>` for a project's own. */
export const fileValue = (name: string, project: string | null): string =>
  project === null ? name : `${name}~${project}`

/** The Status value of a file: `valid`, or `error` when it has errors. */
export const statusValue = (errors: readonly string[]): "valid" | "error" => (errors.length === 0 ? "valid" : "error")

export const STATUS_VALUE_LABEL = { valid: "Valid", error: "Has errors" } as const

/** A prompt's values in a filter field of the Prompts page; `[NONE]` for no model and no workflow. */
export function promptValues(row: PromptRow, field: string): string[] {
  if (field === "kind") return [kindOf(row)]
  if (field === "applies") return [row.project ?? GLOBAL]
  if (field === "model") return [row.model ?? NONE]
  if (field === "usedBy") {
    const uses = [...new Set(row.usedBy.map((u) => fileValue(u.workflow, u.project)))]
    return uses.length === 0 ? [NONE] : uses
  }
  if (field === "status") return [statusValue(row.errors)]
  return []
}

/** The prompts each workflow uses, by the workflow's file value: the prompts' `usedBy` read the other way. */
export function promptsByWorkflow(prompts: readonly PromptRow[]): Map<string, string[]> {
  const uses = new Map<string, string[]>()
  for (const p of prompts) {
    for (const w of new Set(p.usedBy.map((u) => fileValue(u.workflow, u.project)))) {
      uses.set(w, [...(uses.get(w) ?? []), fileValue(p.name, p.project)])
    }
  }
  return uses
}

/** A workflow's values in a filter field of the Workflows page; `[NONE]` for no steps and no prompt. */
export function workflowValues(row: WorkflowRow, field: string, uses: ReadonlyMap<string, string[]>): string[] {
  if (field === "applies") return [row.project ?? GLOBAL]
  if (field === "runsOn") return [row.runsOn ?? NONE]
  if (field === "default") return [row.default ? "yes" : "no"]
  if (field === "usesPrompt") {
    const prompts = uses.get(fileValue(row.name, row.project)) ?? []
    return prompts.length === 0 ? [NONE] : prompts
  }
  if (field === "status") return [statusValue(row.errors)]
  return []
}

/** The status cell's error text: `1 error`, `N errors`. */
export const errorCount = (n: number): string => countOf(n, "error")

/** The Applies to text: "All projects", or "`<label>` only". */
export const appliesTo = (project: string | null, label: (key: string) => string): string =>
  project === null ? "All projects" : `${label(project)} only`

/** A use's text: `<workflow>[ · <label>] · step N`, `… · on-fail of step N`, `… · value in step N`. */
export function describeUse(use: Use, label: (key: string) => string): string {
  const where =
    use.as === "step"
      ? `step ${use.step}`
      : use.as === "on-fail"
        ? `on-fail of step ${use.step}`
        : `value in step ${use.step}`
  return use.project === null ? `${use.workflow} · ${where}` : `${use.workflow} · ${label(use.project)} · ${where}`
}

/** The number of distinct workflows among `uses`: a workflow using a prompt in several steps counts once. */
export const workflowCount = (uses: readonly Use[]): number =>
  new Set(uses.map((u) => `${u.project ?? ""}/${u.workflow}`)).size

/** The order of a column: text compared as is, a missing value last. */
export function compareText(a: string | null, b: string | null): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return byText(a, b)
}

/** A file's row id: `<project>/<name>`, `/<name>` for a global one. */
export const rowId = (row: { name: string; project: string | null }): string => `${row.project ?? ""}/${row.name}`

/**
 * The text a prompt's Preview renders: the text after the header's closing `---` line, leading blank lines dropped,
 * when the prompt has a header; else the whole text. A BOM is dropped and `\r\n` read as `\n`.
 */
export function previewText(raw: string, header: boolean): string {
  const { text, lines, end } = splitHeader(raw)
  if (!header || end === -1) return text
  return lines
    .slice(end + 1)
    .join("\n")
    .replace(/^\n+/, "")
}

/** A prompt's header as fields, as `GET /api/prompts` reads it: its description, model and inputs. */
export type PromptFields = Pick<PromptRow, "description" | "model" | "inputs">

/**
 * A prompt as the workflow panel reads it: its header's fields, `null` for a file with no header (a reference file),
 * and the body the Preview renders, without the header's YAML.
 */
export function promptReading(
  raw: string,
  row: Pick<PromptRow, "header" | "description" | "model" | "inputs">,
): { fields: PromptFields | null; body: string } {
  return {
    fields: row.header ? { description: row.description, model: row.model, inputs: row.inputs } : null,
    body: previewText(raw, row.header),
  }
}

/** The line separator of a text: `\r\n` when its first line break is `\r\n`, else `\n`. */
export const lineSeparatorOf = (text: string): string => {
  const at = text.indexOf("\n")
  return at > 0 && text[at - 1] === "\r" ? "\r\n" : "\n"
}

/** A default value as the Details panel writes it: JSON-quoted. */
export const quoted = (value: string): string => JSON.stringify(value)
