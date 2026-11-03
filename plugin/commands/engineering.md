---
description: "Write the spec and numbered tasks for a change, without code; with --light, a short spec and 1 to 3 tasks for a small change with nothing to decide"
author: Amine
allowed-tools: Bash(theway:*)
---

# TheWay: Engineering

> **What this command produces.** A spec someone else can implement without guessing: the problem, what you found out, the decisions and why, and the tasks. With `--light`, a short spec: the problem, the evidence, the change file by file, and 1 to 3 tasks. The code is written later, by `/theway:workflow`, from that spec.
>
> Write only under `<change-dir>`, the change folder `theway path <change-id>` prints (Step 2). Throwaway probes, yours and the review critics' (Step 6), may also write to a temporary directory created with `mktemp -d`; the change files still go only under `<change-dir>`. Action words in the request ("rename X", "try the fix") describe what the spec should plan, not something to do now.
>
> Do **not** suggest entering plan mode — its approval step is a "start coding" trigger that collapses scaffolding into implementation.

## Locate the home

Run `theway path` and use the folder it prints as `<home>`, never a path from elsewhere: TheWay files of the current project are stored in `<home>/projects/<key>/`: run `theway project` for its key and folder; never compute the key yourself.
- If `theway` is not found, tell the user to add the folder theway is installed in (`~/.local/bin` by default) to their `PATH`, or to run `npx --yes @pixelfactoryio/theway@latest install` then `/reload-plugins`, and stop.
- If any `theway` subcommand fails with `error: unknown command '<name>'`, the installed `theway` is older than these commands: tell the user to run `npx --yes @pixelfactoryio/theway@latest install` then `/reload-plugins` and stop.
- If a `theway` subcommand exits 1 otherwise, quote the error line it wrote to stderr and stop, unless the step that runs it says what to do instead. The steps that do are `validate-id` (fix the ID), `next-id` (fix the series ID) and `archive` (open tasks, `--force` on explicit acceptance). Not every error line starts with `theway:`: `validate-id` and `next-id` write `invalid change id '…'` and `archive` writes `Error: …`.
- Quote every `theway: warning:` line in your report.
- Do not check for files under `<home>` before reading them. If a file under `<home>/standards/` or `<home>/templates/` does not exist, theway is not set up: tell the user to run `npx --yes @pixelfactoryio/theway@latest install` then `/reload-plugins` and stop.

## Invocation

```
/theway:engineering [--light] <request>
```

`--light` may stand anywhere in the arguments; given more than once, it counts once. The rest is the request, and the change ID when the request names one.

`--light` is the light path, for a small change with nothing to decide: a known cause, a local change, no public contract change. A change that needs decisions goes through `/theway:engineering` without `--light`: the light path escalates to it and never writes a full spec itself.

**Series with `--light`:** when the request asks for a series, for multiple sequential changes or to split into N changes, or the named change ID ends in `-NN`, stop before Step 1 and write nothing: report `a series is not a light change; run /theway:engineering without --light`, and the standards read: none.

Every step below states the full rule; a **With `--light`:** paragraph replaces it where the light path differs.

## Workflow

> Follow the conventions in `<home>/standards/interaction.md` (exploration, reporting and authority).

### Step 1: Load Config and Standards

Run `theway context engineering`. Read these files from `<home>`:
- `<home>/standards/tamm-framework.md` - TAMM framework

Then read every file its `standards` lists: these are the standards, the shipped opt-in ones that are enabled and yours, and the spec follows them.

From its `config`, where every value is already valid, take `engineering.review.rounds` (maximum review rounds in Step 6) and `engineering.review.model`.

### Step 2: Create Change Folder

Use naming convention: `add-*`, `update-*`, `refactor-*`, `remove-*`, `fix-*`

Example change IDs: `add-user-authentication`, `update-payment-api`, `fix-login-crash`

A `fix-` change fixes a bug: Steps 3, 4 and 6 (with `--light`: Steps 3 and 4) have rules of their own for it.

**Series naming**

- **Trigger:** the request is a series when the user asks for a series, for multiple sequential changes, or to "split into N changes", or when the argument passed already ends in `-NN`. In series mode the `<series-id>` is the argument without a trailing `-NN`, not a change ID.
- **Pattern:** every member is `<series-id>-NN` — a shared verb-prefixed kebab-case `<series-id>` (same `add-`/`update-`/`refactor-`/`remove-`/`fix-` rule) plus a zero-padded two-digit ordinal. The member IDs are exactly the ones `theway next-id` prints: from `01` for a new series, after the highest existing ordinal otherwise.
- **Member IDs:** run `theway next-id <series-id> --count <N>`, with `<N>` the number of members, and assign the IDs it prints in dependency order; never rename or renumber existing folders. On `invalid change id '…'`, fix the series ID from the reason and run it again; on `would go past -99`, stop and report it.
- **Forbidden:** topic-word suffixes (`add-user-auth-login`), and mixing standalone and series IDs in one series.
- **Example:** `add-user-auth-01`, `add-user-auth-02`, `add-user-auth-03`.

