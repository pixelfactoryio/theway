import { expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { dirname, join, relative, resolve, sep } from "node:path"

const CLIENT = join(import.meta.dirname, "..", "src", "dashboard", "client")
/** The installed folders, kept as the shadcn CLI writes them: not layers. */
const VENDORED = ["components/ui", "components/reui", "hooks"]
/** The client's layers, from the bottom up; `pages/<area>` sits above them all, the root files above `pages`. */
const ORDER = ["lib", "data", "shell", "drafts", "components"]

/** A client path relative to its root, with forward slashes. */
const rel = (abs: string): string => relative(CLIENT, abs).split(sep).join("/")

const vendored = (path: string): boolean => VENDORED.some((d) => path.startsWith(`${d}/`))

/** The client's own source files: every `.ts`/`.tsx` outside the vendored folders, relative to its root. */
const own = readdirSync(CLIENT, { recursive: true, withFileTypes: true })
  .filter((e) => e.isFile() && /\.tsx?$/.test(e.name))
  .map((e) => rel(join(e.parentPath, e.name)))
  .filter((f) => !vendored(f))

/** A file's layer: its first path segment, `pages/<area>` under `pages/`, `root` for a file at the client's root. */
function layerOf(path: string): string {
  const parts = path.split("/")
  if (parts.length === 1) return "root"
  if (parts[0] === "pages") return parts.length > 2 ? `pages/${parts[1]}` : "pages"
  return parts[0] as string
}

/** Whether a file of layer `from` may import the client file `target`. */
function allowed(from: string, target: string): boolean {
  if (from === "root") return true
  if (vendored(target)) return from !== "lib" && from !== "data"
  const to = layerOf(target)
  if (from.startsWith("pages/")) return ORDER.includes(to) || to === from
  const at = ORDER.indexOf(from)
  return at >= 0 && ORDER.indexOf(to) >= 0 && ORDER.indexOf(to) <= at
}

/** Every module specifier of a source: `from "…"`, `import "…"` and `import("…")`. */
const specifiers = (text: string): string[] =>
  [...text.matchAll(/\bfrom\s+["']([^"']+)["']|\bimport\s+["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/g)].map(
    (m) => (m[1] ?? m[2] ?? m[3]) as string,
  )

/** The client file a specifier names, relative to the client's root; `null` for a package or a file outside it. */
function resolved(file: string, specifier: string): string | null {
  let abs: string
  if (specifier.startsWith("@/")) abs = join(CLIENT, specifier.slice(2))
  else if (specifier.startsWith(".")) abs = resolve(dirname(join(CLIENT, file)), specifier)
  else return null
  if (!abs.startsWith(CLIENT + sep)) return null
  return rel(abs)
}

/** Every import of the client's own files that the layer table forbids, as `<file> → <specifier>`. */
function broken(): string[] {
  return own.flatMap((file) =>
    specifiers(readFileSync(join(CLIENT, file), "utf-8"))
      .filter((s) => {
        const target = resolved(file, s)
        return target !== null && !allowed(layerOf(file), target)
      })
      .map((s) => `${file} → ${s}`),
  )
}

test("the layer table allows and forbids what it must", () => {
  expect(allowed("lib", "lib/routes")).toBe(true)
  expect(allowed("lib", "data/api")).toBe(false)
  expect(allowed("lib", "components/ui/button")).toBe(false)
  expect(allowed("data", "hooks/use-mobile")).toBe(false)
  expect(allowed("shell", "components/ui/dialog")).toBe(true)
  expect(allowed("shell", "components/logo")).toBe(false)
  expect(allowed("drafts", "shell/guard")).toBe(true)
  expect(allowed("components", "drafts/use-drafts")).toBe(true)
  expect(allowed("components", "pages/change/active")).toBe(false)
  expect(allowed("pages/change", "pages/change/active")).toBe(true)
  expect(allowed("pages/change", "pages/workflow/page")).toBe(false)
  expect(allowed("pages/workflow", "components/file-page")).toBe(true)
  expect(allowed("components", "app")).toBe(false)
  expect(allowed("root", "pages/workflow/page")).toBe(true)
  expect(resolved("pages/change/route.tsx", "../../../contract")).toBeNull()
  expect(resolved("pages/change/route.tsx", "./change")).toBe("pages/change/change")
  expect(resolved("shell/top-bar.tsx", "@/shell/logo")).toBe("shell/logo")
  expect(resolved("shell/top-bar.tsx", "react")).toBeNull()
  expect(specifiers(`import a from "x"\nimport "y"\nexport { b } from "z"\nconst c = import("w")`)).toEqual([
    "x",
    "y",
    "z",
    "w",
  ])
})

test("every file of the client imports only from the layers below it and from its own", () => {
  expect(own.length).toBeGreaterThan(5)
  expect(own.filter((f) => !["root", "pages", ...ORDER].includes(layerOf(f)) && !f.startsWith("pages/"))).toEqual([])
  expect(own.filter((f) => layerOf(f) === "pages")).toEqual([])
  expect(broken()).toEqual([])
})
