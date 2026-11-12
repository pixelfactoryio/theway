import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readManifest } from "./init";
import { thewayHome } from "./io";

/** The text of a file without its trailing blank lines, ending with one newline; `null` when it cannot be read or holds only whitespace. */
function wholeText(path: string): string | null {
  let text: string;
  try {
    text = readFileSync(path, "utf-8");
  } catch {
    return null;
  }
  if (text.trim() === "") return null;
  const lines = text.split("\n");
  while (lines.length > 1 && (lines[lines.length - 1] ?? "").trim() === "") lines.pop();
  return `${lines.join("\n")}\n`;
}

/**
 * `theway authority`, to quote in agent prompts: `standards/authority.md` when `.shipped.json` lists it (else it is the
 * user's own standard), then the shipped `standards/authority.default.md`; an empty file counts as missing.
 */
export function cmdAuthority(): number {
  const home = thewayHome();
  const dir = join(home, "standards");
  const listed = "standards/authority.md" in (readManifest(home) ?? {});
  const path = join(dir, listed ? "authority.md" : "authority.default.md");
  const text = (listed ? wholeText(path) : null) ?? wholeText(join(dir, "authority.default.md"));
  if (text === null) {
    process.stderr.write(`theway: no ${path}; run npx --yes @pixelfactoryio/theway@latest install, then /reload-plugins\n`);
    return 1;
  }
  process.stdout.write(text);
  return 0;
}
