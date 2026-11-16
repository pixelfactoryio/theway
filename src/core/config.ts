import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { stringify } from "yaml"
import { readManifest } from "./init"
import { isFile, thewayHome } from "./io"
import { error, print, type Warn, warnLoud } from "./output"
import { projectDir, projectKeyOrExit } from "./project"
import { parseYaml } from "./text"

/** An empty map with no prototype, so every key, `__proto__` included, is an own property. */
const dict = <T>(): T => Object.create(null) as T

/** The shipped opt-in standards of `<home>/standards/`, in output order: off unless their switch is on. */
const OPT_IN = ["core-principles.md", "sre.md", "web-development.md", "quality.md"]
/**
 * The shipped standards the commands always read by path: a global file with one of these names is never listed nor
 * switchable; `authority.md` only when `.shipped.json` lists it, else it is the user's own standard.
 */
const CORE = ["interaction.md", "develop.md", "authority.md"]
/**
 * The shipped convention standards the prompts read by path, the project file over the global one: never listed from
 * either folder nor switchable.
 */
const CONVENTIONS = ["commits.md", "git-host.md"]

/** The `standards.<key>` of a standard file: its stem with `-` turned into `_`. */
const keyOf = (name: string): string => name.slice(0, -".md".length).replaceAll("-", "_")
export const OPT_IN_KEYS = OPT_IN.map(keyOf)
/** The `standards.<key>` names that warn `cannot be switched`: the core ones (unless a project file holds one) and the conventions. */
const FIXED_KEYS = new Set([...CORE, ...CONVENTIONS].map(keyOf))

/**
 * A standard a project can read: its path, its switch, whether it is a shipped opt-in one and, for a global file, the
 * path of the project file with the same name that replaces it for the phases that file applies to.
 */
type Standard = { path: string; key: string; optIn: boolean; shadowedBy?: string }

/** The names of the regular `.md` files directly in `dir`, sorted; none when it is missing. */
function mdFiles(dir: string): string[] {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }
  return names.filter((n) => n.endsWith(".md") && isFile(join(dir, n))).sort()
}

/**
 * Every standard of a project before any phase filter: the global folder's files, sorted, then the project's, sorted.
 * A convention name is left out of both folders. A global file is classified by name: a core name is left out, an opt-in name is an opt-in standard, any other name
 * `.shipped.json` lists as `standards/<name>` and any `*.default.md` is left out, the rest are user standards. A project
 * file is a user standard; a global file with the same name is kept and records it in `shadowedBy`, so that the phase
 * filter drops the global file only for the phases the project file applies to.
 */
function standardsOf(home: string, key: string): Standard[] {
  const globalDir = join(home, "standards")
  const ownDir = join(projectDir(home, key), "standards")
  const projectNames = mdFiles(ownDir).filter((n) => !CONVENTIONS.includes(n))
  const shipped = readManifest(home) ?? {}
  const out: Standard[] = []
  for (const name of mdFiles(globalDir)) {
    const core = name === "authority.md" ? "standards/authority.md" in shipped : CORE.includes(name)
    if (core || CONVENTIONS.includes(name)) continue
    const optIn = OPT_IN.includes(name)
    if (!optIn && (`standards/${name}` in shipped || name.endsWith(".default.md"))) continue
    const global: Standard = { path: join(globalDir, name), key: keyOf(name), optIn }
    if (projectNames.includes(name)) global.shadowedBy = join(ownDir, name)
    out.push(global)
  }
  for (const name of projectNames) out.push({ path: join(ownDir, name), key: keyOf(name), optIn: false })
  return out
}

/** A project's config: the switch of each standard key. */
type Config = { standards: Record<string, { enabled: boolean }> }

/**
 * The default config of a project: the four opt-in keys in order, then the user keys sorted. A key defaults to `true`
 * when only user standards hold it, `false` otherwise (an opt-in key with no file included); a shipped opt-in global
 * file counts even when a project file shadows it, so that key stays off until enabled. A core key is switchable only
 * when a project file holds it: `standardsOf` leaves the global core files out.
 */
function defaults(standards: Standard[]): Config {
  const userKeys = [...new Set(standards.map((s) => s.key))].filter((k) => !OPT_IN_KEYS.includes(k)).sort()
  const switches = dict<Config["standards"]>()
  for (const key of [...OPT_IN_KEYS, ...userKeys]) {
    const holders = standards.filter((s) => s.key === key)
    switches[key] = Object.assign(dict<{ enabled: boolean }>(), {
      enabled: holders.length > 0 && holders.every((s) => !s.optIn),
    })
  }
  return Object.assign(dict<Config>(), { standards: switches })
}

