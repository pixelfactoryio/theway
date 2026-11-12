/**
 * A prompt file's two parts: its header, the YAML between its first two `---` lines, and its body, everything after.
 * Each is edited apart and joined again, so an edit of one leaves the other byte for byte. DOM-free.
 */
import type { Document } from "yaml";
import { HEADER_ORDER, parse, setRootField, textOf } from "./ops";

/** A prompt file split: its opening fence line, its header's YAML, its closing fence line and its body; `null` parts for a file with no header. */
export type PromptParts = { open: string; header: string; close: string; body: string } | { open: null; header: null; close: null; body: string };

/** Whether a line, with its line ending, is a `---` fence. */
const isFence = (line: string): boolean => /^---\r?\n?$/.test(line);

/**
 * A prompt file's parts: a header when its first line is `---` and a later line is `---`, as the resolver reads it
 * (a leading BOM kept in the opening fence); the whole text as the body otherwise.
 */
export function splitPrompt(text: string): PromptParts {
  const lines = text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const bom = text.startsWith("﻿") ? "﻿" : "";
  const first = lines[0];
  if (first === undefined || !isFence(first.slice(bom.length))) return { open: null, header: null, close: null, body: text };
  const end = lines.findIndex((l, i) => i > 0 && isFence(l));
  if (end === -1) return { open: null, header: null, close: null, body: text };
  return { open: first, header: lines.slice(1, end).join(""), close: lines[end] as string, body: lines.slice(end + 1).join("") };
}

/** The text of a prompt file's parts. */
export const joinPrompt = (p: PromptParts): string => (p.open === null ? p.body : `${p.open}${p.header}${p.close}${p.body}`);

/** The header of a prompt file as a `yaml` Document; `null` for a file with no header. */
export function headerDoc(text: string): Document | null {
  const p = splitPrompt(text);
  return p.open === null ? null : parse(p.header);
}

/** The prompt file with `op` applied to its header's Document; the body is kept byte for byte. A file with no header, or a header that does not parse, is returned as is. */
export function editHeader(text: string, op: (doc: Document) => void): string {
  const p = splitPrompt(text);
  if (p.open === null) return text;
  const doc = parse(p.header);
  if (doc.errors.length > 0) return text;
  op(doc);
  const header = doc.contents === null ? "" : textOf(doc);
  return joinPrompt({ ...p, header });
}

/** The prompt file with its body replaced by `body`; the header is kept byte for byte. */
export const setBody = (text: string, body: string): string => joinPrompt({ ...splitPrompt(text), body });

/** The blank line between a file's header and its body, `""` for a file with none or no header: not part of the editable body. */
const separatorOf = (p: PromptParts): string => (p.open === null ? "" : (/^\r?\n/.exec(p.body)?.[0] ?? ""));

/** The body of a prompt file as the editor shows it: the text after its header and the blank line that follows it, or the whole text. */
export function editableBody(text: string): string {
  const p = splitPrompt(text);
  return p.body.slice(separatorOf(p).length);
}

/** "Use as a step": a header with an empty description put before the text, kept byte for byte after it; a file with a header is returned as is. */
export function addHeader(text: string): string {
  if (splitPrompt(text).open !== null) return text;
  return `---\ndescription: ""\n---\n\n${text}`;
}

/** Sets `description` or `model` of a header Document; `undefined` removes it. */
export const setHeaderField = (doc: Document, field: "description" | "model", value: string | undefined): void => setRootField(doc, field, value, HEADER_ORDER);
