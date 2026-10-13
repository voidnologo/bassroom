---
paths: ["app/src/**", "app/test/**", "app/server/**"]
---

# Complexity budgets

| ID  | Rule                                                                                            | Reason                                                                                                        | Enforcement                    |
| --- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| CX1 | Cyclomatic complexity MUST stay at or below 10 per function.                                    | Past roughly ten branches a function stops fitting in a reader's head, and the tests stop covering its paths. | `lint: complexity`             |
| CX2 | Nesting MUST stay at or below three levels.                                                     | Past three levels a reader has to hold three conditions at once to know which case they are in.               | `lint: max-depth`              |
| CX3 | A function MUST NOT exceed 80 lines (200 for a component in `src/ui/`, which is mostly markup). | A function longer than a screen cannot be checked against its name in one pass.                               | `lint: max-lines-per-function` |
| CX4 | A branch longer than four lines MUST be extracted into a named function.                        | The name is what tells a reader which case they are in without reading the body.                              | review                         |
| CX5 | A budget MUST NOT be raised to make code pass. Extract a function instead.                      | Raising the ceiling converts a local problem into a permanent one across the whole codebase.                  | review                         |
| CX6 | A disable comment MUST name the rule and give a reason on the same line.                        | A bare disable is indistinguishable from a mistake.                                                           | review                         |
| CX7 | Code outside the change's surface MUST NOT be refactored to satisfy a budget it already passes. | Unrelated churn makes the real change unreviewable.                                                           | review                         |
