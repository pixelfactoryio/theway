/** Every read of the dashboard API, through TanStack Query, and the editor's writes. */
import { useQueries, useQuery } from "@tanstack/react-query";
import type {
  ChangeDetail,
  ChangesResponse,
  ProjectsResponse,
  PromptItem,
  RevertResponse,
  SaveConflict,
  SaveFile,
  SaveInvalid,
  SaveResponse,
  SourceFile,
  SourceKind,
  StepsResponse,
  ValidateFile,
  ValidateResponse,
  WorkflowDetail,
  WorkflowFailure,
  WorkflowsResponse,
} from "../../types";

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

export const useSteps = (key: string) => useQuery({ queryKey: ["steps", key], queryFn: () => get<StepsResponse>(`${at(key)}/steps`) });

export const usePrompts = (key: string) => useQuery({ queryKey: ["prompts", key], queryFn: () => get<PromptItem[]>(`${at(key)}/prompts`) });

/** The source of a workflow or step file; `null` when there is no file of that name (`404`). */
const fetchSource = async (key: string, kind: SourceKind, name: string): Promise<SourceFile | null> => {
  const body = await get<SourceFile | { error: string }>(`${at(key)}/sources/${kind}/${encodeURIComponent(name)}`, [404]);
  return "error" in body ? null : body;
};

/** The source of one workflow or step file. */
export const sourceQuery = (key: string, kind: SourceKind, name: string) => ({
  queryKey: ["sources", key, kind, name],
  queryFn: () => fetchSource(key, kind, name),
  staleTime: Infinity,
});

export const useSource = (key: string, kind: SourceKind, name: string, enabled = true) => useQuery({ ...sourceQuery(key, kind, name), enabled });

/** One source query's outcome: its data once loaded (`null` for no file), or its error. */
export type SourceState = { data: SourceFile | null | undefined; error: string | null };

/** The outcomes of several source queries; the same array while none of them changes. */
const combine = (results: { data: SourceFile | null | undefined; error: Error | null }[]): SourceState[] =>
  results.map((r) => ({ data: r.data, error: r.error === null ? null : r.error.message }));

/** The sources of several step files, in order. */
export const useStepSources = (key: string, names: string[]) => useQueries({ queries: names.map((n) => sourceQuery(key, "steps", n)), combine });

/** The sources of several workflow files, in order. */
export const useWorkflowSources = (key: string, names: string[]) => useQueries({ queries: names.map((n) => sourceQuery(key, "workflows", n)), combine });

/** The process token the server put in the page, sent on every write. */
function token(): string {
  return document.querySelector('meta[name="theway-token"]')?.getAttribute("content") ?? "";
}

/** A write's outcome: its status and JSON body. */
export type Written<T> = { status: number; body: T };

/** A non-GET request with the token header and a JSON body; resolves to the status and the body, whatever the status. */
async function write<T>(method: "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<Written<T>> {
  const res = await fetch(path, {
    method,
    headers: { Accept: "application/json", "Content-Type": "application/json", "X-Theway-Token": token() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const parsed = (await res.json().catch(() => ({ error: `${res.status} ${res.statusText}` }))) as T;
  return { status: res.status, body: parsed };
}

/** Throws the `error` text of an unexpected status. */
function expect<T>(r: Written<T>, ok: number[]): Written<T> {
  if (!ok.includes(r.status)) throw new Error((r.body as { error?: string }).error ?? `HTTP ${r.status}`);
  return r;
}

export const validateFiles = async (key: string, files: ValidateFile[], workflow?: string): Promise<ValidateResponse> =>
  expect(await write<ValidateResponse>("POST", `${at(key)}/validate`, { files, workflow }), [200]).body;

export type SaveResult = Written<SaveResponse> | Written<SaveConflict> | Written<SaveInvalid>;

export const saveFiles = async (key: string, files: SaveFile[]): Promise<SaveResult> =>
  expect(await write<SaveResponse | SaveConflict | SaveInvalid>("PUT", `${at(key)}/sources`, { files }), [200, 409, 422]) as SaveResult;

export type RevertResult = Written<RevertResponse> | Written<SaveConflict> | Written<SaveInvalid>;

export const revertFile = async (key: string, kind: SourceKind, name: string, base: string): Promise<RevertResult> =>
  expect(
    await write<RevertResponse | SaveConflict | SaveInvalid>("DELETE", `${at(key)}/sources/${kind}/${encodeURIComponent(name)}?base=${base}`),
    [200, 409, 422],
  ) as RevertResult;
