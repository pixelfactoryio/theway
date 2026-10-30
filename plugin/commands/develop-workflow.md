---
description: Implement changes through agents that open a PR, then review it and drive CI to green
author: Amine
allowed-tools: Bash(~/.theway/bin/theway:*)
---

# TheWay: Develop Workflow Mode

You are now in **Develop Workflow Mode** - developing changes through orchestrated agents instead of implementing inline.

> **Note:** TheWay files are stored in `~/.theway/<project>/` where `<project>` is your project directory name.
> If `~/.theway/config.yaml` doesn't exist, tell the user to run `/theway:setup` first and stop.

## Invocation

```
/theway:develop-workflow <change-id> [<change-id> ...] [--merge]
```

- **One change ID:** develop the change and stop when its PR is ready for validation. Do not merge unless `--merge` is given.
- **Multiple change IDs (series):** develop each change strictly in the given order. Merging is implied: each change's PR must be merged before the next change starts, since later changes build on earlier ones.
- **`--merge`:** merge the PR once it is review-clean and CI-green (implied in series mode).

**Authorization boundary:** invoking this command authorizes pushing branches, opening PRs, and merging exactly as the syntax above grants — nothing more. This invocation is also the explicit opt-in for the Workflow tool. Do not ask for permission mid-run for actions the syntax already grants; do not perform outward actions it doesn't.

## Workflow Steps

> Follow the conventions in `~/.theway/data/standards/interaction.md` (exploration and reporting).

Run Steps 1-6 as a loop, once per change ID, in order.

### Step 1: Load Context

Read these exact paths directly — do not search the filesystem to locate them:
- `~/.theway/config.yaml` - Global config and conventions
- `~/.theway/data/standards/develop.md` - How a change is implemented and verified (given to every implementer)
- `~/.theway/<project>/changes/<change-id>/spec.md` - Why, what, risks and Success Criteria
- `~/.theway/<project>/changes/<change-id>/tasks.md` - The work, as numbered tasks
- `~/.theway/<project>/changes/<change-id>/design.md` - Technical specs (if present)
- `docs/architecture/coding-standards.md` - Project coding standards (if exists)

From `~/.theway/config.yaml`, take `workflow.review_rounds` (review rounds per change, default 1) and `workflow.ci_attempts` (CI attempts per change, default 2). A key that is absent or not a non-negative integer (`ci_attempts`: a positive integer) takes its default.

Also take the agent models from `workflow.models`: `implementer` (default `opus`), `reviewer` (default `opus`), `fix` (default `opus`) and `ci` (default `sonnet`). Each must be `opus` or `sonnet`; a key that is absent or holds any other value takes its default.

### Step 2: Branch

Sync the main branch, then create (or check out) the change's feature branch from it.

### Step 3: Implement via Orchestrated Agents

Orchestrate with the **Workflow tool**. If it is unavailable in this session, fall back to Agent-tool fan-out with the same stage structure.

**Model policy** (applies to every agent spawned in Steps 3-5, Workflow `agent()` and Agent-tool fallback alike):
- Implementers: `workflow.models.implementer`. When it is `opus`, `sonnet` is acceptable for implementers on mechanical tasks.
- Adversarial reviewers and the fix check: `workflow.models.reviewer`.
- Fix agents: `workflow.models.fix`.
- CI polling and log-fetch agents: `workflow.models.ci`.
- Never `haiku`. Always set `model` explicitly — do not rely on inheriting the session model.

**Implementers.** One implementer per change by default: the tasks of a change usually build on each other and touch the same files, so splitting them adds handoffs and merges without saving time. Split into parallel agents, each in its own worktree, only for large parts that are independent and touch different files; chain dependent parts, never run them in parallel. Each implementer gets `~/.theway/data/standards/develop.md`, the change's `spec.md`, `tasks.md` and `design.md`, and its part of the work. When the spec does not fit the code, it stops and returns a blocker (what it found, the options) instead of redesigning. It commits locally on the feature branch with Conventional Commits (`type(scope): description`, imperative, lowercase), verifies its work as the standard says (including the CI's commands that can run locally), then pushes the branch and opens the PR (Step 4) and returns the PR URL, its verification and any blocker. The orchestrator — not the agents — checks off completed tasks in `tasks.md` and records discoveries in its Notes section.

