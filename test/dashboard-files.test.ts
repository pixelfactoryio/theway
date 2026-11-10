import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tildePath } from "../src/dashboard/api";
import { historyDir, snapshot } from "../src/dashboard/history";
import { CLI, cleanup, SHIPPED_HOME, put, send, shippedHome, start } from "./dashboard-helpers";

afterEach(cleanup);

const allowed = (port: number, token: string) => ({ Origin: `http://127.0.0.1:${port}`, "X-Theway-Token": token, "Content-Type": "application/json" });
const write = (port: number, token: string, method: string, path: string, body?: unknown) =>
  send(port, method, path, allowed(port, token), body === undefined ? undefined : JSON.stringify(body));
const get = (port: number, path: string) => send(port, "GET", path, {});
const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const cli = (dir: string, ...args: string[]) => spawnSync("node", [CLI, ...args], { env: { ...process.env, THEWAY_HOME: dir }, encoding: "utf-8" });
const fixture = (rel: string) => readFileSync(join(SHIPPED_HOME, rel), "utf-8");
/** Every file under `dir`, relative, sorted. */
const tree = (dir: string) => (readdirSync(dir, { recursive: true }) as string[]).sort();

/** A prompt no workflow uses, with one optional input. */
const PROBE = "---\ndescription: Probe\ninputs:\n  x:\n    description: X\n    required: false\n---\n\nProbe ${{ inputs.x }}.\n";
/** The fixture's review prompt with its `lens` input dropped. */
const REVIEW_NO_LENS = fixture("prompts/review.md").replace("  lens:\n    description: The lens file's path\n    required: true\n", "");
/** The fixture's agents workflow with `tries: 0` on its triage step. */
const AGENTS_TRIES_0 = fixture("workflows/agents.yaml").replace("    tries: 1\n", "    tries: 0\n");

/** A prompt's file detail, as the tests read it. */
type PromptDetail = {
  kind: string;
  step: boolean;
  text: string;
  overrides: boolean;
  resolved: { header: { inputs: Record<string, unknown> } | null; headerErrors: string[]; html: string };
  usedBy: { name: string; use: string; step: number }[];
};
const prompt = async (port: number, path: string) => (await get(port, path)).json() as unknown as PromptDetail;

type Item = { scope: string; key: string | null; label: string | null; kind: string; name: string; path: string; description: string | null };
type WorkflowItem = Item & { default: boolean; error: string | null };
type PromptItem = Item & { step: boolean };

/** A shipped home with projects `p` and `q`, `q` holding its own workflow `own`. */
function twoProjects(): string {
  const dir = shippedHome();
  put(join(dir, "projects", "q", "workflows", "own.yaml"), "version: theway.workflow/v1beta\ndescription: Own\nruns-on: session\nsteps:\n  - uses: prompts/implement.md\n    with:\n      change: x\n");
  return dir;
}

/** The step prompts of the fixture home, as `listPromptFiles` gives them. */
const STEP_PROMPTS = ["branch", "ci", "fix-ci", "fix-review", "fix-spec", "implement", "open-pr", "review", "scaffold", "scaffold-light", "spec-review", "spec-triage", "triage"];

test("tildePath shows a path under the user's home with ~, and any other path as given", () => {
  expect(tildePath("/home/me/.theway", "/home/me")).toBe("~/.theway");
  expect(tildePath("/home/me", "/home/me")).toBe("~");
  expect(tildePath("/home/meta/.theway", "/home/me")).toBe("/home/meta/.theway");
  expect(tildePath("/srv/theway", "/home/me")).toBe("/srv/theway");
  expect(tildePath("/srv/theway", "/")).toBe("/srv/theway");
});

