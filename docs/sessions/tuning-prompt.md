# Tuning session prompt

Paste the line below into a fresh Claude Code session started in `~/personal/bass`:

> Read `docs/sessions/tuning-prompt.md` and run the session it describes. I have a bass and a Scarlett Solo in front of me.

Everything after this point is addressed to Claude.

---

## What this session is

The detector has never heard a real instrument. Every constant in `src/audio/dsp/` was tuned against synthesised plucks, and the point of tonight is to find out which of them are wrong and move them, with a measurement behind each move.

Caleb is a beginner bassist. He is the instrument under test as much as the software is, which is why several steps below control for "did he play it" before concluding "we failed to hear it". Do not let a tuning conclusion rest on a take where that ambiguity was not controlled.

## How to run it — read this twice

**Present exactly one step at a time. Then stop and wait.**

- Give one step. Nothing about the next one.
- End every step with a single explicit instruction: what to play, how many times, and what to say when it is done.
- Wait for him to confirm before continuing. Do not chain steps together, do not say "then do X", do not preview what comes next.
- For any step where you will read a log afterwards, say so up front and tell him to say **"ready"** before he starts playing, and **"done"** when he stops. Read the log only after "done".
- After reading a log, report what you found in a few lines before offering the next step. If a take is unusable, say so and ask for it again rather than analysing it anyway.
- He is holding a bass. Keep each step short enough to remember without looking back at the screen.

If he asks to skip ahead or reorder, do it. The order below is the order that makes each result interpretable, so if a step is skipped, say what that costs.

## Before you prompt him for anything

Do this silently, then give him Step 1.

1. Read `docs/sessions/HANDOFF.md` — the "Playing it for the first time" section and the deferred list.
2. Read `docs/audio-pipeline.md`. It records one commonly recommended fix that was implemented, measured, and removed because it made things worse. **Do not re-add a sub-periodic octave check without new evidence from tonight.**
3. Confirm `npm run verify` is green before you change anything, so a later failure is yours.
4. Create `docs/sessions/logs/tuning-<today>.md` and keep it open. The raw JSONL under `data/` is gitignored and will not survive to the next session — anything you conclude has to be written into that log, with the numbers.

## Where the numbers come from

Two files per day, both under `data/sessions/`, both gitignored:

- `takes-<date>.jsonl` — one line per take. Per note: `verdict`, `timingErrorMs` (signed, latency-corrected, negative is early), `semitoneError`, `centsOffset`, `level`, `bar`, `beatInBar`, and a `detection` block (`riseRatio`, `agreement`, `frameCount`, `clarity`).
- `diagnostics-<date>.jsonl` — the raw signal, only written when diagnostics are on. Every pitch frame (`time`, `frequency`, `clarity`, `rms`, `midi`, `cents`) at roughly 47 Hz, every onset (`time`, `level`, `riseRatio`), and for a calibration run the individual `tapOffsetsMs`. Tied to the take by `takeId`.

**Trust `score.totalTargets`, not `exercise.noteCount`.** `noteCount` is the unexpanded figure and is wrong whenever an exercise repeats — a four-note exercise with four repeats reports `noteCount: 4` and `totalTargets: 16`. This is a known defect on the deferred list; work around it, do not fix it tonight.

Read the files directly. Write throwaway analysis scripts in your scratchpad, not in the repo.

## The constants, and what each one does

**In the worklet bundle** — changing any of these requires `npm run build:worklet` **and a hard reload in the browser** (Cmd+Shift+R). The worklet is a separate bundle served from `public/`, Vite does not hot-reload it, and the URL has no cache-buster. A change that appears to do nothing is almost always this.

| Constant | Where | Default | Turn it when |
| --- | --- | --- | --- |
| `riseRatio` | `src/audio/dsp/onset.ts` | 1.8 | Plucks go unheard (lower) or noise registers as notes (raise) |
| `refractoryMs` | `src/audio/dsp/onset.ts` | 70 | One pluck reads as two (raise) or fast notes merge (lower) |
| `floorDb` | `src/audio/dsp/onset.ts` | −52 | Hum or hiss triggers onsets (raise) |
| `referenceRiseSeconds` / `referenceFallSeconds` | `src/audio/dsp/onset.ts` | 0.25 / 0.05 | The reference tracks the decay too fast or too slow |
| `threshold` | `src/audio/dsp/yin.ts` | 0.15 | Octave errors on the low strings |
| `minFrequency` | `src/audio/dsp/yin.ts` | 36 | A flat open E reads as nothing |

**In the main bundle** — a page reload is enough, no worklet build.

| Constant | Where | Default | Turn it when |
| --- | --- | --- | --- |
| `enterClarity` / `exitClarity` | `AudioEngine` constructor | 0.85 / 0.65 | The on-screen pitch readout flickers through a note's decay |
| `minRms` | `AudioEngine` constructor | 0.004 | The readout drops out on quiet notes |
| `minClarity` | `DEFAULT_PITCH_TRACKER_OPTIONS` | 0.85 | Notes are judged wrong-pitch despite sounding right |

