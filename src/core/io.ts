import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

/** Where the data home came from: `THEWAY_HOME`, the pointer file, or the default `~/.theway`. */
export type HomeSource = "env" | "pointer" | "default";

/** `~/.theway`, the data home when neither `THEWAY_HOME` nor the pointer names one. */
export function defaultHome(): string {
  return join(homedir(), ".theway");
}

/** `${XDG_CONFIG_HOME:-~/.config}/theway/home`: the data home recorded at install for a custom `THEWAY_HOME`. */
export function pointerPath(): string {
  const xdg = process.env.XDG_CONFIG_HOME ?? "";
  return join(xdg !== "" ? xdg : join(homedir(), ".config"), "theway", "home");
}

/** The trimmed contents of the pointer file, `""` when it is absent, unreadable or empty. */
export function readPointer(): string {
  try {
    return readFileSync(pointerPath(), "utf-8").trim();
  } catch {
    return "";
  }
}

/** The data home and its source: a non-empty `THEWAY_HOME`, else a non-empty pointer, else `~/.theway`. */
export function resolveHome(): { home: string; source: HomeSource } {
  const env = process.env.THEWAY_HOME ?? "";
  if (env !== "") return { home: resolve(env), source: "env" };
  const pointer = readPointer();
  if (pointer !== "") return { home: resolve(pointer), source: "pointer" };
  return { home: defaultHome(), source: "default" };
}

/** The resolved data home (see `resolveHome`). */
export function thewayHome(): string {
  return resolveHome().home;
}

export function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** A workflow, step or prompt name: lowercase letters and digits in words separated by single hyphens. */
export const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Whether `v` is a non-empty list of names without duplicates. */
export const isNameList = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length > 0 && v.every((n) => typeof n === "string" && NAME.test(n)) && new Set(v).size === v.length;

/** The models an agent or a model config key may name. */
export const MODELS = ["opus", "sonnet", "haiku"] as const;

/** `s` with its newlines and carriage returns written as `\n` and `\r`, for an error line. */
export const escaped = (s: string): string => s.replaceAll("\n", "\\n").replaceAll("\r", "\\r");

/** Writes `theway: invalid <kind> name '<wanted>'` and returns true when `wanted` is given and not a name. */
export function invalidName(kind: string, wanted: string | undefined): boolean {
  if (wanted === undefined || NAME.test(wanted)) return false;
  process.stderr.write(`theway: invalid ${kind} name '${escaped(wanted)}'\n`);
  return true;
}
