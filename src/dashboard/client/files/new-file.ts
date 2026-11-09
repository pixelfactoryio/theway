/** The text of a new workflow or step file, copied from an existing one. Pure: no DOM, no React. */
import { parse, setDescription, setWorkflowField, textOf } from "../editor/ops";

/**
 * The copied file's `text` with its description set to `description`; for a workflow an empty description removes
 * the key, and `default` is removed.
 */
export function newFileText(kind: "workflows" | "steps", text: string, description: string): string {
  const doc = parse(text);
  if (kind === "workflows") {
    setWorkflowField(doc, "description", description === "" ? undefined : description);
    setWorkflowField(doc, "default", undefined);
  } else setDescription(doc, description);
  return textOf(doc);
}
