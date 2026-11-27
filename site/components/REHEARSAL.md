# Rehearsal: workflow-demo

Built from scratch at `minimal` fidelity, with one exception: the step added is the only thing in words, so the eye has one text to read. Every other label is a `Bar` (the kit's skeleton line). Gold: `loading` (skeletons at the content's own geometry, real chrome throughout) with the beat structure of `hero-demo`.

One surface, no app chrome: the dashboard's canvas with a short workflow whole in frame (inputs, implement, review, ci and its fix-ci on-fail card), and the dashboard's panel beside it (below it on a phone). Only the dashboard's own shapes:

- Step card: `src/dashboard/client/components/workflow-card.tsx:35`, its tile tinted by kind (inputs, session, agents, on-fail). The step added, open-pr, is the card in words: its number, its prompt's description whole, `open-pr` in mono, `agents · sonnet`.
- "+" on every line: `workflow-card.tsx:130` (`AddButton`); the dashed placeholder: `workflow-card.tsx:152` (`Placeholder`).
- On-fail card and its dashed line with the `on fail · tries N` label: `workflow-canvas.tsx:359`.
- The panel: `PropertyCard`s (`property-card.tsx:29`) on its 12px inset. At rest, the workflow's cards in skeleton. Then the step picker (`components/step-picker.tsx`): header and Close, the search (`ui/command.tsx:72`), the group heading, rows of description then name; open-pr's row in words. Then the step's card (`workflow-step-panel.tsx`, `StepEditPanel`) as adding open-pr writes it: Step 3 of 4, Uses, Runs on, Model, With `change`, Matrix, On fail, Remove step.

Beats (about 6 s, played once when the demo comes into view; it holds the result, so there is no reset):

1. 0.5–2 s: the cursor passes over review to the "+" under it and clicks: the placeholder opens on the canvas, pushing ci down, and the picker replaces the workflow's cards in the panel.
2. 2–3.4 s: `ope` is typed in the search; the list narrows from nine rows to three, open-pr's in the middle.
3. 3.4–4 s: open-pr's row is clicked: the placeholder becomes the step, selected, in words, and the panel shows its properties.

Poster (reduced motion): the result.

Wide 1344 × 540, compact 358 × 680 (canvas over the panel; ci's on-fail card left out; the step's card runs off the panel's foot).

Captured on the real page, 1440 and 390 viewports, light and dark; both films end `rehearsal passed`.

Film notes that stand:

- `jump: wfd-picker__query width` and `jump: wfd-caret x`: the letters landing as the search is typed.
- The Next dev overlay ("1 Issue") in the sheets is a hydration mismatch caused by film.mjs adding `data-ss-verification-stage` before hydration; it is not in the component.

Not checked:

- Widths between 900 and 1344 (the wide design scales below 1:1).
