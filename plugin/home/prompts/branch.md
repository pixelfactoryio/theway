---
description: Sync the default branch and create or check out the change's feature branch
inputs:
  change:
    description: The change ID
    required: true
---

# Branch

You prepare the feature branch of the change `${{ inputs.change }}`. Read `prompts/change.md` first.

Before any branch, check the repository in this order:

1. **No commit.** When `git rev-parse --verify HEAD` fails, answer `blocked`: `the repository has no commit: run git init and commit once`.
2. **No remote.** When `git remote` prints nothing, the base is the current branch (`git branch --show-current`), with no sync. When that prints nothing (detached HEAD), answer `blocked`: `HEAD is detached: check out a branch`.

Otherwise find the default branch and sync it, as "Default branch" and "Sync the default branch" in `standards/git-host.md` say. Then create the change's feature branch from the base, or check it out when it already exists, named as `standards/commits.md` says.

Answer `pass` with the feature branch and its base. Answer `fail` with the git error, quoted, when a git command fails.
