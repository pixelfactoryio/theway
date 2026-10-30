import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  accessSync,
  chmodSync,
  constants,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const REPO = join(import.meta.dirname, "..");
const CLI = join(REPO, "dist", "theway.js");
const SHIPPED_CONFIG = join(REPO, "plugin", "templates", "theway", "config.yaml");
const NODE_DIR = dirname(spawnSync("node", ["-p", "process.execPath"], { encoding: "utf-8" }).stdout.trim());
const BASE_PATH = `${NODE_DIR}:/usr/bin:/bin`;

type Env = {
  root: string;
  home: string;
  claude: string;
  theway: string;
  /** THEWAY_HOME, unset when undefined. */
  thewayHome?: string;
  installDir?: string;
  path: string;
};
const roots: string[] = [];

function setup({ defaultHome = false }: { defaultHome?: boolean } = {}): Env {
  const root = mkdtempSync(join(tmpdir(), "theway-test-"));
  roots.push(root);
  const home = join(root, "home");
  mkdirSync(home, { recursive: true });
  const theway = defaultHome ? join(home, ".theway") : join(root, "theway");
  return {
    root,
    home,
    claude: join(root, "claude"),
    theway,
    thewayHome: defaultHome ? undefined : theway,
    path: BASE_PATH,
  };
}

const bin = (env: Env) => join(env.installDir ?? join(env.home, ".local", "bin"), "theway");
const pointer = (env: Env) => join(env.home, ".config", "theway", "home");

function vars(env: Env, home = env.home): Record<string, string> {
  return {
    HOME: home,
    CLAUDE_CONFIG_DIR: env.claude,
    PATH: env.path,
    ...(env.thewayHome !== undefined ? { THEWAY_HOME: env.thewayHome } : {}),
    ...(env.installDir !== undefined ? { THEWAY_INSTALL_DIR: env.installDir } : {}),
  };
}

function run(env: Env, ...args: string[]) {
  return spawnSync("node", [CLI, ...args], { encoding: "utf-8", env: vars(env) });
}

/** Runs the installed binary itself, from `env.root`, without THEWAY_HOME. */
function runInstalled(env: Env, ...args: string[]) {
  const { THEWAY_HOME: _, ...rest } = vars(env);
  return spawnSync(bin(env), args, { encoding: "utf-8", env: rest, cwd: env.root });
}

function allow(env: Env): unknown[] {
  return JSON.parse(readFileSync(join(env.claude, "settings.json"), "utf-8")).permissions.allow;
}

