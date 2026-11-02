import { expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { buildProgram } from "../src/program";

const REPO = join(import.meta.dirname, "..");
const PLUGIN = join(REPO, "plugin");
const COMMANDS = join(PLUGIN, "commands");
const commands = readdirSync(COMMANDS).filter((f) => f.endsWith(".md"));
const read = (path: string) => readFileSync(path, "utf-8");

test("every command points to the npx install", () => {
  const missing = commands.filter(
    (f) => !read(join(COMMANDS, f)).includes("`npx --yes @pixelfactoryio/theway@latest install` then `/reload-plugins`"),
  );
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

test("no file in plugin/, src/, site/ or test/ names the removed setup command", () => {
  const removed = "theway:" + "setup";
  const site = readdirSync(join(REPO, "site"))
    .filter((e) => !["node_modules", ".next", "out"].includes(e))
    .map((e) => join("site", e));
  const searched = ["plugin", "src", "test", ...site].flatMap((p) => {
    const path = join(REPO, p);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
  const offending = searched.filter((f) => read(f).includes(removed));
  expect(searched).toContain(join(REPO, "test", "lint.test.ts"));
  expect(offending.map((f) => relative(REPO, f))).toEqual([]);
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
  const readers = ["archive.md", "develop-workflow.md", "develop.md", "document.md", "engineering-light.md", "engineering.md", "list.md"];
  const reference = locateStep(read(join(COMMANDS, "engineering.md")));
  for (const marker of [
    "Run `theway path`",
    "error: unknown command",
    "`theway: warning:`",
    "Do not check for files under `<home>` before reading them",
    "`<home>/standards/` or `<home>/templates/`",
  ]) {
    expect(reference).toContain(marker);
  }
  expect(reference).not.toContain("<home>/config.yaml");
  expect(readers.filter((f) => locateStep(read(join(COMMANDS, f))) !== reference)).toEqual([]);
});

test("engineering, develop and develop-workflow get the change folder from theway path", () => {
  const missing = ["engineering.md", "engineering-light.md", "develop.md", "develop-workflow.md"].filter(
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
  const files = ["README.md", ...commands.map((f) => `plugin/commands/${f}`)];
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

test("every workflow action is pinned to a commit SHA", () => {
  const WORKFLOWS = join(REPO, ".github", "workflows");
  const unpinned = readdirSync(WORKFLOWS)
    .filter((f) => f.endsWith(".yml"))
    .flatMap((f) =>
      read(join(WORKFLOWS, f))
        .split("\n")
        .filter((line) => /^\s*-?\s*uses:/.test(line))
        .filter((line) => !/uses: [\w.-]+\/[\w./-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/.test(line))
        .map((line) => `${f}: ${line.trim()}`),
    );
  expect(unpinned).toEqual([]);
});

test("engineering.md runs the spec review the shipped config.yaml sets up", () => {
  const engineering = read(join(COMMANDS, "engineering.md"));
  expect(engineering).toMatch(/^### Step 6: Review$/m);
  expect(engineering).toContain("engineering.review_rounds");
  expect(engineering).toContain("engineering.models.critic");
  const config = Bun.YAML.parse(read(join(PLUGIN, "home", "config.yaml"))) as {
    engineering?: { review_rounds?: unknown; models?: { critic?: unknown } };
  };
  expect(config.engineering?.review_rounds).toBe(1);
  expect(config.engineering?.models?.critic).toBe("opus");
});

test("the shipped defaults are neutral and the four architecture standards are opt-in", () => {
  const HOME = join(PLUGIN, "home");
  const TEMPLATES = join(HOME, "templates");
  const all = files(PLUGIN);
  expect(all.filter((f) => read(f).includes("SRE-EE"))).toEqual([join(HOME, "standards", "sre.md")]);
  expect(all.filter((f) => read(f).includes("architecture-principles"))).toEqual([]);
  for (const name of ["spec-template.md", "fix-spec-template.md", "light-spec-template.md", "tasks-template.md"]) {
    const template = read(join(TEMPLATES, name));
    expect(template).not.toContain("Estimated");
    expect(template).not.toContain("Target Completion");
  }
  const techStack = read(join(TEMPLATES, "tech-stack-template.md"));
  const infra = ["Cloud Infrastructure", "Infrastructure & Deployment", "Database & Storage", "Monitoring & Observability", "Security Tools"];
  for (const heading of infra) {
    expect(techStack).toContain(`\n## ${heading}\n[Omit this section if the repository has none.]\n\n`);
    expect(techStack).toMatch(new RegExp(`^## ${heading}\\n\\[Omit this section if the repository has none\\.\\]\\n\\n\\S`, "m"));
  }
  const config = Bun.YAML.parse(read(join(HOME, "config.yaml"))) as {
    standards?: Record<string, { enabled?: unknown } | undefined>;
  };
  for (const key of ["core_principles", "sre", "web_development", "quality"]) {
    expect(config.standards?.[key]?.enabled).toBe(false);
  }
  expect(config.standards?.architecture).toBeUndefined();
});

test("the shipped config has no dead sections", () => {
  const config = Bun.YAML.parse(read(join(PLUGIN, "home", "config.yaml"))) as Record<string, unknown>;
  expect(Object.keys(config).sort()).toEqual(["engineering", "standards", "workflow"]);
  const standards = config.standards as Record<string, Record<string, unknown>>;
  expect(Object.keys(standards).sort()).toEqual(["core_principles", "quality", "sre", "web_development"]);
  for (const entry of Object.values(standards)) {
    expect(Object.keys(entry)).toEqual(["enabled"]);
  }
});

test("plugin/home holds only what install reads", () => {
  const HOME = join(PLUGIN, "home");
  const unused = files(HOME)
    .map((f) => relative(HOME, f))
    .filter((f) => !/^(config\.yaml|standards\/[^/]+\.md|templates\/[^/]+\.md)$/.test(f));
  expect(unused).toEqual([]);
});

/** The text of `src/core/init.ts` without its migration from the old layout, the one place that names it. */
const initWithoutMigration = (text: string) => text.replace(/^\/\*\*\n(?:(?! \*\/).*\n)* \*\/\nfunction migrateDataStandards\([\s\S]*?^\}\n/m, "");

test("plugin/ and src/ name no path of the old layout, except the migration in src/core/init.ts", () => {
  const OLD = /data\/standards|"data", "standards"|templates\/theway|"templates", "theway"/;
  const INIT = join(REPO, "src", "core", "init.ts");
  expect(initWithoutMigration(read(INIT))).not.toBe(read(INIT));
  const hits = [...files(PLUGIN), ...files(join(REPO, "src"))].flatMap((f) =>
    (f === INIT ? initWithoutMigration(read(f)) : read(f))
      .split("\n")
      .filter((line) => OLD.test(line))
      .map((line) => `${relative(REPO, f)}: ${line.trim()}`),
  );
  expect(hits).toEqual([]);
});

test("every spawned agent gets the Authority rule", () => {
  expect(read(join(PLUGIN, "home", "standards", "interaction.md"))).toContain("\n## Authority\n");
  for (const f of ["develop-workflow.md", "engineering-light.md", "engineering.md"]) {
    expect(read(join(COMMANDS, f))).toContain("`## Authority` section of `<home>/standards/interaction.md`");
  }
  for (const f of ["archive.md", "develop.md", "develop-workflow.md", "document.md", "engineering-light.md", "engineering.md"]) {
    expect(read(join(COMMANDS, f))).toContain("(exploration, reporting and authority)");
  }
});

const TEMPLATES = join(PLUGIN, "home", "templates");
const STANDARDS = join(PLUGIN, "home", "standards");

/** A string escaped for use inside a regular expression. */
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The YAML frontmatter of a template. */
const frontmatter = (text: string) => Bun.YAML.parse(/^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? "") as Record<string, unknown>;

/** The `## ` section of a text with the given heading, up to the next `## ` heading. */
const section = (text: string, heading: string) =>
  new RegExp(`^## ${escapeRegExp(heading)}\n[\\s\\S]*?(?=^## |(?![\\s\\S]))`, "m").exec(text)?.[0] ?? "";

/** The `### ` step of a command whose heading starts with `prefix`, up to the next `### ` or `## ` heading. */
const step = (text: string, prefix: string) =>
  new RegExp(`^### ${escapeRegExp(prefix)}[\\s\\S]*?(?=^##)`, "m").exec(text)?.[0] ?? "";

test("the fix spec template has the spec template's frontmatter keys, its fixed headings and the two fixed criteria", () => {
  const fix = read(join(TEMPLATES, "fix-spec-template.md"));
  const spec = read(join(TEMPLATES, "spec-template.md"));
  expect(Object.keys(frontmatter(fix))).toEqual(Object.keys(frontmatter(spec)));
  expect(frontmatter(fix).template_type).toBe("fix");
  expect([...fix.matchAll(/^## (.+)$/gm)].map((m) => m[1])).toEqual([
    "Solution",
    "Symptom",
    "Reproduction",
    "Root Cause",
    "Fix",
    "Regression Test",
    "Scope",
    "Hardpoints (TAMM Analysis)",
    "Implementation",
  ]);
  expect(section(fix, "Solution")).toContain("**Problem:**");
  expect(section(fix, "Reproduction")).toContain("Reasoning about the code is not a reproduction.");
  expect(section(fix, "Reproduction")).toContain("**Observed output:**");
  expect(section(fix, "Reproduction")).toContain("**Expected result:**");
  expect(section(fix, "Root Cause")).toContain("file:line evidence");
  const regression = section(fix, "Regression Test");
  for (const field of ["**File:**", "**Test name:**", "**Command:**", "**Failure on the base commit:**"]) {
    expect(regression).toContain(field);
  }
  expect(section(fix, "Hardpoints (TAMM Analysis)")).toContain("**Only document Medium/High risk hardpoints. Omit low-risk items.**");
  expect(section(fix, "Hardpoints (TAMM Analysis)")).toContain('"None at Medium or High."');
  const implementation = section(fix, "Implementation");
  expect(implementation).toContain("Task 1 of `tasks.md` writes the regression test");
  const criteria = implementation.split("**Success Criteria:**\n")[1]?.split("\n").filter((l) => l.startsWith("- [ ] "));
  expect(criteria?.slice(0, 2)).toEqual([
    "- [ ] The regression test `[test name]` fails on the base commit for the reason in Root Cause, and passes with the fix",
    "- [ ] The reproduction no longer reproduces: `[reproduction command]` now shows [expected result]",
  ]);
});

test("engineering.md handles a fix- change: the verb, reproduce first, the stop outcomes, the template and the grounding check", () => {
  const engineering = read(join(COMMANDS, "engineering.md"));
  expect(engineering).toContain("`add-*`, `update-*`, `refactor-*`, `remove-*`, `fix-*`");
  expect(engineering).toContain("`fix-login-crash`");
  expect(engineering).toContain("(same `add-`/`update-`/`refactor-`/`remove-`/`fix-` rule)");
  const step3 = step(engineering, "Step 3: Investigate");
  for (const marker of [
    "**For a `fix-` change, reproduce the bug first**",
    "`mktemp -d`",
    "existing commands and tests without changing the repository",
    "Reasoning about the code is not a reproduction.",
    "before any change file is written",
    "- **Not reproduced:**",
    "listing each attempt (its command and output)",
    "- **Possibly already covered:**",
    "an active change listed by `theway list <project>`",
    "Judge from the IDs only: never open other change folders.",
    "- **Works as intended:**",
  ]) {
    expect(step3).toContain(marker);
  }
  const step4 = step(engineering, "Step 4:");
  expect(step4).toContain("`<home>/templates/fix-spec-template.md` for a `fix-` ID");
  expect(step4).toContain("A `fix-` ID uses `fix-spec-template.md`");
  expect(step4).toContain("In a `fix-` change, task 1 writes the regression test");
  expect(step(engineering, "Step 6: Review")).toContain("re-runs the recorded reproduction as a single-question probe");
  const exit = section(engineering, "Exit");
  expect(exit).toContain("When a `fix-` change stopped in Step 3");
  expect(exit).toContain("in place of the change folder and the review outcome");
  expect(exit).toContain("the attempts (each command and its output) or the evidence");
  expect(exit).toContain("the user re-runs `/theway:engineering` with the new information");
});

test("develop.md Verify proves a fix- regression test fails on the base commit and re-runs the reproduction", () => {
  const verify = section(read(join(STANDARDS, "develop.md")), "Verify");
  for (const marker of [
    "### A `fix-` change",
    "`HEAD` for `/theway:develop`",
    "`git merge-base <base> HEAD` for `/theway:develop-workflow`",
    "`git worktree add --detach <dir> <base-commit>`",
    "`<dir>` comes from `mktemp -d`",
    "setup and build commands that CI runs before its tests",
    "run only the regression test.",
    "It must fail **for the reason the spec's Root Cause gives**.",
    "`git worktree remove --force <dir>`",
    "with the `<base>` your prompt gives",
    "Do this whatever happened before",
    "bring it back as a spec gap",
    "report the criterion as not verified.",
    "re-run the reproduction recorded in the spec",
    "it must no longer reproduce",
  ]) {
    expect(verify).toContain(marker);
  }
});

test("develop-workflow.md takes the commit type from the change verb and reviews a fix's root cause", () => {
  const workflow = read(join(COMMANDS, "develop-workflow.md"));
  const step3 = step(workflow, "Step 3:");
  for (const marker of [
    "- `add-` → `feat`, `fix-` → `fix`, `refactor-` → `refactor`.",
    "For `update-` and `remove-`, the implementer chooses one Conventional type",
    "The orchestrator gives that type to every fix agent (Steps 4 and 5)",
    "except commits that change only tests (`test`) or only docs (`docs`)",
    "`!` after it and the commit a `BREAKING CHANGE:` footer",
    "for an `update-` or `remove-` change, the commit type it chose",
    "the change's `<base>` (Step 2), which `develop.md` uses for a `fix-` change",
    "With several implementers, the first one run chooses the type",
  ]) {
    expect(step3).toContain(marker);
  }
  expect(step(workflow, "Step 2:")).toContain("is the change's `<base>`");
  const step4 = step(workflow, "Step 4:");
  for (const marker of [
    "For a `fix-` change, the reviewers also check the root cause",
    "the regression test would fail without the fix",
    "spawn one fix agent with them and the change's commit type (Step 3)",
    "re-runs the base-commit check of `develop.md`'s Verify on the new head",
    "failing on the base commit for the Root Cause's reason",
  ]) {
    expect(step4).toContain(marker);
  }
  const step5 = step(workflow, "Step 5:");
  expect(step5).toContain("Its title is a Conventional Commit (`type(scope): description`)");
  expect(step5).toContain("spawn one fix agent with the quoted CI error and the change's commit type");
});

test("the light spec template has the spec template's frontmatter keys, the Mode line, its fixed headings and the two fix- criteria", () => {
  const light = read(join(TEMPLATES, "light-spec-template.md"));
  const spec = read(join(TEMPLATES, "spec-template.md"));
  expect(Object.keys(frontmatter(light))).toEqual(Object.keys(frontmatter(spec)));
  expect(frontmatter(light).template_type).toBe("light");
  const standards = (frontmatter(light).quality_standards as string[]).join("\n");
  for (const word of ["Scope", "TAMM", "phase"]) expect(standards).not.toContain(word);
  expect(light).toContain("\n# Spec Analysis: [Change Name]\n**Mode:** light\n");
  expect([...light.matchAll(/^## (.+)$/gm)].map((m) => m[1])).toEqual(["Problem", "Evidence", "Change", "Success Criteria"]);
  const evidence = section(light, "Evidence");
  expect(evidence).toContain("Reasoning about the code is not a reproduction.");
  for (const field of ["**Command:**", "**Observed output:**", "**Expected result:**"]) expect(evidence).toContain(field);
  expect(section(light, "Change").trimEnd().endsWith("Nothing else changes.")).toBe(true);
  const criteria = section(light, "Success Criteria").split("\n").filter((l) => l.startsWith("- [ ] "));
  expect(criteria.slice(0, 2)).toEqual([
    "- [ ] The regression test `[test name]` fails before the fix and passes with it",
    "- [ ] The reproduction no longer reproduces: `[reproduction command]` now shows [expected result]",
  ]);
});

test("engineering-light.md validates a standalone ID, escalates, writes the light spec and runs one grounding critic", () => {
  const light = read(join(COMMANDS, "engineering-light.md"));
  for (const marker of [
    "run `theway validate-id <change-id>`, never with `--series`",
    "Escalate when the investigation finds a decision to make",
    "a TAMM risk at Medium or High, or a request for a series.",
    "Escalating writes no change file",
    "tell the user to run `/theway:engineering` with the original request",
    "Run up to `min(engineering.review_rounds, 1)` review rounds",
    "with one grounding critic.",
    "A confirmed `decision` finding is an escalation, not an open question.",
    "Escalating after the review keeps the light files",
    "`/theway:engineering <change-id>: <original request>`",
  ]) {
    expect(light).toContain(marker);
  }
  expect(light).not.toContain("validate-id <change-id> --series");
  expect(light).not.toContain("Implementability critic");
  expect(light).toContain("`<home>/templates/light-spec-template.md` | `spec.md`");
  expect(light).toContain("`<home>/templates/tasks-template.md` | `tasks.md`");
  expect(light).toContain("`tasks.md` follows `tasks-template.md`'s rule for a light change.");
  expect(light).toContain("A light change has no `design.md`.");
  expect(light).toContain("**For a `fix-` change, reproduce the bug first**");
  expect(light).toContain("they go into the spec's Evidence, quoted");
  expect(light).toContain("the user re-runs `/theway:engineering-light` with the new information");
  expect(light).toContain("engineering.models.critic");
  expect(light).toContain("re-runs the recorded reproduction as a single-question probe");
});

test("engineering.md does not stop on the change IDs it writes or the series it continues", () => {
  const covered = /^- \*\*Possibly already covered:\*\*.*$/m.exec(step(read(join(COMMANDS, "engineering.md")), "Step 3:"))?.[0] ?? "";
  expect(covered).toContain("other than the ones this run writes");
  expect(covered).toContain("the existing members of the series it continues");
});

test("develop.md proves a light fix- change without the base worktree and escalates its unforeseen risks", () => {
  const develop = read(join(STANDARDS, "develop.md"));
  const verify = section(develop, "Verify");
  expect(verify).toContain("When `spec.md` has `**Mode:** light` under its title, steps 1-7 do not apply");
  expect(verify).toContain("run the regression test before writing the fix");
  expect(verify).toContain("failing output in the Discoveries of `tasks.md` Notes");
  const fit = section(develop, "When the spec does not fit");
  expect(fit).toContain("A light spec has no Hardpoints table");
  expect(fit).toContain("is brought back as a blocker.");
});

test("develop-workflow.md caps a light change's review at one round and checks its fix- test on the new head", () => {
  const step4 = step(read(join(COMMANDS, "develop-workflow.md")), "Step 4:");
  for (const marker of [
    "run up to `min(workflow.review_rounds, 1)` rounds.",
    "the reviewers check the diff against its Change section",
    "For a light `fix-` change whose fixes touch the regression test or the fix",
    "re-runs the regression test on the new head instead of the base-commit check",
    "only when that output shows the regression test passing.",
  ]) {
    expect(step4).toContain(marker);
  }
});

const OPT_IN_PATHS = ["core-principles.md", "sre.md", "web-development.md", "quality.md"].map((n) => `<home>/standards/${n}`);
const OPT_IN = "An opt-in standard is read only when";

test("engineering and engineering-light read the standards, follow them, give them to the critics and report them", () => {
  for (const f of ["engineering.md", "engineering-light.md"]) {
    const text = read(join(COMMANDS, f));
    const step1 = step(text, "Step 1:");
    expect(step1).toContain("- `<home>/standards/tamm-framework.md` - TAMM framework");
    expect(step1).toContain("Then run `theway standards <project> engineering` and read every file it prints");
    expect(step1).toContain("the spec follows them.");
    for (const path of OPT_IN_PATHS) expect(text).not.toContain(path);
    expect(text).not.toContain(OPT_IN);
    expect(text).not.toContain("user standard");
    expect(text).toContain("except the standards (next item) and the `## Authority` section");
    expect(text).toContain("- the absolute paths of the standards read in Step 1");
    expect(text).toContain("read in Step 1, which the spec must follow;");
    expect(section(text, "Exit")).toContain("names the standards read in Step 1, by file name, or \"none\"");
  }
  const engineering = read(join(COMMANDS, "engineering.md"));
  expect(step(engineering, "Step 3: Investigate")).toContain("A request that contradicts a standard is an open question for the user.");
  const lens = /\*\*Implementability critic:\*\*[\s\S]*?(?=\n\n)/.exec(step(engineering, "Step 6: Review"))?.[0] ?? "";
  expect(lens).toContain("\n     - a spec or task that contradicts a standard;\n");

  const light = read(join(COMMANDS, "engineering-light.md"));
  expect(step(light, "Step 3: Investigate")).toContain("A request that contradicts a standard is a decision to make.");
  const grounding = /\*\*Grounding critic:\*\*.*$/m.exec(step(light, "Step 5: Review"))?.[0] ?? "";
  expect(grounding).toContain("It also reports a spec or task that contradicts a standard.");
});

test("develop and develop-workflow read the user standards, give them to the agents, enforce and report them", () => {
  const develop = read(join(COMMANDS, "develop.md"));
  const workflow = read(join(COMMANDS, "develop-workflow.md"));
  for (const text of [develop, workflow]) {
    const step1 = step(text, "Step 1:");
    expect(step1).toContain("- `<home>/standards/develop.md` - How a change is implemented and verified");
    expect(step1).toContain("- `docs/architecture/coding-standards.md`");
    expect(step1).toContain("Then run `theway standards <project> develop` and read every file it prints");
    expect(step1).toContain("these are the user standards.");
  }
  expect(section(develop, "Exit")).toContain('Also name the user standards followed, by file name, or "none".');

  expect(step(workflow, "Step 1:")).toContain("verified (given to every implementer)");
  const step3 = step(workflow, "Step 3:");
  expect(step3).toContain("Every implementer, reviewer, fix agent (Steps 4 and 5) and the fix check");
  expect(step3).toContain("gets the absolute paths of the user standards (Step 1).");
  const step4 = step(workflow, "Step 4:");
  const review = /^1\. \*\*Review\.\*\*.*$/m.exec(step4)?.[0] ?? "";
  expect(review).toContain("The reviewers also check the diff against the user standards");
  expect(review).toContain("names the standard file and the rule it breaks.");
  const check = /^4\. \*\*Fix check:\*\*.*$/m.exec(step4)?.[0] ?? "";
  expect(check).toContain("a finding whose fix breaks a user standard is `not resolved`.");
  expect(section(workflow, "Exit")).toContain('Also name the user standards given to the agents, by file name, or "none".');
});

test("the develop standard follows the user standards and the Authority rule names them as instructions", () => {
  const develop = read(join(STANDARDS, "develop.md"));
  const headings = [...develop.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  expect(headings.indexOf("User standards")).toBe(headings.indexOf("Implement") + 1);
  const user = section(develop, "User standards");
  expect(user).toContain("Follow the user standards you are given");
  expect(user).toContain("When one contradicts the spec, stop and bring it back");
  expect(user).toContain('"Stay inside this change" does not forbid reading them.');
  const authority = section(read(join(STANDARDS, "interaction.md")), "Authority");
  const first = authority.split("\n").find((l) => l.startsWith("- ")) ?? "";
  expect(first).toStartWith("- Your instructions come from the command");
  expect(first).toContain("the user standards in `<home>/standards/` and `<home>/<project>/standards/`");
  expect(first).toContain("If you are an agent spawned by a command, your prompt is the command.");
});

test("the develop standard lets the orchestrator tick tasks and scopes writes among change folders", () => {
  const develop = read(join(STANDARDS, "develop.md"));
  expect(section(develop, "Implement")).toContain("unless your prompt says the orchestrator does.");
  expect(section(develop, "Stay inside this change")).toContain("Of the change folders, write only to `<change-dir>`");
  expect(section(read(join(STANDARDS, "interaction.md")), "Reporting")).toContain("unless the command tells you to name one");
});

test("engineering, engineering-light and develop-workflow take their keys from theway config", () => {
  for (const [f, n] of [
    ["engineering.md", 6],
    ["engineering-light.md", 5],
  ] as const) {
    const step1 = step(read(join(COMMANDS, f)), "Step 1:");
    expect(step1).toStartWith("### Step 1: Load Config and Standards\n\nRun `theway config <project>`");
    expect(step1).toContain(`Take \`engineering.review_rounds\` (maximum review rounds in Step ${n})`);
    expect(step1).toContain("and `engineering.models.critic`.");
  }
  const workflow = step(read(join(COMMANDS, "develop-workflow.md")), "Step 1:");
  expect(workflow).toContain("Run `theway config <project>` and take the keys below from what it prints");
  for (const key of ["workflow.review_rounds", "workflow.ci_attempts", "workflow.open_pr", "workflow.models.implementer"]) {
    expect(workflow).toContain(`\`${key}\``);
  }
  for (const f of ["engineering.md", "engineering-light.md", "develop-workflow.md"]) {
    const text = read(join(COMMANDS, f));
    expect(calls(text)).toContain("config");
    for (const old of [
      "A key that is absent or not a non-negative integer",
      "a key that is absent or holds any other value takes",
      "A value that is not a boolean takes the default.",
    ]) {
      expect(text).not.toContain(old);
    }
  }
});

test("document reads the enabled opt-in standards from theway standards, not from theway config", () => {
  const text = read(join(COMMANDS, "document.md"));
  expect(step(text, "Step 1:").split("\n\n")[1]).toStartWith("Run `theway standards <project> document`");
  expect(calls(text)).not.toContain("config");
  expect(text).not.toContain("Then read these opt-in standards:");
  for (const path of OPT_IN_PATHS) expect(text).not.toContain(path);
  expect(text).not.toContain(OPT_IN);
});

test("no command names <home>/config.yaml outside its Locate the home section", () => {
  const offending = commands.filter((f) => {
    const text = read(join(COMMANDS, f));
    return text.replace(locateStep(text) ?? "", "").includes("<home>/config.yaml");
  });
  expect(offending).toEqual([]);
});

test("the shipped config.yaml says a project can override any key", () => {
  expect(read(join(PLUGIN, "home", "config.yaml"))).toStartWith(
    "# theway configuration\n# A project can override any key in <home>/<project>/config.yaml; theway config <project> prints the result.\n",
  );
  expect(read(join(PLUGIN, "home", "config.yaml"))).toContain(
    "\n# Standards: standards.<key>.enabled switches any standard, key = file stem with - as _ (shipped opt-in ones default false, your own standards true)\nstandards:\n",
  );
});
