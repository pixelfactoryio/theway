# TheWay Development Core

How a change is implemented, whoever implements it: `/theway:develop` follows this inline, `/theway:develop-workflow` gives it to its implementer agents.

## The spec is the contract

`spec.md` says what the change must do and why; `tasks.md` breaks it into work; `design.md`, when present, fixes contracts and data. Implement what they describe. The spec was written to be implemented without guessing, so a gap between it and the code is information, not something to smooth over.

## Stay inside this change

Read only this change's folder (`changes/<change-id>/`). Do not open other change folders or `changes/archive/`: their tasks belong to other changes, and acting on them would put work in this change that its spec does not ask for. If you need something about the system, read the code and the project's docs.

## Implement

- Work through the numbered tasks of `tasks.md`. Keep their order unless the spec shows a task does not depend on the ones before it: later tasks usually build on earlier ones.
- Follow the codebase's existing patterns and `docs/architecture/coding-standards.md` when it exists.
- Write the tests with the code they cover.
- Tick each task (`- [x] N.`) once it is done, and record anything you learn that the next person needs in the Notes section of `tasks.md`.

## When the spec does not fit

If the code contradicts the spec, a task cannot be done as written, or doing it well needs a decision the spec does not make, stop and bring it back: what you found, and the options you see. Carrying on with your own fix would leave a spec that no longer describes the code, and the decision would be made without the person who owns the change. Once it is decided, update `spec.md` (the decision and why) and `tasks.md`, then continue. A risk the spec did not foresee goes into its Hardpoints table.

## Verify

Done means the change does what the spec says, not that every task is ticked. Run the project's tests and build, and the commands the project's CI runs (read them from its CI configuration) where they can run locally; report the ones that cannot run locally. Then check each Success Criterion of `spec.md` and note how you verified it: the command and its result, or the test that covers it. A criterion you could not verify is reported as such.
