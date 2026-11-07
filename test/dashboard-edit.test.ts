import { afterEach, expect, test } from "bun:test";
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const CLI = join(ROOT, "dist", "theway.js");
const SHIPPED_HOME = join(ROOT, "plugin", "home");

const homes: string[] = [];
const servers: ChildProcess[] = [];

afterEach(() => {
  for (const s of servers.splice(0)) s.kill("SIGTERM");
  for (const d of homes.splice(0)) rmSync(d, { recursive: true, force: true });
});

function put(path: string, text: string): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text);
}

/** A home holding the shipped config, convention standards, workflows, steps and prompts, and a project `p`. */
function shippedHome(): string {
  const dir = mkdtempSync(join(tmpdir(), "theway-edit-"));
  homes.push(dir);
  const shipped = (rel: string) => readFileSync(join(SHIPPED_HOME, rel), "utf-8");
  for (const rel of ["config.yaml", "standards/commits.md", "standards/git-host.md"]) put(join(dir, rel), shipped(rel));
  for (const folder of ["workflows", "steps", "prompts"]) {
    for (const f of readdirSync(join(SHIPPED_HOME, folder))) put(join(dir, folder, f), shipped(`${folder}/${f}`));
  }
  mkdirSync(join(dir, "projects", "p"), { recursive: true });
  return dir;
}

/** Starts `theway dashboard` on `dir`; resolves to its port and its write token, read from the page. */
async function start(dir: string): Promise<{ port: number; token: string }> {
  const proc = spawn("node", [CLI, "dashboard", "--port", "0"], { env: { ...process.env, THEWAY_HOME: dir }, stdio: ["ignore", "pipe", "pipe"] });
  servers.push(proc);
  const port = await new Promise<number>((resolve, reject) => {
    let out = "";
    proc.stdout?.on("data", (b: Buffer) => {
      out += b.toString();
      const m = /^theway dashboard: http:\/\/127\.0\.0\.1:([0-9]+)\/\n$/.exec(out);
      if (m !== null) resolve(Number(m[1]));
    });
    proc.on("exit", (code) => reject(new Error(`dashboard exited ${code}`)));
  });
  const page = await send(port, "GET", "/", {});
  const m = /<meta name="theway-token" content="([0-9a-f]{64})" \/>/.exec(page.body);
  if (m === null) throw new Error("no token in the page");
  return { port, token: m[1] as string };
}

type Res = { status: number; body: string; json: () => Record<string, unknown> };

/** One request with exactly the headers given, plus Host and Connection. */
function send(port: number, method: string, path: string, headers: Record<string, string>, body?: string | Buffer): Promise<Res> {
  return new Promise((resolve, reject) => {
    const length: Record<string, string> = body === undefined ? {} : { "Content-Length": String(Buffer.byteLength(body)) };
    const all = { Host: `127.0.0.1:${port}`, Connection: "close", ...length, ...headers };
    const req = request({ host: "127.0.0.1", port, path, method, headers: all }, (res) => {
      let text = "";
      res.setEncoding("utf-8");
      res.on("data", (c: string) => {
        text += c;
      });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: text, json: () => JSON.parse(text) }));
    });
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

/** The headers of a write the guard lets through. */
const allowed = (port: number, token: string) => ({ Origin: `http://127.0.0.1:${port}`, "X-Theway-Token": token, "Content-Type": "application/json" });

const write = (port: number, token: string, method: string, path: string, body?: unknown) =>
  send(port, method, path, allowed(port, token), body === undefined ? undefined : JSON.stringify(body));

const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const cli = (dir: string, ...args: string[]) => spawnSync("node", [CLI, ...args], { env: { ...process.env, THEWAY_HOME: dir }, encoding: "utf-8" });
const shipped = (rel: string) => readFileSync(join(SHIPPED_HOME, rel), "utf-8");

/** Every file under `dir` whose name holds `.tmp-`. */
const temps = (dir: string) => (readdirSync(dir, { recursive: true }) as string[]).filter((f) => f.includes(".tmp-"));

const BROKEN_REVIEW = shipped("steps/review.yaml").replace("{prompt: [verdicts, triage], returns: verdicts}", "{prompt: [verdicts, triage], returns: work, access: read}");

