<!-- THEWAY:START -->
# TheWay Instructions

> TheWay files are stored in `<home>/<project>/`, where `<home>` is the folder `theway path` prints and `<project>` is your project directory name.

Use TheWay slash commands for structured workflows:
- `/theway:engineering` - Scaffold spec analysis and implementation plan
- `/theway:document` - Create architecture documentation
- `/theway:develop` - Implement tasks from a change folder
- `/theway:develop-workflow` - Develop changes via orchestrated agents (PRs, adversarial review, CI green)
- `/theway:archive` - Archive completed changes
- `/theway:list` - List active and archived changes

Install with `npx --yes @pixelfactoryio/theway@latest install` (or `/theway:setup` from a session where theway is loaded).

`theway` subcommands (on `PATH`): `list`, `archive`, `path [<project> [<change-id>]] [--verbose]` (prints the theway home, a project folder or a change folder; `--verbose` names where the home came from) and `validate-id <id> [--series]` (change ID format check from `/theway:engineering` Step 2: exit 0 when valid, exit 1 with one reason on stderr).
<!-- THEWAY:END -->
