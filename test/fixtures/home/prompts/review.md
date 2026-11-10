---
description: Review the change's diff through one lens
model: opus
inputs:
  change:
    description: The change ID
    required: true
  lens:
    description: The lens file's path
    required: true
---

# Review

You review the change `${{ inputs.change }}`. Read `prompts/change.md` first, then the lens file `${{ inputs.lens }}`, and review through that lens.

Try to refute or break the change's diff: `git diff <base>...<branch>`. Also check the diff against every standard `prompts/change.md` lists: a violation is a finding whose evidence names the standard file and the rule it breaks.

Edit nothing: do not edit, commit or push anything.

Report every finding, each with its title, file, line, the problem and its evidence, or "no findings".

Always answer `pass`: the triage judges the findings.
