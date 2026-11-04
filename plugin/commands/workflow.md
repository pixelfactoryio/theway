---
description: "Run changes, or a request, through a YAML workflow of steps, inline or through agents, and open a PR when the workflow pushes"
author: Amine
allowed-tools: Bash(theway:*)
---

# theway: Workflow

Run each change through one workflow: an ordered list of entries, each a step or a gate, that `theway workflow` resolves from `<home>/projects/<key>/workflows/` or `<home>/workflows/`. A step is a step file (`steps/<name>.yaml`) whose tree of agents reads prompt files (`prompts/<name>.md`); `theway workflow` prints every step resolved into that tree. Steps with `agents: true` run through agents in the plugin workflow `theway:run-pipeline`; steps with `agents: false` and gates run inline, in this session. The default workflow, the shipped `develop`, runs one inline step that works on the working tree and commits nothing.

A workflow's `input`, which `theway workflow` prints, says what it takes. An `input: changes` workflow (`develop`, `agents`) takes change IDs and works on each change's feature branch. An `input: request` workflow (`engineering`, `engineering-light`, which `/theway:engineering` runs) takes a free-text request and writes only the change folders it creates: no branch, no commit, no push.

## Locate the home

Run `theway path` and use the folder it prints as `<home>`, never a path from elsewhere: theway files of the current project are stored in `<home>/projects/<key>/`: run `theway project` for its key and folder; never compute the key yourself.

- If `theway` is not found, tell the user to add the folder theway is installed in (`~/.local/bin` by default) to their `PATH`, or to run `npx --yes @pixelfactoryio/theway@latest install` then `/reload-plugins`, and stop.
- If any `theway` subcommand fails with `error: unknown command '<name>'`, the installed `theway` is older than these commands: tell the user to run `npx --yes @pixelfactoryio/theway@latest install` then `/reload-plugins` and stop.
- If a `theway` subcommand exits 1 otherwise, quote the error line it wrote to stderr and stop, unless the step that runs it says what to do instead. The steps that do are `validate-id` (fix the ID), `next-id` (fix the series ID) and `archive` (open tasks, `--force` on explicit acceptance). Not every error line starts with `theway:`: `validate-id` and `next-id` write `invalid change id '…'` and `archive` writes `Error: …`.
- Quote every `theway: warning:` line in your report.
- Do not check for files under `<home>` before reading them. If a file under `<home>/standards/` or `<home>/templates/` does not exist, theway is not set up: tell the user to run `npx --yes @pixelfactoryio/theway@latest install` then `/reload-plugins` and stop.

## Invocation

```
/theway:workflow [--workflow <name>] <change-id> [<change-id> ...]   # input: changes
/theway:workflow --workflow <name> <request>                         # input: request
```

- `--workflow <name>` or `--workflow=<name>` may stand anywhere in the arguments and picks the workflow `<name>`; without it, the run uses the default workflow (the file that sets `default: true`, else `develop`).
- `--workflow` with no name after it, or given twice: stop and say so.
- `theway workflow <name>` is resolved first (Step 1). With `input: changes`, every other argument is a change ID; no change ID: stop and ask for one. With `input: request`, every argument other than `--workflow <name>` forms the request, joined with spaces; an empty request: stop and ask for one.
- **One change ID:** run the change and stop when its PR is ready for validation (when `pushes` is `false`, when its local branch is ready; for a working-tree workflow, when the change is done, uncommitted in the working tree). Never merge it.
- **Multiple change IDs (series):** run each change strictly in the given order. When `pushes` is `true`, each change's PR must be merged before the next change starts, since later changes build on earlier ones; the user confirms each merge (Step 5). When `pushes` is `false`, nothing is merged: each change's branch is created from the previous change's branch (Step 2). A working-tree workflow commits nothing, so it cannot run a series (Step 1).

