import { afterEach, expect, test } from "bun:test";
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rowsOf, seriesStatus } from "../src/dashboard/client/lib/series";
import type { ActiveChange } from "../src/dashboard/types";

const ROOT = join(import.meta.dirname, "..");
const CLI = join(ROOT, "dist", "theway.js");
const SHIPPED_HOME = join(ROOT, "plugin", "home");
const CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const PORT_ERROR = (v: string) => `error: option '--port <n>' argument '${v}' is invalid. must be an integer from 0 to 65535\n`;

const homes: string[] = [];
const servers: ChildProcess[] = [];

function home(): string {
  const dir = mkdtempSync(join(tmpdir(), "theway-dashboard-"));
  homes.push(dir);
  return dir;
}

function put(path: string, text: string): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text);
}

afterEach(() => {
  for (const s of servers.splice(0)) s.kill("SIGTERM");
  for (const d of homes.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** Starts `theway dashboard` on `dir` and resolves to its port once it prints its startup line. */
function start(dir: string, port = "0"): Promise<{ port: number; proc: ChildProcess; line: string }> {
  const proc = spawn("node", [CLI, "dashboard", "--port", port], { env: { ...process.env, THEWAY_HOME: dir }, stdio: ["ignore", "pipe", "pipe"] });
  servers.push(proc);
  return new Promise((resolve, reject) => {
    let out = "";
    let err = "";
    proc.stdout?.on("data", (b: Buffer) => {
      out += b.toString();
      const m = /^theway dashboard: http:\/\/127\.0\.0\.1:([0-9]+)\/\n$/.exec(out);
      if (m !== null) resolve({ port: Number(m[1]), proc, line: out });
    });
    proc.stderr?.on("data", (b: Buffer) => {
      err += b.toString();
    });
    proc.on("exit", (code) => reject(new Error(`dashboard exited ${code}: ${err}`)));
  });
}

type Res = { status: number; headers: Record<string, string | string[] | undefined>; body: string };

/** One HTTP request to the server, with the `Host` header given or the server's own. */
function get(port: number, path: string, opts: { method?: string; host?: string } = {}): Promise<Res> {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: "127.0.0.1", port, path, method: opts.method ?? "GET", headers: { Host: opts.host ?? `127.0.0.1:${port}`, Connection: "close" } },
      (res) => {
        let body = "";
        res.setEncoding("utf-8");
        res.on("data", (c: string) => {
          body += c;
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

const json = async (port: number, path: string) => {
  const res = await get(port, path);
  return { status: res.status, body: JSON.parse(res.body), type: res.headers["content-type"] };
};

/** A home with two projects: series members, a standalone change, archived folders and a script in a tasks file. */
function changesHome(): string {
  const dir = home();
  const a = join(dir, "projects", "-Users-me-alpha", "changes");
  put(join(a, "add-feed-01", "spec.md"), "# Spec\n");
  put(join(a, "add-feed-01", "tasks.md"), "- [x] 1. a\n- [x] 2. b\n");
  put(join(a, "add-feed-01", "notes.md"), "notes\n");
  put(join(a, "add-feed-01", "design.md"), "# Design\n");
  put(join(a, "add-feed-02", "tasks.md"), "- [x] 1. a\n- [ ] 2. b <script>alert(1)</script>\n- [ ] Not a task\n");
  put(join(a, "add-feed-03", "spec.md"), "# Spec\n");
  put(join(a, "fix-typo", "tasks.md"), "- [ ] 1. a\n");
  put(join(a, "archive", "2026-01-10-add-old", "spec.md"), "# Old\n");
  put(join(a, "archive", "2026-03-01-add-newer", "tasks.md"), "- [x] 1. a\n");
  put(join(dir, "projects", "-Users-me-beta", "changes", "add-solo-01", "tasks.md"), "- [ ] 1. a\n");
  return dir;
}

test("dashboard prints its startup line and serves the page, the bundle and the stylesheet with the security headers", async () => {
  const { port, line } = await start(home());
  expect(line).toBe(`theway dashboard: http://127.0.0.1:${port}/\n`);
  const page = await get(port, "/");
  expect(page.status).toBe(200);
  expect(page.headers["content-type"]).toBe("text/html; charset=utf-8");
  expect(page.headers["content-security-policy"]).toBe(CSP);
  expect(page.headers["x-content-type-options"]).toBe("nosniff");
  expect(page.headers["referrer-policy"]).toBe("no-referrer");
  expect(page.headers["strict-transport-security"]).toBeUndefined();
  expect(page.body).toContain('<script type="module" src="/app.js"></script>');
  expect(page.body).not.toContain("<style");
  const js = await get(port, "/app.js");
  expect([js.status, js.headers["content-type"]]).toEqual([200, "text/javascript; charset=utf-8"]);
  expect(js.body.length).toBeGreaterThan(1000);
  // React's development build carries this warning text; the production build does not.
  expect(js.body).not.toContain("act(...)");
  const css = await get(port, "/app.css");
  expect([css.status, css.headers["content-type"]]).toEqual([200, "text/css; charset=utf-8"]);
  expect(css.body).toContain(".base-ui-disable-scrollbar");
  const api = await get(port, "/api/v1/projects");
  expect(api.headers["cache-control"]).toBe("no-store");
  expect(api.headers["content-security-policy"]).toBe(CSP);
  expect(page.headers["cache-control"]).toBeUndefined();
  expect(JSON.parse(api.body)).toEqual({ initial: null, projects: [] });
});

test("dashboard refuses a --port that is not an integer from 0 to 65535", () => {
  for (const v of ["70000", "abc", "-1", "1.5"]) {
    const res = spawnSync("node", [CLI, "dashboard", "--port", v], { encoding: "utf-8", env: { ...process.env, THEWAY_HOME: home() } });
    expect([res.status, res.stdout, res.stderr]).toEqual([1, "", PORT_ERROR(v)]);
  }
});

test("dashboard exits 1 when its port is in use", async () => {
  const dir = home();
  const { port } = await start(dir);
  const res = spawnSync("node", [CLI, "dashboard", "--port", String(port)], { encoding: "utf-8", env: { ...process.env, THEWAY_HOME: dir } });
  expect([res.status, res.stdout, res.stderr]).toEqual([1, "", `theway: port ${port} is in use; pass --port <n>\n`]);
});

test("dashboard exits 0 on SIGTERM", async () => {
  const { proc } = await start(home());
  const code = await new Promise((resolve) => {
    proc.removeAllListeners("exit");
    proc.on("exit", resolve);
    proc.kill("SIGTERM");
  });
  expect(code).toBe(0);
});

test("dashboard answers 403 to a request whose Host is not its own", async () => {
  const { port } = await start(home());
  for (const host of [`evil.example:${port}`, "127.0.0.1", `localhost:${port + 1}`]) {
    const res = await get(port, "/api/v1/projects", { host });
    expect([res.status, JSON.parse(res.body)]).toEqual([403, { error: "forbidden host" }]);
    expect(res.headers["content-security-policy"]).toBe(CSP);
  }
  expect((await get(port, "/", { host: `localhost:${port}` })).status).toBe(200);
});

test("dashboard lists projects and changes with series, statuses and the counts of theway list", async () => {
  const dir = changesHome();
  const { port } = await start(dir);
  const projects = await json(port, "/api/v1/projects");
  expect(projects.type).toBe("application/json; charset=utf-8");
  expect(projects.body).toEqual({
    initial: "-Users-me-alpha",
    projects: [
      { key: "-Users-me-alpha", label: "alpha", active: 4, archived: 2 },
      { key: "-Users-me-beta", label: "beta", active: 1, archived: 0 },
    ],
  });
  const changes = await json(port, "/api/v1/projects/-Users-me-alpha/changes");
  expect(changes.status).toBe(200);
  expect(changes.body).toEqual({
    active: [
      { id: "add-feed-01", files: 4, tasks: { done: 2, total: 2 }, status: "Ready to archive", series: { id: "add-feed", ordinal: 1 } },
      { id: "add-feed-02", files: 1, tasks: { done: 1, total: 2 }, status: "In progress", series: { id: "add-feed", ordinal: 2 } },
      { id: "add-feed-03", files: 1, tasks: { done: 0, total: 0 }, status: "No tasks", series: { id: "add-feed", ordinal: 3 } },
      { id: "fix-typo", files: 1, tasks: { done: 0, total: 1 }, status: "Not started", series: null },
    ],
    archived: [
      { folder: "2026-03-01-add-newer", date: "2026-03-01", id: "add-newer" },
      { folder: "2026-01-10-add-old", date: "2026-01-10", id: "add-old" },
    ],
  });
  const list = spawnSync("node", [CLI, "list", "--project", "-Users-me-alpha"], { encoding: "utf-8", env: { ...process.env, THEWAY_HOME: dir } });
  for (const c of changes.body.active as ActiveChange[]) {
    expect(list.stdout).toContain(`  ${c.id.padEnd(20)} ${c.files} files   ${c.tasks.done}/${c.tasks.total} tasks done\n`);
  }
});

test("series status ignores members without tasks and is No tasks when every member has none", () => {
  expect(seriesStatus(["Ready to archive", "No tasks"])).toBe("Ready to archive");
  expect(seriesStatus(["Not started", "No tasks", "Not started"])).toBe("Not started");
  expect(seriesStatus(["Not started", "Ready to archive"])).toBe("In progress");
  expect(seriesStatus(["No tasks", "No tasks"])).toBe("No tasks");
  const change = (id: string, done: number, total: number, status: ActiveChange["status"]): ActiveChange => {
    const m = /^(.+)-([0-9]{2})$/.exec(id);
    return { id, files: 1, tasks: { done, total }, status, series: m === null ? null : { id: m[1] as string, ordinal: Number(m[2]) } };
  };
  const rows = rowsOf([
    change("add-a-01", 1, 1, "Ready to archive"),
    change("add-a-02", 0, 0, "No tasks"),
    change("add-b-01", 0, 0, "No tasks"),
    change("add-b-02", 0, 0, "No tasks"),
    change("add-c-01", 0, 2, "Not started"),
    change("fix-d", 1, 2, "In progress"),
  ]);
  expect(rows.map((r) => [r.kind, r.id, r.status])).toEqual([
    ["change", "fix-d", "In progress"],
    ["change", "add-c-01", "Not started"],
    ["series", "add-b", "No tasks"],
    ["series", "add-a", "Ready to archive"],
  ]);
});

test("dashboard renders a change's files spec first with raw HTML escaped, and an archived change", async () => {
  const { port } = await start(changesHome());
  const one = await json(port, "/api/v1/projects/-Users-me-alpha/changes/add-feed-01");
  expect(one.status).toBe(200);
  expect(one.body.id).toBe("add-feed-01");
  expect(one.body.archived).toBe(false);
  expect(one.body.tasks).toEqual({ done: 2, total: 2 });
  expect(one.body.files.map((f: { name: string }) => f.name)).toEqual(["spec.md", "tasks.md", "design.md", "notes.md"]);
  expect(one.body.files[0].html).toBe("<h1>Spec</h1>\n");
  const two = await json(port, "/api/v1/projects/-Users-me-alpha/changes/add-feed-02");
  const tasks = two.body.files[0].html as string;
  expect(tasks).toContain("&lt;script>alert(1)&lt;/script>");
  expect(tasks).not.toContain("<script");
  const old = await json(port, "/api/v1/projects/-Users-me-alpha/archive/2026-03-01-add-newer");
  expect(old.status).toBe(200);
  expect([old.body.id, old.body.archived, old.body.tasks]).toEqual(["add-newer", true, { done: 1, total: 1 }]);
  expect(old.body.files.map((f: { name: string }) => f.name)).toEqual(["tasks.md"]);
});

test("dashboard answers 400 to invalid inputs and 404 to unknown ones, POST on a GET route included", async () => {
  const { port } = await start(changesHome());
  for (const path of [
    "/api/v1/projects/a%2Fb/changes",
    "/api/v1/projects/-Users-me-alpha/changes/..%2Fx",
    "/api/v1/projects/-Users-me-alpha/archive/add-old",
    "/api/v1/projects/-Users-me-alpha/changes/%E0%A4%A",
    "/api/v1/projects/%E0%A4%A/workflows",
    "/api/v1/projects/nope/changes/..%2Fx",
    "/api/v1/projects/nope/archive/add-old",
  ]) {
    const res = await json(port, path);
    expect([path, res.status, typeof res.body.error]).toEqual([path, 400, "string"]);
  }
  for (const path of [
    "/api/v1/projects/nope/changes",
    "/api/v1/projects/-Users-me-alpha/changes/add-none",
    "/api/v1/projects/-Users-me-alpha/changes/archive",
    "/api/v1/projects/-Users-me-alpha/archive/2026-01-01-add-none",
    "/api/v1/nothing",
    "/index.html",
  ]) {
    const res = await json(port, path);
    expect([path, res.status, typeof res.body.error]).toEqual([path, 404, "string"]);
  }
  for (const path of ["/api/v1/projects", "/"]) {
    const res = await get(port, path, { method: "POST" });
    expect([path, res.status]).toEqual([path, 404]);
  }
});

/** A home holding the shipped config, convention standards, workflows, steps and prompts, and a project `p`. */
function shippedHome(): string {
  const dir = home();
  const shipped = (rel: string) => readFileSync(join(SHIPPED_HOME, rel), "utf-8");
  for (const rel of ["config.yaml", "standards/commits.md", "standards/git-host.md"]) put(join(dir, rel), shipped(rel));
  for (const folder of ["workflows", "steps", "prompts"]) {
    for (const f of readdirSync(join(SHIPPED_HOME, folder))) put(join(dir, folder, f), shipped(`${folder}/${f}`));
  }
  mkdirSync(join(dir, "projects", "p"), { recursive: true });
  return dir;
}

test("dashboard lists the shipped workflows with develop as default, and a broken project workflow with its error", async () => {
  const dir = shippedHome();
  const { port } = await start(dir);
  const res = await json(port, "/api/v1/projects/p/workflows");
  expect(res.status).toBe(200);
  expect(res.body.defaultName).toBe("develop");
  expect(res.body.defaultError).toBeNull();
  expect(res.body.warnings).toEqual([]);
  const names = res.body.workflows.map((w: { name: string }) => w.name);
  expect(names).toEqual(["agents", "develop", "engineering", "engineering-light"]);
  const develop = res.body.workflows[1];
  expect(develop).toEqual({
    name: "develop",
    origin: "global",
    file: join(dir, "workflows", "develop.yaml"),
    description: "The tasks done inline in your session, on the working tree, nothing committed",
    input: "changes",
    pushes: false,
    default: true,
  });
  expect(res.body.workflows[0].pushes).toBe(true);

  put(join(dir, "projects", "p", "workflows", "broken.yaml"), "version: theway.workflow/v1\nsteps: 3\n");
  put(join(dir, "projects", "p", "workflows", "Bad_Name.yaml"), "version: theway.workflow/v1\n");
  const broken = await json(port, "/api/v1/projects/p/workflows");
  const items = broken.body.workflows as { name: string; origin: string; error?: string; input?: string }[];
  expect(items.map((w) => w.name)).toEqual(["agents", "broken", "develop", "engineering", "engineering-light"]);
  expect(items[1]).toEqual({
    name: "broken",
    origin: "project",
    file: join(dir, "projects", "p", "workflows", "broken.yaml"),
    error: "theway: projects/p/workflows/broken.yaml: steps must be a non-empty list",
  });
  for (const w of items.filter((i) => i.name !== "broken")) expect([w.name, w.error, typeof w.input]).toEqual([w.name, undefined, "string"]);
  expect(broken.body.warnings).toEqual([{ file: "projects/p/workflows/Bad_Name.yaml", text: "not a valid workflow name" }]);

  rmSync(join(dir, "config.yaml"));
  const missing = await json(port, "/api/v1/projects/p/workflows");
  expect(missing.status).toBe(200);
  expect(missing.body.error).toStartWith("theway: config.yaml not found in ");
  expect(missing.body.workflows).toEqual([]);
});

/** The packages the dashboard pins, each an exact devDependencies entry. */
const PINS: Record<string, string> = {
  react: "19.3.1",
  "react-dom": "19.3.1",
  "@types/react": "19.3.0",
  "@types/react-dom": "19.3.0",
  "@base-ui/react": "1.9.0",
  cn: "0.5.0",
  "class-variance-authority": "0.7.1",
  "lucide-react": "1.61.0",
  "tw-animate-css": "1.4.0",
  shadcn: "4.22.1",
  tailwindcss: "4.3.3",
  "@tailwindcss/cli": "4.3.3",
  marked: "18.1.1",
  hono: "4.13.13",
  "@hono/node-server": "2.1.5",
  wouter: "3.13.0",
  "@tanstack/react-query": "5.104.5",
};

test("package.json has no dependencies and pins every dashboard package exactly", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
  expect(pkg.dependencies).toBeUndefined();
  for (const [name, version] of Object.entries(PINS)) expect([name, pkg.devDependencies[name]]).toEqual([name, version]);
});

test("the client uses no cmdk and wraps the app in CSPProvider disableStyleElements and TooltipProvider", () => {
  const client = join(ROOT, "src", "dashboard", "client");
  const files = (readdirSync(client, { recursive: true }) as string[]).filter((f) => /\.tsx?$/.test(f));
  expect(files.length).toBeGreaterThan(0);
  for (const f of files) expect([f, /from "cmdk"|components\/ui\/command/.test(readFileSync(join(client, f), "utf-8"))]).toEqual([f, false]);
  const app = readFileSync(join(client, "app.tsx"), "utf-8");
  expect(app).toContain("<CSPProvider disableStyleElements>");
  expect(app).toContain("<TooltipProvider>");
  for (const ui of ["button", "badge", "tabs", "table", "dialog", "alert-dialog", "select", "input", "label", "checkbox", "textarea", "dropdown-menu", "tooltip", "separator", "scroll-area", "sidebar", "progress", "alert"]) {
    expect(files).toContain(join("components", "ui", `${ui}.tsx`));
  }
});
