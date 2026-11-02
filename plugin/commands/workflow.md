---
description: Run changes through a YAML workflow: implement inline or through agents, then review and open a PR when the workflow says so
author: Amine
allowed-tools: Bash(theway:*)
---

# TheWay: Workflow

Run each change through one workflow: an ordered list of steps (`implement`, `review`, `agent`, `pr`) that `theway workflow` resolves from `<home>/<project>/workflows/` or `<home>/workflows/`. The default workflow, the shipped `develop`, runs one `implement` step inline, in this session; steps with `agents: true` run through agents in the plugin workflow `theway:run-pipeline`, and steps with `agents: false` run inline.

## Locate the home

Run `theway path` and use the folder it prints as `<home>`, never a path from elsewhere: TheWay files are stored in `<home>/<project>/`, where `<project>` is the current directory name.
- If `theway` is not found, tell the user to add the folder theway is installed in (`~/.local/bin` by default) to their `PATH`, or to run `npx --yes @pixelfactoryio/theway@latest install` then `/reload-plugins`, and stop.
- If any `theway` subcommand fails with `error: unknown command '<name>'`, the installed `theway` is older than these commands: tell the user to run `npx --yes @pixelfactoryio/theway@latest install` then `/reload-plugins` and stop.
- If a `theway` subcommand exits 1 otherwise, quote the error line it wrote to stderr and stop, unless the step that runs it says what to do instead. The steps that do are `validate-id` (fix the ID), `next-id` (fix the series ID) and `archive` (open tasks, `--force` on explicit acceptance). Not every error line starts with `theway:`: `validate-id` and `next-id` write `invalid change id '…'` and `archive` writes `Error: …`.
- Quote every `theway: warning:` line in your report.
- Do not check for files under `<home>` before reading them. If a file under `<home>/standards/` or `<home>/templates/` does not exist, theway is not set up: tell the user to run `npx --yes @pixelfactoryio/theway@latest install` then `/reload-plugins` and stop.

## Invocation

```
/theway:workflow [--workflow <name>] <change-id> [<change-id> ...]
```

- `--workflow <name>` or `--workflow=<name>` may stand anywhere in the arguments and picks the workflow `<name>`; without it, the run uses the default workflow (the file that sets `default: true`, else `develop`). Every other argument is a change ID.
- `--workflow` with no name after it, or given twice: stop and say so. No change ID: stop and ask for one.
- **One change ID:** run the change and stop when its PR is ready for validation (without a `pr` step, when its local branch is ready; for a workflow whose only step is an inline `implement`, when the change is done, uncommitted in the working tree). Never merge it.
- **Multiple change IDs (series):** run each change strictly in the given order. With a `pr` step, each change's PR must be merged before the next change starts, since later changes build on earlier ones; the user confirms each merge (Step 5). Without a `pr` step, nothing is merged: each change's branch is created from the previous change's branch (Step 2). A workflow whose only step is an inline `implement` commits nothing, so it cannot run a series (Step 1).

**Authorization boundary:** invoking this command authorizes editing the repository, inline or through agents, committing only on each change's own feature branch (nothing for a workflow whose only step is an inline `implement`), the Workflow tool, and, when the workflow has a `pr` step, pushing each change's own feature branch (never force-push, never the default branch) and opening its PR — nothing more. Without a `pr` step it pushes nothing and opens no PR. Merging needs the user's explicit yes, asked at Step 5, and uses `gh pr merge <number> --squash`, never `--admin`. Do not ask for permission mid-run for the pushes and PRs it grants; do not perform outward actions it doesn't.

## Workflow Steps

> Follow the conventions in `<home>/standards/interaction.md` (exploration, reporting and authority).

Run Step 1's first part once per run, then Steps 1-5 once per change ID, in order.

### Step 1: Load Context

