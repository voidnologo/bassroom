# Handoff

**Last updated:** 2026-10-13
**Last session:** initial build

## Where it is

The app runs end to end. `cd app && npm run dev` serves it at :5173 with the coach server on :8787, telemetry writes to `data/sessions/*.jsonl`, and `npm run verify` is green. Line coverage is above 80%.

Everything in the roadmap is built: audio, judging, content, progress, the coach layer, and six screens. Both target songs are transcribed, playable, and generating their own tab files.

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
