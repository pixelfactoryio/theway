---
description: Install or update theway from a Claude Code session
author: Amine
allowed-tools: Bash(npx --yes @pixelfactoryio/theway@latest install)
---

# TheWay: Setup

One-time setup: installs the `theway` CLI on your `PATH` and initializes the theway home with TheWay templates, standards, and configuration.

## Steps

### Step 1: Run the Installer

```bash
npx --yes @pixelfactoryio/theway@latest install
```

### Step 2: Check the Result

If it exits non-zero, show its stderr to the user and stop.

### Step 3: Report

Report its last line and tell the user to run `/reload-plugins`. If it printed an `Add <dir> to your PATH` line or a `theway: warning:` line, show those lines too: the commands find `theway` through `PATH`.
