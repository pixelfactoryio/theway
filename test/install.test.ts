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

const REPO = join(import.meta.dirname, "..");
const CLI = join(REPO, "dist", "theway.js");
const SHIPPED = join(REPO, "plugin", "home");
const SHIPPED_CONFIG = join(SHIPPED, "config.yaml");
const SHIPPED_FILES = ["standards", "templates"].flatMap((d) =>
  readdirSync(join(SHIPPED, d))
    .filter((n) => n.endsWith(".md"))
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
  expect(existsSync(join(env.theway, "config.yaml"))).toBe(true);
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

test("install without THEWAY_HOME keeps the home the pointer names, as /theway:setup runs it", () => {
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
  put(join(env.theway, "proj", "changes", "add-x", "spec.md"), "# x\n");
  put(
    join(env.claude, "settings.json"),
    JSON.stringify({ permissions: { allow: ["Bash(ls:*)", "Read(~/.theway/**)", "Bash(~/.theway/bin/theway:*)"] } }),
  );
  expect(run(env, "install").status).toBe(0);
  expect(existsSync(join(env.theway, "bin"))).toBe(false);
  expect(readFileSync(join(env.theway, "config.yaml"), "utf-8")).toBe("# sentinel: keep me\n");
  expect(existsSync(join(env.theway, "proj", "changes", "add-x", "spec.md"))).toBe(true);
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
      }; set THEWAY_HOME to a dedicated folder\n`,
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
const TPL = "templates/spec-template.md";

/** Every file under `dir`, relative to it. */
function walk(dir: string, prefix = ""): string[] {
  return readdirSync(join(dir, prefix), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(dir, join(prefix, e.name)) : [join(prefix, e.name)],
  );
}

test("install into a fresh home writes every shipped file and a manifest of their hashes", () => {
  const env = setup();
  expect(run(env, "install").status).toBe(0);
  expect(SHIPPED_FILES).toHaveLength(14);
  for (const rel of SHIPPED_FILES) expect(readFileSync(join(env.theway, rel), "utf-8")).toBe(shipped(rel));
  expect(manifest(env)).toEqual(Object.fromEntries(SHIPPED_FILES.map((rel) => [rel, sha256(shipped(rel))])));
  expect(manifest(env)["templates/fix-spec-template.md"]).toBe(sha256(shipped("templates/fix-spec-template.md")));
  expect(manifest(env)["templates/light-spec-template.md"]).toBe(sha256(shipped("templates/light-spec-template.md")));
  expect(walk(env.theway).filter((f) => f.endsWith(".default.md") || f.endsWith(".bak"))).toEqual([]);
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
  const TPL_DEFAULT = "templates/spec-template.default.md";
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