test("every write route answers 403 without the token, with a wrong one, a foreign Origin or none; 415 to a non-JSON body; 413 over the caps", async () => {
  const dir = shippedHome();
  const { port, token } = await start(dir);
  const routes: [string, string][] = [
    ["POST", "/api/v1/projects/p/validate"],
    ["PUT", "/api/v1/projects/p/sources"],
    ["DELETE", `/api/v1/projects/p/sources/workflows/agents?base=${"0".repeat(64)}`],
  ];
  const body = JSON.stringify({ files: [{ kind: "workflows", name: "agents", text: "x", base: null }] });
  const origin = `http://127.0.0.1:${port}`;
  for (const [method, path] of routes) {
    for (const headers of <Record<string, string>[]>[
      { Origin: origin, "Content-Type": "application/json" },
      { Origin: origin, "X-Theway-Token": "0".repeat(64), "Content-Type": "application/json" },
      { Origin: "http://evil.example", "X-Theway-Token": token, "Content-Type": "application/json" },
      { "X-Theway-Token": token, "Content-Type": "application/json" },
    ]) {
      const res = await send(port, method, path, headers, body);
      expect([method, path, res.status, res.json()]).toEqual([method, path, 403, { error: "forbidden" }]);
    }
    const text = await send(port, method, path, { Origin: origin, "X-Theway-Token": token, "Content-Type": "text/plain" }, body);
    expect([method, text.status]).toEqual([method, 415]);
    const big = await send(port, method, path, allowed(port, token), Buffer.alloc(1048577, 32));
    expect([method, big.status, big.json()]).toEqual([method, 413, { error: "too large" }]);
  }
  // A body under 1 MiB with a text over 256 KiB.
  const text = await write(port, token, "PUT", "/api/v1/projects/p/sources", { files: [{ kind: "steps", name: "review", text: "#".repeat(262145), base: null }] });
  expect(text.status).toBe(413);
  // localhost is this server too.
  const local = await send(port, "POST", "/api/v1/projects/p/validate", { ...allowed(port, token), Origin: `http://localhost:${port}` }, body);
  expect(local.status).toBe(200);
  // A route that takes no write stays 404, token or not.
  for (const headers of [{}, allowed(port, token)]) expect((await send(port, "POST", "/api/v1/projects", headers)).status).toBe(404);
  expect(existsSync(join(dir, "projects", "p", "workflows"))).toBe(false);
});

test("the sources, steps and prompts routes give the file the resolver reads, the project hash, and the lists", async () => {
  const dir = shippedHome();
  const { port } = await start(dir);
  const res = await send(port, "GET", "/api/v1/projects/p/sources/steps/review", {});
  expect([res.status, res.json()]).toEqual([
    200,
    {
      kind: "steps",
      name: "review",
      origin: "global",
      path: join(dir, "steps", "review.yaml"),
      text: shipped("steps/review.yaml"),
      projectPath: join(dir, "projects", "p", "steps", "review.yaml"),
      sha256: null,
    },
  ]);
  put(join(dir, "projects", "p", "workflows", "agents.yaml"), shipped("workflows/agents.yaml"));
  const own = (await send(port, "GET", "/api/v1/projects/p/sources/workflows/agents", {})).json();
  expect([own.origin, own.path, own.sha256]).toEqual(["project", join(dir, "projects", "p", "workflows", "agents.yaml"), sha(join(dir, "workflows", "agents.yaml"))]);
  for (const [path, status] of [
    ["/api/v1/projects/p/sources/steps/nope", 404],
    ["/api/v1/projects/p/sources/prompts/fix", 400],
    ["/api/v1/projects/p/sources/steps/gate", 400],
    ["/api/v1/projects/p/sources/steps/Bad_Name", 400],
  ] as const) {
    expect([path, (await send(port, "GET", path, {})).status]).toEqual([path, status]);
  }
  const steps = (await send(port, "GET", "/api/v1/projects/p/steps", {})).json() as unknown as { name: string; params?: { name: string }[] }[];
  expect(steps.map((s) => s.name)).toEqual(["implement", "pr", "review", "scaffold", "scaffold-light", "spec-review"]);
  expect(steps[2]?.params?.map((p) => p.name)).toEqual(["rounds", "lenses", "model", "fix_model"]);
  put(join(dir, "projects", "p", "prompts", "zeta.md"), "z\n");
  const prompts = (await send(port, "GET", "/api/v1/projects/p/prompts", {})).json() as unknown as { name: string; origin: string }[];
  expect(prompts[0]).toEqual({ name: "zeta", origin: "project" });
  expect(prompts.slice(1).every((p) => p.origin === "global")).toBe(true);
});

