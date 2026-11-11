---
description: Fix the spec findings the triage confirmed
model: opus
inputs:
  on_decision:
    description: The line a report starts with when a confirmed finding is a decision
    default: "open question:"
---

# Fix the Spec

Edit the change files of the change folders named in the scaffold's report above for every confirmed `fixable` finding of the triage above. Write only under those change folders. Keep the files to the structure of their templates (`prompts/spec-template.md`, `prompts/fix-spec-template.md`, `prompts/light-spec-template.md` and `prompts/change-template.md`). After editing a `change.yaml`, run `theway change <change-id>` and fix the file from the error lines it prints until it exits 0. Fix only what the findings say: a confirmed decision is not yours to settle.

Answer `pass` when every confirmed finding was fixable and is fixed, with each finding and how the change files changed.

Answer `blocked` when a confirmed finding is a decision, after fixing the others. The report is `${{ inputs.on_decision }}`, then each question.
