import { useProjects } from "./api";

/** The label of a project key, the key itself until the projects are loaded. */
export function useLabel(key: string): string {
  const projects = useProjects();
  return projects.data?.projects.find((p) => p.key === key)?.label ?? key;
}
