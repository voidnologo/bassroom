# Continuation prompt

Paste the block below into a fresh Claude Code session started in `~/personal/bass`.

---

I'm picking up work on Bassroom, a bass-guitar practice app at `~/personal/bass` (public repo: github.com/voidnologo/bassroom). Everything is committed and pushed; the working tree is clean.

**Read these first, in this order:** `CLAUDE.md` (a router to the project's rules, no rules of its own), `.claude/rules/`, `README.md`, then `docs/sessions/HANDOFF.md`.

**Where it stands.** 1265 tests pass, coverage is ~89%, `npm run verify` is green, `npm run build` is green, and `node .claude/skills/quality-check/scripts/gates.mjs --all` reports nothing. CI runs more than `verify` does: coverage thresholds, the build, and the gates.

The last session did a design/architecture/standards review and then a long run of UI work. In short: deleted a lot of surface nothing read, made several rule-enforcement claims actually true, replaced the on-screen tab with something playable, and wired a play-along playhead through both the highway and the chart. `git log --oneline 435134b..HEAD` is the list.

**Still true, and the thing that matters most:** nobody has played a real bass into this. Every detector constant in `src/audio/dsp/` was tuned against synthesised plucks.

## What I want from this session

Pick up wherever I point you. If I don't say, ask — don't guess from the list below.

## The tuning session is paused mid-way

`docs/sessions/tuning-prompt.md` drives a session with the bass plugged in, one step at a time. It is written to be read by you, and it carries the constants, what each one does, and the protocol.

`docs/sessions/logs/tuning-2026-10-13.md` has a "Paused — how to resume" block. We got through Step 1 and stopped before Step 2. No takes were recorded and no constant has moved.

Diagnostics now exist and are off by default: Settings → Detector diagnostics writes every pitch frame (time, frequency, clarity, rms, midi, cents), every onset (time, level, riseRatio) and the calibration taps to `data/sessions/diagnostics-<date>.jsonl`, beside the takes in `takes-<date>.jsonl`. Both are gitignored, so findings have to be written into the session log to survive.

## Known open, roughly in order

- **Practice scheduling.** `buildDailyPlan` orders reviews by urgency then fills the remainder of a six-item plan. The better-supported design is an increasing schedule — blocked, then serial, then random — gated on error rate rather than the calendar. `docs/research-notes.md` says so. Largest gap between the evidence and what is built.
- **A decision nobody has made:** the Dashboard heading says "then one new thing"; the code fills to six.
- **The coach server trusts the browser for its prompt.** `handleReview` forwards whatever `system` string it is sent using the server's key; `promptVersion` is ignored; the model's answer is never stored. `/api/takes` also stores whatever it is handed — `/api/diagnostics` validates and names the bad field, and `/api/takes` should do the same.
- **The take lifecycle runs in two directions.** `PracticeSession` publishes `onBeat`/`onPitch`/`onNote` that nothing subscribes to, while `usePracticeTake` reaches back through `getTimeKeeper()` and sideways to `engine.onPitch`. Pick one.
- **`useTakeCompletion` is a React hook with nothing React in it** — telemetry, the POST, `recordAttempt` and the coach call all live in `usePracticeTake`.
- Section exercises lose their bar offset; JSONL appends are not serialised; `recentTakes` is session-scoped. The rest of the smaller items are listed in the handoff.

## Rules worth knowing before you change anything

- Do not raise a complexity budget to make code pass (CX5) — extract a function. This fired four times last session and was right every time.
- Do not add features beyond what was asked (ST5).
- When code and a rule disagree, say so and ask (ST7). Several rules were corrected last session because the rule was wrong; each one says which way it moved and why.
- A bug fix starts with a test that fails for the bug's reason (TS6), and a test that cannot fail is worse than none (TS1/TS2). Several tests last session passed vacuously on first writing — against a screen that was not mounted, against a locked row, against a default that had not changed. Mutation-check anything that matters by breaking the fix and watching it go red.

## Things that will waste your time if you don't know them

- `app/public/pitch-processor.js` is generated from `src/audio/worklet/` and is untracked. Changing anything in `src/audio/dsp/` or `src/audio/worklet/` needs `npm run build:worklet` **and a hard reload** — Vite does not hot-reload that bundle and the URL has no cache-buster. A change that appears to do nothing is almost always this.
- The tab files in `tabs/` are generated from the song charts; `npm run verify` fails if they have drifted. Run `npm run tabs`.
- `docs/audio-pipeline.md` records a commonly recommended detector fix that was implemented, measured and removed. Do not re-add it without new evidence.
- The hymn's notes come from the publisher's MusicXML. Changing a pitch means changing the `provenance` too.
- The shell has `noclobber`: overwrite with `>|`, not `>`.
- Driving the app from the browser is useful, but a React-controlled checkbox toggled with raw `.click()` reports a `.checked` the component does not agree with. Prefer a test for anything subtle.

## My setup

Focusrite Scarlett Solo. macOS here, Omarchy Linux at home — on Linux the interface has to be visible to PipeWire before Chrome offers it at all.

Use subagents for any review fan-out rather than reading everything into the main conversation.
