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
import { parse } from "yaml";
import { removeIfEmpty, writeAtomic } from "./io";
import { parsePromptFile } from "./language";
import { VERSION } from "./language-schema";

/**
 * The folders install ships, relative to the source and the home, with the extension of their files and, for a folder
 * shared with the user's own files, the noun a kept file becomes one of.
 */
const SHIPPED_DIRS: { dir: string; ext: string; shared?: string }[] = [
  { dir: "standards", ext: ".md", shared: "standards" },
  { dir: "templates", ext: ".md" },
  { dir: "workflows", ext: ".yaml", shared: "workflows" },
  { dir: "prompts", ext: ".md", shared: "prompts" },
];
/**
 * The standards and templates theway shipped before they became prompts, with the prompts that now hold them: retired
 * by `retireMoved`.
 */
const MOVED: Record<string, string> = {
  "standards/tamm-framework.md": "prompts/tamm-framework.md",
  "standards/spec-investigation.md": "prompts/spec-investigation.md",
  "standards/spec-review.md":
    "prompts/spec-reviewer.md, grounding.md, implementability.md, verdicts.md, spec-triage.md and spec-fix.md",
  "templates/spec-template.md": "prompts/spec-template.md",
  "templates/fix-spec-template.md": "prompts/fix-spec-template.md",
  "templates/light-spec-template.md": "prompts/light-spec-template.md",
  "templates/tasks-template.md": "prompts/tasks-template.md",
};
/** The folder theway shipped review lenses in before they became prompts: retired by `retireLenses`. */
const LENSES = "lenses";
/** The folder of v1 step files, which theway no longer ships nor reads: retired by `retireSteps`. */
const STEPS = "steps";
/** The folder theway shipped its v1 JSON schemas in, which it no longer ships: retired by `retireSchemas`. */
const SCHEMAS = "schemas";
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
 * Retires `lenses/`, which theway no longer ships nor reads: a lens the previous manifest lists is removed when
 * unedited and kept with a message when edited, every `.default.md` copy is removed, every other `.md` file (the
 * user's own) is kept with a message, and the folder is removed when it is left empty.
 */
function retireLenses(home: string, previous: Manifest | undefined): void {
  const dir = `${home}/${LENSES}`;
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return;
  const move = (name: string) => `theway no longer reads ${LENSES}/; move it to prompts/${name}`;
  const listed = new Set<string>();
  for (const [rel, hash] of Object.entries(previous ?? {})) {
    if (!rel.startsWith(`${LENSES}/`)) continue;
    const name = rel.slice(LENSES.length + 1);
    listed.add(name);
    const path = `${home}/${rel}`;
    if (!existsSync(path)) continue;
    if (sha256(readFileSync(path)) === hash) {
      rmSync(path);
      process.stdout.write(`Removed ${rel}: theway no longer ships it\n`);
    } else {
      process.stdout.write(`Kept your edited ${rel}: ${move(name)}\n`);
    }
  }
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const name = entry.name;
    if (!entry.isFile() || !name.endsWith(".md") || listed.has(name)) continue;
    if (name.endsWith(".default.md")) {
      rmSync(`${dir}/${name}`, { force: true });
      continue;
    }
    process.stdout.write(`Kept ${LENSES}/${name}: ${move(name)}\n`);
  }
  removeIfEmpty(dir);
}

const byName = (a: { name: string }, b: { name: string }) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

/**
 * Retires `steps/`, which theway no longer ships nor reads: in the home, a step file the previous manifest lists is
 * removed when unedited and kept with a message when edited, every `.default.yaml` copy is removed, every other `.yaml`
 * file is kept with the same message; in each `projects/<key>/steps/`, nothing is removed and each `.yaml` file is
 * reported. Each folder is removed when it is left empty.
 */
function retireSteps(home: string, previous: Manifest | undefined): void {
  const why = "theway no longer reads steps/; write its steps in a workflow file";
  const dir = `${home}/${STEPS}`;
  if (existsSync(dir) && statSync(dir).isDirectory()) {
    const listed = new Set<string>();
    for (const [rel, hash] of Object.entries(previous ?? {})) {
      if (!rel.startsWith(`${STEPS}/`)) continue;
      listed.add(rel.slice(STEPS.length + 1));
      const path = `${home}/${rel}`;
      if (!existsSync(path)) continue;
      if (sha256(readFileSync(path)) === hash) {
        rmSync(path);
        process.stdout.write(`Removed ${rel}: theway no longer ships it\n`);
      } else {
        process.stdout.write(`Kept your edited ${rel}: ${why}\n`);
      }
    }
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort(byName)) {
      const name = entry.name;
      if (!entry.isFile() || !name.endsWith(".yaml") || listed.has(name)) continue;
      if (name.endsWith(".default.yaml")) {
        rmSync(`${dir}/${name}`, { force: true });
        continue;
      }
      process.stdout.write(`Kept ${STEPS}/${name}: ${why}\n`);
    }
    removeIfEmpty(dir);
  }
  const projects = `${home}/projects`;
  if (!existsSync(projects) || !statSync(projects).isDirectory()) return;
  for (const project of readdirSync(projects, { withFileTypes: true }).sort(byName)) {
    const own = `${projects}/${project.name}/${STEPS}`;
    if (!project.isDirectory() || !existsSync(own) || !statSync(own).isDirectory()) continue;
    for (const entry of readdirSync(own, { withFileTypes: true }).sort(byName)) {
      if (entry.isFile() && entry.name.endsWith(".yaml")) {
        process.stdout.write(`Kept projects/${project.name}/${STEPS}/${entry.name}: ${why}\n`);
      }
    }
    removeIfEmpty(own);
  }
}

