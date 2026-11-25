import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  appliesTo,
  GLOBAL,
  lineCount,
  lineSeparatorOf,
  previewText,
  PROMPT_FIELDS,
  promptReading,
  type PromptRow,
  promptsByWorkflow,
  promptValues,
  describeUse,
  WORKFLOW_FIELDS,
  type WorkflowRow,
  workflowCount,
  workflowValues,
} from "../src/dashboard/client/lib/files"
import { NONE } from "../src/dashboard/client/lib/list-filter"
import {
  drawWorkflow,
  findPrompt,
  isDefaultText,
  keyLabel,
  type Selection,
  selectionFromSearch,
  selectionOf,
  selectionSearch,
  stepsRunOn,
} from "../src/dashboard/client/lib/workflow"

const prompt = (
  name: string,
  project: string | null,
  description: string | null,
  model: string | null = null,
): PromptRow => ({
  name,
  project,
  description,
  model,
  header: true,
  inputs: [],
  errors: [],
  usedBy: [],
})

const PROMPTS = [
  prompt("implement", null, "Implement it", "opus"),
  prompt("review", null, "Review it"),
  prompt("review", "-p", "Own review", "sonnet"),
  prompt("fix", null, "Fix it", "haiku"),
]

const used = (p: PromptRow, ...uses: [string, string | null][]): PromptRow => ({
  ...p,
  usedBy: uses.map(([workflow, project]) => ({ workflow, project, step: 1, as: "step" as const })),
})

const workflow = (name: string, project: string | null, rest: Partial<WorkflowRow> = {}): WorkflowRow => ({
  name,
  project,
  description: null,
  default: false,
  steps: 2,
  runsOn: "agents",
  errors: [],
  ...rest,
})

test("a prompt's filter values: kind, applies to, model, the workflows using it, status; none as (none)", () => {
  const p = used(prompt("review", "-p", "Own review", "sonnet"), ["agents", null], ["agents", null], ["ship", "-p"])
  expect(PROMPT_FIELDS.map((f) => promptValues(p, f))).toEqual([
    ["step"],
    ["-p"],
    ["sonnet"],
    ["agents", "ship~-p"],
    ["valid"],
  ])
  const bare = { ...prompt("notes", null, null), header: false, errors: ["bad"] }
  expect(PROMPT_FIELDS.map((f) => promptValues(bare, f))).toEqual([["reference"], [GLOBAL], [NONE], [NONE], ["error"]])
})

test("a workflow's filter values read the prompts it uses from the prompts' uses", () => {
  const uses = promptsByWorkflow([
    used(prompt("implement", null, null), ["agents", null]),
    used(prompt("review", "-p", null), ["agents", null], ["ship", "-p"]),
  ])
  expect(uses.get("agents")).toEqual(["implement", "review~-p"])
  expect(uses.get("ship~-p")).toEqual(["review~-p"])
  expect(WORKFLOW_FIELDS.map((f) => workflowValues(workflow("agents", null, { default: true }), f, uses))).toEqual([
    [GLOBAL],
    ["agents"],
    ["yes"],
    ["implement", "review~-p"],
    ["valid"],
  ])
  const empty = workflow("draft", "-p", { runsOn: null, steps: null, errors: ["e"] })
  expect(WORKFLOW_FIELDS.map((f) => workflowValues(empty, f, uses))).toEqual([
    ["-p"],
    [NONE],
    ["no"],
    [NONE],
    ["error"],
  ])
})

test("labels and uses read as the tables and panels write them", () => {
  const label = (k: string) => (k === "-p" ? "tower" : k)
  expect([appliesTo(null, label), appliesTo("-p", label)]).toEqual(["All projects", "tower only"])
  expect(describeUse({ workflow: "agents", project: null, step: 2, as: "step" }, label)).toBe("agents · step 2")
  expect(describeUse({ workflow: "agents", project: "-p", step: 1, as: "on-fail" }, label)).toBe(
    "agents · tower · on-fail of step 1",
  )
  expect(describeUse({ workflow: "w", project: null, step: 3, as: "value" }, label)).toBe("w · value in step 3")
})

