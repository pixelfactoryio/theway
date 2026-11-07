/**
 * The dashboard's HTTP app: the Host check, the security headers, the page and its assets, the read API, and the write
 * routes behind the Origin and token guard.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { type Context, Hono, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import {
  archivedChange,
  change,
  changes,
  projects,
  prompts,
  type Reply,
  revert,
  save,
  source,
  steps,
  validate,
  workflow,
  workflows,
} from "./api";
import css from "./generated/app.css.txt" with { type: "text" };
import js from "./generated/client.txt" with { type: "text" };
import html from "./client/index.html" with { type: "text" };

const JSON_TYPE = "application/json; charset=utf-8";
/** The most bytes a write request's body may hold. */
const MAX_BODY = 1048576;

/** The token every write request carries in `X-Theway-Token`: 32 random bytes, hex, made once per process. */
const TOKEN = randomBytes(32).toString("hex");

/**
 * The app for the home `home`: `initial` is the project of the current directory, `port` the port the server is bound
 * to, read on every request since port 0 is known only once listening.
 */
export function createApp(home: string, initial: string | null, port: () => number): Hono {
  const app = new Hono();
  const json = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": JSON_TYPE } });
  const reply = <T>(r: Reply<T>): Response => json(r.status, r.body);
  const page = html.replace("__THEWAY_TOKEN__", TOKEN);

  /**
   * The write guard: an `Origin` of this server's own loopback address and the process token. The custom header forces
   * a CORS preflight, which the server never approves.
   */
  const guard: MiddlewareHandler = async (c, next) => {
    const origin = c.req.header("origin");
    const token = Buffer.from(c.req.header("x-theway-token") ?? "");
    const own = origin === `http://127.0.0.1:${port()}` || origin === `http://localhost:${port()}`;
    if (!own || token.length !== TOKEN.length || !timingSafeEqual(token, Buffer.from(TOKEN))) return json(403, { error: "forbidden" });
    await next();
  };
  const jsonOnly: MiddlewareHandler = async (c, next) => {
    const type = (c.req.header("content-type") ?? "").split(";")[0]?.trim().toLowerCase();
    if (type !== "application/json") return json(415, { error: "unsupported media type" });
    await next();
  };
  const limit = bodyLimit({ maxSize: MAX_BODY, onError: () => json(413, { error: "too large" }) });
  const writes = [guard, jsonOnly, limit] as const;
  /** The JSON body of a request, or `undefined` when it is not valid JSON. */
  const body = async (c: Context): Promise<unknown> => c.req.json().catch(() => undefined);

  app.use(
    "*",
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
        frameAncestors: ["'none'"],
      },
      referrerPolicy: "no-referrer",
      strictTransportSecurity: false,
    }),
  );
  // DNS-rebinding defence: only the loopback names of this server's own port.
  app.use("*", async (c, next) => {
    const host = (c.req.header("host") ?? "").toLowerCase();
    if (host !== `127.0.0.1:${port()}` && host !== `localhost:${port()}`) {
      c.res = json(403, { error: "forbidden host" });
      return;
    }
    await next();
  });
  app.use("/api/*", async (c, next) => {
    await next();
    c.res.headers.set("Cache-Control", "no-store");
  });

  app.get("/", (c) => c.body(page, 200, { "Content-Type": "text/html; charset=utf-8" }));
  app.get("/app.js", (c) => c.body(js, 200, { "Content-Type": "text/javascript; charset=utf-8" }));
  app.get("/app.css", (c) => c.body(css, 200, { "Content-Type": "text/css; charset=utf-8" }));

  app.get("/api/v1/projects", () => reply(projects(home, initial)));
  app.get("/api/v1/projects/:key/changes", (c) => reply(changes(home, c.req.param("key"))));
  app.get("/api/v1/projects/:key/changes/:id", (c) => reply(change(home, c.req.param("key"), c.req.param("id"))));
  app.get("/api/v1/projects/:key/archive/:folder", (c) => reply(archivedChange(home, c.req.param("key"), c.req.param("folder"))));
  app.get("/api/v1/projects/:key/workflows", (c) => reply(workflows(home, c.req.param("key"))));
  app.get("/api/v1/projects/:key/workflows/:name", (c) => reply(workflow(home, c.req.param("key"), c.req.param("name"))));
  app.get("/api/v1/projects/:key/sources/:kind/:name", (c) => reply(source(home, c.req.param("key"), c.req.param("kind"), c.req.param("name"))));
  app.get("/api/v1/projects/:key/steps", (c) => reply(steps(home, c.req.param("key"))));
  app.get("/api/v1/projects/:key/prompts", (c) => reply(prompts(home, c.req.param("key"))));

  app.post("/api/v1/projects/:key/validate", ...writes, async (c) => {
    const b = await body(c);
    return b === undefined ? json(400, { error: "invalid JSON" }) : reply(validate(home, c.req.param("key"), b));
  });
  app.put("/api/v1/projects/:key/sources", ...writes, async (c) => {
    const b = await body(c);
    return b === undefined ? json(400, { error: "invalid JSON" }) : reply(save(home, c.req.param("key"), b));
  });
  app.delete("/api/v1/projects/:key/sources/:kind/:name", ...writes, (c) =>
    reply(revert(home, c.req.param("key"), c.req.param("kind"), c.req.param("name"), c.req.query("base"))),
  );

  app.notFound(() => json(404, { error: "not found" }));
  return app;
}
