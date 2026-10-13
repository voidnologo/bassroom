#!/bin/bash
# PostToolUse hook: format and lint a TypeScript file right after Claude edits it.
# Wired in .claude/settings.json. Exit 2 hands the remaining errors back to Claude.

set -uo pipefail

INPUT=$(cat)
FILE_PATH=$(printf '%s' "$INPUT" | /usr/bin/env node -e '
  let raw = "";
  process.stdin.on("data", (chunk) => (raw += chunk));
  process.stdin.on("end", () => {
    try { process.stdout.write(JSON.parse(raw)?.tool_input?.file_path ?? ""); }
    catch { process.stdout.write(""); }
  });
')

case "$FILE_PATH" in
  *.ts | *.tsx | *.mjs) ;;
  *) exit 0 ;;
esac
[[ -f "$FILE_PATH" ]] || exit 0

# Resolved before the working directory changes below, so a relative path from
# the tool payload still names the same file afterwards.
case "$FILE_PATH" in
  /*) ;;
  *) FILE_PATH="$PWD/$FILE_PATH" ;;
esac

APP_DIR="${CLAUDE_PROJECT_DIR:-$PWD}/app"
# The project's own binaries pin the versions CI uses; a global eslint or
# prettier on PATH may disagree and send Claude chasing a difference that
# will not reproduce.
ESLINT="$APP_DIR/node_modules/.bin/eslint"
PRETTIER="$APP_DIR/node_modules/.bin/prettier"
[[ -x "$ESLINT" && -x "$PRETTIER" ]] || exit 0

# eslint.config.js lives in app/, and ESLint 9 resolves its config from the
# working directory rather than from the file it is linting. Everything below
# therefore runs from app/, and a file outside it has no config to be judged
# against.
case "$FILE_PATH" in
  "$APP_DIR"/*) ;;
  *) exit 0 ;;
esac
cd "$APP_DIR" || exit 0

"$PRETTIER" --write --log-level error "$FILE_PATH" 2>&1
"$ESLINT" --fix --no-warn-ignored "$FILE_PATH" >/dev/null 2>&1

LINT_OUTPUT=$("$ESLINT" --no-warn-ignored --format stylish "$FILE_PATH" 2>&1)
LINT_STATUS=$?
if [[ $LINT_STATUS -ne 0 ]]; then
  printf '%s\n' "$LINT_OUTPUT" >&2
  exit 2
fi

# Type errors are advisory here: a file is often edited before the module it
# will import exists, and blocking mid-edit on that is noise. /quality-check
# and CI both block on tsc.
#
# Matched on the path tsc prints, which is relative to app/. Matching the bare
# filename instead reports every types.ts in the project against whichever one
# was edited.
RELATIVE_PATH="${FILE_PATH#"$APP_DIR"/}"
TYPE_OUTPUT=$(./node_modules/.bin/tsc --noEmit 2>&1 | grep -F "$RELATIVE_PATH")
if [[ -n "$TYPE_OUTPUT" ]]; then
  printf 'Type errors (advisory, blocking in /quality-check):\n%s\n' "$TYPE_OUTPUT" >&2
fi

exit 0
