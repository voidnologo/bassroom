# Handoff

**Last updated:** 2026-10-13
**Last session:** design, architecture and standards review, and the fixes it justified

## Where it is

The app runs end to end. `cd app && npm run dev` serves it at :5173 with the coach server on :8787, telemetry writes to `data/sessions/*.jsonl`, and `npm run verify` is green. The README now shows the app; the screenshots in `docs/screenshots/` are the running app against live input.

Still not played by a human with a bass. Every number in this project comes from synthesised signals.

## What the October review changed

**A take the detector heard nothing in was credited as practice.** Sitting through a take in silence scored 0/100 with every note missed, then earned XP, a level, a streak day and the "First note" badge. `abandoned` already existed to stop exactly this, but only covered stopping early, not never starting. Such a take is now recorded in the history and excluded from XP, the streak, the ladder, the review schedule, and the self-estimate score.

**`YinDetector` had no `reset()`**, which AU3 requires of every DSP class, and the worklet reset every member except it. Nothing broke — both its buffers are scratch — but nothing enumerated the DSP classes either, so a class with no reset was invisible to the tests that claimed to enforce the rule. `test/dsp/resetContract.test.ts` now fails when the class list and the directory disagree.

**`src/engine/` imported from `src/audio/`**, which `CLAUDE.md` forbids, while the enforcing test permitted it. `PitchFrame`, `OnsetEvent` and `BeatEvent` moved into `audio/contracts.ts` — which had been importing them back from the two implementations it stands in front of — and the layering test now forbids what the table says.

**Warning-level lint rules were doing nothing.** `eslint .` exits 0 on a warning, so `no-console` (TY9) and the react-hooks rules were documentation. Both are errors now, with `--max-warnings 0` behind them. The complexity budgets claimed `app/server/**` but matched only `.ts`/`.tsx`, so none applied to the server; they do now.

**The tempo slider was reset by finishing a take**, because tempo and the retention-check toggle were store values mirrored into component state and re-synced by an effect. Both read through `useOverride` now: the learner's choice wins until the exercise changes.

**"Loop that bar" ran the whole exercise.** The advice was good; the button was the part that lied. The coach only renders a button for actions the app can carry out.

**Deleted**: result fields computed every take and read by nobody (`bestClearedBpm`, `LadderOutcome.change`, `PitchResolution.agreement`/`.frameCount`, `AttemptResult.streakOutcome`, `storageStatus`), unreachable accessors on `Metronome` and `AudioEngine`, `CoachService.refresh`/`useModelWhenAvailable`, `locate`, the `free-play` practice mode that had no branch to implement it, `GET /api/takes`, the `NoteNames` fretboard layer, and `CoachRequest.exercise`/`.judgments`.

## Known deferred

**Practice scheduling.** `buildDailyPlan` orders reviews by urgency then fills the remainder of a six-item plan with new material. The better-supported design is an increasing schedule — blocked, then serial, then random — gated on the learner's error rate rather than the calendar. This is the largest gap between the evidence in `research-notes.md` and what is built.

**A decision, not a defect: how much new material a day.** The Dashboard's own heading says "then one new thing"; the code fills to six. The docs now describe the code. Which one is right is a product call nobody has made — on a fresh install it is the difference between one exercise and four on the first screen.

**The coach server trusts the browser for its prompt.** `handleReview` forwards whatever `system` string it is sent, using the server's API key. `promptVersion` is sent and then ignored, so nothing ties a stored take to the prompt that produced its feedback, and the model's answer is never written to the JSONL at all. Keep the prompt server-side keyed by version, reject unknown versions, and store the feedback beside the take.

**The server stores whatever it is handed.** `handleRecordTake` checks that the body is an object with an integer `schemaVersion`, then appends it verbatim. Nothing checks `takeId`, `recordedAt`, `score`, or that `notes` is an array. These files are the training material for every future coach. Roughly twenty lines of hand-written validation; the zero-dependency constraint is not what is costing anything here, the validation simply has not been written.

**Section exercises lose their bar offset.** A chorus-only exercise renumbers from bar 1, so when the coach says "loop bar 3" the printed chart in `tabs/` says bar 15. `SongExerciseSpec` knows the section; the offset just is not carried.

**JSONL append integrity.** Appends are not serialised and records are bounded only by the 2 MB body limit, so two takes finishing at once can interleave. A reader should also skip a trailing unparseable line rather than counting it.

**`recentTakes` is session-scoped.** The recurring-trouble-spot rule cannot see yesterday's takes even though the server has them, and it is silent for the first two takes of every session.

**The take lifecycle runs in two directions.** `PracticeSession` publishes `onBeat`, `onPitch` and `onNote` that nothing subscribes to, while `usePracticeTake` reaches back through `getTimeKeeper()` for the beat and sideways to `engine.onPitch` for the pitch. `expandRepeats(exercise)` is also called in both, giving two index spaces that agree only because both call the same pure function. Pick one direction.

**`useTakeCompletion` is a React hook with nothing React in it.** Telemetry construction, the POST, `recordAttempt` and the coach call all live in `usePracticeTake`, so three pure data transforms cost a full screen render to test.

**Smaller, each worth a line:**

- `AudioEngine.setOptions` is gone, so `enterClarity`/`exitClarity` are the constructor defaults. To change them for a real instrument, edit the literal in `AudioEngine`'s constructor.
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
- `AudioProvider` holds the coach as well as the engine, so a coach error re-renders every screen including a running take.
- `Fretboard.firstFret` is threaded through the layout and is always 0. Unpicking it changes fretboard geometry, which wants checking against a real screen.
- `Practice.tsx` casts `setScreen(next as ScreenId)` because `ScreenId` is not exported and every screen types navigation as `(screen: string) => void`. The screen ids `today` and `tuner` do not match the files `Dashboard.tsx` and `Setup.tsx`.

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
