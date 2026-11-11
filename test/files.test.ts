import { afterAll, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Document } from "yaml";
import type { Overlay } from "../src/core/io";
import { parsePromptFile, resolveWorkflowFile } from "../src/core/language";
import { addInput, HEADER_ORDER, type PromptChoice, parse, removeInput, setStepPrompt, textOf } from "../src/dashboard/client/editor/ops";
import { addHeader, editableBody, editHeader, joinPrompt, setBody, setEditableBody, setHeaderField, splitPrompt } from "../src/dashboard/client/editor/prompt";
import { edit, isDirty, redo, startDraft, undo } from "../src/dashboard/client/files/draft";
import { MAX_PART, pathParts, shownPath } from "../src/dashboard/client/lib/path";
import { overridesText, stepBadge } from "../src/dashboard/client/files/source";
import { copyText, NEW_PROMPT_BODY, newPromptText, newWorkflowText } from "../src/dashboard/client/files/new-file";

const SHIPPED_HOME = join(import.meta.dirname, "..", "plugin", "home");
const shipped = (rel: string) => readFileSync(join(SHIPPED_HOME, rel), "utf-8");

test("a draft takes three edits, two undos and one redo, and is dirty until its text is again the start", () => {
  let d = startDraft("a", "sha", false);
  expect(isDirty(d)).toBe(false);
  d = edit(edit(edit(d, "b"), "c"), "d");
  d = redo(undo(undo(d)));
  expect(d.text).toBe("c");
  expect(isDirty(d)).toBe(true);
  d = undo(d);
  expect(d.text).toBe("b");
  d = undo(d);
  expect(d.text).toBe("a");
  expect(isDirty(d)).toBe(false);
  expect(edit(d, "a")).toBe(d);
  expect(isDirty(startDraft("a", null, true))).toBe(true);
});

test("a restored version is one undoable edit that keeps its text byte for byte", () => {
  const current = shipped("workflows/agents.yaml");
  const versionText = "version: 1\nsteps:\n  - review: {rounds:   2}   # kept\n";
  const d = edit(startDraft(current, "a".repeat(64), false), versionText);
  expect(d.text).toBe(versionText);
  expect([d.start, d.base, d.isNew, d.undo, isDirty(d)]).toEqual([current, "a".repeat(64), false, [current], true]);
  expect(undo(d).text).toBe(current);
});

test("the undo stack keeps the newest 100 texts", () => {
  let d = startDraft("0", null, false);
  for (let i = 1; i <= 150; i++) d = edit(d, String(i));
  expect(d.undo.length).toBe(100);
  expect(d.undo[0]).toBe("50");
});

const fixture = (rel: string) => readFileSync(join(SHIPPED_HOME, rel), "utf-8");

/** A home holding the shipped workflows and prompts, and a project `p`. */
const HOME = (() => {
  const dir = mkdtempSync(join(tmpdir(), "theway-files-"));
  for (const folder of ["workflows", "prompts"]) cpSync(join(SHIPPED_HOME, folder), join(dir, folder), { recursive: true });
  mkdirSync(join(dir, "projects", "p"), { recursive: true });
  return dir;
})();
afterAll(() => rmSync(HOME, { recursive: true, force: true }));

/** The shipped step prompts, with their declared inputs. */
const STEP_PROMPTS: PromptChoice[] = readdirSync(join(SHIPPED_HOME, "prompts")).flatMap((f) => {
  const { header, headerErrors } = parsePromptFile(fixture(`prompts/${f}`));
  if (header === null || headerErrors.length > 0) return [];
  return [{ name: f.slice(0, -".md".length), inputs: Object.entries(header.inputs).map(([name, i]) => ({ name, required: i.required })) }];
});

/** The error lines of the global workflow `name` written as `text`, with the prompts of `prompts`, resolved in project `p`. */
function errorsOf(name: string, text: string, prompts: Record<string, string> = {}): string[] {
  const overlay: Overlay = new Map([[join(HOME, "workflows", `${name}.yaml`), text]]);
  for (const [n, t] of Object.entries(prompts)) overlay.set(join(HOME, "prompts", `${n}.md`), t);
  const r = resolveWorkflowFile(HOME, "p", name, {}, overlay);
  return "errors" in r ? r.errors : [];
}

test("each header edit of review.md keeps its body byte for byte, and a body edit its header", () => {
  const review = fixture("prompts/review.md");
  const { body, header } = splitPrompt(review);
  expect(joinPrompt(splitPrompt(review))).toBe(review);
  expect(body.startsWith("\n# Review\n")).toBe(true);
  const edits: ((h: Document) => void)[] = [
    (h) => setHeaderField(h, "description", "Review through a lens"),
    (h) => setHeaderField(h, "model", "haiku"),
    (h) => setHeaderField(h, "model", undefined),
    (h) => addInput(h, HEADER_ORDER),
    (h) => removeInput(h, "lens"),
  ];
  for (const [i, op] of edits.entries()) {
    const out = editHeader(review, op);
    expect([i, out === review]).toEqual([i, false]);
    expect([i, splitPrompt(out).body]).toEqual([i, body]);
  }
  const replaced = setBody(review, "New text.\n");
  expect(splitPrompt(replaced).header).toBe(header);
  expect(replaced).toBe(`---\n${header}---\nNew text.\n`);
});

