---
paths: ["app/test/**"]
---

# Testing

| ID | Rule | Reason | Enforcement |
|---|---|---|---|
| TS1 | Every assertion MUST be able to fail because our code is wrong. | A test that asserts a language feature, a literal it just defined, or a library's behaviour is green forever and protects nothing. | review |
| TS2 | A test MUST NOT pass if the production code it covers is deleted. | Such a test asserts its own setup, and reports green while the feature is gone. | review |
| TS3 | Repeated cases MUST use `it.each`, never a loop inside one test. | A loop stops at the first bad value and does not name it; `it.each` names every failure. | `test: test/tooling/testStandards.test.ts` |
| TS4 | `.only`, `.skip`, `xit`, and `xdescribe` MUST NOT be committed. | A skipped test is green in CI while asserting nothing. | `script: gates.mjs::scanFocusedTests` |
| TS5 | A test name MUST state the behaviour, not the method: "does not let one note satisfy two targets", not "judgePerformance works". | The name is the specification a reader gets for free when it fails. | review |
| TS6 | A bug fix MUST start with a test that fails for the bug's reason. A crash or an import error is not that failure. | A test that fails for the wrong reason passes again for the wrong reason. | review |
| TS7 | A DSP test MUST assert against a synthesised signal with known properties, not a recorded fixture. | A fixture cannot say why it fails, and cannot be varied to find the edge. | review |
| TS8 | Randomness MUST be seeded. `Math.random` MUST NOT appear in a test. | A flaky test is eventually ignored, and then so is the real failure. | `script: gates.mjs::scanTestRandomness` |
| TS9 | A numeric assertion MUST state a tolerance in the unit being measured (cents, milliseconds, bpm), not a bare `toBeCloseTo` digit count. | Three decimal places means nothing in Hz and everything in seconds. | review |
| TS10 | The same rule MUST NOT be asserted at more than one layer. | Duplicate coverage makes a real change look like a dozen failures and hides which one matters. | review |
| TS11 | Line coverage MUST stay at or above 70%. That is the floor, not the target. | Below it, whole paths go unexercised and a refactor can break them silently. | `CI: vitest --coverage` |
| TS12 | Content modules MUST be validated by tests that read the content, not by hand. | Content is the part most likely to be wrong and least likely to be reread. | `test: test/content/*.test.ts` |
