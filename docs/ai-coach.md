# The coach layer

## What it is for

Feedback is the part of this app most likely to get better over time without the rest of it changing. The layer exists to make that possible, and everything about its shape follows from that.

## The contract

```ts
interface CoachProvider {
  readonly id: string;
  readonly label: string;
  isAvailable(): Promise<boolean>;
  analyze(request: CoachRequest): Promise<CoachFeedback>;
}
```

A provider receives a take's telemetry and the telemetry of recent takes of the same exercise. It returns structured feedback: a headline, at most three observations each with the measurement behind it, and exactly one next action. `label` is what the Settings screen shows for whichever provider answered.

Callers never know which provider answered. That is the point — swapping in something better is the whole reason the layer exists, and a caller that branches on the provider defeats it.

## Two providers today

**`HeuristicCoach`** is rules, and it is the default. It recognises a consistent lag as distinct from unsteadiness, a finger one fret off, the wrong string, missed notes, extra attacks, intonation drift, uneven plucking, a take that falls apart in its second half, and a spot that keeps going wrong across several takes.

It is also the fallback. Anything at all going wrong with a model call falls through to it. A practice habit cannot be allowed to depend on a network request, and someone whose session stopped because an API was down does not come back.

**`LanguageModelCoach`** posts to the local coach server, which calls the Anthropic API. The prompt lives in `src/coach/prompts/takeReview.ts` with a version string, so a change to the coach's behaviour is a reviewable diff rather than an edit buried in a fetch.

Everything the model returns is validated into the shape the UI renders. A missing headline or an action kind nobody defined rejects the whole response and the rules answer instead. A single observation with an unknown severity is dropped and the rest of the response is kept, because one bad line is not a reason to throw away four good ones. A model that returns something unexpected must degrade, not render wrong.

## Telemetry records measurements, not readings of them

Every take is written as a `TakeTelemetry` record: per note, the target, what was played, the signed timing error in milliseconds, the pitch error in semitones, the intonation offset in cents, the attack level, and where the note sits in the music.

What it does **not** contain is any interpretation. "Played 32 ms late" belongs in the record. "Rushing" does not, because that is a reading of the measurement, and the next model may read it differently. A log full of today's conclusions is a log that can only ever reproduce today's coaching.

Each record carries a `schemaVersion`. These logs are the material a better coach gets built from, and an unversioned record cannot be read once the shape changes.

## Where the data goes

The coach server appends every take to `data/sessions/takes-YYYY-MM-DD.jsonl` — one file per day, one take per line. Appendable, greppable, diffable, and somewhere a person can back up.

The browser keeps its own copy of progress in IndexedDB, but that is per-origin, easy to lose and invisible to anything outside the tab. The JSONL files are the copy worth keeping.

## Adding a provider

1. Implement `CoachProvider` in `src/coach/`.
2. Put its prompt, if it has one, in `src/coach/prompts/` with a version string.
3. Validate its output into `CoachFeedback` before returning it.
4. Register it in `CoachService.pick()`, below the existing fallback order.
5. Add tests covering a well-formed response and every malformed one you can think of.

The rules in [`.claude/rules/coach-contract.md`](../.claude/rules/coach-contract.md) are the standard. CO3 in particular: an API key must never appear in anything the browser loads, which is why the server exists at all.

## What a better model would be able to do that the rules cannot

The heuristics can see that the same bar keeps failing. They cannot see _why_ — that the failure is a string crossing the player is anticipating, or that the two bars either side of it are fine because they stay in position and this one does not. They can see that intonation is sharp on fretted notes. They cannot connect that to the particular stretch the passage asks for.

They also cannot read across a month of practice and notice that the thing holding someone back has not changed since week two.

That is the gap the layer is built around, and why the telemetry is shaped the way it is.
