/**
 * Writes the dashboard's code font as base64 text for the server's text imports, and copies its OFL-1.1 licence
 * into `dist/licenses/`, which the npm package ships with the fonts. Run first in `build`.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(import.meta.dirname, "..")
const GENERATED = join(ROOT, "src", "dashboard", "generated")
const LICENSES = join(ROOT, "dist", "licenses")

const FONT = join(ROOT, "node_modules", "@fontsource-variable", "geist-mono")

mkdirSync(GENERATED, { recursive: true })
mkdirSync(LICENSES, { recursive: true })
writeFileSync(
  join(GENERATED, "geist-mono.woff2.txt"),
  readFileSync(join(FONT, "files", "geist-mono-latin-wght-normal.woff2")).toString("base64"),
)
copyFileSync(join(FONT, "LICENSE"), join(LICENSES, "geist-mono-OFL.txt"))
