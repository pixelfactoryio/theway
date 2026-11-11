---
description: Wait for the checks of the PR
model: sonnet
---

# Wait for CI

Wait for the checks of the PR named in the reports above, on its latest commit, to finish, as "Wait for the checks" in `standards/git-host.md` says. Do not push, edit or re-run anything.

Answer `pass` when no check failed, as that standard defines a failed check. Answer `fail` with each failed check: its run ID when it has one, else its name and link. Answer `blocked` when the PR is red with no failed check to name.
