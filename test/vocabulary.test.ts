import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const COMMANDS = join(ROOT, "plugin", "commands");

/** A place where a retired term is legitimate: anywhere in `file`, or only on its lines that contain `contains`. */
type Allow = { file: string; contains?: string };

/** A retired term, as a regular expression source, and the tracked path prefixes it must be absent from. */
type Entry = { term: string; flags: string; files: string[]; allow: Allow[] };

/** Every tracked file: the scope `repo`. */
const REPOSITORY = [""];
const PIPELINE = "plugin/workflows/run-pipeline.js";
const WORKFLOW = "plugin/commands/workflow.md";
const ENGINEERING = "plugin/commands/engineering.md";

/** A term matched literally. */
const literal = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Each term's literal is built by concatenation, so this file never matches itself. */
const ENTRIES: Entry[] = [
  { term: literal("theway:" + "setup"), flags: "", files: ["plugin/", "src/", "test/", "site/"], allow: [] },
  { term: literal("engineering" + "-light"), flags: "", files: REPOSITORY, allow: [] },
  {
    term: literal("develop" + "-workflow"),
    flags: "",
    files: REPOSITORY,
    // The legacy uninstall test removes the old command file.
    allow: [{ file: "test/install.test.ts" }],
  },
  {
    term: literal("/theway:" + "develop") + "([^-]|$)",
    flags: "",
    files: REPOSITORY,
    allow: [
      // Describes the old demo recording, kept until it is re-recorded.
      { file: "README.md", contains: "demo.gif" },
      // Describes the old demo recording, kept until it is re-recorded.
      { file: "site/app/(home)/page.tsx", contains: "aria-label" },
    ],
  },
  { term: literal("~/" + ".theway"), flags: "", files: ["plugin/"], allow: [] },
  {
    term: [
      literal("<home>/" + "<project>"),
      "theway (list|archive|path|config|standards|context|workflow|next-id) (<project>|" + "my-[a-z]+)",
      literal(".theway/" + "my-"),
      literal("<home>/" + "my-"),
      "my-" + "repo",
      "my-" + "site",
      "my-" + "project",
      "current directory" + " name",
    ].join("|"),
    flags: "",
    files: ["plugin/"],
    allow: [],
  },
  { term: literal("architecture" + "-principles"), flags: "", files: ["plugin/"], allow: [] },
  {
    term: literal("interaction" + ".default.md"),
    flags: "",
    files: ["plugin/commands/", "plugin/home/standards/"],
    allow: [],
  },
  {
    term: literal("user " + "standard"),
    flags: "",
    files: ["plugin/commands/", "plugin/home/standards/develop.md"],
    allow: [],
  },
  {
    term: ["core-principles", "sre", "web-development", "quality"].map((n) => literal("<home>/" + "standards/" + n + ".md")).join("|"),
    flags: "",
    files: [ENGINEERING, "plugin/commands/document.md"],
    allow: [],
  },
  { term: literal("<home>/" + "config.yaml"), flags: "", files: ["plugin/commands/"], allow: [] },
  { term: "\\bworkflow" + "\\.[a-z_]", flags: "", files: [WORKFLOW], allow: [] },
  {
    term: [
      literal("workflow." + "review_rounds"),
      "open" + "_pr",
      literal("workflow." + "models"),
      literal("engineering." + "review_rounds"),
      literal("models." + "critic"),
    ].join("|"),
    flags: "",
    files: REPOSITORY,
    // The removed-key warning tests name the keys they warn about.
    allow: [{ file: "test/core.test.ts" }],
  },
  { term: "Esti" + "mated|Target " + "Completion", flags: "", files: ["plugin/home/templates/"], allow: [] },
  {
    term: [literal("changes/" + "archive/*-"), literal("validate-id <change-id> " + "--series"), literal("min" + "(")].join("|"),
    flags: "",
    files: [ENGINEERING],
    allow: [],
  },
  {
    term: [literal("min" + "("), literal("light `" + "fix-`"), literal("phases" + ":")].join("|"),
    flags: "",
    files: [PIPELINE],
    allow: [],
  },
  {
    term: [
      literal("--" + "admin"),
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
    term: literal("lenses" + "/") + "|" + literal("workflow.defaults." + "agent"),
    flags: "",
    files: ["site/content/", "README.md", "SECURITY.md", "plugin/"],
    allow: [],
  },
  {
    term: literal("ai-" + "marketplace") + "|" + literal("github:" + "pixelfactoryio"),
    flags: "",
    files: ["README.md", "plugin/commands/"],
    allow: [],
  },
];

/** Never swept: the release history, and this file. */
const EXCLUDED = ["CHANGELOG.md", "test/vocabulary.test.ts"];

const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf-8" })
  .split("\n")
  .filter((f) => f && !EXCLUDED.includes(f) && existsSync(join(ROOT, f)));

const lines = new Map<string, string[]>();
const linesOf = (file: string) => {
  let text = lines.get(file);
  if (!text) {
    text = readFileSync(join(ROOT, file), "utf-8").split("\n");
    lines.set(file, text);
  }
  return text;
};

/** The `file:line` hits of an entry outside its allow-list. */
function hits({ term, flags, files, allow }: Entry): string[] {
  const re = new RegExp(term, flags);
  return tracked
    .filter((f) => files.some((prefix) => f.startsWith(prefix)))
    .flatMap((f) =>
      linesOf(f).flatMap((line, i) => {
        if (!re.test(line)) return [];
        if (allow.some((a) => a.file === f && (a.contains === undefined || line.includes(a.contains)))) return [];
        return [`${f}:${i + 1}`];
      }),
    );
}

test("the sweep reads the tracked files", () => {
  expect(tracked).toContain("plugin/commands/workflow.md");
  expect(tracked).toContain("test/lint.test.ts");
});

for (const entry of ENTRIES) {
  test(`no retired term /${entry.term}/ in ${entry.files.map((f) => f || "the repository").join(", ")}`, () => {
    expect(hits(entry)).toEqual([]);
  });
}

test("the retired command files are gone", () => {
  expect(existsSync(join(COMMANDS, "engineering" + "-light.md"))).toBe(false);
  expect(existsSync(join(COMMANDS, "develop" + "-workflow.md"))).toBe(false);
  expect(existsSync(join(COMMANDS, "develop.md"))).toBe(false);
});
