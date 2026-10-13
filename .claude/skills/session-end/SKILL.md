---
name: session-end
description: Close a working session on Bassroom — fill in the session log, rewrite the handoff, and confirm the branch is in a committable state. Use when wrapping up, stopping for the day, or when asked to write up what we did.
allowed-tools: Read, Write, Edit, Bash, Glob
---

# Session end

## 1. Check the branch is in a state worth leaving

```bash
cd app && npm run verify
cd .. && git status --short && git log --oneline origin/main..HEAD
```

If `verify` fails, say so and offer to fix it before writing anything up. A session that ends red is a session the next one starts by debugging.

## 2. Fill in the log

Open the `*_in_progress.md` log and complete all five sections.

- **Title** — what the session did, in a few words. Replace `TBD`.
- **Actions taken** — what landed, by commit where there is one.
- **Decisions made** — each choice and why. The diff already records what changed; this records why it changed that way.
- **Open items** — anything dropped, and why, so it does not vanish unrecorded.
- **Next session** — the first thing the next session should do.

Rename the file from `_in_progress` to a short slug of what it did.

## 3. Rewrite the handoff

`docs/sessions/HANDOFF.md` is about a screen long and points into the logs rather than copying them: what is in flight, what is next, and any gotcha that would cost the next session an hour.

Anything that will still matter in a month — an architectural decision, a tuning constant and where its value came from, a rule the project should follow — belongs in `.claude/rules/` or `docs/`, where someone will look for it. The handoff is pruned as work lands, so anything left only there is lost.
