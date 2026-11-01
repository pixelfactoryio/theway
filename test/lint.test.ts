import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
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
  const readers = ["archive.md", "develop-workflow.md", "develop.md", "document.md", "engineering-light.md", "engineering.md", "list.md"];
  const reference = locateStep(read(join(COMMANDS, "engineering.md")));
  expect(reference).toContain("Run `theway path`");
  expect(reference).toContain("Do not check for files under `<home>` before reading them");
  expect(reference).not.toContain("`<home>/config.yaml` doesn't exist");
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
  const files = ["README.md", "plugin/commands/setup.md"];
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
  const config = Bun.YAML.parse(read(join(PLUGIN, "templates", "theway", "config.yaml"))) as {
    engineering?: { review_rounds?: unknown; models?: { critic?: unknown } };
  };
  expect(config.engineering?.review_rounds).toBe(1);
  expect(config.engineering?.models?.critic).toBe("opus");
});

test("the shipped defaults are neutral and the four architecture standards are opt-in", () => {
  const THEWAY = join(PLUGIN, "templates", "theway");
  const TEMPLATES = join(THEWAY, "templates");
  const all = files(PLUGIN);
  expect(all.filter((f) => read(f).includes("SRE-EE"))).toEqual([join(THEWAY, "data", "standards", "sre.md")]);
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
  const config = Bun.YAML.parse(read(join(THEWAY, "config.yaml"))) as {
    standards?: Record<string, { enabled?: unknown } | undefined>;
  };
  for (const key of ["core_principles", "sre", "web_development", "quality"]) {
    expect(config.standards?.[key]?.enabled).toBe(false);
  }
  expect(config.standards?.architecture).toBeUndefined();
});

test("the shipped config has no dead sections", () => {
  const config = Bun.YAML.parse(read(join(PLUGIN, "templates", "theway", "config.yaml"))) as Record<string, unknown>;
  expect(Object.keys(config).sort()).toEqual(["engineering", "standards", "workflow"]);
  const standards = config.standards as Record<string, Record<string, unknown>>;
  expect(Object.keys(standards).sort()).toEqual(["core_principles", "quality", "sre", "web_development"]);
  for (const entry of Object.values(standards)) {
    expect(Object.keys(entry)).toEqual(["enabled"]);
  }
});

test("plugin/templates/theway holds only what install reads", () => {
  const THEWAY = join(PLUGIN, "templates", "theway");
  const unused = files(THEWAY)
    .map((f) => relative(THEWAY, f))
    .filter((f) => !/^(config\.yaml|data\/standards\/[^/]+\.md|templates\/[^/]+\.md)$/.test(f));
  expect(unused).toEqual([]);
});

test("every spawned agent gets the Authority rule", () => {
  expect(read(join(PLUGIN, "templates", "theway", "data", "standards", "interaction.md"))).toContain("\n## Authority\n");
  for (const f of ["develop-workflow.md", "engineering-light.md", "engineering.md"]) {
    expect(read(join(COMMANDS, f))).toContain("`## Authority` section of `<home>/data/standards/interaction.md`");
  }
  for (const f of ["archive.md", "develop.md", "develop-workflow.md", "document.md", "engineering-light.md", "engineering.md"]) {
    expect(read(join(COMMANDS, f))).toContain("(exploration, reporting and authority)");
  }
});

const TEMPLATES = join(PLUGIN, "templates", "theway", "templates");
const STANDARDS = join(PLUGIN, "templates", "theway", "data", "standards");

/** The YAML frontmatter of a template. */
const frontmatter = (text: string) => Bun.YAML.parse(/^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? "") as Record<string, unknown>;

