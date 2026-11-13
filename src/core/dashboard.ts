import { randomBytes } from "node:crypto";
import type { Server } from "node:http";
import { serve } from "@hono/node-server";
import { createApp } from "../dashboard/server";
import { thewayHome } from "./io";
import { keyOf, projectRoot } from "./project";

/**
 * `theway dashboard [--port <n>]`: serves the dashboard on `127.0.0.1` until SIGINT or SIGTERM. Resolves to the exit
 * code: 0 once stopped by a signal, 1 when the server cannot start.
 */
export function cmdDashboard(port: number): Promise<number> {
  const token = randomBytes(32).toString("hex");
  let bound = port;
  const app = createApp(thewayHome(), () => bound, keyOf(projectRoot()), token);
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