**These are two different clarity gates and they are easy to confuse.** `enterClarity`/`exitClarity` govern what the *readout shows*. `PitchTracker.minClarity` governs which frames *count toward judging a note*. A flickering display and a wrongly judged note are different problems with different dials.

Timing windows are derived from tempo in `windowsForTempo` (`src/engine/judge.ts`): perfect is 12% of a beat clamped to 55–120 ms, good is 25% clamped to 110–240 ms. Do not touch these tonight — they are a judgment call about what counts as good playing, not a detector constant.

## Rules for changing anything

- **One constant at a time, then re-measure.** Two changes at once and neither result means anything.
- **Every change needs a measurement in the commit body.** "Raised refractoryMs to 95: at 70 ms, 11 of 48 plucks produced a second onset 72–88 ms later (take `<id>`)." Not "felt better".
- **Update the constant's comment.** These comments currently say the value came from synthesised plucks. After tonight the honest origin is a real bass on a real interface on a stated date, which is strictly better provenance — say so.
- Do not raise a complexity budget to make code pass (CX5). Extract a function.
- Do not add features (ST5). If a measurement suggests one, write it into the handoff.
- Commit each tuning change separately with `npm run verify` green.
- If a constant looks wrong but you cannot explain *why* from the data, say that, and leave it alone.

---

## The session

Present these one at a time. The parenthetical after each heading is for you, not for him.

### Step 1 — Hardware and gain

**Ask which machine he is on before anything else.** He works on macOS here and on Omarchy at home, and the Linux box has a precondition the Mac does not: the Scarlett must be visible to PipeWire before Chrome will offer it at all. On Linux, have him run this before opening the browser:

```bash
wpctl status | grep -iA5 Sources     # or: pactl list short sources
```

If the Scarlett is not listed, the browser is not the problem and nothing in Chrome will fix it — check `systemctl --user status pipewire wireplumber`, and that the interface is powered and enumerated (`lsusb`). If it appears only after Chrome was already open, the device list needs a page reload before it shows up. Treat "the Scarlett is missing from the dropdown" as a Linux audio-stack question until PipeWire says otherwise: it looks exactly like a dead input and has nothing to do with this codebase.

Then, on either machine: bass into input 1 on the Scarlett, `cd app && npm run dev`, open http://localhost:5173 in Chrome, go to **Setup**, choose the Scarlett explicitly in the device list — not "Default input" — and press **Start listening**.

Then: play hard, and watch the halo ring. Raise the interface gain until it glows green on a hard dig and never flashes red. A clipped signal is harder to read a pitch from, not easier.

*(Ask him to confirm the halo behaviour in words. If it flashes red at normal playing strength the gain is too high and every later measurement is contaminated.)*

### Step 2 — Turn diagnostics on

**Settings → Detector diagnostics →** tick "Record the raw signal behind each take".

*(Off by default. Nothing below works without it. Confirm a `diagnostics-<date>.jsonl` appears after the first take, and say so if it does not — a silent failure here wastes the whole session.)*

### Step 3 — Latency, three times

Setup → **Measure latency**. Play the open E on every click for four bars, as exactly on the beat as he can. Repeat three times.

Ask him to read out the offset and the quality wording each time, *and* read `tapOffsetsMs` from the diagnostics file yourself.

*(What you are looking for: an offset stable within about ±10 ms across the three runs, and a spread under 45 ms. If the spread is wide, the taps tell you whether it is one stray hit or genuine unsteadiness — that distinction is the reason the taps are recorded. A wide spread from unsteadiness is a fact about the player, not a bug, and the gate wording already handles it.)*

### Step 4 — Open strings, pitch only

**The path → The plucking hand → Find each string.** This is call-and-response, so there is no click and no self-estimate prompt. Play each string as prompted, letting it ring.

*(Read `semitoneError` and `centsOffset`. A `semitoneError` of ±12 is an octave error — most likely on the low E at 41.2 Hz, which is the hardest case and the reason `minFrequency` sits at 36. A consistent `centsOffset` across all four strings is his tuning; a per-string offset is more interesting. Also read `detection.clarity` and `detection.frameCount` — a correct pitch resolved from very few frames is fragile even when the answer is right.)*

### Step 5 — Onset counting, three dynamics

**This is the most important step of the night.** Open strings in time, 16 notes after repeats, on the E string.

Three takes, back to back: soft, normal dynamic, hard. For each one he must play **exactly one pluck per click and nothing else** — no stray open strings, no fret noise he can avoid, no extra notes at the end. Tell him this is what makes the result mean anything: without a known pluck count, a "missed" note cannot be told apart from a note he did not play.

Ask him to say which dynamic each take was, or to do them in that order and tell you when all three are done.

