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

test("every theway subcommand the commands and standards call is dispatched by the CLI", () => {
  const standards = join(PLUGIN, "home", "standards");
  const texts = [
    ...commands.map((f) => read(join(COMMANDS, f))),
    ...readdirSync(standards)
      .filter((f) => f.endsWith(".md"))
      .map((f) => read(join(standards, f))),
  ];
  const called = new Set(texts.flatMap(calls));
  expect(called).toContain("authority");
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
    "`<home>/standards/` or `<home>/templates/`",
  ]) {
    expect(reference).toContain(marker);
  }
  expect(reference).not.toContain("<home>/config.yaml");
  expect(readers.filter((f) => locateStep(read(join(COMMANDS, f))) !== reference)).toEqual([]);
});

test("the engineering commands get the change folder from theway path, the develop ones from theway context", () => {
  const missing = [
    ...["engineering.md", "engineering-light.md"].filter((f) => !read(join(COMMANDS, f)).includes("`theway path <project> <change-id>`")),
    ...["develop.md", "develop-workflow.md"].filter((f) => !read(join(COMMANDS, f)).includes("`theway context <project> develop <change-id>`")),
  ];
  expect(missing).toEqual([]);
});

test("the five loading commands call theway context, not theway config or theway standards", () => {
  for (const f of ["engineering.md", "engineering-light.md", "develop.md", "develop-workflow.md", "document.md"]) {
    const text = read(join(COMMANDS, f));
    expect(calls(text)).toContain("context");
    expect(text).not.toContain("theway config <project>");
    expect(text).not.toContain("theway standards <project>");
  }
});