Once per run:
- Run `theway workflow <project>`, or `theway workflow <project> <name>` with `--workflow <name>`. It prints the resolved workflow as JSON: its `name`, its `file` and its `steps`, every field filled, each step with its effective `agents` (`agents: false` runs it inline). On exit 1, quote its error line and stop: no change starts.
- When the workflow is a single inline `implement` step and more than one change ID was given, stop before any work and say: `a series needs a workflow that commits; pass --workflow agents or a workflow with more steps`.
- Run `theway authority`: its output is the `## Authority` section of `<home>/standards/interaction.md`, which every agent of the run gets verbatim.

Run `theway context <project> develop <change-id>` for each change and use its `change_dir` as `<change-dir>`. Then read these exact paths directly — do not search the filesystem to locate them:
- `<home>/standards/develop.md` - How a change is implemented and verified (you follow it for an inline `implement`; the implementer agent gets it otherwise)
- `<home>/standards/spec-review.md` - The triage verdicts of the review
- `<change-dir>/spec.md` - Why, what, risks and Success Criteria
- `<change-dir>/tasks.md` - The work, as numbered tasks
- `<change-dir>/design.md` - Technical specs (if present)
- `docs/architecture/coding-standards.md` - Project coding standards (if exists)

Then read every file its `standards` lists: these are the standards, the shipped opt-in ones that are enabled and yours.

### Step 2: Branch

Sync the main branch, then create (or check out) the change's feature branch from it. When the workflow has no `pr` step, create each later change's branch of a series from the previous change's branch instead, so the changes stack locally. The branch the feature branch is created from is the change's `<base>`.

Skip this step when the workflow is a single inline `implement` step: it creates no branch and commits nothing, the change stays uncommitted in the working tree, and its base commit is `HEAD`.

### Step 3: Run

Run the workflow's steps in order, in segments: each run of consecutive steps with `agents: true` is one agent segment, one Workflow call; each step with `agents: false` is an inline step, done by you in this session.

**Agent segment.** Call the Workflow tool once, with `name: "theway:run-pipeline"` and these `args`, as a JSON object (not a string):

| Key | Value |
|---|---|
| `repo` | the absolute repository root |
| `branch`, `base`, `changeId` | the feature branch, `<base>` (Step 2), the change ID |
| `changeDir` | `<change-dir>`, absolute |
| `light` | `true` when `spec.md` has `**Mode:** light` under its H1, else `false` |
| `develop`, `specReview` | the absolute paths of `<home>/standards/develop.md` and `<home>/standards/spec-review.md` |
| `standards` | the absolute paths `theway context` lists in `standards`, possibly `[]` |
| `authority` | the output of `theway authority`, verbatim |
| `workflow` | the object `theway workflow` printed, parsed (not the string) |
| `steps` | the segment's step indices (0-based, ascending and consecutive) |
| `commitType` | `null` when the segment starts at index 0; otherwise the commit type already chosen (with `!` when the spec says the change breaks) |
| `head` | `null` when the segment starts at index 0; otherwise the output of `git rev-parse HEAD` after the inline steps before it |

The script runs the segment's steps and returns `{ status, error, commitType, implementation, steps, pr, authorityReports }`, with `status` `succeeded`, `blocked` or `failed`; `implementation` is `null` when the segment does not start with `implement`. It fails with `run-pipeline is started by /theway:workflow with its args` when `steps`, `commitType` and `head` do not match these rules.

- **When the Workflow tool is not available in this session:** read `${CLAUDE_PLUGIN_ROOT}/workflows/run-pipeline.js` and run the segment's steps with the Agent tool, with the same prompts, models, order and outcomes. Each agent's prompt asks it to end its reply with a JSON object of its schema's fields, and you build the same result. This fallback is for agent segments only.
- **When the Workflow call returns an error and no result:** the change is `failed`, with that error quoted. There is no fallback then, since agents may already have committed.

