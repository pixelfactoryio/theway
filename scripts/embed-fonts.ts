/**
 * Writes the dashboard's two fonts as base64 text for the server's text imports, and copies their OFL-1.1 licences
 * into `dist/licenses/`, which the npm package ships with the fonts. Run first in `build`.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const GENERATED = join(ROOT, "src", "dashboard", "generated");
const LICENSES = join(ROOT, "dist", "licenses");

const FONTS = [
  { pkg: "inter", file: "inter-latin-wght-normal.woff2", out: "inter.woff2.txt", license: "inter-OFL.txt" },
  { pkg: "jetbrains-mono", file: "jetbrains-mono-latin-wght-normal.woff2", out: "jetbrains-mono.woff2.txt", license: "jetbrains-mono-OFL.txt" },
];

mkdirSync(GENERATED, { recursive: true });
mkdirSync(LICENSES, { recursive: true });
for (const f of FONTS) {
  const dir = join(ROOT, "node_modules", "@fontsource-variable", f.pkg);
  writeFileSync(join(GENERATED, f.out), readFileSync(join(dir, "files", f.file)).toString("base64"));
  copyFileSync(join(dir, "LICENSE"), join(LICENSES, f.license));
}
