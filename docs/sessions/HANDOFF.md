# Handoff

**Last updated:** 2026-10-14
**Last session:** design/architecture review, then UI work on tab, navigation and play-along

## Where it is

The app runs end to end. `cd app && npm run dev` serves it at :5173 with the coach server on :8787. 1265 tests pass, coverage ~89%, `npm run verify` and `npm run build` are green, and the static gates report nothing.

**Still not played by a human with a bass.** Every detector constant in `src/audio/dsp/` comes from synthesised plucks. `docs/sessions/tuning-prompt.md` drives that session; it is paused after Step 1, logged in `docs/sessions/logs/tuning-2026-10-13.md`.

## What the last two sessions changed

**Review and cleanup.** A take the detector heard nothing in was being credited with XP, a level, a streak day and a badge; it is now recorded and then excluded from everything that reads as progress. `YinDetector` gained the `reset()` AU3 requires and the rule gained a test that enumerates the DSP classes. The contract types moved into `audio/contracts.ts` so `engine/` no longer names an audio implementation, and the layering test now forbids what CLAUDE.md says. Warning-level lint rules became errors with `--max-warnings 0`, and the complexity budgets now reach the server. A large amount of computed-and-never-read surface was deleted.

**Diagnostics.** Each note carries what the detector was working with — the rise ratio the attack cleared, the frame agreement, the frame count and the mean clarity. Behind a Settings toggle, the raw frames, onsets and calibration taps are written to `data/sessions/diagnostics-<date>.jsonl`.

**The tab.** The on-screen chart was rebuilt to be played from: measures flush in systems, bar lines as the only strong verticals, the time signature printed at the start and at each change, a counting row, and a line showing how long each note is held. The fixed-width rendering stays behind a "Printable" toggle. A **Reading tab** lesson was added, and Angel is the song the Songs screen opens on.

**Navigation and play-along.** Navigation keeps a trail, so returning from practising a song lands on the song that was open. The note being played is orange in both the chart and the highway, and the two are tested to agree on where a note is. The chart sits flush under the highway and is withheld during a retention check, because it is a cue.

**The lint hook had never run.** It invoked ESLint from the repo root, where there is no config, and failed on every file Claude edited.

## Known deferred

**Practice scheduling.** `buildDailyPlan` orders reviews by urgency then fills the remainder of a six-item plan with new material. The better-supported design is an increasing schedule — blocked, then serial, then random — gated on the learner's error rate rather than the calendar. This is the largest gap between the evidence in `research-notes.md` and what is built.

**A decision, not a defect: how much new material a day.** The Dashboard's own heading says "then one new thing"; the code fills to six. The docs now describe the code. Which one is right is a product call nobody has made — on a fresh install it is the difference between one exercise and four on the first screen.

**`/api/takes` stores whatever it is handed.** `/api/diagnostics` validates its body and names the field that is wrong; the takes route still checks only that the body is an object with a `schemaVersion`. These files are the training material for every future coach.

**The coach server trusts the browser for its prompt.** `handleReview` forwards whatever `system` string it is sent, using the server's API key. `promptVersion` is sent and then ignored, so nothing ties a stored take to the prompt that produced its feedback, and the model's answer is never written to the JSONL at all. Keep the prompt server-side keyed by version, reject unknown versions, and store the feedback beside the take.

**Section exercises lose their bar offset.** A chorus-only exercise renumbers from bar 1, so when the coach says "loop bar 3" the printed chart in `tabs/` says bar 15. `SongExerciseSpec` knows the section; the offset just is not carried.

**JSONL append integrity.** Appends are not serialised and records are bounded only by the 2 MB body limit, so two takes finishing at once can interleave. A reader should also skip a trailing unparseable line rather than counting it.

**`recentTakes` is session-scoped.** The recurring-trouble-spot rule cannot see yesterday's takes even though the server has them, and it is silent for the first two takes of every session.

**The take lifecycle runs in two directions.** `PracticeSession` publishes `onBeat`, `onPitch` and `onNote` that nothing subscribes to, while `usePracticeTake` reaches back through `getTimeKeeper()` for the beat and sideways to `engine.onPitch` for the pitch. `expandRepeats(exercise)` is also called in both, giving two index spaces that agree only because both call the same pure function. Pick one direction.

**`useTakeCompletion` is a React hook with nothing React in it.** Telemetry construction, the POST, `recordAttempt` and the coach call all live in `usePracticeTake`, so three pure data transforms cost a full screen render to test.

**Smaller, each worth a line:**

