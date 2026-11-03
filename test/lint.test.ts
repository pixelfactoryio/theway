import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { buildProgram } from "../src/program";

const REPO = join(import.meta.dirname, "..");
const PLUGIN = join(REPO, "plugin");
const COMMANDS = join(PLUGIN, "commands");
const PIPELINE = join(PLUGIN, "workflows", "run-pipeline.js");
const LENSES = join(PLUGIN, "home", "lenses");
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
  expect(called).toContain("project");
  expect(called.size).toBeGreaterThan(0);
  const subcommands = buildProgram().commands.map((c) => c.name());
  expect([...called].filter((sub) => !subcommands.includes(sub))).toEqual([]);
});

test("every command that calls the CLI has allowed-tools: Bash(theway:*)", () => {
  const calling = commands.filter((f) => calls(read(join(COMMANDS, f))).length > 0);
  expect(calling.length).toBeGreaterThan(0);
  const missing = calling.filter((f) => !/^---\n[\s\S]*?^allowed-tools: Bash\(theway:\*\)$[\s\S]*?^---$/m.test(read(join(COMMANDS, f))));
  expect(missing).toEqual([]);
});

test("every command that reads theway data has the same Locate the home step", () => {
  const readers = ["archive.md", "document.md", "engineering.md", "list.md", "workflow.md"];
  const reference = locateStep(read(join(COMMANDS, "engineering.md")));
  for (const marker of [
    "Run `theway path`",
    "error: unknown command",
    "`theway: warning:`",
    "`<home>/standards/` or `<home>/templates/`",
  ]) {
    expect(reference).toContain(marker);
  }
  // The CLI, not the model, derives the project key.
  expect(reference).toContain("`theway project`");
  expect(reference).toContain("never compute the key yourself");
  expect(readers.filter((f) => locateStep(read(join(COMMANDS, f))) !== reference)).toEqual([]);
});

test("the engineering commands get the change folder from theway path, workflow from theway context", () => {
  const missing = [
    ...["engineering.md"].filter((f) => !read(join(COMMANDS, f)).includes("`theway path <change-id>`")),
    ...["workflow.md"].filter((f) => !read(join(COMMANDS, f)).includes("`theway context develop <change-id>`")),
  ];
  expect(missing).toEqual([]);
});

test("the four loading commands call theway context, not theway config or theway standards", () => {
  for (const f of ["engineering.md", "workflow.md", "document.md"]) {
    const text = read(join(COMMANDS, f));
    expect(calls(text)).toContain("context");
    expect(calls(text)).not.toContain("config");
    expect(calls(text)).not.toContain("standards");
  }
});

test("engineering.md takes a series' member IDs from theway next-id", () => {
  const text = read(join(COMMANDS, "engineering.md"));
  expect(text).toContain("`theway next-id <series-id> --count <N>`");
  expect(text).toContain("`would go past -99`");
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
  expect(engineering).toContain("engineering.review.rounds");
  expect(engineering).toContain("engineering.review.model");
  const config = Bun.YAML.parse(read(join(PLUGIN, "home", "config.yaml"))) as {
    engineering?: { review?: { rounds?: unknown; model?: unknown } };
  };
  expect(config.engineering?.review?.rounds).toBe(1);
  expect(config.engineering?.review?.model).toBe("opus");
});

