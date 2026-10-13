---
paths: ["app/src/content/**", "tabs/**"]
---

# Music content

Content is data, not logic. These rules exist because a wrong note taught confidently is worse than no lesson at all, and because content is the part of this codebase a human most needs to be able to proofread.

**Guide:** [docs/curriculum.md](../../docs/curriculum.md)

| ID | Rule | Reason | Enforcement |
|---|---|---|---|
| MC1 | Pitches MUST be written as scientific pitch names through `parseNote('C2')`, never as bare MIDI integers. | `36` cannot be proofread; `C2` can. The whole value of this content is that a human can check it. | `script: gates.mjs::scanBareMidi` |
| MC2 | A `SongChart` MUST state its `keyCenter`, `timeSignature`, and `targetBpm`. | They are what the exercise generator, the metronome, and the ladder all read; a default here is a silent wrong answer. | `test: test/content/*.test.ts` |
| MC3 | A `SongChart` MUST carry a `provenance` string naming the source of its notes and the confidence in them. | A transcription whose origin is unrecorded cannot be corrected later, and cannot be told apart from a guess. | `script: gates.mjs::scanProvenance` |
| MC4 | Changing a pitch in a transcription MUST update its `provenance`. | The provenance is a claim about the current notes, not about the ones that were there first. | review |
| MC5 | Every exercise MUST declare the `skills` it trains. | Scheduling and the review queue are driven entirely by skill tags; an untagged exercise never comes back. | `test: test/content/*.test.ts` |
| MC6 | Every note in an exercise MUST be playable on a 4-string bass in standard tuning. | The app teaches the instrument the learner owns. | `test: test/content/*.test.ts` |
| MC7 | `floorBpm` MUST be at most `targetBpm`, and both MUST be tempos a beginner can actually use. | The ladder starts at the floor; a floor above the target makes an exercise unreachable. | `test: test/content/*.test.ts` |
| MC8 | Note start beats within an exercise MUST be non-decreasing, and MUST fit the declared time signature. | The highway renderer and the judge both assume ordered notes; an out-of-order note is drawn in the wrong bar. | `test: test/content/*.test.ts` |
| MC9 | Copyrighted songs MUST be represented as a transcription for study with its source cited, and MUST NOT ship bundled recordings or reproduced published tablature. | The transcription is ours and is educational; a copied tab file and an audio rip are neither. | review |
| MC10 | A public-domain melody MUST be marked as such in its provenance. | It tells a later reader which content can be shown freely and which is a personal-study transcription. | review |
