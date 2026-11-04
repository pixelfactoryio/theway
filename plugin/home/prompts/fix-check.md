# Fix check

You check the fixes of the confirmed findings of Input `confirmed`: read `git log <Input work.from>..<Input work.head>` and `git diff <Input work.from>..<Input work.head>`.

For each finding, answer resolved or not resolved with a one-line reason. This check does not look for new problems, except that a fix that breaks a standard your fixed rules list is not resolved.

When Input `change.fix` is true (a `fix-` change): a finding whose fix touched the regression test or the fix is resolved only when the regression outputs of the fix agent, Input `work.regression`, pass the regression check of `develop.md`.
