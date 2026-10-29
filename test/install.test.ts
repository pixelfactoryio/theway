import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = join(import.meta.dirname, "..");
const CLI = join(REPO, "dist", "theway.js");
const SHIPPED_CONFIG = join(REPO, "plugin", "templates", "theway", "config.yaml");

type Env = { root: string; claude: string; theway: string; defaultHome: boolean };
const roots: string[] = [];

function setup({ defaultHome = false }: { defaultHome?: boolean } = {}): Env {
  const root = mkdtempSync(join(tmpdir(), "theway-test-"));
  roots.push(root);
  mkdirSync(join(root, "home"), { recursive: true });
  return {
    root,
    claude: join(root, "claude"),
    theway: defaultHome ? join(root, "home", ".theway") : join(root, "theway"),
    defaultHome,
  };
}

function run(env: Env, ...args: string[]) {
  return runWithHome(env, join(env.root, "home"), ...args);
}

function runWithHome(env: Env, home: string, ...args: string[]) {
  return spawnSync("node", [CLI, ...args], {
    encoding: "utf-8",
    env: {
      HOME: home,
      CLAUDE_CONFIG_DIR: env.claude,
      PATH: process.env.PATH,
      ...(env.defaultHome ? {} : { THEWAY_HOME: env.theway }),
    },
  });
}

function allow(env: Env): unknown[] {
  return JSON.parse(readFileSync(join(env.claude, "settings.json"), "utf-8")).permissions.allow;
}

afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

test("install copies the plugin into CLAUDE_CONFIG_DIR/skills/theway and initializes THEWAY_HOME", () => {
  const env = setup();
  const res = run(env, "install");
  expect(res.status).toBe(0);
  expect(existsSync(join(env.claude, "skills", "theway", ".claude-plugin", "plugin.json"))).toBe(true);
  expect(existsSync(join(env.claude, "skills", "theway", "commands", "engineering.md"))).toBe(true);
  accessSync(join(env.theway, "bin", "theway"), constants.X_OK);
  expect(existsSync(join(env.theway, "config.yaml"))).toBe(true);
});

test("install keeps an existing config.yaml and writes config.default.yaml", () => {
  const env = setup();
  mkdirSync(env.theway, { recursive: true });
  writeFileSync(join(env.theway, "config.yaml"), "# sentinel: keep me\n");
  const res = run(env, "install");
  expect(res.status).toBe(0);
  expect(readFileSync(join(env.theway, "config.yaml"), "utf-8")).toContain("# sentinel: keep me");
  expect(readFileSync(join(env.theway, "config.default.yaml"), "utf-8")).toBe(readFileSync(SHIPPED_CONFIG, "utf-8"));
});

test("install merges the two permission rules once and keeps existing settings", () => {
  const env = setup({ defaultHome: true });
  mkdirSync(env.claude, { recursive: true });
  writeFileSync(join(env.claude, "settings.json"), JSON.stringify({ model: "x", permissions: { allow: ["Bash(ls:*)"] } }));
  expect(run(env, "install").status).toBe(0);
  expect(run(env, "install").status).toBe(0);
  const settings = JSON.parse(readFileSync(join(env.claude, "settings.json"), "utf-8"));
  expect(settings.model).toBe("x");
  expect(allow(env)).toEqual(["Bash(ls:*)", "Read(~/.theway/**)", "Bash(~/.theway/bin/theway:*)"]);
});

test("install writes ~/.theway rules when HOME has a trailing slash", () => {
  const env = setup({ defaultHome: true });
  expect(runWithHome(env, `${join(env.root, "home")}/`, "install").status).toBe(0);
  expect(allow(env)).toEqual(["Read(~/.theway/**)", "Bash(~/.theway/bin/theway:*)"]);
});

test("the installed copy refuses install and points to npx", () => {
  const env = setup();
  expect(run(env, "install").status).toBe(0);
  const res = spawnSync("node", [join(env.theway, "bin", "theway.js"), "install"], {
    encoding: "utf-8",
    env: { HOME: join(env.root, "home"), CLAUDE_CONFIG_DIR: env.claude, PATH: process.env.PATH, THEWAY_HOME: env.theway },
  });
  expect(res.status).toBe(1);
  expect(res.stderr).toContain("npx --yes github:pixelfactoryio/theway install");
});

test("uninstall removes the plugin folder and the two rules and keeps THEWAY_HOME", () => {
  const env = setup();
  mkdirSync(env.claude, { recursive: true });
  writeFileSync(join(env.claude, "settings.json"), '{"permissions":{"allow":["Bash(ls:*)"]}}');
  expect(run(env, "install").status).toBe(0);
  const res = run(env, "uninstall");
  expect(res.status).toBe(0);
  expect(existsSync(join(env.claude, "skills", "theway"))).toBe(false);
  expect(allow(env)).toEqual(["Bash(ls:*)"]);
  expect(existsSync(join(env.theway, "config.yaml"))).toBe(true);
});
