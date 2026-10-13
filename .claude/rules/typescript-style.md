---
paths: ["app/src/**/*.ts", "app/src/**/*.tsx", "app/test/**/*.ts"]
---

# TypeScript style

| ID   | Rule                                                                                                            | Reason                                                                                                 | Enforcement                                |
| ---- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| TY1  | `any` MUST NOT appear, including `as any`. Use `unknown` and narrow.                                            | `any` disables the checker at exactly the boundary where a wrong assumption is most likely.            | `lint: @typescript-eslint/no-explicit-any` |
| TY2  | Exported functions and public class members MUST have explicit return types.                                    | A return type inferred from an implementation changes silently when the implementation does.           | review                                     |
| TY3  | Type-only imports MUST use `import type`.                                                                       | It keeps types out of the emitted bundle and makes the dependency's nature visible at the import site. | `lint: consistent-type-imports`            |
| TY4  | Names MUST say what the value is, not what shape it has. `judgments`, not `arr`; `timingErrorMs`, not `err`.    | The unit in the name is the documentation that cannot drift.                                           | review                                     |
| TY5  | A quantity with a unit MUST carry the unit in its name: `Ms`, `Bpm`, `Beat`, `Hz`, `Db`, `Seconds`.             | Mixing milliseconds and seconds is the defect this codebase is most exposed to; the name is the guard. | review                                     |
| TY6  | A module MUST NOT import from a layer above it, per the table in CLAUDE.md.                                     | A cycle through the UI makes the lower layer impossible to test in isolation.                          | `test: test/tooling/layering.test.ts`      |
| TY7  | Shared behaviour MUST be extracted rather than copied. A second copy of a non-trivial expression is a function. | Two copies drift, and the drift is found by a user rather than by a test.                              | review                                     |
| TY8  | A function MUST do one thing its name describes. If the name needs "and", split it.                             | A name that needs "and" is the signal that the two halves have separate reasons to change.             | review                                     |
| TY9  | `console.log` MUST NOT ship in `src/`. Use the error path or surface it in the UI.                              | A log line is invisible to the person using the app, so it is not feedback, only noise.                | `lint: no-console`                         |
| TY10 | Errors MUST be thrown with a message naming the value that was wrong and what was expected.                     | "Invalid input" costs a debugging session that the message could have ended.                           | review                                     |
| TY11 | A magic number MUST be a named constant with a comment saying where the number came from, unless it is 0 or 1.  | A tuned threshold with no origin cannot be re-tuned by anyone later.                                   | review                                     |
| TY12 | Options objects MUST be used once a function takes more than three parameters.                                  | Positional booleans at a call site are unreadable and silently swappable.                              | `lint: max-params`                         |