test("engineering.md takes a series' member IDs from theway next-id", () => {
  const text = read(join(COMMANDS, "engineering.md"));
  expect(text).toContain("`theway next-id <project> <series-id> --count <N>`");
  expect(text).toContain("`would go past -99`");
  expect(text).not.toContain("changes/archive/*-");
  expect(text).not.toContain("--series");
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
  expect(read(join(COMMANDS, "develop-workflow.md"))).toContain("`## Authority` section of `<home>/standards/interaction.md`");
  expect(read(join(PLUGIN, "home", "standards", "spec-review.md"))).toContain("`## Authority` section of `<home>/standards/interaction.md`");
  for (const text of [read(join(COMMANDS, "develop-workflow.md")), read(join(PLUGIN, "home", "standards", "spec-review.md"))]) {
    expect(text).toContain("`theway authority`");
  }
  for (const f of [...files(join(PLUGIN, "commands")), ...files(join(PLUGIN, "home", "standards"))]) {
    expect(read(f)).not.toContain("interaction.default.md");
  }
  for (const f of ["engineering-light.md", "engineering.md"]) {
    expect(read(join(COMMANDS, f))).toContain("`<home>/standards/spec-review.md`");
  }
  for (const f of ["archive.md", "develop.md", "develop-workflow.md", "document.md", "engineering-light.md", "engineering.md"]) {
    expect(read(join(COMMANDS, f))).toContain("`<home>/standards/interaction.md`");
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
  expect(section(fix, "Reproduction")).toContain("**Observed output:**");
  expect(section(fix, "Reproduction")).toContain("**Expected result:**");
  const regression = section(fix, "Regression Test");
  for (const field of ["**File:**", "**Test name:**", "**Command:**", "**Failure on the base commit:**"]) {
    expect(regression).toContain(field);
  }
  expect(section(fix, "Hardpoints (TAMM Analysis)")).toContain('"None at Medium or High."');
  const implementation = section(fix, "Implementation");
  const criteria = implementation.split("**Success Criteria:**\n")[1]?.split("\n").filter((l) => l.startsWith("- [ ] "));
  expect(criteria?.slice(0, 2)).toEqual([
    "- [ ] The regression test `[test name]` fails on the base commit for the reason in Root Cause, and passes with the fix",
    "- [ ] The reproduction no longer reproduces: `[reproduction command]` now shows [expected result]",
  ]);
});

test("engineering.md handles a fix- change: the verb list, the investigation standard, the fix template and the stop outcomes", () => {
  const engineering = read(join(COMMANDS, "engineering.md"));
  expect(engineering).toContain("`add-*`, `update-*`, `refactor-*`, `remove-*`, `fix-*`");
  expect(engineering).toContain("`fix-login-crash`");
  const step3 = step(engineering, "Step 3: Investigate");
  expect(step3).toContain("`<home>/standards/spec-investigation.md`");
  const investigation = read(join(STANDARDS, "spec-investigation.md"));
  for (const marker of [
    "`mktemp -d`",
    "- **Not reproduced:**",
    "- **Possibly already covered:**",
    "`theway list <project>`",
    "- **Works as intended:**",
  ]) {
    expect(section(investigation, "A `fix-` change")).toContain(marker);
  }
  const step4 = step(engineering, "Step 4:");
  expect(step4).toContain("`<home>/templates/fix-spec-template.md` for a `fix-` ID");
  const exit = section(engineering, "Exit");
  expect(exit).toContain("`<home>/standards/spec-investigation.md`");
  expect(exit).toContain("`/theway:engineering`");
});

test("develop.md Verify proves a fix- regression test fails on the base commit and re-runs the reproduction", () => {
  const verify = section(read(join(STANDARDS, "develop.md")), "Verify");
  for (const marker of [
    "### A `fix-` change",
    "`HEAD` for `/theway:develop`",
    "`git merge-base <base> HEAD` for `/theway:develop-workflow`",
    "`git worktree add --detach <dir> <base-commit>`",
    "`<dir>` comes from `mktemp -d`",
    "`git worktree remove --force <dir>`",
    "**the regression check**",
    "`**Mode:** light`",
    "**Re-running the regression check**",
  ]) {
    expect(verify).toContain(marker);
  }
});

test("develop-workflow.md takes the commit type from the change verb and reviews a fix's root cause", () => {
  const workflow = read(join(COMMANDS, "develop-workflow.md"));
  const step3 = step(workflow, "Step 3:");
  for (const marker of [
    "- `add-` → `feat`, `fix-` → `fix`, `refactor-` → `refactor`.",
    "`BREAKING CHANGE:`",
    "`<base>` (Step 2)",
    "`workflow.models.reviewer`",
    "`workflow.models.fix`",
    "`workflow.models.ci`",
  ]) {
    expect(step3).toContain(marker);
  }
  const step5 = step(workflow, "Step 5:");
  expect(step5).toContain("`type(scope): description`");
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
  for (const field of ["**Command:**", "**Observed output:**", "**Expected result:**"]) expect(evidence).toContain(field);
  expect(section(light, "Change").trimEnd().endsWith("Nothing else changes.")).toBe(true);
  const criteria = section(light, "Success Criteria").split("\n").filter((l) => l.startsWith("- [ ] "));
  expect(criteria.slice(0, 2)).toEqual([
    "- [ ] The regression test `[test name]` fails before the fix and passes with it",
    "- [ ] The reproduction no longer reproduces: `[reproduction command]` now shows [expected result]",
  ]);
});

test("engineering-light.md validates a standalone ID and writes the light spec", () => {
  const light = read(join(COMMANDS, "engineering-light.md"));
  for (const marker of [
    "`theway validate-id <change-id>`",
    "`/theway:engineering <change-id>: <original request>`",
  ]) {
    expect(light).toContain(marker);
  }
  expect(light).not.toContain("validate-id <change-id> --series");
  expect(light).not.toContain("min(");
  expect(light).not.toContain("Implementability critic");
  expect(light).toContain("`<home>/templates/light-spec-template.md` | `spec.md`");
  expect(light).toContain("`<home>/templates/tasks-template.md` | `tasks.md`");
  expect(step(light, "Step 3: Investigate")).toContain("`<home>/standards/spec-investigation.md`");
  expect(section(light, "Exit")).toContain("`/theway:engineering-light`");
  expect(light).toContain("engineering.models.critic");
});

test("develop-workflow.md runs a light change's review up to review_rounds and checks a fix- test by the regression check", () => {
  const workflow = read(join(COMMANDS, "develop-workflow.md"));
  const step4 = step(workflow, "Step 4:");
  expect(workflow).not.toContain("min(");
  for (const prefix of ["3. **Fix once.**", "4. **Fix check:**"]) {
    const item = new RegExp(`^${escapeRegExp(prefix)}.*$`, "m").exec(step4)?.[0] ?? "";
    expect(item).toContain("the regression check");
    expect(item).not.toContain("**Mode:** light");
    expect(item).not.toContain("light `fix-`");
  }
  expect(step(workflow, "Step 3:")).not.toContain("light `fix-`");
  expect(step(workflow, "Step 1:")).toContain("- `<home>/standards/spec-review.md`");
  expect(step4).toContain("`spec-review.md`");
});

const OPT_IN_PATHS = ["core-principles.md", "sre.md", "web-development.md", "quality.md"].map((n) => `<home>/standards/${n}`);

test("engineering and engineering-light read the standards from theway context and report them", () => {
  for (const f of ["engineering.md", "engineering-light.md"]) {
    const text = read(join(COMMANDS, f));
    const step1 = step(text, "Step 1:");
    expect(step1).toContain("- `<home>/standards/tamm-framework.md` - TAMM framework");
    expect(step1).toContain("Run `theway context <project> engineering`.");
    for (const path of OPT_IN_PATHS) expect(text).not.toContain(path);
    expect(text).not.toContain("user standard");
    expect(section(text, "Exit")).toContain('or "none"');
  }
  const review = read(join(STANDARDS, "spec-review.md"));
  const prompt = section(review, "Critic prompt");
  expect(prompt).toContain("`## Authority`");
});

test("develop and develop-workflow read the standards from theway context and report them", () => {
  const develop = read(join(COMMANDS, "develop.md"));
  const workflow = read(join(COMMANDS, "develop-workflow.md"));
  for (const text of [develop, workflow]) {
    const step1 = step(text, "Step 1:");
    expect(step1).toContain("- `<home>/standards/develop.md` - How a change is implemented and verified");
    expect(step1).toContain("- `docs/architecture/coding-standards.md`");
    expect(step1).toContain("Run `theway context <project> develop <change-id>`");
  }
  expect(section(develop, "Exit")).toContain('or "none"');

  expect(section(workflow, "Exit")).toContain('or "none"');
  for (const text of [develop, workflow]) expect(text).not.toContain("user standard");
});

test("the develop standard has a Standards section and the Authority rule names the standards folders", () => {
  const develop = read(join(STANDARDS, "develop.md"));
  const headings = [...develop.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  expect(headings.indexOf("Standards")).toBe(headings.indexOf("Implement") + 1);
  expect(develop).not.toContain("user standard");
  const authority = section(read(join(STANDARDS, "interaction.md")), "Authority");
  const first = authority.split("\n").find((l) => l.startsWith("- ")) ?? "";
  for (const folder of ["`<home>/standards/`", "`<home>/<project>/standards/`"]) expect(first).toContain(folder);
});

test("engineering, engineering-light and develop-workflow take their keys from the config of theway context", () => {
  for (const [f, n] of [
    ["engineering.md", 6],
    ["engineering-light.md", 5],
  ] as const) {
    const step1 = step(read(join(COMMANDS, f)), "Step 1:");
    expect(step1).toStartWith("### Step 1: Load Config and Standards\n\n");
    expect(step1.split("\n\n")[1]).toStartWith("Run `theway context <project> engineering`");
    expect(step1).toContain(`take \`engineering.review_rounds\` (maximum review rounds in Step ${n})`);
    expect(step1).toContain("and `engineering.models.critic`.");
  }
  const workflow = step(read(join(COMMANDS, "develop-workflow.md")), "Step 1:");
  for (const key of ["workflow.review_rounds", "workflow.ci_attempts", "workflow.open_pr", "workflow.models.implementer"]) {
    expect(workflow).toContain(`\`${key}\``);
  }
  for (const f of ["engineering.md", "engineering-light.md", "develop-workflow.md"]) {
    const text = read(join(COMMANDS, f));
    expect(calls(text)).toContain("context");
  }
});

test("document reads the standards from theway context", () => {
  const text = read(join(COMMANDS, "document.md"));
  const first = step(text, "Step 1:").split("\n\n")[1];
  expect(first).toStartWith("Run `theway context <project> document`");
  expect(calls(text)).not.toContain("config");
  for (const path of OPT_IN_PATHS) expect(text).not.toContain(path);
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

test("spec-review.md and spec-investigation.md hold the shared procedures the engineering commands follow", () => {
  const review = read(join(STANDARDS, "spec-review.md"));
  expect([...review.matchAll(/^## (.+)$/gm)].map((m) => m[1])).toEqual(["Lenses", "Critic prompt", "Findings", "Triage", "Report"]);
  expect(section(review, "Lenses")).toContain("- **Grounding:**");
  expect(section(review, "Lenses")).toContain("- **Implementability:**");
  expect(section(review, "Findings")).toContain("`fixable`");
  const triage = section(review, "Triage");
  for (const verdict of ["confirmed", "false_positive", "duplicate", "nit", "out_of_scope"]) {
    expect(triage).toContain(`   - \`${verdict}\` (`);
  }
  expect(triage).toContain("`confirmed, settled`");
  const report = section(review, "Report");
  expect(report).toContain("the columns `#`, `Finding`, `Verdict` and `Fix`");
  expect(report).toContain("as `R<round>-<index>`");
  const investigation = read(join(STANDARDS, "spec-investigation.md"));
  expect([...investigation.matchAll(/^## (.+)$/gm)].map((m) => m[1])).toEqual(["Investigate", "A `fix-` change", "The stop report"]);
  for (const outcome of ["Not reproduced", "Possibly already covered", "Works as intended"]) {
    expect(section(investigation, "A `fix-` change")).toContain(`- **${outcome}:**`);
  }
  for (const f of ["engineering.md", "engineering-light.md"]) {
    const text = read(join(COMMANDS, f));
    expect(text).toContain("`<home>/standards/spec-review.md`");
    expect(text).toContain("`<home>/standards/spec-investigation.md`");
    expect(text).not.toContain("**Not reproduced:**");
  }
});
