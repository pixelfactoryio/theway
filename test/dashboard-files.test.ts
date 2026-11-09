import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CLI, cleanup, put, SHIPPED_HOME, send, shippedHome, start } from "./dashboard-helpers";

afterEach(cleanup);

const allowed = (port: number, token: string) => ({ Origin: `http://127.0.0.1:${port}`, "X-Theway-Token": token, "Content-Type": "application/json" });
const write = (port: number, token: string, method: string, path: string, body?: unknown) =>
  send(port, method, path, allowed(port, token), body === undefined ? undefined : JSON.stringify(body));
const get = (port: number, path: string) => send(port, "GET", path, {});
const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const cli = (dir: string, ...args: string[]) => spawnSync("node", [CLI, ...args], { env: { ...process.env, THEWAY_HOME: dir }, encoding: "utf-8" });
const shipped = (rel: string) => readFileSync(join(SHIPPED_HOME, rel), "utf-8");
/** Every file under `dir`, relative, sorted. */
const tree = (dir: string) => (readdirSync(dir, { recursive: true }) as string[]).sort();

const PROBE = "version: theway.step/v1\ndescription: Probe\nparams:\n  x: {default: 1, description: X}\ndo:\n  - agent: {prompt: implement, returns: work}\n";
const PROBE_NO_X = "version: theway.step/v1\ndescription: Probe\ndo:\n  - agent: {prompt: implement, returns: work}\n";

type Item = { scope: string; key: string | null; label: string | null; kind: string; name: string; path: string; description: string | null; default: boolean; error: string | null };

/** A shipped home with projects `p` and `q`, `q` holding its own workflow `own`. */
function twoProjects(): string {
  const dir = shippedHome();
  put(join(dir, "projects", "q", "workflows", "own.yaml"), "version: theway.workflow/v1\ndescription: Own\nsteps:\n  - implement:\n");
  return dir;
}

test("GET /api/v1/files lists every project, the global files, then each project's own, with absolute paths", async () => {
  const dir = twoProjects();
  put(join(dir, "workflows", "agents.default.yaml"), shipped("workflows/agents.yaml"));
  put(join(dir, "steps", "review.default.yaml"), shipped("steps/review.yaml"));
  const { port } = await start(dir);
  const res = await get(port, "/api/v1/files");
  expect(res.status).toBe(200);
  const body = res.json() as { projects: unknown[]; workflows: Item[]; steps: Item[] };
  expect(body.projects).toEqual([
    { key: "p", label: "p" },
    { key: "q", label: "q" },
  ]);
  expect(body.workflows.map((w) => [w.scope, w.key, w.label, w.name])).toEqual([
    ["global", null, null, "agents"],
    ["global", null, null, "develop"],
    ["global", null, null, "engineering"],
    ["global", null, null, "engineering-light"],
    ["project", "q", "q", "own"],
  ]);
  expect(body.steps.map((s) => [s.scope, s.name])).toEqual(
    ["implement", "pr", "review", "scaffold", "scaffold-light", "spec-review"].map((n) => ["global", n]),
  );
  expect(body.workflows[1]).toEqual({
    scope: "global",
    key: null,
    label: null,
    kind: "workflows",
    name: "develop",
    path: join(dir, "workflows", "develop.yaml"),
    description: "The tasks done inline in your session, on the working tree, nothing committed",
    default: true,
    error: null,
  });
  expect(body.workflows[4]).toEqual({ scope: "project", key: "q", label: "q", kind: "workflows", name: "own", path: join(dir, "projects", "q", "workflows", "own.yaml"), description: "Own", default: false, error: null });
  expect(body.steps.every((s) => s.default === false && s.error === null && typeof s.description === "string")).toBe(true);
  for (const item of [...body.workflows, ...body.steps]) {
    expect(item.path.startsWith("/")).toBe(true);
    expect(item.path.endsWith(".default.yaml")).toBe(false);
  }
  // The global implement step's path is the file of the implement entry of the resolved agents workflow.
  const agents = (await get(port, "/api/v1/files/global/workflows/agents")).json() as { resolved: { doc: { steps: { step?: string; file?: string }[] } } };
  const implement = agents.resolved.doc.steps.find((s) => s.step === "implement");
  expect(body.steps[0]?.path).toBe(implement?.file as string);
});

