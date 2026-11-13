/** The projects `GET /api/projects` lists, and the choice of the current one. Pure: no React, no DOM. */

/** One project: its key, its label and its number of active changes. */
export type Project = { key: string; label: string; active: number };

/** The body of `GET /api/projects`. */
export type ProjectList = { projects: Project[]; start: string | null };

/** Orders projects by label (`localeCompare`, `"en"`, `sensitivity: "base"`), ties broken by key. */
export function byLabel(projects: readonly Project[]): Project[] {
  return [...projects].sort(
    (a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  );
}

/**
 * The current project's key: `routeKey` when it is listed; else `stored` (the last chosen in this browser) when listed;
 * else `start` when listed; else the first project by label. `null` with no project.
 */
export function currentKey(list: ProjectList, routeKey: string | null, stored: string | null): string | null {
  const listed = (key: string | null): key is string => key !== null && list.projects.some((p) => p.key === key);
  if (listed(routeKey)) return routeKey;
  if (listed(stored)) return stored;
  if (listed(list.start)) return list.start;
  return byLabel(list.projects)[0]?.key ?? null;
}

/** The address of a project's changes: `/<key>/changes?`, its `?` clearing the search part. */
export const changesPath = (key: string): string => `/${key}/changes?`;
