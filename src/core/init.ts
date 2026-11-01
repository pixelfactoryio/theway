import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";

/** The folders whose `.md` files install ships, relative to the source and the home. */
const SHIPPED_DIRS = ["standards", "templates"];
const MANIFEST = ".shipped.json";

type Manifest = Record<string, string>;

const sha256 = (data: Buffer) => createHash("sha256").update(data).digest("hex");

/** The manifest of the previous install, or undefined when it is missing, unreadable or not valid JSON. */
export function readManifest(home: string): Manifest | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(`${home}/${MANIFEST}`, "utf-8"));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    return parsed as Manifest;
  } catch {
    return undefined;
  }
}

/** Writes `data` to `target` through a temp file in the same folder, so an interrupted write never leaves a truncated target. */
function writeAtomic(target: string, data: string | Buffer): void {
  const tmp = `${target}.tmp-${process.pid}`;
  try {
    writeFileSync(tmp, data);
    renameSync(tmp, target);
  } finally {
    rmSync(tmp, { force: true });
  }
}

function writeManifest(home: string, manifest: Manifest): void {
  writeAtomic(`${home}/${MANIFEST}`, `${JSON.stringify(manifest, null, 2)}\n`);
}

/** `<rel>.bak` when it is free or already holds `current`, else the first free `<rel>.bak.<n>`. */
function backupPath(home: string, rel: string, current: Buffer): string {
  const bak = `${rel}.bak`;
  if (!existsSync(`${home}/${bak}`) || readFileSync(`${home}/${bak}`).equals(current)) return bak;
  for (let n = 1; ; n++) {
    if (!existsSync(`${home}/${bak}.${n}`)) return `${bak}.${n}`;
  }
}

const baseOf = (name: string) => name.slice(0, -".md".length);

/** Removes `dir` when it is an empty folder; true when it is gone. */
function removeIfEmpty(dir: string): boolean {
  if (!existsSync(dir)) return true;
  if (!statSync(dir).isDirectory()) return false;
  if (readdirSync(dir).length > 0) return false;
  rmSync(dir, { recursive: true });
  return true;
}

/**
 * Moves the shipped standards of a home installed with the old layout from `data/standards/` to `standards/`,
 * as they are, and renames their manifest keys. Moves only when the previous manifest has `data/standards/` keys;
 * on every install, removes `data/standards/` and then `data/` when they are empty.
 */
function migrateDataStandards(src: string, home: string): void {
  const previous = readManifest(home);
  const prefix = "data/standards/";
  const keys = Object.keys(previous ?? {}).filter((k) => k.startsWith(prefix));
  if (previous !== undefined && keys.length > 0) {
    const manifest: Manifest = {};
    for (const [key, hash] of Object.entries(previous)) if (!key.startsWith(prefix)) manifest[key] = hash;
    for (const key of keys) {
      const name = key.slice(prefix.length);
      const hash = previous[key] as string;
      const oldPath = `${home}/data/standards/${name}`;
      const newRel = `standards/${name}`;
      const newPath = `${home}/${newRel}`;
      const oldExists = existsSync(oldPath);
      const newExists = existsSync(newPath);
      const oldDefault = `${home}/data/standards/${baseOf(name)}.default.md`;
      const newDefault = `${home}/standards/${baseOf(name)}.default.md`;
      if (!oldExists && newExists) {
        if (existsSync(oldDefault) && !existsSync(newDefault)) renameSync(oldDefault, newDefault);
        manifest[newRel] = hash;
      } else if (!oldExists) {
        // The user deleted it: drop the key.
      } else if (!existsSync(`${src}/standards/${name}`)) {
        process.stdout.write(`Left data/standards/${name}: theway no longer ships it\n`);
      } else if (newExists) {
        process.stdout.write(`Left data/standards/${name}: standards/${name} already exists\n`);
      } else {
        mkdirSync(`${home}/standards`, { recursive: true });
        renameSync(oldPath, newPath);
        if (existsSync(oldDefault) && !existsSync(newDefault)) renameSync(oldDefault, newDefault);
        manifest[newRel] = hash;
      }
    }
    writeManifest(home, manifest);
  }
  const dataGone = removeIfEmpty(`${home}/data/standards`) && removeIfEmpty(`${home}/data`);
  if (keys.length > 0 && !dataGone) process.stdout.write("Left data/: it still holds files theway does not ship\n");
}

