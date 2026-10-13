---
paths: ["app/**"]
---

# Stewardship

How far to clean up around a change. Agents get this wrong in both directions.

| ID  | Rule                                                                                                                                                                        | Reason                                                                                           | Enforcement |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------- |
| ST1 | Before implementing, check the surface being touched for a duplicated representation of the same idea, a value set that should be a union type, or a missing single source. | These are cheap to fix while the code is already open and expensive later.                       | review      |
| ST2 | Cleanup MUST stay inside the change's surface. Unrelated subsystems, untouched files, and formatting-only edits are out of scope.                                           | Unrelated churn makes the real change unreviewable.                                              | review      |
| ST3 | A cleanup that outgrows the change MUST become its own commit, or a note in the handoff.                                                                                    | A mixed commit cannot be reverted without losing the feature it came with.                       | review      |
| ST4 | A refactor MUST name what it removes: a representation deleted, a branch removed, a call site that stops having to know something.                                          | A refactor that only relocates code has a cost and no benefit.                                   | review      |
| ST5 | A feature MUST NOT be added beyond what was asked for.                                                                                                                      | Unrequested scope costs review time and maintenance for a need nobody stated.                    | review      |
| ST6 | An existing shape MUST NOT be copied just because it exists. Precedent is not a justification.                                                                              | The first instance may itself have been a mistake, and copying it doubles the cost of fixing it. | review      |
| ST7 | When code and a rule disagree, ask. An agent MUST NOT decide to change the rule.                                                                                            | The rule encodes a decision a person made; an agent cannot see what it was protecting.           | review      |