**Validate the ID before writing:** run `theway validate-id <change-id>` for a standalone change (`next-id` already validated a series' IDs), and fix the ID from the reason it prints until it exits 0, before writing any change folder.

**Locate the change folder:** once an ID is valid, run `theway path <change-id>` and use the folder it prints as `<change-dir>` for that change (one per member in a series). Every file of the change is written there.

**With `--light`:** When the request names a change ID, use it. There is no series naming. **Validate the ID before writing:** run `theway validate-id <change-id>`, never with `--series` (a light change is never a series member), and fix the ID from the reason it prints until it exits 0, before writing any change folder. **Locate the change folder:** once the ID is valid, run `theway path <change-id>` and use the folder it prints as `<change-dir>`. Every file of the change is written there.

### Step 3: Investigate

Investigate as `<home>/standards/spec-investigation.md` sets out. A question you cannot settle there becomes a question for the user, or an open point recorded in the spec. A request that contradicts a standard is an open question for the user.

For a `fix-` change, the recorded reproduction goes into the spec's Reproduction. When none of the three stop outcomes applies, continue to Step 4.

**With `--light`:** Investigate as `<home>/standards/spec-investigation.md` sets out. A question you cannot settle there is a decision: it escalates (below). The findings, and for a `fix-` change the recorded reproduction, go into the spec's Evidence, quoted. When none of the three stop outcomes applies, run the escalation check.

**Escalation check**, for every change, at the end of the investigation and before any change file is written. Escalate when the investigation finds a decision to make, a public contract change, a TAMM risk at Medium or High, or a request for a series. A request that contradicts a standard is a decision to make. A decision is a choice the code, the docs and the request do not settle; a public contract change is a change to a command, CLI, API, config key or file format that others rely on. Escalating writes no change file: report what was found, and tell the user to run `/theway:engineering` with the original request, without `--light`. Otherwise continue to Step 4.

### Step 4: Generate Documents from Templates

For each template below, read the template file, follow its frontmatter instructions (required_context, agent_role, workflow_steps, quality_standards, best_practices), and create the output file in `<change-dir>`:

| Template | Output |
|----------|--------|
| `<home>/templates/spec-template.md`, or `<home>/templates/fix-spec-template.md` for a `fix-` ID | `spec.md` |
| `<home>/templates/tasks-template.md` | `tasks.md` |

A `fix-` ID uses `fix-spec-template.md`; every other verb uses `spec-template.md`. In a `fix-` change, task 1 writes the regression test; re-running the reproduction is not a task, as it is part of Verify.

For a series, each member's `spec.md` carries one line directly under its H1 title:
`**Series:** <series-id> — NN of TOTAL, depends on <series-id>-(NN-1)` — `NN` is the member's ordinal from `next-id`, `TOTAL` the last ordinal it printed; the `01` member states no dependency.

**With `--light`:** The table is:

| Template | Output |
|----------|--------|
| `<home>/templates/light-spec-template.md` | `spec.md` |
| `<home>/templates/tasks-template.md` | `tasks.md` |

`spec.md` keeps the `**Mode:** light` line directly under its H1 title: `/theway:workflow` reads it. For a `fix-` change, Problem states the cause with file:line evidence, and Evidence holds the reproduction. `tasks.md` follows `tasks-template.md`'s rule for a light change. In a `fix-` change, task 1 writes the regression test; re-running the reproduction is not a task, as it is part of Verify. There is no series line and no `fix-spec-template.md`.

### Step 5: Optional Technical Design

If needed, create `<change-dir>/design.md` for:
- API contracts and data models
- Architecture decisions
- Technical diagrams and specs

**With `--light`:** Skip this step: a light change has no `design.md`.

### Step 6: Review

Check that the change can be implemented without guessing, before it is reported ready. Run this step only when Steps 3-5 left no open question; an open point recorded in the spec counts as one. Otherwise do not run it: the spec is not ready, and the Exit report says the review was not run. With `rounds: 0`, skip this step.

Review the change as `<home>/standards/spec-review.md` sets out, for up to `engineering.review.rounds` rounds, with both lenses. Each round spawns the grounding and the implementability critic in parallel, in a single message, with the Agent tool and `model` set to `engineering.review.model`. In a series, each round covers every member together.

After a round's fixes, a confirmed `decision` finding ends the step: each one is an open question, and the spec is not ready.

**With `--light`:** Run up to `engineering.review.rounds` review rounds with one grounding critic. With `rounds: 0`, skip this step. An open question would have escalated in Step 3, so there is none to wait for. Review the change as `<home>/standards/spec-review.md` sets out, with the grounding lens only, which then also reports a spec or task that contradicts a standard. Spawn the critic with the Agent tool and `model` set to `engineering.review.model`. A confirmed `decision` finding is an escalation, not an open question. Escalating after the review keeps the light files: tell the user to run `/theway:engineering <change-id>: <original request>`, without `--light`, which writes over them.

## Exit

Report the change folder, the findings that shaped the spec, the review outcome, and any question still open. A confirmed `decision` finding of Step 6 is an open question. If a question is open, stop after this report; the spec is not ready until it is answered. Every report, including a stop or an escalation, names the standards read in Step 1, by file name, or "none".

Report the review outcome as `<home>/standards/spec-review.md` sets it out. It can also read "not run because a question was already open". For a confirmed `decision`, its `Fix` column reads `open question:` followed by the question.

When a `fix-` change stopped in Step 3, report the stop as `<home>/standards/spec-investigation.md` sets it out: the user re-runs `/theway:engineering` with the new information.

**With `--light`:** Report the change folder, the findings that shaped the spec, and the review outcome. When a `fix-` change stopped in Step 3, report the stop as `<home>/standards/spec-investigation.md` sets it out: the user re-runs `/theway:engineering --light` with the new information. When the change escalated, report what was found and the command to run instead:
- from Step 3: no change folder was written; the user runs `/theway:engineering` with the original request, without `--light`;
- from Step 6: the confirmed `decision` findings, and `/theway:engineering <change-id>: <original request>`, which writes over the light files.

Report the review outcome as `<home>/standards/spec-review.md` sets it out. For a confirmed `decision`, its `Fix` column reads `escalated`. This paragraph replaces the full Exit's open-question sentences and its `open question:` `Fix` rule for a light run.