/**
 * Retires `schemas/`, which theway no longer ships: a schema the previous manifest lists is removed when unedited and
 * kept with a message when edited, every `.default.json` copy is removed, every other file is kept silently, and the
 * folder is removed when it is left empty.
 */
function retireSchemas(home: string, previous: Manifest | undefined): void {
  const dir = `${home}/${SCHEMAS}`;
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return;
  for (const [rel, hash] of Object.entries(previous ?? {})) {
    if (!rel.startsWith(`${SCHEMAS}/`)) continue;
    const path = `${home}/${rel}`;
    if (!existsSync(path)) continue;
    if (sha256(readFileSync(path)) === hash) {
      rmSync(path);
      process.stdout.write(`Removed ${rel}: theway no longer ships it\n`);
    } else {
      process.stdout.write(`Kept your edited ${rel}: theway no longer ships it\n`);
    }
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".default.json")) rmSync(`${dir}/${entry.name}`, { force: true });
  }
  removeIfEmpty(dir);
}

/**
 * Retires the standards and templates that moved to `prompts/`, before `copyShipped` reads the manifest: an unedited
 * one is removed, an edited one (or one the manifest does not list) is renamed to its backup path, so that a kept file
 * never becomes a standard every agent gets; their `.default.md` copies are removed and their keys dropped.
 */
function retireMoved(home: string): void {
  const previous = readManifest(home);
  let changed = false;
  for (const [rel, now] of Object.entries(MOVED)) {
    const path = `${home}/${rel}`;
    if (existsSync(path) && statSync(path).isFile()) {
      const current = readFileSync(path);
      if (previous?.[rel] === sha256(current)) {
        rmSync(path);
        process.stdout.write(`Removed ${rel}: theway no longer ships it\n`);
      } else {
        const bak = backupPath(home, rel, current);
        renameSync(path, `${home}/${bak}`);
        process.stdout.write(`Moved your edited ${rel} to ${bak}: theway now reads ${now}\n`);
      }
    }
    rmSync(`${home}/${rel.slice(0, -".md".length)}.default.md`, { force: true });
    if (previous !== undefined && rel in previous) {
      delete previous[rel];
      changed = true;
    }
  }
  if (changed && previous !== undefined) writeManifest(home, previous);
}

