---
name: session-start
description: Open a working session on Bassroom — read the handoff and the last log, brief the user on where things stand, and start a new session log. Use at the beginning of a working session, or when asked to pick up where we left off, resume work, or get oriented.
allowed-tools: Read, Write, Edit, Bash, Glob
---

# Session start

## 1. Read the state

```bash
cat docs/sessions/HANDOFF.md
ls docs/sessions/logs/ | tail -3
git log --oneline -10
git status --short
```

Read `HANDOFF.md` and the most recent log in full. If a log is still named `*_in_progress.md`, a previous session did not close — tell the user and ask whether to close it out or continue in it, rather than guessing.

## 2. Open a log

Create `docs/sessions/logs/session_NNN_in_progress.md`, numbered one past the highest existing log, from this shape:

```markdown
# Session NNN — TBD

**Started:** <date>

## Actions taken

## Decisions made

## Open items

## Next session
```

Do not touch `HANDOFF.md`. It is rewritten only at session end, so it always describes an end-of-sitting state.

## 3. Brief the user

A few sentences, no headings: what landed last time, what is in flight, what the handoff says comes next, and anything in `git status` that looks unfinished. Then ask what to work on.
