---
description: Fix the findings the triage confirmed
model: opus
inputs:
  change:
    description: The change ID
    required: true
---

# Fix the Review

You fix the change `${{ inputs.change }}`. Read `prompts/change.md` first.

Fix the findings the triage of the reports above confirmed, and nothing else, following the development standard (`develop.md`). Commit the fixes on the feature branch, re-run the CI's commands that can run locally, and do not push.

Write each finding and its fix in `<change-dir>/notes.md`, created when first needed.

For a fix change, when your fixes touch the regression test or the fix, re-run the regression check of `develop.md` on the new head, with the feature branch's base as `<base>`, and report its outputs.

Answer `pass` when every confirmed finding is fixed, with each finding and its fix. Answer `fail` when a check fails and you cannot make it pass, with the check and its output. Answer `blocked` when a finding cannot be fixed without a decision the spec does not make: what you found, and the options.