- `AudioEngine.setOptions` is gone, so `enterClarity`/`exitClarity` are the constructor defaults. To change them for a real instrument, edit the literal in `AudioEngine`'s constructor.
- `PLAYHEAD` in `NoteHighway.tsx` repeats `--playhead` from the stylesheet, because a canvas cannot read a custom property. The two have to move together.
- The click track keeps playing through the 400 ms judging window, and `Metronome.muted` (never set, now removed) was the handle that fix would have used.
- `telemetry.exercise.noteCount` is the unexpanded count and contradicts `notes.length` whenever `repeats > 1`.
- `PlayedNote.level` carries two different quantities: an onset envelope in play-along, a decimated frame RMS in call-and-response.
- The `thousand-notes` badge counts a sliding window, so it can still go down; it no longer counts notes that were merely asked for.
- `StreakState.current` extends by one however many days a freeze covered, which its own doc comment contradicts.
- `posture` and `note-names-d-g` are declared skills no exercise trains.
- The authoring DSL's `at('A3')` (A string, fret 3) is indistinguishable from the pitch name A3. A separator would fix it.
- `authoring.ts` rejects frets above 24; `FRET_COUNT` is 20.
- Heading order skips from `h1` to `h3` on the dashboard, practice and settings screens.
- The fretboard marks right and wrong by colour alone (RC7). `VerdictStrip` and `NoteHighway` both solve this already; the fretboard is the one element the learner watches while playing.
- `BARS_PER_SYSTEM` is fixed at four. On a narrow screen the sheet scrolls rather than reflowing.
- `AudioProvider` holds the coach as well as the engine, so a coach error re-renders every screen including a running take.
- `Fretboard.firstFret` is threaded through the layout and is always 0. Unpicking it changes fretboard geometry, which wants checking against a real screen.

## About the rules

Of the enforcement claims in `.claude/rules/` that name a venue rather than `review`, several did not hold. Fixed this session: TY9 and RC5's lint levels, the complexity budgets' reach into the server, AU3's test, TY6's layering test, and the `paths:` globs on `react-ui.md` (which stopped before `src/state/`, leaving `AudioProvider.tsx` — four `useState`s and three subscribing effects — governed by none of RC1, RC3 or RC5) and `typescript-style.md` (which excluded `.tsx` tests and the server).

TS3's venue pointed at `test/tooling/testStandards.test.ts`, which does not exist, and RC5's pointed at `exhaustive-deps`, which checks dependency arrays and says nothing about cleanup. Both are marked `review` until someone writes the scanner, rather than left claiming a gate that is not there.

**Still open, and worth a decision.** CO8 claims a test for the degrade-to-heuristic path, but no test imports `src/coach/index.ts`. AU8 claims a test for the `getUserMedia` constraints; no test references `getUserMedia`. `AudioEngine.requestPermission` calls it with no constraints at all, which is harmless today because the stream is stopped immediately, but the rule states no exception.

**And a question about the set.** Several rules restate each other — CX7 and ST2 share a verbatim reason string, CX3 and RC2 both set the 200-line budget and cite the same lint rule, TS1 and TS2 are a rule and its procedure, ST5 duplicates a global instruction. CX4 is systematically not followed: a scan finds a dozen branches over four lines and every one is a guard clause whose body is a single multi-line `return { … }`, where extracting a named function buys nothing. Either CX4 means something narrower than it says, or it is measuring the wrong thing. None of this was changed, because thinning the rule set is a decision about what the project wants to hold itself to.

## Playing it for the first time

See the README for how to start it. The four things to check with an instrument, and the constant to turn when each is wrong:

1. **Does the onset detector fire once per pluck**, at a real playing dynamic? `riseRatio` and `refractoryMs` in `src/audio/dsp/onset.ts` were tuned against synthetic plucks and are the most likely thing to need changing. One pluck reading as two means `refractoryMs` is too short; plucks going unheard means `riseRatio` is too high.
2. **Does latency calibration produce a stable figure**, spread under 45 ms? If it is wider, the gate wording is already written for that case.
3. **Does the pitch readout hold steady through the decay of a low E**, or flicker? `enterClarity`/`exitClarity` in `AudioEngine`'s constructor are the dial.
4. **Are the Angel riff's sixteenth notes detected as two separate attacks at 107 bpm?** That is the tightest timing the content asks for — sixteenths there are 140 ms apart, against a 70 ms refractory.

## Things worth knowing before changing something

- `app/public/pitch-processor.js` is generated. Edit `src/audio/worklet/` and run `npm run build:worklet`.
- The tab files in `tabs/` are generated from the song charts. Change a chart and run `npm run tabs`, or CI fails.
- A sub-periodic octave check was tried in the detector and removed with measurements; the reasoning is in `docs/audio-pipeline.md`. Do not re-add it without new evidence.
- The hymn's notes come from the publisher's MusicXML. If one looks wrong, check that file before changing the chart, and update the provenance either way.
- Timing feedback before latency calibration is provisional. The app does not currently say so on screen; it probably should.
- `npm run verify` is a lower bar than CI: CI also runs `test:coverage` with the 70% thresholds, the build, and `gates.mjs --all`.
