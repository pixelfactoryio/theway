import type { Server } from "node:http";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { createApp } from "../dashboard/server";
import { isDir, thewayHome } from "./io";
import { projectDir, resolveKey } from "./project";

/**
 * `theway dashboard [--port <n>]`: serves the dashboard on `127.0.0.1` until SIGINT or SIGTERM. Resolves to the exit
 * code: 0 once stopped by a signal, 1 when the server cannot listen.
 */
export function cmdDashboard(port: number): Promise<number> {
  const home = thewayHome();
  const key = isDir(join(home, "projects")) ? resolveKey(undefined) : null;
  const initial = key !== null && isDir(projectDir(home, key)) ? key : null;
  let bound = port;
  const app = createApp(home, initial, () => bound);
  return new Promise((done) => {
    const server = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, (info) => {
      bound = info.port;
      process.stdout.write(`theway dashboard: http://127.0.0.1:${bound}/\n`);
    }) as Server;
    server.on("error", (e: NodeJS.ErrnoException) => {
      if (e.code === "EADDRINUSE") process.stderr.write(`theway: port ${port} is in use; pass --port <n>\n`);
      else process.stderr.write(`theway: ${e.message}\n`);
      done(1);
    });
    const stop = () => {
      server.close(() => done(0));
      server.closeAllConnections();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}
