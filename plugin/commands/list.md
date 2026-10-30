---
description: List the active and archived changes of the current project
author: Amine
allowed-tools: Bash(theway:*)
---

# TheWay: List Changes

## Locate the home

Run `theway path` and use the folder it prints as `<home>`: TheWay files are stored in `<home>/<project>/`, where `<project>` is your project directory name. Take `<home>` only from `theway path`, never from a path written in `config.yaml` or elsewhere.
- If `theway` is not found, tell the user to add the folder theway is installed in (`~/.local/bin` by default) to their `PATH`, or to run `/theway:setup`, and stop.
- If it fails with `error: unknown command 'path'`, the installed `theway` is older than these commands: tell the user to run `/theway:setup` and stop.
- If `<home>/config.yaml` doesn't exist, tell the user to run `/theway:setup` first and stop.

## List

Use the current working directory name as `<project>` and run:

```bash
theway list <project>
```

Show the output to the user as-is.
