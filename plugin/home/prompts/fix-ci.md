---
description: Diagnose the failed checks of the PR, then fix them or re-run them
model: opus
---

# Fix CI

The checks of the PR named in the reports above failed. For each failed check with a run ID, fetch its log as "Read a failed check's log" in `standards/git-host.md` says and quote the real error line; never diagnose from memory. A failed check with no run ID is caused by this PR.

Then, by cause:

- **This PR causes it:** fix the failure, commit on the feature branch and push it once, as "Push the feature branch" says (never force).
- **The base fails the same way, and a commit on the base fixes it:** port that commit onto the feature branch and push it once.
- **The base fails the same way with no fix, or the infrastructure failed:** re-run the failed jobs of each failed run once, as "Re-run failed jobs" says.

Commits go only on the feature branch; write their messages as `standards/commits.md` says.

Answer `pass` when a fix was pushed or a re-run started, with the quoted error lines and what you did. Answer `fail` when neither happened, with why. Answer `blocked` when the failure cannot be fixed without a decision the spec does not make: what you found, and the options.
