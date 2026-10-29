import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { init } from "./core/init";
import { thewayHome } from "./core/io";

const pkgRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const plugin = join(pkgRoot, "plugin");
const PLUGIN_DIRS = [".claude-plugin", "commands"];

function claudeHome(): string {
  const dir = (process.env.CLAUDE_CONFIG_DIR ?? "").trim();
  return dir !== "" ? dir : join(homedir(), ".claude");
}

/** The allow rules for a theway home: `~/.theway` when it is the default home, else its absolute path. */
function rules(home: string): string[] {
  const at = home === join(homedir(), ".theway") ? "~/.theway" : home;
  const read = at.startsWith("~/") ? `${at}/**` : `/${at}/**`;
  return [`Read(${read})`, `Bash(${at}/bin/theway:*)`];
}

function fail(line: string): number {
  process.stderr.write(`${line}\n`);
  return 1;
}

type Settings = { permissions?: { allow?: unknown[] } } & Record<string, unknown>;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** The parsed settings file, `{}` when absent, `null` when not valid settings JSON. */
function readSettings(path: string): Settings | null {
  if (!existsSync(path)) return {};
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
  if (!isObject(data)) return null;
  const perms = data.permissions;
  if (perms !== undefined) {
    if (!isObject(perms)) return null;
    if (perms.allow !== undefined && !Array.isArray(perms.allow)) return null;
  }
  return data as Settings;
}

function writeSettings(path: string, settings: Settings): void {
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(settings, null, 2)}\n`);
  renameSync(tmp, path);
}

function invalidSettings(path: string): number {
  return fail(`theway: ${path} is not valid settings JSON; nothing was changed`);
}

function copyPlugin(home: string): string {
  const tmp = join(home, `.theway-install-${process.pid}`);
  const old = join(home, `.theway-old-${process.pid}`);
  const dest = join(home, "skills", "theway");
  rmSync(tmp, { recursive: true, force: true });
  try {
    for (const dir of PLUGIN_DIRS) {
      cpSync(join(plugin, dir), join(tmp, dir), { recursive: true });
    }
    mkdirSync(join(home, "skills"), { recursive: true });
    if (existsSync(dest)) renameSync(dest, old);
    renameSync(tmp, dest);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  rmSync(old, { recursive: true, force: true });
  return dest;
}

/** `'…'` with every `'` written as `'\''`. */
function shQuote(s: string): string {
  return `'${s.replaceAll("'", "'\\''")}'`;
}

function initHome(home: string): number {
  const bin = join(home, "bin");
  try {
    mkdirSync(bin, { recursive: true });
    copyFileSync(fileURLToPath(import.meta.url), join(bin, "theway.js"));
    writeFileSync(
      join(bin, "theway"),
      `#!/bin/sh\nexec node ${shQuote(join(bin, "theway.js"))} "$@"\n`,
    );
    for (const f of ["theway.js", "theway"]) chmodSync(join(bin, f), 0o755);
  } catch (e) {
    return fail(`theway: ${(e as Error).message}`);
  }
  return init(join(plugin, "templates", "theway"), home);
}

export function install(): number {
  // The copy in ~/.theway/bin has no plugin next to it: installs and updates go through npx.
  if (!existsSync(join(plugin, ".claude-plugin"))) {
    return fail("theway: run `npx --yes github:pixelfactoryio/theway install` to install or update theway");
  }
  const cHome = claudeHome();
  const tHome = thewayHome();
  const settingsPath = join(cHome, "settings.json");

  const settings = readSettings(settingsPath);
  if (settings === null) return invalidSettings(settingsPath);

  const dest = copyPlugin(cHome);

  const status = initHome(tHome);
  if (status !== 0) return status;

  const perms = settings.permissions ?? {};
  const allow = perms.allow ?? [];
  const missing = rules(tHome).filter((r) => !allow.includes(r));
  if (missing.length > 0) {
    settings.permissions = { ...perms, allow: [...allow, ...missing] };
    mkdirSync(cHome, { recursive: true });
    writeSettings(settingsPath, settings);
  }

  const version = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf-8")).version;
  process.stdout.write(
    `Installed theway ${version} to ${dest} (theway@skills-dir) and ${tHome}. Start a new Claude Code session or run /reload-plugins.\n`,
  );
  return 0;
}

export function uninstall(): number {
  const cHome = claudeHome();
  const tHome = thewayHome();
  const settingsPath = join(cHome, "settings.json");

  rmSync(join(cHome, "skills", "theway"), { recursive: true, force: true });

  if (existsSync(settingsPath)) {
    const settings = readSettings(settingsPath);
    if (settings === null) return invalidSettings(settingsPath);
    const allow = settings.permissions?.allow;
    if (Array.isArray(allow)) {
      const drop = rules(tHome);
      const kept = allow.filter((r) => !(typeof r === "string" && drop.includes(r)));
      if (kept.length !== allow.length) {
        settings.permissions = { ...settings.permissions, allow: kept };
        writeSettings(settingsPath, settings);
      }
    }
  }

  process.stdout.write(`Removed theway from ${cHome}. ${tHome} was kept.\n`);
  return 0;
}