test("the editor's body leaves out the blank line after the header, and an edit writes it back", () => {
  const review = fixture("prompts/review.md");
  const { header, body } = splitPrompt(review);
  expect(body.startsWith("\n#")).toBe(true);
  expect(editableBody(review)).toBe(body.slice(1));
  expect(setEditableBody(review, editableBody(review))).toBe(review);
  expect(setEditableBody(review, "New text.\n")).toBe(`---\n${header}---\n\nNew text.\n`);
  // A CRLF separator is kept as it is; a header with no blank line after it, or no header, has none to leave out.
  expect(editableBody("---\r\ndescription: d\r\n---\r\n\r\nText\r\n")).toBe("Text\r\n");
  expect(setEditableBody("---\r\ndescription: d\r\n---\r\n\r\nText\r\n", "New")).toBe("---\r\ndescription: d\r\n---\r\n\r\nNew");
  expect(editableBody("---\ndescription: d\n---\nText\n")).toBe("Text\n");
  expect(setEditableBody("---\ndescription: d\n---\nText\n", "New\n")).toBe("---\ndescription: d\n---\nNew\n");
  expect(editableBody("\nNotes.\n")).toBe("\nNotes.\n");
  expect(setEditableBody("\nNotes.\n", "Other.\n")).toBe("Other.\n");
});

test("Use as a step on conformance.md adds a header and keeps its text byte for byte after it", () => {
  const conformance = fixture("prompts/conformance.md");
  expect(splitPrompt(conformance).open).toBeNull();
  const out = addHeader(conformance);
  expect(out).toBe(`---\ndescription: ""\n---\n\n${conformance}`);
  expect(out.endsWith(conformance)).toBe(true);
  const { header, headerErrors } = parsePromptFile(out);
  expect(header?.description).toBe("");
  expect(headerErrors).toEqual(["description: must be a non-empty string"]);
});

test("a step card says an agent runs the step, with its model when known, or that the session runs it", () => {
  expect(stepBadge("agents", "opus")).toEqual({ text: "agent · opus", variant: "info-light" });
  expect(stepBadge("agents", "sonnet")).toEqual({ text: "agent · sonnet", variant: "secondary" });
  expect(stepBadge("agents", null)).toEqual({ text: "agent", variant: "secondary" });
  expect(stepBadge("session", "opus")).toEqual({ text: "your session", variant: "outline" });
});

test("the Step defaults panel counts the steps that run elsewhere than the workflow's runs-on", () => {
  expect(overridesText("agents", [{ runs_on: "agents" }, { runs_on: "agents" }])).toBeNull();
  expect(overridesText("agents", [{ runs_on: "session" }, { runs_on: "agents" }])).toBe("1 step overrides it.");
  expect(overridesText("session", [{ runs_on: "agents" }, { runs_on: "agents" }])).toBe("2 steps override it.");
});

test("a new workflow and a new prompt start as written;the workflow names implement's required input until its prompt changes", () => {
  const workflow = newWorkflowText("Ship a thing", STEP_PROMPTS);
  expect(workflow).toBe('version: theway.workflow/v1beta\ndescription: Ship a thing\nruns-on: agents\nsteps:\n  - uses: prompts/implement.md\n    with:\n      change: ""\n');
  expect(errorsOf("ship", workflow)).toEqual(["workflows/ship.yaml: steps[0].with: required input change is not set"]);
  const prompt = newPromptText("Do one thing");
  expect(prompt).toBe(`---\ndescription: Do one thing\nmodel: opus\n---\n\n${NEW_PROMPT_BODY}`);
  expect(NEW_PROMPT_BODY).toBe("Say what this step does, and when it answers pass, fail or blocked.\n");
  const doc = parse(workflow);
  setStepPrompt(doc, 0, "one-thing", []);
  const changed = textOf(doc);
  expect(changed).toBe("version: theway.workflow/v1beta\ndescription: Ship a thing\nruns-on: agents\nsteps:\n  - uses: prompts/one-thing.md\n");
  expect(errorsOf("ship", changed, { "one-thing": prompt })).toEqual([]);
  // With no implement step prompt, the first step prompt by name; with none, implement all the same.
  expect(newWorkflowText("x", STEP_PROMPTS.filter((p) => p.name !== "implement"))).toContain('  - uses: prompts/branch.md\n    with:\n      change: ""\n');
  expect(newWorkflowText("x", [])).toContain("  - uses: prompts/implement.md\n");
});

test("a copy keeps its source's text and sets the description", () => {
  const agents = fixture("workflows/agents.yaml");
  const copy = copyText("workflows", agents, "A copy");
  expect(copy).toBe(agents.replace("description: Implement, review and open the PR through agents\n", "description: A copy\n"));
  const review = fixture("prompts/review.md");
  expect(copyText("prompts", review, "A review")).toBe(review.replace("description: Review the change's diff through one lens\n", "description: A review\n"));
  const conformance = fixture("prompts/conformance.md");
  expect(copyText("prompts", conformance, "A lens")).toBe(`---\ndescription: A lens\n---\n\n${conformance}`);
});

test("the File panel's path starts at the home as shown and breaks only after a /", () => {
  expect(shownPath("~/.theway", "workflows/agents.yaml")).toBe("~/.theway/workflows/agents.yaml");
  expect(shownPath("/srv/theway/", "prompts/triage.md")).toBe("/srv/theway/prompts/triage.md");
  expect(pathParts("~/.theway/workflows/engineering-light.yaml")).toEqual(["~/", ".theway/", "workflows/", "engineering-light.yaml"]);
  expect(pathParts("/srv/theway/prompts/triage.md")).toEqual(["/", "srv/", "theway/", "prompts/", "triage.md"]);
  expect(pathParts("~/.theway/workflows/agents.yaml").join("")).toBe("~/.theway/workflows/agents.yaml");
  // A project key longer than the panel is the one part that may break anywhere.
  expect("-Users-me-Dev-github-com-acme-widgets/".length).toBeGreaterThan(MAX_PART);
  expect("engineering-light.yaml".length).toBeLessThanOrEqual(MAX_PART);
});
