import { afterEach, expect, test } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { keyOf } from "../src/core/project";
import { createApp } from "../src/dashboard/server";

const REPO = join(import.meta.dirname, "..");
const CLI = join(REPO, "dist", "theway.js");
const TOKEN = "ab".repeat(32);
const VERSION = (JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")) as { version: string }).version;
const temps: string[] = [];
const locked: string[] = [];

function temp(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "theway-dash-")));
  temps.push(dir);
  return dir;
}

afterEach(() => {
  for (const d of locked.splice(0)) chmodSync(d, 0o755);
  for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A project folder in `home` with one folder per active change, plus an archive. */
function project(home: string, key: string, active = 0): void {
  mkdirSync(join(home, "projects", key, "changes", "archive", "2026-01-01-old"), { recursive: true });
  for (let i = 0; i < active; i++) mkdirSync(join(home, "projects", key, "changes", `add-c${i}`), { recursive: true });
}

const app = (home: string, start = "") => createApp(home, () => 4870, start, TOKEN);
const get = (home: string, path: string, host = "127.0.0.1:4870", start = "") =>
  app(home, start).request(`http://${host}${path}`, { headers: { Host: host } });

test("a Host other than 127.0.0.1:<port> or localhost:<port> gets 403 with the policy", async () => {
  const home = temp();
  for (const host of ["evil.example:4870", "127.0.0.1:4871", "localhost", "127.0.0.1"]) {
    const res = await get(home, "/api/projects", host);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden host" });
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
  }
  expect((await get(home, "/", "localhost:4870")).status).toBe(200);
});

test("on port 80 a loopback Host with no port is served, a foreign host still gets 403", async () => {
  const on80 = createApp(temp(), () => 80, "", TOKEN);
  const at = (host: string) => on80.request(`http://${host}/api/projects`, { headers: { Host: host } });
  for (const host of ["127.0.0.1", "localhost", "127.0.0.1:80", "localhost:80"]) expect((await at(host)).status).toBe(200);
  for (const host of ["example.com", "example.com:80"]) {
    const res = await at(host);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden host" });
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
  }
});

test("an unknown path gets 404 not found", async () => {
  const res = await get(temp(), "/nope");
  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ error: "not found" });
});

test("the page carries the policy, its nonce, the token and the version", async () => {
  const res = await get(temp(), "/");
  expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
  const policy = res.headers.get("content-security-policy") ?? "";
  const directives = Object.fromEntries(
    policy.split(";").map((d) => {
      const [name, ...values] = d.trim().split(/\s+/);
      return [name, values.join(" ")];
    }),
  );
  for (const name of ["script-src", "font-src", "img-src", "connect-src"]) expect(directives[name]).toBe("'self'");
  const nonce = /^'self' 'nonce-([^']+)'$/.exec(directives["style-src"] ?? "")?.[1];
  expect(nonce).toBeDefined();
  const html = await res.text();
  expect(html).toContain(`<meta name="theway-nonce" content="${nonce}">`);
  expect(html).toContain(`<meta name="theway-token" content="${TOKEN}">`);
  expect(html).toContain(`<meta name="theway-version" content="${VERSION}">`);
  expect(html).toContain('<script type="module" src="/app.js"></script>');
  expect(html).toContain('<link rel="stylesheet" href="/app.css">');
  const again = (await get(temp(), "/")).headers.get("content-security-policy");
  expect(again).not.toBe(policy);
});