**Inline step.** Do the step yourself under the rules the script gives that step's agents (read `${CLAUDE_PLUGIN_ROOT}/workflows/run-pipeline.js` for them): the Authority rules, the change files under `<change-dir>` are read-only except what Step 4 records, commits only on the feature branch, never force-push, never push the default branch, never merge.
- **`implement`:** follow `<home>/standards/develop.md`. The commit type is `{ add: feat, fix: fix, refactor: refactor }` of the change ID's verb; for `update-` and `remove-` you choose one Conventional type. When steps follow it, commit on the feature branch with the script's commit-type rules (every commit uses the type, except test-only `test` and docs-only `docs` commits; `!` and a `BREAKING CHANGE:` footer when the spec says the change breaks). When it is the only step, commit nothing (Step 2 was skipped). On a spec that does not fit the code, the change is `blocked`, with the blocker and its options.
- **`review`:** up to `rounds` rounds. Per round, review `git diff <base>...<branch>` yourself through each lens, one after the other (read its `path` and follow it, and check the diff against every standard), then give each finding one of the five verdicts of `<home>/standards/spec-review.md`'s Triage step 1 (`confirmed`, `false_positive`, `duplicate`, `nit`, `out_of_scope`). No confirmed finding ends the step. Otherwise fix the confirmed findings and commit with the commit-type rules (for a `fix-` change whose fixes touch the regression test or the fix, re-run the regression check of `develop.md`), then check your fixes from the round's start head: a confirmed finding not resolved makes the change `failed`. The report says "review ran inline": an inline review is the session checking its own work.
- **`agent`:** carry out the step's `prompt` under the rules above; you may commit on the feature branch, you do not push. When you cannot carry it out under those rules, the change is `failed`.
- **`pr`:** push the feature branch once, open the PR and drive CI with the rules of the script's `pr` step: the PR title and body, the CI attempts up to `ci_attempts`, the log read with `gh run view <id> --log-failed`, its classification and what each one does; its outcomes are the script's.

The first `blocked` or `failed` segment or inline step stops the change: the later steps do not run.

### Step 4: Record

Whatever the status, record what the results hold in `<change-dir>/tasks.md`: tick each task of `implementation.tasksDone` (`- [x] N.`), and add to its Notes `implementation.discoveries`, `implementation.choices`, the `implementation.regression` outputs of a `fix-` change, and the verdicts of each review round. After an inline `implement`, tick the tasks you did and record your discoveries, choices and `fix-` regression outputs yourself; after an inline `review`, record its verdicts in the same form.

### Step 5: Gate

- **`succeeded`, one change:** report the PR ready for validation, the local branch when the workflow has no `pr` step, or the uncommitted change for a single inline `implement`. Never merge.
- **`succeeded`, a series with a `pr` step:** report the PR URL, its diffstat (`gh pr view <number> --json additions,deletions,changedFiles`) and CI status, and ask the user whether to merge it. On an explicit yes, merge with `gh pr merge <number> --squash` (never `--admin`), sync main, then continue with the next change ID. Any other answer stops the run; report where the series stopped.
- **`succeeded`, a series without a `pr` step:** nothing is merged; continue with the next change ID, whose branch Step 2 creates from this change's branch.
- **`blocked`:** stop the run and bring `implementation.blocker` (or `error`, or the inline `implement`'s blocker) to the user with its options. In a series, no later change starts.
- **`failed`:** never merge; stop the run and report `error`: each finding the fix check marked `not resolved` with its reason, or the quoted CI error. In a series, no later change starts.

## Exit

For a workflow whose only step is an inline `implement`, report the tasks done, each Success Criterion with how it was verified, any deviation from the spec and what was decided about it, anything still open, and that the change is uncommitted in the working tree; also name the standards followed, by file name, or "none", and quote every `theway: warning:` line.

Otherwise, report per change: the workflow's name and file, the branch, the PR URL (or the local branch when nothing was pushed), and each step's outcome, in workflow order whichever segment ran it, inline ones marked "inline" — review: rounds used, the findings not confirmed with their verdicts, and the fix-check result per confirmed finding; agent: its `summary`; pr: CI attempts used, or "not run" without a `pr` step or when the run stopped before it — whether it was merged or awaits validation, and any blocker waiting on the user. In a series, also state where it stopped and why if it did not complete. Quote every `authorityReports` entry of every segment. Also name the standards given to the agents, by file name, or "none", and quote every `theway: warning:` line.
