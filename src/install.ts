import {
  accessSync,
  chmodSync,
  constants,
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isCancel, multiselect, text } from "@clack/prompts";
import { OPT_IN_KEYS } from "./core/config";
import { init } from "./core/init";
import { activeIds } from "./core/store/files";
import { defaultHome, isDir, isFile, pointerPath, readPointer, removeIfEmpty, resolveHome, writeAtomic } from "./core/io";

const self = fileURLToPath(import.meta.url);
const pkgRoot = dirname(dirname(self));
const plugin = join(pkgRoot, "plugin");
const PLUGIN_DIRS = [".claude-plugin", "commands", "workflows"];
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

/** `<home>` as a permission-rule root: `~/.theway`, or `//<abs>` for a custom home. */
function ruleRoot(home: string): string {
  const at = shownHome(home);
  return at.startsWith("~/") ? at : `/${at}`;
}

/** The rules that name a data home: reading it. */
function homeRules(home: string): string[] {
  return [`Read(${ruleRoot(home)}/**)`];
}

/** The rule earlier versions wrote to edit a home's change folders. Never written; install and uninstall remove it. */
function editRule(home: string): string {
  return `Edit(${ruleRoot(home)}/*/changes/**)`;
}

/** The allow rules for a data home: the CLI on `PATH` and reading the home. */
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

const CHANGE_YAML_DOCS = "https://pixelfactoryio.github.io/theway/docs/installation/#changes-written-before-changeyaml";

/** Prints one line when active changes of any project still hold a `tasks.md` and no `change.yaml`. */
function reportTasksMd(home: string): void {
  const projects = join(home, "projects");
  let keys: string[];
  try {
    keys = readdirSync(projects).filter((n) => !n.startsWith(".") && isDir(join(projects, n)));
  } catch {
    return;
  }
  let n = 0;
  for (const key of keys) {
    for (const id of activeIds(join(projects, key))) {
      const dir = join(projects, key, "changes", id);
      if (isFile(join(dir, "tasks.md")) && !existsSync(join(dir, "change.yaml"))) n++;
    }
  }
  if (n === 1) process.stdout.write(`1 change still uses tasks.md: it reads as invalid until it has a change.yaml; see ${CHANGE_YAML_DOCS}\n`);
  else if (n > 1) process.stdout.write(`${n} changes still use tasks.md: they read as invalid until each has a change.yaml; see ${CHANGE_YAML_DOCS}\n`);
}

function fail(line: string): number {
  process.stderr.write(`${line}\n`);
  return 1;
}

type Settings = { permissions?: { allow?: unknown[] } } & Record<string, unknown>;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

type SettingsRead = { settings: Settings } | { invalid: true } | { unreadable: string };

/** The parsed settings file (`{}` when absent), `invalid` when it is not valid settings JSON, or why it cannot be read. */
function readSettings(path: string): SettingsRead {
  if (!existsSync(path)) return { settings: {} };
  let text: string;
  try {
    text = readFileSync(path, "utf-8");
  } catch (e) {
    return { unreadable: (e as Error).message };
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { invalid: true };
  }
  if (!isObject(data)) return { invalid: true };
  const perms = data.permissions;
  if (perms !== undefined) {
    if (!isObject(perms)) return { invalid: true };
    if (perms.allow !== undefined && !Array.isArray(perms.allow)) return { invalid: true };
  }
  return { settings: data as Settings };
}

/** Prints why the settings file at `path` cannot be used, before anything was written. */
function refuseSettings(path: string, read: { invalid: true } | { unreadable: string }): number {
  if ("unreadable" in read) return fail(`theway: cannot read ${path}: ${read.unreadable}; nothing was changed`);
  return invalidSettings(path);
}

/** `path` when it exists, else its closest existing ancestor: the folder a recursive mkdir under `path` writes into. */
function nearestExisting(path: string): string {
  let dir = path;
  while (!existsSync(dir) && dirname(dir) !== dir) dir = dirname(dir);
  return dir;
}

/** `dir` and every folder below it, without following links, `[]` when `dir` is not a folder: removing or moving `dir` writes into each. */
function foldersIn(dir: string): string[] {
  try {
    if (!lstatSync(dir).isDirectory()) return [];
  } catch {
    return [];
  }
  const found = [dir];
  try {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) found.push(...foldersIn(join(dir, e.name)));
    }
  } catch {
    // An unreadable folder: the W_OK check on it reports it.
  }
  return found;
}

