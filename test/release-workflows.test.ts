import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

const WORKFLOWS = join(import.meta.dirname, "..", ".github", "workflows");
const CLAUDE_CODE_INSTALL = "bun install -g @anthropic-ai/claude-code@2.1.325";

type Step = { name?: string; run?: string };
type Job = { needs?: string | string[]; if?: string; steps?: Step[] };
type Workflow = { permissions?: unknown; jobs: Record<string, Job> };

const load = (file: string) => parse(readFileSync(join(WORKFLOWS, file), "utf-8")) as Workflow;
const theway = load("theway.yml");
const release = load("release-please.yml");

/** The run lines of a job's steps that mention the Claude Code package. */
const claudeCodeLines = (job: Job) =>
  (job.steps ?? []).flatMap((s) => (s.run ?? "").split("\n").map((l) => l.trim())).filter((l) => l.includes("@anthropic-ai/claude-code"));

test("theway.yml keeps the required check job id test", () => {
  expect(theway.jobs.test).toBeDefined();
});

test("release-please.yml's checks job runs exactly theway.yml's test steps", () => {
  expect(release.jobs.checks.steps).toEqual(theway.jobs.test.steps);
});

test("checks runs only on a release and publish needs it", () => {
  expect(release.jobs.checks.needs).toBe("release-please");
  expect(release.jobs.checks.if).toBe(release.jobs.publish.if);
  expect(release.jobs.publish.needs).toEqual(["release-please", "checks"]);
});

test("theway.yml grants its token read-only contents", () => {
  expect(theway.permissions).toEqual({ contents: "read" });
});

test("both workflows install a pinned Claude Code", () => {
  for (const job of [theway.jobs.test, release.jobs.checks]) {
    expect(claudeCodeLines(job)).toEqual([CLAUDE_CODE_INSTALL]);
  }
  const unpinned = [theway, release].flatMap((w) =>
    Object.values(w.jobs).flatMap((j) => claudeCodeLines(j).filter((l) => !/@anthropic-ai\/claude-code@\S+/.test(l))),
  );
  expect(unpinned).toEqual([]);
});
