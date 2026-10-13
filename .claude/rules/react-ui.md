---
paths: ["app/src/ui/**", "app/src/state/**"]
---

# UI

| ID  | Rule                                                                                                                                                  | Reason                                                                                        | Enforcement                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------- |
| RC1 | Components MUST be function components with hooks.                                                                                                    | One component style means one place to look for lifecycle and state.                          | review                              |
| RC2 | A component MUST NOT exceed 200 lines. Split by the thing it renders, not arbitrarily.                                                                | Past a screen, the markup and the logic stop being reviewable together.                       | `lint: max-lines-per-function`      |
| RC3 | Rendering MUST NOT depend on frame-rate state held in React. Fast-moving audio values go through a ref and are written to the DOM or canvas directly. | A 47 Hz pitch stream re-rendering a React tree burns the frame budget the note highway needs. | review                              |
| RC4 | A component MUST NOT create an `AudioContext` or an `AudioNode`. It asks `src/audio/` for one.                                                        | Two contexts means two clocks, and the second one makes every timing judgment wrong.          | `script: gates.mjs::scanUiAudio`    |
| RC5 | Every `useEffect` that subscribes MUST return its unsubscribe.                                                                                        | An orphaned pitch listener keeps judging a take that has ended.                               | review                              |
| RC6 | Music theory MUST NOT live in a component. It comes from `src/music/`.                                                                                | Theory in a component cannot be unit tested and gets reimplemented in the next component.     | review                              |
| RC7 | Colour MUST NOT be the only signal for a verdict. Pair it with a shape, a label, or a position.                                                       | Roughly one man in twelve cannot separate the red and green this app would otherwise rely on. | review                              |
| RC8 | Interactive controls MUST be reachable by keyboard and MUST have an accessible name.                                                                  | A player holding a bass has one hand free at most.                                            | review                              |
| RC9 | A canvas MUST be sized for `devicePixelRatio`.                                                                                                        | An unscaled canvas renders the fretboard blurry on every laptop screen in use.                | review                              |
