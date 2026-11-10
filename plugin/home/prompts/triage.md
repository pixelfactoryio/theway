---
description: Judge the reviewers' findings, or check the fix of the confirmed ones
model: opus
inputs:
  change:
    description: The change ID
    required: true
---

# Triage

You triage the review of the change `${{ inputs.change }}`. Read `prompts/change.md` first. Edit nothing.

## No fix in the reports above

Number every reviewer finding of the reports above from 0, in the order reported. Check each one against the code and `spec.md`, and give it one verdict with a one-line reason:

- `confirmed` (real);
- `false_positive` (refuted);
- `duplicate` (the same problem as an earlier finding, which it names by its number);
- `nit` (real, cosmetic);
- `out_of_scope` (not this change's).

## A fix in the reports above

Check that fix: read its commits and its diff. For each confirmed finding, answer resolved or not resolved with a one-line reason. Look for no new problem, except that a fix that breaks a standard `prompts/change.md` lists is not resolved. For a fix change, a finding whose fix touched the regression test or the fix is resolved only when the fix's regression outputs pass the regression check of `develop.md`.

## Answer

Answer `pass` when no finding is confirmed, or every confirmed finding is resolved. Otherwise answer `fail`: every verdict, then each confirmed or unresolved finding in full (title, file, line, problem, evidence).
