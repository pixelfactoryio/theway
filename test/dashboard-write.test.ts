import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createApp, MAX_BODY } from "../src/dashboard/server";

const TOKEN = "cd".repeat(32);
const PORT = 4870;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const KEY = "-p";
const temps: string[] = [];

afterEach(() => {
  for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true });
});

function put(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

const REVIEW = "---\ndescription: Review it\nmodel: opus\n---\nReview.\n";
const flow = (description: string, extra = "") =>
  `version: theway.workflow/v1beta\ndescription: ${description}\nruns-on: session\n${extra}steps:\n  - uses: prompts/review.md\n`;

/** A temporary home with one project (`-p`), the global prompt `review` and the global workflow `agents`. */
function home(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "theway-write-")));
  temps.push(dir);
  mkdirSync(join(dir, "projects", KEY, "changes"), { recursive: true });
  put(join(dir, "prompts", "review.md"), REVIEW);
  put(join(dir, "workflows", "agents.yaml"), flow("Agents"));
  return dir;
}

const sha = (text: string): string => createHash("sha256").update(text).digest("hex");

/** The token the page carries, read from its `<meta name="theway-token">`. */
async function pageToken(h: string): Promise<string> {
  const html = await (await createApp(h, () => PORT, "", TOKEN).request(`${ORIGIN}/`, { headers: { Host: `127.0.0.1:${PORT}` } })).text();
  return /<meta name="theway-token" content="([^"]+)">/.exec(html)?.[1] as string;
}

type Res = { status: number; body: Record<string, unknown> };

