/** The home's workflow and prompt files as the Workflows and Prompts pages show them. Pure: no React, no DOM. */
import type { PromptRow, Use } from "../../contract";

export type {
  CheckBody,
  FileBody,
  FileError,
  PromptInputRow,
  PromptList,
  PromptRow,
  Use,
  Version,
  VersionList,
  VersionText,
  WorkflowList,
  WorkflowRow,
} from "../../contract";

/** The kinds of the Prompts page's Kind filter, in its order. */
export const KINDS = ["step", "reference"] as const;
export type PromptKind = (typeof KINDS)[number];

export const KIND_LABEL: Record<PromptKind, string> = { step: "Step prompt", reference: "Reference file" };
export const KIND_FILTER_LABEL: Record<PromptKind, string> = { step: "Step prompts", reference: "Reference files" };

/** A prompt's kind: Step prompt when it has a header, even one with errors. */
export const kindOf = (row: { header: boolean }): PromptKind => (row.header ? "step" : "reference");

/** A table's state in the address: the search, and on Prompts the one kind kept (`null`: no filtering). */
export type FilesQuery = { q: string; kind: PromptKind | null };

/** The state of the search part `search` (with or without its `?`): an invalid `kind` reads as none. */
export function parseFilesQuery(search: string): FilesQuery {
  const params = new URLSearchParams(search.replace(/^\?/, ""));
  const kind = params.get("kind");
  return { q: params.get("q") ?? "", kind: kind === "step" || kind === "reference" ? kind : null };
}

/** The search part of a state, without its `?`: `q` and `kind`, each absent at its default. */
export function filesQueryString(query: FilesQuery): string {
  const params = new URLSearchParams();
  if (query.q !== "") params.set("q", query.q);
  if (query.kind !== null) params.set("kind", query.kind);
  return params.toString();
}

/** The kinds checked in the Kind filter for a state: none for no filtering. */
export const checkedKinds = (kind: PromptKind | null): PromptKind[] => (kind === null ? [] : [kind]);

/** The address' `kind` for the checked rows: absent when none or both are checked, else the one checked. */
export const kindOfChecked = (checked: readonly PromptKind[]): PromptKind | null =>
  checked.length === 1 ? (checked[0] as PromptKind) : null;

/** Whether a file's name or description holds `q`, ignoring case; every file when `q` is empty. */
export function fileMatches(file: { name: string; description: string | null }, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (needle === "") return true;
  return file.name.toLowerCase().includes(needle) || (file.description ?? "").toLowerCase().includes(needle);
}

/** The toolbar's count: `N <noun>s` (`1 <noun>`), or `N of M <noun>s` while narrowed. */
export function fileCountText(shown: number, all: number, narrowed: boolean, noun: string): string {
  const word = (n: number): string => (n === 1 ? noun : `${noun}s`);
  return narrowed ? `${shown} of ${all} ${word(all)}` : `${shown} ${word(shown)}`;
}

/** The number of prompts of each kind among those the search keeps. */
export function kindCounts(rows: readonly PromptRow[], q: string): Record<PromptKind, number> {
  const counts = { step: 0, reference: 0 };
  for (const r of rows) if (fileMatches(r, q)) counts[kindOf(r)] += 1;
  return counts;
}

/** The status cell's error text: `1 error`, `N errors`. */
export const errorCount = (n: number): string => (n === 1 ? "1 error" : `${n} errors`);

/** The Applies to text: "All projects", or "`<label>` only". */
export const appliesTo = (project: string | null, label: (key: string) => string): string =>
  project === null ? "All projects" : `${label(project)} only`;

/** A use's text: `<workflow>[ · <label>] · step N`, `… · on-fail of step N`, `… · value in step N`. */
export function useText(use: Use, label: (key: string) => string): string {
  const where = use.as === "step" ? `step ${use.step}` : use.as === "on-fail" ? `on-fail of step ${use.step}` : `value in step ${use.step}`;
  return use.project === null ? `${use.workflow} · ${where}` : `${use.workflow} · ${label(use.project)} · ${where}`;
}

/** The address of a file's page: `/<kind>/global/<name>` or `/<kind>/projects/<key>/<name>`. */
export const filePath = (kind: "workflows" | "prompts", project: string | null, name: string): string =>
  project === null ? `/${kind}/global/${name}` : `/${kind}/projects/${project}/${name}`;

/** The API route of a file. */
export const fileApi = (kind: "workflows" | "prompts", project: string | null, name: string): string =>
  `/api${filePath(kind, project, name)}`;

/** The order of a column: text compared as is, a missing value last. */
export function compareText(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Name, then a global file before a project's, then project key. */
export const byFile = (a: { name: string; project: string | null }, b: { name: string; project: string | null }): number =>
  compareText(a.name, b.name) || (a.project === b.project ? 0 : a.project === null ? -1 : b.project === null ? 1 : compareText(a.project, b.project));

/** A file's row id: `<project>/<name>`, `/<name>` for a global one. */
export const rowId = (row: { name: string; project: string | null }): string => `${row.project ?? ""}/${row.name}`;

/**
 * The text a prompt's Preview renders: the text after the header's closing `---` line, leading blank lines dropped,
 * when the prompt has a header; else the whole text. A BOM is dropped and `\r\n` read as `\n`.
 */
export function previewText(raw: string, header: boolean): string {
  const text = raw.replace(/^﻿/, "").replaceAll("\r\n", "\n");
  if (!header) return text;
  const lines = text.split("\n");
  if (lines[0] !== "---") return text;
  const end = lines.findIndex((l, i) => i > 0 && l === "---");
  if (end === -1) return text;
  return lines
    .slice(end + 1)
    .join("\n")
    .replace(/^\n+/, "");
}

/** The line separator of a text: `\r\n` when its first line break is `\r\n`, else `\n`. */
export const lineSeparatorOf = (text: string): string => {
  const at = text.indexOf("\n");
  return at > 0 && text[at - 1] === "\r" ? "\r\n" : "\n";
};

/** A default value as the Details panel writes it: JSON-quoted. */
export const quoted = (value: string): string => JSON.stringify(value);