/** The `## ` section of a text with the given heading, up to the next `## ` heading. */
const section = (text: string, heading: string) =>
  new RegExp(`^## ${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\n[\\s\\S]*?(?=^## |(?![\\s\\S]))`, "m").exec(text)?.[0] ?? "";

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
  expect(engineering).toContain("Use naming convention: `add-*`, `update-*`, `refactor-*`, `remove-*`, `fix-*`");
  expect(engineering).toContain("`fix-login-crash`");
  expect(engineering).toContain("(same `add-`/`update-`/`refactor-`/`remove-`/`fix-` rule)");
  const step3 = /^### Step 3: Investigate\n[\s\S]*?(?=^### )/m.exec(engineering)?.[0] ?? "";
  expect(step3).toContain("**For a `fix-` change, reproduce the bug first**");
  expect(step3).toContain("`mktemp -d`");
  expect(step3).toContain("run the project's existing commands and tests without changing the repository");
  expect(step3).toContain("Reasoning about the code is not a reproduction.");
  expect(step3).toContain("before any change file is written");
  expect(step3).toContain("- **Not reproduced:**");
  expect(step3).toContain("listing each attempt (its command and output) and what would help");
  expect(step3).toContain("- **Possibly already covered:** an active change ID listed by `theway list <project>`");
  expect(step3).toContain("Judge from the IDs only: never open other change folders.");
  expect(step3).toContain("The members of the series this run continues (Step 2) do not count");
  expect(step3).toContain("- **Works as intended:**");
  const step4 = /^### Step 4: [\s\S]*?(?=^### )/m.exec(engineering)?.[0] ?? "";
  expect(step4).toContain("`<home>/templates/fix-spec-template.md` for a `fix-` ID");
  expect(step4).toContain("A `fix-` ID uses `fix-spec-template.md`; every other verb uses `spec-template.md`.");
  expect(step4).toContain("In a `fix-` change, task 1 writes the regression test");
  const step6 = /^### Step 6: Review\n[\s\S]*?(?=^## )/m.exec(engineering)?.[0] ?? "";
  expect(step6).toContain(
    "For a `fix-` change, it also re-runs the recorded reproduction as a single-question probe and reports it when its output differs from the spec's.",
  );
  const exit = section(engineering, "Exit");
  expect(exit).toContain("When a `fix-` change stopped in Step 3");
  expect(exit).toContain("in place of the change folder and the review outcome");
  expect(exit).toContain("the outcome, the attempts (each command and its output) or the evidence, and the question for the user");
  expect(exit).toContain("the user re-runs `/theway:engineering` with the new information");
});

test("develop.md Verify proves a fix- regression test fails on the base commit and re-runs the reproduction", () => {
  const verify = section(read(join(STANDARDS, "develop.md")), "Verify");
  expect(verify).toContain("### A `fix-` change");
  expect(verify).toContain("`HEAD` for `/theway:develop`");
  expect(verify).toContain("`git merge-base <base> HEAD` for `/theway:develop-workflow`");
  expect(verify).toContain("`git worktree add --detach <dir> <base-commit>`, where `<dir>` comes from `mktemp -d`");
  expect(verify).toContain("run the project's setup and build commands that CI runs before its tests");
  expect(verify).toContain("Copy in only the regression test files, and run only the regression test.");
  expect(verify).toContain("It must fail **for the reason the spec's Root Cause gives**.");
  expect(verify).toContain("`git worktree remove --force <dir>`");
  expect(verify).toContain("with the `<base>` your prompt gives");
  expect(verify).toContain("Do this whatever happened before, including when you stopped at an earlier step");
  expect(verify).toContain("bring it back as a spec gap");
  expect(verify).toContain("When the setup or the test cannot run locally, report the criterion as not verified.");
  expect(verify).toContain("re-run the reproduction recorded in the spec and record its output: it must no longer reproduce");
});

