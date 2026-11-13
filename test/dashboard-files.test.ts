import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createApp } from "../src/dashboard/server";

const TOKEN = "ab".repeat(32);
const KEY = "-p";
const temps: string[] = [];

afterEach(() => {
  for (const d of temps.splice(0)) {
    try {
      chmodSync(d, 0o755);
    } catch {
      // Already gone.
    }
    rmSync(d, { recursive: true, force: true });
  }
});

function put(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

const IMPLEMENT = `---
description: Implement the change
model: opus
inputs:
  change:
    description: The change
    required: true
  mode:
    description: How
    default: fast
---

Do \${{ inputs.change }}
`;

const REVIEW = "---\ndescription: Review it\n---\nReview.\n";

const AGENTS = `version: theway.workflow/v1beta
description: Implement then review
runs-on: agents
inputs:
  change:
    description: The change
    required: true
steps:
  - uses: prompts/implement.md
    with:
      change: \${{ inputs.change }}
  - uses: prompts/review.md
    runs-on: session
`;

/** A temporary home with one project (`-p`), two global prompts and the global workflow `agents`. */
function home(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "theway-files-")));
  temps.push(dir);
  mkdirSync(join(dir, "projects", KEY, "changes"), { recursive: true });
  put(join(dir, "prompts", "implement.md"), IMPLEMENT);
  put(join(dir, "prompts", "review.md"), REVIEW);
  put(join(dir, "workflows", "agents.yaml"), AGENTS);
  return dir;
}

