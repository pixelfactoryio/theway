import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildProgram } from "../src/program";

const REPO = join(import.meta.dirname, "..");
const PLUGIN = join(REPO, "plugin");
const COMMANDS = join(PLUGIN, "commands");
const commands = readdirSync(COMMANDS).filter((f) => f.endsWith(".md"));
const read = (path: string) => readFileSync(path, "utf-8");

test("every command except setup.md points to /theway:setup when the config is missing", () => {
  const missing = commands.filter((f) => f !== "setup.md" && !read(join(COMMANDS, f)).includes("theway:setup"));
  expect(missing).toEqual([]);
});

test("every theway subcommand the commands call is dispatched by the CLI", () => {
  const called = new Set<string>();
  for (const f of commands) {
    for (const m of read(join(COMMANDS, f)).matchAll(/~\/\.theway\/bin\/theway ([a-z-]+)/g)) called.add(m[1]);
  }
  expect(called.size).toBeGreaterThan(0);
  const subcommands = buildProgram().commands.map((c) => c.name());
  expect([...called].filter((sub) => !subcommands.includes(sub))).toEqual([]);
});

test("plugin.json and package.json carry the same semver version", () => {
  const plugin = JSON.parse(read(join(PLUGIN, ".claude-plugin", "plugin.json"))).version;
  const pkg = JSON.parse(read(join(REPO, "package.json"))).version;
  expect(plugin).toMatch(/^\d+\.\d+\.\d+$/);
  expect(pkg).toBe(plugin);
});

test("every npx reference names pixelfactoryio/theway and none names ai-marketplace", () => {
  const files = ["README.md", "plugin/commands/setup.md", "plugin/templates/theway/CLAUDE.md"];
  const offending = files.filter((f) => {
    const text = read(join(REPO, f));
    return (
      text.includes("ai-marketplace") ||
      [...text.matchAll(/github:pixelfactoryio\//g)].some((m) => !/^theway(#|\s|\)|`)/.test(text.slice(m.index + m[0].length)))
    );
  });
  expect(offending).toEqual([]);
});
