import { afterAll, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Overlay } from "../src/core/io";
import { resolveWorkflowFile } from "../src/core/language";
import { lineOf, lineOfMessage } from "../src/dashboard/client/editor/lines";
import { fileHref, versionsHref } from "../src/dashboard/client/lib/api";
import { ALL_PROJECTS } from "../src/dashboard/client/lib/changes";
import {
  cardLabel,
  cardTitle,
  clampPanel,
  effectiveRunsOn,
  groupErrors,
  marksOf,
  matrixText,
  newWorkflowItem,
  onFailLabel,
  runsOnText,
  splitErrorLine,
  workflowRows,
} from "../src/dashboard/client/lib/workflows";
import type { WorkflowItem } from "../src/dashboard/types";

const SHIPPED_HOME = join(import.meta.dirname, "..", "plugin", "home");
const AGENTS = readFileSync(join(SHIPPED_HOME, "workflows", "agents.yaml"), "utf-8");

/** A home holding the shipped workflows and prompts, and a project `p`. */
const HOME = (() => {
  const dir = mkdtempSync(join(tmpdir(), "theway-workflows-"));
  for (const folder of ["workflows", "prompts"]) cpSync(join(SHIPPED_HOME, folder), join(dir, folder), { recursive: true });
  mkdirSync(join(dir, "projects", "p"), { recursive: true });
  return dir;
})();
afterAll(() => rmSync(HOME, { recursive: true, force: true }));

/** The error lines of the global workflow `agents` written as `text`, with the prompts of `prompts`, resolved in project `p`. */
function errorsOf(text: string, prompts: Record<string, string> = {}): string[] {
  const overlay: Overlay = new Map([[join(HOME, "workflows", "agents.yaml"), text]]);
  for (const [n, t] of Object.entries(prompts)) overlay.set(join(HOME, "prompts", `${n}.md`), t);
  const r = resolveWorkflowFile(HOME, "p", "agents", {}, overlay);
  return "errors" in r ? r.errors : [];
}

/** The `where` of the one line of `lines` whose `where` starts with `prefix`. */
function whereOf(lines: string[], prefix: string): string {
  const found = lines.map((l) => splitErrorLine(l, "agents").where).filter((w) => w?.startsWith(prefix));
  expect(found.length).toBe(1);
  return found[0] as string;
}

const item = (name: string, key: string | null, extra: Partial<WorkflowItem> = {}): WorkflowItem => ({
  ...newWorkflowItem({ scope: key === null ? "global" : "project", key, name }, key, null),
  path: `/h/${name}.yaml`,
  ...extra,
});

test("the table lists the global workflows and the chosen project's, new files included, by name then global first", () => {
  const rows = [item("zed", null), item("agents", "k-b"), item("agents", null), item("mine", "k-a")];
  const fresh = [item("new", "k-a", { path: "" })];
  const names = (chosen: string) => workflowRows(rows, fresh, chosen).map((w) => `${w.scope}/${w.key ?? ""}/${w.name}`);
  expect(names(ALL_PROJECTS)).toEqual(["global//agents", "project/k-b/agents", "project/k-a/mine", "project/k-a/new", "global//zed"]);
  expect(names("k-a")).toEqual(["global//agents", "project/k-a/mine", "project/k-a/new", "global//zed"]);
  expect(names("k-c")).toEqual(["global//agents", "global//zed"]);
  expect(newWorkflowItem({ scope: "global", key: null, name: "x" }, null, "X")).toMatchObject({ steps: null, runsOn: null, errors: 0, description: "X" });
});

test("the Runs on cell names the one runs-on of every step, or counts both", () => {
  expect(runsOnText({ session: 2, agents: 0 })).toBe("session");
  expect(runsOnText({ session: 0, agents: 4 })).toBe("agents");
  expect(runsOnText({ session: 1, agents: 5 })).toBe("1 session, 5 agents");
  expect(runsOnText(null)).toBe("–");
});