test("the panel reads a step prompt's header as fields and renders its body without the YAML; a reference file has no fields", () => {
  const text = "---\ndescription: Review it\nmodel: opus\ninputs:\n  change:\n    required: true\n---\n\n# Review\n"
  const row: PromptRow = {
    ...prompt("review", null, "Review it", "opus"),
    inputs: [{ name: "change", required: true, default: null, description: "The change ID" }],
  }
  expect(promptReading(text, row)).toEqual({
    fields: {
      description: "Review it",
      model: "opus",
      inputs: [{ name: "change", required: true, default: null, description: "The change ID" }],
    },
    body: "# Review\n",
  })
  expect(promptReading("# Notes\n", { ...prompt("notes", null, null), header: false })).toEqual({
    fields: null,
    body: "# Notes\n",
  })
})

test("the preview is the text after the header, without a BOM or CRLF; the separator follows the first line break", () => {
  expect(previewText("﻿---\r\ndescription: x\r\n---\r\n\r\n\r\n# Body\r\n", true)).toBe("# Body\n")
  expect(previewText("---\ndescription: x\n---\nBody", false)).toBe("---\ndescription: x\n---\nBody")
  expect([lineSeparatorOf("a\r\nb\nc"), lineSeparatorOf("a\nb\r\n"), lineSeparatorOf("one")]).toEqual([
    "\r\n",
    "\n",
    "\n",
  ])
})

const WORKFLOW = `# The workflow
version: theway.workflow/v1beta1 # a comment
description: Implement and review
runs-on: agents
inputs:
  change:
    description: The change
    required: true
    type: change
  mode:
    description: How
    default: fast
steps:
  # first
  - uses: prompts/implement.md
  - uses: prompts/review.md
    runs-on: session
    matrix:
      lens: [a, b, c]
    on-fail:
      uses: prompts/fix.md
      with:
        why: \${{ inputs.change }}
    tries: 2
  - uses: prompts/review.md
    model: opus
`

test("a workflow with comments is drawn: Inputs, steps with their badges, matrix and on-fail", () => {
  const r = drawWorkflow(WORKFLOW, [], PROMPTS, null)
  if (!("drawing" in r)) throw new Error(r.reason)
  const d = r.drawing
  expect(d.inputs).toEqual(["change", "mode"])
  expect(d.inputFields).toEqual([
    { name: "change", type: "change", required: true, default: null, description: "The change" },
    { name: "mode", type: "text", required: false, default: "fast", description: "How" },
  ])
  expect([d.description, d.runsOn, d.default]).toEqual(["Implement and review", "agents", false])
  expect(d.steps.map((s) => [s.name, s.description, s.badge, s.target, s.matrix, s.tries])).toEqual([
    ["implement", "Implement it", "agents · opus", "agents", null, null],
    ["review", "Review it", "session", "session", "matrix · 3", "2"],
    ["review", "Review it", "agents · opus", "agents", null, null],
  ])
  const onFail = d.steps[1]?.onFail
  expect(onFail).toMatchObject({
    name: "fix",
    code: false,
    description: "Fix it",
    badge: "session",
    uses: { prompt: "fix" },
  })
  expect(onFail?.with).toEqual([{ key: "why", value: "${{ inputs.change }}" }])
  expect(d.steps[1]?.fields.matrix).toEqual({ key: "lens", values: ["a", "b", "c"] })
  // A project's workflow takes its project's own prompt.
  const own = drawWorkflow(WORKFLOW, [], PROMPTS, "-p")
  expect("drawing" in own && own.drawing.steps[1]?.description).toBe("Own review")
})

test("Details says where the steps run as the list does: one place, mixed, or none without steps", () => {
  const on = (text: string) => {
    const r = drawWorkflow(text, [], PROMPTS, null)
    if (!("drawing" in r)) throw new Error(r.reason)
    return stepsRunOn(r.drawing)
  }
  const head = "version: theway.workflow/v1beta1\nruns-on: agents\n"
  // The file's `runs-on` is agents; one step runs in the session.
  expect(on(WORKFLOW)).toBe("mixed")
  expect(on(`${head}steps:\n  - uses: prompts/implement.md\n  - uses: prompts/review.md\n`)).toBe("agents")
  expect(on(`${head}steps:\n  - uses: prompts/implement.md\n    runs-on: session\n`)).toBe("session")
  expect(on(`${head}steps:\n`)).toBeNull()
  expect(on(`${head}steps:\n  - uses: prompts/implement.md\n    runs-on: elsewhere\n`)).toBeNull()
})

