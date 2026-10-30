import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildProgram } from "../src/program";

const REPO = join(import.meta.dirname, "..");
const PLUGIN = join(REPO, "plugin");
const COMMANDS = join(PLUGIN, "commands");
const commands = readdirSync(COMMANDS).filter((f) => f.endsWith(".md"));
const read = (path: string) => readFileSync(path, "utf-8");

test("every command except setup.md points to /theway:setup", () => {
  const missing = commands.filter((f) => f !== "setup.md" && !read(join(COMMANDS, f)).includes("theway:setup"));
  expect(missing).toEqual([]);
});

/** The `theway <subcommand>` calls of a text: in inline code or at the start of a code line. */
const calls = (text: string) => [...text.matchAll(/(?:`|^)theway ([a-z][a-z-]*)/gm)].map((m) => m[1]);

/** Every file under `dir`, recursively. */
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)],
  );
}

/** The `## Locate the home` section of a command, up to the next heading. */
const locateStep = (text: string) => /^## Locate the home\n[\s\S]*?(?=^#)/m.exec(text)?.[0];

test("every theway subcommand the commands call is dispatched by the CLI", () => {
  const called = new Set(commands.flatMap((f) => calls(read(join(COMMANDS, f)))));
  expect(called.size).toBeGreaterThan(0);
  const subcommands = buildProgram().commands.map((c) => c.name());
  expect([...called].filter((sub) => !subcommands.includes(sub))).toEqual([]);
});

test("no file in plugin/ names ~/.theway", () => {
  const offending = files(PLUGIN).filter((f) => read(f).includes("~/.theway"));
  expect(offending).toEqual([]);
});

test("every command that calls the CLI has allowed-tools: Bash(theway:*)", () => {
  const calling = commands.filter((f) => calls(read(join(COMMANDS, f))).length > 0);
  expect(calling.length).toBeGreaterThan(0);
  const missing = calling.filter((f) => !/^---\n[\s\S]*?^allowed-tools: Bash\(theway:\*\)$[\s\S]*?^---$/m.test(read(join(COMMANDS, f))));
  expect(missing).toEqual([]);
});

test("every command that reads theway data has the same Locate the home step", () => {
  const readers = ["archive.md", "develop-workflow.md", "develop.md", "document.md", "engineering.md", "list.md"];
  const reference = locateStep(read(join(COMMANDS, "engineering.md")));
  expect(reference).toContain("Run `theway path`");
  expect(reference).toContain("Do not check for files under `<home>` before reading them");
  expect(reference).not.toContain("`<home>/config.yaml` doesn't exist");
  expect(readers.filter((f) => locateStep(read(join(COMMANDS, f))) !== reference)).toEqual([]);
});

test("engineering, develop and develop-workflow get the change folder from theway path", () => {
  const missing = ["engineering.md", "develop.md", "develop-workflow.md"].filter(
    (f) => !read(join(COMMANDS, f)).includes("`theway path <project> <change-id>`"),
  );
  expect(missing).toEqual([]);
});

test("plugin.json and package.json carry the same semver version", () => {
  const plugin = JSON.parse(read(join(PLUGIN, ".claude-plugin", "plugin.json"))).version;
  const pkg = JSON.parse(read(join(REPO, "package.json"))).version;
  expect(plugin).toMatch(/^\d+\.\d+\.\d+$/);
  expect(pkg).toBe(plugin);
});

test("every npx reference installs @pixelfactoryio/theway from npm", () => {
  const files = ["README.md", "plugin/commands/setup.md", "plugin/templates/theway/CLAUDE.md"];
  const offending = files.filter((f) => {
    const text = read(join(REPO, f));
    return (
      text.includes("ai-marketplace") ||
      text.includes("github:pixelfactoryio") ||
      [...text.matchAll(/npx --yes /g)].some(
        (m) => !/^@pixelfactoryio\/theway@(latest|X\.Y\.Z|\d+\.\d+\.\d+)\s/.test(text.slice(m.index + m[0].length)),
      )
    );
  });
  expect(offending).toEqual([]);
});

test("setup.md installs the version in package.json", () => {
  const pkg = JSON.parse(read(join(REPO, "package.json"))).version;
  const versions = [...read(join(COMMANDS, "setup.md")).matchAll(/@pixelfactoryio\/theway@(\S+)/g)].map((m) => m[1]);
  expect(versions).toEqual([pkg, pkg]);
});
