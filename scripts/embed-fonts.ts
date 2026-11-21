/**
 * Writes the dashboard's fonts (Inter for the interface, Geist Mono for code) as base64 text for the server's text
 * imports, and copies their OFL-1.1 licences into `dist/licenses/`, which the npm package ships with the fonts. Run
 * first in `build`.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(import.meta.dirname, "..")
const GENERATED = join(ROOT, "src", "dashboard", "generated")
const LICENSES = join(ROOT, "dist", "licenses")

/** Each font: its fontsource package, the latin variable file it serves, and its licence's name in `dist/licenses/`. */
const FONTS = [
  { pkg: "geist-mono", file: "geist-mono-latin-wght-normal.woff2" },
  { pkg: "inter", file: "inter-latin-wght-normal.woff2" },
] as const

mkdirSync(GENERATED, { recursive: true })
mkdirSync(LICENSES, { recursive: true })
for (const { pkg, file } of FONTS) {
  const dir = join(ROOT, "node_modules", "@fontsource-variable", pkg)
  writeFileSync(join(GENERATED, `${pkg}.woff2.txt`), readFileSync(join(dir, "files", file)).toString("base64"))
  copyFileSync(join(dir, "LICENSE"), join(LICENSES, `${pkg}-OFL.txt`))
}
