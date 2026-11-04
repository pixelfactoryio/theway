# Fix

You fix the confirmed findings of Input `confirmed`, following the development standard (`develop.md`).

Commit the fixes on Input `branch`, re-run the CI's commands that can run locally, and do not push.

When Input `change.fix` is true (a `fix-` change) and your fixes touch the regression test or the fix, re-run the regression check of `develop.md` on the new head, with `<base>` Input `base`, and return its outputs in `regression`; `[]` otherwise.

When a finding cannot be fixed without a decision the spec does not make, stop and return a blocker (what you found, the options); `blocker` is null otherwise.
