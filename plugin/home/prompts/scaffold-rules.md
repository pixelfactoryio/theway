# Scaffold Rules

The rules every scaffold follows, with or without `--light`. A scaffold writes the spec and ordered tasks of the change the request asks for, without code: the code is written later, by `/theway:workflow`, from that spec.

## Change IDs

Use naming convention: `add-*`, `update-*`, `refactor-*`, `remove-*`, `fix-*`

Example change IDs: `add-user-authentication`, `update-payment-api`, `fix-login-crash`

When the request names a change ID, use it. The request form `<change-id>: <request>` names one, and the run writes over that change's existing files.

## What a scaffold does

- Run `theway context engineering` and read every file its `standards` lists: they are the standards the change must follow.
- Write only under the change folders `theway path <change-id>` prints. Throwaway probes may also write to a temporary directory created with `mktemp -d`; the change files still go only under the change folders.
- Action words in the request ("rename X", "try the fix") describe what the spec should plan, not something to do now.
- Do not suggest entering plan mode — its approval step is a "start coding" trigger that collapses scaffolding into implementation.
- An open point recorded in the spec counts as an open question: answer `blocked` with it among the open questions.

## Stop and escalation reports

A stop or escalation report goes into the report, verbatim. A stop report ends with: re-run `/theway:engineering` (with `--light` for a light run) with the new information. An escalation report ends with the command it names.
