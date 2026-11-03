# TheWay Git Host

The commands `/theway:workflow` and its agents run for each git host operation, here for GitHub through the `gh` CLI. Edit it, or replace it for one project with `<home>/projects/<key>/standards/git-host.md`, to use another host: keep the headings, which the command and its agents name, and change the commands under them.

## Default branch

`git symbolic-ref --short refs/remotes/origin/HEAD`, without its `origin/` prefix.

## Sync the default branch

`git fetch origin`, then `git switch <default>`, then `git pull --ff-only`.

## Push the feature branch

`git push -u origin <branch>`. Never force.

## Open the PR

`gh pr create --base <base> --head <branch> --title <title> --body <body>`. Take the PR's number and URL from its output.

## Wait for the checks

`gh pr checks <number> --watch`. Then list the checks with `gh pr checks <number> --json name,bucket,link`: a check failed when its `bucket` is `fail`, and its run ID is the number after `/actions/runs/` in its `link`. A failed check whose `link` has no run ID is quoted by its name and link as the error, is this PR's failure, and is not re-run.

## Read a failed check's log

`gh run view <id> --log-failed`, or the full `gh run view <id> --log` when that is empty.

## Re-run failed jobs

`gh run rerun <id> --failed`.

## Diffstat

`gh pr view <number> --json additions,deletions,changedFiles`.

## Merge

`gh pr merge <number> --squash`. Never `--admin`, never bypass required reviews or checks.