function put(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

test("install copies the plugin into CLAUDE_CONFIG_DIR/skills/theway and initializes the home", () => {
  const env = setup();
  const res = run(env, "install");
  expect(res.status).toBe(0);
  expect(existsSync(join(env.claude, "skills", "theway", ".claude-plugin", "plugin.json"))).toBe(true);
  expect(existsSync(join(env.claude, "skills", "theway", "commands", "engineering.md"))).toBe(true);
  expect(existsSync(join(env.theway, "config.yaml"))).toBe(true);
  expect(existsSync(join(env.theway, "bin"))).toBe(false);
});

test("install with the default home writes no pointer, the binary in ~/.local/bin and the three rules", () => {
  const env = setup({ defaultHome: true });
  expect(run(env, "install").status).toBe(0);
  expect(existsSync(pointer(env))).toBe(false);
  accessSync(bin(env), constants.X_OK);
  expect(existsSync(join(env.theway, "config.yaml"))).toBe(true);
  expect(existsSync(join(env.theway, "bin"))).toBe(false);
  expect(allow(env)).toEqual(["Bash(theway:*)", "Read(~/.theway/**)", "Edit(~/.theway/*/changes/**)"]);
  const res = runInstalled(env, "path", "--verbose");
  expect(res.status).toBe(0);
  expect(res.stdout).toBe(`${env.theway}\n`);
  expect(res.stderr).toBe(`theway: home ${env.theway} (from default)\n`);
});

test("install with a custom home writes the pointer, leaves no ~/.theway and names the absolute home in the rules", () => {
  const env = setup();
  expect(run(env, "install").status).toBe(0);
  expect(readFileSync(pointer(env), "utf-8")).toBe(`${env.theway}\n`);
  expect(existsSync(join(env.home, ".theway"))).toBe(false);
  expect(allow(env)).toEqual(["Bash(theway:*)", `Read(/${env.theway}/**)`, `Edit(/${env.theway}/*/changes/**)`]);

  put(join(env.theway, "proj", "changes", "add-x", "tasks.md"), "- [x] 1. a\n- [ ] 2. b\n");
  const path = runInstalled(env, "path", "--verbose");
  expect(path.stdout).toBe(`${env.theway}\n`);
  expect(path.stderr).toBe(`theway: home ${env.theway} (from pointer)\n`);
  expect(runInstalled(env, "path", "proj", "add-x").stdout).toBe(`${join(env.theway, "proj", "changes", "add-x")}\n`);
  expect(runInstalled(env, "list", "proj").stdout).toContain("add-x                1 files   1/2 tasks done");
  expect(existsSync(join(env.home, ".theway"))).toBe(false);
});

test("install with THEWAY_HOME set to ~/.theway removes a pointer left by a custom home", () => {
  const env = setup();
  expect(run(env, "install").status).toBe(0);
  expect(existsSync(pointer(env))).toBe(true);
  env.thewayHome = join(env.home, ".theway");
  expect(run(env, "install").status).toBe(0);
  expect(existsSync(pointer(env))).toBe(false);
});

test("install writes the binary to THEWAY_INSTALL_DIR", () => {
  const env = setup();
  env.installDir = join(env.root, "tools");
  expect(run(env, "install").status).toBe(0);
  accessSync(join(env.installDir, "theway"), constants.X_OK);
  expect(existsSync(join(env.home, ".local", "bin", "theway"))).toBe(false);
});

test("install prints the export PATH line and exits 0 when the install dir is not on PATH", () => {
  const env = setup();
  const res = run(env, "install");
  expect(res.status).toBe(0);
  const dir = dirname(bin(env));
  expect(res.stdout).toContain(`Add ${dir} to your PATH, e.g.: export PATH="${dir}:$PATH"\n`);
  expect(res.stderr).toBe("");

  env.path = `${dir}:${BASE_PATH}`;
  const again = run(env, "install");
  expect(again.status).toBe(0);
  expect(again.stdout).not.toContain("to your PATH");
  expect(again.stderr).toBe("");
});

test("install warns naming another theway that comes first on PATH", () => {
  const env = setup();
  const other = join(env.root, "other", "theway");
  put(other, "#!/bin/sh\necho other\n");
  chmodSync(other, 0o755);
  env.path = `${dirname(other)}:${dirname(bin(env))}:${BASE_PATH}`;
  const res = run(env, "install");
  expect(res.status).toBe(0);
  expect(res.stderr).toContain(`theway: warning: ${other} comes before ${bin(env)} on PATH`);
});

test("install keeps an existing config.yaml and writes config.default.yaml", () => {
  const env = setup();
  put(join(env.theway, "config.yaml"), "# sentinel: keep me\n");
  const res = run(env, "install");
  expect(res.status).toBe(0);
  expect(readFileSync(join(env.theway, "config.yaml"), "utf-8")).toContain("# sentinel: keep me");
  expect(readFileSync(join(env.theway, "config.default.yaml"), "utf-8")).toBe(readFileSync(SHIPPED_CONFIG, "utf-8"));
});

test("install merges the rules once and keeps existing settings", () => {
  const env = setup({ defaultHome: true });
  put(join(env.claude, "settings.json"), JSON.stringify({ model: "x", permissions: { allow: ["Bash(ls:*)"] } }));
  expect(run(env, "install").status).toBe(0);
  expect(run(env, "install").status).toBe(0);
  const settings = JSON.parse(readFileSync(join(env.claude, "settings.json"), "utf-8"));
  expect(settings.model).toBe("x");
  expect(allow(env)).toEqual(["Bash(ls:*)", "Bash(theway:*)", "Read(~/.theway/**)", "Edit(~/.theway/*/changes/**)"]);
});

test("install writes ~/.theway rules when HOME has a trailing slash", () => {
  const env = setup({ defaultHome: true });
  const res = spawnSync("node", [CLI, "install"], { encoding: "utf-8", env: vars(env, `${env.home}/`) });
  expect(res.status).toBe(0);
  expect(allow(env)).toEqual(["Bash(theway:*)", "Read(~/.theway/**)", "Edit(~/.theway/*/changes/**)"]);
  expect(existsSync(pointer(env))).toBe(false);
});

test("the installed copy refuses install and points to npx", () => {
  const env = setup();
  expect(run(env, "install").status).toBe(0);
  const res = runInstalled(env, "install");
  expect(res.status).toBe(1);
  expect(res.stderr).toContain("npx --yes github:pixelfactoryio/theway install");
});

test("install over a 0.2.0 default home removes the old launcher and rule and keeps the data", () => {
  const env = setup({ defaultHome: true });
  put(join(env.theway, "bin", "theway"), "#!/bin/sh\nexec node theway.js\n");
  put(join(env.theway, "bin", "theway.js"), "// old\n");
  put(join(env.theway, "config.yaml"), "# sentinel: keep me\n");
  put(join(env.theway, "proj", "changes", "add-x", "spec.md"), "# x\n");
  put(
    join(env.claude, "settings.json"),
    JSON.stringify({ permissions: { allow: ["Bash(ls:*)", "Read(~/.theway/**)", "Bash(~/.theway/bin/theway:*)"] } }),
  );
  expect(run(env, "install").status).toBe(0);
  expect(existsSync(join(env.theway, "bin"))).toBe(false);
  expect(readFileSync(join(env.theway, "config.yaml"), "utf-8")).toBe("# sentinel: keep me\n");
  expect(existsSync(join(env.theway, "proj", "changes", "add-x", "spec.md"))).toBe(true);
  expect(allow(env)).toEqual(["Bash(ls:*)", "Read(~/.theway/**)", "Bash(theway:*)", "Edit(~/.theway/*/changes/**)"]);
});

test("install over a 0.2.0 custom home removes only the old launcher files and rule", () => {
  const env = setup();
  put(join(env.theway, "bin", "theway"), "#!/bin/sh\n");
  put(join(env.theway, "bin", "theway.js"), "// old\n");
  put(join(env.theway, "bin", "mine.sh"), "# keep\n");
  put(join(env.theway, "proj", "changes", "add-x", "spec.md"), "# x\n");
  put(
    join(env.claude, "settings.json"),
    JSON.stringify({ permissions: { allow: [`Read(/${env.theway}/**)`, `Bash(${env.theway}/bin/theway:*)`] } }),
  );
  expect(run(env, "install").status).toBe(0);
  expect(existsSync(join(env.theway, "bin", "theway"))).toBe(false);
  expect(existsSync(join(env.theway, "bin", "theway.js"))).toBe(false);
  expect(existsSync(join(env.theway, "bin", "mine.sh"))).toBe(true);
  expect(existsSync(join(env.theway, "proj", "changes", "add-x", "spec.md"))).toBe(true);
  expect(allow(env)).toEqual([`Read(/${env.theway}/**)`, "Bash(theway:*)", `Edit(/${env.theway}/*/changes/**)`]);
});

test("uninstall removes the plugin, the binary, the pointer and the rules, and keeps the home", () => {
  const env = setup();
  put(join(env.claude, "settings.json"), `{"permissions":{"allow":["Bash(ls:*)","Bash(${env.theway}/bin/theway:*)"]}}`);
  expect(run(env, "install").status).toBe(0);
  // THEWAY_HOME unset: uninstall finds the custom home through the pointer.
  env.thewayHome = undefined;
  const res = run(env, "uninstall");
  expect(res.status).toBe(0);
  expect(existsSync(join(env.claude, "skills", "theway"))).toBe(false);
  expect(existsSync(bin(env))).toBe(false);
  expect(existsSync(pointer(env))).toBe(false);
  expect(allow(env)).toEqual(["Bash(ls:*)"]);
  expect(existsSync(join(env.theway, "config.yaml"))).toBe(true);
});

test("uninstall keeps a theway in the install dir that install did not write", () => {
  const env = setup({ defaultHome: true });
  expect(run(env, "install").status).toBe(0);
  writeFileSync(bin(env), "#!/bin/sh\necho another tool\n");
  expect(run(env, "uninstall").status).toBe(0);
  expect(readFileSync(bin(env), "utf-8")).toBe("#!/bin/sh\necho another tool\n");
  expect(allow(env)).toEqual([]);
  expect(existsSync(join(env.theway, "config.yaml"))).toBe(true);
});