test("develop-workflow.md takes the commit type from the change verb and reviews a fix's root cause", () => {
  const workflow = read(join(COMMANDS, "develop-workflow.md"));
  const step3 = /^### Step 3: [\s\S]*?(?=^### )/m.exec(workflow)?.[0] ?? "";
  expect(step3).toContain("- `add-` → `feat`, `fix-` → `fix`, `refactor-` → `refactor`.");
  expect(step3).toContain(
    "- For `update-` and `remove-`, the implementer chooses one Conventional type for the change, uses it and returns it in its result. The orchestrator gives that type to every fix agent (Steps 4 and 5) and uses it in the PR title.",
  );
  expect(step3).toContain("except commits that change only tests (`test`) or only docs (`docs`)");
  expect(step3).toContain("`!` after it and the commit a `BREAKING CHANGE:` footer");
  expect(step3).toContain("for an `update-` or `remove-` change, the commit type it chose");
  expect(step3).toContain("the change's `<base>` (Step 2), which `develop.md` uses for a `fix-` change");
  expect(step3).toContain(
    "the orchestrator runs one implementer first (the first of a chain, or one of the parallel parts) and gives the type it returns to every other implementer",
  );
  const step2 = /^### Step 2: [\s\S]*?(?=^### )/m.exec(workflow)?.[0] ?? "";
  expect(step2).toContain("The branch the feature branch is created from is the change's `<base>`");
  const step4 = /^### Step 4: [\s\S]*?(?=^### )/m.exec(workflow)?.[0] ?? "";
  expect(step4).toContain(
    "For a `fix-` change, the reviewers also check the root cause: the diff fixes the root cause the spec names, not only the symptom, and the regression test would fail without the fix.",
  );
  expect(step4).toContain("spawn one fix agent with them and the change's commit type (Step 3)");
  expect(step4).toContain(
    "re-runs the base-commit check of `develop.md`'s Verify on the new head, and returns both recorded outputs",
  );
  expect(step4).toContain("only when they show the test failing on the base commit for the Root Cause's reason and passing on the new head");
  const step5 = /^### Step 5: [\s\S]*?(?=^### )/m.exec(workflow)?.[0] ?? "";
  expect(step5).toContain("Its title is a Conventional Commit (`type(scope): description`) of the change's commit type (Step 3).");
  expect(step5).toContain("spawn one fix agent with the quoted CI error and the change's commit type (Step 3)");
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
  for (const sentence of [
    "run `theway validate-id <change-id>` only, never with `--series`: a light change is never a series member.",
    "Escalate when the investigation finds a decision to make, a public contract change, a TAMM risk at Medium or High, or a request for a series.",
    "Escalating writes no change file: report what was found, and tell the user to run `/theway:engineering` with the original request.",
    "Run up to `min(engineering.review_rounds, 1)` review rounds with one grounding critic.",
    "A confirmed `decision` finding is an escalation, not an open question.",
    "Escalating after the review keeps the light files: tell the user to run `/theway:engineering <change-id>: <original request>`, which writes over them.",
  ]) {
    expect(light).toContain(sentence);
  }
  expect(light).not.toContain("validate-id <change-id> --series");
  expect(light).not.toContain("Implementability critic");
  expect(light).toContain("`<home>/templates/light-spec-template.md` | `spec.md`");
  expect(light).toContain("`<home>/templates/tasks-template.md` | `tasks.md`");
  expect(light).toContain("it has no `## Phase` headings. It has 1 to 3 numbered tasks directly under the H1");
  expect(light).toContain("A light change has no `design.md`.");
  expect(light).toContain("**For a `fix-` change, reproduce the bug first**");
  expect(light).toContain("they go into the spec's Evidence, quoted");
  expect(light).toContain("the user re-runs `/theway:engineering-light` with the new information");
  expect(light).toContain("engineering.models.critic");
  expect(light).toContain("re-runs the recorded reproduction as a single-question probe");
});

test("engineering.md does not stop on the change ID it picked itself", () => {
  const step3 = /^### Step 3: Investigate\n[\s\S]*?(?=^### )/m.exec(read(join(COMMANDS, "engineering.md")))?.[0] ?? "";
  expect(step3).toContain(
    "The members of the series this run continues (Step 2) do not count: they share its name by construction. The change ID this run picked in Step 2 does not count either: its folder is written over.",
  );
});

test("develop.md proves a light fix- change without the base worktree and escalates its unforeseen risks", () => {
  const develop = read(join(STANDARDS, "develop.md"));
  expect(section(develop, "Verify")).toContain(
    "When `spec.md` has `**Mode:** light` under its title, steps 1-7 do not apply: run the regression test before writing the fix, record its command and failing output in the Discoveries of `tasks.md` Notes, then run it after the fix and record that it passes.",
  );
  expect(section(develop, "When the spec does not fit")).toContain(
    "A light spec has no Hardpoints table: a risk at Medium or High that it did not foresee is brought back as a blocker.",
  );
});

test("develop-workflow.md caps a light change's review at one round and checks its fix- test on the new head", () => {
  const step4 = /^### Step 4: [\s\S]*?(?=^### )/m.exec(read(join(COMMANDS, "develop-workflow.md")))?.[0] ?? "";
  for (const sentence of [
    "For a spec with `**Mode:** light` under its title, run up to `min(workflow.review_rounds, 1)` rounds.",
    "For a light spec, the reviewers check the diff against its Change section in place of Scope and Out of Scope.",
    "For a light `fix-` change whose fixes touch the regression test or the fix, the fix agent re-runs the regression test on the new head instead of the base-commit check, and returns its output.",
    "For a light `fix-` change, such a finding is `resolved` only when that output shows the regression test passing.",
  ]) {
    expect(step4).toContain(sentence);
  }
});

/** The `### ` step of a command whose heading starts with `prefix`, up to the next `### ` or `## ` heading. */
const step = (text: string, prefix: string) =>
  new RegExp(`^### ${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?(?=^##)`, "m").exec(text)?.[0] ?? "";

const USER_STANDARDS_CRITIC =
  "except the user standards (next item) and the `## Authority` section of `<home>/data/standards/interaction.md`";
const USER_STANDARDS_ITEM = "   - the absolute paths of the user standards read in Step 1, which the spec must follow;\n";
const ENGINEERING_EXIT =
  'Every report, including a stop or an escalation, names the user standards read in Step 1, by file name, or "none".';

