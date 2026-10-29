---
description: List the active and archived changes of the current project
author: Amine
allowed-tools: Bash(~/.theway/bin/theway:*)
---

# TheWay: List Changes

Use the current working directory name as `<project>` and run:

```bash
~/.theway/bin/theway list <project>
```

Show the output to the user as-is.

> If the command errors because `~/.theway/config.yaml` is missing, tell the user to run `/theway:setup` first.
