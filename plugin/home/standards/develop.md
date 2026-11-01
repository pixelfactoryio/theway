# TheWay Development Core

How a change is implemented, whoever implements it: `/theway:develop` follows this inline, `/theway:develop-workflow` gives it to its implementer agents.

## The spec is the contract

`spec.md` says what the change must do and why; `tasks.md` breaks it into work; `design.md`, when present, fixes contracts and data. Implement what they describe. The spec was written to be implemented without guessing, so a gap between it and the code is information, not something to smooth over.

## Stay inside this change

Read only this change's folder (`<change-dir>`, the `changes/<change-id>/` folder that `theway path <project> <change-id>` prints). Do not open other change folders or `changes/archive/`: their tasks belong to other changes, and acting on them would put work in this change that its spec does not ask for. If you need something about the system, read the code and the project's docs.

Write only under `<change-dir>` too: never in other change folders or `changes/archive/`.

## Implement

- Work through the numbered tasks of `tasks.md`. Keep their order unless the spec shows a task does not depend on the ones before it: later tasks usually build on earlier ones.
- Follow the codebase's existing patterns and `docs/architecture/coding-standards.md` when it exists.
- Write the tests with the code they cover.
- Tick each task (`- [x] N.`) once it is done, and record anything you learn that the next person needs in the Notes section of `tasks.md`.

## User standards

Follow the user standards you are given, as you follow `docs/architecture/coding-standards.md`. When one contradicts the spec, stop and bring it back, as "When the spec does not fit" says. They are not a change folder: "Stay inside this change" does not forbid reading them.

## When the spec does not fit

If the code contradicts the spec, a task cannot be done as written, or doing it well needs a decision the spec does not make, stop and bring it back: what you found, and the options you see. Carrying on with your own fix would leave a spec that no longer describes the code, and the decision would be made without the person who owns the change. Once it is decided, update `spec.md` (the decision and why) and `tasks.md`, then continue. A risk the spec did not foresee goes into its Hardpoints table. A light spec has no Hardpoints table: a risk at Medium or High that it did not foresee is brought back as a blocker.

## Verify

Done means the change does what the spec says, not that every task is ticked. Run the project's tests and build, and the commands the project's CI runs (read them from its CI configuration) where they can run locally; report the ones that cannot run locally. Then check each Success Criterion of `spec.md` and note how you verified it: the command and its result, or the test that covers it. A criterion you could not verify is reported as such.

### A `fix-` change

A `fix-` change also proves that its regression test catches the bug, and that the bug is gone:

1. **Base commit:** `HEAD` for `/theway:develop`, where the change is uncommitted; `git merge-base <base> HEAD` for `/theway:develop-workflow`, with the `<base>` your prompt gives (the branch the change's branch was created from).
2. Create a worktree of it with `git worktree add --detach <dir> <base-commit>`, where `<dir>` comes from `mktemp -d`. `--detach` is needed when the branch is checked out elsewhere.
3. In the worktree, run the project's setup and build commands that CI runs before its tests (read them from the CI configuration): a fresh worktree has no gitignored files, such as dependencies and build output.
4. Copy in only the regression test files, and run only the regression test.
5. Record its output. It must fail **for the reason the spec's Root Cause gives**.
6. Run it on the change and record that it passes.
7. Remove the worktree with `git worktree remove --force <dir>`. Do this whatever happened before, including when you stopped at an earlier step because the setup or the test could not run, or because the test did not fail for the Root Cause's reason.

When `spec.md` has `**Mode:** light` under its title, steps 1-7 do not apply: run the regression test before writing the fix, record its command and failing output in the Discoveries of `tasks.md` Notes, then run it after the fix and record that it passes. Its failure must follow from the cause the spec's Problem states. Writing and running the test before the fix overrides "Write the tests with the code they cover" for that test.

A regression test that does not fail on the base commit, or fails there for another reason (a compile error, or a symbol only the fix adds), does not prove the fix: bring it back as a spec gap, as "When the spec does not fit" says. When the setup or the test cannot run locally, report the criterion as not verified.

Then re-run the reproduction recorded in the spec and record its output: it must no longer reproduce, and show the spec's expected result.