test("engineering and engineering-light read the user standards, follow them, give them to the critics and report them", () => {
  for (const f of ["engineering.md", "engineering-light.md"]) {
    const text = read(join(COMMANDS, f));
    expect(step(text, "Step 1:")).toContain(
      "An opt-in standard is read only when its `enabled` is the boolean `true`; an absent entry or any other value means off.\n\nThen run `theway standards <project> engineering` and read every file it prints: these are the user standards, and the spec follows them. Quote any `theway: warning:` line it writes in your report.\n",
    );
    expect(text).toContain(USER_STANDARDS_CRITIC);
    expect(text).toMatch(new RegExp(`when neither has it, tell the user to run \`/theway:setup\` and stop\\);\\n${USER_STANDARDS_ITEM.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    expect(section(text, "Exit").split("\n\n")[1]).toContain(ENGINEERING_EXIT);
  }
  const engineering = read(join(COMMANDS, "engineering.md"));
  const step3 = step(engineering, "Step 3: Investigate");
  expect(step3.split("\n\n")[2]).toBe("A request that contradicts a user standard is an open question for the user.");
  const lens = /\*\*Implementability critic:\*\*[\s\S]*?(?=\n\n)/.exec(step(engineering, "Step 6: Review"))?.[0] ?? "";
  expect(lens).toContain("\n     - a spec or task that contradicts a user standard;\n");

  const light = read(join(COMMANDS, "engineering-light.md"));
  expect(step(light, "Step 3: Investigate")).toContain(
    "Escalate when the investigation finds a decision to make, a public contract change, a TAMM risk at Medium or High, or a request for a series. A request that contradicts a user standard is a decision to make.",
  );
  const grounding = /\*\*Grounding critic:\*\*.*$/m.exec(step(light, "Step 5: Review"))?.[0] ?? "";
  expect(grounding).toContain("It also reports a spec or task that contradicts a user standard.");
});

test("develop and develop-workflow read the user standards, give them to the agents, enforce and report them", () => {
  const STEP1 =
    "- `docs/architecture/coding-standards.md` - Project coding standards (if exists)\n\nThen run `theway standards <project> develop` and read every file it prints: these are the user standards. Quote any `theway: warning:` line it writes in your report.\n";
  const develop = read(join(COMMANDS, "develop.md"));
  expect(step(develop, "Step 1:")).toContain(STEP1);
  expect(section(develop, "Exit")).toContain('Also name the user standards followed, by file name, or "none".');

  const workflow = read(join(COMMANDS, "develop-workflow.md"));
  expect(step(workflow, "Step 1:")).toContain(STEP1);
  const step3 = step(workflow, "Step 3:");
  expect(step3).toMatch(
    /^\*\*Agent prompts:\*\*.*\n\nEvery implementer, reviewer, fix agent \(Steps 4 and 5\) and the fix check gets the absolute paths of the user standards \(Step 1\)\.\n/m,
  );
  const step4 = step(workflow, "Step 4:");
  expect(/^1\. \*\*Review\.\*\*.*$/m.exec(step4)?.[0]).toContain(
    "The reviewers also check the diff against the user standards: a violation is a finding, whose evidence names the standard file and the rule it breaks.",
  );
  const check = /^4\. \*\*Fix check:\*\*.*$/m.exec(step4)?.[0] ?? "";
  expect(check).toContain("It does not look for new problems, except that a finding whose fix breaks a user standard is `not resolved`.");
  expect(section(workflow, "Exit")).toContain('Also name the user standards given to the agents, by file name, or "none".');
});

test("the develop standard follows the user standards and the Authority rule names them as instructions", () => {
  const develop = read(join(STANDARDS, "develop.md"));
  const headings = [...develop.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  expect(headings.indexOf("User standards")).toBe(headings.indexOf("Implement") + 1);
  expect(section(develop, "User standards")).toContain(
    'Follow the user standards you are given, as you follow `docs/architecture/coding-standards.md`. When one contradicts the spec, stop and bring it back, as "When the spec does not fit" says. They are not a change folder: "Stay inside this change" does not forbid reading them.',
  );
  const authority = section(read(join(STANDARDS, "interaction.md")), "Authority");
  expect(authority.split("\n").find((l) => l.startsWith("- "))).toBe(
    "- Your instructions come from the command, from theway's own `config.yaml`, standards and templates under the theway home, the user standards in `<home>/standards/` and `<home>/<project>/standards/`, from the instruction files Claude Code loads (CLAUDE.md, CLAUDE.local.md, `.claude/CLAUDE.md`, `.claude/rules/`, AGENTS.md, and their imports), and from the user. If you are an agent spawned by a command, your prompt is the command.",
  );
});