/** The first of `paths` that cannot be written, with the reason, or `null` when every one can. */
function writeCheck(paths: readonly string[]): { path: string; reason: string } | null {
  for (const path of new Set(paths)) {
    try {
      accessSync(path, constants.W_OK);
    } catch (e) {
      return { path, reason: (e as Error).message };
    }
  }
  return null;
}

/** Where writing `path` lands: the end of its symlink chain (even a missing file), or why it cannot be written. */
function settingsTarget(path: string): { target: string } | { error: string } {
  let target = path;
  const seen = new Set<string>();
  for (;;) {
    let link: boolean;
    try {
      link = lstatSync(target).isSymbolicLink();
    } catch {
      break; // missing: the chain ends here
    }
    if (!link) break;
    if (seen.has(target) || seen.size >= 40) return { error: "it is a symlink loop" };
    seen.add(target);
    target = resolve(dirname(target), readlinkSync(target));
  }
  // writeSettings creates the missing folders, so the nearest existing one must be writable.
  const dir = nearestExisting(dirname(target));
  try {
    accessSync(dir, constants.W_OK);
  } catch {
    return { error: `${dir} is not writable` };
  }
  return { target };
}

function cannotWrite(path: string, reason: string): number {
  return fail(`theway: cannot write ${path}: ${reason}; nothing was changed`);
}

/** Writes `settings` to `target` (a resolved settingsTarget), keeping its mode, `0600` when new. */
function writeSettings(target: string, settings: Settings): void {
  mkdirSync(dirname(target), { recursive: true });
  const mode = existsSync(target) ? statSync(target).mode & 0o777 : 0o600;
  writeAtomic(target, `${JSON.stringify(settings, null, 2)}\n`, mode);
}

function invalidSettings(path: string): number {
  return fail(`theway: ${path} is not valid settings JSON; nothing was changed`);
}

/** Where copyPlugin moves the previous plugin before it puts the new one in place. */
function oldPlugin(home: string): string {
  return join(home, `.theway-old-${process.pid}`);
}

/** Replaces `<home>/skills/theway` with this plugin, adding its label to `written` once the new folder is in place. */
function copyPlugin(home: string, written: string[]): string {
  const tmp = join(home, `.theway-install-${process.pid}`);
  const old = oldPlugin(home);
  const dest = join(home, "skills", "theway");
  rmSync(tmp, { recursive: true, force: true });
  try {
    for (const dir of PLUGIN_DIRS) {
      cpSync(join(plugin, dir), join(tmp, dir), { recursive: true });
    }
    mkdirSync(join(home, "skills"), { recursive: true });
    if (existsSync(dest)) renameSync(dest, old);
    renameSync(tmp, dest);
    written.push(`the plugin in ${dest}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  rmSync(old, { recursive: true, force: true });
  return dest;
}

/** True when `path` is a regular file whose text passes `match`; false when absent, unreadable or not a regular file. */
function legacyText(path: string, match: (text: string) => boolean): boolean {
  try {
    return lstatSync(path).isFile() && match(readFileSync(path, "utf-8"));
  } catch {
    return false;
  }
}

/** The files of the 0.2.0 launcher (`bin/theway`, `bin/theway.js`) in `~/.theway` and `home`, only those 0.2.0 wrote. */
function legacyBinFiles(home: string): string[] {
  const files: string[] = [];
  for (const h of new Set([defaultHome(), resolve(home)])) {
    const bin = join(h, "bin");
    if (legacyText(join(bin, "theway"), (t) => t.startsWith('#!/bin/sh\nexec node ') && t.endsWith(`theway.js' "$@"\n`))) {
      files.push(join(bin, "theway"));
    }
    if (legacyText(join(bin, "theway.js"), (t) => t.startsWith("#!/usr/bin/env node\n"))) {
      files.push(join(bin, "theway.js"));
    }
  }
  return files;
}

