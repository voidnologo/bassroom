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

APP_DIR="${CLAUDE_PROJECT_DIR:-.}/app"
# The project's own binaries pin the versions CI uses; a global eslint or
# prettier on PATH may disagree and send Claude chasing a difference that
# will not reproduce.
ESLINT="$APP_DIR/node_modules/.bin/eslint"
PRETTIER="$APP_DIR/node_modules/.bin/prettier"
[[ -x "$ESLINT" && -x "$PRETTIER" ]] || exit 0

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
TYPE_OUTPUT=$(cd "$APP_DIR" && ./node_modules/.bin/tsc --noEmit 2>&1 | grep -F "$(basename "$FILE_PATH")")
if [[ -n "$TYPE_OUTPUT" ]]; then
  printf 'Type errors (advisory, blocking in /quality-check):\n%s\n' "$TYPE_OUTPUT" >&2
fi

exit 0
