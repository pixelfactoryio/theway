/** Every read of the dashboard API, through TanStack Query. */
import { useQuery } from "@tanstack/react-query";
import {
  type AllChangesResponse,
  type ChangeDetail,
  type FileDetail,
  type FileSaveResponse,
  type FilesResponse,
  type FileValidateResponse,
  type FileVersionResponse,
  type FileVersionsResponse,
  type SaveInvalid,
  type SourceKind,
} from "../../types";

/** An error response of the API: its `error` text and HTTP status. */
export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

/** The JSON body of `GET <path>`; an error response throws an `HttpError` with its `error` text. */
async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { Accept: "application/json" } });
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | { error?: string } | null;
  if (!res.ok) throw new HttpError(res.status, body?.error ?? `${res.status} ${res.statusText}`);
  return body as T;
}

/**
 * Whether a failed query is tried again: never after a 4xx answer, which another try would not change; otherwise up to
 * TanStack Query's default of 3 retries.
 */
export const retryQuery = (failureCount: number, error: unknown): boolean =>
  error instanceof HttpError && error.status >= 400 && error.status <= 499 ? false : failureCount < 3;

const at = (key: string) => `/api/v1/projects/${encodeURIComponent(key)}`;

export const useAllChanges = () => useQuery({ queryKey: ["changes"], queryFn: () => get<AllChangesResponse>("/api/v1/changes") });

export const useChange = (key: string, id: string) =>
  useQuery({ queryKey: ["change", key, id], queryFn: () => get<ChangeDetail>(`${at(key)}/changes/${encodeURIComponent(id)}`) });

export const useArchived = (key: string, folder: string) =>
  useQuery({ queryKey: ["archived", key, folder], queryFn: () => get<ChangeDetail>(`${at(key)}/archive/${encodeURIComponent(folder)}`) });

export const useFiles = () => useQuery({ queryKey: ["files"], queryFn: () => get<FilesResponse>("/api/v1/files") });

/** Where a workflow or prompt file lives: the global folder, or one project's (`key`). */
export type FileRef = { scope: "global" | "project"; key: string | null; kind: SourceKind; name: string };

/** The API path of a file: `/api/v1/files/global/<kind>/<name>` or `/api/v1/files/projects/<key>/<kind>/<name>`. */
export const filePath = (f: FileRef): string =>
  f.scope === "global"
    ? `/api/v1/files/global/${f.kind}/${encodeURIComponent(f.name)}`
    : `/api/v1/files/projects/${encodeURIComponent(f.key ?? "")}/${f.kind}/${encodeURIComponent(f.name)}`;

/** The query of a file's detail, shared by `useFile` and the editor's prompt context. */
export const fileQuery = (f: FileRef) => ({ queryKey: ["file", f.scope, f.key, f.kind, f.name], queryFn: () => get<FileDetail>(filePath(f)) });

export const useFile = (f: FileRef, enabled = true) => useQuery({ ...fileQuery(f), enabled });

/** A file's saved versions, newest first; under the file's query key, so a save refreshes them. */
export const useVersions = (f: FileRef) =>
  useQuery({ queryKey: ["file", f.scope, f.key, f.kind, f.name, "versions"], queryFn: () => get<FileVersionsResponse>(`${filePath(f)}/versions`) });

/** One version's text and what it resolves to: `id` is a version ID or `shipped`. */
export const versionQuery = (f: FileRef, id: string) => ({
  queryKey: ["file", f.scope, f.key, f.kind, f.name, "versions", id],
  queryFn: () => get<FileVersionResponse>(`${filePath(f)}/versions/${encodeURIComponent(id)}`),
});

export const useVersion = (f: FileRef, id: string) => useQuery(versionQuery(f, id));

/**
 * The page of a file in the dashboard: a workflow's `/workflows/global/<name>` or `/workflows/projects/<key>/<name>`;
 * a prompt's `/prompts/global/<name>` or `/prompts/projects/<key>/<name>`.
 */
export const fileHref = (f: FileRef): string =>
  f.scope === "global" ? `/${f.kind}/global/${f.name}` : `/${f.kind}/projects/${f.key ?? ""}/${f.name}`;

/** The key of a file in the client's maps: `<scope>/<key>/<kind>/<name>`. */
export const fileKey = (f: FileRef): string => `${f.scope}/${f.key ?? ""}/${f.kind}/${f.name}`;

/** The process token the server put in the page, sent on every write. */
const token = (): string => document.querySelector('meta[name="theway-token"]')?.getAttribute("content") ?? "";

/** The style nonce of this page's response, read from its meta on the first call; `""` when the page has none. */
let nonce: string | null = null;
export const styleNonce = (): string => {
  nonce ??= document.querySelector('meta[name="theway-style-nonce"]')?.getAttribute("content") ?? "";
  return nonce;
};

/** A write's outcome: its status and JSON body. */
export type Written<T> = { status: number; body: T };

/** A POST or PUT with the token header and a JSON body; resolves to the status and the body, whatever the status. */
async function write<T>(method: "POST" | "PUT", path: string, body: unknown): Promise<Written<T>> {
  const res = await fetch(path, {
    method,
    headers: { Accept: "application/json", "Content-Type": "application/json", "X-Theway-Token": token() },
    body: JSON.stringify(body),
  });
  const parsed = (await res.json().catch(() => ({ error: `${res.status} ${res.statusText}` }))) as T;
  return { status: res.status, body: parsed };
}

/** The `error` text of a reply whose status is not one of `ok`, thrown. */
function expectStatus<T>(r: Written<T>, ok: number[]): Written<T> {
  if (!ok.includes(r.status)) throw new Error((r.body as { error?: string }).error ?? `HTTP ${r.status}`);
  return r;
}

/** `POST …/validate`: `text` checked in every context that reads the file. */
export const validateFile = async (f: FileRef, text: string): Promise<FileValidateResponse> =>
  expectStatus(await write<FileValidateResponse>("POST", `${filePath(f)}/validate`, { text }), [200]).body;

/** A save's outcome: written, changed on disk since `base`, or refused with the resolver's lines. */
export type SaveResult = { status: 200; body: FileSaveResponse } | { status: 409; body: { error: string } } | { status: 422; body: SaveInvalid };

/** `PUT` of a file: `text` written where the file lives when `base` still matches it and it validates. */
export const saveFile = async (f: FileRef, text: string, base: string | null): Promise<SaveResult> =>
  expectStatus(await write<unknown>("PUT", filePath(f), { text, base }), [200, 409, 422]) as SaveResult;

/** The history of a file: its page with `/history`, and `/<id>` for one version. */
export const versionsHref = (f: FileRef, id: string | null = null): string => `${fileHref(f)}/history${id === null ? "" : `/${id}`}`;
