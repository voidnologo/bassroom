# What the research found, and what was done about it

Before and during the build, three questions were researched: how to detect pitch on a bass in a browser, what existing software does and where it fails, and what the practice-science literature says actually works for adult beginners. This records the findings that changed the design, and the ones that were considered and rejected.

Sources are summarised rather than quoted at length. Where the evidence was thin or contradictory, that is said.

## The competitive picture

The field of software that teaches bass **by listening to you** is smaller than it appears. Melodics has no bass mode and takes MIDI input. "Simply Bass" does not exist — the Simply line covers piano, guitar and voice. What remains is Yousician and Rocksmith+, and neither treats bass as first-class.

Rocksmith 2014 was delisted in 2023 when its music licences expired and returned without licensed songs. Rocksmith+ is maintained by a small team focused on polish rather than features. Both facts matter for anyone considering depending on them.

### What people say is missing

Ordered by how often the complaint recurs:

1. **No technique feedback.** For bass this is not a detail, it is the instrument. A player on Yousician: it tracks the attack, but "will not help you get your damping under control, nor does it really track your sustain." Damping _is_ bass playing.
2. **Screen dependence.** The same complaint about both products: "you don't have to know where you are at, just follow the screen. If I try to play a song that I can nail in Yousician, I just get lost."
3. **No ear training that answers on a bass.** People ask for this by name, repeatedly, and the community's workaround is to go and buy a keyboard.
4. **No practice prescription.** "Yousician knows what level you are up to, and how you are scoring. It should use that to direct you on how to perfect skills."
5. **Difficulty cliffs where the two axes are not independent.** One learner could play a song at full speed with a metronome, and at medium speed with the track, but not at full speed with the track, and was stuck for days. No product models that.
6. **Gamification that becomes the point.** "It can be a slight prey on the urge to get to 100."

### Rocksmith's dynamic difficulty

Worth understanding because it is the mechanic everyone cites. Each phrase of a song carries its own difficulty level, and your accuracy within a phrase moves the next one up or down. It removes the beginner's cliff without any configuration, and that is genuinely why people like it.

Its failure is diagnostic: _the system tells you that you are stuck, but not why_. The community's standard tuning advice is to invert the defaults, and other players deliberately run them the opposite way — both defended. That two opposite tunings can both be defended says the system has no model of what the player is actually failing at. And a thinned phrase is a different piece of music, so the player drills a fiction and then unlearns it.

### What this project did with that

The tempo ladder is dynamic difficulty on the axis that does not falsify the music: the notes never change, only the speed. Nothing is thinned, so nothing has to be unlearned.

The coach layer exists specifically to answer "why", which is the gap. The telemetry carries per-note timing and pitch errors precisely so that a diagnosis is possible rather than just a score.

Screen dependence is addressed by the retention check: an exercise played with the highway and the fretboard marker switched off, which is the only measurement that says anything about whether you can play it rather than follow it.

Technique and posture remain outside what this can see. That is stated rather than papered over.

## Pitch detection

**Physics sets the latency floor, not the browser.** The open E string is 41.2 Hz, a 24.3 ms period, and a period-based detector needs two of them. Measured browser round-trip latency is around 25–30 ms — _smaller_ than the detector's own window requirement. Optimising the browser path, or going native, would not move the number that matters.

The design consequence is to decouple onset timing from pitch identity, which is what `src/engine/PitchTracker.ts` does. See [audio-pipeline.md](audio-pipeline.md).

**Low-note detection is broken across the industry.** Rocksmith has a documented wall at C1 and has never supported a 5-string low B. Yousician's own support page limits it to a 4-string in standard tuning. CREPE's lowest bin sits above B0. Several Steam threads amount to "even the top shelf programs have the same issues with low notes."

**Most JavaScript pitch libraries have hard floors above the bass range.** `pitchfinder`'s McLeod implementation cuts off at 80 Hz — the entire bottom octave of a bass returns nothing. Its AMDF defaults to 82 Hz. `aubiojs` and `essentia.js` carry GPL and AGPL licences.

That is why the DSP here is written rather than imported, and why the test suite checks every open string.

