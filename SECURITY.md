# Security Policy

## Supported versions

Only the latest release is supported.

## Threat model

### What install changes

- The plugin goes to `~/.claude/skills/theway` and the binary to `~/.local/bin/theway` (or `$THEWAY_INSTALL_DIR`). Install refuses to replace a program there that is not a theway binary.
- The data home is `~/.theway`, or `THEWAY_HOME`. Install refuses a home that is your home folder, one of its parents or `/`, and a custom home with a glob character or a line break.
- A pointer file is written for a custom home only.
- Two rules are added to `permissions.allow` in `~/.claude/settings.json`:
  - `Bash(theway:*)`;
  - `Read(~/.theway/**)` for the default home, or `Read(//<absolute path>/**)` for a custom one.

  The settings file keeps its mode, or gets `0600` when new.
- Install cleans up after older versions and earlier homes:
  - it removes the legacy `Edit(<root>/*/changes/**)` rule and the 0.2.0 rules;
  - when the home changed, it removes the previous home's Read rule;
  - it deletes the 0.2.0 launcher files under `<home>/bin`, only when their contents match what 0.2.0 wrote.
- Uninstall removes the plugin, the binary when it is theway's, the pointer, and the rules of `THEWAY_HOME`, of the home the pointer names and of `~/.theway`, plus the 0.2.0 rules. It keeps the data home, with your changes and config.

### What the commands may do

- `engineering`: writes only the change folder, with throwaway probes in a `mktemp -d` directory.
- `develop`: edits the repository to implement the change, and updates the change's `tasks.md` and `spec.md` in its change folder.
- `develop-workflow`: commits locally; pushes the change's own feature branch and opens its PR only when `workflow.open_pr` is true; never force-pushes or pushes the default branch; merges only on your explicit yes, with `gh pr merge --squash`, never `--admin`.
- `archive`: moves a change folder only when you name the change and say to archive it.
- `document`: writes and overwrites `docs/architecture/*` in the repository.
- `list`: reads only; runs `theway path` and `theway list`.
- `setup`: runs `npx --yes @pixelfactoryio/theway@<pinned version> install`, which makes the install changes above.

### Input checks

- Project names must match `^[A-Za-z0-9_][A-Za-z0-9._-]*$`, and change IDs `^[a-z0-9]+(?:-[a-z0-9]+)*$`.
- Both are at most 200 characters.
- A path built from them stays inside the data home.

### Releases

- The package is published with npm trusted publishing, from the `npm` environment, by the release workflow on pushes to `main`.
- It carries a SLSA provenance attestation.
- Every workflow action is pinned to a commit SHA, and a test enforces it.

### Untrusted content

- theway runs inside Claude Code with your permissions, and the text it reads (code, CI logs, PR text, web pages, other agents' output) can contain prompt injection.
- The Authority rule in `interaction.md` tells the model and every spawned agent to treat that text as data.
- Claude Code loads a repository's own instruction files (CLAUDE.md, CLAUDE.local.md, `.claude/CLAUDE.md`, `.claude/rules/`, AGENTS.md and the files they import) as instructions. Read them before running theway in a repository you don't trust.
- Claude Code's permission settings remain the boundary that actually enforces anything.

### In scope

- The CLI and install/uninstall.
- Command text that grants more than the authority stated above.
- Injected text that makes a command exceed that authority.

Claude Code itself and your own permission settings are out of scope: report those to their owners.

## Reporting a vulnerability

Report vulnerabilities through GitHub private vulnerability reporting: open the Security tab of this repository and click "Report a vulnerability". Never report them in public issues.

Expect a first response within 7 days.