test("lines go to their card, steps[N] being 0-based; the workflow's own lines to the Inputs card", () => {
  const lines = [
    "description: x",
    "steps[0].uses: prompts/x.md not found",
    "steps[1].on-fail.with: required input why is not set",
    "steps[1].tries: must be an integer from 1 to 10",
    "prompts/review.md: model: must be one of opus, sonnet, haiku",
  ]
  const r = drawWorkflow(WORKFLOW, lines, PROMPTS, null)
  if (!("drawing" in r)) throw new Error(r.reason)
  expect(r.drawing.errors).toEqual(["description: x"])
  expect(r.drawing.steps.map((s) => s.errors.length)).toEqual([1, 1, 0])
  expect(r.drawing.steps[1]?.onFail?.errors).toEqual(["steps[1].on-fail.with: required input why is not set"])
  expect(selectionOf({ text: "steps[1].on-fail.with: x", line: null }, r.drawing)).toEqual({
    kind: "on-fail",
    index: 1,
  })
  expect(selectionOf({ text: "steps[0].uses: x", line: null }, r.drawing)).toEqual({ kind: "step", index: 0 })
  expect(selectionOf({ text: "inputs.change: x", line: 6 }, r.drawing)).toEqual({ kind: "inputs" })
  expect(selectionOf({ text: "description: x", line: null }, r.drawing)).toBeNull()
  expect(selectionOf({ text: "prompts/review.md: model: x", line: null }, r.drawing)).toBeNull()
})

test("a workflow that does not resolve is still drawn, malformed shapes included", () => {
  const text = [
    "version: theway.workflow/v1beta1",
    "inputs: [a]",
    "runs-on: nowhere",
    "steps:",
    "  - 42",
    "  - uses: {x: 1}",
    "    matrix: nope",
    "    with: [a]",
    "    on-fail: 7",
    "  - with: {a: b}",
    "    runs-on: agents",
    "  - uses: prompts/implement.md",
    "    matrix: {a: [x], b: [y]}",
    "    on-fail: {model: opus}",
    "",
  ].join("\n")
  const r = drawWorkflow(text, [], PROMPTS, null)
  if (!("drawing" in r)) throw new Error(r.reason)
  const [invalid, odd, missing, two] = r.drawing.steps
  expect(r.drawing.inputs).toEqual([])
  expect(invalid).toMatchObject({ valid: false, name: "Step 1", badge: null, target: null, matrix: null, onFail: null })
  expect(odd).toMatchObject({
    name: "{x: 1}",
    code: true,
    description: null,
    badge: null,
    target: null,
    matrix: "matrix",
  })
  expect(odd?.fields.with).toEqual({ source: "[a]" })
  expect(odd?.fields.matrix).toEqual({ source: "nope" })
  expect(odd?.onFail).toMatchObject({ name: "7", code: true })
  expect(missing).toMatchObject({ name: "No prompt", code: false, badge: "agents", target: "agents" })
  expect(two).toMatchObject({ matrix: "matrix", badge: null })
  expect(two?.onFail).toMatchObject({ name: "{model: opus}", code: true })
  // steps missing or empty: the Inputs card alone.
  const bare = drawWorkflow("version: theway.workflow/v1beta1\nsteps: []\n", [], PROMPTS, null)
  expect("drawing" in bare && bare.drawing.steps).toEqual([])
  // `steps:` with no value parses as a null scalar: the Inputs card alone too.
  for (const empty of ["steps:\n", "steps: ~\n", "steps: null\n"]) {
    const r = drawWorkflow(
      `version: theway.workflow/v1beta1\n${empty}`,
      ["steps: must be a non-empty list"],
      PROMPTS,
      null,
    )
    expect("drawing" in r && r.drawing.steps).toEqual([])
  }
})

