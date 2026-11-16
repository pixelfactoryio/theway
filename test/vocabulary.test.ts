import { expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { escapeRegExp } from "./helpers"

const ROOT = join(import.meta.dirname, "..")
const COMMANDS = join(ROOT, "plugin", "commands")

/** A place where a retired term is legitimate: anywhere in `file`, or only on its lines that contain `contains`. */
type Allow = { file: string; contains?: string }

/** A retired term, as a regular expression source, and the tracked path prefixes it must be absent from. */
type Entry = { term: string; flags: string; files: string[]; allow: Allow[] }

/** Every tracked file: the scope `repo`. */
const REPOSITORY = [""]
const PIPELINE = "plugin/workflows/run-pipeline.js"
const WORKFLOW = "plugin/commands/workflow.md"
const ENGINEERING = "plugin/commands/engineering.md"

/** Each term's literal is built by concatenation, so this file never matches itself. */
const ENTRIES: Entry[] = [
  { term: escapeRegExp("theway:" + "setup"), flags: "", files: ["plugin/", "src/", "test/", "site/"], allow: [] },
  {
    // Engineering is a workflow: its standards and templates moved to prompts/.
    term: [
      escapeRegExp("engineering." + "review"),
      escapeRegExp("standards/" + "spec-review.md"),
      escapeRegExp("standards/" + "spec-investigation.md"),
      escapeRegExp("standards/" + "tamm-framework.md"),
      escapeRegExp("templates/" + "spec-template.md"),
    ].join("|"),
    flags: "",
    files: REPOSITORY,
    allow: [
      // The install retires the moved files by name, and its tests check it.
      { file: "src/core/init.ts" },
      { file: "test/install.test.ts" },
      { file: "test/lint.test.ts" },
    ],
  },
  {
    term: escapeRegExp("develop" + "-workflow"),
    flags: "",
    files: REPOSITORY,
    // The legacy uninstall test removes the old command file.
    allow: [{ file: "test/install.test.ts" }],
  },
  {
    term: escapeRegExp("/theway:" + "develop") + "([^-]|$)",
    flags: "",
    files: REPOSITORY,
    allow: [
      // Describes the old demo recording, kept until it is re-recorded.
      { file: "README.md", contains: "demo.gif" },
      // Describes the old demo recording, kept until it is re-recorded.
      { file: "site/app/(home)/page.tsx", contains: "aria-label" },
    ],
  },
  { term: escapeRegExp("~/" + ".theway"), flags: "", files: ["plugin/"], allow: [] },
  {
    term: [
      escapeRegExp("<home>/" + "<project>"),
      "theway (list|archive|path|config|standards|context|workflow|next-id) (<project>|" + "my-[a-z]+)",
      escapeRegExp(".theway/" + "my-"),
      escapeRegExp("<home>/" + "my-"),
      "my-" + "repo",
      "my-" + "site",
      "my-" + "project",
      "current directory" + " name",
    ].join("|"),
    flags: "",
    files: ["plugin/"],
    allow: [],
  },
  { term: escapeRegExp("architecture" + "-principles"), flags: "", files: ["plugin/"], allow: [] },
  {
    term: escapeRegExp("interaction" + ".default.md"),
    flags: "",
    files: ["plugin/commands/", "plugin/home/standards/"],
    allow: [],
  },
  {
    term: escapeRegExp("user " + "standard"),
    flags: "",
    files: ["plugin/commands/", "plugin/home/standards/develop.md"],
    allow: [],
  },
  {
    term: ["core-principles", "sre", "web-development", "quality"]
      .map((n) => escapeRegExp("<home>/" + "standards/" + n + ".md"))
      .join("|"),
    flags: "",
    files: [ENGINEERING, "plugin/commands/document.md"],
    allow: [],
  },
  { term: escapeRegExp("<home>/" + "config.yaml"), flags: "", files: ["plugin/commands/"], allow: [] },
  { term: "\\bworkflow" + "\\.[a-z_]", flags: "", files: [WORKFLOW], allow: [] },
  {
    term: [
      escapeRegExp("workflow." + "review_rounds"),
      "open" + "_pr",
      escapeRegExp("workflow." + "models"),
      escapeRegExp("engineering." + "review_rounds"),
      escapeRegExp("models." + "critic"),
    ].join("|"),
    flags: "",
    files: REPOSITORY,
    // The removed-key warning tests name the keys they warn about.
    allow: [{ file: "test/core.test.ts" }],
  },
  { term: "Esti" + "mated|Target " + "Completion", flags: "", files: ["plugin/home/templates/"], allow: [] },
  {
    term: [
      escapeRegExp("changes/" + "archive/*-"),
      escapeRegExp("validate-id <change-id> " + "--series"),
      escapeRegExp("min" + "("),
    ].join("|"),
    flags: "",
    files: [ENGINEERING],
    allow: [],
  },
  {
    term: [escapeRegExp("min" + "("), escapeRegExp("light `" + "fix-`"), escapeRegExp("phases" + ":")].join("|"),
    flags: "",
    files: [PIPELINE],
    allow: [],
  },
  {
    term: [
      escapeRegExp("--" + "admin"),
      "(^|[^a-z])" + "gh ",
      "git " + "push",
      "--" + "squash",
      "ori" + "gin",
      "Conven" + "tional",
      "'fe" + "at'",
      "commit" + "Type",
      "main " + "branch",
      "sync " + "main",
    ].join("|"),
    flags: "",
    files: [PIPELINE, WORKFLOW],
    allow: [],
  },
  {
    // Review lenses are prompts now, and a one-off agent is a step file.
    term: escapeRegExp("lenses" + "/") + "|" + escapeRegExp("workflow.defaults." + "agent"),
    flags: "",
    files: ["site/content/", "README.md", "SECURITY.md", "plugin/"],
    allow: [],
  },
  {
    // v1 is removed: no step file, and no condition of a typed result.
    term: [
      escapeRegExp("theway.step" + "/v1"),
      escapeRegExp("no-" + "confirmed"),
      escapeRegExp("no-" + "findings"),
      escapeRegExp("no-" + "decision"),
    ].join("|"),
    flags: "",
    files: REPOSITORY,
    allow: [
      // The home installed from the previous layout holds v1 step files.
      { file: "test/install.test.ts" },
      // Its "Moving from v1" section says what replaces each term.
      { file: "site/content/docs/concepts/workflows.mdx" },
    ],
  },
  {
    term: escapeRegExp("ai-" + "marketplace") + "|" + escapeRegExp("github:" + "pixelfactoryio"),
    flags: "",
    files: ["README.md", "plugin/commands/"],
    allow: [],
  },
]

/** Never swept: the release history, and this file. */
const EXCLUDED = ["CHANGELOG.md", "test/vocabulary.test.ts"]

const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf-8" })
  .split("\n")
  .filter((f) => f && !EXCLUDED.includes(f) && existsSync(join(ROOT, f)))

const lines = new Map<string, string[]>()
const linesOf = (file: string) => {
  let text = lines.get(file)
  if (!text) {
    text = readFileSync(join(ROOT, file), "utf-8").split("\n")
    lines.set(file, text)
  }
  return text
}

/** The `file:line` hits of an entry outside its allow-list. */
function hits({ term, flags, files, allow }: Entry): string[] {
  const re = new RegExp(term, flags)
  return tracked
    .filter((f) => files.some((prefix) => f.startsWith(prefix)))
    .flatMap((f) =>
      linesOf(f).flatMap((line, i) => {
        if (!re.test(line)) return []
        if (allow.some((a) => a.file === f && (a.contains === undefined || line.includes(a.contains)))) return []
        return [`${f}:${i + 1}`]
      }),
    )
}

test("the sweep reads the tracked files", () => {
  expect(tracked).toContain("plugin/commands/workflow.md")
  expect(tracked).toContain("test/lint.test.ts")
})

for (const entry of ENTRIES) {
  test(`no retired term /${entry.term}/ in ${entry.files.map((f) => f || "the repository").join(", ")}`, () => {
    expect(hits(entry)).toEqual([])
  })
}

test("the retired command files are gone", () => {
  expect(existsSync(join(COMMANDS, "engineering" + "-light.md"))).toBe(false)
  expect(existsSync(join(COMMANDS, "develop" + "-workflow.md"))).toBe(false)
  expect(existsSync(join(COMMANDS, "develop.md"))).toBe(false)
})