### Step 4: Open PR

The implementer opens the PR with `gh pr create`; the orchestrator only collects its URL.

- Commit and PR text describe only what the change does — never the process or tooling that produced it.
- Keep the PR body minimal: one-line subject, bullets only when the change isn't self-evident.

### Step 5: Review and CI

Once the PR is open, run up to `review_rounds` review rounds while CI runs. With `review_rounds: 0`, skip the reviewers, the triage and the fix check: only CI runs, and the round below reduces to its CI part.

Each round:

1. **Review while CI runs.** Start the reviewers and the CI polling together, on the PR's current head.
   - Spawn independent reviewer agents prompted to refute or break the PR diff: against `spec.md` (each Success Criterion met, nothing outside Scope, nothing it lists as Out of Scope), and for correctness, edge cases and convention violations. A correct diff that does something the spec did not ask for is a finding. Each finding's `file` is a path relative to the repository root, without a leading `./`.
   - Poll the PR checks.
2. **Triage findings**, once per round:
   1. Number the round's findings `0..N-1` in the order reported and verify each one. Each gets one verdict: `confirmed` (real), `false_positive` (refuted), `duplicate` (the same problem as an earlier finding of the round, which it names), `nit` (real, cosmetic) or `out_of_scope` (not this PR's).
   2. Only `confirmed` findings go to the fix agent. List the `false_positive`, `nit` and `out_of_scope` findings (index, verdict, title) in the Exit report.
3. **Triage CI.** On a failed run, fetch the log (`gh run view <run-id> --log-failed`, then the full `--log` if that is empty) and quote the real error line before attempting any fix; never diagnose from memory or plausibility. Classify the failure as `code_bug`, `test_failure`, `lint_format`, `typecheck`, `dependency_install`, `flaky_infra`, `base_branch_red` or `unknown`. A failure of this PR (any class but `flaky_infra` and `base_branch_red`) goes to the fix agent; `flaky_infra` and `base_branch_red` follow the not-this-PR path below.
   - **Not this PR's failure** (base branch red or flaky infra): when the base branch is red, port its fix onto the branch if one exists there, otherwise report it; then re-run the failed jobs once (`gh run rerun <run-id> --failed`).
4. **Fix once.** When the round has confirmed findings or CI failed for this PR, spawn one fix agent with both: the confirmed findings and the quoted CI error. It commits the fixes on the branch and pushes once.
5. **Fix check** (skipped with `review_rounds: 0`), on that push while CI reruns: spawn one agent that reads the fix commits (`git log` / `git diff` from the round's reviewed head to the new head) and the round's confirmed findings, and answers, per finding, `resolved` or `not resolved` with a one-line reason. It does not look for new problems. Any `not resolved` finding fails the change (Step 6).

**Caps.** Each CI run of the PR (the first one, every run after a fix push and every re-run) counts as one CI attempt. A round with no confirmed findings and CI green ends the step. Otherwise start the next round only while rounds remain under `review_rounds`; the next round reviews the new head. After the last round, keep driving CI alone (triage, fix agent with the CI failure only, re-runs) until it is green or `ci_attempts` attempts are used. If CI is still red after attempt `ci_attempts`, the change failed (Step 6).

### Step 6: Gate

**Change succeeded** (every confirmed finding resolved by the fix check, and CI green):
- Single change without `--merge`: stop and report the PR ready for validation.
- Series or `--merge`: squash-merge the PR, sync main, then continue with the next change ID.

**Change blocked** (the implementer returned a blocker): never merge; stop the run, and bring the blocker to the user with its options. In series mode, do not start later changes.

**Change failed** (a confirmed finding the fix check marks not resolved, or CI still red after `ci_attempts` attempts):
- Never merge. Stop the run — in series mode, do not start later changes on top of a failed one.
- Report what failed: each unresolved finding with the fix check's reason, or the quoted CI error.

## Exit

Report per change: branch, PR URL, review outcome (review rounds used, the findings not fixed with their verdicts, and the fix-check result per confirmed finding), CI status (CI attempts used), whether it was merged or awaits validation, and any blocker waiting on the user. In series mode, also state where the series stopped and why if it did not complete.