test("a step card's label says where it runs and on which model, and its title names its prompt", () => {
  expect(cardLabel(effectiveRunsOn(null, "agents"), "sonnet")).toBe("agents · sonnet");
  expect(cardLabel(effectiveRunsOn("agents", "session"), "opus")).toBe("agents · opus");
  expect(cardLabel("agents", null)).toBe("agents");
  expect(cardLabel(effectiveRunsOn("session", "agents"), "opus")).toBe("session");
  expect(cardLabel(effectiveRunsOn("somewhere", "agents"), "opus")).toBe("somewhere");
  expect(cardLabel(effectiveRunsOn(null, null), "opus")).toBe("runs-on not set");
  expect(cardTitle("prompts/triage.md")).toBe("triage");
  expect(cardTitle("triage")).toBe("triage");
  expect(cardTitle("prompts/Bad Name.md")).toBe("prompts/Bad Name.md");
  expect(cardTitle("")).toBe("no prompt");
  expect(matrixText("lens", "prompts/conformance.md")).toBe("lens: conformance");
  expect(matrixText("lens", "plain")).toBe("lens: plain");
  expect([onFailLabel("2"), onFailLabel(null)]).toEqual(["on-fail · tries 2", "on-fail"]);
});

test("an error line splits into its where and its message when it is a line of the open workflow", () => {
  const own = "workflows/agents.yaml: ";
  expect(splitErrorLine(`${own}steps[3].on-fail.uses: prompts/x.md not found in /h/prompts`, "agents")).toEqual({
    own: true,
    where: "steps[3].on-fail.uses",
    message: "prompts/x.md not found in /h/prompts",
  });
  expect(splitErrorLine(`${own}inputs.change: description must be a non-empty string`, "agents")).toEqual({
    own: true,
    where: "inputs.change",
    message: "description must be a non-empty string",
  });
  expect(splitErrorLine(`${own}runs-on: must be one of agents, session`, "agents")).toEqual({ own: true, where: "runs-on", message: "must be one of agents, session" });
  const yaml = errorsOf("steps: [\n")[0] as string;
  expect(yaml.startsWith(`${own}invalid YAML: `)).toBe(true);
  expect(splitErrorLine(yaml, "agents")).toEqual({ own: true, where: null, message: yaml.slice(own.length) });
  const v1 = errorsOf("version: theway.workflow/v1\nsteps:\n  - implement:\n")[0] as string;
  expect(splitErrorLine(v1, "agents")).toEqual({ own: true, where: null, message: "theway.workflow/v1 is no longer read: rewrite it as theway.workflow/v1beta" });
  expect(splitErrorLine(`my-app: ${own}steps[0].tries: must be an integer from 1 to 10`, "agents")).toEqual({
    own: false,
    where: null,
    message: `my-app: ${own}steps[0].tries: must be an integer from 1 to 10`,
  });
  expect(splitErrorLine("workflows/other.yaml: steps[0].tries: x", "agents")).toEqual({ own: false, where: null, message: "workflows/other.yaml: steps[0].tries: x" });
});

test("error lines group under their step and key, the workflow's keys apart, and the others stay ungrouped", () => {
  const own = "workflows/agents.yaml: ";
  const lines = [
    `${own}steps[3].tries: must be an integer from 1 to 10`,
    `${own}steps[3].on-fail.with: required input change is not set`,
    `${own}steps[1]: uses is required`,
    `${own}steps[9].tries: must be an integer from 1 to 10`,
    `${own}inputs.change: description must be a non-empty string`,
    `${own}description: must be a non-empty string`,
    `${own}foo: unknown key`,
    `${own}invalid YAML: bad`,
    `my-app: ${own}steps[0].tries: must be an integer from 1 to 10`,
    "workflows/other.yaml: steps[0].tries: x",
  ];
  const g = groupErrors(lines, "agents", 6);
  expect([...g.steps.entries()]).toEqual([
    [
      3,
      [
        { key: "tries", message: "must be an integer from 1 to 10" },
        { key: "on-fail.with", message: "required input change is not set" },
      ],
    ],
    [1, [{ key: null, message: "uses is required" }]],
  ]);
  expect(g.workflow).toEqual([
    { key: "inputs", input: "change", message: "description must be a non-empty string" },
    { key: "description", input: null, message: "must be a non-empty string" },
  ]);
  expect(g.loose).toEqual([
    "steps[9].tries: must be an integer from 1 to 10",
    "foo: unknown key",
    "invalid YAML: bad",
    `my-app: ${own}steps[0].tries: must be an integer from 1 to 10`,
    "workflows/other.yaml: steps[0].tries: x",
  ]);
});

