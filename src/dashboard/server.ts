/**
 * The dashboard's HTTP app: the Content-Security-Policy with a style nonce, the Host guard, the page and its embedded
 * assets, and the read API over the home.
 */
import { Hono } from "hono";
import { NONCE, secureHeaders } from "hono/secure-headers";
import css from "./generated/app.css.txt" with { type: "text" };
import js from "./generated/app.js.txt" with { type: "text" };
import inter from "./generated/inter.woff2.txt" with { type: "text" };
import jetbrainsMono from "./generated/jetbrains-mono.woff2.txt" with { type: "text" };
import { projects } from "./projects";

/** The context variable hono's secure-headers middleware keeps the response's nonce in. */
type Env = { Variables: { secureHeadersNonce?: string } };

const JSON_TYPE = "application/json; charset=utf-8";

/** The two fonts, embedded as base64 text and decoded once. */
const FONTS: Record<string, Uint8Array<ArrayBuffer>> = {
  "/fonts/inter.woff2": Uint8Array.from(Buffer.from(inter, "base64")),
  "/fonts/jetbrains-mono.woff2": Uint8Array.from(Buffer.from(jetbrainsMono, "base64")),
};

const escapeAttr = (v: string): string => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** The page: the app's script and stylesheet, the response's style nonce and the write token. */
function page(nonce: string, token: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theway-nonce" content="${escapeAttr(nonce)}">
<meta name="theway-token" content="${escapeAttr(token)}">
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

  app.get("/", (c) =>
    c.body(page(c.get("secureHeadersNonce") ?? "", token), 200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }),
  );
  app.get("/app.js", (c) => c.body(js, 200, { "Content-Type": "text/javascript; charset=utf-8" }));
  app.get("/app.css", (c) => c.body(css, 200, { "Content-Type": "text/css; charset=utf-8" }));
  for (const [path, bytes] of Object.entries(FONTS)) app.get(path, (c) => c.body(bytes, 200, { "Content-Type": "font/woff2" }));

  app.get("/api/projects", () => {
    const list = projects(home);
    return json(200, { projects: list, start: list.some((p) => p.key === startKey) ? startKey : null });
  });

  app.notFound(() => json(404, { error: "not found" }));
  return app;
}