test("GET /api/v1/files lists every project, the global workflows and prompts, then each project's own, with absolute paths", async () => {
  const dir = twoProjects();
  put(join(dir, "workflows", "agents.default.yaml"), fixture("workflows/agents.yaml"));
  put(join(dir, "prompts", "review.default.md"), fixture("prompts/review.md"));
  put(join(dir, "projects", "q", "prompts", "mine.md"), "Notes.\n");
  const { port } = await start(dir);
  const res = await get(port, "/api/v1/files");
  expect(res.status).toBe(200);
  const body = res.json() as { projects: unknown[]; workflows: WorkflowItem[]; prompts: PromptItem[]; steps?: unknown };
  expect(body.steps).toBeUndefined();
  expect((body as { home?: unknown }).home).toBe(tildePath(dir));
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
  const global = body.prompts.filter((p) => p.scope === "global");
  expect(global.map((p) => p.name)).toEqual(readdirSync(join(SHIPPED_HOME, "prompts")).map((f) => f.slice(0, -".md".length)).sort());
  expect(global.filter((p) => p.step).map((p) => p.name)).toEqual(STEP_PROMPTS);
  for (const p of global) expect([p.name, p.description === null]).toEqual([p.name, !STEP_PROMPTS.includes(p.name)]);
  expect(body.prompts.find((p) => p.name === "triage")).toEqual({
    scope: "global",
    key: null,
    label: null,
    kind: "prompts",
    name: "triage",
    path: join(dir, "prompts", "triage.md"),
    description: "Judge the reviewers' findings, or check the fix of the confirmed ones",
    step: true,
  });
  expect(body.prompts.filter((p) => p.scope === "project")).toEqual([
    { scope: "project", key: "q", label: "q", kind: "prompts", name: "mine", path: join(dir, "projects", "q", "prompts", "mine.md"), description: null, step: false },
  ]);
  for (const item of [...body.workflows, ...body.prompts]) {
    expect(item.path.startsWith("/")).toBe(true);
    expect(item.path.includes(".default.")).toBe(false);
  }
});

test("a v1 workflow file is listed with the error that it is no longer read", async () => {
  const dir = shippedHome();
  put(join(dir, "workflows", "old.yaml"), "version: theway.workflow/v1\nsteps:\n  - implement:\n");
  const { port } = await start(dir);
  const old = ((await get(port, "/api/v1/files")).json().workflows as WorkflowItem[]).find((w) => w.name === "old");
  expect(old?.error).toBe("workflows/old.yaml: theway.workflow/v1 is no longer read: rewrite it as theway.workflow/v1beta");
  const detail = (await get(port, "/api/v1/files/global/workflows/old")).json();
  expect(detail.resolved).toEqual({ errors: [old?.error] });
});

test("a workflow's detail gives its text, sha256, resolved document, the projects overriding it, and no use", async () => {
  const dir = twoProjects();
  const { port } = await start(dir);
  const res = await get(port, "/api/v1/files/global/workflows/agents");
  expect(res.status).toBe(200);
  const body = res.json();
  const path = join(dir, "workflows", "agents.yaml");
  expect([body.text, body.sha256, body.path, body.overrides, body.overriddenBy, body.usedBy]).toEqual([fixture("workflows/agents.yaml"), sha(path), path, false, [], []]);
  const doc = (body.resolved as { doc: { steps: { uses: string }[]; resolved: boolean } }).doc;
  expect(doc.steps.length).toBe(6);
  expect(doc.steps.map((s) => s.uses)).toEqual(["branch", "implement", "review", "triage", "open-pr", "ci"].map((n) => `prompts/${n}.md`));

  put(join(dir, "projects", "q", "workflows", "agents.yaml"), fixture("workflows/agents.yaml"));
  expect((await get(port, "/api/v1/files/global/workflows/agents")).json().overriddenBy).toEqual([{ key: "q", label: "q" }]);
  const own = (await get(port, "/api/v1/files/projects/q/workflows/agents")).json();
  expect([own.scope, own.key, own.overrides, own.overriddenBy, own.usedBy]).toEqual(["project", "q", true, [], []]);
  expect((own.resolved as { doc: { file: string } }).doc.file).toBe(join(dir, "projects", "q", "workflows", "agents.yaml"));

  for (const [p, status] of [
    ["/api/v1/files/global/workflows/nope", 404],
    ["/api/v1/files/global/prompts/nope", 404],
    ["/api/v1/files/projects/p/workflows/agents", 404],
    ["/api/v1/files/projects/zz/workflows/agents", 404],
    ["/api/v1/files/global/steps/review", 400],
    ["/api/v1/files/global/prompts/..%2Fx", 400],
    ["/api/v1/files/projects/a.b/prompts/review", 400],
  ] as const) {
    expect([p, (await get(port, p)).status]).toEqual([p, status]);
  }
});

