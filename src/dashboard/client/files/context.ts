/** The prompts a file's context can name, with their headers: what the editor's menus and selects offer. */
import { useQueries } from "@tanstack/react-query";
import { type FileRef, fileQuery, useFiles } from "@/lib/api";
import type { PromptHeader } from "../../../core/language-schema";
import type { FilesResponse, PromptItem } from "../../types";
import type { PromptChoice } from "../editor/ops";

/** The prompts a file's context reads: the global ones for a global file; a project's own, then the global ones it does not have. */
export function usablePrompts(files: FilesResponse, file: FileRef): PromptItem[] {
  const global = files.prompts.filter((p) => p.scope === "global");
  if (file.scope === "global") return global;
  const own = files.prompts.filter((p) => p.scope === "project" && p.key === file.key);
  return [...own, ...global.filter((g) => !own.some((o) => o.name === g.name))].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** A prompt of the context with its header; `header` is `null` while it loads or when the file has none. */
export type PromptInfo = { item: PromptItem; header: PromptHeader | null };

/** The editor's view of the prompts: every usable one, the step prompts, and a prompt's info by name. */
export type PromptContext = {
  prompts: PromptItem[];
  steps: PromptInfo[];
  info: (name: string | null) => PromptInfo | undefined;
  /** The step prompts as `PromptChoice`s, with the inputs their headers declare. */
  choices: PromptChoice[];
};

/** A prompt's choice: its name and the inputs its header declares. */
export const choiceOf = (p: PromptInfo): PromptChoice => ({
  name: p.item.name,
  inputs: Object.entries(p.header?.inputs ?? {}).map(([name, i]) => ({ name, required: i.required })),
});

/** The prompt context of `file`: the step prompts and the prompts `named` are read with their headers. */
export function usePromptContext(file: FileRef, named: readonly (string | null)[] = []): PromptContext {
  const files = useFiles();
  const prompts = files.data === undefined ? [] : usablePrompts(files.data, file);
  const wanted = prompts.filter((p) => p.step || named.includes(p.name));
  const details = useQueries({ queries: wanted.map(fileQuery) });
  const infos: PromptInfo[] = wanted.map((item, i) => {
    const d = details[i]?.data;
    const header = d !== undefined && d.kind === "prompts" ? d.resolved.header : null;
    return { item, header };
  });
  const steps = infos.filter((p) => p.item.step);
  return {
    prompts,
    steps,
    info: (name) => (name === null ? undefined : infos.find((p) => p.item.name === name)),
    choices: steps.map(choiceOf),
  };
}
