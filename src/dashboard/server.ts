/**
 * The dashboard's HTTP app: the Content-Security-Policy with a style nonce, the Host guard, the write guard, the page
 * and its embedded assets, the read API over the home, the check and write routes of workflow and prompt files, and the
 * save route of a change's files.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { NONCE, secureHeaders } from "hono/secure-headers";
import css from "./generated/app.css.txt" with { type: "text" };
import js from "./generated/app.js.txt" with { type: "text" };
import inter from "./generated/inter.woff2.txt" with { type: "text" };
import jetbrainsMono from "./generated/jetbrains-mono.woff2.txt" with { type: "text" };
import { version } from "../../package.json" with { type: "json" };
import { activeIds } from "../core/list";
import { projectDir } from "../core/project";
import { escaped } from "../core/text";
import { changeDetail, listChanges, listedArchiveDirs } from "./changes";
import type { ProjectList } from "./contract";
import { checkDraft, type FileAnswer, listPrompts, listWorkflows, promptFile, workflowFile } from "./files";
import { projectKeys, projects } from "./projects";
import { type Answer, listVersions, readVersion, restoreVersion, writeChangeFile, writeFile } from "./write";

/** The context variable hono's secure-headers middleware keeps the response's nonce in. */
type Env = { Variables: { secureHeadersNonce?: string } };

const JSON_TYPE = "application/json; charset=utf-8";

/** The two fonts, embedded as base64 text and decoded once. */
const FONTS: Record<string, Uint8Array<ArrayBuffer>> = {
  "/fonts/inter.woff2": Uint8Array.from(Buffer.from(inter, "base64")),
  "/fonts/jetbrains-mono.woff2": Uint8Array.from(Buffer.from(jetbrainsMono, "base64")),
};

/** The largest body a write route takes, in bytes. */
export const MAX_BODY = 1048576;

/** Whether two strings are equal, compared in constant time over their SHA-256. */
const sameSecret = (a: string, b: string): boolean =>
  timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

/** A JSON body's fields, each of its expected type: `string`, `string?` (a string or `null`); `null` when one is not. */
function fields<T extends Record<string, "string" | "string?">>(
  body: unknown,
  spec: T,
): { [K in keyof T]: T[K] extends "string" ? string : string | null } | null {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return null;
  const out: Record<string, unknown> = {};
  for (const [key, type] of Object.entries(spec)) {
    const v = (body as Record<string, unknown>)[key];
    if (!(typeof v === "string" || (type === "string?" && v === null))) return null;
    out[key] = v;
  }
  return out as { [K in keyof T]: T[K] extends "string" ? string : string | null };
}

