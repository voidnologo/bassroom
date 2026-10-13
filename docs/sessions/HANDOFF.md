# Handoff

**Last updated:** 2026-10-13
**Last session:** initial build

## Where it is

The app runs end to end. `cd app && npm run dev` serves it at :5173 with the coach server on :8787, telemetry writes to `data/sessions/*.jsonl`, and `npm run verify` is green. Line coverage is above 80%.

Everything in the roadmap is built: audio, judging, content, progress, the coach layer, and six screens. Both target songs are transcribed, playable, and generating their own tab files.

## Known deferred, from the review passes

These were found by the October review and judged worth doing but not blocking a first play. Roughly in order of value.

**Practice scheduling.** `buildDailyPlan` orders reviews by urgency then adds one new item. The better-supported design is an increasing schedule — blocked, then serial, then random — gated on the learner's error rate rather than the calendar. This is the largest gap between the evidence in `research-notes.md` and what is built.

**The coach server trusts the browser for its prompt.** `handleReview` forwards whatever `system` string it is sent, using the server's API key. `promptVersion` is sent and then ignored, so nothing ties a stored take to the prompt that produced its feedback, and the model's answer is never written to the JSONL at all — only the telemetry. Keep the prompt server-side keyed by version, reject unknown versions, and store the feedback beside the take.

**Section exercises lose their bar offset.** A chorus-only exercise renumbers from bar 1, so when the coach says "loop bar 3" the printed chart in `tabs/` says bar 15. `SongExerciseSpec` knows the section; the offset just is not carried.

**JSONL append integrity.** Appends are not serialised and records are bounded only by the 2 MB body limit, so two takes finishing at once can interleave. A reader should also skip a trailing unparseable line rather than counting it.

**`recentTakes` is session-scoped.** The recurring-trouble-spot rule cannot see yesterday's takes even though the server has them, and it is silent for the first two takes of every session.

**Smaller, each worth a line:**

- `telemetry.exercise.noteCount` is the unexpanded count and contradicts `notes.length` whenever `repeats > 1`.
- `PlayedNote.level` carries two different quantities: an onset envelope in play-along, a decimated frame RMS in call-and-response.
- The `thousand-notes` badge counts a sliding window of notes _asked for_, so it can go down, and a thousand missed notes earns it.
- `StreakState.current` extends by one however many days a freeze covered, which its own doc comment contradicts.
- `CoachRequest.judgments` and `.exercise` are required and read by no provider.
- `SkillStrength` is declared and computed nowhere; `posture` and `note-names-d-g` are declared skills no exercise trains.
- The authoring DSL's `at('A3')` (A string, fret 3) is indistinguishable from the pitch name A3. A separator would fix it.
- `authoring.ts` rejects frets above 24; `FRET_COUNT` is 20.
- The click track keeps playing through the 400 ms judging window.
- Heading order skips from `h1` to `h3` on the dashboard, practice and settings screens.

## What has not been done

**It has not been played.** Every number in this project comes from synthesised signals. The next session should be someone with a bass plugged into the Scarlett, and the first things to check are:

1. Does the onset detector fire once per pluck on a real instrument, at a real playing dynamic? The ratio and refractory constants in `src/audio/dsp/onset.ts` were tuned against synthetic plucks and are the most likely thing to need changing.
2. Does latency calibration produce a stable figure, and is the spread under 45 ms? If it is wider, the gate wording is already written for that case.
3. Does the pitch readout hold steady through the decay of a low E, or flicker? If it flickers, `enterClarity`/`exitClarity` in `AudioEngine` are the dial.
4. Are the Angel riff's sixteenth notes detected as two separate attacks at 107 bpm? That is the tightest timing the content asks for.

**Interleaving.** `buildDailyPlan` orders reviews by urgency and then adds one new item. The better-supported design is an increasing schedule — blocked, then serial, then random — gated on the individual's error rate rather than the calendar. This is the largest known gap between the evidence and what is built; `docs/research-notes.md` says so.

**Ear training.** The research found it is the most clearly articulated unmet demand in this market, and that an ear trainer answered by playing the note on a bass does not exist. Everything needed to build one is already here.

## Things worth knowing before changing something

- `app/public/pitch-processor.js` is generated. Edit `src/audio/worklet/` and run `npm run build:worklet`.
- The tab files in `tabs/` are generated from the song charts. Change a chart and run `npm run tabs`, or CI fails.
- A sub-periodic octave check was tried in the detector and removed with measurements; the reasoning is in `docs/audio-pipeline.md`. Do not re-add it without new evidence.
- The hymn's notes come from the publisher's MusicXML. If one looks wrong, check that file before changing the chart, and update the provenance either way.
- Timing feedback before latency calibration is provisional. The app does not currently say so on screen; it probably should.
