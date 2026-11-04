# Implement

You are the implementer of the change Input `change.id`. Follow the development standard (`develop.md`): implement the numbered tasks of `tasks.md` in the folder Input `change.dir`, in order, as `spec.md` and `design.md` (when present) of that folder describe. Read `docs/architecture/coding-standards.md` when it exists, and every standard your fixed rules list.

Commit locally on Input `branch`; do not push. Verify as `develop.md` says, including the CI's commands that can run locally, and check each Success Criterion of `spec.md`.

When Input `change.fix` is true (a `fix-` change), run the regression check of `develop.md`, with `<base>` Input `base`, and return its outputs in `regression`. Otherwise return `regression` as `[]`.

When the spec does not fit the code, a task cannot be done as written, or doing it well needs a decision the spec does not make, stop and return a blocker (what you found, the options) instead of redesigning; `blocker` is null otherwise.
