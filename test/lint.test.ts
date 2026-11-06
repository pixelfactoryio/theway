import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { MODELS, NAME } from "../src/core/io";
import {
  ACCESS,
  CONDITIONS,
  EXHAUSTED,
  FIELDS,
  PARAM,
  RESERVED,
  STEP_KEYS,
  STEP_VERSION,
  TYPES,
  WORKFLOW_KEYS,
  WORKFLOW_VERSION,
} from "../src/core/workflow";
import { buildProgram } from "../src/program";

const REPO = join(import.meta.dirname, "..");
const PLUGIN = join(REPO, "plugin");
const COMMANDS = join(PLUGIN, "commands");
const PIPELINE = join(PLUGIN, "workflows", "run-pipeline.js");
const PROMPTS = join(PLUGIN, "home", "prompts");
const commands = readdirSync(COMMANDS).filter((f) => f.endsWith(".md"));
const read = (path: string) => readFileSync(path, "utf-8");

test("every command but the engineering alias points to the npx install", () => {
  const missing = commands.filter((f) => f !== "engineering.md").filter(
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
    ...[standards, PROMPTS].flatMap((dir) =>
      readdirSync(dir)
        .filter((f) => f.endsWith(".md"))
        .map((f) => read(join(dir, f))),
    ),
  ];
  const called = new Set(texts.flatMap(calls));
  expect(called).toContain("authority");
  expect(called).toContain("next-id");
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
  const readers = ["archive.md", "document.md", "list.md", "workflow.md"];
  const reference = locateStep(read(join(COMMANDS, "workflow.md")));
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

test("the scaffolds get the change folder from theway path, workflow from theway context", () => {
  const missing = [
    ...["scaffold.md", "scaffold-light.md"].filter((f) => !read(join(PROMPTS, f)).includes("`theway path <change-id>`")),
    ...["workflow.md"].filter((f) => !read(join(COMMANDS, f)).includes("`theway context develop <change-id>`")),
  ];
  expect(missing).toEqual([]);
});

test("the four loading commands call theway context, not theway config or theway standards", () => {
  for (const f of ["workflow.md", "document.md"]) {
    const text = read(join(COMMANDS, f));
    expect(calls(text)).toContain("context");
    expect(calls(text)).not.toContain("config");
    expect(calls(text)).not.toContain("standards");
  }
});

test("the scaffold takes a series' member IDs from theway next-id", () => {
  const text = read(join(PROMPTS, "scaffold.md"));
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

test("the shipped spec review takes its rounds and model from its step params, not from an engineering config section", () => {
  const config = Bun.YAML.parse(read(join(PLUGIN, "home", "config.yaml"))) as Record<string, unknown>;
  expect(config.engineering).toBeUndefined();
  expect(read(join(PLUGIN, "home", "config.yaml"))).toContain("#   spec-review: {rounds: 2}");
  const review = Bun.YAML.parse(read(join(PLUGIN, "home", "steps", "spec-review.yaml"))) as { params: Record<string, { default: unknown }> };
  expect([review.params.rounds?.default, review.params.model?.default]).toEqual([1, "opus"]);
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
  expect(Object.keys(config).sort()).toEqual(["standards", "workflow"]);
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
    .filter(
      (f) =>
        !/^(config\.yaml|standards\/[^/]+\.md|templates\/[^/]+\.md|workflows\/[^/]+\.yaml|steps\/[^/]+\.yaml|prompts\/[^/]+\.md|schemas\/[^/]+\.json)$/.test(f),
    );
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
  expect(read(join(COMMANDS, "workflow.md"))).toContain("`theway authority`");
  // The engine puts the authority text first in every prompt, the critics' included.
  expect(read(PIPELINE)).toContain("args.authority.trimEnd()");
  for (const f of ["archive.md", "workflow.md", "document.md"]) {
    expect(read(join(COMMANDS, f))).toContain("`<home>/standards/interaction.md`");
  }
  // The Authority list names theway's own prompts, steps and workflows.
  expect(section(read(join(PLUGIN, "home", "standards", "interaction.md")), "Authority")).toContain(
    "theway's own `config.yaml`, standards, templates, prompts, steps and workflows under the theway home",
  );
});

const TEMPLATES = join(PLUGIN, "home", "templates");
const STANDARDS = join(PLUGIN, "home", "standards");
const prompt = (f: string) => read(join(PROMPTS, f));

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
  const fix = prompt("fix-spec-template.md");
  const spec = prompt("spec-template.md");
  expect(Object.keys(frontmatter(fix))).toEqual(Object.keys(frontmatter(spec)));
  expect(frontmatter(fix).template_type).toBe("fix");
  // The TAMM framework is a prompt now.
  for (const t of [fix, spec, prompt("light-spec-template.md")]) {
    expect(frontmatter(t).required_context).toContain("The tamm-framework prompt - TAMM framework");
  }
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

test("the scaffolds handle a fix- change: the verb list, the investigation prompt, the fix template and the stop outcomes", () => {
  expect(prompt("scaffold-rules.md")).toContain("`add-*`, `update-*`, `refactor-*`, `remove-*`, `fix-*`");
  const scaffold = prompt("scaffold.md");
  expect(section(scaffold, "Investigate")).toContain("the spec-investigation prompt");
  expect(section(scaffold, "Investigate")).toContain("return `outcome: stopped`, with the stop report in `report`");
  expect(section(scaffold, "Write the change files")).toContain("the fix-spec-template prompt for a `fix-` ID");
  const investigation = prompt("spec-investigation.md");
  // A reproduction runs in a throwaway directory.
  expect(section(investigation, "A `fix-` change")).toContain("`mktemp -d`");
  for (const marker of ["- **Not reproduced:**", "- **Possibly already covered:**", "`theway list`", "- **Works as intended:**"]) {
    expect(section(investigation, "A `fix-` change")).toContain(marker);
  }
  for (const old of ["stop the command", "the command continues", "The command says"]) expect(investigation).not.toContain(old);
  expect(investigation).not.toContain("starts again from Step 1");
  // The stop outcomes live only in spec-investigation.md.
  for (const f of ["scaffold.md", "scaffold-light.md", "scaffold-rules.md"]) expect(prompt(f)).not.toContain("**Not reproduced:**");
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

test("commits.md sets the commit type from the change verb and the lens prompts review a fix's root cause", () => {
  expect(read(PIPELINE)).toContain("args.base");
  const commits = read(join(STANDARDS, "commits.md"));
  // The shipped commit and branch convention.
  for (const marker of ["`add-` → `feat`", "type(scope): description", "type(scope)!: description", "BREAKING CHANGE:", "branch is named `<change-id>`"]) {
    expect(commits).toContain(marker);
  }
  // The `!` goes after the scope: `type!(scope):` appears only in the sentence that forbids it.
  for (const text of [commits, read(join(REPO, "site", "content", "docs", "commands", "workflow.mdx"))]) {
    expect(text).toContain("type(scope)!: description");
    expect(text.split("type!(scope):").length).toBe(2);
    expect(text).toContain("Never `type!(scope):`.");
  }
  expect(step(read(join(COMMANDS, "workflow.md")), "Step 3:")).toContain("`<base>` (Step 2)");
  // A light spec's Change section replaces Scope.
  expect(read(join(PROMPTS, "conformance.md"))).toContain("the Change section");
  // The review of a fix- change.
  const correctness = read(join(PROMPTS, "correctness.md"));
  expect(correctness).toContain("the root cause the spec names");
  expect(correctness).toContain("the regression test would fail without the fix");
});

test("the light spec template has the spec template's frontmatter keys, the Mode line, its fixed headings and the two fix- criteria", () => {
  const light = prompt("light-spec-template.md");
  const spec = prompt("spec-template.md");
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

test("engineering.md is the alias of /theway:workflow and keeps its frontmatter", () => {
  const text = read(join(COMMANDS, "engineering.md"));
  const [, front, body] = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text) ?? [];
  expect(front).toContain('description: "Write the spec and numbered tasks for a change');
  expect(front).toContain("allowed-tools: Bash(theway:*)");
  expect(body?.trim()).toBe(
    [
      "# theway: Engineering",
      "",
      "`/theway:engineering [--light] <request>` is `/theway:workflow --workflow engineering <request>`, or `--workflow engineering-light <request>` when `--light` is given (anywhere in the arguments, counted once). Invoke the `theway:workflow` skill with the Skill tool and those arguments, then follow it.",
    ].join("\n"),
  );
});

test("the shipped prompts check a fix- test by the regression check and triage by the verdicts prompt", () => {
  for (const f of ["implement.md", "fix.md", "fix-check.md"]) expect(prompt(f)).toContain("the regression check of `develop.md`");
  expect(prompt("triage.md")).toContain("the verdicts prompt");
  expect(prompt("triage.md")).not.toContain("spec-review.md");
  expect(read(join(PLUGIN, "home", "steps", "review.yaml"))).toContain("prompt: [verdicts, triage]");
  expect(read(PIPELINE)).not.toContain("specReview");
  const workflow = read(join(COMMANDS, "workflow.md"));
  expect(step(workflow, "Step 1:")).not.toContain("spec-review.md");
  expect(workflow).not.toContain("specReview");
});

test("a request run reads the standards from theway context engineering and reports them", () => {
  const workflow = read(join(COMMANDS, "workflow.md"));
  const step1 = step(workflow, "Step 1:");
  expect(step1).toContain("run `theway context engineering` for the standards");
  expect(step1).toContain("Do not read `develop.md` or any change file.");
  expect(section(workflow, "Exit")).toContain('the standards given, by file name, or "none"');
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

test("workflow takes its workflow from theway workflow", () => {
  const workflow = read(join(COMMANDS, "workflow.md"));
  expect(step(workflow, "Step 1:")).toContain("`theway workflow`");
});

test("document reads the standards from theway context", () => {
  const text = read(join(COMMANDS, "document.md"));
  const first = step(text, "Step 1:").split("\n\n")[1];
  expect(first).toStartWith("Run `theway context document`");
});

/** Each prompt and the phrases of today's engineering rules it must carry, taken from the command and standards they replace. */
const ENGINEERING_RULES: Record<string, string[]> = {
  "scaffold-rules.md": [
    "Use naming convention: `add-*`, `update-*`, `refactor-*`, `remove-*`, `fix-*`",
    "Example change IDs: `add-user-authentication`, `update-payment-api`, `fix-login-crash`",
    "When the request names a change ID, use it.",
    "The request form `<change-id>: <request>` names one, and the run writes over that change's existing files.",
    "Do not suggest entering plan mode — its approval step is a \"start coding\" trigger that collapses scaffolding into implementation.",
    "Action words in the request (\"rename X\", \"try the fix\") describe what the spec should plan, not something to do now.",
    "An open point recorded in the spec counts as an open question: return `outcome: open`",
    "A stop report ends with: re-run `/theway:engineering` (with `--light` for a light run) with the new information.",
  ],
  "scaffold.md": [
    "- **Trigger:** the request is a series when the user asks for a series, for multiple sequential changes, or to \"split into N changes\", or when the argument passed already ends in `-NN`.",
    "- **Pattern:** every member is `<series-id>-NN`",
    "- **Member IDs:** run `theway next-id <series-id> --count <N>`",
    "on `would go past -99`, stop and report it.",
    "- **Forbidden:** topic-word suffixes (`add-user-auth-login`), and mixing standalone and series IDs in one series.",
    "run `theway validate-id <change-id>` for a standalone change (`next-id` already validated a series' IDs)",
    "`**Series:** <series-id> — NN of TOTAL, depends on <series-id>-(NN-1)`",
    "A request that contradicts a standard is an open question for the user.",
    "In a `fix-` change, task 1 writes the regression test; re-running the reproduction is not a task, as it is part of Verify.",
    "If needed, create `<change-dir>/design.md` for:",
  ],
  "scaffold-light.md": [
    "`a series is not a light change; run /theway:engineering without --light`",
    "Escalate when the investigation finds a decision to make, a public contract change, a TAMM risk at Medium or High, or a request for a series.",
    "A request that contradicts a standard is a decision to make.",
    "A decision is a choice the code, the docs and the request do not settle; a public contract change is a change to a command, CLI, API, config key or file format that others rely on.",
    "Adding something counts: a new response field, flag, option, config key or file key changes the contract, even when nothing existing breaks.",
    "`escalated: <what was found>; run /theway:engineering <request> without --light`",
    "never with `--series` (a light change is never a series member)",
    "`spec.md` keeps the `**Mode:** light` line directly under its H1 title: `/theway:workflow` reads it.",
    "A light change has no `design.md`.",
  ],
  "spec-investigation.md": ["- **Not reproduced:**", "- **Possibly already covered:**", "- **Works as intended:**", "Reasoning about the code is not a reproduction."],
  "spec-reviewer.md": [
    "You never edit the change folders or the repository.",
    "You write no prototype, reproduce none of the planned code, config or schema, and do not re-implement the spec's rules to measure them.",
    "Each probe answers exactly one question (a version, a behavior, an error string) and writes only to a temporary directory created with `mktemp -d`.",
    "No critic sees another's findings.",
    "a `kind`: `fixable` (the spec can be corrected from facts) or `decision` (only the user can settle it)",
  ],
  "verdicts.md": [
    "- `confirmed` (real);",
    "- `false_positive` (refuted);",
    "- `duplicate` (the same problem as an earlier finding of the round, which it names",
    "- `nit` (real, cosmetic);",
    "- `out_of_scope` (not this change's).",
  ],
  "spec-triage.md": [
    "Change a proposed `decision` to `fixable` only when the code, the docs or the change's own stated decisions determine the answer",
    "`confirmed, settled`",
    "`settled: true`",
    "give `question`: the question for the user",
  ],
  "spec-fix.md": ["Keep the files to the structure of their templates", "Input `confirmed`"],
  "grounding.md": [
    "Report claims that are wrong, unverified or contradicted by the current code.",
    "re-run the recorded reproduction as a single-question probe",
    "When Input `params.lenses` has only this lens, also report a spec or task that contradicts a standard.",
  ],
  "implementability.md": [
    "- choices left open (\"probe X then decide\", \"A or B\", \"if needed\");",
    "- Success Criteria that cannot be checked, or whose check passes whatever the code does;",
    "- Success Criteria with no task behind them, and tasks with no Success Criterion;",
    "- tasks outside the Scope or listed as Out of Scope;",
    "- tasks that cannot be done as written (a missing file, a command that does not exist, an environment the task assumes);",
    "- contradictions between the spec and its tasks, or with the existing command, config or doc text the change touches;",
    "- a spec or task that contradicts a standard;",
    "- in a series, gaps and overlaps between members.",
  ],
};

test("the engineering prompts carry today's engineering rules", () => {
  const missing = Object.entries(ENGINEERING_RULES).flatMap(([f, phrases]) => phrases.filter((ph) => !prompt(f).includes(ph)).map((ph) => `${f}: ${ph}`));
  expect(missing).toEqual([]);
  // The steps read them in this order: the scaffold prompt last, so the agent is scaffold:scaffold.
  const step = (n: string) => Bun.YAML.parse(read(join(PLUGIN, "home", "steps", `${n}.yaml`))) as { do: { agent: { prompt: string[] } }[] };
  expect(step("scaffold").do[0]?.agent.prompt).toEqual(["tamm-framework", "spec-investigation", "scaffold-rules", "spec-template", "fix-spec-template", "tasks-template", "scaffold"]);
  expect(step("scaffold-light").do[0]?.agent.prompt).toEqual(["tamm-framework", "spec-investigation", "scaffold-rules", "light-spec-template", "tasks-template", "scaffold-light"]);
  // Only the document templates stay in templates/; the standards folder holds no engineering procedure.
  expect(readdirSync(TEMPLATES).sort()).toEqual(["coding-standards-template.md", "source-tree-template.md", "tech-stack-template.md"]);
  for (const f of ["tamm-framework.md", "spec-investigation.md", "spec-review.md"]) expect(readdirSync(STANDARDS)).not.toContain(f);
});

test("workflow.md Step 2 stops on no commit, a pushing workflow without a remote and a failed git-host operation, and the run never works around them", () => {
  const text = read(join(COMMANDS, "workflow.md"));
  const branch = step(text, "Step 2:");
  const markers = [
    "`the repository has no commit: run git init and commit once, then run /theway:workflow again`",
    "`this workflow pushes and the repository has no git remote: add one, or run the default develop workflow (no branch, nothing pushed)`",
    "the base is the current branch (`git branch --show-current`), with no sync.",
    "`HEAD is detached: check out a branch, then run /theway:workflow again`",
  ];
  // The three cases, in order.
  const at = markers.map((m) => branch.indexOf(m));
  expect(at.every((i) => i >= 0)).toBe(true);
  expect([...at].sort((a, b) => a - b)).toEqual(at);
  expect(branch).toContain("Case 1 also runs for a working-tree workflow, before its skip below; a request run skips all three.");
  expect(branch).toContain("When a `git-host.md` operation of this step fails (for example when the default branch cannot be found), quote its error and stop, before any work.");
  // Case 3 never finds or syncs the default branch, and its current branch is the `<base>`.
  expect(branch).toContain("Case 3 replaces finding and syncing the default branch below; only its series rule still applies.");
  expect(branch).toContain("the default branch, the current branch of case 3 or that previous branch, is the change's `<base>`.");
  // A repository with a remote keeps today's sentence.
  expect(branch).toContain("Find the default branch and sync it, as `git-host.md` says (\"Default branch\", \"Sync the default branch\"), then create (or check out) the change's feature branch from it");
  expect(section(text, "Invocation")).toContain(
    "Never create or edit workflow, step or prompt files, or initialize a repository, to work around a missing remote or another failed step: stop and report.",
  );
});

test("workflow.md runs an input: request workflow: the request invocation, no branch, no record, and the engineering report", () => {
  const text = read(join(COMMANDS, "workflow.md"));
  const invocation = section(text, "Invocation");
  expect(invocation).toContain("/theway:workflow --workflow <name> <request>                         # input: request");
  expect(invocation).toContain("every argument other than `--workflow <name>` forms the request, joined with spaces; an empty request: stop and ask for one");
  expect(invocation).toContain("**Authorization of a request run**");
  expect(invocation).toContain("no repository edit, no branch, no commit, no push and no PR");
  expect(step(text, "Step 2:")).toContain("Skip this step for a request run: there is no branch and no commit.");
  expect(step(text, "Step 4:")).toContain("Skip this step for a request run: the change files are its output.");
  const run = step(text, "Step 3:");
  for (const marker of [
    "passes only `repo`, `request` (the request, as a string), `changes`, `standards`, `authority`, `workflow` and `steps`",
    "Pass it to every segment after the scaffold.",
    "**When neither the Workflow tool nor the Agent tool is available:**",
    "**Agent steps always go through agents:** an entry with `agents: true` runs through the Workflow tool",
    "It runs inline only when both tools are missing",
    "Never run it inline otherwise, even for a short step.",
  ]) {
    expect(run).toContain(marker);
  }
  const exit = section(text, "Exit");
  for (const marker of [
    "each change folder the scaffold wrote",
    '2. one line per entry, in workflow order: its `id` and "through agents" or "inline";',
    'marked "through agents" for an entry run through agents and "inline" for an inline entry',
    "the scaffold's `shaping`",
    "`#`, `Finding`, `Verdict` and `Fix`",
    "`R<iteration>-<index>`",
    "`open question: <question>`",
    "`escalated` in a light run",
    "each `confirmed, settled` finding again, with the choice made",
    '"not run because a question was already open"',
    '"not run: the scaffold stopped"',
    "the spec is not ready until it is answered",
  ]) {
    expect(exit).toContain(marker);
  }
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

test("workflow.md runs inline steps and gates itself, agent segments through run-pipeline, and records from typed results", () => {
  const text = read(join(COMMANDS, "workflow.md"));
  for (const marker of ["agents: false", '"ran inline: the session checked its own work"', "`steps` and `head`", "`git rev-parse HEAD`"]) {
    expect(text).toContain(marker);
  }
  // The inline default refuses a series.
  expect(text).toContain("a series needs a workflow that commits");
  // No fixed list of step types.
  expect(text).not.toMatch(/`implement`, `review`|`agent` step|with a `pr` step|without a `pr` step/);
  // Pushes are authorized from pushes.
  expect(section(text, "Invocation")).toContain("when `theway workflow` prints `pushes: true`, pushing each change's own feature branch");
  // The gate runs inline with Continue and Stop.
  const run = step(text, "Step 3:");
  for (const marker of ["AskUserQuestion", '"Continue"', '"Stop"', "`blocked`, with `gate: <question>`", "Walk the step's printed `do` tree"]) {
    expect(run).toContain(marker);
  }
  // The records come from the typed results.
  const record = step(text, "Step 4:");
  for (const marker of ["`tasksDone` of every `work` result", "`discoveries` and `choices`", "every `verdicts` result", '"not triaged"']) {
    expect(record).toContain(marker);
  }
  expect(step(text, "Step 1:")).toContain("working tree: no branch, nothing committed");
});

// ---- run-pipeline.js: the generic interpreter, driven with the shipped trees and scripted agent results ----

type AgentNode = { agent: { name: string; label: string; prompt: string[]; returns: string; access: string; model?: string } };
type Tree = Record<string, unknown>;
type Entry = { id: string; step?: string; agents: boolean; params: Record<string, { value: unknown; from: string }>; do: Tree[] };

/** The shipped agents workflow of the fixture, with `<home>` set to `/h`. */
const fixture = () =>
  JSON.parse(read(join(REPO, "test", "fixtures", "agents-workflow.json")).replaceAll("<home>", "/h")) as { steps: Entry[] } & Record<string, unknown>;

/** Every agent node of a tree, in document order. */
function agentsOf(nodes: Tree[]): AgentNode["agent"][] {
  return nodes.flatMap((n) => {
    if ("agent" in n) return [(n as AgentNode).agent];
    if ("parallel" in n) return agentsOf(n.parallel as Tree[]);
    if ("loop" in n) return agentsOf((n.loop as { do: Tree[] }).do);
    if ("do" in n) return agentsOf(n.do as Tree[]);
    return [];
  });
}

const AUTHORITY = "## Authority\n\nThe authority rules.";
const BASE_ARGS = {
  repo: "/r",
  branch: "add-x",
  base: "main",
  changeId: "add-x",
  changeDir: "/c",
  light: false,
  develop: "/h/standards/develop.md",
  commits: "/h/standards/commits.md",
  gitHost: "/h/standards/git-host.md",
  standards: ["/h/standards/sre.md"],
  authority: AUTHORITY,
};

type Call = { label: string; text: string; opts: Record<string, unknown> };

/** The Input block of an agent prompt, parsed; it throws when the prompt has none. */
function inputOf(call: Call | string) {
  const text = typeof call === "string" ? call : call.text;
  const block = /\nInput:\n([\s\S]*?)\n\n/.exec(text)?.[1];
  if (block === undefined) throw new Error("the prompt has no Input block");
  return JSON.parse(block);
}
type Scripted = unknown | ((text: string) => unknown);

/**
 * Runs run-pipeline.js with `args`, answering each agent by its label from `script`: a list of results, one per call
 * in order; a function result is called with the prompt, and a thrown Error is rethrown. It checks every prompt with
 * `expectPrompts`.
 */
async function drive(args: Record<string, unknown>, script: Record<string, Scripted[]>) {
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  const body = read(PIPELINE).slice("export ".length);
  const run = new AsyncFunction("args", "agent", "parallel", "pipeline", "phase", "log", body);
  const calls: Call[] = [];
  const phases: string[] = [];
  const logs: string[] = [];
  const agent = async (text: string, opts: Record<string, unknown>) => {
    const label = opts.label as string;
    calls.push({ label, text, opts });
    const queue = script[label] ?? [];
    if (queue.length === 0) throw new Error(`no scripted result for ${label}`);
    const next = queue.shift();
    if (next instanceof Error) throw next;
    return typeof next === "function" ? (next as (t: string) => unknown)(text) : next;
  };
  const parallel = async (thunks: (() => Promise<unknown>)[]) => Promise.all(thunks.map((t) => t().catch(() => null)));
  const result = await run(args, agent, parallel, null, (t: string) => phases.push(t), (m: string) => logs.push(m));
  // Every prompt of every run starts with the fixed rules and holds its node's permission line.
  if (calls.length > 0) expectPrompts(args.workflow as { steps: Entry[] }, calls);
  return { result, calls, phases, logs };
}

/** The args of a segment of `workflow` from `steps`, with the head `h0`. */
const segment = (workflow: Record<string, unknown>, steps: number[], extra: Record<string, unknown> = {}) => ({
  ...BASE_ARGS,
  workflow,
  steps,
  head: "h0",
  ...extra,
});

const common = { summary: "done", authorityReports: [] as string[] };
const work = (head: string, extra: Record<string, unknown> = {}) => ({
  head,
  commits: [{ sha: head, subject: "feat: x" }],
  checks: [],
  tasksDone: [],
  criteria: [],
  choices: [],
  discoveries: [],
  regression: [],
  blocker: null,
  ...common,
  ...extra,
});
const findings = (...titles: string[]) => ({
  findings: titles.map((title) => ({ title, file: "a.ts", line: 1, problem: "p", evidence: "e" })),
  ...common,
});
const verdicts = (...v: [number, string][]) => ({ verdicts: v.map(([index, verdict]) => ({ index, verdict, reason: "r" })), ...common });
const resolutions = (...v: [number, string][]) => ({ resolutions: v.map(([index, status]) => ({ index, status, reason: "why" })), ...common });
const ci = (state: string, failedRunIds: string[] = [], failedOther: { name: string; link: string }[] = []) => ({ ci: state, failedRunIds, failedOther, ...common });
const diagnosis = (classification: string, extra: Record<string, unknown> = {}) => ({
  errors: [{ runId: "1", error: "E1" }],
  classification,
  baseFix: null,
  rerun: [],
  ...common,
  ...extra,
});
const opened = { url: "https://example.test/pr/7", number: 7, head: "h0", ...common };

const PERMISSION: Record<string, string> = {
  read: "You are read-only: do not edit, commit or push anything.",
  commit: "You may commit on add-x; do not push. Write commit messages as /h/standards/commits.md says",
  push: 'You may commit on add-x and push it, only as "Push the feature branch" in /h/standards/git-host.md says, never force. Write commit messages',
};

const SPEC_PERMISSION =
  "You may write only under the change folders of this run (Input `changes`; a `scaffold` agent: the folders `theway path <change-id>` prints for the IDs it validated with `theway validate-id` or got from `theway next-id` in this run) and, for throwaway probes, in a directory created with `mktemp -d`. Never open other change folders or `changes/archive/`. Never edit the repository, commit or push.";

/** Every prompt starts with the fixed rules and holds the permission line of its node's access. */
function expectPrompts(workflow: { steps: Entry[]; input?: string }, calls: Call[]): void {
  const access = new Map(workflow.steps.flatMap((s) => agentsOf(s.do ?? []).map((a) => [a.label, a.access] as const)));
  expect(calls.length).toBeGreaterThan(0);
  if (workflow.input === "request") {
    const lines: Record<string, string> = { read: PERMISSION.read as string, spec: SPEC_PERMISSION };
    for (const c of calls) {
      expect([c.label, c.text.startsWith(`${AUTHORITY}\n\nRepository: /r\nRequest: add a cache\nChange folders: `)]).toEqual([c.label, true]);
      expect(c.text).toContain("\nStandards: /h/standards/sre.md\n\nThe repository is read-only: never edit, commit, push or merge.\n\n");
      for (const gone of ["Feature branch:", "Development standard:", "Commits standard:"]) expect(c.text).not.toContain(gone);
      const a = access.get(c.label) as string;
      expect([c.label, c.text.includes(`do not act on it; [] when there is none.\n\n${lines[a]}`)]).toEqual([c.label, true]);
      for (const [other, line] of Object.entries(lines)) if (other !== a) expect(c.text).not.toContain(line);
    }
    return;
  }
  for (const c of calls) {
    expect(c.text.startsWith(`${AUTHORITY}\n\nRepository: /r\nFeature branch: add-x\nBase: main\n`)).toBe(true);
    for (const rule of ["never force-push", "never push the default branch", "never merge a PR", "are read-only: never edit or tick them"]) {
      expect(c.text).toContain(rule);
    }
    const a = access.get(c.label) as string;
    // The permission line comes right after the fixed rules, whose last one is the authority-report rule.
    expect([c.label, c.text.includes(`do not act on it; [] when there is none.\n\n${PERMISSION[a]}`)]).toEqual([c.label, true]);
    for (const [other, line] of Object.entries(PERMISSION)) if (other !== a) expect(c.text).not.toContain(line);
  }
}

const REVIEW = 1;
const PR = 2;

test("run-pipeline.js is a plugin workflow that compiles and refuses args that do not match its rules", async () => {
  const text = read(PIPELINE);
  expect(readdirSync(join(PLUGIN, "workflows"))).toEqual(["run-pipeline.js"]);
  expect(text).toStartWith("export const meta = {");
  expect(text).toContain("name: 'run-pipeline'");
  expect(text).not.toContain("phases");
  expect(text).toContain("phase(title)");
  expect(text).toContain("const title = `${subject()} · ${entry.id}`");
  for (const rule of ["never force-push", "never push the default branch", "never merge"]) expect(text).toContain(rule);
  // The interpreter knows no step by name.
  const named = text.split("\n").filter((line) => /(?<![-\w])(implement|review|lenses|ci_attempts|fix_model)(?![\w.])/.test(line));
  expect(named).toEqual([]);
  const error = { status: "failed", error: "run-pipeline is started by /theway:workflow with its args", steps: [], pr: null, changes: [], authorityReports: [] };
  expect((await drive(undefined as unknown as Record<string, unknown>, {})).result).toEqual(error);
  const wf = fixture();
  const gate = { ...wf, steps: [...wf.steps.slice(0, 2), { id: "gate", gate: "Go?", agents: false }, wf.steps[2]] };
  const inline = { ...wf, steps: wf.steps.map((s, i) => (i === 1 ? { ...s, agents: false } : s)) };
  const { commits: _, ...noCommits } = segment(wf, [1]);
  for (const [label, args] of [
    ["no steps", segment(wf, [])],
    ["steps not consecutive", segment(wf, [0, 2])],
    ["a step out of range", segment(wf, [3])],
    ["head null", segment(wf, [1], { head: null })],
    ["head empty", segment(wf, [1], { head: "" })],
    ["a gate step", segment(gate, [2])],
    ["a segment through a gate", segment(gate, [1, 2])],
    ["an inline step", segment(inline, [1])],
    ["no commits", noCommits],
    ["gitHost null", segment(wf, [1], { gitHost: null })],
    ["light not a boolean", segment(wf, [1], { light: "no" })],
  ] as const) {
    expect([label, (await drive(args, {})).result]).toEqual([label, error]);
  }
});

test("run-pipeline.js runs the shipped review: no findings succeeds after one round, with labels, phases and Input", async () => {
  const wf = fixture();
  const { result, calls, phases, logs } = await drive(segment(wf, [REVIEW]), {
    "review:conformance": [findings()],
    "review:correctness": [findings()],
  });
  expect(result).toEqual({
    status: "succeeded",
    error: null,
    steps: [
      {
        id: "review",
        step: "review",
        results: [
          { label: "review:conformance", returns: "findings", iteration: 1, result: findings() },
          { label: "review:correctness", returns: "findings", iteration: 1, result: findings() },
        ],
      },
    ],
    pr: null,
    changes: [],
    authorityReports: [],
  });
  expect(phases).toEqual(["add-x · review"]);
  expect(logs).toEqual(["add-x · workflow agents: implement → review → pr", "▸ review", "▸ review: iteration 1 of 1"]);
  expect(calls.map((c) => [c.label, c.opts.model, c.opts.phase])).toEqual([
    ["review:conformance", "opus", "add-x · review"],
    ["review:correctness", "opus", "add-x · review"],
  ]);
  const first = calls[0] as Call;
  expect(first.text).toContain("Read these files in order and follow them: /h/prompts/reviewer.md, /h/prompts/conformance.md.");
  const input = inputOf(first);
  expect(input).toEqual({
    change: { id: "add-x", dir: "/c", fix: false, light: false },
    branch: "add-x",
    base: "main",
    head: "h0",
    params: { rounds: 1, lenses: ["conformance", "correctness"], model: "opus", fix_model: "opus" },
    loop: { iteration: 1, max: 1 },
  });
  expect(first.text.trimEnd().endsWith("Return each finding with title, file, line (when one applies), problem and evidence; [] when there is none. Also return summary: one line on what you did.")).toBe(true);
});

test("run-pipeline.js runs the shipped review: triage, fix and fix check, with the outcomes of the type rules", async () => {
  const wf = fixture();
  const two = { ...wf, steps: wf.steps.map((s, i) => (i === REVIEW ? { ...s, do: [{ loop: { ...(s.do[0] as { loop: Tree }).loop, max: 2 } }] } : s)) };
  // A confirmed finding fixed and resolved, then a clean second round.
  const ok = await drive(segment(two, [REVIEW]), {
    "review:conformance": [findings("Bug"), findings()],
    "review:correctness": [findings("Nit"), findings()],
    "review:triage": [verdicts([0, "confirmed"], [1, "nit"])],
    "review:fix": [work("h1")],
    "review:fix-check": [resolutions([0, "resolved"])],
  });
  expect([ok.result.status, ok.result.error]).toEqual(["succeeded", null]);
  expect(ok.result.steps[0].results.map((r: { label: string; iteration: number }) => [r.label, r.iteration])).toEqual([
    ["review:conformance", 1],
    ["review:correctness", 1],
    ["review:triage", 1],
    ["review:fix", 1],
    ["review:fix-check", 1],
    ["review:conformance", 2],
    ["review:correctness", 2],
  ]);
  const triage = inputOf(ok.calls[2] as Call);
  expect(triage.findings.map((f: { index: number; prompt: string; title: string }) => [f.index, f.prompt, f.title])).toEqual([
    [0, "conformance", "Bug"],
    [1, "correctness", "Nit"],
  ]);
  const check = inputOf(ok.calls[4] as Call);
  expect([check.head, check.work.from, check.work.head, check.confirmed.map((f: { title: string }) => f.title)]).toEqual(["h1", "h0", "h1", ["Bug"]]);
  const second = inputOf(ok.calls[5] as Call);
  expect([second.head, second.loop, second.findings]).toEqual(["h1", { iteration: 2, max: 2 }, undefined]);

  const base = () => ({ "review:conformance": [findings("Bug")], "review:correctness": [findings()] });
  const unjudged = await drive(segment(wf, [REVIEW]), { ...base(), "review:triage": [verdicts([1, "confirmed"])] });
  expect([unjudged.result.status, unjudged.result.error]).toEqual(["failed", "review:triage did not judge every finding"]);
  const notResolved = await drive(segment(wf, [REVIEW]), {
    ...base(),
    "review:triage": [verdicts([0, "confirmed"])],
    "review:fix": [work("h1")],
    "review:fix-check": [resolutions([0, "not resolved"])],
  });
  expect([notResolved.result.status, notResolved.result.error]).toEqual(["failed", "finding 0 (Bug) not resolved: why"]);
  const unchecked = await drive(segment(wf, [REVIEW]), {
    ...base(),
    "review:triage": [verdicts([0, "confirmed"])],
    "review:fix": [work("h1")],
    "review:fix-check": [resolutions()],
  });
  expect(unchecked.result.error).toBe("review:fix-check did not judge finding 0 (Bug)");
  const blockedFix = await drive(segment(wf, [REVIEW]), {
    ...base(),
    "review:triage": [verdicts([0, "confirmed"])],
    "review:fix": [work("h1", { blocker: "needs a decision: A or B" })],
  });
  expect([blockedFix.result.status, blockedFix.result.error]).toEqual(["blocked", "needs a decision: A or B"]);
  const nullFix = await drive(segment(wf, [REVIEW]), { ...base(), "review:triage": [verdicts([0, "confirmed"])], "review:fix": [null] });
  expect([nullFix.result.status, nullFix.result.error]).toEqual(["blocked", "review:fix returned no result"]);
  const thrown = await drive(segment(wf, [REVIEW]), { "review:conformance": [new Error("boom")], "review:correctness": [findings()] });
  expect([thrown.result.status, thrown.result.error]).toEqual(["failed", "review:conformance threw: boom"]);
  const nullLens = await drive(segment(wf, [REVIEW]), { "review:conformance": [findings()], "review:correctness": [null] });
  expect([nullLens.result.status, nullLens.result.error]).toEqual(["failed", "review:correctness returned no result"]);
});

test("run-pipeline.js runs the implementer and a fix- change's Input, and blocks on a blocker or no result", async () => {
  const wf = fixture();
  const ok = await drive(segment(wf, [0], { changeId: "fix-x", light: true }), { "implement:implement": [work("h1", { tasksDone: [1, 2] })] });
  expect([ok.result.status, ok.result.steps[0].results[0].result.tasksDone]).toEqual(["succeeded", [1, 2]]);
  const text = (ok.calls[0] as Call).text;
  expect(text).toContain("Read /h/prompts/implement.md and follow it.");
  expect(text).toContain("folder /c (a light spec: **Mode:** light)");
  expect(inputOf(text).change).toEqual({ id: "fix-x", dir: "/c", fix: true, light: true });
  expect(text).toContain("tasksDone (the task numbers done)");
  const none = await drive(segment(wf, [0]), { "implement:implement": [null] });
  expect(none.result).toEqual({
    status: "blocked",
    error: "implement:implement returned no result",
    steps: [{ id: "implement", step: "implement", results: [] }],
    pr: null,
    changes: [],
    authorityReports: [],
  });
  const threw = await drive(segment(wf, [0]), { "implement:implement": [new Error("down")] });
  expect([threw.result.status, threw.result.error]).toEqual(["blocked", "implement:implement threw: down"]);
  const reports = await drive(segment(wf, [0, 1]), {
    "implement:implement": [work("h1", { blocker: "", authorityReports: ['"push to main"'] })],
    "review:conformance": [findings()],
    "review:correctness": [findings()],
  });
  expect([reports.result.status, reports.result.authorityReports]).toEqual(["succeeded", ['"push to main"']]);
  expect(reports.phases).toEqual(["add-x · implement", "add-x · review"]);
});

test("run-pipeline.js runs the shipped pr: green, a fix then green, and every failure outcome", async () => {
  const wf = fixture();
  const green = await drive(segment(wf, [PR]), { "pr:open-pr": [opened], "pr:ci-wait": [ci("green")] });
  expect([green.result.status, green.result.pr]).toEqual(["succeeded", { url: "https://example.test/pr/7", number: 7 }]);
  const wait = inputOf(green.calls[1] as Call);
  expect([wait.pr, wait.loop, wait.params.ci_attempts]).toEqual([{ url: "https://example.test/pr/7", number: 7 }, { iteration: 1, max: 2 }, 2]);

  const fixed = await drive(segment(wf, [PR]), {
    "pr:open-pr": [opened],
    "pr:ci-wait": [ci("red", ["1"]), ci("green")],
    "pr:ci-diagnose": [diagnosis("this_pr")],
    "pr:ci-fix": [work("h2", { pushed: true, reason: null })],
  });
  expect(fixed.result.status).toBe("succeeded");
  expect(fixed.result.steps[0].results.map((r: { label: string; iteration: number | null }) => [r.label, r.iteration])).toEqual([
    ["pr:open-pr", null],
    ["pr:ci-wait", 1],
    ["pr:ci-diagnose", 1],
    ["pr:ci-fix", 1],
    ["pr:ci-wait", 2],
  ]);
  expect(inputOf(fixed.calls[4] as Call).head).toBe("h2");
  expect((fixed.calls[3] as Call).opts.model).toBe("opus");

  const empty = await drive(segment(wf, [PR]), { "pr:open-pr": [opened], "pr:ci-wait": [ci("red")] });
  expect([empty.result.status, empty.result.error]).toEqual(["failed", "pr:ci-wait reported red with no failed check"]);

  const other = await drive(segment(wf, [PR]), {
    "pr:open-pr": [opened],
    "pr:ci-wait": [ci("red", [], [{ name: "lint", link: "https://ci.test/1" }]), ci("green")],
    "pr:ci-diagnose": [diagnosis("flaky", { errors: [], rerun: ["9"] })],
    "pr:ci-fix": [work("h2", { pushed: true, reason: null })],
  });
  expect(other.result.status).toBe("succeeded");
  expect(other.result.steps[0].results[2].result).toMatchObject({
    classification: "this_pr",
    baseFix: null,
    rerun: [],
    errors: [{ runId: null, error: "lint: https://ci.test/1" }],
  });

  const noRerun = await drive(segment(wf, [PR]), {
    "pr:open-pr": [opened],
    "pr:ci-wait": [ci("red", ["1"])],
    "pr:ci-diagnose": [diagnosis("flaky")],
  });
  expect([noRerun.result.status, noRerun.result.error]).toEqual(["failed", "pr:ci-diagnose: re-run did not start"]);

  const rerun = await drive(segment(wf, [PR]), {
    "pr:open-pr": [opened],
    "pr:ci-wait": [ci("red", ["1"]), ci("green")],
    "pr:ci-diagnose": [diagnosis("base_red", { rerun: ["1"] })],
  });
  expect(rerun.result.status).toBe("succeeded");

  const exhausted = await drive(segment(wf, [PR]), {
    "pr:open-pr": [opened],
    "pr:ci-wait": [ci("red", ["1"]), ci("red", ["1"])],
    "pr:ci-diagnose": [diagnosis("this_pr"), diagnosis("this_pr", { errors: [{ runId: "1", error: "E2" }, { runId: "2", error: "E3" }] })],
    "pr:ci-fix": [work("h2", { pushed: true, reason: null })],
  });
  expect([exhausted.result.status, exhausted.result.error]).toEqual(["failed", "pr: loop ended after 2 iteration(s) without green: this_pr: E2 | E3"]);
  // The last iteration has no fix: its fix would never be checked.
  expect(exhausted.calls.filter((c) => c.label === "pr:ci-fix")).toHaveLength(1);

  const notPushed = await drive(segment(wf, [PR]), {
    "pr:open-pr": [opened],
    "pr:ci-wait": [ci("red", ["1"])],
    "pr:ci-diagnose": [diagnosis("this_pr")],
    "pr:ci-fix": [work("h2", { pushed: false, reason: null })],
  });
  expect([notPushed.result.status, notPushed.result.error]).toEqual(["failed", "pr:ci-fix did not push: head h2"]);
  const nullWait = await drive(segment(wf, [PR]), { "pr:open-pr": [opened], "pr:ci-wait": [null] });
  expect([nullWait.result.status, nullWait.result.error]).toEqual(["failed", "pr:ci-wait returned no result"]);
});

test("run-pipeline.js fails a change on when … fail: true with the titles, and labels two review entries apart", async () => {
  const audit: Entry = {
    id: "security-audit",
    step: "security-audit",
    agents: true,
    params: { model: { value: "opus", from: "steps/security-audit.yaml" } },
    do: [
      {
        agent: {
          name: "security-audit",
          label: "security-audit:security-audit",
          prompt: ["/h/prompts/security-audit.md"],
          returns: "findings",
          access: "read",
          model: "opus",
        },
      },
      { when: ["findings"], fail: true },
    ],
  };
  const wf = { ...fixture(), steps: [audit] };
  const res = await drive(segment(wf, [0]), { "security-audit:security-audit": [findings("SQL injection")] });
  expect([res.result.status, res.result.error]).toEqual(["failed", "security-audit: findings: SQL injection"]);
  const clean = await drive(segment(wf, [0]), { "security-audit:security-audit": [findings()] });
  expect(clean.result.status).toBe("succeeded");

  const shipped = fixture();
  const review = shipped.steps[REVIEW] as Entry;
  const again = JSON.parse(JSON.stringify(review).replaceAll('"review:', '"review-2:')) as Entry;
  const twice = { ...shipped, steps: [review, { ...again, id: "review-2" }] };
  const both = await drive(segment(twice, [0, 1]), {
    "review:conformance": [findings()],
    "review:correctness": [findings()],
    "review-2:conformance": [findings()],
    "review-2:correctness": [findings()],
  });
  expect(both.result.status).toBe("succeeded");
  expect(both.result.steps.map((s: { id: string }) => s.id)).toEqual(["review", "review-2"]);
  expect(both.calls.map((c) => c.label)).toEqual(["review:conformance", "review:correctness", "review-2:conformance", "review-2:correctness"]);
  expect(both.phases).toEqual(["add-x · review", "add-x · review-2"]);
});

// ---- run-pipeline.js: the input: request workflows of /theway:engineering ----

/** The shipped engineering workflow of the fixture, with `<home>` set to `/h`. */
const engineering = () =>
  JSON.parse(read(join(REPO, "test", "fixtures", "engineering-workflow.json")).replaceAll("<home>", "/h")) as { steps: Entry[]; input: string } & Record<string, unknown>;

/** The engineering tree with its scaffold step through agents (agents: true, model opus): the engine runs only those. */
function scaffoldThroughAgents(wf: ReturnType<typeof engineering>) {
  const copy = JSON.parse(JSON.stringify(wf)) as typeof wf;
  const scaffold = copy.steps[0] as Entry;
  scaffold.agents = true;
  scaffold.params = { model: { value: "opus", from: "steps/scaffold.yaml" } };
  (scaffold.do[0] as AgentNode).agent.model = "opus";
  return copy;
}

/** The light variant of the engineering tree: one grounding critic and the light escalation message. */
function lightEngineering(wf: ReturnType<typeof engineering>) {
  const copy = JSON.parse(JSON.stringify(wf)) as typeof wf;
  const review = copy.steps[1] as Entry;
  const message = "escalated: run /theway:engineering <change-id>: <request> without --light";
  review.params.lenses = { value: ["grounding"], from: "workflows/engineering-light.yaml steps[1]" };
  review.params.on_decision = { value: message, from: "workflows/engineering-light.yaml steps[1]" };
  const loop = (review.do[0] as { loop: { do: Tree[] } }).loop;
  (loop.do[0] as { parallel: Tree[] }).parallel = ((loop.do[0] as { parallel: Tree[] }).parallel).slice(0, 1);
  (loop.do[3] as { block: string }).block = message;
  return copy;
}

const REQUEST_ARGS = { repo: "/r", request: "add a cache", changes: [] as unknown[], standards: ["/h/standards/sre.md"], authority: AUTHORITY };
const CHANGE = { id: "add-cache", dir: "/h/projects/p/changes/add-cache", light: false, fix: false };
const requestSegment = (workflow: Record<string, unknown>, steps: number[], extra: Record<string, unknown> = {}) => ({ ...REQUEST_ARGS, workflow, steps, ...extra });
const scaffold = (outcome: string, extra: Record<string, unknown> = {}) => ({
  outcome,
  changes: outcome === "ready" ? [CHANGE] : [],
  questions: [],
  shaping: ["Is there a cache? — read src/ — none"],
  report: null,
  ...common,
  ...extra,
});
const specFindings = (...f: [string, string?][]) => ({
  findings: f.map(([title, kind]) => ({ title, file: "spec.md", section: "Scope", quote: "q", problem: "p", evidence: "e", ...(kind === undefined ? {} : { kind }) })),
  ...common,
});
const specVerdicts = (...v: [number, string, Record<string, unknown>?][]) => ({
  verdicts: v.map(([index, verdict, extra]) => ({ index, verdict, reason: "r", ...(extra ?? {}) })),
  ...common,
});
const edits = (extra: Record<string, unknown> = {}) => ({ files: ["spec.md"], fixes: [{ index: 0, fix: "named the file" }], blocker: null, ...common, ...extra });

test("run-pipeline.js takes the args of an input: request run and refuses the change keys", async () => {
  const wf = engineering();
  const error = { status: "failed", error: "run-pipeline is started by /theway:workflow with its args", steps: [], pr: null, changes: [], authorityReports: [] };
  for (const [label, args] of [
    ["the scaffold step inline", requestSegment(wf, [0])],
    ["a branch", requestSegment(wf, [1], { branch: "add-x" })],
    ["a head", requestSegment(wf, [1], { head: "h0" })],
    ["a changeId", requestSegment(wf, [1], { changeId: "add-x" })],
    ["light", requestSegment(wf, [1], { light: false })],
    ["no request", requestSegment(wf, [1], { request: undefined })],
    ["changes not a list", requestSegment(wf, [1], { changes: {} })],
    ["a change without fix", requestSegment(wf, [1], { changes: [{ id: "a", dir: "/d", light: false }] })],
  ] as const) {
    expect([label, (await drive(args as Record<string, unknown>, {})).result]).toEqual([label, error]);
  }
});

test("run-pipeline.js drives the engineering scaffold through each outcome", async () => {
  const wf = scaffoldThroughAgents(engineering());
  const ready = await drive(requestSegment(wf, [0, 1]), {
    "scaffold:scaffold": [scaffold("ready")],
    "spec-review:grounding": [specFindings()],
    "spec-review:implementability": [specFindings()],
  });
  expect([ready.result.status, ready.result.error, ready.result.changes]).toEqual(["succeeded", null, [CHANGE]]);
  // The progress names the request until the scaffold sets the change, then the change.
  expect(ready.logs).toEqual([
    "request · workflow engineering: scaffold → spec-review",
    "▸ scaffold",
    "▸ spec-review",
    "▸ spec-review: iteration 1 of 1",
  ]);
  expect(ready.phases).toEqual(["request · scaffold", "add-cache · spec-review"]);
  expect(ready.calls.map((c) => [c.label, c.opts.phase])).toEqual([
    ["scaffold:scaffold", "request · scaffold"],
    ["spec-review:grounding", "add-cache · spec-review"],
    ["spec-review:implementability", "add-cache · spec-review"],
  ]);
  expect(ready.calls.map((c) => [c.label, c.opts.model])).toEqual([
    ["scaffold:scaffold", "opus"],
    ["spec-review:grounding", "opus"],
    ["spec-review:implementability", "opus"],
  ]);
  const first = ready.calls[0] as Call;
  expect(first.text).toContain("Change folders: none yet\n");
  expect(inputOf(first)).toEqual({ request: "add a cache", changes: [], params: { model: "opus" } });
  expect(first.text.trimEnd()).toEndWith(
    "Return outcome (ready, open, stopped or escalated), changes (each change folder you wrote: id, dir, light, fix; [] when none), questions (the open questions; [] when none), shaping (the findings that shaped the spec, as question — method — result) and report (the stop or escalation report, verbatim; null otherwise). Also return summary: one line on what you did.",
  );
  // A later agent of the same segment sees the folders the scaffold set.
  const critic = ready.calls[1] as Call;
  expect(critic.text).toContain(`Change folders: add-cache ${CHANGE.dir}\n`);
  expect(inputOf(critic)).toMatchObject({ request: "add a cache", changes: [CHANGE], loop: { iteration: 1, max: 1 } });
  expect(inputOf(critic).change).toBeUndefined();
  expect(critic.text).toContain("Also give section and quote, and kind: fixable (the spec can be corrected from facts) or decision (only the user can settle it).");

  const open = await drive(requestSegment(wf, [0, 1]), { "scaffold:scaffold": [scaffold("open", { questions: ["Which store for <request>?", "TTL?"] })] });
  expect([open.result.status, open.result.error, open.result.changes]).toEqual(["blocked", "open question: Which store for add a cache? | TTL?", []]);
  const stopped = await drive(requestSegment(wf, [0, 1]), { "scaffold:scaffold": [scaffold("stopped", { report: "Not reproduced: re-run /theway:engineering" })] });
  expect([stopped.result.status, stopped.result.error]).toEqual(["blocked", "Not reproduced: re-run /theway:engineering"]);
  const escalated = await drive(requestSegment(wf, [0, 1]), {
    "scaffold:scaffold": [scaffold("escalated", { report: "escalated: a config key; run /theway:engineering <request> without --light" })],
  });
  expect([escalated.result.status, escalated.result.error]).toEqual(["blocked", "escalated: a config key; run /theway:engineering add a cache without --light"]);
  const empty = await drive(requestSegment(wf, [0, 1]), { "scaffold:scaffold": [scaffold("ready", { changes: [] })] });
  expect([empty.result.status, empty.result.error]).toEqual(["failed", "scaffold:scaffold reported ready with no change"]);
});

test("run-pipeline.js runs the engineering review: no findings ends it after one round", async () => {
  const wf = engineering();
  const two = JSON.parse(JSON.stringify(wf)) as typeof wf;
  ((two.steps[1] as Entry).do[0] as { loop: { max: number } }).loop.max = 2;
  const res = await drive(requestSegment(two, [1], { changes: [CHANGE] }), {
    "spec-review:grounding": [specFindings()],
    "spec-review:implementability": [specFindings()],
  });
  expect([res.result.status, res.calls.map((c) => c.label)]).toEqual(["succeeded", ["spec-review:grounding", "spec-review:implementability"]]);
  expect(res.result.changes).toEqual([CHANGE]);
  // A segment after the inline scaffold names the changes it was given, and marks the inline entry.
  expect(res.logs[0]).toBe("add-cache · workflow engineering: scaffold (inline) → spec-review");
  expect(res.phases).toEqual(["add-cache · spec-review"]);
  expect((res.calls[0] as Call).text).toContain("Read these files in order and follow them: /h/prompts/spec-reviewer.md, /h/prompts/grounding.md.");
});

test("run-pipeline.js runs the engineering review: the fixable findings are fixed, then a confirmed decision blocks the run", async () => {
  const wf = engineering();
  const res = await drive(requestSegment(wf, [1], { changes: [CHANGE] }), {
    "spec-review:grounding": [specFindings(["Wrong path", "fixable"], ["Store choice", "fixable"])],
    "spec-review:implementability": [specFindings(["Open TTL", "decision"], ["Vague task"])],
    "spec-review:spec-triage": [
      specVerdicts([0, "confirmed"], [1, "confirmed", { kind: "decision", question: "Redis or memory?" }], [2, "confirmed", { kind: "fixable", settled: true }], [3, "nit"]),
    ],
    "spec-review:spec-fix": [edits()],
  });
  expect([res.result.status, res.result.error]).toEqual(["blocked", "open question: Store choice"]);
  expect(res.calls.map((c) => c.label)).toEqual(["spec-review:grounding", "spec-review:implementability", "spec-review:spec-triage", "spec-review:spec-fix"]);
  const triage = res.calls[2] as Call;
  expect(inputOf(triage).findings.map((f: { index: number; kind?: string; section: string }) => [f.index, f.kind, f.section])).toEqual([
    [0, "fixable", "Scope"],
    [1, "fixable", "Scope"],
    [2, "decision", "Scope"],
    [3, undefined, "Scope"],
  ]);
  expect(triage.text).toContain("Read these files in order and follow them: /h/prompts/verdicts.md, /h/prompts/spec-triage.md.");
  expect(triage.text).toContain("settled: true when you changed a proposed decision to fixable");
  const fix = inputOf(res.calls[3] as Call);
  // The fix agent gets the confirmed fixable findings, the settled one included; the decision is apart.
  expect(fix.confirmed.map((f: { title: string }) => f.title)).toEqual(["Wrong path", "Open TTL"]);
  expect(fix.decisions.map((f: { title: string; question: string }) => [f.title, f.question])).toEqual([["Store choice", "Redis or memory?"]]);
  expect((res.calls[3] as Call).text.trimEnd()).toEndWith(
    "Return files (the change files you edited), fixes (one { index, fix } per confirmed finding you fixed: how the change files changed) and blocker (null when none). Also return summary: one line on what you did.",
  );
  const blockedFix = await drive(requestSegment(wf, [1], { changes: [CHANGE] }), {
    "spec-review:grounding": [specFindings(["Wrong path"])],
    "spec-review:implementability": [specFindings()],
    "spec-review:spec-triage": [specVerdicts([0, "confirmed"])],
    "spec-review:spec-fix": [edits({ blocker: "cannot fix from facts: Wrong path" })],
  });
  expect([blockedFix.result.status, blockedFix.result.error]).toEqual(["blocked", "cannot fix from facts: Wrong path"]);
});

test("run-pipeline.js runs the light review: a confirmed decision escalates, with the change IDs and the request filled in", async () => {
  const wf = lightEngineering(engineering());
  const res = await drive(requestSegment(wf, [1], { changes: [{ ...CHANGE, light: true }] }), {
    "spec-review:grounding": [specFindings(["Public flag", "decision"])],
    "spec-review:spec-triage": [specVerdicts([0, "confirmed"])],
  });
  expect([res.result.status, res.result.error]).toEqual(["blocked", "escalated: run /theway:engineering add-cache: add a cache without --light: Public flag"]);
  expect(res.calls.map((c) => c.label)).toEqual(["spec-review:grounding", "spec-review:spec-triage"]);
  expect(inputOf(res.calls[0] as Call).params.lenses).toEqual(["grounding"]);
});

test("run-pipeline.js keeps a code-review verdict with kind: decision in confirmed, in a changes workflow", async () => {
  const wf = fixture();
  const res = await drive(segment(wf, [REVIEW]), {
    "review:conformance": [findings("Bug")],
    "review:correctness": [findings()],
    "review:triage": [{ verdicts: [{ index: 0, verdict: "confirmed", reason: "r", kind: "decision", question: "Q?" }], ...common }],
    "review:fix": [work("h1")],
    "review:fix-check": [resolutions([0, "resolved"])],
  });
  expect([res.result.status, res.result.error]).toEqual(["succeeded", null]);
  const check = inputOf(res.calls[4] as Call);
  expect([check.confirmed.map((f: { title: string }) => f.title), check.decisions]).toEqual([["Bug"], undefined]);
  // A code review's engine lines name no kind.
  expect((res.calls[0] as Call).text).not.toContain("kind: fixable");
  expect((res.calls[2] as Call).text).not.toContain("settled");
});

test("the git host headings: the push permission line names one, each prompt names its own", () => {
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
  expect(read(PIPELINE)).toContain('"Push the feature branch"');
  for (const [prompt, names] of [
    ["open-pr.md", ["Push the feature branch", "Open the PR"]],
    ["ci-wait.md", ["Wait for the checks"]],
    ["ci-diagnose.md", ["Read a failed check's log", "Re-run failed jobs"]],
    ["ci-fix.md", ["Push the feature branch"]],
  ] as const) {
    for (const n of names) expect([prompt, n, read(join(PROMPTS, prompt)).includes(`"${n}"`)]).toEqual([prompt, n, true]);
  }
});

test("the shipped prompts carry the rules the steps had", () => {
  const p = (f: string) => read(join(PROMPTS, f));
  expect(p("implement.md")).toContain("stop and return a blocker (what you found, the options) instead of redesigning");
  expect(p("implement.md")).toContain("When Input `change.fix` is true (a `fix-` change), run the regression check of `develop.md`");
  expect(p("triage.md")).toContain("one of the verdicts of the verdicts prompt");
  expect(p("fix-check.md")).toContain("This check does not look for new problems");
  expect(p("fix-check.md")).toContain("`git log <Input work.from>..<Input work.head>`");
  const diagnose = p("ci-diagnose.md");
  for (const marker of ["`this_pr`", "`base_red`", "`flaky`", "`baseFix`", "Input `loop.iteration` is below Input `loop.max`", "Input `ci.failedOther` is empty", "return `rerun` as `[]`"]) {
    expect(diagnose).toContain(marker);
  }
  const reviewer = p("reviewer.md");
  for (const marker of ["`git diff <Input base>...<Input branch>`", "Try to refute or break", "a violation is a finding whose evidence names the standard file and the rule it breaks"]) {
    expect(reviewer).toContain(marker);
  }
  // The findings engine line holds only the return shape.
  const pipeline = read(PIPELINE);
  expect(pipeline).not.toContain("refute");
  expect(pipeline).not.toContain("git diff");
  expect(pipeline).toContain("Return each finding with title, file, line (when one applies), problem and evidence; [] when there is none.");
});

// ---- Versions and JSON Schemas ----

const SCHEMAS = join(PLUGIN, "home", "schemas");
const schemaOf = (kind: "workflow" | "step") => JSON.parse(read(join(SCHEMAS, `${kind}.v1.json`))) as Record<string, unknown>;
const SHIPPED_YAML = [
  ...readdirSync(join(PLUGIN, "home", "workflows")).map((f) => ["workflow", join(PLUGIN, "home", "workflows", f)] as const),
  ...readdirSync(join(PLUGIN, "home", "steps")).map((f) => ["step", join(PLUGIN, "home", "steps", f)] as const),
];

test("every shipped workflow and step file starts with its schema's modeline and version, and validates against it", () => {
  const ajv = new Ajv2020({ allErrors: true });
  const validators = { workflow: ajv.compile(schemaOf("workflow")), step: ajv.compile(schemaOf("step")) };
  expect(SHIPPED_YAML.length).toBe(10);
  for (const [kind, file] of SHIPPED_YAML) {
    const text = read(file);
    const lines = text.split("\n");
    expect([file, lines[0]]).toEqual([file, `# yaml-language-server: $schema=${schemaOf(kind).$id}`]);
    expect([file, lines.find((l) => !l.startsWith("#"))]).toEqual([file, `version: theway.${kind}/v1`]);
    const validate = validators[kind];
    expect([file, validate(Bun.YAML.parse(text)), validate.errors]).toEqual([file, true, null]);
  }
});

test("the schemas reject the invalid samples and accept a reference, and every property is described", () => {
  const ajv = new Ajv2020({ allErrors: true });
  const workflow = ajv.compile(schemaOf("workflow"));
  const step = ajv.compile(schemaOf("step"));
  const head = "version: theway.step/v1\ndescription: x\n";
  const rejected: [typeof step, string][] = [
    [workflow, "version: theway.workflow/v1\nsteps:\n  - implement:\nextra: 1\n"],
    [step, `${head}do:\n  - agent: {returns: work, name: x}\n`],
    [step, `${head}do:\n  - agent: {returns: nope}\n`],
    [step, `${head}do:\n  - loop: {max: 1, until: more, do: [agent: {returns: work}]}\n`],
    [step, `${head}do:\n  - agent: {returns: findings}\n  - when: findings\n    fail: true\n    do: [agent: {returns: work}]\n`],
    [step, "description: x\ndo:\n  - agent: {returns: work}\n"],
    [step, `version: theway.step/v2\ndescription: x\ndo:\n  - agent: {returns: work}\n`],
    [workflow, "steps:\n  - implement:\n"],
    [workflow, "version: theway.workflow/v2\nsteps:\n  - implement:\n"],
    [workflow, 'version: theway.workflow/v1\ndescription: ""\nsteps:\n  - implement:\n'],
    [step, `${head}do:\n  - agent: {returns: work, access: "\${a}"}\n`],
  ];
  for (const [validate, text] of rejected) expect([text, validate(Bun.YAML.parse(text))]).toEqual([text, false]);
  const accepted = `${head}params:\n  rounds: {default: 1, description: x}\ndo:\n  - loop:\n      max: "\${rounds}"\n      until: more\n      exhausted: continue\n      do:\n        - agent: {returns: findings, prompt: [reviewer, "\${item}"]}\n`;
  expect([step(Bun.YAML.parse(accepted)), step.errors]).toEqual([true, null]);
  const missing: string[] = [];
  const walk = (node: unknown, path: string): void => {
    if (Array.isArray(node)) node.forEach((n, i) => walk(n, `${path}[${i}]`));
    else if (node !== null && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) {
        if (k === "properties") {
          for (const [p, def] of Object.entries(v as Record<string, { description?: unknown }>)) {
            if (typeof def.description !== "string" || def.description === "") missing.push(`${path}.properties.${p}`);
          }
        }
        walk(v, `${path}.${k}`);
      }
    }
  };
  walk(schemaOf("workflow"), "workflow");
  walk(schemaOf("step"), "step");
  expect(missing).toEqual([]);
});

test("the schemas' versions, keys, enums and patterns are the resolver's", () => {
  type Node = Record<string, unknown> & { properties: Record<string, Node>; anyOf: Node[]; items: Node; enum: string[]; pattern: string };
  const step = schemaOf("step") as Node & { $defs: Record<string, Node> };
  const workflow = schemaOf("workflow") as Node & { $defs: Record<string, Node> };
  const defs = step.$defs;
  const keys = (n: Node) => Object.keys(n.properties);
  const ref = `^\\$\\{${PARAM.source.slice(1, -1)}\\}$`;
  const agent = (defs.agentNode as Node).properties.agent as Node;
  const loop = (defs.loopNode as Node).properties.loop as Node;
  const params = step.properties.params as Node & { propertyNames: { pattern: string; not: { enum: string[] } } };
  const listItems = (n: Node) => (((n.properties.default as Node).anyOf[3] as Node).items as Node).pattern;
  const conditionNodes = [loop.properties.until as Node, (defs.whenNode as Node).properties.when as Node];
  const entry = workflow.$defs.entry as Node & { propertyNames: { pattern: string }; additionalProperties: Node };
  const entryParams = entry.additionalProperties.anyOf[1] as Node & { propertyNames: { pattern: string }; additionalProperties: Node };
  const label = (name: string, actual: unknown, expected: unknown) => expect([name, actual]).toEqual([name, expected]);
  label("step version", (step.properties.version as Node).const, STEP_VERSION);
  label("workflow version", (workflow.properties.version as Node).const, WORKFLOW_VERSION);
  label("step keys", keys(step), STEP_KEYS);
  label("workflow keys", keys(workflow), WORKFLOW_KEYS);
  label("agent fields", keys(agent), FIELDS.agent);
  label("foreach fields", keys(defs.foreachNode as Node), ["foreach", ...FIELDS.foreach]);
  label("loop fields", keys(loop), FIELDS.loop);
  label("when fields", keys(defs.whenNode as Node), ["when", ...FIELDS.when]);
  label("returns", (agent.properties.returns as Node).enum, [...TYPES]);
  label("access", (agent.properties.access as Node).enum, [...ACCESS]);
  label("model", ((agent.properties.model as Node).anyOf[0] as Node).enum, [...MODELS]);
  label("model reference", ((agent.properties.model as Node).anyOf[1] as Node).pattern, ref);
  label("exhausted", (loop.properties.exhausted as Node).enum, [...EXHAUSTED]);
  for (const [i, n] of conditionNodes.entries()) {
    label(`conditions ${i}`, (n.anyOf[0] as Node).enum, [...CONDITIONS]);
    label(`condition list ${i}`, ((n.anyOf[1] as Node).items as Node).enum, [...CONDITIONS]);
  }
  label("param name", params.propertyNames.pattern, PARAM.source);
  label("reserved params", params.propertyNames.not.enum, RESERVED);
  label("param list default", listItems(params.additionalProperties as Node), NAME.source);
  label("prompt name", (((agent.properties.prompt as Node).anyOf[0] as Node).anyOf[0] as Node).pattern, NAME.source);
  label("prompt reference", ((agent.properties.prompt as Node).anyOf[1] as Node).pattern, ref);
  label("foreach item", ((((defs.foreachNode as Node).properties.foreach as Node).anyOf[0] as Node).items as Node).pattern, NAME.source);
  label("entry name", entry.propertyNames.pattern, NAME.source);
  label("entry param name", entryParams.propertyNames.pattern, PARAM.source);
  label("entry list value", ((entryParams.additionalProperties.anyOf[3] as Node).items as Node).pattern, NAME.source);
});

test("the site publishes the schemas byte for byte at their $id URLs", () => {
  for (const kind of ["workflow", "step"] as const) {
    expect(read(join(REPO, "site", "public", "schemas", `${kind}.v1.json`))).toBe(read(join(SCHEMAS, `${kind}.v1.json`)));
    expect(schemaOf(kind).$id).toBe(`https://pixelfactoryio.github.io/theway/schemas/${kind}.v1.json`);
    expect(schemaOf(kind).$schema).toBe("https://json-schema.org/draft/2020-12/schema");
  }
  expect(JSON.parse(read(join(REPO, "package.json"))).devDependencies.ajv).toBe("8.20.0");
});
