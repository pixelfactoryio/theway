# theway Spec Investigation

How a change is investigated before its spec is drafted: `/theway:engineering` follows this in its Investigate step, with or without `--light`. The command says what happens to a question this cannot settle, and which section of the spec the findings and the reproduction go to.

## Investigate

Before drafting, find out what the spec depends on: read the code involved, check how it behaves today, and settle the unknowns. You can clone repositories, run small throwaway scripts, call a service or measure something — whatever answers a specific question the spec has to settle.

Keep each investigation to its question. If you notice you are building the change itself to see whether it works, stop: a spec written after the code describes that code instead of the problem, and the blockers and alternatives it should have weighed are never examined.

What you learn goes into the spec as findings (question, method, result), not as code or diffs.

## A `fix-` change

**For a `fix-` change, reproduce the bug first**, before anything else is settled. Use a throwaway probe in a directory created with `mktemp -d`, or run the project's existing commands and tests without changing the repository. Record the command you ran and the output it printed: they go into the spec, quoted. Reasoning about the code is not a reproduction.

Then decide the outcome, before any change file is written. Three outcomes stop the command, with no change folder:

- **Not reproduced:** no attempt reproduced the symptom, including a bug that needs production or is intermittent. Stop and ask the user, listing each attempt (its command and output) and what would help: an environment, a log, exact steps.
- **Possibly already covered:** an active change listed by `theway list`, other than the ones this run writes and the existing members of the series it continues, plausibly names the same bug. Stop and ask the user whether that change covers it, naming the ID. Judge from the IDs only: never open other change folders.
- **Works as intended:** the code and docs show the reported behavior is intended. Report them, and write no change folder.

Otherwise the bug is reproduced: the command continues.

## The stop report

After a stop, report in place of the change folder and the review outcome (no folder was written and the review did not run): the outcome, the attempts (each command and its output) or the evidence, and the question for the user. Then stop. The command keeps no state between runs: the user re-runs it with the new information, and it starts again from Step 1.