test("a prompt's detail gives its header, header errors, rendered body, and every use by step, on-fail and value", async () => {
  const dir = twoProjects();
  const { port } = await start(dir);
  const triage = await prompt(port, "/api/v1/files/global/prompts/triage");
  expect(triage.resolved.header).toEqual({
    description: "Judge the reviewers' findings, or check the fix of the confirmed ones",
    model: "opus",
    inputs: { change: { description: "The change ID", required: true, default: null } },
  });
  expect(triage.resolved.headerErrors).toEqual([]);
  expect(triage.resolved.html).toContain("<h1>Triage</h1>");
  expect(triage.usedBy).toEqual([{ scope: "global", key: null, label: null, name: "agents", use: "step", step: 4 }]);
  expect([triage.kind, triage.step, triage.text]).toEqual(["prompts", true, fixture("prompts/triage.md")]);

  const fix = await prompt(port, "/api/v1/files/global/prompts/fix-review");
  expect(fix.usedBy).toEqual([{ scope: "global", key: null, label: null, name: "agents", use: "on-fail", step: 4 }]);
  const conformance = await prompt(port, "/api/v1/files/global/prompts/conformance");
  expect([conformance.resolved.header, conformance.resolved.headerErrors, conformance.step]).toEqual([null, [], false]);
  expect(conformance.resolved.html).toContain("<h1>Conformance</h1>");
  expect(conformance.usedBy).toEqual([{ scope: "global", key: null, label: null, name: "agents", use: "value", step: 3 }]);
  const specReview = await prompt(port, "/api/v1/files/global/prompts/spec-review");
  expect(specReview.usedBy.map((u: { name: string; use: string; step: number }) => [u.name, u.use, u.step])).toEqual([
    ["engineering", "step", 2],
    ["engineering-light", "step", 2],
  ]);

  // A prompt named twice by one step: one item per kind of use, `step` before `value`.
  put(join(dir, "projects", "p", "workflows", "mine.yaml"), "version: theway.workflow/v1beta\ndescription: Mine\nruns-on: session\nsteps:\n  - uses: prompts/review.md\n    with:\n      change: x\n      lens: prompts/review.md\n");
  const review = await prompt(port, "/api/v1/files/global/prompts/review");
  expect(review.usedBy).toEqual([
    { scope: "global", key: null, label: null, name: "agents", use: "step", step: 3 },
    { scope: "project", key: "p", label: "p", name: "mine", use: "step", step: 1 },
    { scope: "project", key: "p", label: "p", name: "mine", use: "value", step: 1 },
  ]);
  // A project with its own review prompt: its workflows use that one.
  put(join(dir, "projects", "p", "prompts", "review.md"), fixture("prompts/review.md"));
  expect((await get(port, "/api/v1/files/global/prompts/review")).json().usedBy).toEqual([{ scope: "global", key: null, label: null, name: "agents", use: "step", step: 3 }]);
  const own = await prompt(port, "/api/v1/files/projects/p/prompts/review");
  expect([own.overrides, own.usedBy.map((u: { name: string; use: string }) => [u.name, u.use])]).toEqual([
    true,
    [
      ["agents", "step"],
      ["mine", "step"],
      ["mine", "value"],
    ],
  ]);
});

test("a prompt body's raw HTML comes back escaped", async () => {
  const dir = shippedHome();
  put(join(dir, "prompts", "probe.md"), "# Probe\n\n<script>alert(1)</script>\n");
  const { port } = await start(dir);
  const { html } = (await prompt(port, "/api/v1/files/global/prompts/probe")).resolved;
  expect(html).toContain("&lt;script>alert(1)&lt;/script>");
  expect(html).not.toContain("<script");
});

