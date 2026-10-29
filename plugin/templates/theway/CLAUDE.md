<!-- THEWAY:START -->
# TheWay Instructions

> TheWay files are stored in `~/.theway/<project>/` where `<project>` is your project directory name.

Use TheWay slash commands for structured workflows:
- `/theway:engineering` - Scaffold spec analysis and implementation plan
- `/theway:document` - Create architecture documentation
- `/theway:develop` - Implement tasks from a change folder
- `/theway:develop-workflow` - Develop changes via orchestrated agents (PRs, adversarial review, CI green)
- `/theway:archive` - Archive completed changes
- `/theway:list` - List active and archived changes

Install with `npx --yes github:pixelfactoryio/theway install` (or `/theway:setup` from a session where theway is loaded).

`~/.theway/bin/theway` subcommands: `list`, `archive` and `validate-id <id> [--series]` (change ID format check from `/theway:engineering` Step 2: exit 0 when valid, exit 1 with one reason on stderr).
<!-- THEWAY:END -->