/** Applies one layer's map onto `config`, warning about every unknown key, invalid value or wrong shape in document order. */
function apply(file: string, layer: Map<unknown, unknown>, config: Config, warn: Warn): void {
  for (const [rawKey, value] of layer) {
    const key = String(rawKey)
    if (key !== "standards") warn(file, `unknown key ${key}`)
    else if (!(value instanceof Map)) warn(file, "standards must be a map")
    else applyStandards(file, value, config.standards, warn)
  }
}

/** Applies a layer's `standards` map onto `switches`, warning as `apply` does. */
function applyStandards(file: string, layer: Map<unknown, unknown>, switches: Config["standards"], warn: Warn): void {
  for (const [rawKey, value] of layer) {
    const key = String(rawKey)
    const dotted = `standards.${key}`
    const into = Object.hasOwn(switches, key) ? switches[key] : undefined
    if (into === undefined)
      warn(file, FIXED_KEYS.has(key) ? `${dotted} cannot be switched` : `${dotted} has no standard file`)
    else if (!(value instanceof Map)) warn(file, `${dotted} must be a map`)
    else {
      for (const [rawLeaf, v] of value) {
        const leaf = String(rawLeaf)
        if (leaf !== "enabled") warn(file, `unknown key ${dotted}.${leaf}`)
        else if (typeof v === "boolean") into.enabled = v
        else warn(file, `${dotted}.enabled must be true or false`)
      }
    }
  }
}

/** The parsed root of `<home>/<file>`, or the error message when it cannot be read or is not valid YAML. */
function load(home: string, file: string): { root: unknown } | { error: string } {
  let text: string
  try {
    text = readFileSync(join(home, file), "utf-8")
  } catch {
    return { error: `${file}: cannot be read` }
  }
  const parsed = parseYaml(text)
  return "reason" in parsed ? { error: `${file}: ${parsed.reason}` } : { root: parsed.root }
}

/** A project's effective config and its standards before any phase filter. */
export type Loaded = { config: Config; standards: Standard[] }

/** A project's effective config and standards, or the error message that stops it. */
type Effective = Loaded | { error: string }

/**
 * The effective config of a project: per key, the project file's valid value, else the global file's valid value,
 * else the default. A missing global file counts as an empty layer; every warning goes to `warn`.
 */
export function effectiveConfig(home: string, key: string, warn: Warn): Effective {
  const files: string[] = []
  const own = join("projects", key, "config.yaml")
  if (isFile(join(home, "config.yaml"))) files.push("config.yaml")
  if (isFile(join(home, own))) files.push(own)

  const roots: [string, unknown][] = []
  for (const file of files) {
    const loaded = load(home, file)
    if ("error" in loaded) return { error: loaded.error }
    roots.push([file, loaded.root])
  }

  const standards = standardsOf(home, key)
  const config = defaults(standards)
  for (const [file, root] of roots) {
    if (root === null) continue
    if (root instanceof Map) apply(file, root, config, warn)
    else warn(file, "not a map")
  }
  return { config, standards }
}

/** Whether a standard is on in an effective config; a key with no switch is always on. */
export function enabled(config: Config, key: string): boolean {
  const all = config.standards
  return !Object.hasOwn(all, key) || all[key]?.enabled === true
}

/**
 * A project's effective config as `theway config` loads it, its warnings sent to `warn`; or the message that stops it (a
 * missing global `config.yaml`, an unreadable or invalid file).
 */
export function loadConfigResult(home: string, key: string, warn: Warn): Effective {
  if (!isFile(join(home, "config.yaml"))) {
    return {
      error: `config.yaml not found in ${home}; run npx --yes @pixelfactoryio/theway@latest install, then /reload-plugins`,
    }
  }
  return effectiveConfig(home, key, warn)
}

/** `theway config [--project <key>]`: the effective config of the project, as YAML on stdout. */
export function cmdConfig(override: string | undefined): number {
  const resolved = projectKeyOrExit(override)
  if (typeof resolved === "number") return resolved
  const loaded = loadConfigResult(thewayHome(), resolved.key, warnLoud)
  if ("error" in loaded) return error(loaded.error)
  print(stringify(loaded.config))
  return 0
}