**A recommended fix was tested and rejected.** A sub-periodic octave check is commonly advised for bass. Implemented and measured against synthesised tones, it fired on correct detections and converted them into octave errors; the realistic case it targets is already handled correctly by plain YIN. The reasoning and the numbers are in [audio-pipeline.md](audio-pipeline.md), and the realistic case has a test.

## Practice science

The evidence here is mixed in quality and is reported as such. Where a finding is from a population close to this one — adult novices, applied settings — it is weighted higher than a laboratory result on undergraduates.

### Adopted

**Binary pass/fail feedback produced no measurable learning.** In the clearest study (N = 228), error-magnitude feedback and graded feedback both worked and hit/miss produced no improvement from pre-test. A green/red note indicator is the weakest usable feedback form, and it is what the field ships. Everything here is graded: cents, milliseconds, a signed timing error and a spread.

**Measure learning with a no-feedback probe, and report that as progress.** Three separate literatures converge on it. In-practice accuracy is inflated by the feedback itself; in one study on adults aged 60–75 an adaptive schedule looked _worse_ than blocked during practice and more than twice as good at 24-hour retention. This became the retention check, and it is the number on the dashboard.

**A self-estimation prompt before the result is the best-evidenced single manipulation available**, and its benefit is eliminated by putting a distractor in the gap. This became the two-second "ahead, behind or on it?" question, with nothing else on the screen.

**Instrument problems get misattributed to the learner.** Fret buzz, an action too high to press, and an out-of-tune instrument are among the top beginner failure modes, and no competitor checks for them. Telling someone with a back-bowed neck to press harder produces pain, not clean notes. Triage is now the first thing the setup lesson covers.

**Short and daily beats long and occasional, and it feels worse.** Postal workers learning to type, total hours held constant: one hour once a day beat two hours twice a day substantially — and trainees rated the most effective schedule least satisfying. Default goal is fifteen minutes, and a ten-minute day is treated as a real day.

**Streak mechanics need a release valve.** Hence two freezes, earned back weekly.

### Considered and not adopted, or adopted in a weaker form

**Interleaved practice from day one.** The closest study to this population — adult woodwind novices — is a null result, and applied-setting effect estimates run from slightly positive to slightly negative, none significant. The better-supported option is an _increasing_ schedule, blocked then serial then random. The daily plan currently orders reviews by urgency and then fills the remainder with new material, which is nearer the serial end than the blocked one. **This is the largest gap between what the evidence suggests and what is built**, and it is written down here rather than quietly skipped.

**Fading feedback on a schedule.** The evidence reverses on complex whole-body tasks, where 100% feedback beat a 50% fade at retention. A true beginner on bass is closer to that case, so feedback is not faded by calendar. Per-item fading by mastery remains the right eventual design.

**Per-note bandwidth feedback.** One study found a 15% band applied per-component of a sequential task did worse than full feedback, proposed as information overload. The coach is therefore capped at three observations and one action, rather than annotating every note.

**A "show them their best reps" policy.** One study found that feedback on relatively good trials raised learners' confidence in their own learning, at practice and at 24-hour retention, with _no_ actual performance difference — and it held even when participants were told about the manipulation. Nothing here surfaces a best-of reel.

## Where this is uncertain

- No peer-reviewed onset-detection study evaluated specifically on electric bass was found. The onset detector here is general technique applied to the bass case and tuned against synthesised signals. It should be re-tuned against real recordings.
- The sixteenth-note split in the Angel riff comes from one transcription's duration data and no other source has rhythm detail at all. It is the one thing in that tab to verify by ear.
- Reddit was unreachable during the research pass, so the player-side evidence comes from the BassBuzz forum, Steam discussions and search extracts rather than r/Bass directly.
- Figures quoted for competing products' pricing conflicted badly between sources and are not repeated here.

## Licensing

A note, because it constrains what this can ever become. The compulsory mechanical licence does not cover audiovisual use, and scrolling tab synced to audio is audiovisual. It also says nothing about public display, and showing notation on screen is a display of the composition. This is why the app bundles no recordings and reproduces no published tablature: the transcriptions are its own, for personal study.
