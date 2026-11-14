import { randomBytes } from "node:crypto";
import type { Server } from "node:http";
import { serve } from "@hono/node-server";
import { createApp } from "../dashboard/server";
import { thewayHome } from "./io";
import { claimKey, keyOf, projectRoot } from "./project";

/**
 * The start project's key: the key derived from the current directory once it claims its folder (`claimKey`). `""`,
 * after a warning line, when that key is longer than 200 characters or its folder is claimed by another root.
 */
function startKey(home: string): string {
  const root = projectRoot();
  const key = keyOf(root);
  if (key.length > 200) {
    process.stderr.write(
      `theway: warning: project key for ${root} is longer than 200 characters; the dashboard has no start project\n`,
    );
    return "";
  }
  const claim = claimKey(home, key, root);
  if (!claim.ok) {
    process.stderr.write(
      `theway: warning: project key ${key} is used by ${claim.recorded}; the dashboard has no start project for ${root}\n`,
    );
    return "";
  }
  if ("warning" in claim) process.stderr.write(`theway: warning: ${claim.warning}\n`);
  return key;
}

/**
 * `theway dashboard [--port <n>]`: serves the dashboard on `127.0.0.1` until SIGINT or SIGTERM. Resolves to the exit
 * code: 0 once stopped by a signal, 1 when the server cannot start.
 */
export function cmdDashboard(port: number): Promise<number> {
  const token = randomBytes(32).toString("hex");
  let bound = port;
  const home = thewayHome();
  const app = createApp(home, () => bound, startKey(home), token);
  return new Promise((done) => {
    let server: Server;
    try {
      server = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, (info) => {
        bound = info.port;
        process.stdout.write(`theway dashboard: http://127.0.0.1:${bound}/\n`);
      }) as Server;
    } catch (e) {
      process.stderr.write(`theway: ${(e as Error).message}\n`);
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
      if (e.code === "EADDRINUSE") process.stderr.write(`theway: port ${port} is in use; pass --port <n>\n`);
      else process.stderr.write(`theway: ${e.message}\n`);
      done(1);
    });
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}
