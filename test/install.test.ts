import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  accessSync,
  chmodSync,
  constants,
  existsSync,
  mkdirSync,
  mkdtempSync,
  lstatSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { OPT_IN_KEYS } from "../src/core/config";
import { OPT_IN_HINTS } from "../src/install";

const REPO = join(import.meta.dirname, "..");
const CLI = join(REPO, "dist", "theway.js");
const SHIPPED = join(REPO, "plugin", "home");
const SHIPPED_CONFIG = join(SHIPPED, "config.yaml");
const SHIPPED_FILES = (
  [
    ["standards", ".md"],
    ["templates", ".md"],
    ["workflows", ".yaml"],
    ["steps", ".yaml"],
    ["prompts", ".md"],
    ["schemas", ".json"],
  ] as const
).flatMap(([d, ext]) =>
  readdirSync(join(SHIPPED, d))
    .filter((n) => n.endsWith(ext))
    .map((n) => `${d}/${n}`),
);
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

/** The 0.2.0 `shQuote`: `'…'` with every `'` written as `'\''`. */
function shQuote(s: string): string {
  return `'${s.replaceAll("'", "'\\''")}'`;
}

/** Writes the launcher pair 0.2.0 put in `<home>/bin`. */
function putLegacyBin(home: string): void {
  const dir = join(home, "bin");
  put(join(dir, "theway.js"), "#!/usr/bin/env node\n// 0.2.0 bundle\n");
  put(join(dir, "theway"), `#!/bin/sh\nexec node ${shQuote(join(dir, "theway.js"))} "$@"\n`);
}

const mode = (path: string) => statSync(path).mode & 0o777;

afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

test("install copies the plugin into CLAUDE_CONFIG_DIR/skills/theway and initializes the home", () => {
  const env = setup();
  const res = run(env, "install");
  expect(res.status).toBe(0);
  expect(existsSync(join(env.claude, "skills", "theway", ".claude-plugin", "plugin.json"))).toBe(true);
  expect(existsSync(join(env.claude, "skills", "theway", "commands", "engineering.md"))).toBe(true);
  expect(readFileSync(join(env.claude, "skills", "theway", "workflows", "run-pipeline.js"), "utf-8")).toBe(
    readFileSync(join(REPO, "plugin", "workflows", "run-pipeline.js"), "utf-8"),
  );
  expect(existsSync(join(env.theway, "config.yaml"))).toBe(true);
  for (const rel of [
    "workflows/develop.yaml",
    "workflows/agents.yaml",
    "steps/implement.yaml",
    "steps/review.yaml",
    "steps/pr.yaml",
    "prompts/conformance.md",
    "prompts/reviewer.md",
    "schemas/workflow.v1.json",
    "schemas/step.v1.json",
    "standards/commits.md",
    "standards/git-host.md",
  ]) {
    expect(existsSync(join(env.theway, rel))).toBe(true);
  }
  const old = join(env.claude, "skills", "theway", "commands", "develop-workflow.md");
  expect(existsSync(old)).toBe(false);
  put(old, "# an earlier version's command\n");
  expect(run(env, "install").status).toBe(0);
  expect(existsSync(old)).toBe(false);
  expect(existsSync(join(env.claude, "skills", "theway", "commands", "workflow.md"))).toBe(true);
  expect(existsSync(join(env.theway, "bin"))).toBe(false);
});

