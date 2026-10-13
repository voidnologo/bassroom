# Handoff

**Last updated:** 2026-10-13
**Last session:** initial build

## In flight

First build of the app. The audio layer and the judging engine are done and tested; content, UI, progress tracking, and the coach layer are being built on top of them.

## What is settled

- The pitch pipeline (decimate 4:1, YIN over a 128 ms window, separate envelope onset detection) is verified end to end against synthesised bass tones to within 10 cents across the whole range. See `docs/audio-pipeline.md`.
- The hymn's notes come from the publisher's own MusicXML, not from ear transcription. The Angel riff is cross-referenced across several sources; `tabs/angel-massive-attack.md` records which agreed.
- Tempo progression is automated by the ladder in `src/engine/tempoLadder.ts` rather than left to the player's judgment.

## Next

Follow the roadmap in `docs/curriculum.md`.

## Gotchas

- `app/public/pitch-processor.js` is generated. Edit `app/src/audio/worklet/` and run `npm run build:worklet`.
- Timing judgments need the measured input latency. Until a player has run calibration, treat timing feedback as provisional.
