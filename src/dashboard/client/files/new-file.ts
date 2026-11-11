/** The text of a new workflow or prompt file: a starting text, or a copy of an existing file. Pure: no DOM, no React. */
import { VERSION } from "../../../core/language-schema";
import { insertStep, parse, type PromptChoice, setWorkflowField, textOf } from "../editor/ops";
import { addHeader, editHeader, setHeaderField } from "../editor/prompt";

/** The prompt a new workflow's one step names: `implement` when it is a step prompt, else the first step prompt by name; `null` for none. */
export function firstStepPrompt(prompts: readonly PromptChoice[]): PromptChoice | null {
  const implement = prompts.find((p) => p.name === "implement");
  if (implement !== undefined) return implement;
  return [...prompts].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))[0] ?? null;
}

/**
 * A new workflow: `version`, `description`, `runs-on: agents` and one step, written as the `+` menu writes it, on
 * `firstStepPrompt` of the step prompts, or on `prompts/implement.md` when there is none.
 */
export function newWorkflowText(description: string, prompts: readonly PromptChoice[]): string {
  const doc = parse(`version: ${VERSION}\n`);
  setWorkflowField(doc, "description", description);
  setWorkflowField(doc, "runs-on", "agents");
  const step = firstStepPrompt(prompts);
  insertStep(
    doc,
    0,
    step?.name ?? "implement",
    (step?.inputs ?? []).filter((i) => i.required).map((i) => i.name),
  );
  return textOf(doc);
}

/** The body of a new prompt. */
export const NEW_PROMPT_BODY = "Say what this step does, and when it answers pass, fail or blocked.\n";

/** A new prompt: a header with `description` and `model: opus`, then a one-line body. */
export function newPromptText(description: string): string {
  return editHeader(`---\n---\n\n${NEW_PROMPT_BODY}`, (h) => {
    setHeaderField(h, "description", description);
    setHeaderField(h, "model", "opus");
  });
}

/** A copy of a file's `text` with its description set: a workflow's `description`; a prompt's header, added when it has none. */
export function copyText(kind: "workflows" | "prompts", text: string, description: string): string {
  if (kind === "workflows") {
    const doc = parse(text);
    setWorkflowField(doc, "description", description);
    return textOf(doc);
  }
  return editHeader(addHeader(text), (h) => setHeaderField(h, "description", description));
}