test("a file's detail gives its text, sha256, resolved form, the projects overriding it and the workflows using a step", async () => {
  const dir = twoProjects();
  const { port } = await start(dir);
  const res = await get(port, "/api/v1/files/global/steps/review");
  expect(res.status).toBe(200);
  const body = res.json();
  const path = join(dir, "steps", "review.yaml");
  expect([body.text, body.sha256, body.path, body.overrides, body.overriddenBy]).toEqual([shipped("steps/review.yaml"), sha(path), path, false, []]);
  expect((body.resolved as { step: { step: string } }).step.step).toBe("review");
  expect(body.warnings).toEqual([]);
  expect(body.usedBy).toEqual([{ scope: "global", key: null, label: null, name: "agents" }]);

  put(join(dir, "projects", "q", "steps", "review.yaml"), shipped("steps/review.yaml"));
  put(join(dir, "projects", "p", "workflows", "mine.yaml"), "version: theway.workflow/v1\nsteps:\n  - review:\n");
  const after = (await get(port, "/api/v1/files/global/steps/review")).json();
  expect(after.overriddenBy).toEqual([{ key: "q", label: "q" }]);
  expect(after.usedBy).toEqual([
    { scope: "global", key: null, label: null, name: "agents" },
    { scope: "project", key: "p", label: "p", name: "mine" },
  ]);
  const own = (await get(port, "/api/v1/files/projects/q/steps/review")).json();
  expect([own.scope, own.key, own.overrides, own.overriddenBy, own.usedBy]).toEqual(["project", "q", true, [], [{ scope: "global", key: null, label: null, name: "agents" }]]);
  const wf = (await get(port, "/api/v1/files/projects/q/workflows/own")).json();
  expect([wf.overrides, wf.usedBy, (wf.resolved as { doc: { file: string } }).doc.file]).toEqual([false, [], join(dir, "projects", "q", "workflows", "own.yaml")]);

  for (const [p, status] of [
    ["/api/v1/files/global/steps/nope", 404],
    ["/api/v1/files/projects/q/workflows/agents", 404],
    ["/api/v1/files/projects/zz/workflows/agents", 404],
    ["/api/v1/files/global/prompts/fix", 400],
    ["/api/v1/files/global/steps/gate", 400],
    ["/api/v1/files/global/steps/..%2Fx", 400],
    ["/api/v1/files/projects/a.b/steps/review", 400],
  ] as const) {
    expect([p, (await get(port, p)).status]).toEqual([p, status]);
  }
});

test("a global save writes the global file in place, the CLI sees it, and a stale or null base gets 409", async () => {
  const dir = twoProjects();
  const { port, token } = await start(dir);
  const path = join(dir, "workflows", "agents.yaml");
  const projectsBefore = tree(join(dir, "projects"));
  const text = shipped("workflows/agents.yaml").replace("  - review:\n", "  - review: {rounds: 2}\n");
  const base = sha(path);

  const stale = await write(port, token, "PUT", "/api/v1/files/global/workflows/agents", { text, base: "a".repeat(64) });
  expect([stale.status, stale.json()]).toEqual([409, { error: "changed on disk" }]);
  const exists = await write(port, token, "PUT", "/api/v1/files/global/workflows/agents", { text, base: null });
  expect(exists.status).toBe(409);
  expect(sha(path)).toBe(base);

  const res = await write(port, token, "PUT", "/api/v1/files/global/workflows/agents", { text, base });
  expect([res.status, res.json()]).toEqual([200, { path, sha256: createHash("sha256").update(text).digest("hex") }]);
  expect(readFileSync(path, "utf-8")).toBe(text);
  expect(tree(join(dir, "projects"))).toEqual(projectsBefore);
  const out = cli(dir, "workflow", "agents", "--project", "p");
  expect(out.status).toBe(0);
  expect(JSON.parse(out.stdout).steps[1].params.rounds).toEqual({ value: 2, from: "workflows/agents.yaml steps[1]" });
});

