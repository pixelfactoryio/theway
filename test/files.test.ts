import { afterAll, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Document } from "yaml";
import type { Overlay } from "../src/core/io";
import { parsePromptFile, resolveWorkflowFile } from "../src/core/language";
import { addInput, HEADER_ORDER, type PromptChoice, parse, removeInput, setStepPrompt, textOf } from "../src/dashboard/client/editor/ops";
import { addHeader, editableBody, editHeader, joinPrompt, setBody, setHeaderField, splitPrompt } from "../src/dashboard/client/editor/prompt";
import { edit, isDirty, redo, startDraft, undo } from "../src/dashboard/client/files/draft";
import { promptLine, withItemError } from "../src/dashboard/client/files/problems";
import { workflowSource } from "../src/dashboard/client/files/source";
import { deltaText, lineDelta, whenOf } from "../src/dashboard/client/files/version-info";
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

test("typed edits less than a second apart are one undo step, and any other change ends the step", () => {
  const a = startDraft("a", "sha", false);
  expect(undo(edit(edit(edit(a, "b", 0), "c", 200), "d", 400)).text).toBe("a");
  const apart = edit(edit(a, "b", 0), "c", 1500);
  expect(undo(apart).text).toBe("b");
  expect(undo(undo(apart)).text).toBe("a");
  expect(undo(edit(edit(edit(a, "b", 0), "c"), "d", 100)).text).toBe("c");
  expect(undo(edit(undo(edit(a, "b", 0)), "c", 100)).text).toBe("a");
  const typed = edit(a, "b", 0);
  expect(edit(typed, "b", 100)).toBe(typed);
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

test("the editor's body leaves out the blank line after the header", () => {
  const review = fixture("prompts/review.md");
  const { body } = splitPrompt(review);
  expect(body.startsWith("\n#")).toBe(true);
  expect(editableBody(review)).toBe(body.slice(1));
  // A CRLF separator is left out as it is; a header with no blank line after it, or no header, has none to leave out.
  expect(editableBody("---\r\ndescription: d\r\n---\r\n\r\nText\r\n")).toBe("Text\r\n");
  expect(editableBody("---\ndescription: d\n---\nText\n")).toBe("Text\n");
  expect(editableBody("\nNotes.\n")).toBe("\nNotes.\n");
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

test("a prompt check line is listed without the open prompt's own prefix, its label kept, not reworded", () => {
  expect(promptLine("prompts/triage.md: body: must not be empty", "triage")).toBe("body: must not be empty");
  expect(promptLine("my-app: theway: prompts/triage.md: inputs.change: unknown key", "triage", ["my-app"])).toBe("my-app: inputs.change: unknown key");
  expect(promptLine("workflows/agents.yaml: steps[3].with: required input change is not set", "triage")).toBe("workflows/agents.yaml: steps[3].with: required input change is not set");
});

test("a prompt's item error joins its check lines unless a line already holds it after the file prefix", () => {
  const error = "model: must be one of opus, sonnet, haiku";
  const body = "prompts/triage.md: body: must not be empty";
  expect(withItemError([body], error, "triage")).toEqual([body, `prompts/triage.md: ${error}`]);
  expect(withItemError([`my-app: theway: prompts/triage.md: ${error}`], error, "triage", ["my-app"])).toEqual([`my-app: theway: prompts/triage.md: ${error}`]);
  expect(withItemError([`prompts/other.md: ${error}`], error, "triage")).toEqual([`prompts/other.md: ${error}`, `prompts/triage.md: ${error}`]);
  expect(withItemError([body], null, "triage")).toEqual([body]);
});

test("a version is labelled to the second and counts the lines it adds and removes against the one before it", () => {
  const now = new Date(2026, 10, 11, 12, 0, 0);
  expect(whenOf(new Date(2026, 10, 11, 9, 5, 7).toISOString(), now)).toBe("Today, 09:05:07");
  expect(whenOf(new Date(2026, 9, 2, 23, 0, 59).toISOString(), now)).toBe("2 Oct, 23:00:59");
  expect(lineDelta("a\nb\nc\n", "a\nB\nc\nd\n")).toEqual({ added: 2, removed: 1 });
  expect(deltaText({ added: 2, removed: 1 })).toBe("+2 \u22121 lines");
  expect(deltaText({ added: 1, removed: 0 })).toBe("+1 \u22120 line");
  expect(deltaText(lineDelta("x", "x"))).toBe("no change");
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

test("a v1 workflow cannot be drawn, with the resolver's line after its file path", () => {
  expect(workflowSource("version: theway.workflow/v1\nsteps:\n  - implement:\n")).toEqual({
    error: "theway.workflow/v1 is no longer read: rewrite it as theway.workflow/v1beta",
  });
  expect("steps" in (workflowSource(shipped("workflows/agents.yaml")) as object)).toBe(true);
});
