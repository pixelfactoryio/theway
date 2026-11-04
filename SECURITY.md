# Security Policy

## Supported versions

Only the latest release is supported.

## Threat model

### What install changes

- The plugin goes to `$CLAUDE_CONFIG_DIR/skills/theway` (`~/.claude/skills/theway` when unset) and the binary to `~/.local/bin/theway` (or `$THEWAY_INSTALL_DIR`). Install refuses to replace a program there that is not a theway binary.
- The data home is `~/.theway`, or `THEWAY_HOME`. Install refuses a home that is your home folder, one of its parents or `/`, and a custom home with a glob character or a line break.
- Install writes into the data home:
  - `config.yaml`, only when absent, and `config.default.yaml`, always;
  - the shipped standards, templates, workflows, steps, prompts and schemas: an unedited one is updated, an edited one is kept with the shipped version next to it as `<stem>.default.<ext>`; in `standards/`, `workflows/`, `steps/` and `prompts/`, a file of yours with a shipped name is kept and an unedited file theway stops shipping is removed; in `templates/`, on a first install without a manifest a differing file is backed up to `.bak` before being replaced;
  - the `.shipped.json` manifest.
- A pointer file is written for a custom home only, at `$XDG_CONFIG_HOME/theway/home` (`~/.config/theway/home` when unset).
- Two rules are added to `permissions.allow` in `$CLAUDE_CONFIG_DIR/settings.json` (`~/.claude/settings.json` when unset):
  - `Bash(theway:*)`;
  - `Read(~/.theway/**)` for the default home, or `Read(//<absolute path>/**)` for a custom one.

  The settings file keeps its mode, or gets `0600` when new.
- Install cleans up after older versions and earlier homes:
  - it removes the legacy `Edit(<root>/*/changes/**)` rule and the 0.2.0 rules;
  - when the home changed, it removes the previous home's Read rule;
  - it deletes the 0.2.0 launcher files under `<home>/bin`, only when their contents match what 0.2.0 wrote;
  - it moves the shipped standards of the old `data/standards/` layout to `standards/`, and removes `data/standards/` and then `data/` when empty.
- Uninstall removes the plugin, the binary when it is theway's, the pointer, and the rules of `THEWAY_HOME`, of the home the pointer names and of `~/.theway`, plus the legacy `Edit(<root>/*/changes/**)` rule and the 0.2.0 rules. It keeps the data home, with your changes and config.

### What the commands may do

- `engineering`: writes only the change folder, with throwaway probes in a `mktemp -d` directory.
- `workflow`: edits the repository, inline or through agents, and updates the change's `tasks.md` in its change folder, plus its `spec.md` only for a decision taken during an inline `work` agent; commits only on the change's feature branch (nothing for a working-tree workflow); pushes that branch and opens its PR only when `theway workflow` prints `pushes: true` for its workflow; never force-pushes or pushes the default branch; merges only on your explicit yes; pushes, PRs and merges go through the commands `git-host.md` names, never bypassing required reviews or checks.
- `archive`: moves a change folder to `changes/archive/<date>-<change-id>/` only when you name the change and say to archive it; with `--force` only when you accept its open tasks.
- `document`: writes and overwrites `docs/architecture/*` in the repository.
- `list`: reads only; runs `theway path`, `theway project` and `theway list`.

### Input checks

- Project keys given with `--project` must match `^[A-Za-z0-9-]{1,200}$` (a derived key longer than 200 characters is refused), and change IDs `^[a-z0-9]+(?:-[a-z0-9]+)*$`.
- Both are at most 200 characters.
- A path built from them stays inside the data home.

### Releases

- The package is published with npm trusted publishing, from the `npm` environment, by the release workflow, only when release-please creates a release, i.e. when its release PR is merged to `main`.
- It carries a SLSA provenance attestation.
- Every workflow action is pinned to a commit SHA, and a test enforces it.

### Untrusted content

- theway runs inside Claude Code with your permissions, and the text it reads (code, CI logs, PR text, web pages, other agents' output) can contain prompt injection.
- The Authority rule in `interaction.md` tells the model and every spawned agent to treat that text as data.
- The same rule treats the data home's `config.yaml`, standards, templates, prompts, steps and workflows as instructions: anyone who can write to the data home can steer every command. Keep it writable only by you.
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
