#!/bin/bash
INPUT=$(cat)

# Check nogrep is enabled
ENABLED=$(cat .claude/settings.json 2>/dev/null | jq -r '.nogrep.enabled // false')
LOCAL_ENABLED=$(cat .claude/settings.local.json 2>/dev/null | jq -r '.nogrep.enabled // empty')
[ -n "$LOCAL_ENABLED" ] && ENABLED="$LOCAL_ENABLED"
[ "$ENABLED" != "true" ] && exit 0

# Check index exists
[ ! -f ".nogrep/_index.json" ] && exit 0

# Extract the glob pattern from Glob tool input
PATTERN=$(echo "$INPUT" | jq -r '.tool_input.pattern // empty')
[ -z "$PATTERN" ] && exit 0

# Extract meaningful keywords from glob pattern
# e.g. "**/*auth*.ts" -> "auth", "src/**/guard*" -> "guard"
KEYWORDS=$(echo "$PATTERN" \
  | sed -E 's/\*\*//g' \
  | sed -E 's/\*//g' \
  | sed -E 's/[{}(),]/ /g' \
  | sed -E 's#/+# #g' \
  | sed -E 's/\.[a-z]+$//g' \
  | tr -s ' ' \
  | xargs)

[ -z "$KEYWORDS" ] && exit 0

# Query nogrep
SCRIPT_DIR="$(cd "$(dirname "$0")/../dist" && pwd)"
RESULT=$(node "$SCRIPT_DIR/query.js" --keywords "$KEYWORDS" --format summary --limit 3 2>/dev/null)

if [ -n "$RESULT" ]; then
  jq -n \
    --arg ctx "nogrep — these context files may help narrow your search:\n\n$RESULT\n\nCheck these files for relevant paths before globbing broadly." \
    '{ additionalContext: $ctx }'
fi

exit 0
