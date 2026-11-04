# Scaffold

You write the change Input `request` asks for: a spec someone else can implement without guessing (the problem, what you found out, the decisions and why) and its tasks. Follow the scaffold rules, the TAMM framework and the investigation prompt you read before this file.

A `fix-` change fixes a bug: the investigation, the templates and the review have rules of their own for it.

## Change ID

**Series naming**

- **Trigger:** the request is a series when the user asks for a series, for multiple sequential changes, or to "split into N changes", or when the argument passed already ends in `-NN`. In series mode the `<series-id>` is the argument without a trailing `-NN`, not a change ID.
- **Pattern:** every member is `<series-id>-NN` — a shared verb-prefixed kebab-case `<series-id>` (same `add-`/`update-`/`refactor-`/`remove-`/`fix-` rule) plus a zero-padded two-digit ordinal. The member IDs are exactly the ones `theway next-id` prints: from `01` for a new series, after the highest existing ordinal otherwise.
- **Member IDs:** run `theway next-id <series-id> --count <N>`, with `<N>` the number of members, and assign the IDs it prints in dependency order; never rename or renumber existing folders. On `invalid change id '…'`, fix the series ID from the reason and run it again; on `would go past -99`, stop and report it.
- **Forbidden:** topic-word suffixes (`add-user-auth-login`), and mixing standalone and series IDs in one series.
- **Example:** `add-user-auth-01`, `add-user-auth-02`, `add-user-auth-03`.

**Validate the ID before writing:** run `theway validate-id <change-id>` for a standalone change (`next-id` already validated a series' IDs), and fix the ID from the reason it prints until it exits 0, before writing any change folder.

**Locate the change folder:** once an ID is valid, run `theway path <change-id>` and use the folder it prints as `<change-dir>` for that change (one per member in a series). Every file of the change is written there.

## Investigate

Investigate as the spec-investigation prompt sets out. A question you cannot settle there becomes an open question for the user (`outcome: open`), or an open point recorded in the spec, which counts as one. A request that contradicts a standard is an open question for the user.

For a `fix-` change, the recorded reproduction goes into the spec's Reproduction. When one of the three stop outcomes applies, write no change folder and return `outcome: stopped`, with the stop report in `report`. Otherwise continue.

## Write the change files

For each template below, read the template prompt, follow its frontmatter instructions (required_context, agent_role, workflow_steps, quality_standards, best_practices), and create the output file in `<change-dir>`:

| Template | Output |
|----------|--------|
| The spec-template prompt, or the fix-spec-template prompt for a `fix-` ID | `spec.md` |
| The tasks-template prompt | `tasks.md` |

A `fix-` ID uses the fix-spec-template prompt; every other verb uses the spec-template prompt. In a `fix-` change, task 1 writes the regression test; re-running the reproduction is not a task, as it is part of Verify.

For a series, each member's `spec.md` carries one line directly under its H1 title:
`**Series:** <series-id> — NN of TOTAL, depends on <series-id>-(NN-1)` — `NN` is the member's ordinal from `next-id`, `TOTAL` the last ordinal it printed; the `01` member states no dependency.

## Optional technical design

If needed, create `<change-dir>/design.md` for:

- API contracts and data models
- Architecture decisions
- Technical diagrams and specs

## Return

- `outcome`: `ready` when the change files are written and no question is open; `open` when a question is open; `stopped` after a stop outcome.
- `changes`: each change folder you wrote, in series order: `id`, `dir` (absolute), `light: false`, `fix` (the ID starts with `fix-`); `[]` when none.
- `questions`: the open questions.
- `shaping`: the findings that shaped the spec, as "question — method — result".
- `report`: the stop report, verbatim, or null.
