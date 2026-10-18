# Session 001 — the first four items off the review backlog

**Started:** 2026-10-17

## Actions taken

Worked `docs/review-backlog.md` in the order the previous session left, one commit each, on `fix/review-backlog-copy-and-interface`.

**Finger numbers.** The practice screen printed "finger 3" and the neck diagram draws a bare 1–4, with nothing saying which finger that is. The screen now names the finger in words ("A string, fret 3 · ring finger") and the fretting-hand briefing states the numbering once, including that the number names the finger rather than anything it presses — the reading a trumpet player would otherwise bring to it. `Finger` replaced the `1 | 2 | 3 | 4` union that was spelled out in `music/types.ts`, `music/fretboard.ts` and `ui/components/Fretboard.tsx`, so `fingerName` and the type have one home.

**Audio vocabulary on Setup.** gain, dBFS, attack, noise floor, headroom, clipping, direct monitoring, latency and cents are each now explained once, at the control they describe: gain in the page head, dBFS and attack above the meter, noise floor/headroom/clipping below it, direct monitoring in the input card, latency above the calibration button, cents under the tuning bar. The tuner's note reads `IN_TUNE_CENTS` rather than restating 5. The setup briefing's gain and direct-monitoring bullets were brought in line.

**The practice screen's layout.** The transport bar moved from under the fretboard, highway and chart to directly under the target note, so Start is reachable without scrolling on a 13-inch screen. A test asserts the start button precedes the neck diagram in document order; it was checked against the old order and fails there. The phase pill and the 3rem note name now reserve the width of their widest content, so the retention checkbox and the position text stop stepping sideways mid-take.

**`--text-faint`.** `#5c6a7e` → `#78879c`, which clears 4.5:1 against all three surfaces (4.73 on the worst, `--bg-raised`). `test/ui/contrast.test.ts` reads the tokens out of the stylesheet and checks every text colour against every surface; it fails on the old value.

## Decisions made

- The fixed widths are CSS reservations (`min-width: 96px` on the phase pill, `2.2em` on the note name), measured in Chrome against every label and note name the app can show. jsdom has no layout, so no test can hold them; a font change could put "counting in" over 96px and the shifting would come back silently.
- `Pill` gained an optional `className` so one instance could reserve a width without every pill in the app doing so.
- Definitions were written into the prose at first use rather than collected into a glossary card, because the reader is at the knob when they need them.
- The audio-vocabulary copy has no test. A test can check that a word appears; it cannot check that the sentence around it teaches anything, and a test that passes on the word alone would go green the moment the explanation was deleted.

## Open items

- `docs/review-backlog.md` lists three copy items under "Teach, because nothing does" that commit 9f48223 appears to have landed already: tab is now taught in the first unit, the staff/tab trade is written into the `reading-tab` briefing, and the slash-chord sentence now says the note after the slash is aimed at the bass player. What is left of that first item is the always-there `TabChart` legend, which does not exist. Left untouched rather than edited from this branch.
- Not opened as a PR yet.

## Next session

Next off the backlog, in the order the handoff set: the result and coach cards vanishing when the next take starts, colour as the only signal in four places (RC7), and invisible focus on primary buttons.