test("validate checks a prompt through every workflow that uses it, and a workflow through the resolver", async () => {
  const dir = twoProjects();
  const { port, token } = await start(dir);
  const review = await write(port, token, "POST", "/api/v1/files/global/prompts/review/validate", { text: REVIEW_NO_LENS });
  const body = review.json() as { ok: boolean; errors: string[] };
  expect([review.status, body.ok]).toEqual([200, false]);
  expect(body.errors.some((l) => l.includes("workflows/agents.yaml") && l.includes("steps[2]"))).toBe(true);
  // A project line the same as a global one is not repeated.
  expect(body.errors.every((l) => !l.startsWith("p: ") && !l.startsWith("q: "))).toBe(true);
  for (const name of ["tamm-framework", "unused"]) {
    const res = await write(port, token, "POST", `/api/v1/files/global/prompts/${name}/validate`, { text: REVIEW_NO_LENS });
    expect([name, res.status, res.json()]).toEqual([name, 200, { ok: true, errors: [], warnings: [] }]);
  }
  // A prompt only used as a value is not under the header rules.
  const value = await write(port, token, "POST", "/api/v1/files/global/prompts/conformance/validate", { text: "---\ndescription: 3\nnope: 1\n---\n" });
  expect(value.json().ok).toBe(true);

  const agents = await write(port, token, "POST", "/api/v1/files/global/workflows/agents/validate", { text: AGENTS_TRIES_0 });
  expect(agents.json().ok).toBe(false);
  expect((agents.json().errors as string[]).some((l) => l.startsWith("workflows/agents.yaml: steps[3].tries"))).toBe(true);
});

test("a global prompt that breaks a project's own workflow gets that project's line", async () => {
  const dir = twoProjects();
  put(join(dir, "prompts", "probe.md"), PROBE);
  put(join(dir, "projects", "q", "workflows", "qflow.yaml"), "version: theway.workflow/v1beta\ndescription: Q\nruns-on: session\nsteps:\n  - uses: prompts/probe.md\n    with:\n      x: y\n");
  const { port, token } = await start(dir);
  const probe = join(dir, "prompts", "probe.md");
  const res = await write(port, token, "PUT", "/api/v1/files/global/prompts/probe", { text: "---\ndescription: Probe\n---\n\nProbe.\n", base: sha(probe) });
  expect(res.status).toBe(422);
  expect(res.json().errors).toEqual(["q: workflows/qflow.yaml: steps[0].with: prompts/probe.md declares no input x"]);
  expect(readFileSync(probe, "utf-8")).toBe(PROBE);
});

test("a global save writes the global file in place, the CLI sees it, and a stale or null base gets 409", async () => {
  const dir = twoProjects();
  const { port, token } = await start(dir);
  const path = join(dir, "workflows", "agents.yaml");
  const projectsBefore = tree(join(dir, "projects"));
  const text = fixture("workflows/agents.yaml").replace("    tries: 1\n", "    tries: 3\n");
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
  expect(JSON.parse(out.stdout).steps[3].tries).toBe(3);
});

test("a prompt save writes the .md file, keeps its version as .md, and a stale base gets 409", async () => {
  const dir = twoProjects();
  const { port, token } = await start(dir);
  const path = join(dir, "prompts", "review.md");
  const before = readFileSync(path, "utf-8");
  const text = before.replace("Review the change's diff through one lens", "Review the diff through one lens");
  const res = await write(port, token, "PUT", "/api/v1/files/global/prompts/review", { text, base: sha(path) });
  expect([res.status, res.json()]).toEqual([200, { path, sha256: createHash("sha256").update(text).digest("hex") }]);
  expect(readFileSync(path, "utf-8")).toBe(text);
  const history = join(dir, "history", "global", "prompts", "review");
  const versions = readdirSync(history);
  expect(versions.length).toBe(1);
  expect(versions[0]?.endsWith(".md")).toBe(true);
  expect(readFileSync(join(history, versions[0] as string), "utf-8")).toBe(before);
  const stale = await write(port, token, "PUT", "/api/v1/files/global/prompts/review", { text: before, base: "b".repeat(64) });
  expect([stale.status, stale.json()]).toEqual([409, { error: "changed on disk" }]);
});

