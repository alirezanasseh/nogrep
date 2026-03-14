#!/bin/bash
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# Only intercept search commands
if ! echo "$COMMAND" | grep -qE '^\s*(grep|find|rg|ag|fd)\s'; then
  exit 0
fi

# Check nogrep is enabled
ENABLED=$(cat .claude/settings.json 2>/dev/null | jq -r '.nogrep.enabled // false')
LOCAL_ENABLED=$(cat .claude/settings.local.json 2>/dev/null | jq -r '.nogrep.enabled // empty')
[ -n "$LOCAL_ENABLED" ] && ENABLED="$LOCAL_ENABLED"
[ "$ENABLED" != "true" ] && exit 0

# Check index exists
[ ! -f ".nogrep/_index.json" ] && exit 0

# Extract keywords from the grep command
KEYWORDS=$(echo "$COMMAND" \
  | sed -E 's/(grep|rg|ag|find)\s+(-[a-zA-Z]+\s+)*//' \
  | tr -d '"'"'" \
  | awk '{print $1}')

[ -z "$KEYWORDS" ] && exit 0

# Query nogrep
SCRIPT_DIR="$(cd "$(dirname "$0")/../dist" && pwd)"
RESULT=$(node "$SCRIPT_DIR/query.js" --keywords "$KEYWORDS" --format summary --limit 3 2>/dev/null)

if [ -n "$RESULT" ]; then
  jq -n \
    --arg ctx "nogrep — read these context files before searching:\n\n$RESULT\n\nThese files tell you exactly where to look. Only proceed with the grep if they don't answer your question." \
    '{ additionalContext: $ctx }'
fi

exit 0
