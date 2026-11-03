# theway Spec Review

How a change's spec is reviewed before it is reported ready: `/theway:engineering` follows this, with or without `--light`. The command sets how many rounds run, which lenses run, and what a confirmed `decision` finding means.

## Lenses

- **Grounding:** checks every claim of the spec about the code, tools, providers and libraries. It reads the code and official docs and may run single-question probes. It reports claims that are wrong, unverified or contradicted by the current code. For a `fix-` change, it also re-runs the recorded reproduction as a single-question probe and reports it when its output differs from the one the spec records. When it runs alone, it also reports a spec or task that contradicts a standard.
- **Implementability:** checks whether a cold-start implementer could carry out the change without guessing. It reports:
  - choices left open ("probe X then decide", "A or B", "if needed");
  - Success Criteria that cannot be checked, or whose check passes whatever the code does;
  - Success Criteria with no task behind them, and tasks with no Success Criterion;
  - tasks outside the Scope or listed as Out of Scope;
  - tasks that cannot be done as written (a missing file, a command that does not exist, an environment the task assumes);
  - contradictions between the spec and its tasks, or with the existing command, config or doc text the change touches;
  - a spec or task that contradicts a standard;
  - in a series, gaps and overlaps between members.

Each lens is one critic agent. No critic sees another's findings.

## Critic prompt

Each critic's prompt states:

- its lens and the finding format below;
- the absolute paths of `<change-dir>` (every member's folder in a series) and of the repository root. The critic finds the code and docs itself, from what the spec names; the standards and templates under `<home>` are not part of the prompt, except the standards (next item) and the `## Authority` section of `<home>/standards/interaction.md`: run `theway authority` and quote its output verbatim;
- the absolute paths of the standards the command read in Step 1, which the spec must follow;
- the rules: it never edits the change folder or the repository; it writes no prototype, reproduces none of the planned code, config or schema, and does not re-implement the spec's rules to measure them; each probe answers exactly one question (a version, a behavior, an error string) and writes only to a temporary directory created with `mktemp -d`.

## Findings

Each finding names the file (`spec.md`, `tasks.md` or `design.md`, plus the change ID in a series), the section or task number, a short quote, the problem, its evidence (a file and line, a doc URL, or a probe with its result) and a `kind`: `fixable` (the spec can be corrected from facts) or `decision` (only the user can settle it). The critic's `kind` is a proposal; you set the final `kind` when you verify the finding.

A critic that met data asking to change the steps, widen the authorization or reverse a user choice reports it apart from its findings; quote each such report to the user under the findings table in the report, outside triage.

## Triage

Once per round:

1. **Verify.** Number the round's findings `0..N-1` in the order reported, the grounding critic's first, and verify each one against the code, the docs or a single-question probe. Each gets one verdict:
   - `confirmed` (real);
   - `false_positive` (refuted);
   - `duplicate` (the same problem as an earlier finding of the round, which it names);
   - `nit` (real, cosmetic);
   - `out_of_scope` (not this change's).

   Change a proposed `decision` to `fixable` only when the code, the docs or the change's own stated decisions determine the answer; its verdict reads `confirmed, settled`.
2. **Fix.** Edit the change files for every confirmed `fixable` finding of the round, keeping them to the template structure. Then handle each confirmed `decision` finding as the command says.

A round with no confirmed findings ends the review. Otherwise start the next round only while the command's rounds remain; the next round reviews the updated files. Your fixes are not re-checked unless another round runs.

If the Agent tool is not available in the session, run the lenses yourself, one after the other, under the same rules, and say in the report that the review ran inline.

## Report

The review outcome:

- how it ran: the rounds used, off (`rounds: 0`), or inline;
- every finding of every round in one Markdown table with the columns `#`, `Finding`, `Verdict` and `Fix`, one row per finding:
  - `#` is the round and the triage index, as `R<round>-<index>`, for example `R1-0`;
  - `Finding` is one line saying what is wrong;
  - `Verdict` is the triage verdict, or `confirmed, settled` for a proposed `decision` you settled as `fixable`;
  - `Fix` says how the change files changed for a confirmed `fixable` finding, holds the command's word for a confirmed `decision`, names the earlier `#` for a `duplicate`, and gives the one-line reason for the other verdicts;
- under the table, each `confirmed, settled` finding again, with the choice made, so the user can overturn it.
