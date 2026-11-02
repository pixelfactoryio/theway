---
description: Write the spec and numbered tasks for a change, without code
author: Amine
allowed-tools: Bash(theway:*)
---

# TheWay: Engineering

> **What this command produces.** A spec someone else can implement without guessing: the problem, what you found out, the decisions and why, and the tasks. The code is written later, by `/theway:develop`, from that spec.
>
> Write only under `<change-dir>`, the change folder `theway path <project> <change-id>` prints (Step 2). Throwaway probes, yours and the review critics' (Step 6), may also write to a temporary directory created with `mktemp -d`; the change files still go only under `<change-dir>`. Action words in the request ("rename X", "try the fix") describe what the spec should plan, not something to do now.
>
> Do **not** suggest entering plan mode — its approval step is a "start coding" trigger that collapses scaffolding into implementation.

## Locate the home

Run `theway path` and use the folder it prints as `<home>`, never a path from elsewhere: TheWay files are stored in `<home>/<project>/`, where `<project>` is the current directory name.
- If `theway` is not found, tell the user to add the folder theway is installed in (`~/.local/bin` by default) to their `PATH`, or to run `npx --yes @pixelfactoryio/theway@latest install` then `/reload-plugins`, and stop.
- If any `theway` subcommand fails with `error: unknown command '<name>'`, the installed `theway` is older than these commands: tell the user to run `npx --yes @pixelfactoryio/theway@latest install` then `/reload-plugins` and stop.
- If a `theway` subcommand exits 1 otherwise, quote the error line it wrote to stderr and stop, unless the step that runs it says what to do instead. The steps that do are `validate-id` (fix the ID), `next-id` (fix the series ID) and `archive` (open tasks, `--force` on explicit acceptance). Not every error line starts with `theway:`: `validate-id` and `next-id` write `invalid change id '…'` and `archive` writes `Error: …`.
- Quote every `theway: warning:` line in your report.
- Do not check for files under `<home>` before reading them. If a file under `<home>/standards/` or `<home>/templates/` does not exist, theway is not set up: tell the user to run `npx --yes @pixelfactoryio/theway@latest install` then `/reload-plugins` and stop.

## Workflow

> Follow the conventions in `<home>/standards/interaction.md` (exploration, reporting and authority).

### Step 1: Load Config and Standards

Run `theway context <project> engineering`. Read these files from `<home>`:
- `<home>/standards/tamm-framework.md` - TAMM framework

Then read every file its `standards` lists: these are the standards, the shipped opt-in ones that are enabled and yours, and the spec follows them.

From its `config`, where every value is already valid, take `engineering.review_rounds` (maximum review rounds in Step 6) and `engineering.models.critic`.

### Step 2: Create Change Folder

Use naming convention: `add-*`, `update-*`, `refactor-*`, `remove-*`, `fix-*`

Example change IDs: `add-user-authentication`, `update-payment-api`, `fix-login-crash`

A `fix-` change fixes a bug: Steps 3, 4 and 6 have rules of their own for it.

**Series naming**

- **Trigger:** the request is a series when the user asks for a series, for multiple sequential changes, or to "split into N changes", or when the argument passed already ends in `-NN`. In series mode the argument given to `/theway:engineering` is the `<series-id>`, not a change ID.
- **Pattern:** every member is `<series-id>-NN` — a shared verb-prefixed kebab-case `<series-id>` (same `add-`/`update-`/`refactor-`/`remove-`/`fix-` rule) plus a zero-padded two-digit ordinal starting at `01`, assigned in dependency order.
- **Member IDs:** run `theway next-id <project> <series-id> --count <N>`, with `<N>` the number of members, and assign the IDs it prints in dependency order; never rename or renumber existing folders. On `invalid change id '…'`, fix the series ID from the reason and run it again; on `would go past -99`, stop and report it.
- **Forbidden:** topic-word suffixes (`add-user-auth-login`), and mixing standalone and series IDs in one series.
- **Example:** `add-user-auth-01`, `add-user-auth-02`, `add-user-auth-03`.

**Validate the ID before writing:** run `theway validate-id <change-id>` for a standalone change (`next-id` already validated a series' IDs), and fix the ID from the reason it prints until it exits 0, before writing any change folder.

**Locate the change folder:** once an ID is valid, run `theway path <project> <change-id>` and use the folder it prints as `<change-dir>` for that change (one per member in a series). Every file of the change is written there.

### Step 3: Investigate

Investigate as `<home>/standards/spec-investigation.md` sets out. A question you cannot settle there becomes a question for the user, or an open point recorded in the spec. A request that contradicts a standard is an open question for the user.

For a `fix-` change, the recorded reproduction goes into the spec's Reproduction. When none of the three stop outcomes applies, continue to Step 4.

### Step 4: Generate Documents from Templates

For each template below, read the template file, follow its frontmatter instructions (required_context, agent_role, workflow_steps, quality_standards, best_practices), and create the output file in `<change-dir>`:

| Template | Output |
|----------|--------|
| `<home>/templates/spec-template.md`, or `<home>/templates/fix-spec-template.md` for a `fix-` ID | `spec.md` |
| `<home>/templates/tasks-template.md` | `tasks.md` |

A `fix-` ID uses `fix-spec-template.md`; every other verb uses `spec-template.md`. In a `fix-` change, task 1 writes the regression test; re-running the reproduction is not a task, as it is part of Verify.

For a series, each member's `spec.md` carries one line directly under its H1 title:
`**Series:** <series-id> — NN of TOTAL, depends on <series-id>-(NN-1)` — the `01` member states no dependency.

### Step 5: Optional Technical Design

If needed, create `<change-dir>/design.md` for:
- API contracts and data models
- Architecture decisions
- Technical diagrams and specs

### Step 6: Review

Check that the change can be implemented without guessing, before it is reported ready. Run this step only when Steps 3-5 left no open question; an open point recorded in the spec counts as one. Otherwise do not run it: the spec is not ready, and the Exit report says the review was not run. With `review_rounds: 0`, skip this step.

Review the change as `<home>/standards/spec-review.md` sets out, for up to `review_rounds` rounds, with both lenses. Each round spawns the grounding and the implementability critic in parallel, in a single message, with the Agent tool and `model` set to `engineering.models.critic`. In a series, each round covers every member together.

After a round's fixes, a confirmed `decision` finding ends the step: each one is an open question, and the spec is not ready.

## Exit

Report the change folder, the findings that shaped the spec, the review outcome, and any question still open. A confirmed `decision` finding of Step 6 is an open question. If a question is open, stop after this report; the spec is not ready until it is answered. Every report, including a stop or an escalation, names the standards read in Step 1, by file name, or "none".

Report the review outcome as `<home>/standards/spec-review.md` sets it out. It can also read "not run because a question was already open". For a confirmed `decision`, its `Fix` column reads `open question:` followed by the question.

When a `fix-` change stopped in Step 3, report the stop as `<home>/standards/spec-investigation.md` sets it out: the user re-runs `/theway:engineering` with the new information.
