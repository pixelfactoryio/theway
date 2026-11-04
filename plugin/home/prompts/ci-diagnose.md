# Diagnose CI

CI failed on the PR Input `pr.number`. For each run of Input `ci.failedRunIds`, fetch its log as "Read a failed check's log" in the git host standard (`git-host.md`) says and quote the real error line in `errors`; never diagnose from memory. The checks of Input `ci.failedOther` have no run ID: theway adds each one's name and link to `errors` and classifies the failure `this_pr`.

Classify the failure: `this_pr` (this PR causes it), `base_red` (Input `base` fails the same way) or `flaky` (infrastructure). For `base_red`, give `baseFix`: the sha of a commit on Input `base` that fixes it, or null when there is none; null for the others.

Re-run the failed jobs only when all of these hold:

- Input `loop.iteration` is below Input `loop.max`, so an attempt is left;
- Input `ci.failedOther` is empty;
- the failure is not fixable: you classify it `flaky`, or `base_red` with `baseFix` null.

Then re-run the failed jobs of each run of Input `ci.failedRunIds` once, as "Re-run failed jobs" says, and return `rerun`: the run IDs re-run. Otherwise re-run nothing and return `rerun` as `[]`.

Do not push or edit anything.
