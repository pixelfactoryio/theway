/** The template of a workflow created by New workflow, held until its editor opens on it. */
const pending = new Map<string, string>();

/** Holds the template text of the new workflow `name` of project `key`. */
export function setPendingWorkflow(key: string, name: string, text: string): void {
  pending.set(`${key}/${name}`, text);
}

/** The template text of the new workflow `name` of project `key`, `undefined` when there is none. */
export function pendingWorkflow(key: string, name: string): string | undefined {
  return pending.get(`${key}/${name}`);
}

/** Forgets the template once the workflow is saved or discarded. */
export function clearPendingWorkflow(key: string, name: string): void {
  pending.delete(`${key}/${name}`);
}