test("a save that breaks its workflow gets 422 with its line and writes nothing", async () => {
  const dir = twoProjects();
  const { port, token } = await start(dir);
  const path = join(dir, "workflows", "agents.yaml");
  const base = sha(path);
  const res = await write(port, token, "PUT", "/api/v1/files/global/workflows/agents", { text: AGENTS_TRIES_0, base });
  expect(res.status).toBe(422);
  const errors = res.json().errors as string[];
  expect(errors).toEqual(["workflows/agents.yaml: steps[3].tries: must be an integer from 1 to 10"]);
  expect(sha(path)).toBe(base);
});

test("a project save with base null creates the project file and leaves the global one byte-identical", async () => {
  const dir = twoProjects();
  const { port, token } = await start(dir);
  const global = join(dir, "workflows", "agents.yaml");
  const before = sha(global);
  const text = fixture("workflows/agents.yaml").replace("    tries: 1\n", "    tries: 2\n");
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
  const res = await write(port, token, "POST", "/api/v1/files/global/prompts/newprompt/validate", { text: PROBE });
  expect([res.status, res.json().ok]).toEqual([200, true]);
  expect(existsSync(join(dir, "prompts", "newprompt.md"))).toBe(false);
  expect((await get(port, "/api/v1/files/global/prompts/newprompt")).status).toBe(404);
  const invalid = await write(port, token, "POST", "/api/v1/files/global/workflows/newflow/validate", { text: "version: theway.workflow/v1beta\nsteps: 3\n" });
  expect([invalid.status, invalid.json().ok]).toEqual([200, false]);
});

test("the file write routes refuse a missing or wrong guard, a non-JSON or oversized body, bad params and bad bodies, and write nothing", async () => {
  const dir = twoProjects();
  const { port, token } = await start(dir);
  const before = tree(dir);
  const origin = `http://127.0.0.1:${port}`;
  const routes: [string, string][] = [
    ["POST", "/api/v1/files/global/prompts/review/validate"],
    ["POST", "/api/v1/files/projects/p/prompts/review/validate"],
    ["PUT", "/api/v1/files/global/prompts/review"],
    ["PUT", "/api/v1/files/projects/p/prompts/review"],
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
      "/api/v1/files/global/steps/review",
      "/api/v1/files/global/prompts/..%2Fx",
      "/api/v1/files/global/workflows/Bad",
      "/api/v1/files/projects/a.b/prompts/review",
      "/api/v1/files/projects/p/steps/review",
    ]) {
      const res = await write(port, token, method, `${path}${suffix}`, { text: PROBE, base: null });
      expect([method, path, res.status]).toEqual([method, path, 400]);
    }
    const unknown = await write(port, token, method, `/api/v1/files/projects/zz/prompts/review${suffix}`, { text: PROBE, base: null });
    expect([method, unknown.status, unknown.json()]).toEqual([method, 404, { error: "unknown project" }]);
  }
  expect(tree(dir)).toEqual(before);
});

// ---- Versions ----

const AGENTS = "/api/v1/files/global/workflows/agents";
/** The fixture's agents workflow with `tries: n` on its ci step. */
const rounds = (n: number) => fixture("workflows/agents.yaml").replace("    tries: 2\n", `    tries: ${(n % 10) + 1}\n    # ${n}\n`);
/** The texts of the versions in `dir`, oldest first. */
const versionTexts = (dir: string) => (readdirSync(dir).sort() as string[]).map((f) => readFileSync(join(dir, f), "utf-8"));
/** Saves `text` over the file at `path` through `route`. */
const saveText = (port: number, token: string, route: string, path: string, text: string) =>
  write(port, token, "PUT", route, { text, base: existsSync(path) ? sha(path) : null });

