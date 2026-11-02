---
description: Implement a change's tasks in the current session and tick them off
author: Amine
allowed-tools: Bash(theway:*)
---

# TheWay: Develop

Implement a change as its spec describes it, inline in this session, and show that it meets its Success Criteria.

## Locate the home

Run `theway path` and use the folder it prints as `<home>`, never a path from elsewhere: TheWay files are stored in `<home>/<project>/`, where `<project>` is the current directory name.
- If `theway` is not found, tell the user to add the folder theway is installed in (`~/.local/bin` by default) to their `PATH`, or to run `npx --yes @pixelfactoryio/theway@latest install` then `/reload-plugins`, and stop.
- If any `theway` subcommand fails with `error: unknown command '<name>'`, the installed `theway` is older than these commands: tell the user to run `npx --yes @pixelfactoryio/theway@latest install` then `/reload-plugins` and stop.
- If a `theway` subcommand exits 1 otherwise, quote the error line it wrote to stderr and stop, unless the step that runs it says what to do instead. Not every error line starts with `theway:`: `validate-id` writes `invalid change id '…'` and `archive` writes `Error: …`.
- Quote every `theway: warning:` line in your report.
- Do not check for files under `<home>` before reading them. If a file under `<home>/standards/` or `<home>/templates/` does not exist, theway is not set up: tell the user to run `npx --yes @pixelfactoryio/theway@latest install` then `/reload-plugins` and stop.

## Workflow Steps

> Follow the conventions in `<home>/standards/interaction.md` (exploration, reporting and authority).

### Step 1: Load Context

Take the change ID from the user's request (e.g. "develop the add-redis-cache change" → `add-redis-cache`); only ask if none is given. Run `theway path <project> <change-id>` and use the folder it prints as `<change-dir>`. Then read these exact paths directly — do not search the filesystem to locate them:
- `<home>/standards/develop.md` - How a change is implemented and verified
- `<change-dir>/spec.md` - Why, what, risks and Success Criteria
- `<change-dir>/tasks.md` - The work, as numbered tasks
- `<change-dir>/design.md` - Technical specs (if present)
- `docs/architecture/coding-standards.md` - Project coding standards (if exists)

Then run `theway standards <project> develop` and read every file it prints: these are the user standards.

### Step 2: Implement and Verify

Follow `<home>/standards/develop.md`: implement the tasks, stop and ask when the spec does not fit, then verify against the spec's Success Criteria. The change files you tick and update are the ones in `<change-dir>`.

## Exit

Report the tasks done, each Success Criterion with how it was verified, any deviation from the spec and what was decided about it, and anything still open. Also name the user standards followed, by file name, or "none".