/** Removes the 0.2.0 launcher, then each `bin/` left empty, from `~/.theway` and `home`; returns the `bin/` folders it removed files from. */
function removeLegacyBin(home: string): string[] {
  const files = legacyBinFiles(home);
  for (const file of files) rmSync(file, { force: true });
  for (const h of new Set([defaultHome(), resolve(home)])) removeIfEmpty(join(h, "bin"));
  return [...new Set(files.map((f) => dirname(f)))];
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

/** The opt-in standards' descriptions, keyed by opt-in key: the comment above each key in the shipped `config.yaml`. */
export const OPT_IN_HINTS: Record<string, string> = {
  core_principles: "Architecture philosophy (simplicity, security, pragmatic technology)",
  sre: "SRE operational excellence (reliability, observability, automation)",
  web_development: "Frontend, API and backend standards with web performance targets",
  quality: "Testing, deployment, monitoring and security expectations",
};

const CANCELLED = "theway: install cancelled; nothing was changed";

/** `value` as an absolute path: `~` and `~/<rest>` under the user's home, an absolute path resolved; anything else is an error. */
export function expandHome(value: string): string | { error: string } {
  const v = value.trim();
  if (v === "") return { error: "must not be empty" };
  if (v === "~") return homedir();
  if (v.startsWith("~/")) return resolve(homedir(), v.slice(2));
  if (isAbsolute(v)) return resolve(v);
  return { error: "must be an absolute path or start with ~/" };
}

/** The opt-in keys `--standards` names, `[]` for `none`, or the line install fails with. */
function parseStandards(value: string): string[] | { error: string } {
  if (value === "none") return [];
  const elements = value.split(",");
  const unknownError = (element: string) => ({
    error: `theway: unknown standard '${element}' in --standards; valid: ${OPT_IN_KEYS.join(", ")}, or none`,
  });
  const unknown = elements.find((e) => e !== "none" && !OPT_IN_KEYS.includes(e));
  if (unknown !== undefined) return unknownError(unknown);
  if (!elements.includes("none")) return elements;
  if (elements.some((e) => e !== "none")) {
    return { error: "theway: --standards none cannot be combined with other standards" };
  }
  return unknownError("none");
}

/** True when stdin and stdout are both terminals: only then does install ask. */
function interactive(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

/** Asks where to keep the data home; `null` when the user cancels. */
async function askHome(): Promise<string | null> {
  const answer = await text({
    message: "Where should theway keep its data?",
    placeholder: "~/.theway",
    defaultValue: "~/.theway",
    validate: (value) => {
      if (value === undefined || value.trim() === "") return undefined;
      const home = expandHome(value);
      if (typeof home !== "string") return home.error;
      const reason = unsafeHomeReason(home, home !== resolve(defaultHome()));
      return reason !== "" ? `refusing ${home}: ${reason}` : undefined;
    },
  });
  if (isCancel(answer)) return null;
  const home = expandHome(answer.trim() === "" ? "~/.theway" : answer);
  // validate accepted it, so it expands.
  return typeof home === "string" ? home : null;
}

/** Asks which opt-in standards to enable; `null` when the user cancels. */
async function askStandards(): Promise<string[] | null> {
  const answer = await multiselect({
    message: "Enable opt-in standards",
    options: OPT_IN_KEYS.map((key) => ({ value: key, label: key, hint: OPT_IN_HINTS[key] })),
    required: false,
  });
  return isCancel(answer) ? null : answer;
}

/** The folders and files install writes into directly, each of which must be writable before its first write. */
function installTargets(cHome: string, tHome: string, dir: string, custom: boolean): string[] {
  const targets: string[] = [];
  // copyPlugin writes <cHome>/.theway-install-<pid> and moves the previous plugin out to <cHome>/.theway-old-<pid>.
  targets.push(nearestExisting(cHome), nearestExisting(join(cHome, "skills")));
  targets.push(...foldersIn(join(cHome, "skills", "theway")));
  targets.push(...legacyBinFiles(tHome).map((f) => dirname(f)));
  // writeBinary creates the folder when missing, else writes and renames in it.
  targets.push(nearestExisting(dir));
  const home = resolve(tHome);
  targets.push(nearestExisting(home));
  if (isDir(home)) {
    let names: string[] = [];
    try {
      names = readdirSync(home);
    } catch {
      // An unreadable home: init's failure is reported once the writes run.
    }
    for (const name of names) {
      if (isDir(join(home, name))) targets.push(join(home, name));
    }
    const defaults = join(home, "config.default.yaml");
    if (existsSync(defaults)) targets.push(defaults);
  }
  const pointer = pointerPath();
  if (custom) {
    targets.push(nearestExisting(dirname(pointer)));
    // writePointer overwrites the file in place.
    if (occupied(pointer)) targets.push(pointer);
  } else if (occupied(pointer)) {
    targets.push(dirname(pointer));
  }
  return targets;
}

export async function install(opts: { home?: string; standards?: string }): Promise<number> {
  // An installed copy has no plugin next to it: installs and updates go through npx.
  if (!existsSync(join(plugin, ".claude-plugin"))) {
    return fail("theway: run `npx --yes @pixelfactoryio/theway@latest install` to install or update theway");
  }

  let enabled: string[] = [];
  if (opts.standards !== undefined) {
    const parsed = parseStandards(opts.standards);
    if (!Array.isArray(parsed)) return fail(parsed.error);
    enabled = parsed;
  }

  const cHome = claudeHome();
  let tHome: string;
  if (opts.home !== undefined) {
    const home = expandHome(opts.home);
    if (typeof home !== "string") return fail(`theway: invalid --home '${opts.home}': ${home.error}; nothing was changed`);
    const env = process.env.THEWAY_HOME ?? "";
    if (env !== "" && resolve(env) !== home) {
      return fail(
        `theway: --home ${home} and THEWAY_HOME ${resolve(env)} differ; unset THEWAY_HOME or drop --home; nothing was changed`,
      );
    }
    tHome = home;
  } else {
    // THEWAY_HOME, else the pointer: an install run without THEWAY_HOME (as a reinstall usually is) keeps the recorded home.
    const found = resolveHome();
    const neverInstalled = found.source === "default" && !existsSync(join(defaultHome(), "config.yaml"));
    if (neverInstalled && interactive()) {
      const home = await askHome();
      if (home === null) return fail(CANCELLED);
      tHome = home;
    } else {
      tHome = found.home;
    }
  }
  const previous = recordedHome();
  const custom = tHome !== resolve(defaultHome());
  const dir = installDir();
  const settingsPath = join(cHome, "settings.json");

  const unsafe = unsafeHomeReason(tHome, custom);
  if (unsafe !== "") {
    return fail(`theway: refusing data home ${resolve(tHome)}: ${unsafe}; set THEWAY_HOME or --home to a dedicated folder`);
  }

  const resolved = settingsTarget(settingsPath);
  if ("error" in resolved) return cannotWrite(settingsPath, resolved.error);
  const read = readSettings(resolved.target);
  if (!("settings" in read)) return refuseSettings(settingsPath, read);
  const settings = read.settings;

  // Never replace another program that happens to be called theway: uninstall would not remove it either.
  const target = join(dir, "theway");
  if (occupied(target) && !isThewayBinary(target)) {
    return fail(
      `theway: ${target} exists and is not a theway binary; nothing was changed. Remove it, or set THEWAY_INSTALL_DIR to another folder`,
    );
  }

  const config = join(resolve(tHome), "config.yaml");
  const firstInstall = !existsSync(config);
  if (opts.standards !== undefined && !firstInstall) {
    return fail(
      `theway: --standards applies only to a first install; ${config} exists, so set standards.<key>.enabled there instead; nothing was changed`,
    );
  }
  const asked = firstInstall && opts.standards === undefined && interactive();
  if (asked) {
    const chosen = await askStandards();
    if (chosen === null) return fail(CANCELLED);
    enabled = chosen;
  }

  const unwritable = writeCheck(installTargets(cHome, tHome, dir, custom));
  if (unwritable !== null) return cannotWrite(unwritable.path, unwritable.reason);

  // No rollback: a failure from here on names what was already written.
  const written: string[] = [];
  const stopped = (message: string): number => {
    const done = written.length > 0 ? `already written: ${written.join(", ")}` : "nothing was written";
    const old = oldPlugin(cHome);
    const kept = existsSync(old) ? `; the previous plugin is in ${old}` : "";
    return fail(`theway: install stopped: ${message}; ${done}${kept}`);
  };
  let dest: string;
  let binary: string;
  try {
    dest = copyPlugin(cHome, written);
    const cleared = removeLegacyBin(tHome);
    if (cleared.length > 0) written.push(`removed the old launchers in ${cleared.join(", ")}`);
    binary = writeBinary(dir);
    written.push(`the theway binary at ${binary}`);
    // init prints its own error line first.
    if (init(join(plugin, "home"), tHome, enabled) !== 0) return stopped("the data home could not be written");
    written.push(`the data home ${tHome}`);
    reportTasksMd(tHome);
    if (firstInstall && opts.standards === undefined && !asked) {
      process.stdout.write(
        `Opt-in standards are off (${OPT_IN_KEYS.join(", ")}): set standards.<key>.enabled: true in ${config} to enable one\n`,
      );
    }
    const hadPointer = occupied(pointerPath());
    writePointer(tHome, custom);
    if (custom) written.push(`the home pointer ${pointerPath()}`);
    else if (hadPointer) written.push(`removed the home pointer ${pointerPath()}`);

    const perms = settings.permissions ?? {};
    const allow = perms.allow ?? [];
    // The 0.2.0 rules, the Edit rule of earlier versions, and the rules of the previous home when the home changed.
    const current = rules(tHome);
    const stale = [
      ...legacyRules(tHome),
      editRule(tHome),
      editRule(previous),
      ...homeRules(previous).filter((r) => !current.includes(r)),
    ];
    const kept = allow.filter((r) => !(typeof r === "string" && stale.includes(r)));
    const missing = current.filter((r) => !kept.includes(r));
    if (missing.length > 0 || kept.length !== allow.length) {
      settings.permissions = { ...perms, allow: [...kept, ...missing] };
      // The last write: it gets no label.
      mkdirSync(cHome, { recursive: true });
      writeSettings(resolved.target, settings);
    }
  } catch (e) {
    return stopped((e as Error).message);
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
  let settingsFile = settingsPath;
  if (occupied(settingsPath)) {
    const resolved = settingsTarget(settingsPath);
    if ("error" in resolved) return cannotWrite(settingsPath, resolved.error);
    settingsFile = resolved.target;
  }
  let settings: Settings | undefined;
  if (existsSync(settingsPath)) {
    const read = readSettings(settingsFile);
    if (!("settings" in read)) return refuseSettings(settingsPath, read);
    settings = read.settings;
  }

  const plugin = join(cHome, "skills", "theway");
  const hadPlugin = occupied(plugin);
  // Only a theway binary is removed, never another program that happens to be called theway.
  const binary = join(installDir(), "theway");
  const removed = isThewayBinary(binary);
  const pointer = pointerPath();
  const hadPointer = occupied(pointer);
  const targets = [
    ...(hadPlugin ? [join(cHome, "skills"), ...foldersIn(plugin)] : []),
    ...(removed ? [installDir()] : []),
    ...(hadPointer ? [dirname(pointer)] : []),
  ];
  const unwritable = writeCheck(targets);
  if (unwritable !== null) return cannotWrite(unwritable.path, unwritable.reason);

  // No rollback: a failure from here on names what was already removed.
  const gone: string[] = [];
  try {
    rmSync(plugin, { recursive: true, force: true });
    if (hadPlugin) gone.push(`the plugin in ${plugin}`);
    if (removed) {
      rmSync(binary, { force: true });
      gone.push(`the theway binary at ${binary}`);
    }
    rmSync(pointer, { force: true });
    removeIfEmpty(dirname(pointer));
    if (hadPointer) gone.push(`the home pointer ${pointer}`);

    const allow = settings?.permissions?.allow;
    if (settings !== undefined && Array.isArray(allow)) {
      const drop = homes.flatMap((h) => [...rules(h), ...legacyRules(h), editRule(h)]);
      const kept = allow.filter((r) => !(typeof r === "string" && drop.includes(r)));
      if (kept.length !== allow.length) {
        settings.permissions = { ...settings.permissions, allow: kept };
        // The last write: it gets no label.
        writeSettings(settingsFile, settings);
      }
    }
  } catch (e) {
    const done = gone.length > 0 ? `already removed: ${gone.join(", ")}` : "nothing was removed";
    return fail(`theway: uninstall stopped: ${(e as Error).message}; ${done}`);
  }

  const bin = removed ? ` and ${binary}` : "";
  process.stdout.write(`Removed theway from ${cHome}${bin}. ${tHome} was kept.\n`);
  return 0;
}
