import { afterEach, expect, test } from "bun:test";
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { folderOf, labels } from "../src/dashboard/api";
import { rowsOf } from "../src/dashboard/client/lib/series";
import { keyOf } from "../src/core/project";
import type { ActiveChange, SeriesProgress } from "../src/dashboard/types";

const ROOT = join(import.meta.dirname, "..");
const CLI = join(ROOT, "dist", "theway.js");
const SHIPPED_HOME = join(ROOT, "plugin", "home");
const CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
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
  expect(css.body).toContain("/fonts/inter.woff2");
  const api = await get(port, "/api/v1/changes");
  expect(api.headers["cache-control"]).toBe("no-store");
  expect(api.headers["content-security-policy"]).toBe(CSP);
  expect(page.headers["cache-control"]).toBeUndefined();
  expect(JSON.parse(api.body)).toEqual({ total: 0, projects: [] });
});

/** The bytes of one GET, with its headers. */
function bytes(port: number, path: string): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, headers: { Host: `127.0.0.1:${port}`, Connection: "close" } }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    req.end();
  });
}

test("dashboard serves its two fonts as woff2 from its own origin", async () => {
  const { port } = await start(home());
  for (const [path, file] of [
    ["/fonts/inter.woff2", "inter/files/inter-latin-wght-normal.woff2"],
    ["/fonts/jetbrains-mono.woff2", "jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2"],
  ] as const) {
    const res = await bytes(port, path);
    expect([path, res.status, res.headers["content-type"], res.headers["cache-control"]]).toEqual([path, 200, "font/woff2", "public, max-age=86400"]);
    expect(res.body.subarray(0, 4).toString("latin1")).toBe("wOF2");
    expect(res.body.equals(readFileSync(join(ROOT, "node_modules", "@fontsource-variable", file)))).toBe(true);
    expect(res.headers["content-security-policy"]).toBe(CSP);
  }
});

test("the build ships each font's licence in dist/licenses", () => {
  for (const [pkg, out] of [
    ["inter", "inter-OFL.txt"],
    ["jetbrains-mono", "jetbrains-mono-OFL.txt"],
  ]) {
    const license = readFileSync(join(ROOT, "node_modules", "@fontsource-variable", pkg as string, "LICENSE"), "utf-8");
    expect(readFileSync(join(ROOT, "dist", "licenses", out as string), "utf-8").startsWith(license)).toBe(true);
  }
});

test("the stylesheet holds the theme's tokens and no dark theme", () => {
  const css = readFileSync(join(ROOT, "src", "dashboard", "client", "styles", "globals.css"), "utf-8");
  expect(css).toContain("--primary: #4F46E5;");
  expect(css).toContain("--radius: 0.625rem;");
  expect(css.split("\n").some((l) => l.startsWith(".dark"))).toBe(false);
  expect(css).toContain("@custom-variant dark (&:is(.dark *));");
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
    const res = await get(port, "/api/v1/changes", { host });
    expect([res.status, JSON.parse(res.body)]).toEqual([403, { error: "forbidden host" }]);
    expect(res.headers["content-security-policy"]).toBe(CSP);
  }
  expect((await get(port, "/", { host: `localhost:${port}` })).status).toBe(200);
});