test("an invalid step runs-on gives no badge on the step nor its on-fail; a rejected matrix draws as its source", () => {
  const text = [
    "version: theway.workflow/v1beta1",
    "runs-on: agents",
    "steps:",
    "  - uses: prompts/implement.md",
    "    runs-on: bogus",
    "    tries: 2",
    "    on-fail: prompts/review.md",
    "  - uses: prompts/implement.md",
    "    runs-on: [agents]",
    "  - uses: prompts/implement.md",
    "    ? runs-on",
    "  - uses: prompts/implement.md",
    "    matrix: {lens: [1]}",
    "  - uses: prompts/implement.md",
    "    matrix:",
    "      ? [a]",
    "      : [x]",
    "",
  ].join("\n")
  const r = drawWorkflow(text, [], PROMPTS, null)
  if (!("drawing" in r)) throw new Error(r.reason)
  const [bogus, list, keyOnly, ...matrices] = r.drawing.steps
  expect(bogus).toMatchObject({ badge: null, target: null })
  expect(bogus?.fields.runsOn).toBe("bogus")
  expect(bogus?.onFail).toMatchObject({ name: "review", badge: null })
  expect([list, keyOnly].map((s) => [s?.badge, s?.target])).toEqual([
    [null, null],
    [null, null],
  ])
  expect(matrices.map((s) => [s.matrix, s.fields.matrix])).toEqual([
    ["matrix", { source: "{lens: [1]}" }],
    // A key that is not a scalar is named as the resolver names it.
    ["matrix · 1", { key: "a", values: ["x"] }],
  ])
})

test("an aliased runs-on draws as the resolver resolves it; a matrix with too many aliases draws as its source", () => {
  const tens = (s: string) => `[${Array(10).fill(s).join(", ")}]`
  const text = [
    "version: theway.workflow/v1beta1",
    "description: &r agents",
    "runs-on: &s session",
    "x: &a [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]",
    `y: &b ${tens("*a")}`,
    "steps:",
    "  - uses: prompts/implement.md",
    "    runs-on: *r",
    "  - uses: prompts/implement.md",
    "  - uses: prompts/implement.md",
    "    matrix:",
    `      ? ${tens("*b")}`,
    "      : [x]",
    "  - uses: prompts/implement.md",
    "    matrix:",
    `      lens: ${tens("*b")}`,
    "",
  ].join("\n")
  const r = drawWorkflow(text, [], PROMPTS, null)
  if (!("drawing" in r)) throw new Error(r.reason)
  const [aliased, inherited, bombKey, bombValue] = r.drawing.steps
  expect([aliased, inherited].map((s) => [s?.badge, s?.target])).toEqual([
    ["agents · opus", "agents"],
    ["session", "session"],
  ])
  expect([bombKey, bombValue].map((s) => s?.matrix)).toEqual(["matrix", "matrix"])
  expect(bombKey?.fields.matrix).toEqual({ source: `? ${tens("*b")}\n      : [x]\n` })
})

test("a file is the default from its text, whatever its steps", () => {
  expect(isDefaultText("version: theway.workflow/v1beta1\ndefault: true\nsteps: 5\n")).toBe(true)
  expect(isDefaultText("version: theway.workflow/v1beta1\ndefault: false\nsteps: []\n")).toBe(false)
  expect(isDefaultText("version: theway.workflow/v1\ndefault: true\n")).toBe(false)
  expect(isDefaultText("version: theway.workflow/v1beta1\ndefault: true\nsteps: [\n")).toBe(false)
  expect(isDefaultText("- a\n")).toBe(false)
})

test("a file that cannot be drawn gives its first line as the reason", () => {
  expect(drawWorkflow("steps: [\n  - a\n", ["invalid YAML: bad"], PROMPTS, null)).toEqual({
    reason: "invalid YAML: bad",
  })
  expect(drawWorkflow("- a\n", [], PROMPTS, null)).toEqual({ reason: "version: must be theway.workflow/v1beta1" })
  expect(drawWorkflow("version: theway.workflow/v1\n", ["version: x"], PROMPTS, null)).toEqual({ reason: "version: x" })
  expect(drawWorkflow("version: theway.workflow/v1beta1\nsteps: {a: 1}\n", [], PROMPTS, null)).toEqual({
    reason: "steps: must be a non-empty list",
  })
})

