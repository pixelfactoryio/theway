import {
  accessSync,
  chmodSync,
  constants,
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { init } from "./core/init";
import { defaultHome, isFile, pointerPath, readPointer, resolveHome } from "./core/io";

const self = fileURLToPath(import.meta.url);
const pkgRoot = dirname(dirname(self));
const plugin = join(pkgRoot, "plugin");
const PLUGIN_DIRS = [".claude-plugin", "commands"];
/** Present in every theway CLI bundle: tells the copy install wrote from another program named `theway`. */
const BINARY_MARKER = "theway-cli-binary:pixelfactoryio/theway";

function claudeHome(): string {
  const dir = (process.env.CLAUDE_CONFIG_DIR ?? "").trim();
  return dir !== "" ? dir : join(homedir(), ".claude");
}

/** `${THEWAY_INSTALL_DIR:-~/.local/bin}`: where install writes the `theway` binary. */
function installDir(): string {
  const dir = process.env.THEWAY_INSTALL_DIR ?? "";
  return dir !== "" ? resolve(dir) : join(homedir(), ".local", "bin");
}

/** `~/.theway` when `home` is the default home, else its absolute path. */
function shownHome(home: string): string {
  return resolve(home) === resolve(defaultHome()) ? "~/.theway" : resolve(home);
}

/** The rules that name a data home: reading it and editing its change folders. */
function homeRules(home: string): string[] {
  const at = shownHome(home);
  const root = at.startsWith("~/") ? at : `/${at}`;
  return [`Read(${root}/**)`, `Edit(${root}/*/changes/**)`];
}

/** The allow rules for a data home: the CLI on `PATH`, reading the home, editing its change folders. */
function rules(home: string): string[] {
  return ["Bash(theway:*)", ...homeRules(home)];
}

/** The home the pointer names, `~/.theway` when there is no pointer: the home of the last install. */
function recordedHome(): string {
  const pointer = readPointer();
  return pointer !== "" ? resolve(pointer) : defaultHome();
}

/** The 0.2.0 rules for the launcher in `<home>/bin`, for `~/.theway` and for `home`. */
function legacyRules(home: string): string[] {
  return [...new Set(["Bash(~/.theway/bin/theway:*)", `Bash(${shownHome(home)}/bin/theway:*)`])];
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

/** The file `path` names: its link target when it is a symlink (even a dangling one), else `path`. */
function settingsTarget(path: string): string {
  let link = false;
  try {
    link = lstatSync(path).isSymbolicLink();
  } catch {
    // absent
  }
  if (!link) return path;
  let target: string;
  try {
    target = realpathSync(path);
  } catch {
    target = resolve(dirname(path), readlinkSync(path));
  }
  mkdirSync(dirname(target), { recursive: true });
  return target;
}

/** Writes `settings` to the file `path` names (through a symlink), keeping its mode, `0600` when new. */
function writeSettings(path: string, settings: Settings): void {
  const target = settingsTarget(path);
  const mode = existsSync(target) ? statSync(target).mode & 0o777 : 0o600;
  const tmp = `${target}.tmp-${process.pid}`;
  try {
    writeFileSync(tmp, `${JSON.stringify(settings, null, 2)}\n`, { mode });
    // The umask, or a stale tmp file, may have left another mode.
    chmodSync(tmp, mode);
    renameSync(tmp, target);
  } finally {
    rmSync(tmp, { force: true });
  }
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

/** Removes `dir` when it is an empty directory. */
function removeIfEmpty(dir: string): void {
  try {
    rmdirSync(dir);
  } catch {
    // absent or not empty
  }
}

/** True when `path` is a regular file whose text passes `match`; false when absent, unreadable or not a regular file. */
function legacyText(path: string, match: (text: string) => boolean): boolean {
  try {
    return lstatSync(path).isFile() && match(readFileSync(path, "utf-8"));
  } catch {
    return false;
  }
}

/** Removes the 0.2.0 launcher (`bin/theway`, `bin/theway.js`, then `bin/` when empty) from `~/.theway` and `home`, only the files 0.2.0 wrote. */
function removeLegacyBin(home: string): void {
  for (const h of new Set([defaultHome(), resolve(home)])) {
    const bin = join(h, "bin");
    if (legacyText(join(bin, "theway"), (t) => t.startsWith('#!/bin/sh\nexec node ') && t.endsWith(`theway.js' "$@"\n`))) {
      rmSync(join(bin, "theway"), { force: true });
    }
    if (legacyText(join(bin, "theway.js"), (t) => t.startsWith("#!/usr/bin/env node\n"))) {
      rmSync(join(bin, "theway.js"), { force: true });
    }
    removeIfEmpty(bin);
  }
}

/** Copies this CLI to `<dir>/theway`, executable, replacing any previous copy in one rename. */
function writeBinary(dir: string): string {
  const dest = join(dir, "theway");
  const tmp = join(dir, `.theway-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  try {
    copyFileSync(self, tmp);
    chmodSync(tmp, 0o755);
    renameSync(tmp, dest);
  } finally {
    rmSync(tmp, { force: true });
  }
  return dest;
}

/** True when something (a file, a folder, a link, even a broken one) is at `path`. */
function occupied(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

/** True when `path` is a theway CLI binary, as install writes it. */
function isThewayBinary(path: string): boolean {
  if (!isFile(path)) return false;
  try {
    const text = readFileSync(path, "utf-8");
    return text.startsWith("#!/usr/bin/env node") && text.includes(BINARY_MARKER);
  } catch {
    return false;
  }
}

/** Writes the pointer to `home` for a custom home, removes it for the default home. */
function writePointer(home: string, custom: boolean): void {
  const path = pointerPath();
  if (custom) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${home}\n`);
  } else {
    rmSync(path, { force: true });
  }
}

function realpathOr(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

/** Why install must not write rules for `tHome`, `""` when it may: the rules would cover far more than theway's files. */
function unsafeHomeReason(tHome: string, custom: boolean): string {
  const home = resolve(tHome);
  const real = realpathOr(home);
  const user = realpathOr(homedir());
  if (real === user || user.startsWith(real + sep) || real === "/") {
    return "it is your home folder or one of its parents";
  }
  // The default home goes into the rules as the literal ~/.theway, whatever $HOME holds.
  if (custom && /[*?[\]{}\n\r]/.test(home)) return "it contains a glob character or a line break";
  return "";
}

/** Every executable `theway` on `PATH`, in `PATH` order, without the npx copy running this install. */
function copiesOnPath(): string[] {
  const running = realpathOr(self);
  const seen = new Set<string>();
  const copies: string[] = [];
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (dir === "") continue;
    const candidate = join(dir, "theway");
    if (!isFile(candidate)) continue;
    try {
      accessSync(candidate, constants.X_OK);
    } catch {
      continue;
    }
    const real = realpathOr(candidate);
    if (real === running || seen.has(real)) continue;
    seen.add(real);
    copies.push(candidate);
  }
  return copies;
}

/** Prints how to put `dir` on `PATH` when it is missing, and warns when another `theway` comes first. */
function checkPath(dir: string, binary: string): void {
  const dirs = (process.env.PATH ?? "").split(delimiter).filter((d) => d !== "");
  if (!dirs.some((d) => resolve(d) === dir)) {
    process.stdout.write(`Add ${dir} to your PATH, e.g.: export PATH="${dir}:$PATH"\n`);
  }
  const copies = copiesOnPath();
  if (copies.length > 0 && realpathOr(copies[0]) !== realpathOr(binary)) {
    process.stderr.write(
      `theway: warning: ${copies[0]} comes before ${binary} on PATH, so the commands run it; theway copies on PATH: ${copies.join(", ")}\n`,
    );
  }
}

export function install(): number {
  // An installed copy has no plugin next to it: installs and updates go through npx.
  if (!existsSync(join(plugin, ".claude-plugin"))) {
    return fail("theway: run `npx --yes @pixelfactoryio/theway@latest install` to install or update theway");
  }
  const cHome = claudeHome();
  // THEWAY_HOME, else the pointer: an install run without THEWAY_HOME (as /theway:setup usually is) keeps the recorded home.
  const tHome = resolveHome().home;
  const previous = recordedHome();
  const custom = tHome !== resolve(defaultHome());
  const dir = installDir();
  const settingsPath = join(cHome, "settings.json");

  const unsafe = unsafeHomeReason(tHome, custom);
  if (unsafe !== "") {
    return fail(`theway: refusing data home ${resolve(tHome)}: ${unsafe}; set THEWAY_HOME to a dedicated folder`);
  }

  const settings = readSettings(settingsPath);
  if (settings === null) return invalidSettings(settingsPath);

  // Never replace another program that happens to be called theway: uninstall would not remove it either.
  const target = join(dir, "theway");
  if (occupied(target) && !isThewayBinary(target)) {
    return fail(
      `theway: ${target} exists and is not a theway binary; nothing was changed. Remove it, or set THEWAY_INSTALL_DIR to another folder`,
    );
  }

  const dest = copyPlugin(cHome);

  let binary: string;
  try {
    removeLegacyBin(tHome);
    binary = writeBinary(dir);
  } catch (e) {
    return fail(`theway: ${(e as Error).message}`);
  }
  const status = init(join(plugin, "templates", "theway"), tHome);
  if (status !== 0) return status;
  try {
    writePointer(tHome, custom);
  } catch (e) {
    return fail(`theway: ${(e as Error).message}`);
  }

  const perms = settings.permissions ?? {};
  const allow = perms.allow ?? [];
  // The 0.2.0 rules, and the rules of the previous home when the home changed.
  const current = rules(tHome);
  const stale = [...legacyRules(tHome), ...homeRules(previous).filter((r) => !current.includes(r))];
  const kept = allow.filter((r) => !(typeof r === "string" && stale.includes(r)));
  const missing = current.filter((r) => !kept.includes(r));
  if (missing.length > 0 || kept.length !== allow.length) {
    settings.permissions = { ...perms, allow: [...kept, ...missing] };
    mkdirSync(cHome, { recursive: true });
    writeSettings(settingsPath, settings);
  }

  checkPath(dir, binary);

  const version = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf-8")).version;
  process.stdout.write(
    `Installed theway ${version} to ${dest} (theway@skills-dir), ${binary} and ${tHome}. Start a new Claude Code session or run /reload-plugins.\n`,
  );
  return 0;
}

export function uninstall(): number {
  const cHome = claudeHome();
  const tHome = resolveHome().home;
  // Every home theway may have rules for: the resolved one, the one the pointer names, and ~/.theway.
  const homes = [...new Set([tHome, recordedHome(), defaultHome()])];
  const settingsPath = join(cHome, "settings.json");

  rmSync(join(cHome, "skills", "theway"), { recursive: true, force: true });

  // Only a theway binary is removed, never another program that happens to be called theway.
  const binary = join(installDir(), "theway");
  const removed = isThewayBinary(binary);
  if (removed) rmSync(binary, { force: true });
  rmSync(pointerPath(), { force: true });
  removeIfEmpty(dirname(pointerPath()));

  if (existsSync(settingsPath)) {
    const settings = readSettings(settingsPath);
    if (settings === null) return invalidSettings(settingsPath);
    const allow = settings.permissions?.allow;
    if (Array.isArray(allow)) {
      const drop = homes.flatMap((h) => [...rules(h), ...legacyRules(h)]);
      const kept = allow.filter((r) => !(typeof r === "string" && drop.includes(r)));
      if (kept.length !== allow.length) {
        settings.permissions = { ...settings.permissions, allow: kept };
        writeSettings(settingsPath, settings);
      }
    }
  }

  const bin = removed ? ` and ${binary}` : "";
  process.stdout.write(`Removed theway from ${cHome}${bin}. ${tHome} was kept.\n`);
  return 0;
}
