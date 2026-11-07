/** The dashboard's HTTP app: the Host check, the security headers, the page and its assets, and the read-only API. */
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { archivedChange, change, changes, projects, type Reply, workflow, workflows } from "./api";
import css from "./generated/app.css.txt" with { type: "text" };
import js from "./generated/client.txt" with { type: "text" };
import html from "./client/index.html" with { type: "text" };

const JSON_TYPE = "application/json; charset=utf-8";

/**
 * The app for the home `home`: `initial` is the project of the current directory, `port` the port the server is bound
 * to, read on every request since port 0 is known only once listening.
 */
export function createApp(home: string, initial: string | null, port: () => number): Hono {
  const app = new Hono();
  const json = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": JSON_TYPE } });
  const reply = <T>(r: Reply<T>): Response => json(r.status, r.body);

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

  app.get("/", (c) => c.body(html, 200, { "Content-Type": "text/html; charset=utf-8" }));
  app.get("/app.js", (c) => c.body(js, 200, { "Content-Type": "text/javascript; charset=utf-8" }));
  app.get("/app.css", (c) => c.body(css, 200, { "Content-Type": "text/css; charset=utf-8" }));

  app.get("/api/v1/projects", () => reply(projects(home, initial)));
  app.get("/api/v1/projects/:key/changes", (c) => reply(changes(home, c.req.param("key"))));
  app.get("/api/v1/projects/:key/changes/:id", (c) => reply(change(home, c.req.param("key"), c.req.param("id"))));
  app.get("/api/v1/projects/:key/archive/:folder", (c) => reply(archivedChange(home, c.req.param("key"), c.req.param("folder"))));
  app.get("/api/v1/projects/:key/workflows", (c) => reply(workflows(home, c.req.param("key"))));
  app.get("/api/v1/projects/:key/workflows/:name", (c) => reply(workflow(home, c.req.param("key"), c.req.param("name"))));

  app.notFound(() => json(404, { error: "not found" }));
  return app;
}
