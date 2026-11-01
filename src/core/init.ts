import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";

/** The folders whose `.md` files install ships, relative to the source and the home. */
const SHIPPED_DIRS = ["data/standards", "templates"];
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

/**
 * Writes the shipped standards and templates into `home`: a file the user has not edited is updated,
 * an edited one is kept and the shipped version goes next to it as `<base>.default.md`.
 */
function copyShipped(src: string, home: string): void {
  const previous = readManifest(home);
  const manifest: Manifest = {};
  for (const dir of SHIPPED_DIRS) {
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
      const sibling = `${dir}/${name.slice(0, -".md".length)}.default.md`;
      let removeSibling = true;
      if (!existsSync(dst)) {
        writeAtomic(dst, shipped);
      } else {
        const current = readFileSync(dst);
        if (!current.equals(shipped)) {
          if (typeof old === "string") {
            if (sha256(current) === old) {
              writeAtomic(dst, shipped);
            } else {
              removeSibling = false;
              writeAtomic(`${home}/${sibling}`, shipped);
              process.stdout.write(`Kept your edited ${rel} (shipped version: ${sibling})\n`);
            }
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
      manifest[rel] = sha256(shipped);
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
    copyShipped(src, home);
  } catch (e) {
    process.stderr.write(`theway: ${(e as Error).message}\n`);
    return 1;
  }
  process.stdout.write(`Initialized ${home}\n`);
  return 0;
}