async function call(
  h: string,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string | undefined> = {},
): Promise<Res> {
  const token = await pageToken(h);
  const all: Record<string, string> = {};
  for (const [k, v] of Object.entries({ Host: `127.0.0.1:${PORT}`, Origin: ORIGIN, "X-Theway-Token": token, "Content-Type": "application/json", ...headers })) {
    if (v !== undefined) all[k] = v;
  }
  const init: RequestInit = { method, headers: all };
  if (body !== undefined) init.body = typeof body === "string" ? body : JSON.stringify(body);
  const res = await createApp(h, () => PORT, "", TOKEN).request(`${ORIGIN}${path}`, init);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const get = (h: string, path: string) => call(h, "GET", path);

test("a write without this server's Origin or the token gets 403, the same body for either", async () => {
  const h = home();
  const ok = { kind: "workflows", project: null, name: "agents", text: "x" };
  for (const headers of [
    { Origin: undefined },
    { Origin: "http://evil.example" },
    { Origin: `http://127.0.0.1:${PORT + 1}` },
    { "X-Theway-Token": undefined },
    { "X-Theway-Token": "ab".repeat(32) },
    { "X-Theway-Token": "" },
  ]) {
    expect(await call(h, "POST", "/api/check", ok, headers)).toEqual({ status: 403, body: { error: "forbidden" } });
  }
  expect((await call(h, "POST", "/api/check", ok, { Origin: `http://localhost:${PORT}` })).status).toBe(200);
  // Every method but a read is guarded, a PUT and an unknown route included.
  expect(await call(h, "PUT", "/api/workflows/global/agents", { text: "x", base: null }, { "X-Theway-Token": undefined })).toEqual({
    status: 403,
    body: { error: "forbidden" },
  });
  expect((await call(h, "DELETE", "/api/nope", undefined, { Origin: undefined })).status).toBe(403);
});

test("a media type other than application/json gets 415, parameters and case allowed", async () => {
  const h = home();
  const ok = { kind: "workflows", project: null, name: "agents", text: "x" };
  for (const type of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x", undefined]) {
    expect(await call(h, "POST", "/api/check", ok, { "Content-Type": type })).toEqual({ status: 415, body: { error: "unsupported media type" } });
  }
  for (const type of ["application/json; charset=utf-8", "Application/JSON ; charset=UTF-8"]) {
    expect((await call(h, "POST", "/api/check", ok, { "Content-Type": type })).status).toBe(200);
  }
});

test("a body over 1048576 bytes is refused with 413", async () => {
  const h = home();
  const text = "x".repeat(MAX_BODY);
  // In process there is no socket: the answer always arrives, so a reset is not possible here.
  const res = await call(h, "POST", "/api/check", { kind: "workflows", project: null, name: "agents", text });
  expect(res).toEqual({ status: 413, body: { error: "body too large" } });
  const under = "x".repeat(MAX_BODY - 200);
  expect((await call(h, "POST", "/api/check", { kind: "workflows", project: null, name: "agents", text: under })).status).toBe(200);
});

test("a body that is not JSON, misses a field or has one of the wrong type gets 400", async () => {
  const h = home();
  for (const body of [
    "{",
    "[]",
    "null",
    { project: null, name: "agents", text: "x" },
    { kind: "workflows", name: "agents", text: "x" },
    { kind: "workflows", project: 1, name: "agents", text: "x" },
    { kind: "workflows", project: null, name: "agents", text: 3 },
    { kind: "changes", project: null, name: "agents", text: "x" },
  ]) {
    expect([body, await call(h, "POST", "/api/check", body)]).toEqual([body, { status: 400, body: { error: "invalid body" } }]);
  }
  for (const body of ["{", { text: "x" }, { base: null }, { text: "x", base: 1 }]) {
    expect(await call(h, "PUT", "/api/workflows/global/agents", body)).toEqual({ status: 400, body: { error: "invalid body" } });
  }
});

test("check gives the file route's lines for the draft and writes nothing; 404 for an unlisted project or an invalid name", async () => {
  const h = home();
  const draft = "version: theway.workflow/v1beta\ndescription: Draft\nruns-on: agents\nsteps:\n  - uses: prompts/review.md\n    tries: 99\n";
  const before = readFileSync(join(h, "workflows", "agents.yaml"), "utf-8");
  const checked = await call(h, "POST", "/api/check", { kind: "workflows", project: null, name: "agents", text: draft });
  // The same file on disk gives the same lines through the file route.
  const other = home();
  put(join(other, "workflows", "agents.yaml"), draft);
  const route = await get(other, "/api/workflows/global/agents");
  expect(checked).toEqual({ status: 200, body: { errors: route.body.errors } });
  expect((checked.body.errors as unknown[]).length).toBeGreaterThan(0);
  expect(readFileSync(join(h, "workflows", "agents.yaml"), "utf-8")).toBe(before);

  // A project's draft is read in its project's context.
  const own = await call(h, "POST", "/api/check", { kind: "workflows", project: KEY, name: "mine", text: flow("Mine") });
  expect(own).toEqual({ status: 200, body: { errors: [] } });
  expect(existsSync(join(h, "projects", KEY, "workflows"))).toBe(false);

  expect(await call(h, "POST", "/api/check", { kind: "workflows", project: "-nope", name: "agents", text: "" })).toEqual({
    status: 404,
    body: { error: "unknown project" },
  });
  expect(await call(h, "POST", "/api/check", { kind: "prompts", project: null, name: "Bad Name", text: "" })).toEqual({
    status: 404,
    body: { error: "unknown file" },
  });
});

test("check of a prompt gives its lines and the header fields a row gives, read from the draft", async () => {
  const h = home();
  const draft = "---\ndescription: New words\nmodel: gpt\ninputs:\n  x:\n    description: X\n    default: y\n---\nBody\n";
  const res = await call(h, "POST", "/api/check", { kind: "prompts", project: null, name: "review", text: draft });
  expect(res).toEqual({
    status: 200,
    body: {
      errors: [{ text: "model: must be one of opus, sonnet, haiku", line: 3 }],
      header: true,
      description: "New words",
      model: null,
      inputs: [{ name: "x", required: false, default: "y", description: "X" }],
    },
  });
  // The row of the same text on disk agrees.
  put(join(h, "prompts", "review.md"), draft);
  const row = ((await get(h, "/api/prompts")).body.prompts as Record<string, unknown>[]).find((r) => r.name === "review");
  expect(row).toMatchObject({ header: true, description: "New words", model: null, inputs: res.body.inputs });
  // A workflow that uses the prompt sees the draft: an empty body is reported.
  const empty = await call(h, "POST", "/api/check", { kind: "prompts", project: null, name: "review", text: "---\ndescription: D\n---\n" });
  expect(empty.body.errors).toEqual([{ text: "body: must not be empty", line: null }]);
  const reference = await call(h, "POST", "/api/check", { kind: "prompts", project: null, name: "notes", text: "# Notes\n" });
  expect(reference.body).toEqual({ errors: [], header: false, description: null, model: null, inputs: [] });
});

test("a second default: both global files carry the line on their default key, in check, the file and the list routes", async () => {
  const h = home();
  put(join(h, "workflows", "agents.yaml"), flow("Agents", "default: true\n"));
  put(join(h, "workflows", "other.yaml"), flow("Other", "default: true\n"));
  const line = "workflows/agents.yaml and workflows/other.yaml both set default: true";
  for (const name of ["agents", "other"]) {
    const file = await get(h, `/api/workflows/global/${name}`);
    expect(file.body.errors).toEqual([{ text: line, line: 4 }]);
  }
  const rows = (await get(h, "/api/workflows")).body.workflows as Record<string, unknown>[];
  expect(rows.map((r) => [r.name, r.errors])).toEqual([
    ["agents", [line]],
    ["other", [line]],
  ]);
  // The draft counts: dropping the key in a draft of other clears it for that draft.
  const cleared = await call(h, "POST", "/api/check", { kind: "workflows", project: null, name: "other", text: flow("Other") });
  expect(cleared.body).toEqual({ errors: [] });
  const added = await call(h, "POST", "/api/check", { kind: "workflows", project: null, name: "third", text: flow("Third", "default: true\n") });
  expect(added.body).toEqual({
    errors: [{ text: "workflows/agents.yaml, workflows/other.yaml and workflows/third.yaml both set default: true", line: 4 }],
  });
});

test("a second default: with a project's file and a global file, only the project's file carries it, naming both", async () => {
  const h = home();
  put(join(h, "workflows", "agents.yaml"), flow("Agents", "default: true\n"));
  put(join(h, "projects", KEY, "workflows", "mine.yaml"), flow("Mine", "default: true\n"));
  const line = `workflows/agents.yaml and projects/${KEY}/workflows/mine.yaml both set default: true`;
  expect((await get(h, `/api/workflows/projects/${KEY}/mine`)).body.errors).toEqual([{ text: line, line: 4 }]);
  expect((await get(h, "/api/workflows/global/agents")).body.errors).toEqual([]);
  const rows = (await get(h, "/api/workflows")).body.workflows as Record<string, unknown>[];
  expect(rows.map((r) => [r.name, r.project, r.errors])).toEqual([
    ["agents", null, []],
    ["mine", KEY, [line]],
  ]);
  const checked = await call(h, "POST", "/api/check", { kind: "workflows", project: KEY, name: "mine", text: flow("Mine", "default: true\n") });
  expect(checked.body).toEqual({ errors: [{ text: line, line: 4 }] });
  const global = await call(h, "POST", "/api/check", { kind: "workflows", project: null, name: "agents", text: flow("Agents", "default: true\n") });
  expect(global.body).toEqual({ errors: [] });
});

const history = (h: string, project: string | null, kind: string, name: string): string =>
  project === null ? join(h, "history", "global", kind, name) : join(h, "history", "projects", project, kind, name);

test("PUT creates a file in a missing folder, saves with the current base and keeps the replaced text as a version", async () => {
  const h = home();
  const path = join(h, "projects", KEY, "prompts", "fresh.md");
  const created = await call(h, "PUT", `/api/prompts/projects/${KEY}/fresh`, { text: REVIEW, base: null });
  expect(created).toEqual({ status: 200, body: { version: sha(REVIEW) } });
  expect(readFileSync(path, "utf-8")).toBe(REVIEW);
  expect(existsSync(history(h, KEY, "prompts", "fresh"))).toBe(false);

  const next = REVIEW.replace("Review.", "Review again.");
  expect(await call(h, "PUT", `/api/prompts/projects/${KEY}/fresh`, { text: next, base: sha(REVIEW) })).toEqual({
    status: 200,
    body: { version: sha(next) },
  });
  expect(readFileSync(path, "utf-8")).toBe(next);
  const ids = readdirSync(history(h, KEY, "prompts", "fresh"));
  expect(ids.length).toBe(1);
  expect(ids[0]).toMatch(new RegExp(`^\\d{8}T\\d{9}Z-${sha(REVIEW).slice(0, 12)}$`));
  expect(readFileSync(join(history(h, KEY, "prompts", "fresh"), ids[0] as string), "utf-8")).toBe(REVIEW);

  // The same text with the current base writes nothing and keeps nothing.
  expect(await call(h, "PUT", `/api/prompts/projects/${KEY}/fresh`, { text: next, base: sha(next) })).toEqual({
    status: 200,
    body: { version: sha(next) },
  });
  expect(readdirSync(history(h, KEY, "prompts", "fresh")).length).toBe(1);
  // No temp file is left beside the file.
  expect(readdirSync(dirname(path))).toEqual(["fresh.md"]);
});

test("PUT checks base first: a stale base, a taken name and a base against an absent file answer 409 and write nothing", async () => {
  const h = home();
  const path = join(h, "workflows", "agents.yaml");
  const text = flow("Agents");
  expect(await call(h, "PUT", "/api/workflows/global/agents", { text: flow("New"), base: sha("old") })).toEqual({
    status: 409,
    body: { error: "changed on disk", version: sha(text) },
  });
  // Even when the file already holds the text.
  expect(await call(h, "PUT", "/api/workflows/global/agents", { text, base: sha("old") })).toEqual({
    status: 409,
    body: { error: "changed on disk", version: sha(text) },
  });
  expect(await call(h, "PUT", "/api/workflows/global/agents", { text, base: null })).toEqual({
    status: 409,
    body: { error: "file exists", version: sha(text) },
  });
  expect(await call(h, "PUT", "/api/workflows/global/gone", { text, base: sha(text) })).toEqual({
    status: 409,
    body: { error: "changed on disk", version: null },
  });
  expect(existsSync(join(h, "workflows", "gone.yaml"))).toBe(false);
  expect(readFileSync(path, "utf-8")).toBe(text);
  expect(existsSync(join(h, "history"))).toBe(false);
});

test("PUT answers 404 for an unlisted project or an invalid name, and never writes outside its folders", async () => {
  const h = home();
  expect(await call(h, "PUT", "/api/workflows/projects/-nope/x", { text: "x", base: null })).toEqual({ status: 404, body: { error: "unknown project" } });
  for (const name of ["Bad", "a--b", "..%2Fprompts%2Freview", "x.yaml"]) {
    expect(await call(h, "PUT", `/api/prompts/global/${name}`, { text: "x", base: null })).toEqual({ status: 404, body: { error: "unknown file" } });
  }
  expect(await call(h, "PUT", "/api/changes/global/x", { text: "x", base: null })).toEqual({ status: 404, body: { error: "not found" } });
  expect(readdirSync(h).sort()).toEqual(["projects", "prompts", "workflows"]);
});

test("a file keeps its 20 newest versions, listed newest first with their line counts and read by id", async () => {
  const h = home();
  const texts = Array.from({ length: 23 }, (_, i) => `line\n${"x\n".repeat(i)}`);
  let base: string | null = null;
  for (const text of texts) {
    const res = await call(h, "PUT", "/api/prompts/global/many", { text, base });
    expect(res.status).toBe(200);
    base = res.body.version as string;
  }
  const dir = history(h, null, "prompts", "many");
  expect(readdirSync(dir).length).toBe(20);
  const list = await get(h, "/api/prompts/global/many/history");
  const versions = list.body.versions as { id: string; at: string; added: number; removed: number }[];
  expect(versions.length).toBe(20);
  // Newest first: the text before the last save, back to the third text.
  const read = await Promise.all(versions.map(async (v) => (await get(h, `/api/prompts/global/many/history/${v.id}`)).body.text));
  expect(read).toEqual(texts.slice(2, 22).reverse());
  expect(versions[0]).toMatchObject({ added: 1, removed: 0 });
  // The oldest counts against an empty file.
  expect(versions[19]).toMatchObject({ added: 3, removed: 0 });
  for (const v of versions) {
    expect(v.id).toMatch(/^\d{8}T\d{9}Z-[0-9a-f]{12}$/);
    const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z/.exec(v.id) as RegExpExecArray;
    expect(v.at).toBe(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.${m[7]}Z`);
  }
  expect(new Set(versions.map((v) => v.id)).size).toBe(20);
  expect([...versions.map((v) => v.id)].sort().reverse()).toEqual(versions.map((v) => v.id));
});

test("a version id that is malformed or not a listed file of the folder gets 404", async () => {
  const h = home();
  await call(h, "PUT", "/api/workflows/global/agents", { text: flow("Next"), base: sha(flow("Agents")) });
  const [v] = (await get(h, "/api/workflows/global/agents/history")).body.versions as { id: string }[];
  const id = (v as { id: string }).id;
  expect((await get(h, `/api/workflows/global/agents/history/${id}`)).body).toEqual({ text: flow("Agents") });
  const unknown = { status: 404, body: { error: "unknown version" } };
  for (const bad of ["20260101T000000000Z-000000000000", "nope", `${id}x`, "..%2F..%2Fworkflows%2Fagents.yaml"]) {
    expect(await get(h, `/api/workflows/global/agents/history/${bad}`)).toEqual(unknown);
    expect(await call(h, "POST", `/api/workflows/global/agents/history/${bad}/restore`, { base: sha(flow("Next")) })).toEqual(unknown);
  }
  // Another file's version is not this file's.
  expect(await get(h, `/api/prompts/global/review/history/${id}`)).toEqual(unknown);
  expect((await get(h, "/api/prompts/global/review/history")).body).toEqual({ versions: [] });
  expect(await get(h, "/api/workflows/projects/-nope/agents/history")).toEqual({ status: 404, body: { error: "unknown project" } });
});

test("restore writes the version's text, keeps the replaced text as a version, and checks base as PUT does", async () => {
  const h = home();
  const first = flow("Agents");
  const second = flow("Second");
  await call(h, "PUT", "/api/workflows/global/agents", { text: second, base: sha(first) });
  const [v] = (await get(h, "/api/workflows/global/agents/history")).body.versions as { id: string }[];
  const id = (v as { id: string }).id;
  expect(await call(h, "POST", `/api/workflows/global/agents/history/${id}/restore`, { base: sha(first) })).toEqual({
    status: 409,
    body: { error: "changed on disk", version: sha(second) },
  });
  expect(await call(h, "POST", `/api/workflows/global/agents/history/${id}/restore`, { base: sha(second) })).toEqual({
    status: 200,
    body: { version: sha(first) },
  });
  expect(readFileSync(join(h, "workflows", "agents.yaml"), "utf-8")).toBe(first);
  const versions = (await get(h, "/api/workflows/global/agents/history")).body.versions as { id: string }[];
  expect(versions.length).toBe(2);
  expect((await get(h, `/api/workflows/global/agents/history/${(versions[0] as { id: string }).id}`)).body).toEqual({ text: second });
  // Against an absent file, a non-null base answers 409 with a null version.
  rmSync(join(h, "workflows", "agents.yaml"));
  expect(await call(h, "POST", `/api/workflows/global/agents/history/${id}/restore`, { base: sha(first) })).toEqual({
    status: 409,
    body: { error: "changed on disk", version: null },
  });
  expect(await call(h, "POST", `/api/workflows/global/agents/history/${id}/restore`, {})).toEqual({ status: 400, body: { error: "invalid body" } });
});

test.skipIf(process.getuid?.() === 0)("a workflow save that cannot write answers a JSON 500 and keeps no version", async () => {
  const h = home();
  const dir = history(h, null, "workflows", "agents");
  const seeded = Array.from({ length: 20 }, (_, i) => `20260101T000000${String(i).padStart(3, "0")}Z-000000000000`);
  for (const id of seeded) put(join(dir, id), "old\n");
  const folder = join(h, "workflows");
  chmodSync(folder, 0o555);
  try {
    const res = await call(h, "PUT", "/api/workflows/global/agents", { text: flow("Changed"), base: sha(flow("Agents")) });
    expect(res.status).toBe(500);
    expect(res.body.error as string).toStartWith("cannot write: EACCES");
  } finally {
    chmodSync(folder, 0o755);
  }
  expect(readFileSync(join(folder, "agents.yaml"), "utf-8")).toBe(flow("Agents"));
  expect(readdirSync(dir).sort()).toEqual(seeded);
});

test("an error thrown past a route answers a JSON 500 and one escaped theway line", async () => {
  const app = createApp(home(), () => PORT, "", TOKEN);
  app.get("/api/boom", () => {
    throw new Error("first\nsecond");
  });
  const chunks: string[] = [];
  const write = process.stderr.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf-8"));
    return true;
  }) as typeof process.stderr.write;
  let res: Response;
  try {
    res = await app.request(`${ORIGIN}/api/boom`, { headers: { Host: `127.0.0.1:${PORT}` } });
  } finally {
    process.stderr.write = write;
  }
  expect(res.status).toBe(500);
  expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8");
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(await res.json()).toEqual({ error: "first\nsecond" });
  expect(chunks.join("")).toBe("theway: GET /api/boom: first\\nsecond\n");
});
