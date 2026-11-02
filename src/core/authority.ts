import { readFileSync } from "node:fs";
import { join } from "node:path";
import { thewayHome } from "./io";

/** The `## Authority` section of a file, up to the next `## ` line, without trailing blank lines; `null` when the file is missing or has none. */
function authoritySection(path: string): string | null {
  let text: string;
  try {
    text = readFileSync(path, "utf-8");
  } catch {
    return null;
  }
  const lines = text.split("\n").map((l) => l.replace(/\r$/, ""));
  const start = lines.indexOf("## Authority");
  if (start === -1) return null;
  const next = lines.findIndex((l, i) => i > start && l.startsWith("## "));
  const body = lines.slice(start, next === -1 ? lines.length : next);
  while (body.length > 1 && (body[body.length - 1] ?? "").trim() === "") body.pop();
  return `${body.join("\n")}\n`;
}

/** `theway authority`: the `## Authority` section of `interaction.md`, else of `interaction.default.md`, to quote in agent prompts. */
export function cmdAuthority(): number {
  const dir = join(thewayHome(), "standards");
  const section = authoritySection(join(dir, "interaction.md")) ?? authoritySection(join(dir, "interaction.default.md"));
  if (section === null) {
    process.stderr.write(
      `theway: no ## Authority section in ${join(dir, "interaction.md")} or interaction.default.md; run npx --yes @pixelfactoryio/theway@latest install, then /reload-plugins\n`,
    );
    return 1;
  }
  process.stdout.write(section);
  return 0;
}