test("saving an edited workflow and step writes the project copies only, atomically, and the CLI sees the edit", async () => {
  const dir = shippedHome();
  const { port, token } = await start(dir);
  const globals = ["workflows/agents.yaml", "steps/review.yaml"].map((r) => join(dir, r));
  const before = globals.map(sha);
  const agents = shipped("workflows/agents.yaml").replace("  - review:\n", "  - review: {rounds: 2}\n");
  const review = shipped("steps/review.yaml").replace("Maximum review rounds", "Most review rounds");
  const res = await write(port, token, "PUT", "/api/v1/projects/p/sources", {
    files: [
      { kind: "workflows", name: "agents", text: agents, base: null },
      { kind: "steps", name: "review", text: review, base: null },
    ],
  });
  const own = join(dir, "projects", "p");
  expect(res.status).toBe(200);
  expect(res.json().written).toEqual([join(own, "workflows", "agents.yaml"), join(own, "steps", "review.yaml")]);
  expect(readFileSync(join(own, "workflows", "agents.yaml"), "utf-8")).toBe(agents);
  expect(readFileSync(join(own, "steps", "review.yaml"), "utf-8")).toBe(review);
  expect((res.json().sha256 as Record<string, string>)[join(own, "steps", "review.yaml")]).toBe(sha(join(own, "steps", "review.yaml")));
  expect(globals.map(sha)).toEqual(before);
  expect(temps(dir)).toEqual([]);
  const out = cli(dir, "workflow", "agents", "--project", "p");
  expect(out.status).toBe(0);
  const doc = JSON.parse(out.stdout);
  expect(doc.file).toBe(join(own, "workflows", "agents.yaml"));
  expect(doc.steps[1].params.rounds).toEqual({ value: 2, from: "projects/p/workflows/agents.yaml steps[1]" });
  expect(doc.steps[1].file).toBe(join(own, "steps", "review.yaml"));
});

test("a save the resolver refuses gets 422 with its lines and writes nothing; a workflow broken before is only a warning", async () => {
  const dir = shippedHome();
  const own = join(dir, "projects", "p");
  const { port, token } = await start(dir);
  const invalid = await write(port, token, "PUT", "/api/v1/projects/p/sources", { files: [{ kind: "steps", name: "review", text: BROKEN_REVIEW, base: null }] });
  expect(invalid.status).toBe(422);
  expect(invalid.json().errors).toEqual(["theway: projects/p/steps/review.yaml: do[0].loop.do[1].when.do[0].agent.access must be commit or push for returns: work"]);
  expect(existsSync(join(own, "steps"))).toBe(false);

  // A step edit that drops the rounds param breaks a project workflow that sets it.
  put(join(own, "workflows", "mine.yaml"), "version: theway.workflow/v1\nsteps:\n  - implement:\n  - review: {rounds: 2}\n");
  const noRounds = shipped("steps/review.yaml").replace("  rounds: {default: 1, description: Maximum review rounds}\n", "").replace('max: "${rounds}"', "max: 2");
  const breaks = await write(port, token, "PUT", "/api/v1/projects/p/sources", { files: [{ kind: "steps", name: "review", text: noRounds, base: null }] });
  expect(breaks.status).toBe(422);
  expect(breaks.json().errors).toEqual([
    "theway: projects/p/workflows/mine.yaml: steps[1].review.rounds is not a param of review (params: lenses, model, fix_model)",
  ]);
  expect(existsSync(join(own, "steps"))).toBe(false);

  // The same edit with mine already broken before: a warning, and the save goes through.
  put(join(own, "workflows", "mine.yaml"), "version: theway.workflow/v1\nsteps:\n  - implement:\n  - review: {rounds: 2, nope: 1}\n");
  const check = await write(port, token, "POST", "/api/v1/projects/p/validate", { files: [{ kind: "steps", name: "review", text: noRounds }] });
  expect(check.status).toBe(200);
  expect(check.json().ok).toBe(true);
  expect(check.json().errors).toEqual([]);
  expect(check.json().warnings).toEqual([
    "mine: theway: projects/p/workflows/mine.yaml: steps[1].review.rounds is not a param of review (params: lenses, model, fix_model)",
  ]);
  const saved = await write(port, token, "PUT", "/api/v1/projects/p/sources", { files: [{ kind: "steps", name: "review", text: noRounds, base: null }] });
  expect(saved.status).toBe(200);
});