test("the page and the stylesheet load nothing from another host", async () => {
  const home = temp();
  const html = await (await get(home, "/")).text();
  const refs = [...html.matchAll(/\s(?:src|href)="([^"]*)"/g)].map((m) => m[1] as string);
  expect(refs.length).toBeGreaterThan(0);
  const css = await (await get(home, "/app.css")).text();
  const targets = [
    ...[...css.matchAll(/url\(\s*["']?([^"')]*)/g)].map((m) => m[1] as string),
    ...[...css.matchAll(/@import\s+(?:url\()?\s*["']?([^"');\s]*)/g)].map((m) => m[1] as string),
  ];
  expect(targets).toContain("/fonts/inter.woff2");
  const foreign = [...refs, ...targets].filter((r) => /^(?:[a-z]+:)?\/\//i.test(r));
  expect(foreign).toEqual([]);
});

test("the assets are served with their types and the fonts are the packages' files", async () => {
  const home = temp();
  const types = {
    "/app.js": "text/javascript; charset=utf-8",
    "/app.css": "text/css; charset=utf-8",
    "/fonts/inter.woff2": "font/woff2",
    "/fonts/jetbrains-mono.woff2": "font/woff2",
  };
  for (const [path, type] of Object.entries(types)) {
    const res = await get(home, path);
    expect([path, res.status, res.headers.get("content-type")]).toEqual([path, 200, type]);
  }
  for (const [path, file] of [
    ["/fonts/inter.woff2", "inter/files/inter-latin-wght-normal.woff2"],
    ["/fonts/jetbrains-mono.woff2", "jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2"],
  ] as const) {
    const bytes = Buffer.from(await (await get(home, path)).arrayBuffer());
    expect(bytes.equals(readFileSync(join(REPO, "node_modules", "@fontsource-variable", file)))).toBe(true);
  }
});

/** A unicode-range as a sorted list of `[start, end]`, whatever its notation (`U+0000-00FF` or the minified `U+??`). */
function ranges(text: string): string {
  return text
    .split(",")
    .map((r) => {
      const v = r.trim().replace(/^U\+/i, "");
      if (v.includes("?")) return [parseInt(v.replace(/\?/g, "0"), 16), parseInt(v.replace(/\?/g, "F"), 16)];
      const [a, b = a] = v.split("-");
      return [parseInt(a as string, 16), parseInt(b as string, 16)];
    })
    .map(([a, b]) => `${a}-${b}`)
    .sort()
    .join(",");
}

test("/app.css holds the two @font-face rules of the spec", async () => {
  const css = await (await get(temp(), "/app.css")).text();
  const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1] as string);
  const prop = (face: string, name: string) => new RegExp(`${name}:\\s*([^;]+)`).exec(face)?.[1]?.trim() ?? "";
  const expected = [
    { family: "Inter Variable", url: "/fonts/inter.woff2", weight: "100 900", pkg: "inter" },
    { family: "JetBrains Mono Variable", url: "/fonts/jetbrains-mono.woff2", weight: "100 800", pkg: "jetbrains-mono" },
  ];
  for (const e of expected) {
    const face = faces.find((f) => prop(f, "font-family").replace(/['"]/g, "") === e.family);
    expect(face).toBeDefined();
    const f = face as string;
    expect(prop(f, "src").replace(/\s+/g, "").replace(/['"]/g, "")).toBe(`url(${e.url})format(woff2-variations)`);
    expect(prop(f, "font-weight")).toBe(e.weight);
    expect(prop(f, "font-style")).toBe("normal");
    expect(prop(f, "font-display")).toBe("swap");
    const index = readFileSync(join(REPO, "node_modules", "@fontsource-variable", e.pkg, "index.css"), "utf-8");
    const latin = /latin-wght-normal \*\/\s*@font-face\s*\{([^}]*)\}/.exec(index)?.[1] as string;
    expect(ranges(prop(f, "unicode-range"))).toBe(ranges(prop(latin, "unicode-range")));
  }
});

test("GET /api/projects lists the projects by key with their label, active count, folder and start", async () => {
  const home = temp();
  const work = temp();
  // The folder name is the label.
  const theway = join(work, "code", "theway");
  // `a-b` matches first and ends before the key is used up: the label comes from the backtrack to `a`.
  mkdirSync(join(work, "a-b"), { recursive: true });
  const deep = join(work, "a", "b", "c-d");
  // Two projects of one folder name, and a key no folder has.
  const one = join(work, "x", "app");
  const two = join(work, "y", "app");
  for (const dir of [theway, deep, one, two]) mkdirSync(dir, { recursive: true });
  const keys = [keyOf(theway), keyOf(deep), keyOf(one), keyOf(two), keyOf(`${work}/gone/nowhere`)];
  keys.forEach((key, i) => project(home, key, i));
  mkdirSync(join(home, "projects", ".hidden"), { recursive: true });
  mkdirSync(join(home, "projects", "not_a_key"), { recursive: true });

  const res = await get(home, "/api/projects", "127.0.0.1:4870", keyOf(theway));
  expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8");
  const body = (await res.json()) as {
    projects: { key: string; label: string; active: number; path: string | null }[];
    start: string | null;
  };
  const prefix = `${keyOf(work)}-`;
  // The folder of each key; none for the key no folder has.
  const folders = new Map<string, string | null>([
    [keyOf(theway), theway],
    [keyOf(deep), deep],
    [keyOf(one), one],
    [keyOf(two), two],
    [keyOf(`${work}/gone/nowhere`), null],
  ]);
  expect(body.start).toBe(keyOf(theway));
  expect(body.projects).toEqual(
    keys
      .map((key, i) => ({ key, active: i }))
      .sort((a, b) => (a.key < b.key ? -1 : 1))
      .map(({ key, active }) => ({
        key,
        active,
        label: key === keyOf(theway) ? "theway" : key === keyOf(deep) ? "c-d" : key.slice(prefix.length),
        path: folders.get(key) ?? null,
      })),
  );

  // Read on every request; a start the home does not have is null.
  project(home, "-added", 0);
  const next = (await (await get(home, "/api/projects", "127.0.0.1:4870", "-elsewhere")).json()) as typeof body;
  expect(next.start).toBeNull();
  expect(next.projects.map((p) => p.key)).toContain("-added");
});

test("GET /api/projects returns the recorded root as path when the root file names a folder", async () => {
  const home = temp();
  const work = temp();
  // `a-b` is what the folder walk finds for the key; the record names `a.b`.
  const walked = join(work, "x", "a-b");
  const recorded = join(work, "x", "a.b");
  for (const dir of [walked, recorded]) mkdirSync(dir, { recursive: true });
  const key = keyOf(recorded);
  project(home, key, 0);
  writeFileSync(join(home, "projects", key, "root"), `${recorded}\n`);
  const body = (await (await get(home, "/api/projects")).json()) as { projects: { key: string; label: string; path: string | null }[] };
  expect(body.projects).toEqual([{ key, label: "a.b", active: 0, path: recorded }]);
});

test("one project's fallback label is its key without the leading -", async () => {
  const home = temp();
  project(home, "-no-such-folder-anywhere", 0);
  const body = (await (await get(home, "/api/projects")).json()) as { projects: { label: string }[] };
  expect(body.projects.map((p) => p.label)).toEqual(["no-such-folder-anywhere"]);
});

test.skipIf(process.getuid?.() === 0)("a project whose path holds an unreadable directory gets the fallback label", async () => {
  const home = temp();
  const work = temp();
  const inside = join(work, "locked", "proj");
  mkdirSync(inside, { recursive: true });
  const other = join(work, "open", "svc");
  mkdirSync(other, { recursive: true });
  // An unreadable sibling on the way does not hide the readable project.
  mkdirSync(join(work, "sealed"));
  chmodSync(join(work, "locked"), 0o311);
  chmodSync(join(work, "sealed"), 0o000);
  locked.push(join(work, "locked"), join(work, "sealed"));
  project(home, keyOf(inside), 0);
  project(home, keyOf(other), 0);
  const body = (await (await get(home, "/api/projects")).json()) as { projects: { key: string; label: string }[] };
  const label = (key: string) => body.projects.find((p) => p.key === key)?.label;
  expect(label(keyOf(inside))).toBe("locked-proj");
  expect(label(keyOf(other))).toBe("svc");
});

/** Starts `theway dashboard` with `args`; resolves once it printed a line or exited. */
function start(home: string, ...args: string[]) {
  const child = spawn("node", [CLI, "dashboard", ...args], {
    env: { ...process.env, THEWAY_HOME: home },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (d) => (stdout += d));
  child.stderr.on("data", (d) => (stderr += d));
  const exited = new Promise<number | null>((done) => child.on("exit", (code) => done(code)));
  const ready = new Promise<void>((done) => {
    const check = () => (stdout.includes("\n") || stderr.includes("\n") ? done() : undefined);
    child.stdout.on("data", check);
    child.stderr.on("data", check);
    child.on("exit", () => done());
  });
  return { child, exited, ready, out: () => stdout, err: () => stderr };
}

test("dashboard --port 0 prints the bound address, serves, and exits 0 on SIGTERM", async () => {
  const home = temp();
  const run = start(home, "--port", "0");
  await run.ready;
  const port = /^theway dashboard: http:\/\/127\.0\.0\.1:(\d+)\/\n$/.exec(run.out())?.[1];
  expect([port !== undefined, run.err()]).toEqual([true, ""]);
  const res = await fetch(`http://127.0.0.1:${port}/api/projects`);
  expect(await res.json()).toEqual({ projects: [], start: null });
  run.child.kill("SIGTERM");
  expect(await run.exited).toBe(0);
});

test("dashboard whose derived key is claimed by another root warns and has no start project", async () => {
  const work = realpathSync(temp());
  const first = join(work, "x", "a-b");
  const second = join(work, "x", "a", "b");
  for (const dir of [first, second]) mkdirSync(dir, { recursive: true });
  const home = temp();
  const key = keyOf(first);
  mkdirSync(join(home, "projects", key), { recursive: true });
  writeFileSync(join(home, "projects", key, "root"), `${first}\n`);
  const env: Record<string, string | undefined> = { ...process.env, THEWAY_HOME: home };
  for (const k of Object.keys(env)) if (k.startsWith("GIT_")) delete env[k];
  const child = spawn("node", [CLI, "dashboard", "--port", "0"], { cwd: second, env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d));
  const exited = new Promise<number | null>((done) => child.on("exit", (code) => done(code)));
  await new Promise<void>((done) => {
    child.stdout.on("data", (d) => {
      stdout += d;
      if (stdout.includes("\n")) done();
    });
    child.on("exit", () => done());
  });
  expect(stderr).toBe(`theway: warning: project key ${key} is used by ${first}; the dashboard has no start project for ${second}\n`);
  const port = /^theway dashboard: http:\/\/127\.0\.0\.1:(\d+)\/\n$/.exec(stdout)?.[1];
  const body = (await (await fetch(`http://127.0.0.1:${port}/api/projects`)).json()) as {
    projects: { key: string }[];
    start: string | null;
  };
  expect(body.start).toBeNull();
  expect(body.projects.map((p) => p.key)).toEqual([key]);
  child.kill("SIGTERM");
  expect(await exited).toBe(0);
});

test("dashboard listens on 127.0.0.1 by default port 4870 and stops on SIGINT", async () => {
  const run = start(temp());
  await run.ready;
  if (run.out() !== "") {
    expect(run.out()).toBe("theway dashboard: http://127.0.0.1:4870/\n");
    run.child.kill("SIGINT");
    expect(await run.exited).toBe(0);
  } else {
    // Another process holds 4870 on this machine: the message still names the default port.
    expect(run.err()).toBe("theway: port 4870 is in use; pass --port <n>\n");
    expect(await run.exited).toBe(1);
  }
});

test("dashboard rejects a port that is not an integer from 0 to 65535", () => {
  for (const value of ["65536", "-1", "abc", "1.5", ""]) {
    const res = spawnSync("node", [CLI, "dashboard", "--port", value], { encoding: "utf-8", env: { ...process.env, THEWAY_HOME: temp() } });
    expect([res.status, res.stdout, res.stderr]).toEqual([
      1,
      "",
      `error: option '--port <n>' argument '${value}' is invalid. must be an integer from 0 to 65535\n`,
    ]);
  }
});

test("dashboard on a port in use prints the message to stderr and exits 1", async () => {
  const blocker = createServer();
  await new Promise<void>((done) => blocker.listen(0, "127.0.0.1", () => done()));
  const port = (blocker.address() as { port: number }).port;
  try {
    const run = start(temp(), "--port", String(port));
    expect(await run.exited).toBe(1);
    expect([run.out(), run.err()]).toEqual(["", `theway: port ${port} is in use; pass --port <n>\n`]);
  } finally {
    blocker.close();
  }
});

test("the built CLI serves the page with no file beside it", async () => {
  const dir = temp();
  const copy = join(dir, "theway.js");
  copyFileSync(CLI, copy);
  const child = spawn("node", [copy, "dashboard", "--port", "0"], {
    cwd: dir,
    env: { ...process.env, THEWAY_HOME: temp() },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const line = await new Promise<string>((done) => child.stdout.on("data", (d) => done(String(d))));
  const url = /http:\/\/127\.0\.0\.1:\d+\//.exec(line)?.[0] as string;
  for (const path of ["", "app.js", "app.css", "fonts/inter.woff2", "fonts/jetbrains-mono.woff2"]) {
    expect([path, (await fetch(url + path)).status]).toEqual([path, 200]);
  }
  child.kill("SIGTERM");
  await new Promise((done) => child.on("exit", done));
});

test("the build writes the two font licences", () => {
  for (const name of ["inter-OFL.txt", "jetbrains-mono-OFL.txt"]) {
    expect(readFileSync(join(REPO, "dist", "licenses", name), "utf-8")).toContain("SIL OPEN FONT LICENSE");
  }
});