*(Then, per take:*
- *`extraNotes` > 0 → double-triggering. Two onsets cannot be closer than `refractoryMs`, so look at the actual gaps between onset times in the diagnostics file. Gaps clustered just above 70 ms say `refractoryMs` is too short for this instrument. Gaps scattered anywhere say something else is making noise — fret buzz, a sympathetic string, the pick-up of his other hand.*
- *`missedNotes` > 0 on a take where he played all 16 → under-detection. Find the expected beat time, then look at the frames around it: if RMS rose and no onset fired, the attack did not clear `riseRatio`. That is the direct evidence for lowering it.*
- *Read `detection.riseRatio` across all the onsets that did fire. The distribution against the configured 1.8 is the whole answer: a soft-take minimum of 1.9 means there is almost no margin and soft playing will drop notes. This is why three dynamics and not one.)*

### Step 6 — Flicker on a decaying low E

Setup → the tuner. Play the open E and let it ring all the way out, watching the readout. Ask him to describe what he sees: does it hold steady at E, drop out, or jump around?

Then, for evidence you can read: back to **Find each string**, and play it again letting every string ring all the way out before the next prompt.

*(His description of the tuner is the only evidence for the readout itself — the recorder buffers frames on the Setup screen but only writes them when a calibration run completes, so a note played into the tuner alone leaves no file. The second take is what gives you frames through a real decay.*

*In that take's diagnostics, follow `clarity` from each attack to silence. Clarity oscillating across 0.85 while the note is still clearly sounding means `enterClarity` is too high for a real decay. Clarity crossing below 0.65 well before the note dies means `exitClarity` is where the dropout comes from. Cross-check against his description: if he saw flicker and the frames are steady, the problem is in the readout path, not the detector.*

*This dial affects only what is displayed. Do not change `PitchTracker.minClarity` on the strength of this step — that one decides which frames are allowed to judge a note, and Step 4's `detection.frameCount` is its evidence.)*

### Step 7 — Sixteenths at speed

**Splitting a beat into four**, starting at 45 bpm, then step the tempo slider up and repeat until it breaks or reaches 90.

Then **Angel — full riff** with the slider at 107 bpm, which is the tightest timing any content in the app asks for: sixteenths there are 140 ms apart against a 70 ms refractory.

*(What breaks first tells you which constant is binding. Notes merging — two plucks, one onset — means `refractoryMs` is too long at that tempo. Extra onsets appearing only at speed usually means the reference envelope is not falling fast enough between notes, which is `referenceFallSeconds`. If Step 5 told you to raise `refractoryMs` and this step says lower it, you have found the real constraint and should say so plainly rather than splitting the difference.)*

### Step 8 — Report before you change anything

Stop and summarise: what held up, what did not, and for each failure the measurement behind it and the single constant you propose moving, with the value and the reason. Ask him which to do first.

*(Do not change anything before this step. A tuning session that edits as it goes cannot tell which change did what.)*

### Step 9 — One change, then re-measure

Apply one constant change. Rebuild if it is in the worklet bundle. Hard reload. Then re-run **the specific step that failed** — not the whole battery — and compare the numbers directly against the earlier take.

Keep it if the measurement moved. Revert it if it did not. Say which, in the log, with both numbers.

*(Repeat for each change. Commit each one separately.)*

### Step 10 — Write it up

Fill in `docs/sessions/logs/tuning-<today>.md`: the takes, the numbers, every constant moved with its before and after, and anything that looked wrong but could not be explained from the data.

Then update, as warranted:

- `docs/audio-pipeline.md` — the constants section, and the fact that these figures now come from a real instrument rather than synthesised plucks.
- `docs/sessions/HANDOFF.md` — strike "it has not been played" and the four first-play checks, and replace them with what is now known.
- The comment above each constant you moved (TY11: a tuned constant states where the number came from).

Confirm `npm run verify` is green and the gates are clean, then ask whether to push.

---

## Things that will go wrong, and what they mean

**A constant change appears to do nothing.** It is in the worklet bundle and you did not run `npm run build:worklet`, or the browser served the cached `pitch-processor.js`. Hard reload.

**The Scarlett is not in the device dropdown at all (Linux).** PipeWire is not exposing it, so Chrome cannot enumerate it. `wpctl status` is the check; the browser is downstream of that and cannot be made to see a device the audio server does not have. On macOS the equivalent is the interface not being selected in Audio MIDI Setup.

**No diagnostics file appears.** The toggle is off, or the coach server is not running. `npm run dev` starts both; check port 8787 is up.

**Every note reads as missed and the score is zero.** The app is not hearing the instrument at all — wrong input device, interface not selected in the OS, or gain at zero. Do not tune anything on this take. Note that such a take is deliberately excluded from XP, the streak, the ladder and the review schedule, so it will not pollute his progress.

**Timing is consistently late by a similar amount on every note.** Latency calibration has not been run, or was run and rejected. Timing feedback before calibration is provisional.

**He says the app feels wrong but the numbers look fine.** Believe him and find out why. The numbers describe what the detector did, not what the experience was, and the screen is his evidence. Several of the deferred items in the handoff are of exactly this shape.
