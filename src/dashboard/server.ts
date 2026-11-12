/**
 * The dashboard's HTTP app: the Host check, the security headers, the page and its assets, the read API, and the write
 * routes behind the Origin and token guard.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { type Context, Hono, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { NONCE, secureHeaders } from "hono/secure-headers";
import { allChanges, archivedChange, change, file, files, fileVersion, fileVersions, NOT_JSON, type Reply, saveFile, validateFileText } from "./api";
import css from "./generated/app.css.txt" with { type: "text" };
import js from "./generated/client.txt" with { type: "text" };
import inter from "./generated/inter.woff2.txt" with { type: "text" };
import jetbrainsMono from "./generated/jetbrains-mono.woff2.txt" with { type: "text" };
import html from "./client/index.html" with { type: "text" };

const JSON_TYPE = "application/json; charset=utf-8";
/** The most bytes a write request's body may hold. */
const MAX_BODY = 1048576;

/** The token every write request carries in `X-Theway-Token`: 32 random bytes, hex, made once per process. */
const TOKEN = randomBytes(32).toString("hex");

/** The two fonts the page uses, embedded as base64 text and decoded once. */
const FONTS: Record<string, Uint8Array<ArrayBuffer>> = {
  "/fonts/inter.woff2": Uint8Array.from(Buffer.from(inter, "base64")),
  "/fonts/jetbrains-mono.woff2": Uint8Array.from(Buffer.from(jetbrainsMono, "base64")),
};
const FONT_HEADERS = { "Content-Type": "font/woff2", "Cache-Control": "public, max-age=86400" };

/** The page's icon: the logo mark, three white lines on a rounded primary square. */
const ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22"><rect width="22" height="22" rx="7" fill="#4F46E5"/>' +
  '<path d="M7 8h8M7 11h5M7 14h8" stroke="#fff" stroke-width="1.8" stroke-linecap="round" fill="none"/></svg>';

/**
 * The app for the home `home`: `port` is the port the server is bound to, read on every request since port 0 is known
 * only once listening.
 */
export function createApp(home: string, port: () => number): Hono {
  const app = new Hono();
  const json = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": JSON_TYPE } });
  const reply = <T>(r: Reply<T>): Response => json(r.status, r.body);
  /** The page with the token, whose style-nonce meta holds the nonce `secureHeaders` made for this response. */
  const page = (nonce: string): string => html.replace("__THEWAY_TOKEN__", TOKEN).replace("__THEWAY_STYLE_NONCE__", nonce);

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

  app.use(
    "*",
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", NONCE],
        imgSrc: ["'self'", "data:"],
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

  app.get("/", (c) => c.body(page(c.get("secureHeadersNonce") ?? ""), 200, { "Content-Type": "text/html; charset=utf-8" }));
  app.get("/app.js", (c) => c.body(js, 200, { "Content-Type": "text/javascript; charset=utf-8" }));
  app.get("/app.css", (c) => c.body(css, 200, { "Content-Type": "text/css; charset=utf-8" }));
  app.get("/favicon.svg", (c) => c.body(ICON, 200, { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" }));
  for (const [path, bytes] of Object.entries(FONTS)) app.get(path, (c) => c.body(bytes, 200, FONT_HEADERS));

  app.get("/api/v1/changes", () => reply(allChanges(home)));
  app.get("/api/v1/projects/:key/changes/:id", (c) => reply(change(home, c.req.param("key"), c.req.param("id"))));
  app.get("/api/v1/projects/:key/archive/:folder", (c) => reply(archivedChange(home, c.req.param("key"), c.req.param("folder"))));
  app.get("/api/v1/files", () => reply(files(home)));
  app.get("/api/v1/files/global/:kind/:name", (c) => reply(file(home, "global", null, c.req.param("kind"), c.req.param("name"))));
  app.get("/api/v1/files/projects/:key/:kind/:name", (c) => reply(file(home, "project", c.req.param("key"), c.req.param("kind"), c.req.param("name"))));
  app.get("/api/v1/files/global/:kind/:name/versions", (c) => reply(fileVersions(home, "global", null, c.req.param("kind"), c.req.param("name"))));
  app.get("/api/v1/files/projects/:key/:kind/:name/versions", (c) =>
    reply(fileVersions(home, "project", c.req.param("key"), c.req.param("kind"), c.req.param("name"))),
  );
  app.get("/api/v1/files/global/:kind/:name/versions/:id", (c) =>
    reply(fileVersion(home, "global", null, c.req.param("kind"), c.req.param("name"), c.req.param("id"))),
  );
  app.get("/api/v1/files/projects/:key/:kind/:name/versions/:id", (c) =>
    reply(fileVersion(home, "project", c.req.param("key"), c.req.param("kind"), c.req.param("name"), c.req.param("id"))),
  );
  /** The JSON body of a file write, or `NOT_JSON`, checked by the handler after the route's params. */
  const fileBody = async (c: Context): Promise<unknown> => c.req.json().catch(() => NOT_JSON);
  app.post("/api/v1/files/global/:kind/:name/validate", ...writes, async (c) =>
    reply(validateFileText(home, "global", null, c.req.param("kind"), c.req.param("name"), await fileBody(c))),
  );
  app.post("/api/v1/files/projects/:key/:kind/:name/validate", ...writes, async (c) =>
    reply(validateFileText(home, "project", c.req.param("key"), c.req.param("kind"), c.req.param("name"), await fileBody(c))),
  );
  app.put("/api/v1/files/global/:kind/:name", ...writes, async (c) =>
    reply(saveFile(home, "global", null, c.req.param("kind"), c.req.param("name"), await fileBody(c))),
  );
  app.put("/api/v1/files/projects/:key/:kind/:name", ...writes, async (c) =>
    reply(saveFile(home, "project", c.req.param("key"), c.req.param("kind"), c.req.param("name"), await fileBody(c))),
  );

  app.notFound(() => json(404, { error: "not found" }));
  return app;
}
