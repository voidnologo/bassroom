# Bassroom

A practice coach that teaches bass guitar from zero, listening to the player through an audio interface and giving feedback on pitch and timing.

This file routes you to the rules and contracts for the code you are about to change. It holds no rules of its own.

## Stack facts

- TypeScript 5.6, strict mode. React 18, function components only. Vite 5 is the bundler and dev server.
- No CSS framework. Styling is hand-written CSS with custom properties in `src/styles/`.
- State: `zustand` for app state, `idb-keyval` for persistence. No Redux, no React Context for app state.
- Audio: the Web Audio API directly. No Tone.js, no Howler, no pitch-detection library — the DSP is ours and lives in `src/audio/dsp/`.
- The coach server (`server/`) is plain `node:http` with zero dependencies. Keep it that way; it exists so an API key never reaches the browser bundle.
- Read `app/package.json` for versions before writing code against a library. Do not add a dependency without saying what it replaces.

## Commands

Run these from `app/`.

```
npm run dev            # worklet build + Vite + coach server
npm run verify         # format:check, lint, typecheck, test — the gate
npm run test           # vitest
npm run test:coverage  # vitest with the 70% threshold enforced
npm run build:worklet  # regenerate public/pitch-processor.js from src/audio/worklet/
```

`public/pitch-processor.js` is generated and untracked. `npm run dev` and `npm run build` regenerate it; nothing should edit it.

## If you're working on X, read Y

| Area | Paths | Rules |
|---|---|---|
| Pitch/onset algorithms, the worklet | `src/audio/dsp/**`, `src/audio/worklet/**` | [audio-thread.md](.claude/rules/audio-thread.md) |
| AudioEngine, Metronome, calibration | `src/audio/*.ts` | [audio-thread.md](.claude/rules/audio-thread.md) |
| Exercises, songs, curriculum | `src/content/**` | [music-content.md](.claude/rules/music-content.md) |
| Screens and components | `src/ui/**` | [react-ui.md](.claude/rules/react-ui.md) |
| Judging, ladders, scoring, progress | `src/engine/**`, `src/progress/**` | [typescript-style.md](.claude/rules/typescript-style.md) |
| The AI coach | `src/coach/**`, `server/**` | [coach-contract.md](.claude/rules/coach-contract.md) |

### Cross-cutting rules

| Rule | Covers |
|---|---|
| [typescript-style.md](.claude/rules/typescript-style.md) | types, naming, module boundaries, function design |
| [complexity.md](.claude/rules/complexity.md) | the complexity and nesting budgets, and that they are not to be raised |
| [testing-standards.md](.claude/rules/testing-standards.md) | what a test must be able to fail for |
| [minimal-comments.md](.claude/rules/minimal-comments.md) | what a comment may say |
| [system-stewardship.md](.claude/rules/system-stewardship.md) | how far to clean up around a change |
| [pr-standards.md](.claude/rules/pr-standards.md) | commits and pull requests |

### Skills to run

- `/quality-check` before opening a PR, and before saying a change is done.
- `/session-start` and `/session-end` around a working session; the log lives in `docs/sessions/`.

## Where new code goes

| Layer | Holds | Must not |
|---|---|---|
| `src/audio/dsp/` | Pure signal processing. No Web Audio types. | Allocate inside a per-sample or per-block method (AU1). Reference `window`, `document`, or `AudioContext`. |
| `src/audio/worklet/` | The AudioWorkletProcessor and its message contract. | Contain an algorithm. It is plumbing; the algorithm goes in `dsp/` where tests reach it (AU4). |
| `src/audio/` | Web Audio ownership: stream, context, nodes, scheduling. | Leak an `AudioNode` or `AudioContext` to a caller above it (AU7). |
| `src/music/` | Pitch arithmetic, fretboard geometry, content types. | Import from `audio/`, `engine/`, `ui/`, or `content/`. |
| `src/content/` | Exercises, songs, curriculum. Data, not logic. | Contain a bare MIDI integer (MC1) or a transcription without provenance (MC3). |
| `src/engine/` | Judging, scoring, tempo progression. Pure functions. | Import from `ui/` or `audio/`. Read or write storage. |
| `src/progress/` | Mastery, scheduling, gamification, persistence. | Contain judging logic (that is `engine/`). |
| `src/coach/` | Feedback providers behind one interface. | Hold a provider's API key or call a provider directly from the browser (CO3). |
| `src/ui/` | React components and screens. | Create audio nodes (RC4). Hold music theory (RC6). |

## Keeping the music right

The transcriptions are the point of the project, and a wrong note taught confidently is worse than no lesson. Every song in `src/content/songs/` cites where its notes came from in a `provenance` field, and the hymn's notes are derived from the publisher's own MusicXML rather than transcribed by ear. Changing a pitch means changing the provenance too.
