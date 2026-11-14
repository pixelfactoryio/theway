import { randomBytes } from "node:crypto";
import type { Server } from "node:http";
import { serve } from "@hono/node-server";
import { createApp } from "../dashboard/server";
import { thewayHome } from "./io";
import { error, print, warning } from "./output";
import { claimKey, keyOf, projectRoot } from "./project";

/**
 * The start project's key: the key derived from the current directory once it claims its folder (`claimKey`), with
 * the warnings to print. `""`, with a warning, when that key is longer than 200 characters or its folder is claimed by
 * another root.
 */
function startKey(home: string): { key: string; warnings: string[] } {
  const root = projectRoot();
  const key = keyOf(root);
  if (key.length > 200) {
    return {
      key: "",
      warnings: [`project key for ${root} is longer than 200 characters; the dashboard has no start project`],
    };
  }
  const claim = claimKey(home, key, root);
  if (!claim.ok) {
    return {
      key: "",
      warnings: [`project key ${key} is used by ${claim.recorded}; the dashboard has no start project for ${root}`],
    };
  }
  return { key, warnings: "warning" in claim ? [claim.warning] : [] };
}

/**
 * `theway dashboard [--port <n>]`: serves the dashboard on `127.0.0.1` until SIGINT or SIGTERM. Resolves to the exit
 * code: 0 once stopped by a signal, 1 when the server cannot start.
 */
export function cmdDashboard(port: number): Promise<number> {
  const token = randomBytes(32).toString("hex");
  let bound = port;
  const home = thewayHome();
  const start = startKey(home);
  for (const w of start.warnings) warning(w);
  const app = createApp(home, () => bound, start.key, token);
  return new Promise((done) => {
    let server: Server;
    try {
      server = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, (info) => {
        bound = info.port;
        print(`theway dashboard: http://127.0.0.1:${bound}/\n`);
      }) as Server;
    } catch (e) {
      error((e as Error).message);
      done(1);
      return;
    }
    const stop = (): void => {
      server.close(() => done(0));
      server.closeAllConnections();
    };
    server.on("error", (e: NodeJS.ErrnoException) => {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      if (e.code === "EADDRINUSE") error(`port ${port} is in use; pass --port <n>`);
      else error(e.message);
      done(1);
    });
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}
