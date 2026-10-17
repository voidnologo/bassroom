# How the app hears you

## The constraint everything follows from

The open E string is 41.2 Hz. One cycle takes 24.3 ms. A period-based pitch detector needs at least two cycles in its analysis window to find one, and is markedly steadier with four.

So the floor on pitch latency is set by the instrument, not by the browser. Measured round-trip latency through Chrome with a decent interface is around 25–30 ms — smaller than the detector's own window requirement. Optimising the browser path would not move the number that matters.

The way out is not to make pitch detection faster. It is to stop making timing depend on it.

## The two paths

An attack and a pitch are detected separately, from the same signal, on different timescales.

```
input ──► DC blocker (20 Hz) ──┬──► onset detector ──────────────► "a note started at t"
                               │     envelope ratio, full rate      (~10 ms)
                               │
                               └──► lowpass + decimate 4:1 ──► ring buffer ──► YIN
                                      48 kHz → 12 kHz            128 ms        (~70–130 ms)
                                                                                   │
                                                                                   ▼
                                                                    "that note was a C2"
```

The onset gives the timestamp, immediately, at sample accuracy. The pitch arrives later and is attributed back to the onset that preceded it.

Which readings count is decided by the audio each one covers, not by its timestamp. A reading describes 128 ms of audio, so one taken shortly after an attack is mostly the _previous_ note; only readings whose window began at or after the attack are counted. The window's span is sent with every reading so that can be worked out exactly rather than approximated by a constant. Timing judgments use the first number; pitch judgments use the second. Neither waits for the other.

This also matters for honesty about the data. A bassist playing their own instrument against a click has a mean asynchrony of a couple of milliseconds. If the app reports a large consistent earliness, that is a measurement offset, not a player error — which is why latency calibration exists and why its result is kept separate from anything the player can adjust by feel.

## Sample rate is not assumed

The decimation factor and the window length are derived from whatever rate the device is actually running at, not hard-coded. They used to be fixed for 48 kHz, which made the analysis window 139 ms rather than 128 ms at 44.1 kHz, and made the detector's constructor throw outright at 192 kHz — an ordinary setting on an audio interface, and one where the app would have reported itself running while hearing nothing.

## Why decimate

YIN's difference function costs roughly `window × maxLag`, and both shrink with the sample rate. Bass fundamentals stop around 400 Hz, so dropping from 48 kHz to 12 kHz costs nothing musically and makes real-time analysis affordable on the audio thread.

The anti-alias filter is a fourth-order Butterworth at 18% of the output rate — about 2.2 kHz. That is much lower than the usual "just under Nyquist" choice, because at 40% of the output rate a 24 dB/octave rolloff has barely started and leaves only about 25 dB of rejection an octave up. At 18% it gives over 45 dB. Nothing is lost: period estimation needs the fundamental and its first few partials, all of which are well under 2 kHz.

## Why YIN, and which part of it

The first dip below the threshold is taken, descending to its local minimum — not the global minimum. Every periodic signal also repeats at two and three times its period, and YIN's cumulative mean normalisation makes those longer lags score marginally _better_ still. Taking the global minimum therefore reports an octave too low more often than not.

### A fix that was tried and removed

A sub-periodic check — having chosen a period, prefer twice it when twice it scores better — is a commonly recommended bass-specific correction. It was implemented here and removed.

Measured against synthesised tones, the true period scores between 0.0001 and 0.0007 on YIN's normalised difference, and twice the true period scores about 7% of that. The check therefore fires on _correct_ detections and converts them into octave errors. Every open string regressed.

The case it was meant to fix is a note whose fundamental is quieter than its second harmonic, which a real bass through a real pickup genuinely produces. That case is already handled: the odd harmonics stop the waveform from repeating at half its period, so plain YIN finds the fundamental even when there is no energy at it at all. There is a test for exactly that signal.

A waveform that really does repeat at half its nominal period — even harmonics strong, odd harmonics nearly absent — is reported at the octave. That is the correct answer for that waveform, and it is not a timbre a bass produces.

## Onset detection

A fast envelope (5 ms) is compared against a reference envelope, and an attack is declared when the fast one exceeds the reference by a ratio.

The reference is **asymmetric**: it falls in 50 ms and rises in 250 ms. This is the part that took two attempts. A symmetric average lags behind a decaying note badly enough to sit well above the true level, which eats the margin the ratio test depends on — four equally loud plucks half a second apart registered as one. Falling fast and rising slowly means the reference tracks a decay closely while an attack barely moves it.

During the refractory window after an attack, the reference snaps up to the fast envelope instead of easing toward it. The fast envelope keeps climbing for several milliseconds after the threshold is crossed, so without this the reference stays seeded at the low crossing value and the same note fires a second time the moment the window expires.

Comparing against a recent reference rather than an absolute threshold is what lets a re-pluck be detected on top of a note that is still ringing, instead of only finding silence-to-note transitions.

## What the browser does to your signal

`getUserMedia` enables echo cancellation, noise suppression and automatic gain control by default. All three are built for speech. Noise suppression is spectral subtraction and will treat a sustained 41 Hz tone as stationary noise; AGC breaks every amplitude threshold the onset detector depends on; all three add delay.

The app disables all three. But constraints are requests, not commands — a browser that does not honour one ignores it silently. So the settings are read back after the stream opens, and the app says so when any of them came back on.

## Where the code is

| Piece                            | File                                                       |
| -------------------------------- | ---------------------------------------------------------- |
| YIN                              | `src/audio/dsp/yin.ts`                                     |
| Onset detection                  | `src/audio/dsp/onset.ts`                                   |
| Filters, decimation, ring buffer | `src/audio/dsp/biquad.ts`, `decimator.ts`, `ringBuffer.ts` |
| The worklet that wires them      | `src/audio/worklet/pitch-processor.ts`                     |
| Stream and context ownership     | `src/audio/AudioEngine.ts`                                 |
| Click track                      | `src/audio/Metronome.ts`                                   |
| Latency measurement              | `src/audio/latency.ts`                                     |
| Attributing a pitch to an attack | `src/engine/PitchTracker.ts`                               |

The worklet is **generated** into `app/public/pitch-processor.js` by `npm run build:worklet`, and `npm run dev` keeps it rebuilt as its sources change. It is a build artifact rather than a module the page imports, so HMR does not reach it: a dev server without that watch serves whatever detector existed when it started, and a change to the DSP appears to have no effect at all. AudioWorklet modules cannot resolve bare imports, so the processor has to ship as one flat file; bundling it from TypeScript rather than hand-maintaining it is what lets the algorithms live in `src/audio/dsp` where tests can reach them.

## Known limits

- **A 4-string cannot play below E1.** Angel's lower-octave sections sit at 33 Hz and are out of reach; the app plays the whole song in the upper octave and says so.
- **The detector is monophonic.** Two notes at once will produce one answer or none.
- **Latency calibration asks you to play the bass, not tap a key.** Tapping introduces a human timing bias of its own that cannot be separated from the system delay afterwards.
- **A calibration run with a wide spread is reported as such.** If your own taps vary by more than the delay being measured, that is a steadiness problem and the app says so rather than quietly baking a meaningless number into every later judgment.