test("a save that breaks a reading context gets 422 with its line and writes nothing", async () => {
  const dir = twoProjects();
  const { port, token } = await start(dir);
  const path = join(dir, "workflows", "agents.yaml");
  const base = sha(path);
  const rounds = shipped("workflows/agents.yaml").replace("  - review:\n", "  - review: {rounds: two}\n");
  const res = await write(port, token, "PUT", "/api/v1/files/global/workflows/agents", { text: rounds, base });
  expect(res.status).toBe(422);
  const errors = res.json().errors as string[];
  expect(errors.some((l) => l.endsWith("steps[1].review.rounds must be an integer"))).toBe(true);
  expect(errors.every((l) => !l.startsWith("p: ") && !l.startsWith("q: "))).toBe(true);
  expect(sha(path)).toBe(base);

  // A global step whose param a project workflow sets.
  put(join(dir, "steps", "probe.yaml"), PROBE);
  put(join(dir, "projects", "q", "workflows", "qflow.yaml"), "version: theway.workflow/v1\nsteps:\n  - probe: {x: 1}\n");
  const probe = join(dir, "steps", "probe.yaml");
  const broken = await write(port, token, "PUT", "/api/v1/files/global/steps/probe", { text: PROBE_NO_X, base: sha(probe) });
  expect(broken.status).toBe(422);
  expect((broken.json().errors as string[]).some((l) => l.startsWith("q: "))).toBe(true);
  expect(readFileSync(probe, "utf-8")).toBe(PROBE);
});

test("a project save with base null creates the project file and leaves the global one byte-identical", async () => {
  const dir = twoProjects();
  const { port, token } = await start(dir);
  const global = join(dir, "workflows", "agents.yaml");
  const before = sha(global);
  const text = shipped("workflows/agents.yaml").replace("  - review:\n", "  - review: {rounds: 3}\n");
  const res = await write(port, token, "PUT", "/api/v1/files/projects/p/workflows/agents", { text, base: null });
  const own = join(dir, "projects", "p", "workflows", "agents.yaml");
  expect([res.status, res.json().path]).toEqual([200, own]);
  expect(readFileSync(own, "utf-8")).toBe(text);
  expect(sha(global)).toBe(before);
  // The same text again with its base: nothing to write, the same reply.
  const again = await write(port, token, "PUT", "/api/v1/files/projects/p/workflows/agents", { text, base: sha(own) });
  expect([again.status, again.json()]).toEqual([200, { path: own, sha256: sha(own) }]);
});

test("validate accepts a file that does not exist yet, which a read still answers 404", async () => {
  const dir = twoProjects();
  const { port, token } = await start(dir);
  const res = await write(port, token, "POST", "/api/v1/files/global/steps/newstep/validate", { text: PROBE });
  expect([res.status, res.json().ok]).toEqual([200, true]);
  expect(existsSync(join(dir, "steps", "newstep.yaml"))).toBe(false);
  expect((await get(port, "/api/v1/files/global/steps/newstep")).status).toBe(404);
  const invalid = await write(port, token, "POST", "/api/v1/files/global/steps/newstep/validate", { text: "version: theway.step/v1\ndo: 3\n" });
  expect([invalid.status, invalid.json().ok]).toEqual([200, false]);
});