const escapeAttr = (v: string): string => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** The page: the app's script and stylesheet, the response's style nonce, the write token and theway's version. */
function page(nonce: string, token: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theway-nonce" content="${escapeAttr(nonce)}">
<meta name="theway-token" content="${escapeAttr(token)}">
<meta name="theway-version" content="${escapeAttr(version)}">
<title>theway</title>
<link rel="stylesheet" href="/app.css">
<script type="module" src="/app.js"></script>
</head>
<body>
<div id="root"></div>
</body>
</html>
`;
}

/**
 * The app for the home `home`. `port` is read on every request, since with port 0 it is known only once listening;
 * `startKey` is the key of the project the command was started in; `token` is the process's write token.
 */
export function createApp(home: string, port: () => number, startKey: string, token: string): Hono<Env> {
  const app = new Hono<Env>();
  const json = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": JSON_TYPE } });

  app.use(
    "*",
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", NONCE],
        imgSrc: ["'self'"],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
        frameAncestors: ["'none'"],
      },
      referrerPolicy: "no-referrer",
      strictTransportSecurity: false,
    }),
  );
  // DNS-rebinding defence: only the loopback names of this server's own port. On port 80 a browser omits the port
  // from the Host header (RFC 9110, 7.2), so the bare loopback names pass there, and only there.
  app.use("*", async (c, next) => {
    const host = (c.req.header("host") ?? "").toLowerCase();
    const p = port();
    const allowed = [`127.0.0.1:${p}`, `localhost:${p}`, ...(p === 80 ? ["127.0.0.1", "localhost"] : [])];
    if (!allowed.includes(host)) {
      c.res = json(403, { error: "forbidden host" });
      return;
    }
    await next();
  });
  app.use("/api/*", async (c, next) => {
    await next();
    c.res.headers.set("Cache-Control", "no-store");
  });
  // Write guard, on every request that is not a read: this server's own Origin and the process token (the same answer
  // for either), a JSON media type, then a bounded body.
  app.use("*", async (c, next) => {
    if (c.req.method === "GET" || c.req.method === "HEAD") return next();
    const p = port();
    const origins = [`http://127.0.0.1:${p}`, `http://localhost:${p}`, ...(p === 80 ? ["http://127.0.0.1", "http://localhost"] : [])];
    const origin = c.req.header("origin") ?? "";
    const given = c.req.header("x-theway-token");
    if (!origins.includes(origin) || given === undefined || !sameSecret(given, token)) return json(403, { error: "forbidden" });
    const media = (c.req.header("content-type") ?? "").split(";")[0]?.trim().toLowerCase();
    if (media !== "application/json") return json(415, { error: "unsupported media type" });
    return next();
  });
  app.use("*", async (c, next) => {
    if (c.req.method === "GET" || c.req.method === "HEAD") return next();
    return bodyLimit({ maxSize: MAX_BODY, onError: () => json(413, { error: "body too large" }) })(c, next);
  });

  app.get("/", (c) =>
    c.body(page(c.get("secureHeadersNonce") ?? "", token), 200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }),
  );
  app.get("/app.js", (c) => c.body(js, 200, { "Content-Type": "text/javascript; charset=utf-8" }));
  app.get("/app.css", (c) => c.body(css, 200, { "Content-Type": "text/css; charset=utf-8" }));
  for (const [path, bytes] of Object.entries(FONTS)) app.get(path, (c) => c.body(bytes, 200, { "Content-Type": "font/woff2" }));

  app.get("/api/projects", () => {
    const list = projects(home);
    const body: ProjectList = { projects: list, start: list.some((p) => p.key === startKey) ? startKey : null };
    return json(200, body);
  });

  // Route parameters arrive decoded (`%2F` is `/`), so each is checked against the names listed on disk before it is
  // joined into a path.
  const projectOf = (key: string): string | null => (projectKeys(home).includes(key) ? projectDir(home, key) : null);
  app.get("/api/projects/:key/changes", (c) => {
    const dir = projectOf(c.req.param("key"));
    if (dir === null) return json(404, { error: "unknown project" });
    return json(200, listChanges(dir));
  });
  app.get("/api/projects/:key/changes/archive/:dir", (c) => {
    const dir = projectOf(c.req.param("key"));
    if (dir === null) return json(404, { error: "unknown project" });
    const archive = c.req.param("dir");
    if (!listedArchiveDirs(dir).includes(archive)) return json(404, { error: "unknown archive folder" });
    return json(200, changeDetail(dir, archive.slice(11), archive));
  });
  app.get("/api/projects/:key/changes/:id", (c) => {
    const dir = projectOf(c.req.param("key"));
    if (dir === null) return json(404, { error: "unknown project" });
    const id = c.req.param("id");
    if (!activeIds(dir).includes(id)) return json(404, { error: "unknown change" });
    return json(200, changeDetail(dir, id));
  });

  app.get("/api/workflows", () => json(200, listWorkflows(home)));
  app.get("/api/prompts", () => json(200, listPrompts(home)));
  // Each file route serves only the file in its own folder: the global one, or the project's own (never the global one).
  const answer = (a: FileAnswer): Response => json(a.status, a.body);
  app.get("/api/workflows/global/:name", (c) => answer(workflowFile(home, null, c.req.param("name"))));
  app.get("/api/workflows/projects/:key/:name", (c) => answer(workflowFile(home, c.req.param("key"), c.req.param("name"))));
  app.get("/api/prompts/global/:name", (c) => answer(promptFile(home, null, c.req.param("name"))));
  app.get("/api/prompts/projects/:key/:name", (c) => answer(promptFile(home, c.req.param("key"), c.req.param("name"))));

  // The check and write routes. A body that is not JSON, or misses a field or has one of the wrong type, gets 400.
  const invalid = (): Response => json(400, { error: "invalid body" });
  const body = async (c: Context<Env>): Promise<unknown> => {
    try {
      return await c.req.json();
    } catch {
      return undefined;
    }
  };
  const reply = (a: Answer): Response => json(a.status, a.body);
  app.post("/api/check", async (c) => {
    const f = fields(await body(c), { kind: "string", project: "string?", name: "string", text: "string" });
    if (f === null || (f.kind !== "workflows" && f.kind !== "prompts")) return invalid();
    return reply(checkDraft(home, f.kind, f.project, f.name, f.text));
  });
  for (const kind of ["workflows", "prompts"] as const) {
    for (const [scope, projectOfParams] of [
      ["global/:name", () => null],
      ["projects/:key/:name", (c: Context<Env>) => c.req.param("key") as string],
    ] as const) {
      const route = `/api/${kind}/${scope}`;
      const at = (c: Context<Env>) => ({ project: projectOfParams(c), name: c.req.param("name") as string });
      app.put(route, async (c) => {
        const f = fields(await body(c), { text: "string", base: "string?" });
        if (f === null) return invalid();
        const { project, name } = at(c);
        return reply(writeFile(home, kind, project, name, f.text, f.base));
      });
      app.get(`${route}/history`, (c) => {
        const { project, name } = at(c);
        return reply(listVersions(home, kind, project, name));
      });
      app.get(`${route}/history/:id`, (c) => {
        const { project, name } = at(c);
        return reply(readVersion(home, kind, project, name, c.req.param("id")));
      });
      app.post(`${route}/history/:id/restore`, async (c) => {
        const f = fields(await body(c), { base: "string?" });
        if (f === null) return invalid();
        const { project, name } = at(c);
        return reply(restoreVersion(home, kind, project, name, c.req.param("id"), f.base));
      });
    }
  }

  app.put("/api/projects/:key/changes/:id/files/:name", async (c) => {
    const f = fields(await body(c), { text: "string", base: "string" });
    if (f === null) return invalid();
    return reply(writeChangeFile(home, c.req.param("key"), c.req.param("id"), c.req.param("name"), f.text, f.base));
  });

  app.notFound(() => json(404, { error: "not found" }));
  // An error that escaped its route: Hono's own answer for an HTTPException, else one stderr line and a JSON 500.
  app.onError((err, c) => {
    if ("getResponse" in err) return err.getResponse();
    process.stderr.write(`theway: ${c.req.method} ${c.req.path}: ${escaped(err.message)}\n`);
    return json(500, { error: err.message });
  });
  return app;
}