test("a dashboard save keeps the text it replaces, skips an unchanged text, keeps the newest 20 and none for a new file", async () => {
  const dir = shippedHome();
  const { port, token } = await start(dir);
  const path = join(dir, "workflows", "agents.yaml");
  const history = join(dir, "history", "global", "workflows", "agents");
  const original = readFileSync(path, "utf-8");

  for (const n of [1, 2]) expect((await saveText(port, token, AGENTS, path, rounds(n))).status).toBe(200);
  expect(versionTexts(history)).toEqual([original, rounds(1)]);
  for (const f of readdirSync(history)) {
    const id = f.slice(0, -".yaml".length);
    expect(id).toMatch(/^\d{8}T\d{9}Z-[0-9a-f]{12}$/);
    expect(id.endsWith(createHash("sha256").update(readFileSync(join(history, f))).digest("hex").slice(0, 12))).toBe(true);
  }

  // The same text again: nothing written, no version.
  expect((await saveText(port, token, AGENTS, path, rounds(2))).status).toBe(200);
  expect(readdirSync(history).length).toBe(2);

  for (let n = 3; n <= 22; n++) expect((await saveText(port, token, AGENTS, path, rounds(n))).status).toBe(200);
  // 22 saves of different texts: the original and the first 21 saves were replaced; the newest 20 are kept.
  expect(versionTexts(history)).toEqual(Array.from({ length: 20 }, (_, i) => rounds(i + 2)));

  const fresh = join(dir, "prompts", "probe.md");
  expect((await saveText(port, token, "/api/v1/files/global/prompts/probe", fresh, PROBE)).status).toBe(200);
  expect(existsSync(join(dir, "history", "global", "prompts", "probe"))).toBe(false);
});

test("a project save keeps its version under the project's history folder", async () => {
  const dir = twoProjects();
  const { port, token } = await start(dir);
  const path = join(dir, "projects", "q", "workflows", "own.yaml");
  const before = readFileSync(path, "utf-8");
  const res = await saveText(port, token, "/api/v1/files/projects/q/workflows/own", path, before.replace("description: Own", "description: Mine"));
  expect(res.status).toBe(200);
  expect(versionTexts(join(dir, "history", "projects", "q", "workflows", "own"))).toEqual([before]);
  expect(existsSync(join(dir, "history", "global"))).toBe(false);
});

test("two snapshots in the same millisecond get two names, the later one last; the same bytes again add none", () => {
  const dir = shippedHome();
  const target = { scope: "global", key: null, kind: "workflows", name: "agents" } as const;
  const path = join(dir, "workflows", "agents.yaml");
  const now = new Date("2026-11-09T14:30:12.123Z");
  snapshot(dir, target, path, now);
  snapshot(dir, target, path, now);
  put(path, rounds(1));
  snapshot(dir, target, path, now);
  const names = readdirSync(historyDir(dir, target)).sort();
  expect(names.length).toBe(2);
  expect(names.map((n) => n.slice(0, 19))).toEqual(["20261109T143012123Z", "20261109T143012124Z"]);
  expect(readFileSync(join(historyDir(dir, target), names[1] as string), "utf-8")).toBe(rounds(1));
});

