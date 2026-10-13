# Continuation prompt

Paste the block below into a fresh Claude Code session started in `~/personal/bass`.

---

I'm picking up work on Bassroom, a bass-guitar practice app at `~/personal/bass` (public repo: github.com/voidnologo/bassroom). Everything is committed and pushed; the working tree is clean.

**Read these first, in this order:** `CLAUDE.md` (a router to the project's rules, no rules of its own), `.claude/rules/` (91 numbered rules, each with an ID, a one-clause reason and an enforcement venue), `README.md`, then `docs/sessions/HANDOFF.md` — which has a "Known deferred" section listing what a previous review found and chose not to fix yet.

**Where it stands.** The app is built end to end: audio capture and YIN pitch detection in an AudioWorklet, onset detection, a practice session state machine, judging, a tempo ladder, spaced repetition, gamification, a pluggable coach layer with a local server, ten lessons of content, and six screens. 1,132 tests pass, coverage is 88%, `npm run verify` is green, and the static gates (`node .claude/skills/quality-check/scripts/gates.mjs --all`) report nothing.

A previous session ran three parallel deep reviews — audio/real-time, React/UI, domain/data — and fixed the large majority of what they found, including a product-breaking one where a beginner's first perfect take scored zero stars and was logged as a spaced-repetition failure, so the lesson path would never have unlocked.

**What I want from this session, before I plug a bass in:**

1. **One more design, architecture and standards review.** Not a repeat of the last one — assume the obvious correctness bugs are gone. I want you to look at it as a _system_: whether the layering still earns its keep, whether the abstractions are the right ones or just the ones that got built, whether anything is over-engineered for what it does, whether the rules in `.claude/rules/` actually describe the code and are enforced where they claim to be, and whether a person picking this up cold could find their way. Say plainly if something should be deleted or simplified rather than kept.

2. Then **fix what the review justifies fixing**, in incremental commits with `npm run verify` green at each one. Follow the project's own rules while doing it — in particular, do not raise a complexity budget to make code pass (CX5), and do not add features beyond what the review justifies (ST5).

3. Then tell me **exactly what to do to try it for the first time**, and what to watch for.

**Things to know before you start:**

- Nobody has played a real bass into this yet. Every number comes from synthesised signals. `docs/sessions/HANDOFF.md` lists the four things to check first with an instrument and which constant to turn when each one is wrong. Treat the onset detector's constants as the most likely to need adjusting.
- `app/public/pitch-processor.js` is generated from `src/audio/worklet/` and is untracked; `npm run dev` and `npm run build` build it via npm `pre*` hooks.
- The tab files in `tabs/` are generated from the song charts by `npm run tabs`, and `npm run verify` fails if they have drifted.
- `docs/audio-pipeline.md` records why the detector is shaped the way it is, including one commonly recommended fix that was implemented, measured, and removed because it made things worse. Do not re-add it without new evidence.
- `docs/research-notes.md` records what a research pass found, what was adopted, and what was considered and rejected with the reason.
- My hardware is a Focusrite Scarlett Solo, on macOS here and Omarchy Linux at home.

Use subagents for the review fan-out rather than reading everything into the main conversation.