test("the prompt of a step is its project's own, else the global one", () => {
  expect(findPrompt(PROMPTS, "-p", "review")?.description).toBe("Own review")
  expect(findPrompt(PROMPTS, "-q", "review")?.description).toBe("Review it")
  expect(findPrompt(PROMPTS, null, "nope")).toBeNull()
})

test("a YAML key's label turns every - and . into a space and upper-cases its first letter", () => {
  expect(["runs-on", "on-fail.model", "uses", "description"].map(keyLabel)).toEqual([
    "Runs on",
    "On fail model",
    "Uses",
    "Description",
  ])
})

test("workflowCount counts each workflow once, however many of its steps use the prompt", () => {
  expect(
    workflowCount([
      { workflow: "review", project: null, step: 3, as: "step" },
      { workflow: "review", project: null, step: 5, as: "on-fail" },
    ]),
  ).toBe(1)
  expect(
    workflowCount([
      { workflow: "review", project: null, step: 3, as: "step" },
      { workflow: "review", project: "-acme", step: 1, as: "step" },
      { workflow: "ship", project: null, step: 2, as: "value" },
    ]),
  ).toBe(3)
  expect(workflowCount([])).toBe(0)
})

test("the Workflows and Prompts lists have no tooltip, keep each row to one line, stick their head and resize their columns", () => {
  const client = join(import.meta.dirname, "..", "src", "dashboard", "client")
  const read = (...path: string[]) => readFileSync(join(client, ...path), "utf-8")
  const pages = ["pages/files/workflows.tsx", "pages/files/prompts.tsx"]
  for (const file of [...pages, "components/file-list.tsx", "components/files-table.tsx"]) {
    const text = read(file)
    expect([file, /Tooltip|OneLine/.test(text)]).toEqual([file, false])
  }
  // A file's row reads as a list's row: its description first, then its name as the kit's grey mono ID, on one line;
  // a file with no description leads with its name in the ink; the lead is the row's walkable link.
  const cell = read("components", "files-table.tsx")
  expect([
    cell.includes("<RowId>{name}</RowId>"),
    cell.includes("<IdName>{name}</IdName>"),
    cell.includes('data-nav-item=""'),
  ]).toEqual([true, true, true])
  // The Prompts page keeps every cell to one line: nothing takes the grid's wrapping back.
  expect(read("pages", "files", "prompts.tsx")).not.toMatch(/\bWRAP\b|<Wrapped/)
  // The errors badge of their Status column is the badge alone.
  expect(read("components", "status.tsx")).not.toContain("Tooltip")
  // Both pages render the shared list page, which holds the resizable grid, its column titles sticking at the top over
  // 36px rows with a light rule under each, and no column line drawn at rest.
  const list = read("components", "file-list.tsx")
  expect([
    list.includes("columnsResizable: true"),
    list.includes("headerSticky: true"),
    list.includes("<DataGridScrollArea"),
  ]).toEqual([true, true, true])
  // 40px rows with no rule between them, a 32px head.
  const grid = read("components", "list-grid.tsx")
  expect([grid.includes("[&_td]:h-10"), grid.includes("[&_th]:h-8"), list.includes("rowBorder: false")]).toEqual([
    true,
    true,
    true,
  ])
  for (const page of pages) expect([page, read(page).includes("<FileListPage")]).toEqual([page, true])
})

test("a prompt's page is the item frame: its name once in the header, its title above every view, a column of cards", () => {
  const client = join(import.meta.dirname, "..", "src", "dashboard", "client")
  const page = readFileSync(join(client, "pages", "prompt", "page.tsx"), "utf-8")
  // The frame carries the path, the mono name and the pill views; the description is the title, once.
  expect(page).toContain("<DocFrame")
  expect(page).toContain('const PARENTS = [{ label: "Prompts", href: to.prompts() }]')
  expect(page).toContain("heading={<ItemHeading")
  // The panel is one stack of the shared cards, the status first.
  for (const card of [
    "<PropertyCards>",
    "<StatusCard",
    '<PropertyCard title="Details">',
    "<InputsCard",
    "<UsedByCard",
    "<ProblemsCard",
  ])
    expect([card, page.includes(card)]).toEqual([card, true])
  // The prompt is a document view, read and edited in the page's mode as a change's files are: no source tab, no Preview.
  expect(page).toMatch(/<DocumentEditor\b[^]*language="prompt"/)
  expect(page).toContain("<EditControl mode={mode} />")
  expect(page).not.toContain("<CodeTab")
  expect(page).not.toContain('"preview"')
})