const app = (h: string) => createApp(h, () => 4870, "", TOKEN);
async function get(h: string, path: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await app(h).request(`http://127.0.0.1:4870${path}`, { headers: { Host: "127.0.0.1:4870" } });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

type Row = Record<string, unknown>;
const sha = (text: string): string => createHash("sha256").update(text).digest("hex");

test("GET /api/workflows lists the global files and each project's own, a global file first, with steps and runs-on", async () => {
  const h = home();
  put(join(h, "projects", KEY, "workflows", "agents.yaml"), AGENTS.replace("Implement then review", "Own agents").replace("    runs-on: session\n", "    model: opus\n"));
  put(join(h, "workflows", "broken.yaml"), "version: theway.workflow/v1beta\ndescription: Broken\nruns-on: agents\nsteps:\n  - uses: prompts/missing.md\n");
  const { status, body } = await get(h, "/api/workflows");
  expect(status).toBe(200);
  expect(body.folder).toBe(join(h, "workflows"));
  expect(body.workflows).toEqual([
    { name: "agents", project: null, description: "Implement then review", default: false, steps: 2, runsOn: "mixed", errors: [] },
    { name: "agents", project: KEY, description: "Own agents", default: false, steps: 2, runsOn: "agents", errors: [] },
    {
      name: "broken",
      project: null,
      description: "Broken",
      default: false,
      steps: null,
      runsOn: null,
      errors: [`steps[0].uses: prompts/missing.md not found in ${join(h, "prompts")}`],
    },
  ]);
});

test("a global file is read with the global folders only, a project's file as its project resolves it", async () => {
  const h = home();
  // The project's own review prompt has a header error; the global workflow does not see it.
  put(join(h, "projects", KEY, "prompts", "review.md"), "---\ndescription: Own review\nmodel: gpt\n---\nReview.\n");
  put(join(h, "projects", KEY, "workflows", "agents.yaml"), AGENTS);
  const global = await get(h, "/api/workflows/global/agents");
  expect(global.status).toBe(200);
  expect(global.body).toEqual({ name: "agents", project: null, path: "workflows/agents.yaml", text: AGENTS, version: sha(AGENTS), errors: [] });
  const mine = await get(h, `/api/workflows/projects/${KEY}/agents`);
  expect(mine.status).toBe(200);
  expect(mine.body).toMatchObject({ project: KEY, path: `projects/${KEY}/workflows/agents.yaml` });
  // Another file's lines keep their prefix and have no line.
  expect(mine.body.errors).toEqual([{ text: "prompts/review.md: model: must be one of opus, sonnet, haiku", line: null }]);
});

test("a workflow's lines take their path's line, the nearest present ancestor's, or the YAML error's", async () => {
  const h = home();
  put(
    join(h, "workflows", "bad.yaml"),
    [
      "version: theway.workflow/v1beta",
      "description: Bad",
      "runs-on: agents",
      "steps:",
      "  - uses: prompts/review.md",
      "    tries: 99",
      "    on-fail: prompts/implement.md",
      "  - with:",
      "      x: y",
      "",
    ].join("\n"),
  );
  put(join(h, "workflows", "unparsed.yaml"), "version: theway.workflow/v1beta\ndescription: x\nsteps: [\n  - a\n");
  put(join(h, "workflows", "old.yaml"), "version: nope\n");
  const bad = await get(h, "/api/workflows/global/bad");
  expect(bad.body.errors).toEqual([
    { text: "steps[0].tries: must be an integer from 1 to 10", line: 6 },
    // `with` is absent from the on-fail: the line of `on-fail`.
    { text: "steps[0].on-fail.with: required input change is not set", line: 7 },
    // `model` is absent from the step: the line of its `-`.
    { text: "steps[0].model: the step runs on agents and has no model; set model on the step or in prompts/review.md", line: 5 },
    { text: "steps[1]: uses is required", line: 8 },
  ]);

  const unparsed = await get(h, "/api/workflows/global/unparsed");
  const lines = unparsed.body.errors as { text: string; line: number | null }[];
  expect(lines.length).toBe(1);
  expect(lines[0]?.text.startsWith("invalid YAML")).toBe(true);
  expect(typeof lines[0]?.line).toBe("number");

  const old = await get(h, "/api/workflows/global/old");
  expect(old.body.errors).toEqual([{ text: "version: must be theway.workflow/v1beta", line: null }]);
  // A root key absent from the file: no line.
  put(join(h, "workflows", "bare.yaml"), "version: theway.workflow/v1beta\nruns-on: agents\nsteps:\n  - uses: prompts/review.md\n    model: opus\n");
  const bare = await get(h, "/api/workflows/global/bare");
  expect(bare.body.errors).toEqual([{ text: "description: must be a non-empty string", line: null }]);
});

test("GET /api/prompts gives the header, the deduplicated lines and the uses; a reference file has no header", async () => {
  const h = home();
  put(join(h, "prompts", "bad.md"), "---\ndescription: Bad\nmodel: gpt\ninputs:\n  x:\n    required: true\n---\nBody\n");
  put(join(h, "prompts", "notes.md"), "# Notes\n\nSee prompts/implement.md.\n");
  put(
    join(h, "workflows", "uses.yaml"),
    [
      "version: theway.workflow/v1beta",
      "description: Uses",
      "runs-on: session",
      "steps:",
      "  - uses: prompts/bad.md",
      "    tries: 2",
      "    on-fail:",
      "      uses: prompts/review.md",
      "      with:",
      "        ref: prompts/implement.md",
      "  - uses: prompts/bad.md",
      "    with:",
      "      a: prompts/notes.md",
      "    matrix:",
      "      k: [prompts/notes.md, prompts/notes.md]",
      "",
    ].join("\n"),
  );
  // Neither a v1beta map with a steps list: contributes nothing.
  put(join(h, "workflows", "other.yaml"), "version: theway.workflow/v1\nsteps:\n  - uses: prompts/notes.md\n");
  put(join(h, "workflows", "nolist.yaml"), "version: theway.workflow/v1beta\nsteps:\n  uses: prompts/notes.md\n");
  // A project's workflow counts for the global prompt when the project has none of that name.
  put(join(h, "projects", KEY, "workflows", "uses.yaml"), "version: theway.workflow/v1beta\ndescription: P\nruns-on: session\nsteps:\n  - uses: prompts/review.md\n");

  const { status, body } = await get(h, "/api/prompts");
  expect(status).toBe(200);
  expect(body.folder).toBe(join(h, "prompts"));
  const rows = body.prompts as Row[];
  expect(rows.map((r) => r.name)).toEqual(["bad", "implement", "notes", "review"]);
  const bad = rows[0] as Row;
  expect(bad).toMatchObject({ project: null, description: "Bad", model: null, header: true, inputs: [{ name: "x", required: true, default: null, description: "" }] });
  // The header errors once, though both steps use it.
  expect(bad.errors).toEqual(["model: must be one of opus, sonnet, haiku", "inputs.x: description must be a non-empty string"]);
  expect(bad.usedBy).toEqual([
    { workflow: "uses", project: null, step: 1, as: "step" },
    { workflow: "uses", project: null, step: 2, as: "step" },
  ]);
  expect(rows[1]).toMatchObject({
    description: "Implement the change",
    model: "opus",
    header: true,
    inputs: [
      { name: "change", required: true, default: null, description: "The change" },
      { name: "mode", required: false, default: "fast", description: "How" },
    ],
    errors: [],
    usedBy: [
      { workflow: "agents", project: null, step: 1, as: "step" },
      { workflow: "uses", project: null, step: 1, as: "value" },
    ],
  });
  expect(rows[2]).toEqual({
    name: "notes",
    project: null,
    description: null,
    model: null,
    header: false,
    inputs: [],
    errors: [],
    usedBy: [{ workflow: "uses", project: null, step: 2, as: "value" }],
  });
  expect((rows[3] as Row).usedBy).toEqual([
    { workflow: "agents", project: null, step: 2, as: "step" },
    { workflow: "uses", project: null, step: 1, as: "on-fail" },
    { workflow: "uses", project: KEY, step: 1, as: "step" },
  ]);

  // A project's own prompt of that name takes its project's uses.
  put(join(h, "projects", KEY, "prompts", "review.md"), REVIEW);
  const after = (await get(h, "/api/prompts")).body.prompts as Row[];
  expect(after.filter((r) => r.name === "review").map((r) => [r.project, r.usedBy])).toEqual([
    [null, [{ workflow: "agents", project: null, step: 2, as: "step" }, { workflow: "uses", project: null, step: 1, as: "on-fail" }]],
    [KEY, [{ workflow: "uses", project: KEY, step: 1, as: "step" }]],
  ]);
});

test("a prompt's file route gives its lines on the whole file's lines, and its uses", async () => {
  const h = home();
  const text = "---\ndescription: Bad\nmodel: gpt\ninputs:\n  x:\n    required: true\n---\n\n";
  put(join(h, "prompts", "bad.md"), text);
  put(join(h, "workflows", "w.yaml"), "version: theway.workflow/v1beta\ndescription: W\nruns-on: session\nsteps:\n  - uses: prompts/bad.md\n");
  const { status, body } = await get(h, "/api/prompts/global/bad");
  expect(status).toBe(200);
  expect(body).toEqual({
    name: "bad",
    project: null,
    path: "prompts/bad.md",
    text,
    version: sha(text),
    errors: [
      { text: "model: must be one of opus, sonnet, haiku", line: 3 },
      { text: "inputs.x: description must be a non-empty string", line: 5 },
      { text: "body: must not be empty", line: null },
    ],
    usedBy: [{ workflow: "w", project: null, step: 1, as: "step" }],
  });
  // A reference file a step uses: the header line, no line.
  put(join(h, "prompts", "plain.md"), "Plain\n");
  put(join(h, "workflows", "w.yaml"), "version: theway.workflow/v1beta\ndescription: W\nruns-on: session\nsteps:\n  - uses: prompts/plain.md\n");
  const plain = await get(h, "/api/prompts/global/plain");
  expect(plain.body.errors).toEqual([
    { text: "header: missing; a prompt a workflow uses starts with a --- line, YAML holding a description, and a --- line", line: null },
  ]);
});

test("the file routes answer 404 outside their own folder and 500 for a file that cannot be read", async () => {
  const h = home();
  expect(await get(h, `/api/workflows/projects/${KEY}/agents`)).toEqual({ status: 404, body: { error: "unknown file" } });
  expect(await get(h, `/api/prompts/projects/${KEY}/review`)).toEqual({ status: 404, body: { error: "unknown file" } });
  expect(await get(h, "/api/workflows/projects/-nope/agents")).toEqual({ status: 404, body: { error: "unknown project" } });
  expect(await get(h, "/api/workflows/global/Agents")).toEqual({ status: 404, body: { error: "unknown file" } });
  expect(await get(h, "/api/prompts/global/missing")).toEqual({ status: 404, body: { error: "unknown file" } });
  expect(await get(h, "/api/workflows/global/%2E%2E%2Fprompts%2Freview")).toEqual({ status: 404, body: { error: "unknown file" } });

  if (process.getuid?.() === 0) return;
  chmodSync(join(h, "workflows", "agents.yaml"), 0o000);
  chmodSync(join(h, "prompts", "review.md"), 0o000);
  expect(await get(h, "/api/workflows/global/agents")).toEqual({ status: 500, body: { error: "cannot be read" } });
  expect(await get(h, "/api/prompts/global/review")).toEqual({ status: 500, body: { error: "cannot be read" } });
  const review = ((await get(h, "/api/prompts")).body.prompts as Row[]).find((r) => r.name === "review");
  expect(review).toMatchObject({ header: false, errors: ["cannot be read"], description: null, model: null, inputs: [] });
  chmodSync(join(h, "workflows", "agents.yaml"), 0o644);
  chmodSync(join(h, "prompts", "review.md"), 0o644);
});

test("an empty home lists no file", async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "theway-files-")));
  temps.push(dir);
  expect((await get(dir, "/api/workflows")).body).toEqual({ folder: join(dir, "workflows"), workflows: [] });
  expect((await get(dir, "/api/prompts")).body).toEqual({ folder: join(dir, "prompts"), prompts: [] });
});
