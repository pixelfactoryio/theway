# TheWay Commits

How a change's branch, commits and PR are named: `/theway:workflow` and its agents follow this whenever they create the feature branch, commit or open the PR. Edit it, or replace it for one project with `<home>/projects/<key>/standards/commits.md`, to use your team's conventions.

## Branch

The feature branch is named `<change-id>`.

## Commit type

The type comes from the change ID's verb: `add-` → `feat`, `fix-` → `fix`, `refactor-` → `refactor`. For `update-` and `remove-`, choose one type for the whole change.

The first commit of the change sets its type. Every later commit, the fix commits and the PR title use the type of the change's commits on the feature branch that change more than tests or docs, with its `!`: read `git log <base>..<branch>` for it.

Every commit of the change uses that type, except commits that change only tests (`test`) or only docs (`docs`). When the spec says the change breaks, the type gets `!` and the commit a `BREAKING CHANGE:` footer.

## Commit messages

Commit messages are Conventional Commits: `type(scope): description`, imperative, lowercase. They describe only what the change does, never the process or tooling that produced it.

## Pull request

The PR title is a Conventional Commit of the change's type, `type(scope): description`. The body is one line, with bullets only when the change is not self-evident, and never names the process or tooling that produced it.
