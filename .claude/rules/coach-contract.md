---
paths: ["app/src/coach/**", "app/server/**"]
---

# Coach

The coach layer exists so that feedback quality can improve without the rest of the app changing. Its value depends entirely on the boundary staying clean.

| ID | Rule | Reason | Enforcement |
|---|---|---|---|
| CO1 | Every feedback source MUST implement `CoachProvider`. Callers MUST NOT know which provider answered. | Swapping in a better model is the point of the layer; a caller that branches on the provider defeats it. | `lint: tsc` |
| CO2 | A provider MUST return structured `CoachFeedback`, never free text to be parsed by the UI. | Parsing prose in the UI is where a model change becomes a rendering bug. | `lint: tsc` |
| CO3 | An API key MUST NOT appear in anything the browser loads. Model calls go through `server/`. | A key in a bundle is a published key. | `script: gates.mjs::scanClientSecrets` |
| CO4 | The app MUST remain fully usable with no model configured. The heuristic provider is the default. | Practice cannot depend on a network call. | `test: test/coach/*.test.ts` |
| CO5 | Session telemetry MUST be written in the versioned schema and MUST carry its `schemaVersion`. | The logs are the training material for every future coach; unversioned records cannot be read once the shape changes. | `test: test/coach/*.test.ts` |
| CO6 | Telemetry MUST record what was measured, not an interpretation of it. | An interpretation bakes today's model's judgment into data a better model would read differently. | review |
| CO7 | Prompts MUST live in `src/coach/prompts/` with a version string, never inline at a call site. | A prompt is the behaviour of the coach; an inline one cannot be diffed, versioned, or reviewed. | review |
| CO8 | A provider failure MUST degrade to the heuristic coach, never block the session. | review | `test: test/coach/*.test.ts` |
