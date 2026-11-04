# Fix CI

Input `diagnosis` holds the CI failure of the PR Input `pr.number`. When its `classification` is `this_pr`, fix the failure its `errors` quote. When it is `base_red`, port its `baseFix`, the commit of Input `base` that fixes the failure, onto Input `branch`.

Commit on Input `branch` and push it once, as "Push the feature branch" in the git host standard (`git-host.md`) says (never force).

When the failure cannot be fixed without a decision the spec does not make, stop and return a blocker (what you found, the options); `blocker` is null otherwise.
