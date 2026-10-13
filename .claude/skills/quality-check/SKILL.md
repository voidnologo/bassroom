---
name: quality-check
description: Pre-merge review of the current branch. Runs the mechanical gates, then reviews the diff against the project rules for the things only a reader can judge. Use before opening a PR, before saying a change is done, or when asked to check code quality, review the branch, or verify the work.
allowed-tools: Read, Edit, Bash, Grep, Glob
---

# Quality check

A pre-merge review in three parts. A script finds the mechanical findings; you judge the rest. The rules in `.claude/rules/` are the standard — this skill cites them by ID rather than restating them.

## 1. Run the gates

```bash
cd app && npm run verify
node ../.claude/skills/quality-check/scripts/gates.mjs
```

`npm run verify` runs format, lint, typecheck, and tests. All four are **fix** — a failure means the branch is not ready.

`gates.mjs` scans the changed files and exits non-zero on any `fix` finding. Pass `--all` to scan the whole tree, `--base <rev>` to compare against a different base, `--json` for machine output.

| Gate | Rule | Kind |
|---|---|---|
| `dsp-purity` — Web Audio or DOM inside `src/audio/dsp/` | AU2 | fix |
| `ui-audio` — a component creating an audio node | RC4 | fix |
| `bare-midi` — a MIDI integer in content | MC1 | fix |
| `provenance` — a song chart with no stated source | MC3 | fix |
| `test-focus` — `.only` / `.skip` left in a test | TS4 | fix |
| `test-random` — unseeded `Math.random` in a test | TS8 | fix |
| `any-type` — `any` in `src/` or `server/` | TY1 | fix |
| `client-secret` — a literal credential in browser code | CO3 | fix |
| `console-log` — a log line shipped in `src/` | TY9 | fix |
| `audio-alloc` — allocation outside a constructor on the audio thread | AU1 | triage |
| `pitch-math` — what looks like hand-rolled pitch arithmetic | TY7 | triage |

Triage means reading the code and deciding. When a triage finding is correct code, say why in your report rather than dropping it silently.

## 2. Review the diff

Read the diff and judge the things no script can. Each bullet cites the rules it is checking.

- **Audio correctness.** Does anything on the audio thread allocate, block, or depend on wall-clock time (AU1, AU10)? Does a new DSP class have a `reset()` (AU3)? Did an algorithm end up in the worklet instead of `dsp/` (AU4)? Are timing judgments latency-corrected (AU9)?
- **Music correctness.** For every pitch, fret, tempo, or key that changed: does it match the cited source, and did the provenance change with it (MC3, MC4)? Is every note playable on a 4-string in standard tuning (MC6)?
- **Layering.** Does any module import from a layer above it, per the table in `CLAUDE.md` (TY6)?
- **Tests.** For each new test, name the production change that would turn it red. A test with no such change is asserting its own setup (TS1, TS2). Are repeated cases `it.each` rather than a loop (TS3)? Do numeric assertions state a tolerance in a real unit (TS9)?
- **Function design.** Any branch longer than four lines that should be a named function (CX4)? Any budget raised rather than a function extracted (CX5)?
- **Comments.** Does each new comment say something the code cannot (CM2)? Any that narrate a change, restate a line, or make a claim about code elsewhere (CM4, CM3, CM6)?
- **Scope.** Does the diff contain anything beyond what was asked for (ST2, ST5)? If it contains a refactor, what does the refactor remove (ST4)?
- **Accessibility.** Is any verdict signalled by colour alone (RC7)? Are new controls keyboard-reachable (RC8)?

## 3. Report

Three buckets. Each finding gets `path:line`, the rule ID, and the fix.

- **Must fix** — a `fix` gate finding, or a rule violation.
- **Should fix** — a triage finding you judged real, or a rule the change strains.
- **Suggestions** — everything else. Keep this short.

If all three buckets are empty, say so plainly and name what you checked.
