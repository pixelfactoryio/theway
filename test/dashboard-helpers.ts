/** Shared by the dashboard file tests: temp homes, a running dashboard and raw requests to it. */
import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
export const CLI = join(ROOT, "dist", "theway.js");
export const SHIPPED_HOME = join(ROOT, "plugin", "home");

const homes: string[] = [];
const servers: ChildProcess[] = [];

/** Kills the servers started and removes the homes made since the last call. */
export function cleanup(): void {
  for (const s of servers.splice(0)) s.kill("SIGTERM");
  for (const d of homes.splice(0)) rmSync(d, { recursive: true, force: true });
}

export function put(path: string, text: string): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text);
}

/** A home holding the shipped config and convention standards, the shipped workflows and prompts, and a project `p`. */
export function shippedHome(): string {
  const dir = mkdtempSync(join(tmpdir(), "theway-edit-"));
  homes.push(dir);
  const shipped = (rel: string) => readFileSync(join(SHIPPED_HOME, rel), "utf-8");
  for (const rel of ["config.yaml", "standards/commits.md", "standards/git-host.md"]) put(join(dir, rel), shipped(rel));
  for (const folder of ["workflows", "prompts"]) {
    for (const f of readdirSync(join(SHIPPED_HOME, folder))) put(join(dir, folder, f), readFileSync(join(SHIPPED_HOME, folder, f), "utf-8"));
  }
  mkdirSync(join(dir, "projects", "p"), { recursive: true });
  return dir;
}

/** Starts `theway dashboard` on `dir`; resolves to its port and its write token, read from the page. */
export async function start(dir: string): Promise<{ port: number; token: string }> {
  const proc = spawn("node", [CLI, "dashboard", "--port", "0"], { env: { ...process.env, THEWAY_HOME: dir }, stdio: ["ignore", "pipe", "pipe"] });
  servers.push(proc);
  const port = await new Promise<number>((resolve, reject) => {
    let out = "";
    proc.stdout?.on("data", (b: Buffer) => {
      out += b.toString();
      const m = /^theway dashboard: http:\/\/127\.0\.0\.1:([0-9]+)\/\n$/.exec(out);
      if (m !== null) resolve(Number(m[1]));
    });
    proc.on("exit", (code) => reject(new Error(`dashboard exited ${code}`)));
  });
  const page = await send(port, "GET", "/", {});
  const m = /<meta name="theway-token" content="([0-9a-f]{64})" \/>/.exec(page.body);
  if (m === null) throw new Error("no token in the page");
  return { port, token: m[1] as string };
}

type Res = { status: number; body: string; json: () => Record<string, unknown> };

/** One request with exactly the headers given, plus Host and Connection. */
export function send(port: number, method: string, path: string, headers: Record<string, string>, body?: string | Buffer): Promise<Res> {
  return new Promise((resolve, reject) => {
    const length: Record<string, string> = body === undefined ? {} : { "Content-Length": String(Buffer.byteLength(body)) };
    const all = { Host: `127.0.0.1:${port}`, Connection: "close", ...length, ...headers };
    const req = request({ host: "127.0.0.1", port, path, method, headers: all }, (res) => {
      let text = "";
      res.setEncoding("utf-8");
      res.on("data", (c: string) => {
        text += c;
      });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: text, json: () => JSON.parse(text) }));
    });
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}