**Authorization boundary:** invoking this command authorizes editing the repository, inline or through agents, committing only on each change's own feature branch (nothing for a working-tree workflow), the Workflow tool, and, when `theway workflow` prints `pushes: true`, pushing each change's own feature branch (never force-push, never the default branch) and opening its PR — nothing more. When `pushes` is `false`, it pushes nothing and opens no PR. Merging needs the user's explicit yes, asked at Step 5, and merges as `git-host.md` says: never bypass required reviews or checks. Do not ask for permission mid-run for the pushes and PRs it grants; do not perform outward actions it doesn't.

**Authorization of a request run** (`input: request`): invoking this command authorizes writing the change folders the scaffold creates, and throwaway probes in a directory created with `mktemp -d`, inline or through agents, and the Workflow tool — nothing more. It authorizes no repository edit, no branch, no commit, no push and no PR.

## Workflow Steps

> Follow the conventions in `<home>/standards/interaction.md` (exploration, reporting and authority).

Run Step 1's first part once per run, then Steps 1-5 once per change ID, in order. A request run (`input: request`) runs Steps 1-5 once, for its request, with Steps 2 and 4 skipped.

### Step 1: Load Context

Once per run:

- Run `theway workflow`, or `theway workflow <name>` with `--workflow <name>`. It prints the resolved workflow as JSON: its `name`, its `file`, `commits` and `git_host`, `pushes` (whether a step pushes), `working_tree` (one inline step that commits nothing) and its `steps`. Each step entry has its `id`, `step`, effective `agents` (`agents: false` runs it inline), `params` and its `do` tree of `agent`, `parallel`, `loop` and `when` nodes, every agent with its `label`, `prompt` paths, `returns` type, `access` and `model`; a gate entry has its `id` and `gate` question. On exit 1, quote its error line and stop: no change starts.
- When `working_tree` is `true`, say "working tree: no branch, nothing committed" in your first report line.
- Read the files at its `commits` and `git_host` paths, `commits.md` and `git-host.md` (your project's own copy when it has one): `commits.md` says how the feature branch, the commits and the PR are named, `git-host.md` gives the command of each git host operation by its heading. Pass both paths to every Workflow call (Step 3) and follow both in every step you do yourself.
- When `working_tree` is `true` and more than one change ID was given, stop before any work and say: `a series needs a workflow that commits; pass --workflow agents or a workflow with more steps`.
- Run `theway authority`: its output is the `## Authority` section of `<home>/standards/interaction.md`, which every agent of the run gets verbatim.

Run `theway context develop <change-id>` for each change and use its `change_dir` as `<change-dir>`. Then read these exact paths directly — do not search the filesystem to locate them:

- `<home>/standards/develop.md` - How a change is implemented and verified (you follow it for an inline `work` agent; the agents get it otherwise)
- `<change-dir>/spec.md` - Why, what, risks and Success Criteria
- `<change-dir>/tasks.md` - The work, as numbered tasks
- `<change-dir>/design.md` - Technical specs (if present)
- `docs/architecture/coding-standards.md` - Project coding standards (if exists)

Then read every file its `standards` lists: these are the standards, the shipped opt-in ones that are enabled and yours.

**A request run** (`input: request`): run `theway workflow` and `theway authority` as above, then run `theway context engineering` for the standards (the `engineering` phase) and read every file its `standards` lists. Do not read `develop.md` or any change file.

### Step 2: Branch

Find the default branch and sync it, as `git-host.md` says ("Default branch", "Sync the default branch"), then create (or check out) the change's feature branch from it, named as `commits.md` says. When `pushes` is `false`, create each later change's branch of a series from the previous change's branch instead, so the changes stack locally. The branch the feature branch is created from, the default branch or that previous branch, is the change's `<base>`.

Skip this step for a working-tree workflow: it creates no branch and commits nothing, the change stays uncommitted in the working tree, and its base commit is `HEAD`.

Skip this step for a request run: there is no branch and no commit.

### Step 3: Run

Run the workflow's entries in order, in segments: each run of consecutive step entries with `agents: true` is one agent segment, one Workflow call; each step entry with `agents: false` and each gate is inline, done by you in this session.

**Agent segment.** Call the Workflow tool once, with `name: "theway:run-pipeline"` and these `args`, as a JSON object (not a string):

| Key | Value |
|---|---|
| `repo` | the absolute repository root |
| `branch`, `base`, `changeId` | the feature branch, `<base>` (Step 2), the change ID |
| `changeDir` | `<change-dir>`, absolute |
| `light` | `true` when `spec.md` has `**Mode:** light` under its H1, else `false` |
| `develop` | the absolute path of `<home>/standards/develop.md` |
| `commits`, `gitHost` | the `commits` and `git_host` paths `theway workflow` printed |
| `standards` | the absolute paths `theway context` lists in `standards`, possibly `[]` |
| `authority` | the output of `theway authority`, verbatim |
| `workflow` | the object `theway workflow` printed, parsed (not the string) |
| `steps` | the segment's entry indices (0-based, ascending and consecutive) |
| `head` | the output of `git rev-parse HEAD` after Step 2 and any inline entries before the segment |

**A request run** passes only `repo`, `request` (the request, as a string), `changes`, `standards`, `authority`, `workflow` and `steps`; `branch`, `base`, `head`, `changeId`, `changeDir`, `light`, `develop`, `commits` and `gitHost` are rejected. `changes` is `[]` when the segment starts at the scaffold step; otherwise it is the scaffold result's `changes`, each `{ id, dir, light, fix }`, with `light` set from the spec (`**Mode:** light` under its H1) and `fix` from the ID (it starts with `fix-`). Pass it to every segment after the scaffold.

The script runs the segment's entries and returns `{ status, error, steps, pr, changes, authorityReports }`, with `status` `succeeded`, `blocked` or `failed`. `steps` holds one record per entry run, `{ id, step, results }`, and each result is `{ label, returns, iteration, result }`: the agent's label, its result type, its loop iteration (`null` outside a loop) and its typed result. `pr` is `{ url, number }` or `null`; `changes` is a request run's change folders, else `[]`. It fails with `run-pipeline is started by /theway:workflow with its args` when a key is missing, or when `steps` and `head` do not match these rules.

- **When the Workflow tool is not available in this session:** read `${CLAUDE_PLUGIN_ROOT}/workflows/run-pipeline.js` and run the segment's tree with the Agent tool, one agent per `agent` node, with the same prompts, models, order and type rules. Each agent's prompt asks it to end its reply with a JSON object of its type's fields, and you build the same result. This fallback is for agent segments only.
- **When neither the Workflow tool nor the Agent tool is available:** run the agent segment's nodes yourself, as an inline step, and say "inline" for it in the report.
- **When the Workflow call returns an error and no result:** the change is `failed`, with that error quoted. There is no fallback then, since agents may already have committed.

**Inline step.** Walk the step's printed `do` tree yourself, in order: for each `agent` node, read its prompt files and follow them under the same rules the script gives its agents, except as the list below says: the fixed rules (`FIXED` in `${CLAUDE_PLUGIN_ROOT}/workflows/run-pipeline.js`), the permission line of its `access` (`PERMISSION` there), its Input and its type's engine line. Apply the type rules of the script to what you produce, run a `parallel` group's agents one after the other, evaluate `loop` and `when` conditions as the script does, and build the same typed results for Steps 4 and 5.

- During an inline `work` agent, you may update `spec.md` (the decision and why) and `tasks.md` as `develop.md` asks, once a decision you brought back is taken; agents keep the change files read-only.
- In a working-tree workflow, commit nothing, whatever the permission line says (Step 2 was skipped).
- A blocker of an inline `work` agent makes the change `blocked`, with the blocker and its options.
- A step with a `findings` agent run inline is the session checking its own work: the report says "ran inline: the session checked its own work".
- In a request run, an inline `scaffold` agent is the scaffold done in this session: it writes only the change folders it validated or got from `theway next-id`, and its result's `changes`, with `light` and `fix` added, is passed to every later segment.

**Gate.** Ask the user the gate's question with AskUserQuestion, with the options "Continue" and "Stop". "Continue" goes on with the next entry; any other answer makes the change `blocked`, with `gate: <question>`. There is no resume from a gate.

The first `blocked` or `failed` segment, inline step or gate stops the change: the later entries do not run.

### Step 4: Record

Skip this step for a request run: the change files are its output.

Otherwise, whatever the status, record what the typed results hold in `<change-dir>/tasks.md`, the results of agent segments and of inline steps alike:

- tick the union of `tasksDone` of every `work` result (`- [x] N.`);
- add to its Notes every `work` result's `discoveries` and `choices`, and its `regression` outputs for a `fix-` change;
- add every `verdicts` result to the Notes, each finding with its verdict and reason;
- add every finding that got no verdict to the Notes, as "not triaged".

### Step 5: Gate

- **A request run:** whatever the status, report as the Exit says; a `blocked` run's `error` is the open question, the stop or escalation report, or the confirmed decisions, and the spec is not ready. Nothing is merged.
- **`succeeded`, one change:** report the PR ready for validation, the local branch when `pushes` is `false`, or the uncommitted change for a working-tree workflow. Never merge.
- **`succeeded`, a series, `pushes` true:** report the PR URL, its diffstat ("Diffstat" in `git-host.md`) and CI status, and ask the user whether to merge it. On an explicit yes, merge as "Merge" in `git-host.md` says (never bypass required reviews or checks), sync the default branch ("Sync the default branch"), then continue with the next change ID. Any other answer stops the run; report where the series stopped.
- **`succeeded`, a series, `pushes` false:** nothing is merged; continue with the next change ID, whose branch Step 2 creates from this change's branch.
- **`blocked`:** stop the run and bring `error` (a `work` agent's blocker, an agent that returned no result, or the gate question) to the user with its options. In a series, no later change starts.
- **`failed`:** never merge; stop the run and report `error`: a finding not resolved with its reason, a loop that ended without its condition, or the quoted CI error. In a series, no later change starts.

## Exit

**A request run** reports, in this order:

1. each change folder the scaffold wrote;
2. the scaffold's `shaping`: the findings that shaped the spec;
3. the review outcome: how it ran (the rounds used; "not run because a question was already open" when the scaffold returned `open`; "not run: the scaffold stopped" when it returned `stopped` or `escalated`; "inline" when the step ran inline), then every finding of every round in one Markdown table with the columns `#`, `Finding`, `Verdict` and `Fix`, one row per finding. `#` is `R<iteration>-<index>`, for example `R1-0`; `Finding` is one line saying what is wrong; `Verdict` is the triage verdict, or `confirmed, settled` for a verdict with `settled: true`; `Fix` comes from the `edits` result's `fixes`, reads `open question: <question>` for a confirmed `decision` (`escalated` in a light run, whose changes are `light`), names the earlier `#` for a `duplicate`, and gives the one-line reason for the other verdicts;
4. under the table, each `confirmed, settled` finding again, with the choice made, so the user can overturn it;
5. any open question or stop report (the `error` of a `blocked` run), verbatim, and that the spec is not ready until it is answered;
6. the standards given, by file name, or "none";
7. every `theway: warning:` line and every `authorityReports` entry.

For a working-tree workflow, report the tasks done, each Success Criterion with how it was verified, any deviation from the spec and what was decided about it, anything still open, and that the change is uncommitted in the working tree; also name the standards followed, by file name, or "none", and quote every `theway: warning:` line.

Otherwise, report per change: the workflow's name and file, the branch, and the PR URL (or the local branch when nothing was pushed). Then, per entry in workflow order whichever segment ran it:

- its `id`, marked "inline" for an inline entry, and "ran inline: the session checked its own work" for an inline step with a `findings` agent;
- the loop iterations it used;
- each agent's `summary`;
- every finding, with its verdict or "not triaged";
- each `resolutions` result;
- the PR and its CI iterations, or "not run" when the run stopped before it;
- for a gate, the answer.

Then say whether the PR was merged or awaits validation, and any blocker waiting on the user. In a series, also state where it stopped and why if it did not complete. Quote every `authorityReports` entry of every segment. Also name the standards given to the agents, by file name, or "none", and quote every `theway: warning:` line.