/** The `version` of a workflow file's text, or undefined when it does not parse as a map. */
function versionOf(text: string): unknown {
  try {
    const doc: unknown = parse(text);
    return doc !== null && typeof doc === "object" && !Array.isArray(doc) ? (doc as Record<string, unknown>).version : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The line that follows "Kept your edited <dir>/<name>" when the kept file will no longer work: a workflow that is not
 * `theway.workflow/v1beta`, or a prompt with no header whose shipped version has one; else null.
 */
function staleKept(dir: string, name: string, current: Buffer, shipped: Buffer): string | null {
  if (dir === "workflows" && versionOf(current.toString("utf-8")) !== VERSION) {
    const stem = name.slice(0, -".yaml".length);
    return `workflows/${name} is a theway.workflow/v1 file, which theway no longer reads: rewrite it from workflows/${stem}.default.yaml`;
  }
  if (dir === "prompts" && parsePromptFile(current.toString("utf-8")).header === null && parsePromptFile(shipped.toString("utf-8")).header !== null) {
    const stem = name.slice(0, -".md".length);
    return `prompts/${name} has no header, so the workflows that use it fail: merge your edits into prompts/${stem}.default.md and replace it`;
  }
  return null;
}

/**
 * Writes the shipped standards, templates, workflows and prompts into `home`: a file the user has not edited is updated,
 * an edited one is kept and the shipped version goes next to it as `<stem>.default.<ext>`.
 * `standards/`, `workflows/` and `prompts/` are shared with the user's own files: a user file with a shipped name is
 * kept, a file theway stops shipping is removed when unedited, and an orphan `.default.<ext>` copy is removed.
 */
function copyShipped(src: string, home: string): void {
  const previous = readManifest(home);
  retireLenses(home, previous);
  retireSteps(home, previous);
  retireSchemas(home, previous);
  const manifest: Manifest = {};
  for (const { dir, ext, shared } of SHIPPED_DIRS) {
    const isShared = shared !== undefined;
    const stemOf = (name: string) => name.slice(0, -ext.length);
    const defaultExt = `.default${ext}`;
    mkdirSync(`${home}/${dir}`, { recursive: true });
    const names = readdirSync(`${src}/${dir}`, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(ext))
      .map((e) => e.name)
      .sort();
    for (const name of names) {
      const rel = `${dir}/${name}`;
      const dst = `${home}/${rel}`;
      const shipped = readFileSync(`${src}/${rel}`);
      const old = previous?.[rel];
      const sibling = `${dir}/${stemOf(name)}${defaultExt}`;
      let removeSibling = true;
      let record = true;
      if (!existsSync(dst)) {
        writeAtomic(dst, shipped);
      } else {
        const current = readFileSync(dst);
        if (!current.equals(shipped)) {
          if (typeof old === "string" && sha256(current) === old) {
            writeAtomic(dst, shipped);
          } else if (typeof old === "string" || (isShared && previous === undefined)) {
            removeSibling = false;
            writeAtomic(`${home}/${sibling}`, shipped);
            process.stdout.write(`Kept your edited ${rel} (shipped version: ${sibling})\n`);
            const stale = staleKept(dir, name, current, shipped);
            if (stale !== null) process.stdout.write(`${stale}\n`);
          } else if (isShared) {
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
    if (isShared) {
      for (const [rel, hash] of Object.entries(previous ?? {})) {
        if (!rel.startsWith(`${dir}/`) || names.includes(rel.slice(dir.length + 1))) continue;
        const path = `${home}/${rel}`;
        if (!existsSync(path)) continue;
        if (sha256(readFileSync(path)) === hash) {
          rmSync(path);
          process.stdout.write(`Removed ${rel}: theway no longer ships it\n`);
        } else {
          process.stdout.write(`Kept your edited ${rel}: theway no longer ships it, so it is now one of your ${shared}\n`);
        }
      }
      for (const entry of readdirSync(`${home}/${dir}`, { withFileTypes: true })) {
        const file = entry.name;
        if (!entry.isFile() || !file.endsWith(defaultExt)) continue;
        if (!names.includes(`${file.slice(0, -defaultExt.length)}${ext}`)) rmSync(`${home}/${dir}/${file}`, { force: true });
      }
    }
  }
  writeManifest(home, manifest);
}

/** The shipped config text with the `    enabled: false` line directly after `  <key>:` turned on for each key in `enabled`. */
function enableStandards(text: string, enabled: readonly string[]): string {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i + 1] !== "    enabled: false") continue;
    if (enabled.some((key) => lines[i] === `  ${key}:`)) lines[i + 1] = "    enabled: true";
  }
  return lines.join("\n");
}

/**
 * Prints one line per retired key a kept global `config.yaml` still has; edits nothing. A file that does not parse, or
 * is not a map, prints nothing.
 */
function reportRetiredKeys(file: string): void {
  let doc: unknown;
  try {
    doc = parse(readFileSync(file, "utf-8"));
  } catch {
    return;
  }
  const isMap = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
  if (!isMap(doc)) return;
  if (Object.hasOwn(doc, "engineering")) process.stdout.write("Your config.yaml still has engineering: theway ignores it; remove it\n");
  if (Object.hasOwn(doc, "workflow")) {
    process.stdout.write(
      "Your config.yaml still has workflow: theway no longer reads workflow.defaults; set a value in the workflow file or in the prompt's header, and remove the key\n",
    );
  }
}

/** Copies the shipped config, standards, templates, workflows and prompts into `home`; a new `config.yaml` has the `enabled` standards on. */
export function init(src: string, home: string, enabled: readonly string[] = []): number {
  try {
    mkdirSync(home, { recursive: true });
    copyFileSync(`${src}/config.yaml`, `${home}/config.default.yaml`);
    if (existsSync(`${home}/config.yaml`)) {
      process.stdout.write("Kept existing config.yaml (shipped defaults: config.default.yaml)\n");
      reportRetiredKeys(`${home}/config.yaml`);
    } else if (enabled.length === 0) {
      copyFileSync(`${src}/config.yaml`, `${home}/config.yaml`);
    } else {
      writeFileSync(`${home}/config.yaml`, enableStandards(readFileSync(`${src}/config.yaml`, "utf-8"), enabled));
    }
    migrateDataStandards(src, home);
    retireMoved(home);
    copyShipped(src, home);
  } catch (e) {
    process.stderr.write(`theway: ${(e as Error).message}\n`);
    return 1;
  }
  process.stdout.write(`Initialized ${home}\n`);
  return 0;
}
