# Wait for CI

Wait for the checks of the PR Input `pr.number` on Input `head` to finish, as "Wait for the checks" in the git host standard (`git-host.md`) says. Do not push, edit or re-run anything.

Return `ci`: `red` when at least one check failed, as that standard defines a failed check; `green` otherwise. Return `failedRunIds`: the run ID of each failed check that has one; and `failedOther`: the name and link of each failed check that has no run ID. Both are `[]` when `ci` is `green`.