test("the versions routes list a file's versions newest first, return their text and resolved form, and check the ID", async () => {
  const dir = twoProjects();
  const { port, token } = await start(dir);
  const path = join(dir, "workflows", "agents.yaml");
  const original = readFileSync(path, "utf-8");
  expect((await get(port, `${AGENTS}/versions`)).json()).toEqual({ versions: [], shipped: false });
  for (const n of [1, 2]) expect((await saveText(port, token, AGENTS, path, rounds(n))).status).toBe(200);

  const res = await get(port, `${AGENTS}/versions`);
  expect(res.status).toBe(200);
  const body = res.json() as { versions: { id: string; at: string }[]; shipped: boolean };
  expect(body.shipped).toBe(false);
  expect(body.versions.length).toBe(2);
  const [newer, older] = body.versions as [{ id: string; at: string }, { id: string; at: string }];
  expect(newer.id > older.id).toBe(true);
  const ts = newer.id.slice(0, 19);
  expect(newer.at).toBe(`${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(9, 11)}:${ts.slice(11, 13)}:${ts.slice(13, 15)}.${ts.slice(15, 18)}Z`);
  const old = (await get(port, `${AGENTS}/versions/${older.id}`)).json();
  expect(old.text).toBe(original);
  expect((old.resolved as { doc: { steps: unknown[] } }).doc.steps.length).toBe(6);
  const one = (await get(port, `${AGENTS}/versions/${newer.id}`)).json();
  expect(one.text).toBe(rounds(1));
  expect((one.resolved as { doc: { steps: { tries: number | null }[] } }).doc.steps[5]?.tries).toBe(2);

  for (const id of ["..%2Fx", "1-2", "SHIPPED", `${older.id}.yaml`]) expect([id, (await get(port, `${AGENTS}/versions/${id}`)).status]).toEqual([id, 400]);
  expect((await get(port, `${AGENTS}/versions/20200101T000000000Z-000000000000`)).status).toBe(404);
  expect((await get(port, `${AGENTS}/versions/shipped`)).status).toBe(404);
  for (const [p, status] of [
    ["/api/v1/files/global/steps/review/versions", 400],
    ["/api/v1/files/global/prompts/Bad/versions/shipped", 400],
    ["/api/v1/files/projects/a.b/workflows/own/versions", 400],
    ["/api/v1/files/projects/zz/workflows/own/versions", 404],
    ["/api/v1/files/projects/zz/workflows/own/versions/1-2", 400],
  ] as const) {
    expect([p, (await get(port, p)).status]).toEqual([p, status]);
  }

  put(join(dir, "workflows", "agents.default.yaml"), fixture("workflows/agents.yaml"));
  expect((await get(port, `${AGENTS}/versions`)).json().shipped).toBe(true);
  expect((await get(port, `${AGENTS}/versions/shipped`)).json().text).toBe(fixture("workflows/agents.yaml"));
  put(join(dir, "projects", "q", "workflows", "agents.default.yaml"), fixture("workflows/agents.yaml"));
  expect((await get(port, "/api/v1/files/projects/q/workflows/own/versions")).json()).toEqual({ versions: [], shipped: false });
  expect((await get(port, "/api/v1/files/projects/q/workflows/own/versions/shipped")).status).toBe(404);
});

test("a prompt version answers its text with its header, header errors and rendered body; .default.md is its shipped text", async () => {
  const dir = shippedHome();
  const { port, token } = await start(dir);
  const route = "/api/v1/files/global/prompts/review";
  const path = join(dir, "prompts", "review.md");
  const original = readFileSync(path, "utf-8");
  expect((await saveText(port, token, route, path, original.replace("# Review", "# Review again"))).status).toBe(200);
  const [version] = (await get(port, `${route}/versions`)).json().versions as { id: string }[];
  const body = (await get(port, `${route}/versions/${version?.id}`)).json() as unknown as { text: string } & Pick<PromptDetail, "resolved">;
  expect(body.text).toBe(original);
  expect(body.resolved.header?.inputs.lens).toEqual({ description: "The lens file's path", required: true, default: null });
  expect(body.resolved.headerErrors).toEqual([]);
  expect(body.resolved.html).toContain("<h1>Review</h1>");
  put(join(dir, "prompts", "review.default.md"), "Shipped.\n");
  const shippedVersion = (await get(port, `${route}/versions/shipped`)).json();
  expect(shippedVersion).toEqual({ text: "Shipped.\n", resolved: { header: null, headerErrors: [], html: "<p>Shipped.</p>\n" } });
});

test("a save whose version cannot be kept gets 500 and leaves the file unchanged", async () => {
  const dir = shippedHome();
  put(join(dir, "history", "global", "workflows", "agents"), "not a folder\n");
  const { port, token } = await start(dir);
  const path = join(dir, "workflows", "agents.yaml");
  const before = readFileSync(path, "utf-8");
  const res = await saveText(port, token, AGENTS, path, rounds(1));
  expect(res.status).toBe(500);
  expect(typeof res.json().error).toBe("string");
  expect(readFileSync(path, "utf-8")).toBe(before);
});
