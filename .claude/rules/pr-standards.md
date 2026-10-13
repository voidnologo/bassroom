---
paths: ["**"]
---

# Commits and pull requests

| ID | Rule | Reason | Enforcement |
|---|---|---|---|
| PR1 | Commits MUST follow Conventional Commits: `type(scope): summary`. | The type is what makes a history skimmable months later. | review |
| PR2 | A commit body MUST say why, not what. The diff is the what. | The reasoning is the only part of a change that is not recoverable from the code. | review |
| PR3 | A commit MUST be one logical change that leaves `npm run verify` passing. | A commit that does not build is not a point anyone can return to. | review |
| PR4 | A checked box is a claim. It MUST NOT be ticked unless it is true. | A box ticked by habit makes every other box worthless. | review |
| PR5 | A commit MUST NOT carry a `Co-Authored-By` trailer. | Project convention; it clutters the log without identifying a person who can answer questions. | review |
