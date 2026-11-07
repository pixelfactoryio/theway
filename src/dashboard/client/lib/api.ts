/** Every read of the dashboard API, through TanStack Query. */
import { useQuery } from "@tanstack/react-query";
import type { ChangeDetail, ChangesResponse, ProjectsResponse, WorkflowDetail, WorkflowFailure, WorkflowsResponse } from "../../types";

/** The JSON body of `GET <path>`; an error response throws its `error` text, except for a status in `accept`. */
async function get<T>(path: string, accept: number[] = []): Promise<T> {
  const res = await fetch(path, { headers: { Accept: "application/json" } });
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | { error?: string } | null;
  if (!res.ok && !(accept.includes(res.status) && body !== null)) throw new Error(body?.error ?? `${res.status} ${res.statusText}`);
  return body as T;
}

const at = (key: string) => `/api/v1/projects/${encodeURIComponent(key)}`;

export const useProjects = () => useQuery({ queryKey: ["projects"], queryFn: () => get<ProjectsResponse>("/api/v1/projects") });

export const useChanges = (key: string) =>
  useQuery({ queryKey: ["changes", key], queryFn: () => get<ChangesResponse>(`${at(key)}/changes`) });

export const useChange = (key: string, id: string) =>
  useQuery({ queryKey: ["change", key, id], queryFn: () => get<ChangeDetail>(`${at(key)}/changes/${encodeURIComponent(id)}`) });

export const useArchived = (key: string, folder: string) =>
  useQuery({ queryKey: ["archived", key, folder], queryFn: () => get<ChangeDetail>(`${at(key)}/archive/${encodeURIComponent(folder)}`) });

export const useWorkflows = (key: string) =>
  useQuery({ queryKey: ["workflows", key], queryFn: () => get<WorkflowsResponse>(`${at(key)}/workflows`) });

/** A workflow resolved, or its `422` body: the line that stops it and the warnings. */
export const useWorkflow = (key: string, name: string) =>
  useQuery({
    queryKey: ["workflow", key, name],
    queryFn: () => get<WorkflowDetail | WorkflowFailure>(`${at(key)}/workflows/${encodeURIComponent(name)}`, [422]),
  });
