/** Every read of the dashboard API, through TanStack Query. */
import { useQuery } from "@tanstack/react-query";
import type { AllChangesResponse, ChangeDetail, FileDetail, FileItem, FilesResponse } from "../../types";

/** The JSON body of `GET <path>`; an error response throws its `error` text. */
async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { Accept: "application/json" } });
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | { error?: string } | null;
  if (!res.ok) throw new Error(body?.error ?? `${res.status} ${res.statusText}`);
  return body as T;
}

const at = (key: string) => `/api/v1/projects/${encodeURIComponent(key)}`;

export const useAllChanges = () => useQuery({ queryKey: ["changes"], queryFn: () => get<AllChangesResponse>("/api/v1/changes") });

export const useChange = (key: string, id: string) =>
  useQuery({ queryKey: ["change", key, id], queryFn: () => get<ChangeDetail>(`${at(key)}/changes/${encodeURIComponent(id)}`) });

export const useArchived = (key: string, folder: string) =>
  useQuery({ queryKey: ["archived", key, folder], queryFn: () => get<ChangeDetail>(`${at(key)}/archive/${encodeURIComponent(folder)}`) });

export const useFiles = () => useQuery({ queryKey: ["files"], queryFn: () => get<FilesResponse>("/api/v1/files") });

/** Where a workflow or step file lives: the global folder, or one project's (`key`). */
export type FileRef = { scope: "global" | "project"; key: string | null; kind: FileItem["kind"]; name: string };

/** The API path of a file: `/api/v1/files/global/<kind>/<name>` or `/api/v1/files/projects/<key>/<kind>/<name>`. */
const filePath = (f: FileRef): string =>
  f.scope === "global"
    ? `/api/v1/files/global/${f.kind}/${encodeURIComponent(f.name)}`
    : `/api/v1/files/projects/${encodeURIComponent(f.key ?? "")}/${f.kind}/${encodeURIComponent(f.name)}`;

export const useFile = (f: FileRef) =>
  useQuery({ queryKey: ["file", f.scope, f.key, f.kind, f.name], queryFn: () => get<FileDetail>(filePath(f)) });

/** The page of a file in the dashboard: `/workflows/global/<kind>/<name>` or `/workflows/projects/<key>/<kind>/<name>`. */
export const fileHref = (f: FileRef): string =>
  f.scope === "global" ? `/workflows/global/${f.kind}/${f.name}` : `/workflows/projects/${f.key ?? ""}/${f.kind}/${f.name}`;
