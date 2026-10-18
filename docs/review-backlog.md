# Review backlog

Findings from a three-part review (engineering, interface, copy) carried out against the rules in `.claude/rules/`. Items are listed with the file to change. Anything already fixed is not listed.

Two findings from that review were checked and did **not** hold, recorded here so they are not raised again: the note highway is not a fixed 300 px canvas (`.stack` is a column flex container, so the canvas is stretched by `align-items: stretch`, and `fitToDisplay` reads the stretched width); and the fretboard's string names and fret numbers do render — `docs/screenshots/practice.jpg` shows them. Their classes had no rule in the stylesheet all the same, which is what was fixed.

## Correctness

- **A failed coach request leaves the panel pending forever.** `ui/hooks/usePracticeTake.ts` calls `askCoach` with `void` and no `catch`, so a throw inside it leaves `coachPending: true` for the rest of the session. Wrap in `try/finally` and always clear the flag.
- **A take that fails to record is detected and discarded.** `recordTake` returns a boolean whose doc comment explains why the failure matters; the only call site ignores it. Either surface it or delete the return value and the comment.
- **A storage failure is only visible on Settings.** `state/progressStore.ts` sets `storageError`; only `ui/screens/Settings.tsx` renders it. A learner whose IndexedDB writes fail practises a whole session, sees XP awarded, and loses it. Belongs in the app shell.
- **The coach's demotion tempo is not clamped to the exercise floor.** `coach/heuristic.ts` computes `bpm * 0.9` twice in one object literal; `engine/tempoLadder.ts` clamps the same figure with `Math.max(floorBpm, …)` and the coach does not, so the slider can be set below its own minimum. Export one `demotedBpm(bpm, floorBpm)` and call it from both.
- **The coach recovers a bar number by regexing its own English.** `barFrom()` parses `/bar (\d+)/` out of a sentence built elsewhere in the file; rewording that sentence silently changes which bar the learner is told to practise. Put the bar on the observation as a field.
- **The lesson-unlock rule is implemented twice**, in `ui/screens/Dashboard.tsx` and `ui/screens/Path.tsx`, in different shapes. They can disagree about whether a lesson is open. Extract one function with a test.
- **"Where you are" always shows the first five lessons** (`Dashboard.tsx`, `LESSONS.slice(0, 5)`) regardless of progress.

## Server

`server/index.mjs` has no test for any route — only its four pure helpers are covered. It is the one process that writes user data to disk. Worth covering first: 404 routing, the body-size cap, the no-API-key path, upstream failure. An upstream timeout currently returns 500 "Internal error", which the browser reports as a server fault rather than a timeout. The record endpoints also return the absolute file path, which `handleStatus` deliberately withholds as disclosing the home directory layout.

## Interface

- **The primary action on the practice screen is below the fold** on a 13-inch laptop: Start sits under the fretboard, highway and chart. Move the transport bar up, under the target note.
- **Things move mid-take.** The phase pill's text changes four times per take, shifting the retention checkbox beside it; the 3rem note name changes width per note, shifting the text under it. Both want a fixed width.
- **The result and coach cards vanish when the next take starts**, collapsing the page height and throwing the scroll position.
- **`--text-faint` (`#5c6a7e`) fails WCAG AA** at roughly 3.1–3.5:1 against all three backgrounds, and it is the colour of most of the small print. One token change fixes every failing pair.
- **Colour is the only signal in four places** (RC7, which the stylesheet's own header claims to honour): right vs wrong on the fretboard is green vs red with identical shape; the target marker is green vs blue; `early` and `late` verdict chips are pixel-identical. The highway already solves this correctly with a lane offset — the strip should match it.
- **Focus is invisible on primary buttons**: the ring is `--accent` on a button filled with `--accent`. Needs its own token.
- **`.btn-primary` is used as a selected-tab style** on Songs and Settings, so the loudest things on those screens are selection states rather than actions.
- **Unhandled states**: coach offline renders nothing at all, indistinguishable from "no take yet"; the practice screen's blocked state prints the raw engine enum; first-run Today is a wall of zeroes with no starting point.
- **Below ~1075 px the tab chart scrolls horizontally during play** and nothing follows the playhead.

## Copy

The reader this is written for has years of trumpet behind them: fluent at reading rhythm, counting, time signatures and intervals. What they have never met is a fretboard or a recording chain. The audit was re-run against that profile and several of its first findings inverted, which is worth knowing before acting on any of it.

### Teach, because nothing does

- **Tablature is used from the first exercise and taught in the fifth lesson.** Every exercise with bars renders a tab chart, and the Songs screen is reachable on day one, but `reading-tab` sits behind three other lessons. Move it into the first unit, and give `TabChart` a legend that is always there. The strongest sentence for this reader is already written and buried seventh in that lesson: that printed tab usually cannot show note length and this app's charts do.
- **Connect tab to the staff**, which nothing currently does: a staff says which note and not where; tab says where and not which. On a bass the same pitch exists in three or four places, so tab is specifying something a staff cannot.
- **Fretting-hand finger numbers are a false friend.** The practice screen prints "finger 3" and the neck diagram draws a bare 1-4, and nothing says these are index, middle, ring, little. To a trumpet player 1, 2, 3 are valves — a plausible and wrong reading. Say it once in the fretting-hand briefing, and consider naming the finger in words on screen.
- **Slash chords are an instruction to the bass and are presented as context.** The hymn's chart carries `G/B` and `F/C`; the reading-tab briefing says a chord symbol "is context rather than instruction", which is exactly wrong for these — the letter after the slash is the note the bass is being told to play.
- **Instrument anatomy is assumed**: fret, truss rod, action, pickup, position, open string, floating thumb. Fret numbering never states that it counts from the tuning pegs.
- **Why a bass plays roots and fifths** is asserted and never explained. The bass is the bottom of the chord, so the note chosen is what tells a listener which chord they are hearing; a root and fifth state a chord without committing to major or minor. That is the job, and it is what makes one note per bar a complete part.
- **Intonation on a fretted instrument** has no counterpart in wind playing. The fret sets the pitch, so flat is not available — but pressing harder than the note needs stretches the string sharp.
- **Audio vocabulary** is the one place this reader is stranded: gain, clipping, noise floor, headroom, attack, latency, direct monitoring, dBFS, cents. Teach each once where it first appears. Cents wants anchoring to something known: 100 cents is one fret.

### Stop explaining what they already know

Time signatures, bar lines, that horizontal spacing is time, what a pickup bar is in a melody, what rushing and dragging mean, what a rest is. Several briefings define these at length. For this reader that reads as being talked down to, and it buries the one genuinely new fact in each paragraph.

### Messages that blame or claim too much

The latency screen tells a trained musician they have "a steadiness problem" on minute two, when a missed count-in or a low input level is likelier. It advises playing harder before checking the gain. The coach asserts causes it has inferred rather than measured, says "tension builds" which it cannot see, and gives the same cause twice for flat notes. The verdict strip calls a note "not played" when the app cannot tell not-played from not-heard.

### Mechanical

A literal `--` renders as two hyphens in two briefings. One briefing bullet is duplicated, and the two copies disagree about whether the bar number sits above or below. The storage error builds an ungrammatical sentence from a read-failure message wrapped in a save-failure prefix, and points at an export that was removed. "Take" and "run" are used for the same thing; so are "Practise this" and "Practise it".
