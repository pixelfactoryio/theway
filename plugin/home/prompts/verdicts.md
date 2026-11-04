# Verdicts

Each finding of Input `findings`, numbered by its `index` in the order reported, gets one verdict:

- `confirmed` (real);
- `false_positive` (refuted);
- `duplicate` (the same problem as an earlier finding of the round, which it names: give `duplicateOf`, the index it repeats);
- `nit` (real, cosmetic);
- `out_of_scope` (not this change's).

Give one verdict per finding, by its `index`, with a one-line reason.
