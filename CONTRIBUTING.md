# Contributing

## Ways to contribute

- Report a bug or request a feature with the issue forms.
- Open a pull request. Start larger changes with an issue, so the approach is agreed before you write the code.

## Development setup

Install Node.js 22.12 or later and bun 1.3.14, then run:

```bash
bun install
bun run build
bun run typecheck
bun test
claude plugin validate plugin --strict
```

## Repo layout

- `src/`: the CLI source.
- `plugin/`: the Claude Code plugin (commands, templates).
- `dist/`: the built CLI. It is committed: rebuild it with `bun run build` and commit it with every `src/` change. CI fails otherwise.
- `test/`: the tests.

## Testing a local build

```bash
bun run build
node dist/theway.js install
```

## Commit and PR conventions

Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/). Pull requests are squash-merged and the PR title becomes the commit message, so the PR title is checked.

Allowed types: `feat`, `fix`, `docs`, `ci`, `refactor`, `chore`, `test`, `build`, `perf`, `style`, `revert`.

Before 1.0, `feat` bumps the minor version and `fix` bumps the patch version. Mark a breaking change with `!`, for example `feat!: drop support for Node.js 20`.

## Release process

release-please opens a release PR from the commits on `main`. Maintainers merge it to cut the release.

## Code of conduct and security

- Follow the [Code of Conduct](CODE_OF_CONDUCT.md).
- Report vulnerabilities as described in [SECURITY.md](SECURITY.md), never in a public issue.
