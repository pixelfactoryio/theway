---
description: Implement a change's tasks in the current session and tick them off
author: Amine
allowed-tools: Bash(theway:*)
---

# TheWay: Develop

Implement a change as its spec describes it, inline in this session, and show that it meets its Success Criteria.

## Locate the home

Run `theway path` and use the folder it prints as `<home>`: TheWay files are stored in `<home>/<project>/`, where `<project>` is your project directory name. Take `<home>` only from `theway path`, never from a path written in `config.yaml` or elsewhere.
- If `theway` is not found, tell the user to add the folder theway is installed in (`~/.local/bin` by default) to their `PATH`, or to run `/theway:setup`, and stop.
- If it fails with `error: unknown command 'path'`, the installed `theway` is older than these commands: tell the user to run `/theway:setup` and stop.
- Do not check for files under `<home>` before reading them. If reading `<home>/config.yaml` or a file under `<home>/data/` or `<home>/templates/` fails because it does not exist, theway is not set up: tell the user to run `/theway:setup` and stop.

## Workflow Steps

> Follow the conventions in `<home>/data/standards/interaction.md` (exploration and reporting).

### Step 1: Load Context

Take the change ID from the user's request (e.g. "develop the add-redis-cache change" → `add-redis-cache`); only ask if none is given. Run `theway path <project> <change-id>` and use the folder it prints as `<change-dir>`. Then read these exact paths directly — do not search the filesystem to locate them:
- `<home>/config.yaml` - Global config and conventions
- `<home>/data/standards/develop.md` - How a change is implemented and verified
- `<change-dir>/spec.md` - Why, what, risks and Success Criteria
- `<change-dir>/tasks.md` - The work, as numbered tasks
- `<change-dir>/design.md` - Technical specs (if present)
- `docs/architecture/coding-standards.md` - Project coding standards (if exists)

### Step 2: Implement and Verify

Follow `<home>/data/standards/develop.md`: implement the tasks, stop and ask when the spec does not fit, then verify against the spec's Success Criteria. The change files you tick and update are the ones in `<change-dir>`.

## Exit

Report the tasks done, each Success Criterion with how it was verified, any deviation from the spec and what was decided about it, and anything still open.