test("install with the default home writes no pointer, the binary in ~/.local/bin and the two rules", () => {
  const env = setup({ defaultHome: true });
  expect(run(env, "install").status).toBe(0);
  expect(existsSync(pointer(env))).toBe(false);
  accessSync(bin(env), constants.X_OK);
  expect(existsSync(join(env.theway, "config.yaml"))).toBe(true);
  expect(existsSync(join(env.theway, "bin"))).toBe(false);
  expect(allow(env)).toEqual(["Bash(theway:*)", "Read(~/.theway/**)"]);
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
  expect(allow(env)).toEqual(["Bash(theway:*)", `Read(/${env.theway}/**)`]);

  put(join(env.theway, "projects", "proj", "changes", "add-x", "tasks.md"), "- [x] 1. a\n- [ ] 2. b\n");
  const path = runInstalled(env, "path", "--verbose");
  expect(path.stdout).toBe(`${env.theway}\n`);
  expect(path.stderr).toBe(`theway: home ${env.theway} (from pointer)\n`);
  expect(runInstalled(env, "path", "--project", "proj", "add-x").stdout).toBe(`${join(env.theway, "projects", "proj", "changes", "add-x")}\n`);
  expect(runInstalled(env, "list", "--project", "proj").stdout).toContain("add-x                1 files   1/2 tasks done");
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

test("install without THEWAY_HOME keeps the home the pointer names, as a reinstall runs it", () => {
  const env = setup();
  expect(run(env, "install").status).toBe(0);
  env.thewayHome = undefined;
  const res = run(env, "install");
  expect(res.status).toBe(0);
  expect(res.stdout).not.toContain(join(env.home, ".theway"));
  expect(readFileSync(pointer(env), "utf-8")).toBe(`${env.theway}\n`);
  expect(existsSync(join(env.home, ".theway"))).toBe(false);
  expect(allow(env)).toEqual(["Bash(theway:*)", `Read(/${env.theway}/**)`]);
  const path = runInstalled(env, "path", "--verbose");
  expect(path.stdout).toBe(`${env.theway}\n`);
  expect(path.stderr).toBe(`theway: home ${env.theway} (from pointer)\n`);
});

test("install with a new THEWAY_HOME drops the Read rule of the previous home", () => {
  const env = setup();
  put(join(env.claude, "settings.json"), JSON.stringify({ permissions: { allow: ["Bash(ls:*)"] } }));
  const first = env.theway;
  expect(run(env, "install").status).toBe(0);
  env.thewayHome = join(env.root, "other");
  expect(run(env, "install").status).toBe(0);
  expect(readFileSync(pointer(env), "utf-8")).toBe(`${env.thewayHome}\n`);
  expect(allow(env)).toEqual([
    "Bash(ls:*)",
    "Bash(theway:*)",
    `Read(/${env.thewayHome}/**)`,
  ]);
  expect(existsSync(join(first, "config.yaml"))).toBe(true);
});

test("install from the default home to a custom one drops the ~/.theway rules", () => {
  const env = setup({ defaultHome: true });
  expect(run(env, "install").status).toBe(0);
  env.thewayHome = join(env.root, "custom");
  expect(run(env, "install").status).toBe(0);
  expect(allow(env)).toEqual(["Bash(theway:*)", `Read(/${env.thewayHome}/**)`]);
});

test("install refuses to replace a theway in the install dir that it did not write, and changes nothing", () => {
  const env = setup({ defaultHome: true });
  put(bin(env), "#!/bin/sh\necho another tool\n");
  chmodSync(bin(env), 0o755);
  const res = run(env, "install");
  expect(res.status).toBe(1);
  expect(res.stderr).toBe(
    `theway: ${bin(env)} exists and is not a theway binary; nothing was changed. Remove it, or set THEWAY_INSTALL_DIR to another folder\n`,
  );
  expect(readFileSync(bin(env), "utf-8")).toBe("#!/bin/sh\necho another tool\n");
  expect(existsSync(join(env.claude, "skills", "theway"))).toBe(false);
  expect(existsSync(join(env.claude, "settings.json"))).toBe(false);
  expect(existsSync(env.theway)).toBe(false);
});

test("install replaces the theway binary a previous install wrote", () => {
  const env = setup();
  expect(run(env, "install").status).toBe(0);
  writeFileSync(bin(env), `${readFileSync(bin(env), "utf-8")}\n// older copy\n`);
  expect(run(env, "install").status).toBe(0);
  expect(readFileSync(bin(env), "utf-8")).toBe(readFileSync(CLI, "utf-8"));
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
  expect(allow(env)).toEqual(["Bash(ls:*)", "Bash(theway:*)", "Read(~/.theway/**)"]);
});

test("install writes ~/.theway rules when HOME has a trailing slash", () => {
  const env = setup({ defaultHome: true });
  const res = spawnSync("node", [CLI, "install"], { encoding: "utf-8", env: vars(env, `${env.home}/`) });
  expect(res.status).toBe(0);
  expect(allow(env)).toEqual(["Bash(theway:*)", "Read(~/.theway/**)"]);
  expect(existsSync(pointer(env))).toBe(false);
});

test("the installed copy refuses install and points to npx", () => {
  const env = setup();
  expect(run(env, "install").status).toBe(0);
  const res = runInstalled(env, "install");
  expect(res.status).toBe(1);
  expect(res.stderr).toContain("npx --yes @pixelfactoryio/theway@latest install");
});

test("install over a 0.2.0 default home removes the old launcher and rule and keeps the data", () => {
  const env = setup({ defaultHome: true });
  putLegacyBin(env.theway);
  put(join(env.theway, "config.yaml"), "# sentinel: keep me\n");
  put(join(env.theway, "projects", "proj", "changes", "add-x", "spec.md"), "# x\n");
  put(
    join(env.claude, "settings.json"),
    JSON.stringify({ permissions: { allow: ["Bash(ls:*)", "Read(~/.theway/**)", "Bash(~/.theway/bin/theway:*)"] } }),
  );
  expect(run(env, "install").status).toBe(0);
  expect(existsSync(join(env.theway, "bin"))).toBe(false);
  expect(readFileSync(join(env.theway, "config.yaml"), "utf-8")).toBe("# sentinel: keep me\n");
  expect(existsSync(join(env.theway, "projects", "proj", "changes", "add-x", "spec.md"))).toBe(true);
  expect(allow(env)).toEqual(["Bash(ls:*)", "Read(~/.theway/**)", "Bash(theway:*)"]);
});

for (const [label, name] of [
  ["", "theway"],
  [" whose path contains '", "the'way"],
]) {
  test(`install over a 0.2.0 custom home${label} removes only the old launcher files and rule`, () => {
    const env = setup();
    env.theway = join(env.root, name);
    env.thewayHome = env.theway;
    putLegacyBin(env.theway);
    put(join(env.theway, "bin", "mine.sh"), "# keep\n");
    put(join(env.theway, "projects", "proj", "changes", "add-x", "spec.md"), "# x\n");
    put(
      join(env.claude, "settings.json"),
      JSON.stringify({ permissions: { allow: [`Read(/${env.theway}/**)`, `Bash(${env.theway}/bin/theway:*)`] } }),
    );
    expect(run(env, "install").status).toBe(0);
    expect(existsSync(join(env.theway, "bin", "theway"))).toBe(false);
    expect(existsSync(join(env.theway, "bin", "theway.js"))).toBe(false);
    expect(existsSync(join(env.theway, "bin", "mine.sh"))).toBe(true);
    expect(existsSync(join(env.theway, "projects", "proj", "changes", "add-x", "spec.md"))).toBe(true);
    expect(allow(env)).toEqual([`Read(/${env.theway}/**)`, "Bash(theway:*)"]);
  });
}

test("install keeps a <home>/bin/theway and theway.js that 0.2.0 did not write", () => {
  const env = setup();
  put(join(env.theway, "bin", "theway"), "#!/bin/sh\necho mine\n");
  put(join(env.theway, "bin", "theway.js"), "// mine\n");
  expect(run(env, "install").status).toBe(0);
  expect(readFileSync(join(env.theway, "bin", "theway"), "utf-8")).toBe("#!/bin/sh\necho mine\n");
  expect(readFileSync(join(env.theway, "bin", "theway.js"), "utf-8")).toBe("// mine\n");
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

test("uninstall drops the rules of the pointer's home and ~/.theway as well as THEWAY_HOME's", () => {
  const env = setup();
  put(join(env.claude, "settings.json"), JSON.stringify({ permissions: { allow: ["Bash(ls:*)", "Read(~/.theway/**)"] } }));
  expect(run(env, "install").status).toBe(0);
  env.thewayHome = join(env.root, "elsewhere");
  const res = run(env, "uninstall");
  expect(res.status).toBe(0);
  expect(existsSync(pointer(env))).toBe(false);
  expect(allow(env)).toEqual(["Bash(ls:*)"]);
});

test("install over the Edit rule of an earlier version removes it and keeps unrelated rules (default home)", () => {
  const env = setup({ defaultHome: true });
  put(
    join(env.claude, "settings.json"),
    JSON.stringify({ permissions: { allow: ["Bash(ls:*)", "Read(~/.theway/**)", "Edit(~/.theway/*/changes/**)", "Edit(src/**)"] } }),
  );
  expect(run(env, "install").status).toBe(0);
  expect(allow(env)).toEqual(["Bash(ls:*)", "Read(~/.theway/**)", "Edit(src/**)", "Bash(theway:*)"]);
});

test("install over the Edit rule of an earlier version removes it and keeps unrelated rules (custom home)", () => {
  const env = setup();
  put(
    join(env.claude, "settings.json"),
    JSON.stringify({
      permissions: { allow: ["Bash(ls:*)", `Read(/${env.theway}/**)`, `Edit(/${env.theway}/*/changes/**)`, "Edit(src/**)"] },
    }),
  );
  expect(run(env, "install").status).toBe(0);
  expect(allow(env)).toEqual(["Bash(ls:*)", `Read(/${env.theway}/**)`, "Edit(src/**)", "Bash(theway:*)"]);
});

test("install to a new home removes the Edit rule an earlier version wrote for the previous home", () => {
  const env = setup();
  expect(run(env, "install").status).toBe(0);
  const settings = JSON.parse(readFileSync(join(env.claude, "settings.json"), "utf-8"));
  settings.permissions.allow.push(`Edit(/${env.theway}/*/changes/**)`);
  put(join(env.claude, "settings.json"), JSON.stringify(settings));
  env.thewayHome = join(env.root, "other");
  expect(run(env, "install").status).toBe(0);
  expect(allow(env)).toEqual(["Bash(theway:*)", `Read(/${env.thewayHome}/**)`]);
});

test("uninstall removes the Edit rule of an earlier version", () => {
  const env = setup();
  expect(run(env, "install").status).toBe(0);
  const settings = JSON.parse(readFileSync(join(env.claude, "settings.json"), "utf-8"));
  settings.permissions.allow.push(`Edit(/${env.theway}/*/changes/**)`, "Edit(~/.theway/*/changes/**)", "Bash(ls:*)");
  put(join(env.claude, "settings.json"), JSON.stringify(settings));
  expect(run(env, "uninstall").status).toBe(0);
  expect(allow(env)).toEqual(["Bash(ls:*)"]);
});

for (const m of [0o600, 0o640]) {
  test(`install and uninstall keep a ${m.toString(8)} settings.json at ${m.toString(8)}`, () => {
    const env = setup();
    const settings = join(env.claude, "settings.json");
    put(settings, JSON.stringify({ env: { TOKEN: "x" } }));
    chmodSync(settings, m);
    expect(run(env, "install").status).toBe(0);
    expect(mode(settings)).toBe(m);
    expect(run(env, "uninstall").status).toBe(0);
    expect(mode(settings)).toBe(m);
    expect(allow(env)).toEqual([]);
  });
}

test("install writes a new settings.json with mode 600", () => {
  const env = setup();
  expect(run(env, "install").status).toBe(0);
  expect(mode(join(env.claude, "settings.json"))).toBe(0o600);
});

test("install and uninstall write through a symlinked settings.json", () => {
  const env = setup();
  const target = join(env.root, "dotfiles", "settings.json");
  put(target, JSON.stringify({ permissions: { allow: ["Bash(ls:*)"] } }));
  const link = join(env.claude, "settings.json");
  mkdirSync(env.claude, { recursive: true });
  symlinkSync(target, link);
  expect(run(env, "install").status).toBe(0);
  expect(lstatSync(link).isSymbolicLink()).toBe(true);
  expect(JSON.parse(readFileSync(target, "utf-8")).permissions.allow).toEqual([
    "Bash(ls:*)",
    "Bash(theway:*)",
    `Read(/${env.theway}/**)`,
  ]);
  expect(run(env, "uninstall").status).toBe(0);
  expect(lstatSync(link).isSymbolicLink()).toBe(true);
  expect(JSON.parse(readFileSync(target, "utf-8")).permissions.allow).toEqual(["Bash(ls:*)"]);
});

test("install creates the target of a dangling settings.json symlink with mode 600", () => {
  const env = setup();
  const target = join(env.root, "dotfiles", "claude", "settings.json");
  const link = join(env.claude, "settings.json");
  mkdirSync(env.claude, { recursive: true });
  symlinkSync(target, link);
  expect(run(env, "install").status).toBe(0);
  expect(lstatSync(link).isSymbolicLink()).toBe(true);
  expect(mode(target)).toBe(0o600);
  expect(JSON.parse(readFileSync(target, "utf-8")).permissions.allow).toEqual([
    "Bash(theway:*)",
    `Read(/${env.theway}/**)`,
  ]);
});

test("install and uninstall refuse a settings.json symlinked into a read-only folder, and change nothing", () => {
  const env = setup();
  const dir = join(env.root, "ro");
  const target = join(dir, "settings.json");
  const link = join(env.claude, "settings.json");
  put(target, JSON.stringify({ permissions: { allow: ["Bash(ls:*)"] } }));
  mkdirSync(env.claude, { recursive: true });
  symlinkSync(target, link);
  const line = `theway: cannot write ${link}: ${dir} is not writable; nothing was changed\n`;
  chmodSync(target, 0o444);
  chmodSync(dir, 0o555);
  try {
    const res = run(env, "install");
    expect(res.status).toBe(1);
    expect(res.stderr).toBe(line);
    expect(existsSync(join(env.claude, "skills", "theway"))).toBe(false);
    expect(existsSync(bin(env))).toBe(false);
    expect(existsSync(pointer(env))).toBe(false);
    expect(existsSync(join(env.theway, "config.yaml"))).toBe(false);
  } finally {
    chmodSync(dir, 0o755);
    chmodSync(target, 0o644);
  }

  expect(run(env, "install").status).toBe(0);
  chmodSync(target, 0o444);
  chmodSync(dir, 0o555);
  try {
    const res = run(env, "uninstall");
    expect(res.status).toBe(1);
    expect(res.stderr).toBe(line);
    expect(existsSync(join(env.claude, "skills", "theway"))).toBe(true);
    expect(existsSync(bin(env))).toBe(true);
    expect(existsSync(pointer(env))).toBe(true);
  } finally {
    chmodSync(dir, 0o755);
    chmodSync(target, 0o644);
  }
});

test("install follows a multi-hop dangling settings.json symlink chain to its end", () => {
  const env = setup();
  const mid = join(env.root, "mid");
  const final = join(env.root, "dot", "final.json");
  mkdirSync(env.claude, { recursive: true });
  symlinkSync(mid, join(env.claude, "settings.json"));
  symlinkSync(final, mid);
  expect(run(env, "install").status).toBe(0);
  expect(lstatSync(mid).isSymbolicLink()).toBe(true);
  expect(mode(final)).toBe(0o600);
  expect(JSON.parse(readFileSync(final, "utf-8")).permissions.allow).toEqual([
    "Bash(theway:*)",
    `Read(/${env.theway}/**)`,
  ]);
});

test("install refuses a settings.json symlink loop and changes nothing", () => {
  const env = setup();
  const link = join(env.claude, "settings.json");
  const b = join(env.root, "b");
  mkdirSync(env.claude, { recursive: true });
  symlinkSync(b, link);
  symlinkSync(link, b);
  const res = run(env, "install");
  expect(res.status).toBe(1);
  expect(res.stderr).toBe(`theway: cannot write ${link}: it is a symlink loop; nothing was changed\n`);
  expect(lstatSync(b).isSymbolicLink()).toBe(true);
  expect(lstatSync(link).isSymbolicLink()).toBe(true);
  expect(existsSync(join(env.claude, "skills", "theway"))).toBe(false);
  expect(existsSync(bin(env))).toBe(false);
  expect(existsSync(pointer(env))).toBe(false);
  expect(existsSync(join(env.theway, "config.yaml"))).toBe(false);
});

test("install refuses a data home that is HOME, a parent of HOME, or holds a glob character", () => {
  for (const pick of [
    (e: Env) => e.home,
    (e: Env) => e.root,
    (e: Env) => join(e.root, "a*b"),
    (e: Env) => join(e.root, "a[b"),
  ]) {
    const env = setup();
    const home = pick(env);
    env.thewayHome = home;
    const settings = join(env.claude, "settings.json");
    const before = `${JSON.stringify({ permissions: { allow: ["Bash(ls:*)"] } })}\n`;
    put(settings, before);
    const res = run(env, "install");
    expect(res.status).toBe(1);
    expect(res.stderr).toBe(
      `theway: refusing data home ${resolve(home)}: ${
        home === env.home || home === env.root
          ? "it is your home folder or one of its parents"
          : "it contains a glob character or a line break"
      }; set THEWAY_HOME or --home to a dedicated folder\n`,
    );
    expect(readFileSync(settings, "utf-8")).toBe(before);
    expect(existsSync(join(env.claude, "skills", "theway"))).toBe(false);
    expect(existsSync(bin(env))).toBe(false);
    expect(existsSync(pointer(env))).toBe(false);
    expect(existsSync(join(home, "config.yaml"))).toBe(false);
  }
});

test("install accepts a data home inside HOME", () => {
  const env = setup();
  env.theway = join(env.home, "data");
  env.thewayHome = env.theway;
  expect(run(env, "install").status).toBe(0);
  expect(existsSync(join(env.theway, "config.yaml"))).toBe(true);
});

const sha256 = (text: string | Buffer) => createHash("sha256").update(text).digest("hex");
const shipped = (rel: string) => readFileSync(join(SHIPPED, rel), "utf-8");
const manifest = (env: Env): Record<string, string> =>
  JSON.parse(readFileSync(join(env.theway, ".shipped.json"), "utf-8"));
const STD = "standards/develop.md";
const STD_DEFAULT = "standards/develop.default.md";
const TPL = "templates/tech-stack-template.md";

/** Every file under `dir`, relative to it. */
function walk(dir: string, prefix = ""): string[] {
  return readdirSync(join(dir, prefix), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(dir, join(prefix, e.name)) : [join(prefix, e.name)],
  );
}

test("install into a fresh home writes every shipped file and a manifest of their hashes", () => {
  const env = setup();
  expect(run(env, "install").status).toBe(0);
  expect(SHIPPED_FILES).toHaveLength(49);
  for (const rel of [
    "workflows/develop.yaml",
    "workflows/agents.yaml",
    "steps/implement.yaml",
    "steps/review.yaml",
    "steps/pr.yaml",
    "prompts/conformance.md",
    "prompts/reviewer.md",
    "schemas/workflow.v1.json",
    "schemas/step.v1.json",
    "standards/commits.md",
    "standards/git-host.md",
  ]) {
    expect(SHIPPED_FILES).toContain(rel);
  }
  for (const rel of SHIPPED_FILES) expect(readFileSync(join(env.theway, rel), "utf-8")).toBe(shipped(rel));
  expect(manifest(env)).toEqual(Object.fromEntries(SHIPPED_FILES.map((rel) => [rel, sha256(shipped(rel))])));
  expect(manifest(env)["prompts/fix-spec-template.md"]).toBe(sha256(shipped("prompts/fix-spec-template.md")));
  expect(manifest(env)["prompts/light-spec-template.md"]).toBe(sha256(shipped("prompts/light-spec-template.md")));
  // The standards and templates that moved to prompts/ are no longer shipped there.
  for (const rel of ["standards/tamm-framework.md", "standards/spec-review.md", "templates/spec-template.md", "templates/tasks-template.md"]) {
    expect(SHIPPED_FILES).not.toContain(rel);
  }
  for (const rel of ["templates/coding-standards-template.md", "templates/source-tree-template.md", "templates/tech-stack-template.md"]) {
    expect(SHIPPED_FILES).toContain(rel);
  }
  expect(walk(env.theway).filter((f) => /\/[^/]+\.default\.(md|yaml)$/.test(f) || f.endsWith(".bak"))).toEqual([]);
});

test("install writes commits.md and git-host.md, keeps an edited one with its .default.md, and theway workflow resolves them", () => {
  const env = setup();
  expect(run(env, "install").status).toBe(0);
  const workflow = () => spawnSync("node", [CLI, "workflow", "--project", "theway", "agents"], { encoding: "utf-8", env: vars(env) });
  const doc = JSON.parse(workflow().stdout);
  expect([doc.commits, doc.git_host]).toEqual([join(env.theway, "standards", "commits.md"), join(env.theway, "standards", "git-host.md")]);
  put(join(env.theway, "standards", "git-host.md"), "# GitLab\n");
  const res = run(env, "install");
  expect(res.stdout).toContain("Kept your edited standards/git-host.md (shipped version: standards/git-host.default.md)\n");
  expect(readFileSync(join(env.theway, "standards", "git-host.md"), "utf-8")).toBe("# GitLab\n");
  expect(readFileSync(join(env.theway, "standards", "git-host.default.md"), "utf-8")).toBe(shipped("standards/git-host.md"));
  expect(workflow().status).toBe(0);
});

const WF = "workflows/develop.yaml";
const WF_DEFAULT = "workflows/develop.default.yaml";

test("install keeps an edited develop.yaml with develop.default.yaml next to it, and updates it once reverted", () => {
  const env = setup();
  expect(run(env, "install").status).toBe(0);
  const edited = "steps:\n  - implement:\n  - pr:\n";
  put(join(env.theway, WF), edited);
  const res = run(env, "install");
  expect(res.status).toBe(0);
  expect(res.stdout).toContain(`Kept your edited ${WF} (shipped version: ${WF_DEFAULT})\n`);
  expect(readFileSync(join(env.theway, WF), "utf-8")).toBe(edited);
  expect(readFileSync(join(env.theway, WF_DEFAULT), "utf-8")).toBe(shipped(WF));
  expect(manifest(env)[WF]).toBe(sha256(shipped(WF)));
  writeFileSync(join(env.theway, WF), shipped(WF));
  expect(run(env, "install").status).toBe(0);
  expect(existsSync(join(env.theway, WF_DEFAULT))).toBe(false);
});

test("install keeps a user workflow and prompt with a shipped name, and removes an unedited one theway stops shipping", () => {
  const env = setup();
  expect(run(env, "install").status).toBe(0);
  const LENS = "prompts/correctness.md";
  const GONE = "prompts/old.md";
  const EDITED = "workflows/old.yaml";
  const { [LENS]: _, [WF]: __, ...rest } = manifest(env);
  put(join(env.theway, ".shipped.json"), JSON.stringify({ ...rest, [GONE]: sha256("# old\n"), [EDITED]: sha256("steps: []\n") }));
  put(join(env.theway, LENS), "# my correctness\n");
  put(join(env.theway, WF), "steps:\n  - implement:\n");
  put(join(env.theway, GONE), "# old\n");
  put(join(env.theway, EDITED), "steps:\n  - implement:\n");
  put(join(env.theway, "prompts", "orphan.default.md"), "x\n");
  put(join(env.theway, "workflows", "orphan.default.yaml"), "x\n");
  const res = run(env, "install");
  expect(res.status).toBe(0);
  expect(res.stdout).toContain(`Kept your ${LENS}: theway now ships a file with that name (its version: prompts/correctness.default.md)\n`);
  expect(res.stdout).toContain(`Kept your ${WF}: theway now ships a file with that name (its version: ${WF_DEFAULT})\n`);
  expect(res.stdout).toContain(`Removed ${GONE}: theway no longer ships it\n`);
  expect(res.stdout).toContain(`Kept your edited ${EDITED}: theway no longer ships it, so it is now one of your workflows\n`);
  expect(readFileSync(join(env.theway, LENS), "utf-8")).toBe("# my correctness\n");
  expect(existsSync(join(env.theway, GONE))).toBe(false);
  expect(existsSync(join(env.theway, "prompts", "orphan.default.md"))).toBe(false);
  expect(existsSync(join(env.theway, "workflows", "orphan.default.yaml"))).toBe(false);
  expect(manifest(env)[LENS]).toBeUndefined();
});

test("install retires lenses/: removes an unedited shipped lens and the .default.md copies, keeps an edited or user lens with a message", () => {
  const env = setup();
  expect(run(env, "install").status).toBe(0);
  const old = "# Conformance\n";
  put(join(env.theway, ".shipped.json"), JSON.stringify({ ...manifest(env), "lenses/conformance.md": sha256(old), "lenses/correctness.md": sha256("# c\n") }));
  put(join(env.theway, "lenses", "conformance.md"), old);
  put(join(env.theway, "lenses", "correctness.md"), "# my correctness\n");
  put(join(env.theway, "lenses", "correctness.default.md"), "# c\n");
  put(join(env.theway, "lenses", "security.md"), "# security\n");
  put(join(env.theway, "lenses", "security.default.md"), "# x\n");
  const res = run(env, "install");
  expect(res.status).toBe(0);
  for (const line of [
    "Removed lenses/conformance.md: theway no longer ships it\n",
    "Kept your edited lenses/correctness.md: theway no longer reads lenses/; move it to prompts/correctness.md\n",
    "Kept lenses/security.md: theway no longer reads lenses/; move it to prompts/security.md\n",
  ]) {
    expect(res.stdout).toContain(line);
  }
  expect(existsSync(join(env.theway, "lenses", "conformance.md"))).toBe(false);
  expect(existsSync(join(env.theway, "lenses", "correctness.default.md"))).toBe(false);
  expect(existsSync(join(env.theway, "lenses", "security.default.md"))).toBe(false);
  expect(readFileSync(join(env.theway, "lenses", "correctness.md"), "utf-8")).toBe("# my correctness\n");
  expect(readFileSync(join(env.theway, "lenses", "security.md"), "utf-8")).toBe("# security\n");
  expect(Object.keys(manifest(env)).filter((k) => k.startsWith("lenses/"))).toEqual([]);
  // Once the user moves them, lenses/ is removed.
  rmSync(join(env.theway, "lenses", "correctness.md"));
  rmSync(join(env.theway, "lenses", "security.md"));
  const again = run(env, "install");
  expect([again.status, again.stdout.includes("lenses/")]).toEqual([0, false]);
  expect(existsSync(join(env.theway, "lenses"))).toBe(false);
});

test("install removes lenses/ when only unedited shipped lenses are left", () => {
  const env = setup();
  expect(run(env, "install").status).toBe(0);
  put(join(env.theway, ".shipped.json"), JSON.stringify({ ...manifest(env), "lenses/correctness.md": sha256("# c\n") }));
  put(join(env.theway, "lenses", "correctness.md"), "# c\n");
  const res = run(env, "install");
  expect(res.stdout).toContain("Removed lenses/correctness.md: theway no longer ships it\n");
  expect(existsSync(join(env.theway, "lenses"))).toBe(false);
});

const MOVED = [
  "standards/tamm-framework.md",
  "standards/spec-investigation.md",
  "standards/spec-review.md",
  "templates/spec-template.md",
  "templates/fix-spec-template.md",
  "templates/light-spec-template.md",
  "templates/tasks-template.md",
];

test("install removes the unedited standards and templates that moved to prompts/, their .default.md copies and manifest keys", () => {
  const env = setup();
  expect(run(env, "install").status).toBe(0);
  const old = Object.fromEntries(MOVED.map((rel) => [rel, `# old ${rel}\n`]));
  put(join(env.theway, ".shipped.json"), JSON.stringify({ ...manifest(env), ...Object.fromEntries(MOVED.map((rel) => [rel, sha256(old[rel] as string)])) }));
  for (const rel of MOVED) {
    put(join(env.theway, rel), old[rel] as string);
    put(join(env.theway, rel.replace(/\.md$/, ".default.md")), "# shipped\n");
  }
  const res = run(env, "install");
  expect(res.status).toBe(0);
  for (const rel of MOVED) {
    expect(res.stdout).toContain(`Removed ${rel}: theway no longer ships it\n`);
    expect([rel, existsSync(join(env.theway, rel)), existsSync(join(env.theway, rel.replace(/\.md$/, ".default.md")))]).toEqual([rel, false, false]);
    expect(manifest(env)[rel]).toBeUndefined();
  }
  // Each is reported once: copyShipped never sees them.
  expect(res.stdout.match(/standards\/spec-review\.md/g)).toHaveLength(1);
  for (const rel of ["templates/coding-standards-template.md", "templates/source-tree-template.md", "templates/tech-stack-template.md"]) {
    expect(readFileSync(join(env.theway, rel), "utf-8")).toBe(shipped(rel));
  }
  const again = run(env, "install");
  expect([again.status, again.stdout.includes("theway no longer ships it")]).toEqual([0, false]);
});

test("install renames an edited moved standard or template to .bak, naming the prompts that now hold it", () => {
  const env = setup();
  expect(run(env, "install").status).toBe(0);
  put(join(env.theway, ".shipped.json"), JSON.stringify({ ...manifest(env), "standards/spec-review.md": sha256("# old\n"), "templates/spec-template.md": sha256("# old\n") }));
  put(join(env.theway, "standards", "spec-review.md"), "# my review\n");
  put(join(env.theway, "standards", "spec-review.default.md"), "# old\n");
  put(join(env.theway, "templates", "spec-template.md"), "# my template\n");
  put(join(env.theway, "templates", "spec-template.md.bak"), "# earlier\n");
  // Not in the manifest: kept as edited.
  put(join(env.theway, "standards", "tamm-framework.md"), "# my tamm\n");
  const res = run(env, "install");
  expect(res.status).toBe(0);
  for (const line of [
    "Moved your edited standards/spec-review.md to standards/spec-review.md.bak: theway now reads prompts/spec-reviewer.md, grounding.md, implementability.md, verdicts.md, spec-triage.md and spec-fix.md\n",
    "Moved your edited templates/spec-template.md to templates/spec-template.md.bak.1: theway now reads prompts/spec-template.md\n",
    "Moved your edited standards/tamm-framework.md to standards/tamm-framework.md.bak: theway now reads prompts/tamm-framework.md\n",
  ]) {
    expect(res.stdout).toContain(line);
  }
  expect(readFileSync(join(env.theway, "standards", "spec-review.md.bak"), "utf-8")).toBe("# my review\n");
  expect(readFileSync(join(env.theway, "templates", "spec-template.md.bak.1"), "utf-8")).toBe("# my template\n");
  expect(readFileSync(join(env.theway, "templates", "spec-template.md.bak"), "utf-8")).toBe("# earlier\n");
  for (const rel of ["standards/spec-review.md", "standards/spec-review.default.md", "templates/spec-template.md", "standards/tamm-framework.md"]) {
    expect([rel, existsSync(join(env.theway, rel))]).toEqual([rel, false]);
  }
  expect(Object.keys(manifest(env)).filter((k) => MOVED.includes(k))).toEqual([]);
  // A renamed standard is no standard of theway context.
  const ctx = spawnSync("node", [CLI, "standards", "--project", "theway", "engineering"], { encoding: "utf-8", env: vars(env) });
  expect([ctx.status, ctx.stdout]).toEqual([0, ""]);
});

test("install ships schemas/ with the templates rules: an edited schema is kept with the shipped one next to it", () => {
  const env = setup();
  expect(run(env, "install").status).toBe(0);
  put(join(env.theway, "schemas", "step.v1.json"), "{}\n");
  const res = run(env, "install");
  expect(res.stdout).toContain("Kept your edited schemas/step.v1.json (shipped version: schemas/step.v1.default.json)\n");
  expect(readFileSync(join(env.theway, "schemas", "step.v1.default.json"), "utf-8")).toBe(shipped("schemas/step.v1.json"));
});

test("install removes an unedited standard no longer shipped, keeps an edited one, and keeps the user's config.yaml", () => {
  const env = setup();
  expect(run(env, "install").status).toBe(0);
  const GONE = "standards/architecture-principles.md";
  const EDITED = "standards/old-rules.md";
  const ORPHAN = "standards/old-rules.default.md";
  const config = "# my config\nstandards:\n  architecture:\n    enabled: true\n";
  put(join(env.theway, GONE), "# architecture principles\n");
  put(join(env.theway, EDITED), "# my old rules\n");
  put(join(env.theway, ORPHAN), "# old rules\n");
  put(
    join(env.theway, ".shipped.json"),
    JSON.stringify({ ...manifest(env), [GONE]: sha256("# architecture principles\n"), [EDITED]: sha256("# old rules\n") }),
  );
  put(join(env.theway, "config.yaml"), config);
  const res = run(env, "install");
  expect(res.status).toBe(0);
  expect(res.stdout).toContain(`Removed ${GONE}: theway no longer ships it\n`);
  expect(res.stdout).toContain(`Kept your edited ${EDITED}: theway no longer ships it, so it is now one of your standards\n`);
  expect(existsSync(join(env.theway, GONE))).toBe(false);
  expect(readFileSync(join(env.theway, EDITED), "utf-8")).toBe("# my old rules\n");
  expect(existsSync(join(env.theway, ORPHAN))).toBe(false);
  expect(manifest(env)[GONE]).toBeUndefined();
  expect(manifest(env)[EDITED]).toBeUndefined();
  expect(readFileSync(join(env.theway, "config.yaml"), "utf-8")).toBe(config);
  expect(readFileSync(join(env.theway, "config.default.yaml"), "utf-8")).toBe(readFileSync(SHIPPED_CONFIG, "utf-8"));
  const again = run(env, "install");
  expect(again.status).toBe(0);
  expect(again.stdout).not.toContain("no longer ships");
});

test("install leaves a template no longer shipped untouched", () => {
  const env = setup();
  expect(run(env, "install").status).toBe(0);
  const OLD = "templates/old-template.md";
  put(join(env.theway, OLD), "# old template\n");
  put(join(env.theway, ".shipped.json"), JSON.stringify({ ...manifest(env), [OLD]: sha256("# old template\n") }));
  const res = run(env, "install");
  expect(res.status).toBe(0);
  expect(res.stdout).not.toContain("no longer ships");
  expect(readFileSync(join(env.theway, OLD), "utf-8")).toBe("# old template\n");
  expect(manifest(env)[OLD]).toBeUndefined();
});

test("install updates an unedited file whose shipped version changed", () => {
  const env = setup();
  expect(run(env, "install").status).toBe(0);
  // Simulate an older shipped version: the file and its manifest hash both hold the old content.
  put(join(env.theway, STD), "# old shipped develop\n");
  put(join(env.theway, ".shipped.json"), JSON.stringify({ ...manifest(env), [STD]: sha256("# old shipped develop\n") }));
  const res = run(env, "install");
  expect(res.status).toBe(0);
  expect(res.stdout).not.toContain("Kept your edited");
  expect(res.stdout).not.toContain("Replaced");
  expect(readFileSync(join(env.theway, STD), "utf-8")).toBe(shipped(STD));
  expect(existsSync(join(env.theway, STD_DEFAULT))).toBe(false);
  expect(manifest(env)[STD]).toBe(sha256(shipped(STD)));
});

test("install keeps an edited file and writes the shipped version next to it", () => {
  const env = setup();
  expect(run(env, "install").status).toBe(0);
  const edited = Buffer.from("# my develop\r\nwith my rules\n");
  writeFileSync(join(env.theway, STD), edited);
  const res = run(env, "install");
  expect(res.status).toBe(0);
  expect(res.stdout).toContain(`Kept your edited ${STD} (shipped version: ${STD_DEFAULT})\n`);
  expect(readFileSync(join(env.theway, STD)).equals(edited)).toBe(true);
  expect(readFileSync(join(env.theway, STD_DEFAULT), "utf-8")).toBe(shipped(STD));
  expect(manifest(env)[STD]).toBe(sha256(shipped(STD)));
});

test("install over a home without a manifest backs up a differing template, then follows the manifest", () => {
  const env = setup();
  const TPL_DEFAULT = "templates/tech-stack-template.default.md";
  put(join(env.theway, TPL), "# my spec template\n");
  const res = run(env, "install");
  expect(res.status).toBe(0);
  expect(res.stdout).toContain(`Replaced ${TPL}; your previous version is in ${TPL}.bak\n`);
  expect(readFileSync(join(env.theway, TPL), "utf-8")).toBe(shipped(TPL));
  expect(readFileSync(join(env.theway, `${TPL}.bak`), "utf-8")).toBe("# my spec template\n");
  expect(manifest(env)[TPL]).toBe(sha256(shipped(TPL)));

  put(join(env.theway, TPL), "# my spec template again\n");
  const again = run(env, "install");
  expect(again.status).toBe(0);
  expect(again.stdout).not.toContain("Replaced");
  expect(again.stdout).toContain(`Kept your edited ${TPL} (shipped version: ${TPL_DEFAULT})\n`);
  expect(readFileSync(join(env.theway, TPL), "utf-8")).toBe("# my spec template again\n");
  expect(readFileSync(join(env.theway, `${TPL}.bak`), "utf-8")).toBe("# my spec template\n");
});

test("install removes the stale shipped copy once an edit is reverted to the shipped content", () => {
  const env = setup();
  expect(run(env, "install").status).toBe(0);
  put(join(env.theway, STD), "# my develop\n");
  expect(run(env, "install").status).toBe(0);
  expect(existsSync(join(env.theway, STD_DEFAULT))).toBe(true);
  // Revert to the shipped content the manifest records, then ship a newer version.
  put(join(env.theway, STD), "# old shipped develop\n");
  put(join(env.theway, ".shipped.json"), JSON.stringify({ ...manifest(env), [STD]: sha256("# old shipped develop\n") }));
  const res = run(env, "install");
  expect(res.status).toBe(0);
  expect(res.stdout).not.toContain("Kept your edited");
  expect(readFileSync(join(env.theway, STD), "utf-8")).toBe(shipped(STD));
  expect(existsSync(join(env.theway, STD_DEFAULT))).toBe(false);
});

test("install removes the stale shipped copy once an edit is reverted to the current shipped content", () => {
  const env = setup();
  expect(run(env, "install").status).toBe(0);
  put(join(env.theway, STD), "# my develop\n");
  expect(run(env, "install").status).toBe(0);
  expect(existsSync(join(env.theway, STD_DEFAULT))).toBe(true);
  writeFileSync(join(env.theway, STD), readFileSync(join(env.theway, STD_DEFAULT)));
  const res = run(env, "install");
  expect(res.status).toBe(0);
  expect(res.stdout).not.toContain("Kept your edited");
  expect(readFileSync(join(env.theway, STD), "utf-8")).toBe(shipped(STD));
  expect(existsSync(join(env.theway, STD_DEFAULT))).toBe(false);
});

test("install removes the stale shipped copy once an edited file is deleted", () => {
  const env = setup();
  expect(run(env, "install").status).toBe(0);
  put(join(env.theway, STD), "# my develop\n");
  expect(run(env, "install").status).toBe(0);
  expect(existsSync(join(env.theway, STD_DEFAULT))).toBe(true);
  rmSync(join(env.theway, STD));
  const res = run(env, "install");
  expect(res.status).toBe(0);
  expect(readFileSync(join(env.theway, STD), "utf-8")).toBe(shipped(STD));
  expect(existsSync(join(env.theway, STD_DEFAULT))).toBe(false);
});

test("install backs up a differing file the manifest has no entry for", () => {
  const env = setup();
  expect(run(env, "install").status).toBe(0);
  const { [TPL]: _, ...rest } = manifest(env);
  put(join(env.theway, ".shipped.json"), JSON.stringify(rest));
  put(join(env.theway, TPL), "# my spec template\n");
  const res = run(env, "install");
  expect(res.status).toBe(0);
  expect(res.stdout).toContain(`Replaced ${TPL}; your previous version is in ${TPL}.bak\n`);
  expect(readFileSync(join(env.theway, TPL), "utf-8")).toBe(shipped(TPL));
  expect(readFileSync(join(env.theway, `${TPL}.bak`), "utf-8")).toBe("# my spec template\n");
  expect(manifest(env)[TPL]).toBe(sha256(shipped(TPL)));
});

test("install keeps an existing differing backup and writes the next free one", () => {
  const env = setup();
  put(join(env.theway, `${TPL}.bak`), "# earlier edit\n");
  put(join(env.theway, TPL), "# my spec template\n");
  const res = run(env, "install");
  expect(res.status).toBe(0);
  expect(res.stdout).toContain(`Replaced ${TPL}; your previous version is in ${TPL}.bak.1\n`);
  expect(readFileSync(join(env.theway, `${TPL}.bak`), "utf-8")).toBe("# earlier edit\n");
  expect(readFileSync(join(env.theway, `${TPL}.bak.1`), "utf-8")).toBe("# my spec template\n");
  expect(readFileSync(join(env.theway, TPL), "utf-8")).toBe(shipped(TPL));
});

test("install treats an invalid manifest as absent", () => {
  const env = setup();
  expect(run(env, "install").status).toBe(0);
  put(join(env.theway, ".shipped.json"), "{not json");
  put(join(env.theway, TPL), "# my spec template\n");
  const res = run(env, "install");
  expect(res.status).toBe(0);
  expect(res.stdout).toContain(`Replaced ${TPL}; your previous version is in ${TPL}.bak\n`);
  expect(manifest(env)[TPL]).toBe(sha256(shipped(TPL)));
});

test("install over a home without a manifest keeps a differing standard as edited", () => {
  const env = setup();
  put(join(env.theway, STD), "# my develop\n");
  const res = run(env, "install");
  expect(res.status).toBe(0);
  expect(res.stdout).toContain(`Kept your edited ${STD} (shipped version: ${STD_DEFAULT})\n`);
  expect(res.stdout).not.toContain("Replaced");
  expect(readFileSync(join(env.theway, STD), "utf-8")).toBe("# my develop\n");
  expect(readFileSync(join(env.theway, STD_DEFAULT), "utf-8")).toBe(shipped(STD));
  expect(existsSync(join(env.theway, `${STD}.bak`))).toBe(false);
  expect(manifest(env)[STD]).toBe(sha256(shipped(STD)));
});

test("install keeps a user standard with a newly shipped name, on every install while the clash lasts", () => {
  const env = setup();
  expect(run(env, "install").status).toBe(0);
  const { [STD]: _, ...rest } = manifest(env);
  put(join(env.theway, ".shipped.json"), JSON.stringify(rest));
  put(join(env.theway, STD), "# my own develop standard\n");
  const line = `Kept your ${STD}: theway now ships a file with that name (its version: ${STD_DEFAULT})\n`;
  for (let i = 0; i < 2; i++) {
    const res = run(env, "install");
    expect(res.status).toBe(0);
    expect(res.stdout).toContain(line);
    expect(res.stdout).not.toContain("Replaced");
    expect(readFileSync(join(env.theway, STD), "utf-8")).toBe("# my own develop standard\n");
    expect(readFileSync(join(env.theway, STD_DEFAULT), "utf-8")).toBe(shipped(STD));
    expect(existsSync(join(env.theway, `${STD}.bak`))).toBe(false);
    expect(manifest(env)[STD]).toBeUndefined();
  }
});

test("install records a user standard identical to the newly shipped one, with no line", () => {
  const env = setup();
  expect(run(env, "install").status).toBe(0);
  const { [STD]: _, ...rest } = manifest(env);
  put(join(env.theway, ".shipped.json"), JSON.stringify(rest));
  const res = run(env, "install");
  expect(res.status).toBe(0);
  expect(res.stdout).not.toContain(STD);
  expect(existsSync(join(env.theway, STD_DEFAULT))).toBe(false);
  expect(manifest(env)[STD]).toBe(sha256(shipped(STD)));
});

const OLD_STD = "data/standards/develop.md";
const OLD_STD_DEFAULT = "data/standards/develop.default.md";

/** Turns a freshly installed home into one installed with the old layout: standards in `data/standards/`, keys `data/standards/<name>`. */
function oldLayout(env: Env): Record<string, string> {
  expect(run(env, "install").status).toBe(0);
  mkdirSync(join(env.theway, "data"));
  renameSync(join(env.theway, "standards"), join(env.theway, "data", "standards"));
  const old = Object.fromEntries(
    Object.entries(manifest(env)).map(([k, v]) => [k.startsWith("standards/") ? `data/${k}` : k, v]),
  );
  put(join(env.theway, ".shipped.json"), JSON.stringify(old));
  return old;
}

test("install moves the standards of an old-layout home as they are, keeps their hashes and removes the empty data/", () => {
  const env = setup();
  const old = oldLayout(env);
  // develop.md edited, with the shipped copy an earlier install kept next to it; sre.md an unedited older shipped version.
  const SRE = "standards/sre.md";
  put(join(env.theway, OLD_STD), "# my develop\n");
  put(join(env.theway, OLD_STD_DEFAULT), "# older shipped develop\n");
  put(join(env.theway, `data/${SRE}`), "# older shipped sre\n");
  const hashes = { ...old, [OLD_STD]: sha256("# older shipped develop\n"), [`data/${SRE}`]: sha256("# older shipped sre\n") };
  put(join(env.theway, ".shipped.json"), JSON.stringify(hashes));
  const res = run(env, "install");
  expect(res.status).toBe(0);
  expect(res.stdout).not.toContain("Left");
  expect(res.stdout).not.toContain("Replaced");
  expect(res.stdout).not.toContain(`Kept your ${STD}:`);
  expect(res.stdout).toContain(`Kept your edited ${STD} (shipped version: ${STD_DEFAULT})\n`);
  expect(existsSync(join(env.theway, "data"))).toBe(false);
  expect(readFileSync(join(env.theway, STD), "utf-8")).toBe("# my develop\n");
  expect(readFileSync(join(env.theway, STD_DEFAULT), "utf-8")).toBe(shipped(STD));
  // The kept hash marks sre.md unedited, so install updates it.
  expect(readFileSync(join(env.theway, SRE), "utf-8")).toBe(shipped(SRE));
  for (const rel of SHIPPED_FILES) {
    if (rel !== STD) expect(readFileSync(join(env.theway, rel), "utf-8")).toBe(shipped(rel));
  }
  expect(Object.keys(manifest(env)).sort()).toEqual([...SHIPPED_FILES].sort());
});

test("install moves an old .default.md copy only when standards/ has none", () => {
  const env = setup();
  oldLayout(env);
  put(join(env.theway, OLD_STD), "# my develop\n");
  put(join(env.theway, OLD_STD_DEFAULT), shipped(STD));
  const res = run(env, "install");
  expect(res.status).toBe(0);
  expect(res.stdout).toContain(`Kept your edited ${STD} (shipped version: ${STD_DEFAULT})\n`);
  expect(readFileSync(join(env.theway, STD), "utf-8")).toBe("# my develop\n");
  expect(readFileSync(join(env.theway, STD_DEFAULT), "utf-8")).toBe(shipped(STD));
  expect(existsSync(join(env.theway, "data"))).toBe(false);
});

test("install leaves an old .default.md copy when standards/ already has one, and keeps data/", () => {
  const env = setup();
  oldLayout(env);
  put(join(env.theway, OLD_STD), "# my develop\n");
  put(join(env.theway, OLD_STD_DEFAULT), "# old shipped copy\n");
  put(join(env.theway, STD_DEFAULT), "# existing copy\n");
  const res = run(env, "install");
  expect(res.status).toBe(0);
  expect(res.stdout).toContain("Left data/: it still holds files theway does not ship\n");
  expect(readFileSync(join(env.theway, OLD_STD_DEFAULT), "utf-8")).toBe("# old shipped copy\n");
  expect(readFileSync(join(env.theway, STD), "utf-8")).toBe("# my develop\n");
  expect(readFileSync(join(env.theway, STD_DEFAULT), "utf-8")).toBe(shipped(STD));
});

test("install finishes a migration interrupted between moving a standard and its .default.md copy", () => {
  const env = setup();
  oldLayout(env);
  mkdirSync(join(env.theway, "standards"));
  renameSync(join(env.theway, OLD_STD), join(env.theway, STD));
  put(join(env.theway, STD), "# my develop\n");
  put(join(env.theway, OLD_STD_DEFAULT), "# old shipped copy\n");
  const res = run(env, "install");
  expect(res.status).toBe(0);
  expect(res.stdout).not.toContain("Left");
  expect(res.stdout).toContain(`Kept your edited ${STD} (shipped version: ${STD_DEFAULT})\n`);
  expect(readFileSync(join(env.theway, STD), "utf-8")).toBe("# my develop\n");
  expect(readFileSync(join(env.theway, STD_DEFAULT), "utf-8")).toBe(shipped(STD));
  expect(existsSync(join(env.theway, "data"))).toBe(false);
});

test("install removes an empty data/standards/ and data/ left by an earlier migration, with no line", () => {
  const env = setup();
  expect(run(env, "install").status).toBe(0);
  mkdirSync(join(env.theway, "data", "standards"), { recursive: true });
  const res = run(env, "install");
  expect(res.status).toBe(0);
  expect(res.stdout).not.toContain("Left");
  expect(existsSync(join(env.theway, "data"))).toBe(false);
});

test("install keeps a folder in standards/ whose name ends in .default.md", () => {
  const env = setup();
  expect(run(env, "install").status).toBe(0);
  mkdirSync(join(env.theway, "standards", "x.default.md"));
  const res = run(env, "install");
  expect(res.status).toBe(0);
  expect(statSync(join(env.theway, "standards", "x.default.md")).isDirectory()).toBe(true);
});

test("install keeps data/ with its line when data/standards/ holds a file the manifest does not list", () => {
  const env = setup();
  oldLayout(env);
  put(join(env.theway, "data", "standards", "mine.md"), "# mine\n");
  const res = run(env, "install");
  expect(res.status).toBe(0);
  expect(res.stdout).toContain("Left data/: it still holds files theway does not ship\n");
  expect(readFileSync(join(env.theway, "data", "standards", "mine.md"), "utf-8")).toBe("# mine\n");
  expect(existsSync(join(env.theway, "standards", "mine.md"))).toBe(false);
  expect(readFileSync(join(env.theway, STD), "utf-8")).toBe(shipped(STD));
});

test("install leaves an old standard whose new path already exists, and one theway no longer ships", () => {
  const env = setup();
  const old = oldLayout(env);
  const GONE = "data/standards/architecture-principles.md";
  put(join(env.theway, GONE), "# architecture principles\n");
  put(join(env.theway, ".shipped.json"), JSON.stringify({ ...old, [GONE]: sha256("# architecture principles\n") }));
  put(join(env.theway, STD), "# my own develop standard\n");
  const res = run(env, "install");
  expect(res.status).toBe(0);
  expect(res.stdout).toContain(`Left ${OLD_STD}: ${STD} already exists\n`);
  expect(res.stdout).toContain(`Left ${GONE}: theway no longer ships it\n`);
  expect(res.stdout).toContain("Left data/: it still holds files theway does not ship\n");
  expect(readFileSync(join(env.theway, STD), "utf-8")).toBe("# my own develop standard\n");
  expect(readFileSync(join(env.theway, OLD_STD), "utf-8")).toBe(shipped(STD));
  expect(readFileSync(join(env.theway, GONE), "utf-8")).toBe("# architecture principles\n");
  expect(Object.keys(manifest(env)).filter((k) => k.startsWith("data/"))).toEqual([]);
  expect(manifest(env)["standards/architecture-principles.md"]).toBeUndefined();
});

test("install finishes a partial migration and drops a key whose files are both gone", () => {
  const env = setup();
  const old = oldLayout(env);
  // develop.md was moved before a crash, its key still data/standards/develop.md; it holds an unedited older version.
  mkdirSync(join(env.theway, "standards"));
  renameSync(join(env.theway, OLD_STD), join(env.theway, STD));
  put(join(env.theway, STD), "# older shipped develop\n");
  const SRE = "data/standards/sre.md";
  rmSync(join(env.theway, SRE));
  put(join(env.theway, ".shipped.json"), JSON.stringify({ ...old, [OLD_STD]: sha256("# older shipped develop\n") }));
  const res = run(env, "install");
  expect(res.status).toBe(0);
  expect(res.stdout).not.toContain("Left");
  expect(res.stdout).not.toContain("Kept your");
  expect(existsSync(join(env.theway, STD_DEFAULT))).toBe(false);
  expect(existsSync(join(env.theway, "data"))).toBe(false);
  // The renamed key keeps the hash of the older version, so install updates the file as unedited.
  expect(readFileSync(join(env.theway, STD), "utf-8")).toBe(shipped(STD));
  expect(manifest(env)[STD]).toBe(sha256(shipped(STD)));
  expect(manifest(env)[SRE]).toBeUndefined();
  // With the key dropped, sre.md is a missing shipped file: written from the release.
  expect(readFileSync(join(env.theway, "standards", "sre.md"), "utf-8")).toBe(shipped("standards/sre.md"));
});

const OFF_LINE = (home: string) =>
  `Opt-in standards are off (core_principles, sre, web_development, quality): set standards.<key>.enabled: true in ${home}/config.yaml to enable one\n`;

/** True when install wrote nothing: no data home, plugin, binary or pointer. */
function nothingWritten(env: Env, home = env.theway): void {
  expect(existsSync(home)).toBe(false);
  expect(existsSync(join(env.claude, "skills", "theway"))).toBe(false);
  expect(existsSync(bin(env))).toBe(false);
  expect(existsSync(pointer(env))).toBe(false);
}

test("install --home writes the data home there and the pointer names it, with nothing in ~/.theway", () => {
  const env = setup({ defaultHome: true });
  const data = join(env.root, "data");
  const res = run(env, "install", "--home", data);
  expect(res.status).toBe(0);
  expect(existsSync(join(data, "config.yaml"))).toBe(true);
  expect(readFileSync(pointer(env), "utf-8")).toBe(`${data}\n`);
  expect(existsSync(join(env.home, ".theway"))).toBe(false);
  expect(allow(env)).toEqual(["Bash(theway:*)", `Read(/${data}/**)`]);
});

test("install --home ~/data expands under HOME", () => {
  const env = setup({ defaultHome: true });
  expect(run(env, "install", "--home", "~/data").status).toBe(0);
  const data = join(env.home, "data");
  expect(existsSync(join(data, "config.yaml"))).toBe(true);
  expect(readFileSync(pointer(env), "utf-8")).toBe(`${data}\n`);
  expect(existsSync(join(env.home, ".theway"))).toBe(false);
});

test("install --home ~/.theway/ is the default home and writes no pointer", () => {
  const env = setup({ defaultHome: true });
  expect(run(env, "install", "--home", "~/.theway/").status).toBe(0);
  expect(existsSync(join(env.home, ".theway", "config.yaml"))).toBe(true);
  expect(existsSync(pointer(env))).toBe(false);
  expect(allow(env)).toEqual(["Bash(theway:*)", "Read(~/.theway/**)"]);
});

test("install --home overrides the home the pointer names", () => {
  const env = setup();
  expect(run(env, "install").status).toBe(0);
  env.thewayHome = undefined;
  const data = join(env.root, "data");
  expect(run(env, "install", "--home", data).status).toBe(0);
  expect(readFileSync(pointer(env), "utf-8")).toBe(`${data}\n`);
  expect(allow(env)).toEqual(["Bash(theway:*)", `Read(/${data}/**)`]);
});

test("install --home with a relative path exits 1 and writes nothing", () => {
  const env = setup({ defaultHome: true });
  const res = run(env, "install", "--home", "data");
  expect(res.status).toBe(1);
  expect(res.stderr).toBe("theway: invalid --home 'data': must be an absolute path or start with ~/; nothing was changed\n");
  nothingWritten(env);
});

test("install --home that differs from THEWAY_HOME exits 1 and writes nothing", () => {
  const env = setup();
  const data = join(env.root, "data");
  const res = run(env, "install", "--home", data);
  expect(res.status).toBe(1);
  expect(res.stderr).toBe(
    `theway: --home ${data} and THEWAY_HOME ${env.theway} differ; unset THEWAY_HOME or drop --home; nothing was changed\n`,
  );
  nothingWritten(env);
  expect(existsSync(data)).toBe(false);
});

test("install --home equal to THEWAY_HOME installs there", () => {
  const env = setup();
  expect(run(env, "install", "--home", env.theway).status).toBe(0);
  expect(existsSync(join(env.theway, "config.yaml"))).toBe(true);
  expect(readFileSync(pointer(env), "utf-8")).toBe(`${env.theway}\n`);
});

test("install --home set to HOME is refused with the --home message and writes nothing", () => {
  const env = setup({ defaultHome: true });
  const res = run(env, "install", "--home", env.home);
  expect(res.status).toBe(1);
  expect(res.stderr).toBe(
    `theway: refusing data home ${env.home}: it is your home folder or one of its parents; set THEWAY_HOME or --home to a dedicated folder\n`,
  );
  nothingWritten(env);
  expect(existsSync(join(env.home, "config.yaml"))).toBe(false);
});

test("install --standards sre,quality turns on exactly those two keys and keeps config.default.yaml shipped", () => {
  const env = setup();
  const res = run(env, "install", "--standards", "sre,quality");
  expect(res.status).toBe(0);
  const shipped = readFileSync(SHIPPED_CONFIG, "utf-8").split("\n");
  const written = readFileSync(join(env.theway, "config.yaml"), "utf-8").split("\n");
  expect(written.length).toBe(shipped.length);
  const diff = written.flatMap((line, i) => (line !== shipped[i] ? [[shipped[i - 1], line]] : []));
  expect(diff).toEqual([
    ["  sre:", "    enabled: true"],
    ["  quality:", "    enabled: true"],
  ]);
  expect(readFileSync(join(env.theway, "config.default.yaml"), "utf-8")).toBe(readFileSync(SHIPPED_CONFIG, "utf-8"));
  expect(res.stdout).not.toContain("Opt-in standards are off");
});

test("install --standards none writes the shipped config with no line", () => {
  const env = setup();
  const res = run(env, "install", "--standards", "none");
  expect(res.status).toBe(0);
  expect(readFileSync(join(env.theway, "config.yaml"), "utf-8")).toBe(readFileSync(SHIPPED_CONFIG, "utf-8"));
  expect(res.stdout).not.toContain("Opt-in standards are off");
});

test("install with no flag and no terminal writes the shipped config and prints the opt-in line", () => {
  const env = setup();
  const res = run(env, "install");
  expect(res.status).toBe(0);
  expect(readFileSync(join(env.theway, "config.yaml"), "utf-8")).toBe(readFileSync(SHIPPED_CONFIG, "utf-8"));
  expect(res.stdout).toContain(OFF_LINE(env.theway));
});

test("install over an existing config.yaml prints no opt-in line", () => {
  const env = setup();
  expect(run(env, "install").status).toBe(0);
  const res = run(env, "install");
  expect(res.status).toBe(0);
  expect(res.stdout).not.toContain("Opt-in standards are off");
});

test("install --standards with an unknown key exits 1 and writes nothing", () => {
  for (const [value, element] of [
    ["sre,bogus", "bogus"],
    ["sre,", ""],
    ["", ""],
  ]) {
    const env = setup();
    const res = run(env, "install", "--standards", value);
    expect(res.status).toBe(1);
    expect(res.stderr).toBe(
      `theway: unknown standard '${element}' in --standards; valid: core_principles, sre, web_development, quality, or none\n`,
    );
    nothingWritten(env);
  }
});

test("install --standards none,sre exits 1 and writes nothing", () => {
  const env = setup();
  const res = run(env, "install", "--standards", "none,sre");
  expect(res.status).toBe(1);
  expect(res.stderr).toBe("theway: --standards none cannot be combined with other standards\n");
  nothingWritten(env);
});

test("install --standards none,none exits 1 and writes nothing", () => {
  const env = setup();
  const res = run(env, "install", "--standards", "none,none");
  expect(res.status).toBe(1);
  expect(res.stderr).toBe(
    "theway: unknown standard 'none' in --standards; valid: core_principles, sre, web_development, quality, or none\n",
  );
  nothingWritten(env);
});

test("install --standards on an existing home exits 1 and leaves config.yaml as it is", () => {
  const env = setup();
  const config = join(env.theway, "config.yaml");
  put(config, "standards:\n  sre:\n    enabled: false\n");
  const before = readFileSync(config);
  const res = run(env, "install", "--standards", "sre");
  expect(res.status).toBe(1);
  expect(res.stderr).toBe(
    `theway: --standards applies only to a first install; ${config} exists, so set standards.<key>.enabled there instead; nothing was changed\n`,
  );
  expect(readFileSync(config)).toEqual(before);
  expect(readdirSync(env.theway)).toEqual(["config.yaml"]);
  expect(existsSync(join(env.claude, "skills", "theway"))).toBe(false);
  expect(existsSync(bin(env))).toBe(false);
});

test("install --standards bogus on an existing home gives the unknown-standard message", () => {
  const env = setup();
  const config = join(env.theway, "config.yaml");
  put(config, "standards: {}\n");
  const res = run(env, "install", "--standards", "bogus");
  expect(res.status).toBe(1);
  expect(res.stderr).toBe(
    "theway: unknown standard 'bogus' in --standards; valid: core_principles, sre, web_development, quality, or none\n",
  );
  expect(readFileSync(config, "utf-8")).toBe("standards: {}\n");
  expect(readdirSync(env.theway)).toEqual(["config.yaml"]);
  expect(existsSync(join(env.claude, "skills", "theway"))).toBe(false);
  expect(existsSync(bin(env))).toBe(false);
});

test("the standards prompt hints are the comments above each opt-in key of the shipped config", () => {
  expect(Object.keys(OPT_IN_HINTS)).toEqual(OPT_IN_KEYS);
  const lines = readFileSync(SHIPPED_CONFIG, "utf-8").split("\n");
  for (const key of OPT_IN_KEYS) {
    const i = lines.indexOf(`  ${key}:`);
    expect(i).toBeGreaterThan(0);
    expect(lines[i - 1]).toBe(`  # ${OPT_IN_HINTS[key]}`);
    expect(lines[i + 1]).toBe("    enabled: false");
  }
});

test("dist/theway.js bundles @clack/prompts instead of importing it", () => {
  const text = readFileSync(CLI, "utf-8");
  expect(text).not.toMatch(/(\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["']@clack\//);
  const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf-8"));
  expect(pkg.devDependencies["@clack/prompts"]).toBe("1.8.1");
  expect(pkg.dependencies).toBeUndefined();
});