test("a project whose config does not load gives its items the error line and only a warning on a global save", async () => {
  const dir = twoProjects();
  put(join(dir, "projects", "q", "config.yaml"), "workflow: [\n");
  const { port, token } = await start(dir);
  const list = (await get(port, "/api/v1/files")).json() as { workflows: Item[] };
  const own = list.workflows.find((w) => w.key === "q") as Item;
  expect(typeof own.error).toBe("string");
  expect(own.error?.startsWith("theway: ")).toBe(true);
  expect([own.description, own.default]).toEqual([null, false]);
  expect(list.workflows.filter((w) => w.scope === "global").every((w) => w.error === null)).toBe(true);

  const path = join(dir, "workflows", "agents.yaml");
  const text = shipped("workflows/agents.yaml").replace("  - review:\n", "  - review: {rounds: 2}\n");
  const res = await write(port, token, "PUT", "/api/v1/files/global/workflows/agents", { text, base: sha(path) });
  expect(res.status).toBe(200);
  const check = await write(port, token, "POST", "/api/v1/files/global/workflows/agents/validate", { text });
  expect((check.json().warnings as string[]).some((l) => l === `q: ${own.error}`)).toBe(true);
});

test("the file write routes refuse a missing or wrong guard, a non-JSON or oversized body, bad params and bad bodies, and write nothing", async () => {
  const dir = twoProjects();
  const { port, token } = await start(dir);
  const before = tree(dir);
  const origin = `http://127.0.0.1:${port}`;
  const routes: [string, string][] = [
    ["POST", "/api/v1/files/global/steps/review/validate"],
    ["POST", "/api/v1/files/projects/p/steps/review/validate"],
    ["PUT", "/api/v1/files/global/steps/review"],
    ["PUT", "/api/v1/files/projects/p/steps/review"],
  ];
  const body = JSON.stringify({ text: "x", base: null });
  for (const [method, path] of routes) {
    for (const headers of <Record<string, string>[]>[
      { Origin: origin, "Content-Type": "application/json" },
      { Origin: origin, "X-Theway-Token": "0".repeat(64), "Content-Type": "application/json" },
      { Origin: "http://evil.example", "X-Theway-Token": token, "Content-Type": "application/json" },
      { "X-Theway-Token": token, "Content-Type": "application/json" },
    ]) {
      const res = await send(port, method, path, headers, body);
      expect([method, path, res.status]).toEqual([method, path, 403]);
    }
    const text = await send(port, method, path, { Origin: origin, "X-Theway-Token": token, "Content-Type": "text/plain" }, body);
    expect([method, path, text.status]).toEqual([method, path, 415]);
    const big = await send(port, method, path, allowed(port, token), Buffer.alloc(1048577, 32));
    expect([method, path, big.status]).toEqual([method, path, 413]);
    const long = await write(port, token, method, path, { text: "#".repeat(262145), base: null });
    expect([method, path, long.status, long.json()]).toEqual([method, path, 413, { error: "too large" }]);

    const invalidJson = await send(port, method, path, allowed(port, token), "{nope");
    expect([method, path, invalidJson.status, invalidJson.json()]).toEqual([method, path, 400, { error: "invalid JSON" }]);
    for (const b of [{}, { text: 1 }, [], "text"]) {
      const res = await write(port, token, method, path, b);
      expect([method, path, res.status, res.json()]).toEqual([method, path, 400, { error: "text must be a string" }]);
    }
    if (method === "PUT") {
      for (const b of [{ text: "x", base: "abc" }, { text: "x" }]) {
        const res = await write(port, token, method, path, b);
        expect([method, path, res.status, res.json()]).toEqual([method, path, 400, { error: "base must be a sha256 or null" }]);
      }
    }
  }
  for (const method of ["POST", "PUT"]) {
    const suffix = method === "POST" ? "/validate" : "";
    for (const path of [
      "/api/v1/files/global/prompts/fix",
      "/api/v1/files/global/steps/..%2Fx",
      "/api/v1/files/global/steps/gate",
      "/api/v1/files/projects/a.b/steps/review",
      "/api/v1/files/projects/p/prompts/fix",
    ]) {
      const res = await write(port, token, method, `${path}${suffix}`, { text: PROBE, base: null });
      expect([method, path, res.status]).toEqual([method, path, 400]);
    }
    const unknown = await write(port, token, method, `/api/v1/files/projects/zz/steps/review${suffix}`, { text: PROBE, base: null });
    expect([method, unknown.status, unknown.json()]).toEqual([method, 404, { error: "unknown project" }]);
  }
  expect(tree(dir)).toEqual(before);
});
