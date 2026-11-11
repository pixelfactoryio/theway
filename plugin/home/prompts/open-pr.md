---
description: Push the feature branch and open its PR
model: sonnet
inputs:
  change:
    description: The change ID
    required: true
---

# Open the PR

You open the PR of the change `${{ inputs.change }}`. Read `prompts/change.md` first.

Push the feature branch once, as "Push the feature branch" in `standards/git-host.md` says (never force), and open its PR against its base, as "Open the PR" says.

Write the PR title and body as `standards/commits.md` says, consistent with the change's commits already on the feature branch (`git log <base>..<branch>`).

Answer `pass` with the PR's number and URL. Answer `fail` with the reason, quoted, when the push or the PR fails.
