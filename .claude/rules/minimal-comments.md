---
paths: ["app/src/**", "app/test/**", "app/server/**"]
---

# Comments

A comment earns its place by saying something the code cannot. Most do not.

| ID | Rule | Reason | Enforcement |
|---|---|---|---|
| CM1 | Default to no comment. | Every comment is a second thing to keep true, and the code is the one that runs. | review |
| CM2 | A comment MAY state: why this approach rather than the obvious one; a non-obvious constraint from physics, a spec, or an instrument; the origin of a tuned constant; a failure mode the code is written to avoid. | These are the four things a reader cannot recover from the code itself. | review |
| CM3 | A comment MUST NOT restate the line below it. | It adds nothing on the first read and becomes wrong on the first edit. | review |
| CM4 | A comment MUST NOT narrate a change: "renamed from", "now uses", "previously". | The diff records that, and the comment keeps claiming it forever. | review |
| CM5 | A comment MUST NOT contain a measurement, benchmark figure, or count that has no date or method attached. | A number in a comment reads as current forever, and nothing falsifies it. | review |
| CM6 | A comment MUST NOT make a claim about code elsewhere ("the only caller", "nothing else does this"). | The reader cannot check it without searching, and ordinary work falsifies it without touching this file. | review |
| CM7 | A rationale MUST be stated once, at the definition, not repeated at call sites. | Copies drift apart, and a reader cannot tell which copy is current. | review |
| CM8 | A musical or acoustic fact used as a constraint MUST be stated with its value: "the low E is 41 Hz, a 24 ms period". | It is the fact that makes the surrounding choice reviewable by someone who is not a DSP engineer. | review |
| CM9 | A test's intent belongs in its name and its assertion, not in a comment above it. | A comment cannot fail. | review |
| CM10 | Only comments the change touches MAY be edited. A branch MUST NOT sweep a subsystem's comments. | A comment sweep buries the real change in a diff nobody can review. | review |

If a comment cannot be stated in one line, the code probably needs the work, not the comment.
