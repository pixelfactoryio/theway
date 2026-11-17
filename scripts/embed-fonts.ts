/**
 * Writes the dashboard's code font as base64 text for the server's text imports, and copies its OFL-1.1 licence
 * into `dist/licenses/`, which the npm package ships with the fonts. Run first in `build`.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(import.meta.dirname, "..")
const GENERATED = join(ROOT, "src", "dashboard", "generated")
const LICENSES = join(ROOT, "dist", "licenses")

const FONTS = [
  {
    pkg: "geist-mono",
    file: "geist-mono-latin-wght-normal.woff2",
    out: "geist-mono.woff2.txt",
    license: "geist-mono-OFL.txt",
  },
]

mkdirSync(GENERATED, { recursive: true })
mkdirSync(LICENSES, { recursive: true })
for (const f of FONTS) {
  const dir = join(ROOT, "node_modules", "@fontsource-variable", f.pkg)
  writeFileSync(join(GENERATED, f.out), readFileSync(join(dir, "files", f.file)).toString("base64"))
  copyFileSync(join(dir, "LICENSE"), join(LICENSES, f.license))
}