/**
 * Writes the shipped standards and templates into `home`: a file the user has not edited is updated,
 * an edited one is kept and the shipped version goes next to it as `<base>.default.md`.
 * `standards/` is shared with the user's global standards: a user file with a shipped name is kept,
 * a standard theway stops shipping is removed when unedited, and an orphan `.default.md` copy is removed.
 */
function copyShipped(src: string, home: string): void {
  const previous = readManifest(home);
  const manifest: Manifest = {};
  for (const dir of SHIPPED_DIRS) {
    const isStandards = dir === "standards";
    mkdirSync(`${home}/${dir}`, { recursive: true });
    const names = readdirSync(`${src}/${dir}`, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => e.name)
      .sort();
    for (const name of names) {
      const rel = `${dir}/${name}`;
      const dst = `${home}/${rel}`;
      const shipped = readFileSync(`${src}/${rel}`);
      const old = previous?.[rel];
      const sibling = `${dir}/${baseOf(name)}.default.md`;
      let removeSibling = true;
      let record = true;
      if (!existsSync(dst)) {
        writeAtomic(dst, shipped);
      } else {
        const current = readFileSync(dst);
        if (!current.equals(shipped)) {
          if (typeof old === "string" && sha256(current) === old) {
            writeAtomic(dst, shipped);
          } else if (typeof old === "string" || (isStandards && previous === undefined)) {
            removeSibling = false;
            writeAtomic(`${home}/${sibling}`, shipped);
            process.stdout.write(`Kept your edited ${rel} (shipped version: ${sibling})\n`);
          } else if (isStandards) {
            removeSibling = false;
            record = false;
            writeAtomic(`${home}/${sibling}`, shipped);
            process.stdout.write(
              `Kept your ${rel}: theway now ships a file with that name (its version: ${sibling})\n`,
            );
          } else {
            removeSibling = false;
            const bak = backupPath(home, rel, current);
            copyFileSync(dst, `${home}/${bak}`);
            writeAtomic(dst, shipped);
            process.stdout.write(`Replaced ${rel}; your previous version is in ${bak}\n`);
          }
        }
      }
      if (removeSibling) rmSync(`${home}/${sibling}`, { force: true });
      if (record) manifest[rel] = sha256(shipped);
    }
    if (isStandards) {
      for (const [rel, hash] of Object.entries(previous ?? {})) {
        if (!rel.startsWith("standards/") || names.includes(rel.slice("standards/".length))) continue;
        const path = `${home}/${rel}`;
        if (!existsSync(path)) continue;
        if (sha256(readFileSync(path)) === hash) {
          rmSync(path);
          process.stdout.write(`Removed ${rel}: theway no longer ships it\n`);
        } else {
          process.stdout.write(`Kept your edited ${rel}: theway no longer ships it, so it is now one of your standards\n`);
        }
      }
      for (const entry of readdirSync(`${home}/${dir}`, { withFileTypes: true })) {
        const file = entry.name;
        if (!entry.isFile() || !file.endsWith(".default.md")) continue;
        if (!names.includes(`${file.slice(0, -".default.md".length)}.md`)) rmSync(`${home}/${dir}/${file}`, { force: true });
      }
    }
  }
  writeManifest(home, manifest);
}

/** Copies the shipped config, standards and templates into `home`. */
export function init(src: string, home: string): number {
  try {
    mkdirSync(home, { recursive: true });
    copyFileSync(`${src}/config.yaml`, `${home}/config.default.yaml`);
    if (existsSync(`${home}/config.yaml`)) {
      process.stdout.write("Kept existing config.yaml (shipped defaults: config.default.yaml)\n");
    } else {
      copyFileSync(`${src}/config.yaml`, `${home}/config.yaml`);
    }
    migrateDataStandards(src, home);
    copyShipped(src, home);
  } catch (e) {
    process.stderr.write(`theway: ${(e as Error).message}\n`);
    return 1;
  }
  process.stdout.write(`Initialized ${home}\n`);
  return 0;
}
