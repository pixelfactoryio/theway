---
description: Write a short spec and 1 to 3 tasks for a small change with nothing to decide
author: Amine
allowed-tools: Bash(theway:*)
---

# TheWay: Engineering Light

You are now scaffolding a light Spec analysis using templates: the short spec of a small change with nothing to decide.

> **What this command produces.** A short spec someone else can implement without guessing: the problem, the evidence, the change file by file, and 1 to 3 tasks. The code is written later, by `/theway:workflow`, from that spec. A change that needs decisions goes through `/theway:engineering` instead: this command escalates to it and never writes a full spec itself.
>
> Write only under `<change-dir>`, the change folder `theway path <project> <change-id>` prints (Step 2). Throwaway probes, yours and the review critic's (Step 5), may also write to a temporary directory created with `mktemp -d`; the change files still go only under `<change-dir>`. Action words in the request ("rename X", "try the fix") describe what the spec should plan, not something to do now.
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

From its `config`, where every value is already valid, take `engineering.review.rounds` (maximum review rounds in Step 5) and `engineering.review.model`.

### Step 2: Create Change Folder

Use naming convention: `add-*`, `update-*`, `refactor-*`, `remove-*`, `fix-*`

Example change IDs: `add-user-authentication`, `update-payment-api`, `fix-login-crash`

When the request names a change ID, use it.

**Validate the ID before writing:** run `theway validate-id <change-id>`, never with `--series` (a light change is never a series member), and fix the ID from the reason it prints until it exits 0, before writing any change folder.

**Locate the change folder:** once the ID is valid, run `theway path <project> <change-id>` and use the folder it prints as `<change-dir>`. Every file of the change is written there.

### Step 3: Investigate

Investigate as `<home>/standards/spec-investigation.md` sets out. A question you cannot settle there is a decision: it escalates (below). The findings, and for a `fix-` change the recorded reproduction, go into the spec's Evidence, quoted.

**Escalation check**, for every change, at the end of the investigation and before any change file is written. Escalate when the investigation finds a decision to make, a public contract change, a TAMM risk at Medium or High, or a request for a series. A request that contradicts a standard is a decision to make. A decision is a choice the code, the docs and the request do not settle; a public contract change is a change to a command, CLI, API, config key or file format that others rely on. Escalating writes no change file: report what was found, and tell the user to run `/theway:engineering` with the original request.

### Step 4: Generate Documents from Templates

For each template below, read the template file, follow its frontmatter instructions (required_context, agent_role, workflow_steps, quality_standards, best_practices), and create the output file in `<change-dir>`:

| Template | Output |
|----------|--------|
| `<home>/templates/light-spec-template.md` | `spec.md` |
| `<home>/templates/tasks-template.md` | `tasks.md` |

`spec.md` keeps the `**Mode:** light` line directly under its H1 title: `/theway:workflow` reads it. For a `fix-` change, Problem states the cause with file:line evidence, and Evidence holds the reproduction.

`tasks.md` follows `tasks-template.md`'s rule for a light change. In a `fix-` change, task 1 writes the regression test; re-running the reproduction is not a task, as it is part of Verify.

A light change has no `design.md`.

### Step 5: Review

Run up to `engineering.review.rounds` review rounds with one grounding critic. With `rounds: 0`, skip this step. An open question would have escalated in Step 3, so there is none to wait for.

Review the change as `<home>/standards/spec-review.md` sets out, with the grounding lens only, which then also reports a spec or task that contradicts a standard. Spawn the critic with the Agent tool and `model` set to `engineering.review.model`.

A confirmed `decision` finding is an escalation, not an open question. Escalating after the review keeps the light files: tell the user to run `/theway:engineering <change-id>: <original request>`, which writes over them.

## Exit

Report the change folder, the findings that shaped the spec, and the review outcome. Every report, including a stop or an escalation, names the standards read in Step 1, by file name, or "none".

When a `fix-` change stopped in Step 3, report the stop as `<home>/standards/spec-investigation.md` sets it out: the user re-runs `/theway:engineering-light` with the new information.

When the change escalated, report what was found and the command to run instead:
- from Step 3: no change folder was written; the user runs `/theway:engineering` with the original request;
- from Step 5: the confirmed `decision` findings, and `/theway:engineering <change-id>: <original request>`, which writes over the light files.

Report the review outcome as `<home>/standards/spec-review.md` sets it out. For a confirmed `decision`, its `Fix` column reads `escalated`.
