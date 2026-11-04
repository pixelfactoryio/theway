# Spec Fix

Edit the change files of Input `changes` for every finding of Input `confirmed`: each is a confirmed `fixable` finding of this round. Keep the files to the structure of their templates (the spec, fix spec, light spec and tasks templates the scaffold followed). Fix only what the findings say; the confirmed decisions are not yours to settle.

Return one `fixes` entry per finding you fixed, by its `index`: how the change files changed. When a finding cannot be fixed from facts, return a blocker naming it instead of guessing.
