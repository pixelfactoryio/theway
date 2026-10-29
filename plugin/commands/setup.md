---
description: Install or update theway from a Claude Code session
author: Amine
allowed-tools: Bash(npx --yes github:pixelfactoryio/theway install)
---

# TheWay: Setup

One-time setup to initialize `~/.theway/` with TheWay templates, standards, and configuration.

## Steps

### Step 1: Run the Installer

```bash
npx --yes github:pixelfactoryio/theway install
```

### Step 2: Check the Result

If it exits non-zero, show its stderr to the user and stop.

### Step 3: Report

Report its last line and tell the user to run `/reload-plugins`.
