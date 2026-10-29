import { statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** `${THEWAY_HOME:-${HOME}/.theway}`. */
export function thewayHome(): string {
  const dir = process.env.THEWAY_HOME ?? "";
  return dir !== "" ? dir : join(homedir(), ".theway");
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