test("the shipped defaults are neutral and the four architecture standards are opt-in", () => {
  const HOME = join(PLUGIN, "home");
  const TEMPLATES = join(HOME, "templates");
  const techStack = read(join(TEMPLATES, "tech-stack-template.md"));
  const infra = ["Cloud Infrastructure", "Infrastructure & Deployment", "Database & Storage", "Monitoring & Observability", "Security Tools"];
  // /theway:document skips infrastructure the repository has none of.
  for (const heading of infra) {
    expect(techStack).toMatch(new RegExp(`^## ${heading}\\n\\[Omit this section if the repository has none\\.\\]$`, "m"));
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
    .filter((f) => !/^(config\.yaml|standards\/[^/]+\.md|templates\/[^/]+\.md|workflows\/[^/]+\.yaml|lenses\/[^/]+\.md)$/.test(f));
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
  expect(read(join(COMMANDS, "workflow.md"))).toContain("`## Authority` section of `<home>/standards/interaction.md`");
  expect(read(join(PLUGIN, "home", "standards", "spec-review.md"))).toContain("`## Authority` section of `<home>/standards/interaction.md`");
  for (const text of [read(join(COMMANDS, "workflow.md")), read(join(PLUGIN, "home", "standards", "spec-review.md"))]) {
    expect(text).toContain("`theway authority`");
  }
  for (const f of ["engineering.md"]) {
    expect(read(join(COMMANDS, f))).toContain("`<home>/standards/spec-review.md`");
  }
  for (const f of ["archive.md", "workflow.md", "document.md", "engineering.md"]) {
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
  const criteria = implementation.split("**Success Criteria:**\n")[1] ?? "";
  // A fix- change proves its regression test and its reproduction.
  expect(criteria).toContain("fails on the base commit");
  expect(criteria).toContain("no longer reproduces");
});

test("engineering.md handles a fix- change: the verb list, the investigation standard, the fix template and the stop outcomes", () => {
  const engineering = read(join(COMMANDS, "engineering.md"));
  expect(engineering).toContain("`add-*`, `update-*`, `refactor-*`, `remove-*`, `fix-*`");
  const step3 = step(engineering, "Step 3: Investigate");
  expect(step3).toContain("`<home>/standards/spec-investigation.md`");
  const investigation = read(join(STANDARDS, "spec-investigation.md"));
  // A reproduction runs in a throwaway directory.
  expect(section(investigation, "A `fix-` change")).toContain("`mktemp -d`");
  for (const marker of [
    "- **Not reproduced:**",
    "- **Possibly already covered:**",
    "`theway list`",
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
  const develop = read(join(STANDARDS, "develop.md"));
  const verify = section(develop, "Verify");
  const fix = verify.split("\n### A `fix-` change\n")[1] ?? "";
  // The base commit of an uncommitted change.
  expect(fix).toContain("`HEAD` when the change is uncommitted");
  // The base commit of a committed change.
  expect(fix).toContain("`git merge-base <base> HEAD`");
  // The base-commit worktree is throwaway.
  expect(fix).toContain("`mktemp -d`");
  for (const marker of [
    "### A `fix-` change",
    "`git worktree add --detach <dir> <base-commit>`",
    "`git worktree remove --force <dir>`",
    "**the regression check**",
    "`**Mode:** light`",
    "**Re-running the regression check**",
  ]) {
    expect(verify).toContain(marker);
  }
});

test("commits.md sets the commit type from the change verb and the lenses review a fix's root cause", () => {
  expect(read(PIPELINE)).toContain("args.base");
  const commits = read(join(STANDARDS, "commits.md"));
  // The shipped commit and branch convention.
  for (const marker of ["`add-` → `feat`", "type(scope): description", "BREAKING CHANGE:", "branch is named `<change-id>`"]) {
    expect(commits).toContain(marker);
  }
  expect(step(read(join(COMMANDS, "workflow.md")), "Step 3:")).toContain("`<base>` (Step 2)");
  // A light spec's Change section replaces Scope.
  expect(read(join(LENSES, "conformance.md"))).toContain("the Change section");
  // The review of a fix- change.
  const correctness = read(join(LENSES, "correctness.md"));
  expect(correctness).toContain("the root cause the spec names");
  expect(correctness).toContain("the regression test would fail without the fix");
});

test("the light spec template has the spec template's frontmatter keys, the Mode line, its fixed headings and the two fix- criteria", () => {
  const light = read(join(TEMPLATES, "light-spec-template.md"));
  const spec = read(join(TEMPLATES, "spec-template.md"));
  expect(Object.keys(frontmatter(light))).toEqual(Object.keys(frontmatter(spec)));
  expect(frontmatter(light).template_type).toBe("light");
  // A light spec has no Scope, TAMM or phase section.
  const standards = (frontmatter(light).quality_standards as string[]).join("\n");
  for (const word of ["Scope", "TAMM", "phase"]) expect(standards).not.toContain(word);
  expect(light).toContain("\n# Spec Analysis: [Change Name]\n**Mode:** light\n");
  expect([...light.matchAll(/^## (.+)$/gm)].map((m) => m[1])).toEqual(["Problem", "Evidence", "Change", "Success Criteria"]);
  const evidence = section(light, "Evidence");
  for (const field of ["**Command:**", "**Observed output:**", "**Expected result:**"]) expect(evidence).toContain(field);
  expect(section(light, "Change").trimEnd().endsWith("Nothing else changes.")).toBe(true);
  // A light fix- change proves its regression test and its reproduction.
  const criteria = section(light, "Success Criteria");
  expect(criteria).toContain("fails before the fix and passes with it");
  expect(criteria).toContain("no longer reproduces");
});

test("engineering.md takes --light and states the light path in each step it changes", () => {
  const text = read(join(COMMANDS, "engineering.md"));
  const invocation = section(text, "Invocation");
  expect(invocation).toContain("/theway:engineering [--light] <request>");
  // --light refuses a series.
  expect(invocation).toContain("a series is not a light change");
  const light = "**With `--light`:**";
  for (const prefix of ["Step 2:", "Step 3:", "Step 4:", "Step 5:", "Step 6:"]) expect(step(text, prefix)).toContain(light);
  expect(section(text, "Exit")).toContain(light);
  expect(text).toContain("`<home>/templates/light-spec-template.md` | `spec.md`");
  // A light change is never a series member.
  expect(step(text, "Step 2:")).toContain("never with `--series`");
  // A light change writes no design.
  expect(step(text, "Step 5:")).toContain("a light change has no `design.md`");
  // The light review.
  expect(step(text, "Step 6:")).toContain("with the grounding lens only");
  // The escalation command.
  expect(section(text, "Exit")).toContain("`/theway:engineering <change-id>: <original request>`");
  expect(section(text, "Exit")).toContain("`/theway:engineering --light`");
  // The light review's report.
  expect(section(text, "Exit")).toContain("`Fix` column reads `escalated`");
});

test("run-pipeline.js checks a fix- test by the regression check and triages by spec-review.md", () => {
  const pipeline = read(PIPELINE);
  expect(pipeline).toContain("the regression check of develop.md");
  expect(pipeline).toContain("args.specReview");
  const workflow = read(join(COMMANDS, "workflow.md"));
  expect(step(workflow, "Step 1:")).toContain("- `<home>/standards/spec-review.md`");
});

test("engineering reads the standards from theway context and reports them", () => {
  for (const f of ["engineering.md"]) {
    const text = read(join(COMMANDS, f));
    const step1 = step(text, "Step 1:");
    expect(step1).toContain("- `<home>/standards/tamm-framework.md`");
    expect(step1).toContain("Run `theway context engineering`.");
    // Every report names the standards or "none".
    expect(section(text, "Exit")).toContain('or "none"');
  }
  const review = read(join(STANDARDS, "spec-review.md"));
  const prompt = section(review, "Critic prompt");
  expect(prompt).toContain("`## Authority`");
});

test("workflow reads the standards from theway context and reports them", () => {
  const workflow = read(join(COMMANDS, "workflow.md"));
  const step1 = step(workflow, "Step 1:");
  expect(step1).toContain("- `<home>/standards/develop.md`");
  expect(step1).toContain("- `docs/architecture/coding-standards.md`");
  // Every report names the standards or "none".
  expect(section(workflow, "Exit")).toContain('or "none"');
});

test("the develop standard has a Standards section and the Authority rule names the standards folders", () => {
  const develop = read(join(STANDARDS, "develop.md"));
  const headings = [...develop.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  expect(headings.indexOf("Standards")).toBe(headings.indexOf("Implement") + 1);
  // The authority covers both standards folders.
  const authority = section(read(join(STANDARDS, "interaction.md")), "Authority");
  const first = authority.split("\n").find((l) => l.startsWith("- ")) ?? "";
  for (const folder of ["`<home>/standards/`", "`<home>/projects/<key>/standards/`"]) expect(first).toContain(folder);
});

test("engineering takes its keys from the config of theway context, workflow from theway workflow", () => {
  for (const [f, n] of [["engineering.md", 6]] as const) {
    const step1 = step(read(join(COMMANDS, f)), "Step 1:");
    expect(step1).toStartWith("### Step 1: Load Config and Standards\n\n");
    expect(step1.split("\n\n")[1]).toStartWith("Run `theway context engineering`");
    expect(step1).toContain("`engineering.review.rounds`");
    expect(step1).toContain(`Step ${n}`);
    expect(step1).toContain("and `engineering.review.model`.");
  }
  const workflow = read(join(COMMANDS, "workflow.md"));
  expect(step(workflow, "Step 1:")).toContain("`theway workflow`");
});

test("document reads the standards from theway context", () => {
  const text = read(join(COMMANDS, "document.md"));
  const first = step(text, "Step 1:").split("\n\n")[1];
  expect(first).toStartWith("Run `theway context document`");
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
  // The findings table columns.
  for (const column of ["`#`", "`Finding`", "`Verdict`", "`Fix`"]) expect(report).toContain(column);
  // Finding numbering.
  expect(report).toContain("`R<round>-<index>`");
  const investigation = read(join(STANDARDS, "spec-investigation.md"));
  expect([...investigation.matchAll(/^## (.+)$/gm)].map((m) => m[1])).toEqual(["Investigate", "A `fix-` change", "The stop report"]);
  for (const f of ["engineering.md"]) {
    const text = read(join(COMMANDS, f));
    expect(text).toContain("`<home>/standards/spec-investigation.md`");
    // The stop outcomes live only in spec-investigation.md.
    expect(text).not.toContain("**Not reproduced:**");
  }
});


test("run-pipeline.js is a plugin workflow that compiles, with its fixed rules and outcomes", async () => {
  const text = read(PIPELINE);
  expect(readdirSync(join(PLUGIN, "workflows"))).toEqual(["run-pipeline.js"]);
  expect(text).toStartWith("export const meta = {");
  expect(text).toContain("name: 'run-pipeline'");
  for (const title of ["Implement", "Review", "Agent", "PR"]) {
    expect(text).toContain(`phase('${title}')`);
    expect(text).toContain(`phase: '${title}'`);
  }
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  const body = text.slice("export ".length);
  const run = new AsyncFunction("args", "agent", "parallel", "pipeline", "phase", "log", body);
  expect(await run(undefined, null, null, null, () => {}, () => {})).toEqual({
    status: "failed",
    error: "run-pipeline is started by /theway:workflow with its args",
    implementation: null,
    steps: [],
    pr: null,
    authorityReports: [],
  });
  for (const marker of [
    "args.authority",
    "args.commits",
    "args.gitHost",
    "args.standards",
    "status: 'blocked'",
    "status: 'failed'",
    "status: 'succeeded'",
  ]) {
    expect(text).toContain(marker);
  }
  // The agents' git boundary.
  for (const rule of ["never force-push", "never push the default branch", "never merge"]) expect(text).toContain(rule);
  // The fix check's scope.
  expect(text).toContain("does not look for new problems");
});

test("run-pipeline.js runs only a segment of consecutive agent steps, with head set after inline steps", async () => {
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  const run = new AsyncFunction("args", "agent", "parallel", "pipeline", "phase", "log", read(PIPELINE).slice("export ".length));
  const steps = [
    { step: "implement", agents: false },
    { step: "agent", agents: true, name: "notes", prompt: "Write the notes.", model: "sonnet" },
    { step: "review", agents: false, rounds: 1, lenses: [] },
    { step: "pr", agents: true, ci_attempts: 2, model: "sonnet", fix_model: "opus" },
  ];
  const base = {
    repo: "/r",
    branch: "feat/x",
    base: "main",
    changeId: "add-x",
    changeDir: "/c",
    light: false,
    develop: "/h/standards/develop.md",
    specReview: "/h/standards/spec-review.md",
    commits: "/h/standards/commits.md",
    gitHost: "/h/standards/git-host.md",
    standards: [],
    authority: "## Authority",
    workflow: { name: "w", file: "/h/workflows/w.yaml", steps },
  };
  const none = async () => null;
  const exec = (args: Record<string, unknown>) => run(args, none, none, none, () => {}, () => {});
  const error = "run-pipeline is started by /theway:workflow with its args";
  const agentsAt0 = steps.map((s, i) => (i === 0 ? { ...s, agents: true, model: "opus" } : s));
  const { commits: _, ...noCommits } = base;
  const { gitHost: __, ...noGitHost } = base;
  const cases: Record<string, unknown>[] = [
    { ...base, steps: [], head: "abc" },
    { ...base, steps: [1, 3], head: "abc" },
    { ...base, steps: [1, 2], head: "abc" },
    { ...base, steps: [2], head: "abc" },
    { ...base, steps: [1], head: null },
    { ...base, steps: [1], head: "" },
    { ...base, steps: [1] },
    { ...base, workflow: { ...base.workflow, steps: agentsAt0 }, steps: [0], head: "abc" },
    { ...base, workflow: { ...base.workflow, steps: agentsAt0 }, steps: [0, 1] },
    { ...noCommits, steps: [1], head: "abc" },
    { ...noGitHost, steps: [1], head: "abc" },
    { ...base, gitHost: null, steps: [1], head: "abc" },
  ];
  for (const args of cases) {
    const res = await exec(args);
    expect([args, res.status, res.error]).toEqual([args, "failed", error]);
  }
  const segment = await exec({ ...base, steps: [1], head: "abc" });
  expect(segment).toEqual({
    status: "failed",
    error: "agent:notes returned no result",
    implementation: null,
    steps: [{ step: "agent", label: "agent:notes", result: null }],
    pr: null,
    authorityReports: [],
  });
  const first = await exec({ ...base, workflow: { ...base.workflow, steps: agentsAt0 }, steps: [0, 1], head: null });
  expect(first).toEqual({
    status: "blocked",
    error: "implement returned no result",
    implementation: null,
    steps: [],
    pr: null,
    authorityReports: [],
  });
});

test("workflow.md runs the change through theway:run-pipeline", () => {
  const text = read(join(COMMANDS, "workflow.md"));
  for (const marker of [
    "`theway workflow`",
    'name: "theway:run-pipeline"',
    "${CLAUDE_PLUGIN_ROOT}/workflows/run-pipeline.js",
    "--workflow <name>",
    "`git-host.md`",
  ]) {
    expect(text).toContain(marker);
  }
  // The merge rule.
  expect(text).toContain("never bypass required reviews or checks");
});

test("run-pipeline.js follows the git host steps git-host.md holds", () => {
  const headings = [...read(join(STANDARDS, "git-host.md")).matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  expect(headings).toEqual([
    "Default branch",
    "Sync the default branch",
    "Push the feature branch",
    "Open the PR",
    "Wait for the checks",
    "Read a failed check's log",
    "Re-run failed jobs",
    "Diffstat",
    "Merge",
  ]);
  const pipeline = read(PIPELINE);
  for (const h of headings.slice(2, 7)) expect(pipeline).toContain(h as string);
});

test("workflow.md runs inline steps itself and agent segments through run-pipeline", () => {
  const text = read(join(COMMANDS, "workflow.md"));
  for (const marker of [
    "agents: false",
    '"review ran inline"',
    "`steps` and `head`",
  ]) {
    expect(text).toContain(marker);
  }
  // The inline default refuses a series.
  expect(text).toContain("a series needs a workflow that commits");
});