test("GET /api/v1/changes gives each project's changes with series, statuses and the counts of theway list", async () => {
  const dir = changesHome();
  const { port } = await start(dir);
  const res = await json(port, "/api/v1/changes");
  expect(res.type).toBe("application/json; charset=utf-8");
  expect(res.body.projects.map((p: { key: string; label: string }) => [p.key, p.label])).toEqual([
    ["-Users-me-alpha", "alpha"],
    ["-Users-me-beta", "beta"],
  ]);
  const alpha = res.body.projects[0];
  expect({ active: alpha.active, archived: alpha.archived }).toEqual({
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
  for (const c of alpha.active as ActiveChange[]) {
    expect(list.stdout).toContain(`  ${c.id.padEnd(20)} ${c.files} files   ${c.tasks.done}/${c.tasks.total} tasks done\n`);
  }
});

const change = (id: string, done: number, total: number): ActiveChange => {
  const m = /^(.+)-([0-9]{2})$/.exec(id);
  return { id, files: 1, tasks: { done, total }, status: "In progress", series: m === null ? null : { id: m[1] as string, ordinal: Number(m[2]) } };
};

test("rowsOf joins an active change to its series row when the series is listed, even alone, and sorts rows by ID", () => {
  const series: SeriesProgress[] = [
    { id: "add-a", done: 1, total: 2 },
    { id: "add-c", done: 0, total: 3 },
  ];
  const rows = rowsOf([change("fix-d", 1, 2), change("add-c-03", 0, 1), change("add-c-01", 1, 1), change("add-a-02", 0, 2), change("add-b-01", 0, 0)], series);
  expect(rows.map((r) => [r.kind, r.id])).toEqual([
    ["series", "add-a"],
    ["change", "add-b-01"],
    ["series", "add-c"],
    ["change", "fix-d"],
  ]);
  expect(rows[0]).toEqual({ kind: "series", id: "add-a", members: [change("add-a-02", 0, 2)], done: 1, total: 2 });
  const c = rows[2];
  expect(c?.kind === "series" && [c.members.map((m) => m.id), c.done, c.total]).toEqual([["add-c-01", "add-c-03"], 0, 3]);
  expect(rows[1]).toEqual({ kind: "change", id: "add-b-01", change: change("add-b-01", 0, 0) });
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

test("GET /api/v1/changes counts every project and gives the changes and series progress of each one that has a change", async () => {
  const dir = home();
  const x = join(dir, "projects", "-Users-me-xray", "changes");
  put(join(x, "archive", "2026-02-01-add-x-01", "tasks.md"), "- [x] 1. a\n");
  put(join(x, "add-x-02", "tasks.md"), "- [x] 1. a\n- [x] 2. b\n");
  put(join(x, "add-x-03", "tasks.md"), "- [ ] 1. a\n");
  put(join(x, "add-y-01", "tasks.md"), "- [x] 1. a\n");
  put(join(x, "fix-z", "tasks.md"), "- [ ] 1. a\n");
  put(join(dir, "projects", "-Users-me-yankee", "changes", "archive", "2026-01-01-add-old", "spec.md"), "# Old\n");
  mkdirSync(join(dir, "projects", "-Users-me-zulu"), { recursive: true });
  const { port } = await start(dir);
  const res = await json(port, "/api/v1/changes");
  expect(res.status).toBe(200);
  expect(res.body.total).toBe(3);
  expect(res.body.projects.map((p: { key: string; label: string }) => [p.key, p.label])).toEqual([
    ["-Users-me-xray", "xray"],
    ["-Users-me-yankee", "yankee"],
  ]);
  const [xray, yankee] = res.body.projects;
  expect(xray.series).toEqual([{ id: "add-x", done: 2, total: 3 }]);
  expect(xray.active.map((c: ActiveChange) => c.id)).toEqual(["add-x-02", "add-x-03", "add-y-01", "fix-z"]);
  expect(xray.archived).toEqual([{ folder: "2026-02-01-add-x-01", date: "2026-02-01", id: "add-x-01" }]);
  expect(yankee).toEqual({ key: "-Users-me-yankee", label: "yankee", active: [], archived: [{ folder: "2026-01-01-add-old", date: "2026-01-01", id: "add-old" }], series: [] });
});

test("a change's properties give its PR link from tasks.md and its series from its ID, its spec and the project's members", async () => {
  const dir = home();
  const x = join(dir, "projects", "-Users-me-xray", "changes");
  put(join(x, "archive", "2026-02-01-add-x-01", "tasks.md"), "- [x] 1. a\n\n**PR:** https://github.com/o/r/pull/1.\n");
  put(join(x, "add-x-02", "spec.md"), "# Spec\n\n**Series:** add-x — 02 of 03, depends on add-x-01\n");
  put(join(x, "add-x-02", "tasks.md"), "- [x] 1. a\n\n**PR:** https://github.com/o/r/pull/7, CI green\n**PR:** https://github.com/o/r/pull/8\n");
  put(join(x, "add-x-03", "tasks.md"), "- [ ] 1. a\n\n**PR:** javascript:alert(1)\n");
  put(join(x, "add-w-01", "spec.md"), "# Spec\n\nNo series line.\n");
  put(join(x, "add-w-02", "spec.md"), "# Spec\n\n**Series:** add-w — 02 of 07\n");
  put(join(x, "fix-z", "tasks.md"), "- [ ] 1. a\n");
  const { port } = await start(dir);
  const at = (path: string) => json(port, `/api/v1/projects/-Users-me-xray/${path}`);
  const two = await at("changes/add-x-02");
  expect(two.status).toBe(200);
  expect(two.body.properties).toEqual({
    pr: "https://github.com/o/r/pull/7",
    series: {
      id: "add-x",
      ordinal: 2,
      total: 3,
      members: [
        { ordinal: 1, id: "add-x-01", folder: "2026-02-01-add-x-01" },
        { ordinal: 2, id: "add-x-02", folder: null },
        { ordinal: 3, id: "add-x-03", folder: null },
      ],
    },
  });
  expect((await at("changes/add-x-03")).body.properties.pr).toBeNull();
  // No series line: the total is the number of members.
  const w = await at("changes/add-w-01");
  expect([w.body.properties.pr, w.body.properties.series.total]).toEqual([null, 2]);
  expect((await at("changes/add-w-02")).body.properties.series.total).toBe(7);
  expect((await at("changes/fix-z")).body.properties).toEqual({ pr: null, series: null });
  const one = await at("archive/2026-02-01-add-x-01");
  expect([one.body.properties.pr, one.body.properties.series.ordinal, one.body.properties.series.members.length]).toEqual(["https://github.com/o/r/pull/1", 1, 3]);
});

test("dashboard answers 400 to invalid inputs and 404 to unknown ones, POST on a GET route included", async () => {
  const { port } = await start(changesHome());
  for (const path of [
    "/api/v1/projects/a%2Fb/changes/add-x",
    "/api/v1/projects/-Users-me-alpha/changes/..%2Fx",
    "/api/v1/projects/-Users-me-alpha/archive/add-old",
    "/api/v1/projects/-Users-me-alpha/changes/%E0%A4%A",
    "/api/v1/projects/%E0%A4%A/changes/add-x",
    "/api/v1/projects/nope/changes/..%2Fx",
    "/api/v1/projects/nope/archive/add-old",
  ]) {
    const res = await json(port, path);
    expect([path, res.status, typeof res.body.error]).toEqual([path, 400, "string"]);
  }
  for (const path of [
    "/api/v1/projects/nope/changes/add-x",
    "/api/v1/projects/-Users-me-alpha/changes/add-none",
    "/api/v1/projects/-Users-me-alpha/changes/archive",
    "/api/v1/projects/-Users-me-alpha/archive/2026-01-01-add-none",
    "/api/v1/nothing",
    "/index.html",
  ]) {
    const res = await json(port, path);
    expect([path, res.status, typeof res.body.error]).toEqual([path, 404, "string"]);
  }
  for (const path of ["/api/v1/changes", "/"]) {
    const res = await get(port, path, { method: "POST" });
    expect([path, res.status]).toEqual([path, 404]);
  }
});

test("the routes the read-only pages replaced answer 404, and the changes and files routes 200", async () => {
  const dir = changesHome();
  mkdirSync(join(dir, "projects", "p"), { recursive: true });
  const { port } = await start(dir);
  for (const path of [
    "/api/v1/projects",
    "/api/v1/projects/p/changes",
    "/api/v1/projects/p/workflows",
    "/api/v1/projects/p/workflows/agents",
    "/api/v1/projects/p/sources/workflows/agents",
    "/api/v1/projects/p/steps",
    "/api/v1/projects/p/prompts",
  ]) {
    const res = await json(port, path);
    expect([path, res.status, res.body]).toEqual([path, 404, { error: "not found" }]);
  }
  for (const path of ["/api/v1/changes", "/api/v1/files"]) expect([path, (await get(port, path)).status]).toEqual([path, 200]);
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
  "@fontsource-variable/inter": "5.3.0",
  "@fontsource-variable/jetbrains-mono": "5.3.0",
  "@dnd-kit/core": "6.3.1",
  "@dnd-kit/sortable": "10.0.0",
  "@dnd-kit/utilities": "3.2.2",
};

test("package.json has no dependencies and pins every dashboard package exactly", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
  expect(pkg.dependencies).toBeUndefined();
  expect(pkg.devDependencies["@xyflow/react"]).toBeUndefined();
  for (const [name, version] of Object.entries(PINS)) expect([name, pkg.devDependencies[name]]).toEqual([name, version]);
});

test("the client uses no cmdk and wraps the app in CSPProvider disableStyleElements", () => {
  const client = join(ROOT, "src", "dashboard", "client");
  const files = (readdirSync(client, { recursive: true }) as string[]).filter((f) => /\.tsx?$/.test(f));
  expect(files.length).toBeGreaterThan(0);
  for (const f of files) expect([f, /from "cmdk"|components\/ui\/command/.test(readFileSync(join(client, f), "utf-8"))]).toEqual([f, false]);
  const app = readFileSync(join(client, "app.tsx"), "utf-8");
  expect(app).toContain("<CSPProvider disableStyleElements>");
  const ui = files.filter((f) => f.startsWith(join("components", "ui"))).sort();
  expect(ui).toEqual(
    ["alert-dialog", "button", "checkbox", "dialog", "dropdown-menu", "select", "tabs", "textarea"].map((n) => join("components", "ui", `${n}.tsx`)),
  );
  const reui = files.filter((f) => f.startsWith(join("components", "reui"))).sort();
  expect(reui).toEqual(["badge", "sortable", "timeline"].map((n) => join("components", "reui", `${n}.tsx`)));
  expect(existsSync(join(client, "components", "reui", "sortable.tsx"))).toBe(true);
  expect(existsSync(join(ROOT, "src", "components"))).toBe(false);
});

test("dashboard labels a project by its folder's name, <parent>/<name> when shared, the key prefix rule when not found", () => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "theway-label-")));
  try {
    const repo = join(base, "github.com", "acme", "my-repo");
    const other = join(base, "gitlab.com", "acme-two", "api");
    const twin = join(base, "github.com", "acme", "api");
    for (const dir of [repo, other, twin]) mkdirSync(dir, { recursive: true });
    const [repoKey, otherKey, twinKey] = [repo, other, twin].map(keyOf) as [string, string, string];
    expect(folderOf(repoKey)).toBe(repo);
    expect(folderOf(`${repoKey}-gone`)).toBeNull();
    const nested = join(base, "org", "site", "docs");
    const sibling = join(base, "org", "site-docs");
    for (const dir of [nested, sibling]) mkdirSync(dir, { recursive: true });
    expect(folderOf(keyOf(sibling))).toBe(sibling);
    expect(labels([repoKey, otherKey, twinKey, `${base.replace(/[^A-Za-z0-9]/g, "-")}-moved-away`])).toEqual([
      "my-repo",
      "acme-two/api",
      "acme/api",
      "moved-away",
    ]);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