test("a file's line count is its line breaks, and one more when it does not end with one", () => {
  expect(["", "a", "a\n", "a\nb", "a\nb\n", "a\r\nb\r\n", "\n"].map(lineCount)).toEqual([0, 1, 1, 2, 2, 2, 1])
})

test("a workflow's YAML and change.yaml are one code tab, which alone mounts the code view and its footer", () => {
  const client = join(import.meta.dirname, "..", "src", "dashboard", "client")
  const read = (file: string) => readFileSync(join(client, file), "utf-8")
  for (const page of ["pages/workflow/page.tsx", "pages/change/active.tsx"]) {
    expect([page, read(page).includes("<CodeTab")]).toEqual([page, true])
    expect([page, read(page).includes("EditableCodeView")]).toEqual([page, false])
  }
})

test("every item page passes its title once to the shared frame, and History is one tab", () => {
  const client = join(import.meta.dirname, "..", "src", "dashboard", "client")
  const read = (file: string) => readFileSync(join(client, file), "utf-8")
  // No page pads a title of its own: its `ItemHeading` or `ChangeHeading` is the frame's `heading`, above every view.
  for (const page of [
    "pages/workflow/page.tsx",
    "pages/prompt/page.tsx",
    "pages/change/active.tsx",
    "pages/change/archived.tsx",
  ]) {
    const text = read(page)
    expect([page, /PROSE_COLUMN\}>\{(title|heading)\}|pt-4 pb-3|pt-5 pb-3|pt-10/.test(text)]).toEqual([page, false])
    for (const match of text.matchAll(/<(ItemHeading|ChangeHeading)\b/g)) {
      const before = text.slice(0, match.index).trimEnd()
      expect([page, match[0], /\bheading=\{$/.test(before)]).toEqual([page, match[0], true])
    }
  }
  for (const page of ["pages/workflow/page.tsx", "pages/prompt/page.tsx"])
    expect([page, read(page).includes("<HistoryTab")]).toEqual([page, true])
})

test("a workflow page's selected card is in its address, steps counted from 1, and read back", () => {
  const cases: [Selection | null, string][] = [
    [null, ""],
    [{ kind: "inputs" }, "step=inputs"],
    [{ kind: "step", index: 0 }, "step=1"],
    [{ kind: "on-fail", index: 2 }, "step=3-on-fail"],
  ]
  for (const [selection, search] of cases) {
    expect(selectionSearch(selection)).toBe(search)
    expect(selectionFromSearch(search)).toEqual(selection)
  }
  for (const unread of ["step=0", "step=x", "step=1-fail", "other=1"]) expect(selectionFromSearch(unread)).toBeNull()
})

test("Markdown is edited one way: documents and prompts with LiveMarkdown, every Markdown field with MarkdownField", () => {
  const client = join(import.meta.dirname, "..", "src", "dashboard", "client")
  const read = (file: string) => readFileSync(join(client, file), "utf-8")
  // The shared field is the documents' editor.
  expect(read("components/markdown-field.tsx")).toContain("<LiveMarkdown")
  // Tasks, the change's description and the workflow's Markdown values use it; no Apply and Cancel field is left.
  for (const file of ["components/task-list.tsx", "components/change-header.tsx", "components/workflow-fields.tsx"])
    expect([file, read(file).includes("<MarkdownField")]).toEqual([file, true])
  expect(read("components/workflow-panel.tsx").match(/<DraftMarkdown\b/g)?.length).toBe(2)
  for (const file of ["components/task-list.tsx", "components/change-header.tsx"])
    expect([file, /\bApply\b|<Textarea|<Input\b/.test(read(file))]).toEqual([file, false])
})