test("lineOf finds the line of a where on the shipped agents.yaml, from real error lines", () => {
  const tries = AGENTS.replace("    tries: 1\n", "    tries: 12\n");
  expect(lineOf(tries, whereOf(errorsOf(tries), "steps[3].tries"))).toBe(30);
  expect(lineOf(AGENTS, "steps[3].on-fail")).toBe(26);
  const onFail = AGENTS.replace("uses: prompts/fix-review.md", "uses: prompts/nope.md");
  expect(lineOf(onFail, whereOf(errorsOf(onFail), "steps[3].on-fail.uses"))).toBe(27);
  const input = AGENTS.replace("    description: The change to implement\n", '    description: ""\n');
  const inputLines = errorsOf(input);
  expect(inputLines).toContain("workflows/agents.yaml: inputs.change: description must be a non-empty string");
  expect(lineOf(input, whereOf(inputLines, "inputs.change"))).toBe(4);
  const description = AGENTS.replace("description: Implement, review and open the PR through agents", 'description: ""');
  expect(lineOf(description, whereOf(errorsOf(description), "description"))).toBe(2);
  expect(lineOf(AGENTS, "steps[1].matrix")).toBe(14);
  const implement = readFileSync(join(SHIPPED_HOME, "prompts", "implement.md"), "utf-8").replace("model: opus\n", "");
  expect(lineOf(AGENTS, whereOf(errorsOf(AGENTS, { implement }), "steps[1].model"))).toBe(14);
  const noRunsOn = AGENTS.replace("runs-on: agents\n", "");
  expect(lineOf(noRunsOn, whereOf(errorsOf(noRunsOn), "runs-on"))).toBeNull();
  expect(lineOf(AGENTS, "invalid YAML")).toBeNull();
  expect(lineOf("steps: [\n", "steps")).toBeNull();
  expect(lineOfMessage("invalid YAML: Unexpected flow-seq-end at line 7, column 3")).toBe(7);
  expect(lineOfMessage("must be a non-empty string")).toBeNull();
});

test("the YAML view marks each error with a line on that line, with the text it shows, in order", () => {
  const own = "workflows/agents.yaml: ";
  const lines = [
    `${own}steps[3].tries: must be an integer from 1 to 10`,
    `my-app: ${own}steps[0].tries: must be an integer from 1 to 10`,
    "workflows/other.yaml: steps[0].tries: x",
    `${own}runs-on: must be one of agents, session`,
    `${own}inputs.change: description must be a non-empty string`,
    `${own}invalid YAML: Unexpected flow-seq-end at line 7, column 3`,
  ];
  expect(marksOf(lines, "agents", AGENTS)).toEqual([
    { line: 30, message: "steps[3].tries: must be an integer from 1 to 10" },
    { line: 8, message: "runs-on: must be one of agents, session" },
    { line: 4, message: "inputs.change: description must be a non-empty string" },
    { line: 7, message: "invalid YAML: Unexpected flow-seq-end at line 7, column 3" },
  ]);
  expect(marksOf([], "agents", AGENTS)).toEqual([]);
});

test("the panel's width stays from 320 to 720 and leaves 480px of its row, the minimum winning", () => {
  expect(clampPanel(100, 1600)).toBe(320);
  expect(clampPanel(2000, 1600)).toBe(720);
  expect(clampPanel(500, 1600)).toBe(500);
  expect(clampPanel(700, 1000)).toBe(520);
  expect(clampPanel(400, 700)).toBe(320);
});

test("a workflow's page and history have no kind segment", () => {
  const agents = { scope: "global", key: null, kind: "workflows", name: "agents" } as const;
  const mine = { scope: "project", key: "k-a", kind: "workflows", name: "mine" } as const;
  expect([fileHref(agents), fileHref(mine)]).toEqual(["/workflows/global/agents", "/workflows/projects/k-a/mine"]);
  expect([versionsHref(agents), versionsHref(mine, "v1")]).toEqual(["/workflows/global/agents/history", "/workflows/projects/k-a/mine/history/v1"]);
  expect(versionsHref({ ...agents, kind: "prompts", name: "triage" }, "shipped")).toBe("/prompts/global/triage/history/shipped");
});