test("a second project workflow with default: true gets 422 with the resolver's line", async () => {
  const dir = shippedHome();
  const own = join(dir, "projects", "p");
  put(join(own, "workflows", "first.yaml"), "version: theway.workflow/v1\ndefault: true\nsteps:\n  - implement:\n");
  const { port, token } = await start(dir);
  const text = "version: theway.workflow/v1\ndefault: true\nsteps:\n  - implement:\n";
  const res = await write(port, token, "PUT", "/api/v1/projects/p/sources", { files: [{ kind: "workflows", name: "second", text, base: null }] });
  expect(res.status).toBe(422);
  expect(res.json().errors).toEqual(["theway: projects/p/workflows/first.yaml and projects/p/workflows/second.yaml both set default: true"]);
  expect(existsSync(join(own, "workflows", "second.yaml"))).toBe(false);
});

test("a stale base gets 409 and writes nothing; a revert deletes the project copy unless its global fallback breaks", async () => {
  const dir = shippedHome();
  const own = join(dir, "projects", "p");
  const copy = join(own, "workflows", "agents.yaml");
  const text = shipped("workflows/agents.yaml").replace("  - review:\n", "  - review: {rounds: 3}\n");
  put(copy, text);
  const { port, token } = await start(dir);
  const edited = text.replace("{rounds: 3}", "{rounds: 4}");
  const stale = await write(port, token, "PUT", "/api/v1/projects/p/sources", { files: [{ kind: "workflows", name: "agents", text: edited, base: null }] });
  expect([stale.status, stale.json()]).toEqual([409, { error: "changed on disk", conflicts: [copy] }]);
  const wrong = await write(port, token, "PUT", "/api/v1/projects/p/sources", { files: [{ kind: "workflows", name: "agents", text: edited, base: "a".repeat(64) }] });
  expect(wrong.status).toBe(409);
  expect(readFileSync(copy, "utf-8")).toBe(text);

  expect((await write(port, token, "DELETE", `/api/v1/projects/p/sources/workflows/agents?base=${"a".repeat(64)}`)).status).toBe(409);
  expect((await write(port, token, "DELETE", `/api/v1/projects/p/sources/workflows/develop?base=${"a".repeat(64)}`)).status).toBe(404);
  const reverted = await write(port, token, "DELETE", `/api/v1/projects/p/sources/workflows/agents?base=${sha(copy)}`);
  expect([reverted.status, reverted.json()]).toEqual([200, { deleted: copy }]);
  expect(existsSync(copy)).toBe(false);
  const out = cli(dir, "workflow", "agents", "--project", "p");
  expect([out.status, JSON.parse(out.stdout).file]).toEqual([0, join(dir, "workflows", "agents.yaml")]);

  // A project pr step that does not resolve: the global agents uses it, the project copy does not.
  put(join(own, "steps", "pr.yaml"), "version: theway.step/v1\ndescription: Broken\ndo: 3\n");
  put(copy, "version: theway.workflow/v1\nsteps:\n  - implement:\n  - review:\n");
  const breaks = await write(port, token, "DELETE", `/api/v1/projects/p/sources/workflows/agents?base=${sha(copy)}`);
  expect(breaks.status).toBe(422);
  expect(breaks.json().errors).toEqual(["theway: projects/p/steps/pr.yaml: do must be a non-empty list"]);
  expect(existsSync(copy)).toBe(true);
});
