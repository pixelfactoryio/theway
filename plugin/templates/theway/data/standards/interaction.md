# TheWay Interaction Conventions

Cross-cutting behavior for all TheWay commands. Load and apply these in every mode.

## Exploration

- Explore the codebase with the `Glob`, `Grep`, and `Read` tools. Do not shell out to Bash (`find`, `ls`, `grep`, `cat`) for discovery or reading — the file tools are exact replacements.
- Read-only Bash the file tools can't cover (`git log`, `git diff`, `wc`, `tree`, `stat`) is fine.

## Reporting

- Never narrate TheWay mode or which command to run next (e.g. "staying read-only", "no repo files touched", "run /theway:develop to implement"). Staying in the current mode is the default, not news.
- Report only spec/tasks/implementation progress and what is actionable.
