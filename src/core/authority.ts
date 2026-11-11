import { readFileSync } from "node:fs";
import { join } from "node:path";
import { thewayHome } from "./io";

/** The text of a file without its trailing blank lines, ending with one newline; `null` when it cannot be read. */
function wholeText(path: string): string | null {
  let text: string;
  try {
    text = readFileSync(path, "utf-8");
  } catch {
    return null;
  }
  const lines = text.split("\n");
  while (lines.length > 1 && (lines[lines.length - 1] ?? "").trim() === "") lines.pop();
  return `${lines.join("\n")}\n`;
}

/** `theway authority`: `standards/authority.md`, else `standards/authority.default.md`, to quote in agent prompts. */
export function cmdAuthority(): number {
  const dir = join(thewayHome(), "standards");
  const path = join(dir, "authority.md");
  const text = wholeText(path) ?? wholeText(join(dir, "authority.default.md"));
  if (text === null) {
    process.stderr.write(`theway: no ${path}; run npx --yes @pixelfactoryio/theway@latest install, then /reload-plugins\n`);
    return 1;
  }
  process.stdout.write(text);
  return 0;
}
